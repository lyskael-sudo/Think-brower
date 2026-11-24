'use strict';

/**
 * Think-Browser — point d'entrée du processus principal.
 *
 * Le bootstrap assemble les services spécialisés (persistance, fenêtres,
 * téléchargements, réseau, AdBlock, sécurité) et délègue le reste aux modules
 * concernés. Aucune logique d'interface ne doit vivre ici.
 *
 * @module main/index
 */

const path = require('node:path');
const { app, Menu, session } = require('electron');
const { AdBlocker } = require('./adblocker');
const { DownloadManager } = require('./downloadManager');
const { DevWorkspace } = require('./devWorkspace');
const { DownloadStore } = require('./downloadStore');
const { ExtensionManager } = require('./extensionManager');
const {
  installHomeProtocol,
  registerHomeScheme,
} = require('./homeProtocol');
const { registerIpcHandlers } = require('./ipcHandlers');
const {
  installPageProtocol,
  registerPageScheme,
} = require('./pageProtocol');
const { LibraryStore } = require('./libraryStore');
const { MediaDetector } = require('./mediaDetector');
const { MediaLibrary } = require('./mediaLibrary');
const { selectMediaPair } = require('./mediaPair');
const {
  installMediaProtocol,
  registerMediaScheme,
} = require('./mediaProtocol');
const { NetworkMonitor } = require('./networkMonitor');
const { configureSessionSecurity } = require('./security');
const { Store } = require('./store');
const { applySessionUserAgent, buildChromeUserAgent } = require('./userAgent');
const { VideoDownloader } = require('./videoDownloader');
const { VideoTools } = require('./videoTools');
const { WindowManager } = require('./windowManager');
const { YtDlpDownloader } = require('./ytDlpDownloader');
const {
  APP_ID,
  APP_NAME,
  DEFAULT_SETTINGS,
  IPC,
} = require('../shared/constants');

app.setName(APP_NAME);
app.userAgentFallback = buildChromeUserAgent();
registerHomeScheme();
registerMediaScheme();
registerPageScheme();

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

// Politique explicite : aucune exception de certificat n'est accordée, même
// en cas d'erreur de chaîne ou de nom d'hôte. Electron refuse déjà par défaut,
// mais ce gestionnaire rend la décision auditable et empêche une future
// régression de rétablir silencieusement un contournement.
app.on(
  'certificate-error',
  (event, _webContents, url, error, _certificate, callback) => {
    event.preventDefault();
    console.warn('[Sécurité] Certificat refusé :', url, error);
    callback(false);
  },
);

/** @type {Store | null} */
let store = null;

/** @type {WindowManager | null} */
let windowManager = null;

/** @type {NetworkMonitor | null} */
let networkMonitor = null;

/** @type {AdBlocker | null} */
let adBlocker = null;

/** @type {MediaDetector | null} */
let mediaDetector = null;

/** @type {DownloadManager | null} */
let downloadManager = null;

/** @type {MediaLibrary | null} */
let mediaLibrary = null;

/** @type {ExtensionManager | null} */
let extensionManager = null;

/** @type {DevWorkspace | null} */
let devWorkspace = null;

/**
 * Services éphémères rattachés à une partition privée : détecteur média,
 * moniteur réseau et session d'origine. Le tout est libéré à la fermeture de
 * la fenêtre privée.
 * @type {Map<string, {session: Electron.Session, monitor: NetworkMonitor, detector: MediaDetector}>}
 */
const privateSessionServices = new Map();

/** Détecteur neutre renvoyé si une fenêtre privée n'a plus de services. */
const emptyMediaDetector = new MediaDetector();

let quitting = false;

/**
 * État d'installation par session. Une session peut être créée avant que tous
 * les services (médiathèque, téléchargements) soient prêts : chaque étape est
 * donc posée indépendamment et une seule fois.
 * @type {WeakMap<Electron.Session, {userAgent: boolean, home: boolean, pages: boolean, security: boolean, media: boolean, downloads: boolean, private: boolean}>}
 */
const sessionSetupStates = new WeakMap();

/**
 * Configure une session privée : permissions éphémères, téléchargements,
 * détection média et filtrage réseau, sans partager d'état avec la session
 * normale.
 * @param {Electron.Session} targetSession
 */
