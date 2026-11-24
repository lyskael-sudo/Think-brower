'use strict';

/**
 * Think-Browser — façade IPC du renderer.
 *
 * Les composants d'interface ne manipulent jamais `ipcRenderer` directement :
 * ils passent par cette façade, qui utilise le pont sécurisé exposé par le
 * preload (`window.thinkBridge`). Aucun module Node.js n'est chargé ici.
 *
 * @module renderer/api
 */

const { IPC, IPC_EVENTS } = require('../../shared/constants');

const bridge = window.thinkBridge;

if (!bridge) {
  throw new Error(
    'Pont IPC indisponible : le preload du renderer n’a pas été chargé.',
  );
}

const EVENT_CHANNELS = new Set(IPC_EVENTS);

const api = {
  // Paramètres et confidentialité.
  getSettings: () => bridge.invoke(IPC.SETTINGS_GET),
  updateSettings: (patch) => bridge.invoke(IPC.SETTINGS_UPDATE, patch),
  chooseDownloadDir: () =>
    bridge.invoke(IPC.SETTINGS_CHOOSE_DOWNLOAD_DIR),
  clearBrowsingData: () => bridge.invoke(IPC.BROWSING_DATA_CLEAR),

  // Extensions internes.
  getExtensions: () => bridge.invoke(IPC.EXTENSIONS_GET),
  setExtensionEnabled: (id, enabled) =>
    bridge.invoke(IPC.EXTENSIONS_SET_ENABLED, id, enabled),
  setTheme: (theme) => bridge.invoke(IPC.EXTENSIONS_SET_THEME, theme),
  setLanguage: (language) =>
    bridge.invoke(IPC.EXTENSIONS_SET_LANGUAGE, language),

  // Historique.
  listHistory: () => bridge.invoke(IPC.HISTORY_LIST),
  clearHistory: () => bridge.invoke(IPC.HISTORY_CLEAR),

  // Session.
  getSession: () => bridge.invoke(IPC.SESSION_GET),
  saveSession: (state) => bridge.send(IPC.SESSION_SAVE, state),

  // Favoris.
  listFavorites: () => bridge.invoke(IPC.FAVORITES_LIST),
  toggleFavorite: (payload) => bridge.invoke(IPC.FAVORITES_TOGGLE, payload),
  removeFavorite: (favoriteId) =>
    bridge.invoke(IPC.FAVORITES_REMOVE, favoriteId),
  listFavoriteFolders: () => bridge.invoke(IPC.FAVORITE_FOLDERS_LIST),
  createFavoriteFolder: (name) =>
    bridge.invoke(IPC.FAVORITE_FOLDER_CREATE, name),
  deleteFavoriteFolder: (folderId) =>
    bridge.invoke(IPC.FAVORITE_FOLDER_DELETE, folderId),
  moveFavorite: (favoriteId, folderId) =>
    bridge.invoke(IPC.FAVORITE_MOVE, favoriteId, folderId),
  importFavorites: () => bridge.invoke(IPC.FAVORITES_IMPORT),
  exportFavorites: () => bridge.invoke(IPC.FAVORITES_EXPORT),
  resetSitePermissions: () => bridge.invoke(IPC.PERMISSIONS_RESET),
  getAdBlockStats: (guestId) =>
    bridge.invoke(IPC.ADBLOCK_STATS_GET, guestId),

  // Téléchargements et médias.
  listDownloads: () => bridge.invoke(IPC.DOWNLOADS_LIST),
  inspectUrl: (payload) => bridge.invoke(IPC.DOWNLOADS_INSPECT_URL, payload),
  downloadUrl: (payload) => bridge.invoke(IPC.DOWNLOADS_START_URL, payload),
  showDownloadInFolder: (downloadId) =>
    bridge.invoke(IPC.DOWNLOADS_SHOW_IN_FOLDER, downloadId),
  retryDownload: (downloadId) =>
    bridge.invoke(IPC.DOWNLOADS_RETRY, downloadId),
  cancelDownload: (downloadId) =>
    bridge.invoke(IPC.DOWNLOADS_CANCEL, downloadId),
  resumeDownload: (downloadId) =>
    bridge.invoke(IPC.DOWNLOADS_RESUME, downloadId),
  stopDownload: (downloadId) =>
    bridge.invoke(IPC.DOWNLOADS_STOP, downloadId),
  listMedia: () => bridge.invoke(IPC.MEDIA_LIST),
  getMediaCapabilities: () => bridge.invoke(IPC.MEDIA_CAPABILITIES),
  downloadMedia: (payload) => bridge.invoke(IPC.MEDIA_DOWNLOAD, payload),
  downloadMergedMedia: (payload) =>
    bridge.invoke(IPC.MEDIA_DOWNLOAD_MERGED, payload),
  prepareMedia: (payload) => bridge.invoke(IPC.MEDIA_PREPARE, payload),
  extractPageMedia: (webContentsId) =>
    bridge.invoke(IPC.MEDIA_EXTRACT, webContentsId),

  // Médiathèque.
  listLibrary: () => bridge.invoke(IPC.LIBRARY_LIST),
  importLibraryFiles: () => bridge.invoke(IPC.LIBRARY_IMPORT),
  removeLibraryEntry: (id, deleteFile = false) =>
    bridge.invoke(IPC.LIBRARY_REMOVE, { id, deleteFile }),
  renameLibraryEntry: (id, name) =>
    bridge.invoke(IPC.LIBRARY_RENAME, { id, name }),
  revealLibraryEntry: (id) => bridge.invoke(IPC.LIBRARY_REVEAL, id),
  updateLibraryPlayback: (id, position) =>
    bridge.invoke(IPC.LIBRARY_PLAYBACK, { id, position }),

  // Application et fenêtres.
  getAppInfo: () => bridge.invoke(IPC.APP_INFO),
  openNewWindow: () => bridge.send(IPC.WINDOW_NEW),
  openNewPrivateWindow: () => bridge.send(IPC.WINDOW_NEW_PRIVATE),
  isWindowFullscreen: () => bridge.invoke(IPC.WINDOW_GET_FULLSCREEN),
  setWindowFullscreen: (enabled) =>
    bridge.invoke(IPC.WINDOW_SET_FULLSCREEN, Boolean(enabled)),
  toggleAppDevTools: () => bridge.invoke(IPC.APP_DEVTOOLS_TOGGLE),

  /**
   * S'abonne à un événement du processus principal.
   * @param {string} channel
   * @param {(payload: unknown) => void} listener
   * @returns {() => void} Fonction de désabonnement.
   */
  on(channel, listener) {
    if (!EVENT_CHANNELS.has(channel)) {
      throw new Error(`Canal d’événement inconnu : ${channel}`);
    }

    if (typeof listener !== 'function') {
      throw new Error('Le listener IPC doit être une fonction.');
    }

    return bridge.on(channel, listener);
  },
};

module.exports = { api };
