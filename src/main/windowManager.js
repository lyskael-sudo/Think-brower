'use strict';

/**
 * Think-Browser — gestion des fenêtres.
 *
 * Crée les fenêtres principales et privées, charge l'interface locale,
 * sécurise chaque webview invitée, conserve l'état de session et expose des
 * primitives de diffusion IPC.
 *
 * @module main/windowManager
 */

const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { BrowserWindow, session } = require('electron');
const {
  IPC,
  MAX_SESSION_TABS,
  WINDOW_DEFAULTS,
} = require('../shared/constants');
const { isTabUrl } = require('../shared/utils');
const { APP_ICON_PATH } = require('./appIcon');
const { attachGuestController } = require('./guestController');
const { hardenGuestWebview } = require('./security');
const { handleBrowserShortcut } = require('./shortcuts');
const { applyWebContentsUserAgent } = require('./userAgent');

/**
 * Normalise l'état d'une fenêtre reçu du renderer.
 * @param {unknown} state
 * @returns {{tabs: {url: string, title: string}[], activeIndex: number}}
 */
function normalizeWindowState(state) {
  const source = state && typeof state === 'object' ? state : {};
  const tabs = Array.isArray(source.tabs)
    ? source.tabs
        .map((tab) => {
          if (!tab || typeof tab !== 'object' || !isTabUrl(tab.url)) {
            return null;
          }

          return {
            url: tab.url,
            title:
              typeof tab.title === 'string' ? tab.title.slice(0, 300) : '',
          };
        })
        .filter(Boolean)
        .slice(0, MAX_SESSION_TABS)
    : [];

  const activeIndex = Number.isInteger(source.activeIndex)
    ? Math.min(Math.max(source.activeIndex, 0), Math.max(tabs.length - 1, 0))
    : 0;

  return { tabs, activeIndex };
}

/**
 * Vérifie qu'une navigation de la fenêtre hôte reste sur le document local
 * attendu. Le preload du renderer hôte ne doit jamais être exposé à une page
 * distante, même si un lien ou un script local tentait de naviguer ailleurs.
 * @param {unknown} value
 * @param {string} interfacePath
 * @returns {boolean}
 */
function isHostInterfaceUrl(value, interfacePath) {
  if (typeof value !== 'string' || !value) {
    return false;
  }

  try {
    const parsed = new URL(value);

    if (parsed.protocol !== 'file:') {
      return false;
    }

    return (
      path.resolve(fileURLToPath(parsed)) === path.resolve(interfacePath)
    );
  } catch {
    return false;
  }
}

/**
 * Gère le cycle de vie des fenêtres Think-Browser.
 */
class WindowManager {
  /**
   * @param {object} options
   * @param {import('./store').Store} options.store
   */
  constructor({ store }) {
    this.store = store;

    /** @type {Set<Electron.BrowserWindow>} */
    this.windows = new Set();

    /** @type {Map<Electron.BrowserWindow, object>} */
    this.records = new Map();

    /** @type {Map<number, Electron.BrowserWindow>} */
    this.guestOwners = new Map();

    this.nextWindowId = 1;
    this.quitting = false;
    this.sessionTimer = null;
    this.lastClosedSession = null;

    /** @type {((partition: string) => void) | null} */
    this.privatePartitionClosedHandler = null;

    /** @type {((guestId: number) => void) | null} */
    this.guestDestroyedHandler = null;

    /** @type {((payload: object) => Promise<object> | object) | null} */
    this.mediaDownloadHandler = null;

    /** @type {((guest: Electron.WebContents, params: Electron.ContextMenuParams) => string | null) | null} */
    this.mediaResolver = null;

    /** @type {((guest: Electron.WebContents, params: Electron.ContextMenuParams) => object | null) | null} */
    this.mediaPairResolver = null;
  }

  /**
   * Enregistre le nettoyage à exécuter lorsqu'une fenêtre privée se ferme.
   * @param {((partition: string, windowId: number) => void) | null} handler
   */
  setPrivatePartitionClosedHandler(handler) {
    this.privatePartitionClosedHandler =
      typeof handler === 'function' ? handler : null;
  }

  /**
   * Enregistre le nettoyage des données associées à une webview détruite.
   * @param {((guestId: number) => void) | null} handler
   */
  setGuestDestroyedHandler(handler) {
    this.guestDestroyedHandler =
      typeof handler === 'function' ? handler : null;
  }

