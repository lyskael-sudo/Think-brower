'use strict';

/**
 * Think-Browser — constantes partagées entre le processus principal et le
 * renderer.
 *
 * Ce module est la source unique de vérité pour les canaux IPC, les
 * raccourcis, les moteurs de recherche et les valeurs par défaut. Il ne doit
 * dépendre d'aucun module Electron afin de rester utilisable des deux côtés.
 *
 * @module shared/constants
 */

const {
  DEFAULT_ENABLED_EXTENSIONS,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
} = require('./extensions');

/** Nom public de l'application. */
const APP_NAME = 'Think-Browser';

/** Identifiant utilisé par Windows pour regrouper les fenêtres. */
const APP_ID = 'com.thinkbrowser.app';

/** Dimensions et apparence de la fenêtre principale. */
const WINDOW_DEFAULTS = Object.freeze({
  width: 1280,
  height: 800,
  minWidth: 900,
  minHeight: 600,
  backgroundColor: '#0b0f14',
});

/**
 * Canaux IPC explicites.
 *
 * Les canaux `invoke/handle` sont utilisés pour les opérations qui attendent
 * une réponse. Les canaux d'événements sont réservés au processus principal.
 */
const IPC = Object.freeze({
  // Paramètres et confidentialité.
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_CHOOSE_DOWNLOAD_DIR: 'settings:choose-download-dir',
  BROWSING_DATA_CLEAR: 'browsing-data:clear',

  // Extensions internes.
  EXTENSIONS_GET: 'extensions:get',
  EXTENSIONS_SET_ENABLED: 'extensions:set-enabled',
  EXTENSIONS_SET_THEME: 'extensions:set-theme',
  EXTENSIONS_SET_LANGUAGE: 'extensions:set-language',

  // Historique.
  HISTORY_LIST: 'history:list',
  HISTORY_CLEAR: 'history:clear',

  // Session.
  SESSION_GET: 'session:get',
  SESSION_SAVE: 'session:save',

  // Favoris.
  FAVORITES_LIST: 'favorites:list',
  FAVORITES_TOGGLE: 'favorites:toggle',
  FAVORITES_REMOVE: 'favorites:remove',
  FAVORITE_FOLDERS_LIST: 'favorites:folders:list',
  FAVORITE_FOLDER_CREATE: 'favorites:folders:create',
  FAVORITE_FOLDER_DELETE: 'favorites:folders:delete',
  FAVORITE_MOVE: 'favorites:move',
  FAVORITES_IMPORT: 'favorites:import',
  FAVORITES_EXPORT: 'favorites:export',

  // Permissions par site.
  PERMISSIONS_RESET: 'permissions:reset',

  // Blocage publicitaire.
  ADBLOCK_STATS_GET: 'adblock:stats:get',

  // Téléchargements.
  DOWNLOADS_LIST: 'downloads:list',
  DOWNLOADS_INSPECT_URL: 'downloads:inspect-url',
  DOWNLOADS_START_URL: 'downloads:start-url',
  DOWNLOADS_SHOW_IN_FOLDER: 'downloads:show-in-folder',
  DOWNLOADS_RETRY: 'downloads:retry',
  DOWNLOADS_CANCEL: 'downloads:cancel',
  DOWNLOADS_RESUME: 'downloads:resume',
  DOWNLOADS_STOP: 'downloads:stop',

  // Médias.
  MEDIA_LIST: 'media:list',
  MEDIA_DOWNLOAD: 'media:download',
  MEDIA_DOWNLOAD_MERGED: 'media:download-merged',
  MEDIA_PREPARE: 'media:prepare',
  MEDIA_CAPABILITIES: 'media:capabilities',
  MEDIA_EXTRACT: 'media:extract',

  // Médiathèque.
  LIBRARY_LIST: 'library:list',
  LIBRARY_IMPORT: 'library:import',
  LIBRARY_REMOVE: 'library:remove',
  LIBRARY_RENAME: 'library:rename',
  LIBRARY_REVEAL: 'library:reveal',
  LIBRARY_PLAYBACK: 'library:playback',

  // Application et fenêtres.
  APP_INFO: 'app:info',
  WINDOW_NEW: 'window:new',
  WINDOW_NEW_PRIVATE: 'window:new-private',
  WINDOW_GET_FULLSCREEN: 'window:get-fullscreen',
  WINDOW_SET_FULLSCREEN: 'window:set-fullscreen',
  APP_DEVTOOLS_TOGGLE: 'devtools:app',

  // Événements du processus principal vers le renderer.
  SETTINGS_UPDATED: 'settings:updated',
  HISTORY_UPDATED: 'history:updated',
  FAVORITES_UPDATED: 'favorites:updated',
  FAVORITE_FOLDERS_UPDATED: 'favorites:folders:updated',
  PERMISSIONS_UPDATED: 'permissions:updated',
  ADBLOCK_STATS_UPDATED: 'adblock:stats:updated',
  MEDIA_DETECTED: 'media:detected',
  DOWNLOAD_STARTED: 'download:started',
  DOWNLOAD_UPDATED: 'download:updated',
  DOWNLOAD_DONE: 'download:done',
  LIBRARY_UPDATED: 'library:updated',
  BROWSING_DATA_CLEARED: 'browsing-data:cleared',
  OPEN_URL_IN_NEW_TAB: 'browser:open-url-in-new-tab',
  WINDOW_FULLSCREEN_CHANGED: 'window:fullscreen-changed',
  SHORTCUT: 'browser:shortcut',
  APP_NOTIFICATION: 'app:notification',
});