function attachPrivateSessionServices(targetSession) {
  if (!mediaDetector) {
    return;
  }

  const partition =
    targetSession.partition ||
    windowManager?.getPartitionForSession(targetSession) ||
    '';

  if (!partition || privateSessionServices.has(partition)) {
    return;
  }

  const detector = new MediaDetector();
  const monitor = new NetworkMonitor({
    session: targetSession,
    mediaDetector: detector,
    onMediaDetected: (media) => {
      windowManager?.broadcastMedia({ ...media, private: true });
    },
  });

  monitor.install();
  privateSessionServices.set(partition, {
    session: targetSession,
    monitor,
    detector,
  });
  adBlocker?.registerSession(targetSession, monitor);
  console.log('[Navigation privée] Surveillance locale activée.');
}

/**
 * Applique les garde-fous communs à une session Electron. Les fenêtres
 * privées utilisent des partitions éphémères distinctes : elles doivent elles
 * aussi recevoir les gestionnaires de permissions et de sécurité.
 * @param {Electron.Session} targetSession
 */
function secureSession(targetSession) {
  if (!store || !targetSession) {
    return;
  }

  let state = sessionSetupStates.get(targetSession);

  if (!state) {
    state = {
      userAgent: false,
      home: false,
      pages: false,
      security: false,
      media: false,
      downloads: false,
      private: false,
    };
    sessionSetupStates.set(targetSession, state);
  }

  const isDefaultSession = targetSession === session.defaultSession;

  if (!state.userAgent) {
    applySessionUserAgent(targetSession);
    state.userAgent = true;
  }

  if (!state.home) {
    installHomeProtocol(targetSession);
    state.home = true;
  }

  if (
    !state.pages &&
    extensionManager &&
    downloadManager &&
    adBlocker &&
    devWorkspace
  ) {
    installPageProtocol(targetSession, {
      store,
      appSession: session.defaultSession,
      windowManager,
      downloadManager,
      adBlocker,
      extensionManager,
      devWorkspace,
      isPrivateSession: !isDefaultSession,
    });
    state.pages = true;
  }

  if (!state.security) {
    configureSessionSecurity(targetSession, {
      store,
      // En navigation privée, les choix de permissions ne doivent jamais être
      // écrits dans le fichier partagé.
      persistPermissions: isDefaultSession,
    });
    state.security = true;
  }

  // La médiathèque n'est accessible que depuis la session normale. Les
  // partitions privées ne reçoivent donc pas le protocole think-media.
  if (isDefaultSession && !state.media && mediaLibrary) {
    installMediaProtocol(targetSession, mediaLibrary);
    state.media = true;
  }

  if (!state.downloads && downloadManager) {
    downloadManager.attachSession(targetSession);
    state.downloads = true;
  }

  if (!isDefaultSession && !state.private && mediaDetector) {
    attachPrivateSessionServices(targetSession);
    state.private = true;
  }
}

app.on('session-created', secureSession);

/**
 * Initialise l'application après que l'événement `ready` a été émis.
 * @returns {Promise<void>}
 */
