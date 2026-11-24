'use strict';

/**
 * Think-Browser — moteur de filtrage publicitaire.
 *
 * Le bloqueur est chargé en arrière-plan afin de ne pas retarder l'ouverture
 * de la fenêtre. Les filtres sont mis en cache sur disque : au démarrage
 * suivant, le navigateur peut fonctionner même si le téléchargement des listes
 * échoue.
 *
 * @module main/adblocker
 */

const fs = require('node:fs');
const path = require('node:path');
const { ipcMain } = require('electron');
const { ADBLOCK_CACHE_MAX_AGE } = require('../shared/constants');

/**
 * Canaux cosmétiques enregistrés par `@cliqz/adblocker-electron`.
 * `disableBlockingInSession` ne les retire pas tous dans la version utilisée.
 */
const COSMETIC_CHANNELS = [
  'get-cosmetic-filters-first',
  'get-cosmetic-filters',
  'is-mutation-observer-enabled',
];

/**
 * Contrôleur du bloqueur de publicités et de son cycle de vie.
 */
class AdBlocker {
  /**
   * @param {object} options
   * @param {Electron.Session} options.session
   * @param {import('./networkMonitor').NetworkMonitor} options.networkMonitor
   * @param {import('./store').Store} options.store
   * @param {string} [options.cachePath]
   * @param {Function} [options.fetchImpl]
   * @param {((stats: object) => void) | null} [options.onStatsChanged]
   * @param {number} [options.statsDelay]
   */
  constructor({
    session,
    networkMonitor,
    store,
    cachePath = '',
    fetchImpl = require('cross-fetch'),
    onStatsChanged = null,
    statsDelay = 120,
  }) {
    this.session = session;
    this.networkMonitor = networkMonitor;
    this.store = store;
    this.cachePath = cachePath;
    this.fetchImpl = fetchImpl;
    this.onStatsChanged =
      typeof onStatsChanged === 'function' ? onStatsChanged : null;
    this.statsDelay =
      Number.isFinite(statsDelay) && statsDelay >= 0 ? statsDelay : 120;

    /** @type {import('@cliqz/adblocker-electron').ElectronBlocker | null} */
    this.blocker = null;
    this.active = false;
    this.initialized = false;
    this.loading = false;

    /**
     * Nombre de requêtes bloquées par webview depuis le dernier chargement du
     * document principal. La clé est l'identifiant webContents de la webview.
     * @type {Map<number, number>}
     */
    this.stats = new Map();

    /** @type {Map<number, ReturnType<typeof setTimeout>>} */
    this.statsTimers = new Map();

    /**
     * Sessions couvertes. Toutes utilisent le filtrage réseau ; les filtres
     * cosmétiques sont désactivés dans `initialize()` pour préserver les pages
     * qui imposent Trusted Types.
     * @type {Map<Electron.Session, {monitor: import('./networkMonitor').NetworkMonitor, cosmetic: boolean}>}
     */
    this.sessions = new Map([
      [session, { monitor: networkMonitor, cosmetic: true }],
    ]);
  }

  /**
   * Ajoute une session au filtrage. Utilisé pour les partitions privées.
   * @param {Electron.Session} targetSession
   * @param {import('./networkMonitor').NetworkMonitor} targetMonitor
   */
  registerSession(targetSession, targetMonitor) {
    if (!targetSession || !targetMonitor || this.sessions.has(targetSession)) {
      return;
    }

    const entry = { monitor: targetMonitor, cosmetic: false };
    this.sessions.set(targetSession, entry);
    targetMonitor.install();

    if (this.active && this.blocker) {
      try {
        this.#enableSession(targetSession, entry);
      } catch (error) {
        entry.monitor.setAdBlockHandler(null);
        console.warn(
          '[AdBlock] Session supplémentaire non filtrée :',
          error.message,
        );
      }
    }
  }

  /**
   * Retire une session fermée du filtrage.
   * @param {Electron.Session} targetSession
   */
  unregisterSession(targetSession) {
    if (!targetSession || targetSession === this.session) {
      return;
    }

    this.sessions.delete(targetSession);
  }