/**
 * Liste blanche des canaux que le renderer est autorisé à écouter.
 * Elle empêche un composant de s'abonner accidentellement à un canal
 * d'action réservé aux appels `invoke`.
 */
const IPC_EVENTS = Object.freeze([
  IPC.SETTINGS_UPDATED,
  IPC.HISTORY_UPDATED,
  IPC.FAVORITES_UPDATED,
  IPC.FAVORITE_FOLDERS_UPDATED,
  IPC.PERMISSIONS_UPDATED,
  IPC.ADBLOCK_STATS_UPDATED,
  IPC.MEDIA_DETECTED,
  IPC.DOWNLOAD_STARTED,
  IPC.DOWNLOAD_UPDATED,
  IPC.DOWNLOAD_DONE,
  IPC.LIBRARY_UPDATED,
  IPC.BROWSING_DATA_CLEARED,
  IPC.OPEN_URL_IN_NEW_TAB,
  IPC.WINDOW_FULLSCREEN_CHANGED,
  IPC.SHORTCUT,
  IPC.APP_NOTIFICATION,
]);

/** Actions envoyées au renderer lorsqu'un raccourci clavier est reconnu. */
const SHORTCUT_ACTIONS = Object.freeze({
  NEW_TAB: 'new-tab',
  NEW_PRIVATE_WINDOW: 'new-private-window',
  HOME_PAGE: 'home-page',
  CLOSE_TAB: 'close-tab',
  REOPEN_TAB: 'reopen-tab',
  RELOAD: 'reload',
  FIND_IN_PAGE: 'find-in-page',
  FIND_NEXT: 'find-next',
  FIND_PREVIOUS: 'find-previous',
  ZOOM_IN: 'zoom-in',
  ZOOM_OUT: 'zoom-out',
  ZOOM_RESET: 'zoom-reset',
  TOGGLE_PAGE_DEVTOOLS: 'toggle-devtools',
  FOCUS_ADDRESS: 'focus-address',
});

/**
 * Moteurs de recherche disponibles.
 * Les URL sont séparées pour que l'accueil et la recherche restent
 * indépendants.
 */