  /**
   * Branche le gestionnaire de téléchargement utilisé par le menu contextuel.
   * @param {((payload: object) => Promise<object> | object) | null} handler
   */
  setMediaDownloadHandler(handler) {
    this.mediaDownloadHandler =
      typeof handler === 'function' ? handler : null;
  }

  /**
   * Branche le résolveur qui retrouve un flux HTTP(S) derrière une vidéo MSE.
   * @param {((guest: Electron.WebContents, params: Electron.ContextMenuParams) => string | null) | null} handler
   */
  setMediaResolver(handler) {
    this.mediaResolver = typeof handler === 'function' ? handler : null;
  }

  /**
   * Branche le résolveur qui associe une piste vidéo et une piste audio
   * séparées, afin de proposer une fusion ffmpeg.
   * @param {((guest: Electron.WebContents, params: Electron.ContextMenuParams) => object | null) | null} handler
   */
  setMediaPairResolver(handler) {
    this.mediaPairResolver =
      typeof handler === 'function' ? handler : null;
  }

  /**
   * Retourne la fenêtre propriétaire d'une webview.
   * @param {number} guestId
   * @returns {Electron.BrowserWindow | null}
   */
  getWindowForGuest(guestId) {
    if (!Number.isInteger(guestId)) {
      return null;
    }

    return this.guestOwners.get(guestId) || null;
  }

  /**
   * Transmet une demande de téléchargement issue du menu contextuel.
   * @param {Electron.BrowserWindow} browserWindow
   * @param {Electron.WebContents} guest
   * @param {{
   *   url?: string,
   *   videoUrl?: string,
   *   audioUrl?: string,
   *   videoExtension?: string,
   *   audioExtension?: string,
   *   videoContentType?: string,
   *   audioContentType?: string,
   *   outputExtension?: string,
   *   pageUrl?: string,
   *   mediaType?: string,
   *   ytdlp?: boolean
   * }} payload
   * @returns {Promise<object> | object}
   */
  #downloadMediaFromContextMenu(browserWindow, guest, payload) {
    if (!this.mediaDownloadHandler) {
      return {
        ok: false,
        message: 'Le gestionnaire de téléchargement n’est pas disponible.',
      };
    }

    const record = this.records.get(browserWindow);
    const pageUrl =
      typeof payload?.pageUrl === 'string' && payload.pageUrl
        ? payload.pageUrl
        : guest.getURL?.() || '';
    const access = {
      windowId: record?.id ?? null,
      isPrivate: Boolean(record?.isPrivate),
    };

    if (payload?.videoUrl && payload?.audioUrl) {
      return this.mediaDownloadHandler({
        videoUrl: payload.videoUrl,
        audioUrl: payload.audioUrl,
        videoExtension: payload.videoExtension,
        audioExtension: payload.audioExtension,
        videoContentType: payload.videoContentType,
        audioContentType: payload.audioContentType,
        outputExtension: payload.outputExtension,
        pageUrl,
        requestingWebContents: guest,
        access,
        mediaType: 'video',
      });
    }

