'use strict';

/**
 * Think-Browser — persistance locale.
 *
 * Un unique fichier JSON structuré est écrit dans `app.getPath('userData')`.
 * Il contient les paramètres, l'historique et les favoris. Les écritures sont
 * sérialisées et atomiques (fichier temporaire + renommage) afin d'éviter les
 * corruptions en cas d'arrêt brutal.
 *
 * @module main/store
 */

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  DEFAULT_SETTINGS,
  DEFAULT_ZOOM,
  HISTORY_LIMIT,
  HISTORY_SAVE_DELAY,
  HOME_PAGE_MODES,
  HOME_PAGE_MODE_KEYS,
  MAX_SESSION_TABS,
  MAX_SESSION_WINDOWS,
  MAX_STREAM_DOWNLOADS_LIMIT,
  MAX_ZOOM,
  MIN_STREAM_DOWNLOADS,
  MIN_ZOOM,
  SEARCH_ENGINE_KEYS,
} = require('../shared/constants');
const {
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  EXTENSION_IDS,
  LANGUAGE_KEYS,
  THEME_KEYS,
  isExtensionEnabled,
  isExtensionId,
  normalizeEnabledExtensions,
} = require('../shared/extensions');
const {
  getHostname,
  isHttpUrl,
  isTabUrl,
  makeId,
  normalizeTitle,
} = require('../shared/utils');

/**
 * Normalise un identifiant d'origine HTTP(S).
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const origin = new URL(value).origin;
    return isHttpUrl(origin) ? origin : null;
  } catch {
    return null;
  }
}

/**
 * Normalise un dossier de favoris lu depuis le disque.
 * @param {unknown} entry
 * @returns {{id: string, name: string, createdAt: string} | null}
 */
function normalizeFavoriteFolder(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const name =
    typeof entry.name === 'string' ? entry.name.trim().slice(0, 60) : '';

  if (!name) {
    return null;
  }

  const createdAt =
    typeof entry.createdAt === 'string' &&
    !Number.isNaN(Date.parse(entry.createdAt))
      ? new Date(entry.createdAt).toISOString()
      : new Date().toISOString();

  return {
    id:
      typeof entry.id === 'string' && entry.id
        ? entry.id
        : makeId('folder-'),
    name,
    createdAt,
  };
}

/**
 * Normalise un onglet de session.
 * @param {unknown} entry
 * @returns {{url: string, title: string} | null}
 */
function normalizeSessionTab(entry) {
  const url =
    typeof entry === 'string'
      ? entry
      : entry && typeof entry === 'object'
        ? entry.url
        : null;

  if (!isTabUrl(url)) {
    return null;
  }

  return {
    url,
    title:
      entry && typeof entry === 'object'
        ? normalizeTitle(entry.title, url)
        : getHostname(url),
  };
}

/**
 * Normalise les dimensions enregistrées d'une fenêtre.
 * @param {unknown} bounds
 * @returns {{x: number, y: number, width: number, height: number} | null}
 */
function normalizeSessionBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    return null;
  }

  const values = ['x', 'y', 'width', 'height'].map((key) => bounds[key]);

  if (!values.every((value) => Number.isFinite(value))) {
    return null;
  }

  const [x, y, width, height] = values;

  if (width < 640 || height < 420) {
    return null;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * Normalise l'état de session complet.
 * @param {unknown} raw
 * @returns {{windows: object[]}}
 */
function normalizeSession(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const windows = Array.isArray(source.windows)
    ? source.windows
        .slice(0, MAX_SESSION_WINDOWS)
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const tabs = Array.isArray(entry.tabs)
            ? entry.tabs
                .map(normalizeSessionTab)
                .filter(Boolean)
                .slice(0, MAX_SESSION_TABS)
            : [];

          const activeIndex = Number.isInteger(entry.activeIndex)
            ? Math.min(Math.max(entry.activeIndex, 0), Math.max(tabs.length - 1, 0))
            : 0;

          return {
            tabs,
            activeIndex,
            bounds: normalizeSessionBounds(entry.bounds),
            maximized: entry.maximized === true,
          };
        })
        .filter(Boolean)
    : [];

  return { windows };
}

/**
 * Normalise les permissions accordées site par site.
 * @param {unknown} raw
 * @returns {Record<string, Record<string, 'allow' | 'deny'>>}
 */