const SEARCH_ENGINES = Object.freeze({
  google: Object.freeze({
    label: 'Google',
    homeUrl: 'https://www.google.com/',
    searchUrl: 'https://www.google.com/search?q=',
  }),
  duckduckgo: Object.freeze({
    label: 'DuckDuckGo',
    homeUrl: 'https://duckduckgo.com/',
    searchUrl: 'https://duckduckgo.com/?q=',
  }),
  bing: Object.freeze({
    label: 'Bing',
    homeUrl: 'https://www.bing.com/',
    searchUrl: 'https://www.bing.com/search?q=',
  }),
});

const SEARCH_ENGINE_KEYS = Object.freeze(Object.keys(SEARCH_ENGINES));
const DEFAULT_SEARCH_ENGINE = 'google';

/**
 * Page d'accueil locale servie par un protocole interne. Elle est séparée des
 * pages web distantes et ne dispose d'aucun accès à Node.js.
 */
const HOME_SCHEME = 'think-home';
const HOME_HOST = 'start';
const HOME_PATH = '/';
const HOME_URL = `${HOME_SCHEME}://${HOME_HOST}${HOME_PATH}`;

/**
 * Pages internes de configuration et de diagnostic. Elles sont servies par un
 * protocole distinct de la page d'accueil et ne reçoivent jamais de preload
 * Node.js. Les alias `about:*` sont résolus avant toute recherche web.
 */
const PAGE_SCHEME = 'think-page';
const PAGE_HOSTS = Object.freeze({
  CONFIG: 'config',
  SECURITY: 'security',
  DEV: 'dev',
});
const PAGE_URLS = Object.freeze({
  config: `${PAGE_SCHEME}://${PAGE_HOSTS.CONFIG}/`,
  security: `${PAGE_SCHEME}://${PAGE_HOSTS.SECURITY}/`,
  dev: `${PAGE_SCHEME}://${PAGE_HOSTS.DEV}/`,
});
const ABOUT_PAGE_URLS = Object.freeze({
  'about:config': PAGE_URLS.config,
  'about:security': PAGE_URLS.security,
  'about:dev': PAGE_URLS.dev,
});
const ABOUT_PAGE_LABELS = Object.freeze(
  Object.fromEntries(
    Object.entries(ABOUT_PAGE_URLS).map(([label, url]) => [url, label]),
  ),
);

/** Modes disponibles pour la page d'accueil. */
const HOME_PAGE_MODES = Object.freeze({
  BUILTIN: 'builtin',
  CUSTOM: 'custom',
});
const HOME_PAGE_MODE_KEYS = Object.freeze(Object.values(HOME_PAGE_MODES));

/** Niveaux de zoom proposés dans les paramètres. */
const ZOOM_PRESETS = Object.freeze([0.75, 0.9, 1, 1.1, 1.25, 1.5]);

/**
 * Paramètres par défaut hors dossier de téléchargement.
 * Le dossier est injecté au démarrage par le processus principal, car il
 * dépend de `app.getPath('downloads')`.
 */
const DEFAULT_SETTINGS = Object.freeze({
  searchEngine: DEFAULT_SEARCH_ENGINE,
  adBlockEnabled: true,
  homePageMode: HOME_PAGE_MODES.BUILTIN,
  homePageUrl: '',
  restoreSession: true,
  saveHistory: true,
  defaultZoom: 1,
  maxStreamDownloads: 2,
  linkDownloadReferer: true,
  devWorkspace: '',
  theme: DEFAULT_THEME,
  language: DEFAULT_LANGUAGE,
  enabledExtensions: DEFAULT_ENABLED_EXTENSIONS,
});

/** Extensions de fichiers considérées comme des médias suivis. */
const MEDIA_EXTENSIONS = Object.freeze(
  new Set([
    'mp4',
    'webm',
    'mkv',
    'mov',
    'm3u8',
    'mpd',
    'mp3',
    'm4a',
    'aac',
    'ogg',
    'wav',
    'flac',
  ]),
);