  /**
   * Charge les filtres puis applique le réglage utilisateur courant.
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized || this.loading) {
      return;
    }

    this.loading = true;

    try {
      const { ElectronBlocker } = require('@cliqz/adblocker-electron');

      await this.#removeStaleCache();
      console.log('[AdBlock] Chargement des filtres publicitaires…');

      this.blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(
        this.fetchImpl,
        this.#getCaching(),
      );

      // Les filtres cosmétiques injectent des scriptlets au démarrage de la
      // page. Les sites qui imposent Trusted Types (YouTube, Google, etc.)
      // bloquent cette injection et peuvent rester entièrement blancs. Le
      // filtrage réseau bloque déjà les publicités et les traqueurs : on le
      // conserve seul pour garantir la compatibilité des pages.
      this.blocker.config.loadCosmeticFilters = false;

      this.initialized = true;

      console.log('[AdBlock] Moteur prêt.');

      // Le réglage a pu changer pendant le téléchargement : on lit l'état
      // courant au moment où le moteur devient disponible.
      if (this.store.getSettings().adBlockEnabled) {
        this.#enable();
      } else {
        this.#disable();
      }
    } catch (error) {
      this.blocker = null;
      this.active = false;
      this.clearAllStats();

      for (const { monitor } of this.sessions.values()) {
        monitor.setAdBlockHandler(null);
      }

      console.warn(
        '[AdBlock] Filtres indisponibles, le navigateur continue sans filtrage :',
        error.message,
      );
    } finally {
      this.loading = false;
    }
  }

  /**
   * Applique un nouveau réglage.
   * @param {boolean} enabled
   * @returns {Promise<void>}
   */
  async applySetting(enabled) {
    // Une initialisation est en cours : elle lira le réglage à la fin.
    if (this.loading) {
      return;
    }

    if (enabled) {
      if (!this.blocker) {
        await this.initialize();
        return;
      }

      this.#enable();
      return;
    }

    this.#disable();
  }

  /**
   * Indique si le filtrage est réellement actif.
   * @returns {boolean}
   */
  isActive() {
    return Boolean(
      this.blocker &&
        this.active &&
        this.blocker.isBlockingEnabled(this.session),
    );
  }

  /**
   * Retourne les statistiques d'une webview.
   * @param {unknown} webContentsId
   * @returns {{webContentsId: number | null, blocked: number, active: boolean}}
   */
  getStats(webContentsId) {
    const id = Number.isInteger(webContentsId) ? webContentsId : null;

    return {
      webContentsId: id,
      blocked: id === null ? 0 : this.stats.get(id) || 0,
      active: this.isActive(),
    };
  }

  /**
   * Oublie les statistiques d'une webview détruite.
   * @param {unknown} webContentsId
   */
  clearStats(webContentsId) {
    if (!Number.isInteger(webContentsId)) {
      return;
    }

    const timer = this.statsTimers.get(webContentsId);

    if (timer) {
      clearTimeout(timer);
      this.statsTimers.delete(webContentsId);
    }

    this.stats.delete(webContentsId);
  }

  /**
   * Vide toutes les statistiques (désactivation du bloqueur).
   */
  clearAllStats() {
    for (const timer of this.statsTimers.values()) {
      clearTimeout(timer);
    }

    this.statsTimers.clear();
    this.stats.clear();
  }

  /**
   * Active le moteur sur toutes les sessions connues.
   * @returns {boolean}
   */
  #enable() {
    if (!this.blocker) {
      return false;
    }

    let enabled = false;
    let failed = false;

    for (const [targetSession, entry] of this.sessions) {
      try {
        this.#enableSession(targetSession, entry);
        enabled = true;
      } catch (error) {
        entry.monitor.setAdBlockHandler(null);
        failed = true;
        console.warn(
          '[AdBlock] Activation impossible pour une session :',
          error.message,
        );
      }
    }

    this.active = enabled;

    if (failed && !enabled) {
      return false;
    }

