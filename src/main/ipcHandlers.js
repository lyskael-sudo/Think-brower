'use strict';

/**
 * Think-Browser — enregistrement des canaux IPC.
 *
 * Chaque canal est déclaré dans `shared/constants.js`. Ce module ne contient
 * que l'adaptation entre les appels du renderer et les services du processus
 * principal.
 *
 * @module main/ipcHandlers
 */

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  webContents: electronWebContents,
} = require('electron');
const {
  IPC,
  LIBRARY_MEDIA_EXTENSIONS,
} = require('../shared/constants');
const { isHttpUrl } = require('../shared/utils');
const { clearBrowsingData } = require('./browsingData');
const { readFavoritesFile, writeFavoritesFile } = require('./favoritesIO');
const { isMp4Compatible } = require('./mediaPair');
const { extractPageMedia } = require('./siteExtractor');

/**
 * Enregistre tous les handlers IPC de l'application.
 *
 * @param {object} dependencies
 * @param {import('./store').Store} dependencies.store
 * @param {import('./windowManager').WindowManager} dependencies.windowManager
 * @param {import('./downloadManager').DownloadManager} dependencies.downloadManager
 * @param {import('./mediaLibrary').MediaLibrary} dependencies.mediaLibrary
 * @param {(browserWindow: Electron.BrowserWindow) => import('./mediaDetector').MediaDetector} dependencies.getMediaDetectorForWindow
 * @param {import('./adblocker').AdBlocker} dependencies.adBlocker
 * @param {Electron.Session} dependencies.appSession
 * @param {import('./extensionManager').ExtensionManager} dependencies.extensionManager
 */