/**
 * Extensions de fichiers que Chromium peut télécharger directement. Cette
 * liste sert au dialogue « Télécharger par lien » : une URL qui se termine par
 * l'une de ces extensions ne doit pas être bloquée par une requête HEAD
 * préalable. Les manifestes HLS/DASH sont volontairement absents.
 */
const DIRECT_DOWNLOAD_EXTENSIONS = Object.freeze(
  new Set([
    'mp4',
    'm4v',
    'webm',
    'mkv',
    'mov',
    'ogv',
    'mp3',
    'm4a',
    'aac',
    'ogg',
    'oga',
    'wav',
    'flac',
    'opus',
    'zip',
    '7z',
    'rar',
    'tar',
    'gz',
    'tgz',
    'bz2',
    'xz',
    'pdf',
    'epub',
    'mobi',
    'azw3',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'odt',
    'ods',
    'odp',
    'rtf',
    'txt',
    'csv',
    'iso',
    'img',
    'dmg',
    'pkg',
    'deb',
    'rpm',
    'apk',
    'exe',
    'msi',
    'bin',
    'torrent',
  ]),
);

/**
 * Taille minimale d'un fichier média direct. Les sons d'interface et les
 * ressources décoratives pèsent généralement quelques kilo-octets ; ce seuil
 * évite de les faire apparaître dans le panneau des médias.
 */
const MIN_MEDIA_SIZE_BYTES = 64 * 1024;

/** Extensions de manifestes de streaming assemblés par ffmpeg. */
const STREAM_EXTENSIONS = Object.freeze(new Set(['m3u8', 'mpd']));

/** Type de flux associé à une extension de manifeste. */
const STREAM_TYPES = Object.freeze({
  m3u8: 'hls',
  mpd: 'dash',
});

/** Extensions de fichiers pouvant être importées dans la médiathèque. */
const LIBRARY_MEDIA_EXTENSIONS = Object.freeze(
  new Set([
    'mp4',
    'm4v',
    'webm',
    'mkv',
    'mov',
    'ogv',
    'mp3',
    'm4a',
    'aac',
    'ogg',
    'oga',
    'wav',
    'flac',
    'opus',
  ]),
);

/** Types MIME utilisés par le protocole local de lecture. */
const MEDIA_MIME_TYPES = Object.freeze({
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  opus: 'audio/ogg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
});

/** Nombre par défaut de téléchargements ffmpeg simultanés. */
const MAX_STREAM_DOWNLOADS = 2;
const MIN_STREAM_DOWNLOADS = 1;
const MAX_STREAM_DOWNLOADS_LIMIT = 4;

/**
 * Permissions accordées aux pages HTTP(S) sans demander l'avis de
 * l'utilisateur. Les permissions sensibles passent par une demande explicite.
 */
const ALLOWED_PAGE_PERMISSIONS = Object.freeze(
  new Set([
    'fullscreen',
    'pointerLock',
    'clipboard-sanitized-write',
    'screen-wake-lock',
    // Le stockage persistant ne donne pas accès aux données d'un autre site :
    // il demande seulement à Chromium de ne pas évincer l'origine. Les
    // applications web complexes (éditeurs, jeux, PWA) en ont besoin pour
    // conserver leurs données hors ligne sans bloquer leur démarrage.
    'persistent-storage',
  ]),
);

/**
 * Permissions sensibles pouvant être accordées site par site après confirmation
 * de l'utilisateur. Les autres permissions sensibles restent refusées.
 *
 * Cette liste couvre les API utilisées par les applications web courantes
 * (visioconférence, cartes, stockage, polices, gestion multi-écrans). Les
 * périphériques bruts (USB, HID, série) et la capture d'écran restent refusés.
 */