async function bootstrap() {
  const appSession = session.defaultSession;

  // Le menu natif entrerait en conflit avec les raccourcis multi-onglets.
  Menu.setApplicationMenu(null);

  const userDataPath = app.getPath('userData');
  const defaultDownloadDir = app.getPath('downloads');

  store = new Store({
    filePath: path.join(userDataPath, 'think-browser-data.json'),
    defaults: {
      ...DEFAULT_SETTINGS,
      downloadDir: defaultDownloadDir,
    },
  });

  await store.load();

  windowManager = new WindowManager({ store });

  mediaDetector = new MediaDetector();

  networkMonitor = new NetworkMonitor({
    session: appSession,
    mediaDetector,
    onMediaDetected: (media) => {
      windowManager?.broadcastMedia(media);
    },
  });
  networkMonitor.install();

  adBlocker = new AdBlocker({
    session: appSession,
    networkMonitor,
    store,
    cachePath: path.join(userDataPath, 'adblock-engine.bin'),
    onStatsChanged: (stats) => {
      windowManager?.broadcastGuestEvent(
        IPC.ADBLOCK_STATS_UPDATED,
        stats,
        stats.webContentsId,
      );
    },
  });

  windowManager.setGuestDestroyedHandler((guestId) => {
    adBlocker?.clearStats(guestId);
  });

  windowManager.setPrivatePartitionClosedHandler((partition, windowId) => {
    const services = privateSessionServices.get(partition);

    if (!services) {
      return;
    }

    privateSessionServices.delete(partition);
    services.monitor.dispose();
    adBlocker?.unregisterSession(services.session);
    downloadManager?.purgePrivateForWindow(windowId);
  });

  const videoTools = new VideoTools();
  const ytDlpDownloader = new YtDlpDownloader();

  mediaLibrary = new MediaLibrary({
    store: new LibraryStore({
      filePath: path.join(userDataPath, 'library.json'),
    }),
    videoTools,
    thumbnailDir: path.join(userDataPath, 'library-thumbnails'),
    onChanged: () => {
      windowManager?.broadcastNormal(IPC.LIBRARY_UPDATED);
    },
    onFileRenamed: (downloadId, oldPath, newPath) => {
      downloadManager?.updateFilePath(downloadId, oldPath, newPath);
    },
  });
  await mediaLibrary.initialize();

  downloadManager = new DownloadManager({
    session: appSession,
    getDownloadDir: () => store.getSettings().downloadDir,
    getSettings: () => store.getSettings(),
    fallbackDownloadDir: defaultDownloadDir,
    onEvent: (channel, payload, webContents) => {
      windowManager?.broadcastGuestEvent(channel, payload, webContents?.id);
    },
    downloadStore: new DownloadStore({
      filePath: path.join(userDataPath, 'downloads.json'),
    }),
    videoDownloader: new VideoDownloader({
      tools: videoTools,
    }),
    ytDlpDownloader,
    isPrivateSource: (webContents) =>
      windowManager?.isPrivateGuest(webContents?.id) ?? false,
    getWindowIdForGuest: (guestId) =>
      windowManager?.getWindowIdForGuest(guestId) ?? null,
    onMediaCompleted: (record) => mediaLibrary?.addFromDownload(record),
  });

  await downloadManager.initialize();

  // Les autotests ffmpeg/yt-dlp peuvent lancer des sous-processus lents sur
  // certaines machines. Ils restent utiles pour les logs, mais ne doivent pas
  // retarder l'ouverture de la première fenêtre : les modules concernés
  // partagent leur promesse de capacités et attendent eux-mêmes si nécessaire.
  void downloadManager
    .getMediaCapabilities()
    .then((mediaCapabilities) => {
      console.log(
        `[Médias] ffmpeg : ${
          mediaCapabilities.ffmpeg ? 'disponible' : 'indisponible'
        }, ffprobe : ${
          mediaCapabilities.ffprobe ? 'disponible' : 'indisponible'
        }`,
      );
    })
    .catch((error) => {
      console.warn(
        '[Médias] Vérification des capacités impossible :',
        error.message,
      );
    });

  void ytDlpDownloader
    .getCapabilities()
    .then((ytDlpCapabilities) => {
      console.log(
        `[yt-dlp] ${
          ytDlpCapabilities.available
            ? `disponible (${ytDlpCapabilities.version})`
            : 'indisponible'
        }`,
      );
    })
    .catch((error) => {
      console.warn('[yt-dlp] Vérification impossible :', error.message);
    });

  extensionManager = new ExtensionManager({ store });
  devWorkspace = new DevWorkspace({ store });
  secureSession(appSession);

  /**
   * Retourne le détecteur média associé à une fenêtre.
   * @param {Electron.BrowserWindow} browserWindow
   * @returns {import('./mediaDetector').MediaDetector}
   */
  const getMediaDetectorForWindow = (browserWindow) => {
    const partition = windowManager?.getPartition(browserWindow) || '';

    if (partition) {
      return privateSessionServices.get(partition)?.detector
        || emptyMediaDetector;
    }

    return mediaDetector || emptyMediaDetector;
  };

  windowManager.setMediaDownloadHandler((payload) => {
    if (payload?.ytdlp) {
      return downloadManager.startYtDlpDownload(payload);
    }

    if (payload?.videoUrl && payload?.audioUrl) {
      return downloadManager.startMergedDownload(payload);
    }

    return downloadManager.startUrlDownload(payload);
  });

  // Les vidéos MSE/YouTube exposent souvent `blob:` au menu contextuel. Le
  // détecteur réseau conserve les vraies URL HTTP(S) observées : on choisit le
  // flux correspondant au type cliqué (vidéo ou audio), en privilégiant un
  // manifeste HLS/DASH s'il existe.
  windowManager.setMediaResolver((guest, params) => {
    const owner = windowManager?.getWindowForGuest(guest?.id);

    if (!owner) {
      return null;
    }

    const items = getMediaDetectorForWindow(owner)
      .getAll()
      .filter((item) => item.webContentsId === guest.id);

    if (items.length === 0) {
      return null;
    }

    const mediaType = params?.mediaType;
    const expectedPrefix =
      mediaType === 'video' ? 'video/' : mediaType === 'audio' ? 'audio/' : '';
    const matching = expectedPrefix
      ? items.filter((item) =>
          String(item.contentType || '')
            .toLowerCase()
            .startsWith(expectedPrefix),
        )
      : items;
    const candidates = matching.length > 0 ? matching : items;
    const manifest = candidates.find(
      (item) => item.extension === 'm3u8' || item.extension === 'mpd',
    );

    if (manifest) {
      return manifest.url;
    }

    return (
      candidates
        .slice()
        .sort((a, b) => Number(b.size || 0) - Number(a.size || 0))[0]?.url ||
      null
    );
  });

  // YouTube expose généralement une piste vidéo et une piste audio
  // distinctes. On propose une fusion ffmpeg lorsque les deux ont été
  // observées pour la même webview. Les manifestes HLS/DASH restent traités
  // par le chemin existant.
  windowManager.setMediaPairResolver((guest, params) => {
    if (params?.mediaType !== 'video') {
      return null;
    }

    const owner = windowManager?.getWindowForGuest(guest?.id);

    if (!owner) {
      return null;
    }

    const items = getMediaDetectorForWindow(owner)
      .getAll()
      .filter((item) => item.webContentsId === guest.id);

    return selectMediaPair(items);
  });

  registerIpcHandlers({
    store,
    windowManager,
    extensionManager,
    downloadManager,
    mediaLibrary,
    getMediaDetectorForWindow,
    adBlocker,
    appSession,
  });

  // Les services restent découplés du renderer : ils émettent, le gestionnaire
  // de fenêtres diffuse.
  store.on('settings-updated', (settings) => {
    windowManager?.broadcast(IPC.SETTINGS_UPDATED, settings);
  });

  store.on('history-updated', () => {
    windowManager?.broadcast(IPC.HISTORY_UPDATED);
  });

  store.on('favorites-updated', (favorites) => {
    windowManager?.broadcast(IPC.FAVORITES_UPDATED, favorites);
  });

  store.on('favorite-folders-updated', (folders) => {
    windowManager?.broadcast(IPC.FAVORITE_FOLDERS_UPDATED, folders);
  });

  store.on('permissions-updated', () => {
    windowManager?.broadcast(IPC.PERMISSIONS_UPDATED);
  });

  windowManager.restoreSession();

  console.log(
    `[Paramètres] Moteur : ${store.getSettings().searchEngine}, ` +
      `AdBlock : ${
        store.getSettings().adBlockEnabled ? 'activé' : 'désactivé'
      }, téléchargements : ${store.getSettings().downloadDir}`,
  );
  console.log('[Réseau] Surveillance des flux média activée.');

  // Le téléchargement des filtres ne doit pas retarder l'ouverture.
  void adBlocker.initialize();
}

app
  .whenReady()
  .then(bootstrap)
  .catch((error) => {
    console.error('[Think-Browser] Erreur au démarrage :', error);
    app.quit();
  });

app.on('activate', () => {
  if (windowManager && windowManager.size === 0) {
    windowManager.createWindow();
  }
});

app.on('before-quit', (event) => {
  if (quitting) {
    return;
  }

  event.preventDefault();
  quitting = true;

  windowManager?.prepareForQuit();
  downloadManager?.shutdown();

  const flush = Promise.all([
    windowManager ? windowManager.flush() : Promise.resolve(),
    downloadManager ? downloadManager.flush() : Promise.resolve(),
    mediaLibrary ? mediaLibrary.flush() : Promise.resolve(),
  ]);

  flush
    .catch((error) => {
      console.warn(
        '[Données] Écriture finale impossible :',
        error.message,
      );
    })
    .finally(() => {
      networkMonitor?.dispose();
      app.quit();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