    return this.mediaDownloadHandler({
      url: payload?.url,
      pageUrl,
      ytdlp: payload?.ytdlp === true,
      requestingWebContents: guest,
      access,
      mediaType: payload?.mediaType || 'none',
    });
  }

  /**
   * Signale la destruction d'une webview aux services intéressés.
   * @param {number} guestId
   */
  #notifyGuestDestroyed(guestId) {
    if (!Number.isInteger(guestId)) {
      return;
    }

    try {
      this.guestDestroyedHandler?.(guestId);
    } catch (error) {
      console.warn(
        '[Fenêtre] Nettoyage de la webview impossible :',
        error.message,
      );
    }
  }

  /**
   * Nombre de fenêtres ouvertes.
   * @returns {number}
   */
  get size() {
    return this.windows.size;
  }

  /**
   * Crée une fenêtre indépendante.
   * @param {{isPrivate?: boolean, restoreState?: object | null}} [options]
   * @returns {Electron.BrowserWindow}
   */
  createWindow({ isPrivate = false, restoreState = null } = {}) {
    const id = this.nextWindowId;
    this.nextWindowId += 1;

    const partition = isPrivate
      ? `think-private-${process.pid}-${id}-${Date.now()}`
      : '';
    const savedBounds =
      restoreState && restoreState.bounds ? restoreState.bounds : null;

    const browserWindow = new BrowserWindow({
      ...WINDOW_DEFAULTS,
      ...(savedBounds || {}),
      title: isPrivate
        ? 'Think-Browser — Navigation privée'
        : 'Think-Browser',
      icon: APP_ICON_PATH,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        // Le renderer local n'a plus accès à Node.js. Il communique via le
        // pont fermé du preload, tandis que les pages distantes restent
        // isolées dans les webviews (voir plus bas).
        webviewTag: true,
        javascript: true,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: path.join(__dirname, '..', 'preload', 'rendererPreload.js'),
      },
    });

    applyWebContentsUserAgent(browserWindow.webContents);

    const record = {
      id,
      isPrivate,
      partition,
      guestIds: new Set(),
      sessionState: restoreState
        ? normalizeWindowState(restoreState)
        : null,
      bounds: savedBounds || null,
      maximized: Boolean(restoreState?.maximized),
    };

    this.windows.add(browserWindow);
    this.records.set(browserWindow, record);

    if (!isPrivate) {
      this.lastClosedSession = null;
    }

    this.#wireWindow(browserWindow, record);
    this.#loadInterface(browserWindow, record);

    return browserWindow;
  }

  /**
   * Restaure les fenêtres de la dernière session, ou en crée une vide.
   */
  restoreSession() {
    const settings = this.store.getSettings();

    if (!settings.restoreSession) {
      this.createWindow();
      return;
    }

    const saved = this.store.getSession();
    const windows = Array.isArray(saved.windows) ? saved.windows : [];

    if (windows.length === 0) {
      this.createWindow();
      return;
    }

    for (const state of windows) {
      this.createWindow({ restoreState: state });
    }
  }

  /**
   * Retourne l'état de session à restaurer pour une fenêtre.
   * @param {Electron.BrowserWindow} browserWindow
   * @returns {{tabs: object[], activeIndex: number} | null}
   */
  getSessionForWindow(browserWindow) {
    const record = this.records.get(browserWindow);

    if (!record || record.isPrivate || !record.sessionState) {
      return null;
    }

    return {
      tabs: record.sessionState.tabs.map((tab) => ({ ...tab })),
      activeIndex: record.sessionState.activeIndex,
    };
  }

  /**
   * Met à jour l'état de session d'une fenêtre.
   * @param {Electron.BrowserWindow} browserWindow
   * @param {unknown} state
   */
  updateSession(browserWindow, state) {
    const record = this.records.get(browserWindow);

    if (!record || record.isPrivate) {
      return;
    }

    record.sessionState = normalizeWindowState(state);
    this.#scheduleSessionPersist();
  }

  /**
   * Indique si une fenêtre est privée.
   * @param {Electron.BrowserWindow} browserWindow
   * @returns {boolean}
   */
  isPrivateWindow(browserWindow) {
    return Boolean(this.records.get(browserWindow)?.isPrivate);
  }

  /**
   * Indique si une webview invitée appartient à une fenêtre privée.
   * @param {number | undefined} guestId
   * @returns {boolean}
   */
  isPrivateGuest(guestId) {
    if (!Number.isInteger(guestId)) {
      return false;
    }

    const owner = this.guestOwners.get(guestId);
    return Boolean(owner && this.records.get(owner)?.isPrivate);
  }

  /**
   * Retourne l'identifiant interne d'une fenêtre.
   * @param {Electron.BrowserWindow} browserWindow
   * @returns {number | null}
   */
  getWindowId(browserWindow) {
    return this.records.get(browserWindow)?.id ?? null;
  }

  /**
   * Retourne la partition d'une fenêtre (`''` pour la session normale).
   * @param {Electron.BrowserWindow} browserWindow
   * @returns {string}
   */
  getPartition(browserWindow) {
    return this.records.get(browserWindow)?.partition || '';
  }

  /**
   * Retrouve la partition associée à une session, y compris lorsque Electron
   * ne renseigne pas directement `session.partition` pour une partition
   * éphémère créée par une webview.
   * @param {Electron.Session} targetSession
   * @returns {string}
   */
  getPartitionForSession(targetSession) {
    for (const record of this.records.values()) {
      if (!record.partition) {
        continue;
      }

      try {
        if (session.fromPartition(record.partition) === targetSession) {
          return record.partition;
        }
      } catch {
        // Partition en cours de création ou déjà détruite.
      }
    }

    return '';
  }

  /**
   * Retourne l'identifiant de la fenêtre propriétaire d'une webview.
   * @param {number | undefined} guestId
   * @returns {number | null}
   */
  getWindowIdForGuest(guestId) {
    if (!Number.isInteger(guestId)) {
      return null;
    }

    const owner = this.guestOwners.get(guestId);
    return owner ? this.getWindowId(owner) : null;
  }

  /**
   * Envoie un événement à une fenêtre.
   * @param {Electron.BrowserWindow} browserWindow
   * @param {string} channel
   * @param {unknown} [payload]
   */
  sendToWindow(browserWindow, channel, payload) {
    if (!browserWindow || browserWindow.isDestroyed()) {
      return;
    }

    const webContents = browserWindow.webContents;

    if (!webContents.isDestroyed()) {
      webContents.send(channel, payload);
    }
  }

  /**
   * Diffuse un événement à toutes les fenêtres vivantes.
   * @param {string} channel
   * @param {unknown} [payload]
   */
  broadcast(channel, payload) {
    for (const browserWindow of this.windows) {
      this.sendToWindow(browserWindow, channel, payload);
    }
  }

  /**
   * Diffuse un événement aux fenêtres normales uniquement.
   * @param {string} channel
   * @param {unknown} [payload]
   */
  broadcastNormal(channel, payload) {
    for (const [browserWindow, record] of this.records) {
      if (!record.isPrivate) {
        this.sendToWindow(browserWindow, channel, payload);
      }
    }
  }

  /**
   * Diffuse un média uniquement à la fenêtre qui l'a demandé. Une page privée
   * ne doit jamais faire apparaître ses flux dans les autres fenêtres.
   * @param {object} media
   */
  broadcastMedia(media) {
    const owner = this.guestOwners.get(Number(media?.webContentsId));

    if (owner) {
      this.sendToWindow(owner, IPC.MEDIA_DETECTED, media);
      return;
    }

    // Un média dont la webview d'origine n'est pas identifiée ne doit jamais
    // être exposé aux fenêtres normales s'il provient d'une partition privée.
    if (media?.private) {
      return;
    }

    for (const [browserWindow, record] of this.records) {
      if (!record.isPrivate) {
        this.sendToWindow(browserWindow, IPC.MEDIA_DETECTED, media);
      }
    }
  }

  /**
   * Diffuse un événement lié à une webview. Un téléchargement privé reste
   * confiné à la fenêtre propriétaire ; les événements ordinaires sont
   * partagés entre les fenêtres normales, jamais avec les fenêtres privées.
   * @param {string} channel
   * @param {object} payload
   * @param {number | undefined} guestId
   */
  broadcastGuestEvent(channel, payload, guestId) {
    const owner = this.guestOwners.get(Number(guestId));

    if (owner) {
      const record = this.records.get(owner);

      if (record?.isPrivate) {
        this.sendToWindow(owner, channel, payload);
        return;
      }
    }

    if (payload?.private) {
      return;
    }

    for (const [browserWindow, record] of this.records) {
      if (!record.isPrivate) {
        this.sendToWindow(browserWindow, channel, payload);
      }
    }
  }

  /**
   * Ouvre ou ferme les DevTools de l'interface hôte.
   * @param {Electron.BrowserWindow} browserWindow
   * @returns {boolean}
   */
  toggleApplicationDevTools(browserWindow) {
    if (!browserWindow || browserWindow.isDestroyed()) {
      return false;
    }

    const webContents = browserWindow.webContents;

    if (webContents.isDevToolsOpened()) {
      webContents.closeDevTools();
      return false;
    }

    webContents.openDevTools({ mode: 'detach' });
    return true;
  }

  /**
   * Prépare l'arrêt : fige la géométrie des fenêtres et la session.
   */
  prepareForQuit() {
    this.quitting = true;
    this.#captureGeometry();
    this.#persistSession();
  }

  /**
   * Force l'écriture de l'état de session différé.
   * @returns {Promise<void>}
   */
  async flush() {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
      this.#persistSession();
    }

    await this.store.flush();
  }

  /**
   * Branche les événements d'une fenêtre.
   * @param {Electron.BrowserWindow} browserWindow
   * @param {object} record
   */
  #wireWindow(browserWindow, record) {
    // Les raccourcis sont capturés avant Chromium, même quand l'URL a le focus.
    browserWindow.webContents.on('before-input-event', (event, input) => {
      handleBrowserShortcut(event, input, browserWindow, {
        onToggleAppDevTools: (targetWindow) => {
          if (targetWindow.webContents.isDevToolsOpened()) {
            targetWindow.webContents.closeDevTools();
          } else {
            targetWindow.webContents.openDevTools({ mode: 'detach' });
          }
        },
      });
    });

    browserWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    const interfacePath = path.join(
      __dirname,
      '..',
      'renderer',
      'index.html',
    );
    const guardHostNavigation = (event, url) => {
      if (!isHostInterfaceUrl(url, interfacePath)) {
        event.preventDefault();
        console.warn('[Fenêtre] Navigation hôte refusée :', url);
      }
    };

    browserWindow.webContents.on('will-navigate', guardHostNavigation);
    browserWindow.webContents.on('will-redirect', guardHostNavigation);

    // Les erreurs du renderer local ne doivent pas disparaître silencieusement.
    // On évite de journaliser les simples `log`/`info` pour ne pas noyer la
    // sortie, mais les avertissements et erreurs restent visibles. Electron 44
    // transmet les détails dans un objet unique ; les anciens arguments
    // positionnels sont dépréciés.
    browserWindow.webContents.on('console-message', (details) => {
      const level = details?.level;

      if (level !== 'warning' && level !== 'error') {
        return;
      }

      const sourceId = details?.sourceId || '';
      const line = Number(details?.lineNumber) || 0;
      const origin = sourceId ? ` (${sourceId}:${line})` : '';
      console.warn(`[Renderer]${origin} ${details?.message || ''}`);
    });

    browserWindow.webContents.on(
      'render-process-gone',
      (_event, details) => {
        console.error(
          '[Renderer] Processus d’interface terminé :',
          details?.reason || 'raison inconnue',
        );
      },
    );

    browserWindow.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) {
          return;
        }

        console.warn(
          '[Renderer] Chargement de l’interface impossible :',
          errorCode,
          errorDescription,
          validatedURL,
        );
      },
    );

    browserWindow.webContents.on(
      'will-attach-webview',
      (event, webPreferences, params) => {
        hardenGuestWebview(event, webPreferences, params);

        if (record.isPrivate) {
          webPreferences.partition = record.partition;
        } else {
          delete webPreferences.partition;
        }
      },
    );

    browserWindow.webContents.on('did-attach-webview', (_event, guest) => {
      record.guestIds.add(guest.id);
      this.guestOwners.set(guest.id, browserWindow);
      // `session.setUserAgent` ne touche pas les WebContents déjà créés.
      applyWebContentsUserAgent(guest);

      attachGuestController(browserWindow, guest, {
        store: this.store,
        sendToWindow: (targetWindow, channel, payload) =>
          this.sendToWindow(targetWindow, channel, payload),
        onToggleAppDevTools: (targetWindow) => {
          if (targetWindow.webContents.isDevToolsOpened()) {
            targetWindow.webContents.closeDevTools();
          } else {
            targetWindow.webContents.openDevTools({ mode: 'detach' });
          }
        },
        trackHistory: !record.isPrivate,
        partition: record.partition,
        registerOwnedGuest: (guestId) => {
          record.guestIds.add(guestId);
          this.guestOwners.set(guestId, browserWindow);
        },
        unregisterOwnedGuest: (guestId) => {
          record.guestIds.delete(guestId);
          this.guestOwners.delete(guestId);
          this.#notifyGuestDestroyed(guestId);
        },
        onDownloadMedia: (payload) =>
          this.#downloadMediaFromContextMenu(browserWindow, guest, payload),
        resolveMediaUrl: (targetGuest, params) => {
          try {
            return this.mediaResolver?.(targetGuest, params) || null;
          } catch (error) {
            console.warn(
              '[Menu contextuel] Résolution média impossible :',
              error.message,
            );
            return null;
          }
        },
        resolveMediaPair: (targetGuest, params) => {
          try {
            return this.mediaPairResolver?.(targetGuest, params) || null;
          } catch (error) {
            console.warn(
              '[Menu contextuel] Résolution de la paire média impossible :',
              error.message,
            );
            return null;
          }
        },
      });

      guest.once('destroyed', () => {
        record.guestIds.delete(guest.id);
        this.guestOwners.delete(guest.id);
        this.#notifyGuestDestroyed(guest.id);
      });
    });

    const updateGeometry = () => {
      if (browserWindow.isDestroyed()) {
        return;
      }

      try {
        record.bounds = browserWindow.isMaximized()
          ? browserWindow.getNormalBounds()
          : browserWindow.getBounds();
        record.maximized = browserWindow.isMaximized();
        this.#scheduleSessionPersist();
      } catch {
        // La fenêtre peut être en cours de destruction.
      }
    };

    browserWindow.on('move', updateGeometry);
    browserWindow.on('resize', updateGeometry);
    browserWindow.on('maximize', updateGeometry);
    browserWindow.on('unmaximize', updateGeometry);

    const notifyFullscreen = () => {
      if (browserWindow.isDestroyed()) {
        return;
      }

      this.sendToWindow(
        browserWindow,
        IPC.WINDOW_FULLSCREEN_CHANGED,
        browserWindow.isFullScreen(),
      );
    };

    browserWindow.on('enter-full-screen', notifyFullscreen);
    browserWindow.on('leave-full-screen', notifyFullscreen);

    browserWindow.once('ready-to-show', () => {
      if (record.maximized) {
        browserWindow.maximize();
      }

      browserWindow.show();
    });

    browserWindow.on('closed', () => {
      this.windows.delete(browserWindow);
      this.records.delete(browserWindow);

      if (record.isPrivate) {
        this.#clearPrivatePartition(record.partition, record.id);
        return;
      }

      if (this.quitting) {
        return;
      }

      const hasOtherNormalWindow = Array.from(this.records.values()).some(
        (entry) => !entry.isPrivate,
      );

      if (!hasOtherNormalWindow) {
        this.lastClosedSession = record.sessionState
          ? {
              ...record.sessionState,
              bounds: record.bounds,
              maximized: record.maximized,
            }
          : null;
      }

      this.#persistSession();
    });
  }

  /**
   * Charge l'interface locale avec son mode de navigation.
   * @param {Electron.BrowserWindow} browserWindow
   * @param {object} record
   */
  #loadInterface(browserWindow, record) {
    const interfacePath = path.join(
      __dirname,
      '..',
      'renderer',
      'index.html',
    );

    void browserWindow
      .loadFile(interfacePath, {
        query: {
          mode: record.isPrivate ? 'private' : 'normal',
          partition: record.partition,
        },
      })
      .catch((error) => {
        console.error('[Fenêtre] Chargement impossible :', error.message);
      });
  }

  /**
   * Capture la géométrie de toutes les fenêtres vivantes.
   */
  #captureGeometry() {
    for (const [browserWindow, record] of this.records) {
      if (browserWindow.isDestroyed()) {
        continue;
      }

      try {
        record.bounds = browserWindow.isMaximized()
          ? browserWindow.getNormalBounds()
          : browserWindow.getBounds();
        record.maximized = browserWindow.isMaximized();
      } catch {
        // On conserve les dernières valeurs connues.
      }
    }
  }

  /**
   * Construit la liste des fenêtres à persister.
   * @returns {object[]}
   */
  #collectSessionWindows() {
    const windows = [];

    for (const record of this.records.values()) {
      if (record.isPrivate) {
        continue;
      }

      windows.push({
        tabs: record.sessionState?.tabs || [],
        activeIndex: record.sessionState?.activeIndex || 0,
        bounds: record.bounds,
        maximized: record.maximized,
      });
    }

    // Une fenêtre privée peut rester ouverte après la fermeture de la
    // dernière fenêtre normale. On conserve alors la session de celle-ci.
    if (windows.length === 0 && this.lastClosedSession) {
      windows.push({
        ...this.lastClosedSession,
        tabs: this.lastClosedSession.tabs || [],
        activeIndex: this.lastClosedSession.activeIndex || 0,
      });
    }

    return windows;
  }

  /**
   * Persiste l'état de session courant.
   */
  #persistSession() {
    this.store.updateSession({ windows: this.#collectSessionWindows() });
  }

  /**
   * Programme la persistance de la session.
   */
  #scheduleSessionPersist() {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
    }

    this.sessionTimer = setTimeout(() => {
      this.sessionTimer = null;

      if (!this.quitting) {
        this.#persistSession();
      }
    }, 250);
  }

  /**
   * Efface les données d'une session privée à la fermeture de sa fenêtre.
   * @param {string} partition
   * @param {number} windowId
   */
  #clearPrivatePartition(partition, windowId) {
    if (!partition) {
      return;
    }

    try {
      this.privatePartitionClosedHandler?.(partition, windowId);
    } catch (error) {
      console.warn(
        '[Navigation privée] Nettoyage des services impossible :',
        error.message,
      );
    }

    try {
      const privateSession = session.fromPartition(partition);
      void privateSession.clearStorageData().catch(() => {});
      void privateSession.clearCache().catch(() => {});
    } catch (error) {
      console.warn(
        '[Navigation privée] Nettoyage impossible :',
        error.message,
      );
    }
  }
}

module.exports = { WindowManager, isHostInterfaceUrl };