const PROMPTABLE_PAGE_PERMISSIONS = Object.freeze(
  new Set([
    'media',
    'geolocation',
    'geolocation-approximate',
    'notifications',
    // Nécessaire à la lecture de contenus protégés par DRM (YouTube, services
    // de VOD). La permission est demandée à l'utilisateur pour les sites non
    // reconnus et accordée automatiquement aux origines média de confiance.
    'mediaKeySystem',
    'midi',
    'midiSysex',
    'clipboard-read',
    'idle-detection',
    'local-fonts',
    'window-management',
    'speaker-selection',
    'storage-access',
    'top-level-storage-access',
    'fileSystem',
    'background-sync',
    'periodic-background-sync',
    'sensors',
    'vr',
    'nfc',
    'web-printing',
    'keyboardLock',
    'system-wake-lock',
    'local-network-access',
  ]),
);

/** Protocoles autorisés pour la navigation des webviews. */
const ALLOWED_URL_PROTOCOLS = Object.freeze(new Set(['http:', 'https:']));

/** Limites et temporisations communes. */
const HISTORY_LIMIT = 600;
const HISTORY_SAVE_DELAY = 400;
const DOWNLOAD_PROGRESS_THROTTLE = 180;
const DOWNLOAD_STORE_SAVE_DELAY = 500;
const LIBRARY_STORE_SAVE_DELAY = 500;
const LIBRARY_LIMIT = 1000;
const FFMPEG_PROBE_TIMEOUT = 25_000;
const SETTINGS_STATUS_TIMEOUT = 3600;
const MAX_HISTORY_TITLE_LENGTH = 300;
const MAX_TAB_TITLE_LENGTH = 180;
const MAX_CLOSED_TABS = 25;
const MAX_SESSION_TABS = 80;
const MAX_SESSION_WINDOWS = 10;
const SESSION_SAVE_DELAY = 250;
const DEFAULT_ZOOM = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
const ADBLOCK_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

module.exports = {
  ABOUT_PAGE_LABELS,
  ABOUT_PAGE_URLS,
  ADBLOCK_CACHE_MAX_AGE,
  ALLOWED_PAGE_PERMISSIONS,
  ALLOWED_URL_PROTOCOLS,
  APP_ID,
  APP_NAME,
  DEFAULT_SEARCH_ENGINE,
  DEFAULT_SETTINGS,
  DEFAULT_ZOOM,
  DIRECT_DOWNLOAD_EXTENSIONS,
  DOWNLOAD_PROGRESS_THROTTLE,
  DOWNLOAD_STORE_SAVE_DELAY,
  FFMPEG_PROBE_TIMEOUT,
  HISTORY_LIMIT,
  HISTORY_SAVE_DELAY,
  HOME_HOST,
  HOME_PAGE_MODES,
  HOME_PAGE_MODE_KEYS,
  HOME_PATH,
  HOME_SCHEME,
  HOME_URL,
  IPC,
  IPC_EVENTS,
  LIBRARY_LIMIT,
  LIBRARY_MEDIA_EXTENSIONS,
  LIBRARY_STORE_SAVE_DELAY,
  MAX_CLOSED_TABS,
  MAX_HISTORY_TITLE_LENGTH,
  MAX_SESSION_TABS,
  MAX_SESSION_WINDOWS,
  MAX_STREAM_DOWNLOADS,
  MAX_STREAM_DOWNLOADS_LIMIT,
  MAX_TAB_TITLE_LENGTH,
  MAX_ZOOM,
  MEDIA_EXTENSIONS,
  MEDIA_MIME_TYPES,
  MIN_MEDIA_SIZE_BYTES,
  MIN_STREAM_DOWNLOADS,
  MIN_ZOOM,
  PAGE_HOSTS,
  PAGE_SCHEME,
  PAGE_URLS,
  PROMPTABLE_PAGE_PERMISSIONS,
  SEARCH_ENGINES,
  SEARCH_ENGINE_KEYS,
  SESSION_SAVE_DELAY,
  SETTINGS_STATUS_TIMEOUT,
  SHORTCUT_ACTIONS,
  STREAM_EXTENSIONS,
  STREAM_TYPES,
  WINDOW_DEFAULTS,
  ZOOM_PRESETS,
  ZOOM_STEP,
};