    console.log('[AdBlock] Blocage des publicités et traqueurs activé.');
    return enabled;
  }

  /**
   * Active le filtrage réseau pour une session.
   * @param {Electron.Session} targetSession
   * @param {{monitor: import('./networkMonitor').NetworkMonitor, cosmetic: boolean}} entry
   */
  #enableSession(targetSession, entry) {
    if (!this.blocker) {
      return;
    }

    if (entry.cosmetic && !this.blocker.isBlockingEnabled(targetSession)) {
      this.blocker.enableBlockingInSession(targetSession);
    }

    entry.monitor.setAdBlockHandler((details, callback) => {
      const webContentsId = Number.isInteger(details?.webContentsId)
        ? details.webContentsId
        : null;

      // Un nouveau document principal repart de zéro : le compteur affiché
      // doit décrire la page courante, pas l'historique de la webview.
      if (webContentsId !== null && details.resourceType === 'mainFrame') {
        this.#resetStats(webContentsId);
      }

      try {
        this.blocker.onBeforeRequest(details, (response) => {
          if (
            webContentsId !== null &&
            response &&
            (response.cancel === true || Boolean(response.redirectURL))
          ) {
            this.#recordBlocked(webContentsId);
          }

          callback(response);
        });
      } catch (error) {
        console.warn('[AdBlock] Décision impossible :', error.message);
        callback({});
      }
    });
  }

  /**
   * Réinitialise le compteur d'une webview et prévient l'interface.
   * @param {number} webContentsId
   */
  #resetStats(webContentsId) {
    this.stats.set(webContentsId, 0);
    this.#scheduleStats(webContentsId);
  }

  /**
   * Incrémente le compteur d'une webview.
   * @param {number} webContentsId
   */
  #recordBlocked(webContentsId) {
    this.stats.set(webContentsId, (this.stats.get(webContentsId) || 0) + 1);
    this.#scheduleStats(webContentsId);
  }

  /**
   * Diffuse les statistiques avec une petite temporisation pour ne pas envoyer
   * un événement IPC par requête bloquée sur les pages très chargées.
   * @param {number} webContentsId
   */
  #scheduleStats(webContentsId) {
    if (!this.onStatsChanged || this.statsTimers.has(webContentsId)) {
      return;
    }

    if (this.statsDelay === 0) {
      this.#emitStats(webContentsId);
      return;
    }

    const timer = setTimeout(() => {
      this.statsTimers.delete(webContentsId);
      this.#emitStats(webContentsId);
    }, this.statsDelay);

    timer.unref?.();
    this.statsTimers.set(webContentsId, timer);
  }

  /**
   * Émet les statistiques courantes d'une webview.
   * @param {number} webContentsId
   */
  #emitStats(webContentsId) {
    if (!this.onStatsChanged) {
      return;
    }

    try {
      this.onStatsChanged(this.getStats(webContentsId));
    } catch (error) {
      console.warn('[AdBlock] Diffusion des statistiques impossible :', error.message);
    }
  }

  /**
   * Désactive le moteur, nettoie les canaux cosmétiques et restaure la
   * surveillance média seule.
   * @returns {boolean}
   */
  #disable() {
    if (!this.blocker) {
      this.active = false;
      this.clearAllStats();

      for (const { monitor } of this.sessions.values()) {
        monitor.setAdBlockHandler(null);
      }

      return false;
    }

    for (const [targetSession, entry] of this.sessions) {
      try {
        if (
          entry.cosmetic &&
          this.blocker.isBlockingEnabled(targetSession)
        ) {
          this.blocker.disableBlockingInSession(targetSession);
        }
      } catch (error) {
        console.warn('[AdBlock] Désactivation partielle :', error.message);
      } finally {
        // `disableBlockingInSession` retire tous les écouteurs
        // `onBeforeRequest` ; on réinstalle la surveillance média seule.
        entry.monitor.setAdBlockHandler(null);
      }
    }

    for (const channel of COSMETIC_CHANNELS) {
      ipcMain.removeAllListeners(channel);
    }

    this.active = false;
    this.clearAllStats();
    console.log('[AdBlock] Blocage des publicités et traqueurs désactivé.');
    return true;
  }

  /**
   * Construit l'adaptateur de cache attendu par la bibliothèque.
   * @returns {{path: string, read: Function, write: Function} | undefined}
   */
  #getCaching() {
    if (!this.cachePath) {
      return undefined;
    }

    return {
      path: this.cachePath,
      read: (filePath) => fs.promises.readFile(filePath),
      write: async (filePath, data) => {
        await fs.promises.mkdir(path.dirname(filePath), {
          recursive: true,
        });
        await fs.promises.writeFile(filePath, data);
      },
    };
  }

  /**
   * Supprime le cache trop ancien pour forcer une mise à jour périodique.
   * @returns {Promise<void>}
   */
  async #removeStaleCache() {
    if (!this.cachePath) {
      return;
    }

    try {
      const stats = await fs.promises.stat(this.cachePath);

      if (Date.now() - stats.mtimeMs > ADBLOCK_CACHE_MAX_AGE) {
        await fs.promises.unlink(this.cachePath);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[AdBlock] Cache illisible :', error.message);
      }
    }
  }
}

module.exports = { AdBlocker };