function normalizeSitePermissions(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const permissions = {};

  for (const [rawOrigin, decisions] of Object.entries(source).slice(0, 300)) {
    const origin = normalizeOrigin(rawOrigin);

    if (!origin || !decisions || typeof decisions !== 'object') {
      continue;
    }

    const normalized = {};

    for (const [permission, decision] of Object.entries(decisions)) {
      if (
        typeof permission !== 'string' ||
        permission === '__proto__' ||
        (decision !== 'allow' && decision !== 'deny')
      ) {
        continue;
      }

      normalized[permission] = decision;
    }

    if (Object.keys(normalized).length > 0) {
      permissions[origin] = normalized;
    }
  }

  return permissions;
}

/**
 * Normalise une entrée d'historique lue depuis le disque.
 * @param {unknown} entry
 * @returns {{id: string, url: string, title: string, visitedAt: string} | null}
 */
function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object' || !isHttpUrl(entry.url)) {
    return null;
  }

  const visitedAt =
    typeof entry.visitedAt === 'string' &&
    !Number.isNaN(Date.parse(entry.visitedAt))
      ? new Date(entry.visitedAt).toISOString()
      : new Date().toISOString();

  return {
    id:
      typeof entry.id === 'string' && entry.id
        ? entry.id
        : makeId('history-'),
    url: entry.url,
    title: normalizeTitle(entry.title, entry.url),
    visitedAt,
  };
}

/**
 * Normalise un favori lu depuis le disque.
 * @param {unknown} entry
 * @returns {{id: string, url: string, title: string, addedAt: string, folderId: string | null} | null}
 */
function normalizeFavoriteEntry(entry) {
  if (!entry || typeof entry !== 'object' || !isHttpUrl(entry.url)) {
    return null;
  }

  const addedAt =
    typeof entry.addedAt === 'string' && !Number.isNaN(Date.parse(entry.addedAt))
      ? new Date(entry.addedAt).toISOString()
      : new Date().toISOString();

  return {
    id:
      typeof entry.id === 'string' && entry.id ? entry.id : makeId('fav-'),
    url: entry.url,
    title: normalizeTitle(entry.title, entry.url),
    addedAt,
    folderId:
      typeof entry.folderId === 'string' && entry.folderId
        ? entry.folderId
        : null,
  };
}

/**
 * Gestionnaire de persistance et de données du navigateur.
 *
 * Événements émis :
 * - `settings-updated` (settings)
 * - `history-updated` ()
 * - `favorites-updated` (favorites)
 * - `favorite-folders-updated` (folders)
 * - `permissions-updated` ()
 */