function registerIpcHandlers({
  store,
  windowManager,
  downloadManager,
  mediaLibrary,
  getMediaDetectorForWindow,
  adBlocker,
  appSession,
  extensionManager,
}) {
  // -------------------------------------------------------------------------
  // Paramètres
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC.SETTINGS_GET, () => store.getSettings());

  ipcMain.handle(IPC.SETTINGS_UPDATE, async (_event, patch) => {
    const updated = await store.updateSettings(patch);

    if (
      patch &&
      Object.prototype.hasOwnProperty.call(patch, 'adBlockEnabled')
    ) {
      // Le chargement des filtres ne doit pas bloquer la réponse IPC.
      void adBlocker.applySetting(updated.adBlockEnabled);
    }

    return updated;
  });

  ipcMain.handle(IPC.ADBLOCK_STATS_GET, (event, guestId) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const ownerWindowId = windowManager.getWindowId(browserWindow);

    if (
      !Number.isInteger(guestId) ||
      ownerWindowId === null ||
      windowManager.getWindowIdForGuest(guestId) !== ownerWindowId
    ) {
      return {
        webContentsId: null,
        blocked: 0,
        active: adBlocker.isActive(),
      };
    }

    return adBlocker.getStats(guestId);
  });

  ipcMain.handle(
    IPC.SETTINGS_CHOOSE_DOWNLOAD_DIR,
    async (event) => {
      const parentWindow = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: 'Choisir le dossier de téléchargement',
        defaultPath: store.getSettings().downloadDir,
        properties: ['openDirectory', 'createDirectory'],
      };

      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, options)
        : await dialog.showOpenDialog(options);

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, settings: store.getSettings() };
      }

      const settings = await store.updateSettings({
        downloadDir: result.filePaths[0],
      });

      return { canceled: false, settings };
    },
  );

  ipcMain.handle(IPC.BROWSING_DATA_CLEAR, async () => {
    try {
      await clearBrowsingData(appSession);
      windowManager.broadcast(IPC.BROWSING_DATA_CLEARED);
      return { ok: true };
    } catch (error) {
      console.warn(
        '[Confidentialité] Effacement impossible :',
        error.message,
      );
      return { ok: false, message: error.message };
    }
  });

  // -------------------------------------------------------------------------
  // Extensions internes
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC.EXTENSIONS_GET, () => extensionManager.getState());

  ipcMain.handle(
    IPC.EXTENSIONS_SET_ENABLED,
    async (_event, id, enabled) => extensionManager.setEnabled(id, enabled),
  );

  ipcMain.handle(IPC.EXTENSIONS_SET_THEME, async (_event, theme) =>
    extensionManager.setTheme(theme),
  );

  ipcMain.handle(IPC.EXTENSIONS_SET_LANGUAGE, async (_event, language) =>
    extensionManager.setLanguage(language),
  );

  // -------------------------------------------------------------------------
  // Session
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC.SESSION_GET, (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    return browserWindow
      ? windowManager.getSessionForWindow(browserWindow)
      : null;
  });

  ipcMain.on(IPC.SESSION_SAVE, (event, state) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    windowManager.updateSession(browserWindow, state);
  });

  // -------------------------------------------------------------------------
  // Historique et favoris
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC.HISTORY_LIST, () => store.getHistory());

  ipcMain.handle(IPC.HISTORY_CLEAR, async () => {
    await store.clearHistory();
    return { ok: true };
  });

  ipcMain.handle(IPC.FAVORITES_LIST, () => store.getFavorites());

  ipcMain.handle(IPC.FAVORITES_TOGGLE, (event, payload) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);

    if (browserWindow && windowManager.isPrivateWindow(browserWindow)) {
      throw new Error(
        'Les favoris sont désactivés en navigation privée.',
      );
    }

    return store.toggleFavorite(payload);
  });

  ipcMain.handle(IPC.FAVORITES_REMOVE, (_event, favoriteId) =>
    store.removeFavorite(favoriteId),
  );

  ipcMain.handle(IPC.FAVORITE_FOLDERS_LIST, () =>
    store.getFavoriteFolders(),
  );

  ipcMain.handle(IPC.FAVORITE_FOLDER_CREATE, (_event, name) =>
    store.createFavoriteFolder(name),
  );

  ipcMain.handle(IPC.FAVORITE_FOLDER_DELETE, (_event, folderId) =>
    store.deleteFavoriteFolder(folderId),
  );

  ipcMain.handle(IPC.FAVORITE_MOVE, (_event, favoriteId, folderId) =>
    store.moveFavorite(favoriteId, folderId ?? null),
  );

  ipcMain.handle(IPC.FAVORITES_IMPORT, async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const file = await readFavoritesFile(parentWindow);

    if (file.canceled) {
      return { canceled: true };
    }

    if (file.message) {
      return { canceled: false, ok: false, message: file.message };
    }

    try {
      const result = await store.importFavorites(file.payload);
      return { canceled: false, ok: true, ...result };
    } catch (error) {
      return { canceled: false, ok: false, message: error.message };
    }
  });

  ipcMain.handle(IPC.FAVORITES_EXPORT, async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const result = await writeFavoritesFile(
      parentWindow,
      store.exportFavorites(),
    );

    return {
      ...result,
      ok: !result.message,
    };
  });

  ipcMain.handle(IPC.PERMISSIONS_RESET, async () => {
    await store.clearSitePermissions();
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Téléchargements et médias
  // -------------------------------------------------------------------------

  /**
   * Détermine les droits d'accès aux téléchargements pour la fenêtre
   * émettrice. Une fenêtre privée ne voit que ses propres fichiers.
   * @param {Electron.IpcMainInvokeEvent} event
   * @returns {{windowId: number | null, isPrivate: boolean}}
   */
  const getDownloadAccess = (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);

    return {
      windowId: windowManager.getWindowId(browserWindow),
      isPrivate: windowManager.isPrivateWindow(browserWindow),
    };
  };

  ipcMain.handle(IPC.DOWNLOADS_LIST, (event) =>
    downloadManager.listForWindow(getDownloadAccess(event)),
  );

  /**
   * Retrouve la webview source d'un téléchargement par lien. Le processus
   * principal vérifie qu'elle appartient bien à la fenêtre émettrice.
   * @param {Electron.IpcMainInvokeEvent} event
   * @param {unknown} guestId
   * @returns {Electron.WebContents | null}
   */
  const getDownloadSource = (event, guestId) => {
    if (!Number.isInteger(guestId)) {
      return null;
    }

    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const ownerWindowId = windowManager.getWindowId(browserWindow);

    if (
      ownerWindowId === null ||
      windowManager.getWindowIdForGuest(guestId) !== ownerWindowId
    ) {
      return null;
    }

    const guest = electronWebContents.fromId(guestId);
    return guest && !guest.isDestroyed() ? guest : null;
  };

  ipcMain.handle(IPC.DOWNLOADS_INSPECT_URL, async (event, payload) => {
    const source = getDownloadSource(event, payload?.guestId);
    const pageUrl =
      source?.getURL?.() ||
      (typeof payload?.pageUrl === 'string' ? payload.pageUrl : '');

    return downloadManager.inspectUrl({
      url: typeof payload?.url === 'string' ? payload.url : '',
      pageUrl,
      requestingWebContents: source,
      access: getDownloadAccess(event),
      probeStreams: true,
    });
  });

  ipcMain.handle(IPC.DOWNLOADS_START_URL, async (event, payload) => {
    const source = getDownloadSource(event, payload?.guestId);
    const pageUrl =
      source?.getURL?.() ||
      (typeof payload?.pageUrl === 'string' ? payload.pageUrl : '');

    return downloadManager.startUrlDownload({
      url: typeof payload?.url === 'string' ? payload.url : '',
      pageUrl,
      requestingWebContents: source,
      access: getDownloadAccess(event),
      audioStreamIndex: Number.isInteger(payload?.audioStreamIndex)
        ? payload.audioStreamIndex
        : null,
      subtitleStreamIndex: Number.isInteger(payload?.subtitleStreamIndex)
        ? payload.subtitleStreamIndex
        : null,
      isLive: payload?.isLive === true,
    });
  });

  ipcMain.handle(IPC.DOWNLOADS_SHOW_IN_FOLDER, (event, downloadId) =>
    downloadManager.showInFolder(downloadId, getDownloadAccess(event)),
  );

  ipcMain.handle(IPC.DOWNLOADS_RETRY, (event, downloadId) =>
    downloadManager.retry(downloadId, getDownloadAccess(event)),
  );

  ipcMain.handle(IPC.DOWNLOADS_CANCEL, (event, downloadId) =>
    downloadManager.cancel(downloadId, getDownloadAccess(event)),
  );

  ipcMain.handle(IPC.DOWNLOADS_RESUME, (event, downloadId) =>
    downloadManager.resume(downloadId, getDownloadAccess(event)),
  );

  ipcMain.handle(IPC.DOWNLOADS_STOP, (event, downloadId) =>
    downloadManager.stop(downloadId, getDownloadAccess(event)),
  );

  ipcMain.handle(IPC.MEDIA_CAPABILITIES, () =>
    downloadManager.getMediaCapabilities(),
  );

  /**
   * Retrouve le média détecté et sa webview source.
   * @param {Electron.BrowserWindow} browserWindow
   * @param {object} payload
   * @returns {{media: object, source: Electron.WebContents | null} | null}
   */
  const resolveDetectedMedia = (browserWindow, payload) => {
    if (!browserWindow || !payload || !isHttpUrl(payload.url)) {
      return null;
    }

    const media = getMediaDetectorForWindow(browserWindow)
      .getAll()
      .find((entry) => entry.url === payload.url);

    if (!media) {
      return null;
    }

    const source = Number.isInteger(media.webContentsId)
      ? electronWebContents.fromId(media.webContentsId)
      : null;

    return { media, source };
  };

  ipcMain.handle(IPC.MEDIA_PREPARE, async (event, payload) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const resolved = resolveDetectedMedia(browserWindow, payload);

    if (!resolved) {
      return {
        ok: false,
        message:
          'Ce média n’est plus répertorié. Rechargez la page puis ' +
          'réessayez.',
      };
    }

    return downloadManager.prepareMediaDownload({
      url: resolved.media.url,
      extension: resolved.media.extension,
      pageUrl:
        resolved.media.referrer ||
        (typeof payload.pageUrl === 'string' ? payload.pageUrl : ''),
      requestingWebContents: resolved.source,
      access: getDownloadAccess(event),
    });
  });

  ipcMain.handle(IPC.MEDIA_DOWNLOAD, async (event, payload) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const resolved = resolveDetectedMedia(browserWindow, payload);

    if (!resolved) {
      return {
        ok: false,
        message:
          'Ce média n’est plus répertorié. Rechargez la page puis ' +
          'réessayez.',
      };
    }

    const audioStreamIndex =
      Number.isInteger(payload.audioStreamIndex) &&
      payload.audioStreamIndex >= 0
        ? payload.audioStreamIndex
        : null;
    const subtitleStreamIndex =
      Number.isInteger(payload.subtitleStreamIndex) &&
      payload.subtitleStreamIndex >= 0
        ? payload.subtitleStreamIndex
        : null;

    return downloadManager.startMediaDownload({
      url: resolved.media.url,
      extension: resolved.media.extension,
      pageUrl:
        resolved.media.referrer ||
        (typeof payload.pageUrl === 'string' ? payload.pageUrl : ''),
      requestingWebContents: resolved.source,
      access: getDownloadAccess(event),
      audioStreamIndex,
      subtitleStreamIndex,
      isLive: payload.isLive === true,
      contentType:
        typeof resolved.media.contentType === 'string'
          ? resolved.media.contentType
          : '',
    });
  });

  ipcMain.handle(IPC.MEDIA_DOWNLOAD_MERGED, async (event, payload) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);

    if (!browserWindow || !payload || typeof payload !== 'object') {
      return {
        ok: false,
        message: 'Demande de fusion audio/vidéo invalide.',
      };
    }

    const video = resolveDetectedMedia(browserWindow, {
      url: payload.videoUrl,
    });
    const audio = resolveDetectedMedia(browserWindow, {
      url: payload.audioUrl,
    });

    if (!video || !audio) {
      return {
        ok: false,
        message:
          'Les pistes audio et vidéo ne sont plus répertoriées. Rechargez ' +
          'la page puis réessayez.',
      };
    }

    return downloadManager.startMergedDownload({
      videoUrl: video.media.url,
      audioUrl: audio.media.url,
      videoExtension: video.media.extension,
      audioExtension: audio.media.extension,
      videoContentType: video.media.contentType,
      audioContentType: audio.media.contentType,
      outputExtension: isMp4Compatible(video.media, audio.media)
        ? 'mp4'
        : 'mkv',
      pageUrl:
        video.media.referrer ||
        (typeof payload.pageUrl === 'string' ? payload.pageUrl : ''),
      requestingWebContents: video.source,
      access: getDownloadAccess(event),
    });
  });

  ipcMain.handle(IPC.MEDIA_LIST, (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);

    if (!browserWindow) {
      return [];
    }

    return getMediaDetectorForWindow(browserWindow).getAll();
  });

  ipcMain.handle(IPC.MEDIA_EXTRACT, async (event, guestId) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const ownerWindowId = windowManager.getWindowId(browserWindow);
    const guestOwnerId = windowManager.getWindowIdForGuest(guestId);

    if (
      !browserWindow ||
      !Number.isInteger(guestId) ||
      ownerWindowId === null ||
      guestOwnerId !== ownerWindowId
    ) {
      return {
        ok: false,
        message: 'Cette page n’appartient pas à la fenêtre active.',
      };
    }

    const guest = electronWebContents.fromId(guestId);

    if (!guest || guest.isDestroyed()) {
      return {
        ok: false,
        message: 'La page active n’est plus disponible.',
      };
    }

    try {
      const result = await extractPageMedia(guest);
      const detector = getMediaDetectorForWindow(browserWindow);
      const media = [];

      for (const candidate of result.media) {
        const addedMedia = detector.add(candidate);

        if (addedMedia) {
          media.push(addedMedia);
          windowManager.broadcastMedia(addedMedia);
        }
      }

      return {
        ok: true,
        added: media.length,
        found: result.media.length,
        knownSiteCount: result.knownSiteCount,
        pageUrl: result.pageUrl,
        media,
      };
    } catch (error) {
      console.warn('[Médias] Extraction impossible :', error.message);
      return {
        ok: false,
        message: 'L’analyse de la page a échoué.',
      };
    }
  });

  // -------------------------------------------------------------------------
  // Médiathèque
  // -------------------------------------------------------------------------

  /**
   * Retourne la fenêtre normale autorisée à utiliser la médiathèque.
   * @param {Electron.IpcMainInvokeEvent} event
   * @returns {Electron.BrowserWindow | null}
   */
  const getLibraryWindow = (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);

    if (
      !browserWindow ||
      browserWindow.isDestroyed() ||
      windowManager.isPrivateWindow(browserWindow)
    ) {
      return null;
    }

    return browserWindow;
  };

  const privateLibraryResponse = {
    ok: false,
    message: 'La médiathèque est désactivée en navigation privée.',
  };

  ipcMain.handle(IPC.LIBRARY_LIST, async (event) => {
    if (!getLibraryWindow(event) || !mediaLibrary) {
      return [];
    }

    return mediaLibrary.list();
  });

  ipcMain.handle(IPC.LIBRARY_IMPORT, async (event) => {
    const browserWindow = getLibraryWindow(event);

    if (!browserWindow || !mediaLibrary) {
      return privateLibraryResponse;
    }

    const options = {
      title: 'Importer des médias',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Médias',
          extensions: Array.from(LIBRARY_MEDIA_EXTENSIONS),
        },
      ],
    };
    const result = await dialog.showOpenDialog(browserWindow, options);

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: true, canceled: true, added: 0, skipped: 0 };
    }

    const imported = await mediaLibrary.importFiles(result.filePaths);

    return {
      ok: true,
      canceled: false,
      ...imported,
    };
  });

  ipcMain.handle(IPC.LIBRARY_REMOVE, async (event, payload) => {
    if (!getLibraryWindow(event) || !mediaLibrary) {
      return privateLibraryResponse;
    }

    const id = typeof payload?.id === 'string' ? payload.id : '';
    const deleteFile = payload?.deleteFile === true;

    return mediaLibrary.remove(id, { deleteFile });
  });

  ipcMain.handle(IPC.LIBRARY_RENAME, async (event, payload) => {
    if (!getLibraryWindow(event) || !mediaLibrary) {
      return privateLibraryResponse;
    }

    const id = typeof payload?.id === 'string' ? payload.id : '';
    const name = typeof payload?.name === 'string' ? payload.name : '';

    return mediaLibrary.rename(id, name);
  });

  ipcMain.handle(IPC.LIBRARY_REVEAL, async (event, id) => {
    if (!getLibraryWindow(event) || !mediaLibrary) {
      return privateLibraryResponse;
    }

    return mediaLibrary.reveal(typeof id === 'string' ? id : '');
  });

  ipcMain.handle(IPC.LIBRARY_PLAYBACK, (event, payload) => {
    if (!getLibraryWindow(event) || !mediaLibrary) {
      return privateLibraryResponse;
    }

    const id = typeof payload?.id === 'string' ? payload.id : '';
    const position = Number(payload?.position);

    return {
      ok: mediaLibrary.updatePlayback(id, position),
    };
  });

  // -------------------------------------------------------------------------
  // Application, fenêtres et DevTools
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC.APP_INFO, () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }));

  ipcMain.on(IPC.WINDOW_NEW, (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);

    if (!sourceWindow || sourceWindow.isDestroyed()) {
      return;
    }

    windowManager.createWindow();
  });

  ipcMain.on(IPC.WINDOW_NEW_PRIVATE, (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);

    if (!sourceWindow || sourceWindow.isDestroyed()) {
      return;
    }

    windowManager.createWindow({ isPrivate: true });
  });

  ipcMain.handle(IPC.WINDOW_GET_FULLSCREEN, (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);

    if (!browserWindow || browserWindow.isDestroyed()) {
      return false;
    }

    return browserWindow.isFullScreen();
  });

  ipcMain.handle(IPC.WINDOW_SET_FULLSCREEN, (event, enabled) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);

    if (!browserWindow || browserWindow.isDestroyed()) {
      return false;
    }

    browserWindow.setFullScreen(Boolean(enabled));
    return browserWindow.isFullScreen();
  });

  ipcMain.handle(IPC.APP_DEVTOOLS_TOGGLE, (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);

    if (!browserWindow) {
      return false;
    }

    return windowManager.toggleApplicationDevTools(browserWindow);
  });
}

module.exports = { registerIpcHandlers };