class Store extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.filePath Chemin du fichier JSON.
   * @param {object} options.defaults Paramètres par défaut complets.
   * @param {number} [options.historyLimit]
   * @param {number} [options.saveDelay]
   */
  constructor({
    filePath,
    defaults,
    historyLimit = HISTORY_LIMIT,
    saveDelay = HISTORY_SAVE_DELAY,
  }) {
    super();

    if (typeof filePath !== 'string' || !filePath.trim()) {
      throw new Error('Le chemin du fichier de données est invalide.');
    }

    this.filePath = path.resolve(filePath);
    this.historyLimit = historyLimit;
    this.saveDelay = saveDelay;

    this.defaults = {
      ...DEFAULT_SETTINGS,
      downloadDir: '',
      ...(defaults && typeof defaults === 'object' ? defaults : {}),
    };
    this.defaults.enabledExtensions = normalizeEnabledExtensions(
      this.defaults.enabledExtensions,
    );

    /** @type {{settings: object, history: object[], favorites: object[], favoriteFolders: object[], sitePermissions: object, session: {windows: object[]}}} */
    this.data = this.#normalizeData({});

    /** @type {ReturnType<typeof setTimeout> | null} */
    this.saveTimer = null;

    /** @type {Promise<void>} */
    this.writeChain = Promise.resolve();
  }

  /**
   * Charge le fichier de données. Un fichier absent ou corrompu ne bloque
   * jamais le démarrage : les valeurs par défaut sont utilisées.
   * @returns {Promise<void>}
   */
  async load() {
    try {
      const content = await fs.promises.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(content);
      this.data = this.#normalizeData(parsed);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(
          '[Données] Lecture impossible, valeurs par défaut utilisées :',
          error.message,
        );
      }

      this.data = this.#normalizeData({});
    }
  }

  /**
   * Retourne une copie des paramètres.
   * @returns {{searchEngine: string, adBlockEnabled: boolean, downloadDir: string, homePageMode: string, homePageUrl: string, restoreSession: boolean, saveHistory: boolean, defaultZoom: number}}
   */
  getSettings() {
    return { ...this.data.settings };
  }

  /**
   * Retourne une copie de l'état de session (fenêtres et onglets à restaurer).
   * @returns {{windows: object[]}}
   */
  getSession() {
    return {
      windows: this.data.session.windows.map((windowState) => ({
        ...windowState,
        tabs: windowState.tabs.map((tab) => ({ ...tab })),
        bounds: windowState.bounds ? { ...windowState.bounds } : null,
      })),
    };
  }

  /**
   * Enregistre l'état de session courant. L'écriture est différée afin de ne
   * pas bloquer la navigation lors des mises à jour fréquentes.
   * @param {unknown} session
   * @returns {{windows: object[]}}
   */
  updateSession(session) {
    this.data.session = normalizeSession(session);
    this.#schedulePersist();
    return this.getSession();
  }

  /**
   * Valide et applique une modification des paramètres.
   * @param {Record<string, unknown>} patch
   * @returns {Promise<object>}
   */
  async updateSettings(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('Paramètres invalides.');
    }

    const previous = { ...this.data.settings };
    const next = { ...this.data.settings };

    if (Object.prototype.hasOwnProperty.call(patch, 'searchEngine')) {
      if (!SEARCH_ENGINE_KEYS.includes(patch.searchEngine)) {
        throw new Error('Moteur de recherche inconnu.');
      }
      next.searchEngine = patch.searchEngine;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'adBlockEnabled')) {
      if (typeof patch.adBlockEnabled !== 'boolean') {
        throw new Error('Valeur invalide pour le bloqueur de publicités.');
      }
      next.adBlockEnabled = patch.adBlockEnabled;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'downloadDir')) {
      if (
        typeof patch.downloadDir !== 'string' ||
        !patch.downloadDir.trim()
      ) {
        throw new Error('Dossier de téléchargement invalide.');
      }
      next.downloadDir = path.resolve(patch.downloadDir);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'homePageMode')) {
      if (!HOME_PAGE_MODE_KEYS.includes(patch.homePageMode)) {
        throw new Error('Mode de page d’accueil inconnu.');
      }
      next.homePageMode = patch.homePageMode;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'homePageUrl')) {
      if (typeof patch.homePageUrl !== 'string') {
        throw new Error('Adresse de page d’accueil invalide.');
      }

      const homePageUrl = patch.homePageUrl.trim();
      next.homePageUrl = homePageUrl;

      if (homePageUrl && !isHttpUrl(homePageUrl)) {
        throw new Error(
          'La page d’accueil personnalisée doit être une URL HTTP(S).',
        );
      }
    }

    if (
      next.homePageMode === HOME_PAGE_MODES.CUSTOM &&
      !next.homePageUrl
    ) {
      throw new Error(
        'Choisissez une adresse HTTP(S) pour la page d’accueil personnalisée.',
      );
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'restoreSession')) {
      if (typeof patch.restoreSession !== 'boolean') {
        throw new Error('La restauration de session doit être un booléen.');
      }
      next.restoreSession = patch.restoreSession;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'saveHistory')) {
      if (typeof patch.saveHistory !== 'boolean') {
        throw new Error('L’enregistrement de l’historique doit être un booléen.');
      }
      next.saveHistory = patch.saveHistory;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'defaultZoom')) {
      const zoom = Number(patch.defaultZoom);

      if (!Number.isFinite(zoom) || zoom < MIN_ZOOM || zoom > MAX_ZOOM) {
        throw new Error('Niveau de zoom invalide.');
      }

      next.defaultZoom = Math.round(zoom * 100) / 100;
    }

    if (
      Object.prototype.hasOwnProperty.call(patch, 'maxStreamDownloads')
    ) {
      const concurrency = Number(patch.maxStreamDownloads);

      if (
        !Number.isInteger(concurrency) ||
        concurrency < MIN_STREAM_DOWNLOADS ||
        concurrency > MAX_STREAM_DOWNLOADS_LIMIT
      ) {
        throw new Error(
          `La file de flux doit contenir entre ${MIN_STREAM_DOWNLOADS} et ` +
            `${MAX_STREAM_DOWNLOADS_LIMIT} téléchargements simultanés.`,
        );
      }

      next.maxStreamDownloads = concurrency;
    }

    if (
      Object.prototype.hasOwnProperty.call(patch, 'linkDownloadReferer')
    ) {
      if (typeof patch.linkDownloadReferer !== 'boolean') {
        throw new Error(
          'Le réglage du Referer de téléchargement doit être un booléen.',
        );
      }

      next.linkDownloadReferer = patch.linkDownloadReferer;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'devWorkspace')) {
      if (typeof patch.devWorkspace !== 'string') {
        throw new Error('Dossier de travail invalide.');
      }

      const workspace = patch.devWorkspace.trim();
      next.devWorkspace = workspace ? path.resolve(workspace) : '';
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'theme')) {
      if (!THEME_KEYS.includes(patch.theme)) {
        throw new Error('Thème inconnu.');
      }

      next.theme = patch.theme;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'language')) {
      if (!LANGUAGE_KEYS.includes(patch.language)) {
        throw new Error('Langue inconnue.');
      }

      next.language = patch.language;
    }

    if (
      Object.prototype.hasOwnProperty.call(patch, 'enabledExtensions')
    ) {
      if (
        !Array.isArray(patch.enabledExtensions) ||
        patch.enabledExtensions.some((id) => !isExtensionId(id))
      ) {
        throw new Error('Liste d’extensions invalide.');
      }

      next.enabledExtensions = normalizeEnabledExtensions(
        patch.enabledExtensions,
        [],
      );
    }

    // Une extension désactivée ne peut pas continuer à imposer son thème ou sa
    // langue : on revient aux valeurs sûres par défaut.
    if (!isExtensionEnabled(next.enabledExtensions, EXTENSION_IDS.THEME)) {
      next.theme = DEFAULT_THEME;
    }

    if (
      !isExtensionEnabled(next.enabledExtensions, EXTENSION_IDS.LANGUAGE)
    ) {
      next.language = DEFAULT_LANGUAGE;
    }

    this.data.settings = next;

    try {
      await this.#persist();
    } catch (error) {
      this.data.settings = previous;
      throw error;
    }

    const settings = this.getSettings();
    this.emit('settings-updated', settings);
    return settings;
  }

  /**
   * Retourne une copie de l'historique, du plus récent au plus ancien.
   * @returns {object[]}
   */
  getHistory() {
    return this.data.history.map((entry) => ({ ...entry }));
  }

  /**
   * Ajoute une visite. Deux navigations consécutives vers la même URL sont
   * fusionnées pour garder un historique lisible.
   * @param {string} url
   * @param {string} title
   * @returns {{id: string, url: string, title: string, visitedAt: string} | null}
   */
  addHistoryEntry(url, title) {
    if (!isHttpUrl(url) || !this.data.settings.saveHistory) {
      return null;
    }

    const visitedAt = new Date().toISOString();
    const normalizedTitle = normalizeTitle(title, url);
    const latest = this.data.history[0];

    if (latest && latest.url === url) {
      latest.visitedAt = visitedAt;
      latest.title = normalizedTitle;
      this.#schedulePersist();
      this.emit('history-updated');
      return { ...latest };
    }

    const entry = {
      id: makeId('history-'),
      url,
      title: normalizedTitle || getHostname(url),
      visitedAt,
    };

    this.data.history.unshift(entry);

    if (this.data.history.length > this.historyLimit) {
      this.data.history.length = this.historyLimit;
    }

    this.#schedulePersist();
    this.emit('history-updated');
    return { ...entry };
  }

  /**
   * Met à jour le titre d'une entrée après `page-title-updated`.
   * @param {string} entryId
   * @param {string} title
   * @param {string} [currentUrl]
   * @returns {boolean}
   */
  updateHistoryEntry(entryId, title, currentUrl) {
    if (!this.data.settings.saveHistory) {
      return false;
    }

    const entry = this.data.history.find((item) => item.id === entryId);

    if (!entry || (currentUrl && entry.url !== currentUrl)) {
      return false;
    }

    const nextTitle = normalizeTitle(title, entry.url);

    if (nextTitle === entry.title) {
      return false;
    }

    entry.title = nextTitle;
    this.#schedulePersist();
    this.emit('history-updated');
    return true;
  }

  /**
   * Efface tout l'historique et force l'écriture.
   * @returns {Promise<void>}
   */
  async clearHistory() {
    const previousHistory = this.data.history;
    this.data.history = [];
    this.#cancelScheduledPersist();

    try {
      await this.#persist();
    } catch (error) {
      this.data.history = previousHistory;
      throw error;
    }

    this.emit('history-updated');
  }

  /**
   * Retourne une copie des favoris.
   * @returns {object[]}
   */
  getFavorites() {
    return this.data.favorites.map((entry) => ({ ...entry }));
  }

  /**
   * Retourne une copie des dossiers de favoris.
   * @returns {object[]}
   */
  getFavoriteFolders() {
    return this.data.favoriteFolders.map((folder) => ({ ...folder }));
  }

  /**
   * Indique si une URL est déjà enregistrée en favori.
   * @param {string} url
   * @returns {boolean}
   */
  isFavorite(url) {
    return this.data.favorites.some((entry) => entry.url === url);
  }

  /**
   * Ajoute ou retire une page des favoris.
   * @param {{url: string, title?: string, folderId?: string | null}} payload
   * @returns {Promise<{active: boolean, favorite: object | null, favorites: object[], folders: object[]}>}
   */
  async toggleFavorite({ url, title, folderId = null } = {}) {
    if (!isHttpUrl(url)) {
      throw new Error('Seules les pages HTTP(S) peuvent être ajoutées aux favoris.');
    }

    const previousFavorites = this.getFavorites();
    const existingIndex = this.data.favorites.findIndex(
      (entry) => entry.url === url,
    );

    let active;
    let favorite = null;

    if (existingIndex >= 0) {
      this.data.favorites.splice(existingIndex, 1);
      active = false;
    } else {
      const targetFolderId = this.data.favoriteFolders.some(
        (folder) => folder.id === folderId,
      )
        ? folderId
        : null;

      favorite = {
        id: makeId('fav-'),
        url,
        title: normalizeTitle(title, url),
        addedAt: new Date().toISOString(),
        folderId: targetFolderId,
      };
      this.data.favorites.unshift(favorite);
      active = true;
    }

    try {
      await this.#persist();
    } catch (error) {
      this.data.favorites = previousFavorites;
      throw error;
    }

    const favorites = this.getFavorites();
    const folders = this.getFavoriteFolders();
    this.emit('favorites-updated', favorites);

    return {
      active,
      favorite: favorite ? { ...favorite } : null,
      favorites,
      folders,
    };
  }

  /**
   * Retire un favori par son identifiant.
   * @param {string} favoriteId
   * @returns {Promise<{removed: boolean, favorites: object[], folders: object[]}>}
   */
  async removeFavorite(favoriteId) {
    const index = this.data.favorites.findIndex(
      (entry) => entry.id === favoriteId,
    );

    if (index < 0) {
      return {
        removed: false,
        favorites: this.getFavorites(),
        folders: this.getFavoriteFolders(),
      };
    }

    const previousFavorites = this.getFavorites();
    this.data.favorites.splice(index, 1);

    try {
      await this.#persist();
    } catch (error) {
      this.data.favorites = previousFavorites;
      throw error;
    }

    const favorites = this.getFavorites();
    const folders = this.getFavoriteFolders();
    this.emit('favorites-updated', favorites);
    return { removed: true, favorites, folders };
  }

  /**
   * Déplace un favori vers un dossier, ou vers la racine si `folderId` est nul.
   * @param {string} favoriteId
   * @param {string | null} folderId
   * @returns {Promise<{moved: boolean, favorites: object[]}>}
   */
  async moveFavorite(favoriteId, folderId) {
    const favorite = this.data.favorites.find(
      (entry) => entry.id === favoriteId,
    );

    if (!favorite) {
      return { moved: false, favorites: this.getFavorites() };
    }

    const targetFolderId =
      folderId === null ||
      this.data.favoriteFolders.some((folder) => folder.id === folderId)
        ? folderId
        : null;

    if (favorite.folderId === targetFolderId) {
      return { moved: true, favorites: this.getFavorites() };
    }

    const previousFolderId = favorite.folderId;
    favorite.folderId = targetFolderId;

    try {
      await this.#persist();
    } catch (error) {
      favorite.folderId = previousFolderId;
      throw error;
    }

    const favorites = this.getFavorites();
    this.emit('favorites-updated', favorites);
    return { moved: true, favorites };
  }

  /**
   * Crée un dossier de favoris.
   * @param {string} name
   * @returns {Promise<{folder: object, folders: object[]}>}
   */
  async createFavoriteFolder(name) {
    const normalizedName =
      typeof name === 'string' ? name.trim().slice(0, 60) : '';

    if (!normalizedName) {
      throw new Error('Le nom du dossier est requis.');
    }

    if (
      this.data.favoriteFolders.some(
        (folder) => folder.name.toLowerCase() === normalizedName.toLowerCase(),
      )
    ) {
      throw new Error('Ce dossier existe déjà.');
    }

    const previousFolders = this.data.favoriteFolders;
    const folder = {
      id: makeId('folder-'),
      name: normalizedName,
      createdAt: new Date().toISOString(),
    };

    this.data.favoriteFolders = [...previousFolders, folder];

    try {
      await this.#persist();
    } catch (error) {
      this.data.favoriteFolders = previousFolders;
      throw error;
    }

    const folders = this.getFavoriteFolders();
    this.emit('favorite-folders-updated', folders);
    return { folder: { ...folder }, folders };
  }

  /**
   * Supprime un dossier. Les favoris qu'il contenait reviennent à la racine.
   * @param {string} folderId
   * @returns {Promise<{removed: boolean, folders: object[], favorites: object[]}>}
   */
  async deleteFavoriteFolder(folderId) {
    const existing = this.data.favoriteFolders.find(
      (folder) => folder.id === folderId,
    );

    if (!existing) {
      return {
        removed: false,
        folders: this.getFavoriteFolders(),
        favorites: this.getFavorites(),
      };
    }

    const previousFolders = this.getFavoriteFolders();
    const previousFavorites = this.getFavorites();

    this.data.favoriteFolders = this.data.favoriteFolders.filter(
      (folder) => folder.id !== folderId,
    );

    for (const favorite of this.data.favorites) {
      if (favorite.folderId === folderId) {
        favorite.folderId = null;
      }
    }

    try {
      await this.#persist();
    } catch (error) {
      this.data.favoriteFolders = previousFolders;
      this.data.favorites = previousFavorites;
      throw error;
    }

    const folders = this.getFavoriteFolders();
    const favorites = this.getFavorites();
    this.emit('favorite-folders-updated', folders);
    this.emit('favorites-updated', favorites);
    return { removed: true, folders, favorites };
  }

  /**
   * Importe des favoris et leurs dossiers. Les doublons d'URL sont fusionnés.
   * @param {{favorites?: object[], folders?: object[]} | object[]} payload
   * @returns {Promise<{importedFavorites: number, importedFolders: number, favorites: object[], folders: object[]}>}
   */
  async importFavorites(payload) {
    const source = Array.isArray(payload)
      ? { favorites: payload, folders: [] }
      : payload && typeof payload === 'object'
        ? payload
        : {};

    const incomingFolders = Array.isArray(source.folders)
      ? source.folders.map(normalizeFavoriteFolder).filter(Boolean)
      : [];
    const incomingFavorites = Array.isArray(source.favorites)
      ? source.favorites.map(normalizeFavoriteEntry).filter(Boolean)
      : [];

    const previousFolders = this.getFavoriteFolders();
    const previousFavorites = this.getFavorites();
    const folders = previousFolders.map((folder) => ({ ...folder }));
    const favorites = previousFavorites.map((entry) => ({ ...entry }));
    const folderMap = new Map();
    let importedFolders = 0;

    for (const folder of incomingFolders.slice(0, 200)) {
      const existing = folders.find(
        (item) => item.name.toLowerCase() === folder.name.toLowerCase(),
      );

      if (existing) {
        folderMap.set(folder.id, existing.id);
        continue;
      }

      const created = {
        id: makeId('folder-'),
        name: folder.name,
        createdAt: folder.createdAt,
      };

      folders.push(created);
      folderMap.set(folder.id, created.id);
      importedFolders += 1;
    }

    let importedFavorites = 0;

    for (const entry of incomingFavorites.slice(0, 5000)) {
      const mappedFolderId = entry.folderId
        ? folderMap.get(entry.folderId) || null
        : null;
      const existing = favorites.find((item) => item.url === entry.url);

      if (existing) {
        if (mappedFolderId && !existing.folderId) {
          existing.folderId = mappedFolderId;
        }
        continue;
      }

      favorites.push({
        id: makeId('fav-'),
        url: entry.url,
        title: normalizeTitle(entry.title, entry.url),
        addedAt: entry.addedAt,
        folderId: mappedFolderId,
      });
      importedFavorites += 1;
    }

    this.data.favoriteFolders = folders;
    this.data.favorites = favorites;

    try {
      await this.#persist();
    } catch (error) {
      this.data.favoriteFolders = previousFolders;
      this.data.favorites = previousFavorites;
      throw error;
    }

    const normalizedFolders = this.getFavoriteFolders();
    const normalizedFavorites = this.getFavorites();
    this.emit('favorite-folders-updated', normalizedFolders);
    this.emit('favorites-updated', normalizedFavorites);
    return {
      importedFavorites,
      importedFolders,
      favorites: normalizedFavorites,
      folders: normalizedFolders,
    };
  }

  /**
   * Prépare un export JSON des favoris.
   * @returns {{version: number, exportedAt: string, favorites: object[], folders: object[]}}
   */
  exportFavorites() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      folders: this.getFavoriteFolders(),
      favorites: this.getFavorites(),
    };
  }

  /**
   * Retourne une copie des décisions de permissions par site.
   * @returns {Record<string, Record<string, 'allow' | 'deny'>>}
   */
  getSitePermissions() {
    const copy = {};

    for (const [origin, permissions] of Object.entries(
      this.data.sitePermissions,
    )) {
      copy[origin] = { ...permissions };
    }

    return copy;
  }

  /**
   * Retourne la décision mémorisée pour une origine et une permission.
   * @param {string} origin
   * @param {string} permission
   * @returns {'allow' | 'deny' | null}
   */
  getSitePermission(origin, permission) {
    const normalizedOrigin = normalizeOrigin(origin);

    if (!normalizedOrigin || typeof permission !== 'string') {
      return null;
    }

    const decision = this.data.sitePermissions[normalizedOrigin]?.[permission];
    return decision === 'allow' || decision === 'deny' ? decision : null;
  }

  /**
   * Mémorise une décision de permission pour une origine.
   * @param {string} origin
   * @param {string} permission
   * @param {'allow' | 'deny'} decision
   * @returns {Promise<void>}
   */
  async setSitePermission(origin, permission, decision) {
    const normalizedOrigin = normalizeOrigin(origin);

    if (!normalizedOrigin) {
      throw new Error('Origine invalide.');
    }

    if (
      typeof permission !== 'string' ||
      !permission ||
      permission === '__proto__' ||
      (decision !== 'allow' && decision !== 'deny')
    ) {
      throw new Error('Permission invalide.');
    }

    const previous = this.data.sitePermissions;
    const next = {
      ...previous,
      [normalizedOrigin]: {
        ...(previous[normalizedOrigin] || {}),
        [permission]: decision,
      },
    };

    this.data.sitePermissions = next;

    try {
      await this.#persist();
    } catch (error) {
      this.data.sitePermissions = previous;
      throw error;
    }

    this.emit('permissions-updated');
  }

  /**
   * Efface toutes les décisions de permissions par site.
   * @returns {Promise<void>}
   */
  async clearSitePermissions() {
    const previous = this.data.sitePermissions;
    this.data.sitePermissions = {};

    try {
      await this.#persist();
    } catch (error) {
      this.data.sitePermissions = previous;
      throw error;
    }

    this.emit('permissions-updated');
  }

  /**
   * Force l'écriture des modifications différées. À appeler avant l'arrêt.
   * @returns {Promise<void>}
   */
  async flush() {
    if (this.saveTimer) {
      this.#cancelScheduledPersist();
      await this.#persist();
      return;
    }

    await this.writeChain;
  }

  /**
   * Programme une écriture différée pour l'historique.
   */
  #schedulePersist() {
    this.#cancelScheduledPersist();

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.#persist().catch((error) => {
        console.warn('[Données] Écriture différée impossible :', error.message);
      });
    }, this.saveDelay);
  }

  /**
   * Annule une écriture différée en attente.
   */
  #cancelScheduledPersist() {
    if (!this.saveTimer) {
      return;
    }

    clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  /**
   * Écrit le fichier de données de façon atomique et sérialisée.
   * @returns {Promise<void>}
   */
  #persist() {
    const snapshot = `${JSON.stringify(this.data, null, 2)}\n`;
    const temporaryPath = `${this.filePath}.tmp`;

    const operation = this.writeChain
      .catch(() => {
        // Une écriture précédente a échoué : la chaîne doit pouvoir continuer.
      })
      .then(async () => {
        await fs.promises.mkdir(path.dirname(this.filePath), {
          recursive: true,
        });
        await fs.promises.writeFile(temporaryPath, snapshot, 'utf8');
        await fs.promises.rename(temporaryPath, this.filePath);
      });

    this.writeChain = operation.catch(() => {});
    return operation;
  }

  /**
   * Valide l'ensemble des données chargées.
   * @param {unknown} raw
   * @returns {{settings: object, history: object[], favorites: object[], favoriteFolders: object[], sitePermissions: object, session: {windows: object[]}}}
   */
  #normalizeData(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const favoriteFolders = Array.isArray(source.favoriteFolders)
      ? source.favoriteFolders
          .map(normalizeFavoriteFolder)
          .filter(Boolean)
          .slice(0, 200)
      : [];
    const folderIds = new Set(favoriteFolders.map((folder) => folder.id));
    const favorites = Array.isArray(source.favorites)
      ? source.favorites
          .map(normalizeFavoriteEntry)
          .filter(Boolean)
          .slice(0, 5000)
          .map((favorite) => ({
            ...favorite,
            folderId:
              favorite.folderId && folderIds.has(favorite.folderId)
                ? favorite.folderId
                : null,
          }))
      : [];

    return {
      settings: this.#normalizeSettings(source.settings),
      history: Array.isArray(source.history)
        ? source.history
            .map(normalizeHistoryEntry)
            .filter(Boolean)
            .slice(0, this.historyLimit)
        : [],
      favorites,
      favoriteFolders,
      sitePermissions: normalizeSitePermissions(source.sitePermissions),
      session: normalizeSession(source.session),
    };
  }

  /**
   * Valide les paramètres en appliquant les valeurs par défaut.
   * @param {unknown} candidate
   * @returns {{searchEngine: string, adBlockEnabled: boolean, downloadDir: string, homePageMode: string, homePageUrl: string, restoreSession: boolean, saveHistory: boolean, defaultZoom: number}}
   */
  #normalizeSettings(candidate) {
    const source =
      candidate && typeof candidate === 'object' ? candidate : {};
    const settings = { ...this.defaults };

    if (SEARCH_ENGINE_KEYS.includes(source.searchEngine)) {
      settings.searchEngine = source.searchEngine;
    }

    if (typeof source.adBlockEnabled === 'boolean') {
      settings.adBlockEnabled = source.adBlockEnabled;
    }

    if (
      typeof source.downloadDir === 'string' &&
      source.downloadDir.trim()
    ) {
      settings.downloadDir = path.resolve(source.downloadDir);
    }

    if (HOME_PAGE_MODE_KEYS.includes(source.homePageMode)) {
      settings.homePageMode = source.homePageMode;
    }

    if (
      typeof source.homePageUrl === 'string' &&
      isHttpUrl(source.homePageUrl)
    ) {
      settings.homePageUrl = source.homePageUrl.trim();
    } else {
      settings.homePageUrl = '';
    }

    if (
      settings.homePageMode === HOME_PAGE_MODES.CUSTOM &&
      !settings.homePageUrl
    ) {
      settings.homePageMode = HOME_PAGE_MODES.BUILTIN;
    }

    if (typeof source.restoreSession === 'boolean') {
      settings.restoreSession = source.restoreSession;
    }

    if (typeof source.saveHistory === 'boolean') {
      settings.saveHistory = source.saveHistory;
    }

    if (Number.isFinite(source.defaultZoom)) {
      settings.defaultZoom =
        Math.round(
          Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, source.defaultZoom)) * 100,
        ) / 100;
    } else {
      settings.defaultZoom = DEFAULT_ZOOM;
    }

    if (Number.isInteger(source.maxStreamDownloads)) {
      settings.maxStreamDownloads = Math.min(
        MAX_STREAM_DOWNLOADS_LIMIT,
        Math.max(MIN_STREAM_DOWNLOADS, source.maxStreamDownloads),
      );
    } else {
      settings.maxStreamDownloads = 2;
    }

    if (typeof source.linkDownloadReferer === 'boolean') {
      settings.linkDownloadReferer = source.linkDownloadReferer;
    }

    if (typeof source.devWorkspace === 'string' && source.devWorkspace.trim()) {
      settings.devWorkspace = path.resolve(source.devWorkspace);
    } else {
      settings.devWorkspace = '';
    }

    settings.enabledExtensions = normalizeEnabledExtensions(
      source.enabledExtensions,
      this.defaults.enabledExtensions,
    );

    if (THEME_KEYS.includes(source.theme)) {
      settings.theme = source.theme;
    } else {
      settings.theme = DEFAULT_THEME;
    }

    if (LANGUAGE_KEYS.includes(source.language)) {
      settings.language = source.language;
    } else {
      settings.language = DEFAULT_LANGUAGE;
    }

    if (!isExtensionEnabled(settings.enabledExtensions, EXTENSION_IDS.THEME)) {
      settings.theme = DEFAULT_THEME;
    }

    if (
      !isExtensionEnabled(settings.enabledExtensions, EXTENSION_IDS.LANGUAGE)
    ) {
      settings.language = DEFAULT_LANGUAGE;
    }

    return settings;
  }
}

module.exports = { Store };
