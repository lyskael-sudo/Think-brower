"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/renderer/js/partials.js
  var require_partials = __commonJS({
    "src/renderer/js/partials.js"(exports, module) {
      "use strict";
      var bridge = window.thinkBridge;
      if (!bridge) {
        throw new Error(
          "Pont IPC indisponible : le preload du renderer n\u2019a pas \xE9t\xE9 charg\xE9."
        );
      }
      async function replacePartial(placeholder) {
        const key = placeholder.dataset.partial || "";
        if (!key) {
          throw new Error("Fragment HTML sans nom.");
        }
        const markup = bridge.readPartial(key);
        const template = document.createElement("template");
        template.innerHTML = markup.trim();
        if (template.content.childElementCount === 0) {
          throw new Error(`Fragment HTML vide : \xAB ${key} \xBB.`);
        }
        placeholder.replaceWith(template.content);
      }
      async function loadPartials2(documentRoot = document) {
        const placeholders = Array.from(
          documentRoot.querySelectorAll("[data-partial]")
        );
        if (placeholders.length === 0) {
          throw new Error("Aucun point d\u2019ancrage de fragment HTML trouv\xE9.");
        }
        await Promise.all(placeholders.map(replacePartial));
      }
      module.exports = { loadPartials: loadPartials2 };
    }
  });

  // src/shared/extensions.js
  var require_extensions = __commonJS({
    "src/shared/extensions.js"(exports, module) {
      "use strict";
      var EXTENSION_IDS = Object.freeze({
        THEME: "think.theme",
        LANGUAGE: "think.language"
      });
      var THEMES = Object.freeze({
        dark: Object.freeze({
          id: "dark",
          label: "Sombre",
          description: "Th\xE8me sombre bleu historique de Think-Browser.",
          colorScheme: "dark"
        }),
        light: Object.freeze({
          id: "light",
          label: "Clair",
          description: "Interface claire \xE0 contraste \xE9lev\xE9 pour les environnements lumineux.",
          colorScheme: "light"
        }),
        midnight: Object.freeze({
          id: "midnight",
          label: "Minuit",
          description: "Variante tr\xE8s sombre aux accents violets.",
          colorScheme: "dark"
        })
      });
      var LANGUAGES = Object.freeze({
        fr: Object.freeze({
          id: "fr",
          label: "Fran\xE7ais",
          locale: "fr-FR",
          description: "Langue par d\xE9faut de Think-Browser."
        }),
        en: Object.freeze({
          id: "en",
          label: "English",
          locale: "en-US",
          description: "Traduction anglaise du chrome et des panneaux principaux."
        })
      });
      var THEME_KEYS = Object.freeze(Object.keys(THEMES));
      var LANGUAGE_KEYS = Object.freeze(Object.keys(LANGUAGES));
      var DEFAULT_THEME = "dark";
      var DEFAULT_LANGUAGE = "fr";
      var BUILT_IN_EXTENSIONS = Object.freeze([
        Object.freeze({
          id: EXTENSION_IDS.THEME,
          name: "Th\xE8mes Think",
          version: "1.0.0",
          type: "theme",
          description: "Change l\u2019apparence de l\u2019interface h\xF4te sans modifier le contenu des pages web.",
          permissions: Object.freeze(["ui.theme"]),
          options: Object.freeze(
            THEME_KEYS.map((key) => Object.freeze({ ...THEMES[key] }))
          ),
          defaultOption: DEFAULT_THEME
        }),
        Object.freeze({
          id: EXTENSION_IDS.LANGUAGE,
          name: "Langues Think",
          version: "1.0.0",
          type: "language",
          description: "Traduit progressivement le chrome, les menus et les panneaux principaux.",
          permissions: Object.freeze(["ui.language"]),
          options: Object.freeze(
            LANGUAGE_KEYS.map((key) => Object.freeze({ ...LANGUAGES[key] }))
          ),
          defaultOption: DEFAULT_LANGUAGE
        })
      ]);
      var EXTENSION_KEYS = Object.freeze(
        BUILT_IN_EXTENSIONS.map((extension) => extension.id)
      );
      var DEFAULT_ENABLED_EXTENSIONS = Object.freeze([
        EXTENSION_IDS.THEME,
        EXTENSION_IDS.LANGUAGE
      ]);
      function isExtensionId(id) {
        return typeof id === "string" && EXTENSION_KEYS.includes(id);
      }
      function normalizeEnabledExtensions(value, fallback = DEFAULT_ENABLED_EXTENSIONS) {
        const source = Array.isArray(value) ? value : fallback;
        const enabled = [];
        for (const id of source) {
          if (isExtensionId(id) && !enabled.includes(id)) {
            enabled.push(id);
          }
        }
        return enabled;
      }
      function isExtensionEnabled(enabledExtensions, id) {
        return Array.isArray(enabledExtensions) && enabledExtensions.includes(id);
      }
      module.exports = {
        BUILT_IN_EXTENSIONS,
        DEFAULT_ENABLED_EXTENSIONS,
        DEFAULT_LANGUAGE,
        DEFAULT_THEME,
        EXTENSION_IDS,
        EXTENSION_KEYS,
        LANGUAGES,
        LANGUAGE_KEYS,
        THEMES,
        THEME_KEYS,
        isExtensionEnabled,
        isExtensionId,
        normalizeEnabledExtensions
      };
    }
  });

  // src/shared/constants.js
  var require_constants = __commonJS({
    "src/shared/constants.js"(exports, module) {
      "use strict";
      var {
        DEFAULT_ENABLED_EXTENSIONS,
        DEFAULT_LANGUAGE,
        DEFAULT_THEME
      } = require_extensions();
      var APP_NAME = "Think-Browser";
      var APP_ID = "com.thinkbrowser.app";
      var WINDOW_DEFAULTS = Object.freeze({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: "#0b0f14"
      });
      var IPC = Object.freeze({
        // Paramètres et confidentialité.
        SETTINGS_GET: "settings:get",
        SETTINGS_UPDATE: "settings:update",
        SETTINGS_CHOOSE_DOWNLOAD_DIR: "settings:choose-download-dir",
        BROWSING_DATA_CLEAR: "browsing-data:clear",
        // Extensions internes.
        EXTENSIONS_GET: "extensions:get",
        EXTENSIONS_SET_ENABLED: "extensions:set-enabled",
        EXTENSIONS_SET_THEME: "extensions:set-theme",
        EXTENSIONS_SET_LANGUAGE: "extensions:set-language",
        // Historique.
        HISTORY_LIST: "history:list",
        HISTORY_CLEAR: "history:clear",
        // Session.
        SESSION_GET: "session:get",
        SESSION_SAVE: "session:save",
        // Favoris.
        FAVORITES_LIST: "favorites:list",
        FAVORITES_TOGGLE: "favorites:toggle",
        FAVORITES_REMOVE: "favorites:remove",
        FAVORITE_FOLDERS_LIST: "favorites:folders:list",
        FAVORITE_FOLDER_CREATE: "favorites:folders:create",
        FAVORITE_FOLDER_DELETE: "favorites:folders:delete",
        FAVORITE_MOVE: "favorites:move",
        FAVORITES_IMPORT: "favorites:import",
        FAVORITES_EXPORT: "favorites:export",
        // Permissions par site.
        PERMISSIONS_RESET: "permissions:reset",
        // Blocage publicitaire.
        ADBLOCK_STATS_GET: "adblock:stats:get",
        // Téléchargements.
        DOWNLOADS_LIST: "downloads:list",
        DOWNLOADS_INSPECT_URL: "downloads:inspect-url",
        DOWNLOADS_START_URL: "downloads:start-url",
        DOWNLOADS_SHOW_IN_FOLDER: "downloads:show-in-folder",
        DOWNLOADS_RETRY: "downloads:retry",
        DOWNLOADS_CANCEL: "downloads:cancel",
        DOWNLOADS_RESUME: "downloads:resume",
        DOWNLOADS_STOP: "downloads:stop",
        // Médias.
        MEDIA_LIST: "media:list",
        MEDIA_DOWNLOAD: "media:download",
        MEDIA_DOWNLOAD_MERGED: "media:download-merged",
        MEDIA_PREPARE: "media:prepare",
        MEDIA_CAPABILITIES: "media:capabilities",
        MEDIA_EXTRACT: "media:extract",
        // Médiathèque.
        LIBRARY_LIST: "library:list",
        LIBRARY_IMPORT: "library:import",
        LIBRARY_REMOVE: "library:remove",
        LIBRARY_RENAME: "library:rename",
        LIBRARY_REVEAL: "library:reveal",
        LIBRARY_PLAYBACK: "library:playback",
        // Application et fenêtres.
        APP_INFO: "app:info",
        WINDOW_NEW: "window:new",
        WINDOW_NEW_PRIVATE: "window:new-private",
        WINDOW_GET_FULLSCREEN: "window:get-fullscreen",
        WINDOW_SET_FULLSCREEN: "window:set-fullscreen",
        APP_DEVTOOLS_TOGGLE: "devtools:app",
        // Événements du processus principal vers le renderer.
        SETTINGS_UPDATED: "settings:updated",
        HISTORY_UPDATED: "history:updated",
        FAVORITES_UPDATED: "favorites:updated",
        FAVORITE_FOLDERS_UPDATED: "favorites:folders:updated",
        PERMISSIONS_UPDATED: "permissions:updated",
        ADBLOCK_STATS_UPDATED: "adblock:stats:updated",
        MEDIA_DETECTED: "media:detected",
        DOWNLOAD_STARTED: "download:started",
        DOWNLOAD_UPDATED: "download:updated",
        DOWNLOAD_DONE: "download:done",
        LIBRARY_UPDATED: "library:updated",
        BROWSING_DATA_CLEARED: "browsing-data:cleared",
        OPEN_URL_IN_NEW_TAB: "browser:open-url-in-new-tab",
        WINDOW_FULLSCREEN_CHANGED: "window:fullscreen-changed",
        SHORTCUT: "browser:shortcut",
        APP_NOTIFICATION: "app:notification"
      });
      var IPC_EVENTS = Object.freeze([
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
        IPC.APP_NOTIFICATION
      ]);
      var SHORTCUT_ACTIONS = Object.freeze({
        NEW_TAB: "new-tab",
        NEW_PRIVATE_WINDOW: "new-private-window",
        HOME_PAGE: "home-page",
        CLOSE_TAB: "close-tab",
        REOPEN_TAB: "reopen-tab",
        RELOAD: "reload",
        FIND_IN_PAGE: "find-in-page",
        FIND_NEXT: "find-next",
        FIND_PREVIOUS: "find-previous",
        ZOOM_IN: "zoom-in",
        ZOOM_OUT: "zoom-out",
        ZOOM_RESET: "zoom-reset",
        TOGGLE_PAGE_DEVTOOLS: "toggle-devtools",
        FOCUS_ADDRESS: "focus-address"
      });
      var SEARCH_ENGINES = Object.freeze({
        google: Object.freeze({
          label: "Google",
          homeUrl: "https://www.google.com/",
          searchUrl: "https://www.google.com/search?q="
        }),
        duckduckgo: Object.freeze({
          label: "DuckDuckGo",
          homeUrl: "https://duckduckgo.com/",
          searchUrl: "https://duckduckgo.com/?q="
        }),
        bing: Object.freeze({
          label: "Bing",
          homeUrl: "https://www.bing.com/",
          searchUrl: "https://www.bing.com/search?q="
        })
      });
      var SEARCH_ENGINE_KEYS = Object.freeze(Object.keys(SEARCH_ENGINES));
      var DEFAULT_SEARCH_ENGINE = "google";
      var HOME_SCHEME = "think-home";
      var HOME_HOST = "start";
      var HOME_PATH = "/";
      var HOME_URL = `${HOME_SCHEME}://${HOME_HOST}${HOME_PATH}`;
      var PAGE_SCHEME = "think-page";
      var PAGE_HOSTS = Object.freeze({
        CONFIG: "config",
        SECURITY: "security",
        DEV: "dev"
      });
      var PAGE_URLS = Object.freeze({
        config: `${PAGE_SCHEME}://${PAGE_HOSTS.CONFIG}/`,
        security: `${PAGE_SCHEME}://${PAGE_HOSTS.SECURITY}/`,
        dev: `${PAGE_SCHEME}://${PAGE_HOSTS.DEV}/`
      });
      var ABOUT_PAGE_URLS = Object.freeze({
        "about:config": PAGE_URLS.config,
        "about:security": PAGE_URLS.security,
        "about:dev": PAGE_URLS.dev
      });
      var ABOUT_PAGE_LABELS = Object.freeze(
        Object.fromEntries(
          Object.entries(ABOUT_PAGE_URLS).map(([label, url]) => [url, label])
        )
      );
      var HOME_PAGE_MODES = Object.freeze({
        BUILTIN: "builtin",
        CUSTOM: "custom"
      });
      var HOME_PAGE_MODE_KEYS = Object.freeze(Object.values(HOME_PAGE_MODES));
      var ZOOM_PRESETS = Object.freeze([0.75, 0.9, 1, 1.1, 1.25, 1.5]);
      var DEFAULT_SETTINGS = Object.freeze({
        searchEngine: DEFAULT_SEARCH_ENGINE,
        adBlockEnabled: true,
        homePageMode: HOME_PAGE_MODES.BUILTIN,
        homePageUrl: "",
        restoreSession: true,
        saveHistory: true,
        defaultZoom: 1,
        maxStreamDownloads: 2,
        linkDownloadReferer: true,
        devWorkspace: "",
        theme: DEFAULT_THEME,
        language: DEFAULT_LANGUAGE,
        enabledExtensions: DEFAULT_ENABLED_EXTENSIONS
      });
      var MEDIA_EXTENSIONS = Object.freeze(
        /* @__PURE__ */ new Set([
          "mp4",
          "webm",
          "mkv",
          "mov",
          "m3u8",
          "mpd",
          "mp3",
          "m4a",
          "aac",
          "ogg",
          "wav",
          "flac"
        ])
      );
      var DIRECT_DOWNLOAD_EXTENSIONS = Object.freeze(
        /* @__PURE__ */ new Set([
          "mp4",
          "m4v",
          "webm",
          "mkv",
          "mov",
          "ogv",
          "mp3",
          "m4a",
          "aac",
          "ogg",
          "oga",
          "wav",
          "flac",
          "opus",
          "zip",
          "7z",
          "rar",
          "tar",
          "gz",
          "tgz",
          "bz2",
          "xz",
          "pdf",
          "epub",
          "mobi",
          "azw3",
          "doc",
          "docx",
          "xls",
          "xlsx",
          "ppt",
          "pptx",
          "odt",
          "ods",
          "odp",
          "rtf",
          "txt",
          "csv",
          "iso",
          "img",
          "dmg",
          "pkg",
          "deb",
          "rpm",
          "apk",
          "exe",
          "msi",
          "bin",
          "torrent"
        ])
      );
      var MIN_MEDIA_SIZE_BYTES = 64 * 1024;
      var STREAM_EXTENSIONS = Object.freeze(/* @__PURE__ */ new Set(["m3u8", "mpd"]));
      var STREAM_TYPES = Object.freeze({
        m3u8: "hls",
        mpd: "dash"
      });
      var LIBRARY_MEDIA_EXTENSIONS = Object.freeze(
        /* @__PURE__ */ new Set([
          "mp4",
          "m4v",
          "webm",
          "mkv",
          "mov",
          "ogv",
          "mp3",
          "m4a",
          "aac",
          "ogg",
          "oga",
          "wav",
          "flac",
          "opus"
        ])
      );
      var MEDIA_MIME_TYPES = Object.freeze({
        mp4: "video/mp4",
        m4v: "video/mp4",
        webm: "video/webm",
        mkv: "video/x-matroska",
        mov: "video/quicktime",
        ogv: "video/ogg",
        mp3: "audio/mpeg",
        m4a: "audio/mp4",
        aac: "audio/aac",
        ogg: "audio/ogg",
        oga: "audio/ogg",
        wav: "audio/wav",
        flac: "audio/flac",
        opus: "audio/ogg",
        jpg: "image/jpeg",
        jpeg: "image/jpeg"
      });
      var MAX_STREAM_DOWNLOADS = 2;
      var MIN_STREAM_DOWNLOADS = 1;
      var MAX_STREAM_DOWNLOADS_LIMIT = 4;
      var ALLOWED_PAGE_PERMISSIONS = Object.freeze(
        /* @__PURE__ */ new Set([
          "fullscreen",
          "pointerLock",
          "clipboard-sanitized-write",
          "screen-wake-lock",
          // Le stockage persistant ne donne pas accès aux données d'un autre site :
          // il demande seulement à Chromium de ne pas évincer l'origine. Les
          // applications web complexes (éditeurs, jeux, PWA) en ont besoin pour
          // conserver leurs données hors ligne sans bloquer leur démarrage.
          "persistent-storage"
        ])
      );
      var PROMPTABLE_PAGE_PERMISSIONS = Object.freeze(
        /* @__PURE__ */ new Set([
          "media",
          "geolocation",
          "geolocation-approximate",
          "notifications",
          // Nécessaire à la lecture de contenus protégés par DRM (YouTube, services
          // de VOD). La permission est demandée à l'utilisateur pour les sites non
          // reconnus et accordée automatiquement aux origines média de confiance.
          "mediaKeySystem",
          "midi",
          "midiSysex",
          "clipboard-read",
          "idle-detection",
          "local-fonts",
          "window-management",
          "speaker-selection",
          "storage-access",
          "top-level-storage-access",
          "fileSystem",
          "background-sync",
          "periodic-background-sync",
          "sensors",
          "vr",
          "nfc",
          "web-printing",
          "keyboardLock",
          "system-wake-lock",
          "local-network-access"
        ])
      );
      var ALLOWED_URL_PROTOCOLS = Object.freeze(/* @__PURE__ */ new Set(["http:", "https:"]));
      var HISTORY_LIMIT = 600;
      var HISTORY_SAVE_DELAY = 400;
      var DOWNLOAD_PROGRESS_THROTTLE = 180;
      var DOWNLOAD_STORE_SAVE_DELAY = 500;
      var LIBRARY_STORE_SAVE_DELAY = 500;
      var LIBRARY_LIMIT = 1e3;
      var FFMPEG_PROBE_TIMEOUT = 25e3;
      var SETTINGS_STATUS_TIMEOUT = 3600;
      var MAX_HISTORY_TITLE_LENGTH = 300;
      var MAX_TAB_TITLE_LENGTH = 180;
      var MAX_CLOSED_TABS = 25;
      var MAX_SESSION_TABS = 80;
      var MAX_SESSION_WINDOWS = 10;
      var SESSION_SAVE_DELAY = 250;
      var DEFAULT_ZOOM = 1;
      var MIN_ZOOM = 0.5;
      var MAX_ZOOM = 3;
      var ZOOM_STEP = 0.1;
      var ADBLOCK_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1e3;
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
        ZOOM_STEP
      };
    }
  });

  // src/renderer/js/api.js
  var require_api = __commonJS({
    "src/renderer/js/api.js"(exports, module) {
      "use strict";
      var { IPC, IPC_EVENTS } = require_constants();
      var bridge = window.thinkBridge;
      if (!bridge) {
        throw new Error(
          "Pont IPC indisponible : le preload du renderer n\u2019a pas \xE9t\xE9 charg\xE9."
        );
      }
      var EVENT_CHANNELS = new Set(IPC_EVENTS);
      var api = {
        // Paramètres et confidentialité.
        getSettings: () => bridge.invoke(IPC.SETTINGS_GET),
        updateSettings: (patch) => bridge.invoke(IPC.SETTINGS_UPDATE, patch),
        chooseDownloadDir: () => bridge.invoke(IPC.SETTINGS_CHOOSE_DOWNLOAD_DIR),
        clearBrowsingData: () => bridge.invoke(IPC.BROWSING_DATA_CLEAR),
        // Extensions internes.
        getExtensions: () => bridge.invoke(IPC.EXTENSIONS_GET),
        setExtensionEnabled: (id, enabled) => bridge.invoke(IPC.EXTENSIONS_SET_ENABLED, id, enabled),
        setTheme: (theme) => bridge.invoke(IPC.EXTENSIONS_SET_THEME, theme),
        setLanguage: (language) => bridge.invoke(IPC.EXTENSIONS_SET_LANGUAGE, language),
        // Historique.
        listHistory: () => bridge.invoke(IPC.HISTORY_LIST),
        clearHistory: () => bridge.invoke(IPC.HISTORY_CLEAR),
        // Session.
        getSession: () => bridge.invoke(IPC.SESSION_GET),
        saveSession: (state) => bridge.send(IPC.SESSION_SAVE, state),
        // Favoris.
        listFavorites: () => bridge.invoke(IPC.FAVORITES_LIST),
        toggleFavorite: (payload) => bridge.invoke(IPC.FAVORITES_TOGGLE, payload),
        removeFavorite: (favoriteId) => bridge.invoke(IPC.FAVORITES_REMOVE, favoriteId),
        listFavoriteFolders: () => bridge.invoke(IPC.FAVORITE_FOLDERS_LIST),
        createFavoriteFolder: (name) => bridge.invoke(IPC.FAVORITE_FOLDER_CREATE, name),
        deleteFavoriteFolder: (folderId) => bridge.invoke(IPC.FAVORITE_FOLDER_DELETE, folderId),
        moveFavorite: (favoriteId, folderId) => bridge.invoke(IPC.FAVORITE_MOVE, favoriteId, folderId),
        importFavorites: () => bridge.invoke(IPC.FAVORITES_IMPORT),
        exportFavorites: () => bridge.invoke(IPC.FAVORITES_EXPORT),
        resetSitePermissions: () => bridge.invoke(IPC.PERMISSIONS_RESET),
        getAdBlockStats: (guestId) => bridge.invoke(IPC.ADBLOCK_STATS_GET, guestId),
        // Téléchargements et médias.
        listDownloads: () => bridge.invoke(IPC.DOWNLOADS_LIST),
        inspectUrl: (payload) => bridge.invoke(IPC.DOWNLOADS_INSPECT_URL, payload),
        downloadUrl: (payload) => bridge.invoke(IPC.DOWNLOADS_START_URL, payload),
        showDownloadInFolder: (downloadId) => bridge.invoke(IPC.DOWNLOADS_SHOW_IN_FOLDER, downloadId),
        retryDownload: (downloadId) => bridge.invoke(IPC.DOWNLOADS_RETRY, downloadId),
        cancelDownload: (downloadId) => bridge.invoke(IPC.DOWNLOADS_CANCEL, downloadId),
        resumeDownload: (downloadId) => bridge.invoke(IPC.DOWNLOADS_RESUME, downloadId),
        stopDownload: (downloadId) => bridge.invoke(IPC.DOWNLOADS_STOP, downloadId),
        listMedia: () => bridge.invoke(IPC.MEDIA_LIST),
        getMediaCapabilities: () => bridge.invoke(IPC.MEDIA_CAPABILITIES),
        downloadMedia: (payload) => bridge.invoke(IPC.MEDIA_DOWNLOAD, payload),
        downloadMergedMedia: (payload) => bridge.invoke(IPC.MEDIA_DOWNLOAD_MERGED, payload),
        prepareMedia: (payload) => bridge.invoke(IPC.MEDIA_PREPARE, payload),
        extractPageMedia: (webContentsId) => bridge.invoke(IPC.MEDIA_EXTRACT, webContentsId),
        // Médiathèque.
        listLibrary: () => bridge.invoke(IPC.LIBRARY_LIST),
        importLibraryFiles: () => bridge.invoke(IPC.LIBRARY_IMPORT),
        removeLibraryEntry: (id, deleteFile = false) => bridge.invoke(IPC.LIBRARY_REMOVE, { id, deleteFile }),
        renameLibraryEntry: (id, name) => bridge.invoke(IPC.LIBRARY_RENAME, { id, name }),
        revealLibraryEntry: (id) => bridge.invoke(IPC.LIBRARY_REVEAL, id),
        updateLibraryPlayback: (id, position) => bridge.invoke(IPC.LIBRARY_PLAYBACK, { id, position }),
        // Application et fenêtres.
        getAppInfo: () => bridge.invoke(IPC.APP_INFO),
        openNewWindow: () => bridge.send(IPC.WINDOW_NEW),
        openNewPrivateWindow: () => bridge.send(IPC.WINDOW_NEW_PRIVATE),
        isWindowFullscreen: () => bridge.invoke(IPC.WINDOW_GET_FULLSCREEN),
        setWindowFullscreen: (enabled) => bridge.invoke(IPC.WINDOW_SET_FULLSCREEN, Boolean(enabled)),
        toggleAppDevTools: () => bridge.invoke(IPC.APP_DEVTOOLS_TOGGLE),
        /**
         * S'abonne à un événement du processus principal.
         * @param {string} channel
         * @param {(payload: unknown) => void} listener
         * @returns {() => void} Fonction de désabonnement.
         */
        on(channel, listener) {
          if (!EVENT_CHANNELS.has(channel)) {
            throw new Error(`Canal d\u2019\xE9v\xE9nement inconnu : ${channel}`);
          }
          if (typeof listener !== "function") {
            throw new Error("Le listener IPC doit \xEAtre une fonction.");
          }
          return bridge.on(channel, listener);
        }
      };
      module.exports = { api };
    }
  });

  // src/shared/utils.js
  var require_utils = __commonJS({
    "src/shared/utils.js"(exports, module) {
      "use strict";
      var {
        ABOUT_PAGE_LABELS,
        ABOUT_PAGE_URLS,
        ALLOWED_URL_PROTOCOLS,
        DEFAULT_SEARCH_ENGINE,
        DIRECT_DOWNLOAD_EXTENSIONS,
        HOME_HOST,
        HOME_SCHEME,
        HOME_URL,
        MAX_HISTORY_TITLE_LENGTH,
        PAGE_HOSTS,
        PAGE_SCHEME,
        SEARCH_ENGINES,
        SEARCH_ENGINE_KEYS,
        STREAM_TYPES
      } = require_constants();
      function isHttpUrl(value) {
        if (typeof value !== "string" || !value.trim()) {
          return false;
        }
        try {
          const { protocol } = new URL(value);
          return ALLOWED_URL_PROTOCOLS.has(protocol);
        } catch {
          return false;
        }
      }
      function hasUrlCredentials(value) {
        if (!isHttpUrl(value)) {
          return false;
        }
        try {
          const parsed = new URL(value);
          return Boolean(parsed.username || parsed.password);
        } catch {
          return true;
        }
      }
      function isSafeHttpUrl(value) {
        return isHttpUrl(value) && !hasUrlCredentials(value);
      }
      function isHomeUrl(value) {
        if (typeof value !== "string" || !value.trim()) {
          return false;
        }
        try {
          const parsed = new URL(value);
          return parsed.protocol === `${HOME_SCHEME}:` && parsed.hostname === HOME_HOST && !parsed.username && !parsed.password && !parsed.port;
        } catch {
          return false;
        }
      }
      function isInternalPageUrl(value) {
        if (typeof value !== "string" || !value.trim()) {
          return false;
        }
        try {
          const parsed = new URL(value);
          const hosts = Object.values(PAGE_HOSTS);
          return parsed.protocol === `${PAGE_SCHEME}:` && hosts.includes(parsed.hostname) && !parsed.username && !parsed.password && !parsed.port && (parsed.pathname === "/" || parsed.pathname === "/index.html");
        } catch {
          return false;
        }
      }
      function resolveAboutPageUrl(value) {
        if (typeof value !== "string") {
          return null;
        }
        const match = value.trim().toLowerCase().match(/^about:([a-z0-9-]+)\/?(?:[?#].*)?$/);
        if (!match) {
          return null;
        }
        return ABOUT_PAGE_URLS[`about:${match[1]}`] || null;
      }
      function getAboutPageLabel(value) {
        if (!isInternalPageUrl(value)) {
          return null;
        }
        try {
          const parsed = new URL(value);
          const normalized = `${parsed.protocol}//${parsed.hostname}/`;
          if (ABOUT_PAGE_LABELS[normalized]) {
            return ABOUT_PAGE_LABELS[normalized];
          }
        } catch {
        }
        return null;
      }
      function isTabUrl(value) {
        return isSafeHttpUrl(value) || isHomeUrl(value) || isInternalPageUrl(value);
      }
      function getUrlExtension(value) {
        if (!isHttpUrl(value)) {
          return "";
        }
        try {
          const pathname = new URL(value).pathname;
          const filename = pathname.split("/").filter(Boolean).pop() || "";
          const dot = filename.lastIndexOf(".");
          if (dot <= 0 || dot === filename.length - 1) {
            return "";
          }
          return filename.slice(dot + 1).toLowerCase();
        } catch {
          return "";
        }
      }
      function isDirectFileUrl(value) {
        const extension = getUrlExtension(value);
        if (!extension) {
          return false;
        }
        return DIRECT_DOWNLOAD_EXTENSIONS.has(extension) && !getStreamType(extension);
      }
      function getFilenameFromUrl(value, fallback = "telechargement") {
        if (!isHttpUrl(value)) {
          return fallback;
        }
        try {
          const pathname = new URL(value).pathname;
          const candidate = pathname.split("/").filter(Boolean).pop() || "";
          try {
            return sanitizeFilename(decodeURIComponent(candidate)) || fallback;
          } catch {
            return sanitizeFilename(candidate) || fallback;
          }
        } catch {
          return fallback;
        }
      }
      function buildHomeUrl(searchEngineKey = DEFAULT_SEARCH_ENGINE) {
        const engine = SEARCH_ENGINE_KEYS.includes(searchEngineKey) ? searchEngineKey : DEFAULT_SEARCH_ENGINE;
        const url = new URL(HOME_URL);
        url.searchParams.set("engine", engine);
        return url.toString();
      }
      function getHostname(url) {
        if (isHomeUrl(url)) {
          return "Page d\u2019accueil";
        }
        try {
          return new URL(url).hostname.replace(/^www\./i, "") || "source inconnue";
        } catch {
          return "source inconnue";
        }
      }
      function looksLikeHost(value) {
        if (/\s/.test(value)) {
          return false;
        }
        if (/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(?::\d+)?(?:\/.*)?$/i.test(
          value
        )) {
          return true;
        }
        if (/^\[[0-9a-f:]+\](?::\d+)?(?:\/.*)?$/i.test(value)) {
          return true;
        }
        return value.includes(".");
      }
      function getSearchEngine(key = DEFAULT_SEARCH_ENGINE) {
        return SEARCH_ENGINES[key] || SEARCH_ENGINES[DEFAULT_SEARCH_ENGINE];
      }
      function getStreamType(extension) {
        if (typeof extension !== "string") {
          return null;
        }
        return STREAM_TYPES[extension.trim().toLowerCase()] || null;
      }
      function formatDuration(seconds) {
        const total = Math.round(Number(seconds));
        if (!Number.isFinite(total) || total <= 0) {
          return "";
        }
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor(total % 3600 / 60);
        const remainingSeconds = total % 60;
        const paddedSeconds = String(remainingSeconds).padStart(2, "0");
        if (hours > 0) {
          return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
        }
        return `${minutes}:${paddedSeconds}`;
      }
      function resolveNavigationTarget(rawValue, searchEngineKey = DEFAULT_SEARCH_ENGINE) {
        const value = typeof rawValue === "string" ? rawValue.trim() : "";
        if (!value) {
          return null;
        }
        if (/^https?:\/\//i.test(value)) {
          return isSafeHttpUrl(value) ? value : null;
        }
        const aboutPageUrl = resolveAboutPageUrl(value);
        if (aboutPageUrl) {
          return aboutPageUrl;
        }
        if (isInternalPageUrl(value)) {
          return value;
        }
        if (/^(javascript|data|file|vbscript|about):/i.test(value)) {
          return null;
        }
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
          return null;
        }
        if (looksLikeHost(value)) {
          const candidate = `https://${value}`;
          return isSafeHttpUrl(candidate) ? candidate : null;
        }
        const engine = getSearchEngine(searchEngineKey);
        return `${engine.searchUrl}${encodeURIComponent(value)}`;
      }
      function normalizeTitle(title, url) {
        if (typeof title === "string" && title.trim()) {
          return title.trim().slice(0, MAX_HISTORY_TITLE_LENGTH);
        }
        return getHostname(url);
      }
      function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) {
          return "taille inconnue";
        }
        if (bytes === 0) {
          return "0 o";
        }
        const units = ["o", "Ko", "Mo", "Go", "To"];
        const exponent = Math.min(
          Math.floor(Math.log(bytes) / Math.log(1024)),
          units.length - 1
        );
        const value = bytes / 1024 ** exponent;
        return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
      }
      function makeId(prefix = "") {
        return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      }
      function sanitizeFilename(filename) {
        const normalized = String(filename || "").replace(/\\/g, "/");
        const base = normalized.split("/").filter(Boolean).pop() || "";
        let sanitized = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().replace(/[. ]+$/g, "");
        if (!sanitized || sanitized === "." || sanitized === "..") {
          return "telechargement";
        }
        if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sanitized)) {
          sanitized = `_${sanitized}`;
        }
        return sanitized.slice(0, 180) || "telechargement";
      }
      module.exports = {
        buildHomeUrl,
        formatBytes,
        formatDuration,
        getAboutPageLabel,
        getFilenameFromUrl,
        getHostname,
        getSearchEngine,
        getStreamType,
        getUrlExtension,
        hasUrlCredentials,
        isDirectFileUrl,
        isHomeUrl,
        isHttpUrl,
        isInternalPageUrl,
        isSafeHttpUrl,
        isTabUrl,
        looksLikeHost,
        makeId,
        normalizeTitle,
        resolveAboutPageUrl,
        resolveNavigationTarget,
        sanitizeFilename
      };
    }
  });

  // src/renderer/js/i18n.js
  var require_i18n = __commonJS({
    "src/renderer/js/i18n.js"(exports, module) {
      "use strict";
      var {
        DEFAULT_LANGUAGE,
        LANGUAGES,
        LANGUAGE_KEYS
      } = require_extensions();
      var ENGLISH_TEXT = Object.freeze({
        // Chrome et barre d'outils.
        Navigation: "Navigation",
        Pr\u00E9c\u00E9dent: "Back",
        "Page pr\xE9c\xE9dente": "Previous page",
        Suivant: "Forward",
        "Page suivante": "Next page",
        "Actualiser (Ctrl+R ou F5)": "Reload (Ctrl+R or F5)",
        "Actualiser la page": "Reload page",
        "Page d'accueil (Alt+Home)": "Home page (Alt+Home)",
        "Ouvrir la page d'accueil": "Open home page",
        "Effacer l\u2019adresse": "Clear address",
        "Rechercher ou saisir une adresse": "Search or enter an address",
        "Rechercher ou entrer une URL\u2026": "Search or enter a URL\u2026",
        Aller: "Go",
        "Ajouter aux favoris": "Add to favorites",
        "Ajouter cette page aux favoris": "Add this page to favorites",
        "Afficher les m\xE9dias d\xE9tect\xE9s": "Show detected media",
        "M\xE9dias d\xE9tect\xE9s": "Detected media",
        Menu: "Menu",
        "Ouvrir le menu principal": "Open main menu",
        "Navigation priv\xE9e": "Private browsing",
        "Fermer l\u2019onglet": "Close tab",
        "Lecture audio en cours": "Audio playing",
        // Menu principal.
        "Nouvel onglet": "New tab",
        "Page d\u2019accueil": "Home page",
        "Rouvrir l\u2019onglet ferm\xE9": "Reopen closed tab",
        "Nouvelle fen\xEAtre": "New window",
        "Nouvelle fen\xEAtre priv\xE9e": "New private window",
        "Rechercher dans la page": "Find in page",
        "Zoom avant": "Zoom in",
        "Zoom arri\xE8re": "Zoom out",
        "Zoom 100 %": "Zoom 100%",
        Favoris: "Bookmarks",
        Historique: "History",
        "Analyser les m\xE9dias de la page": "Scan page media",
        T\u00E9l\u00E9chargements: "Downloads",
        M\u00E9diath\u00E8que: "Media library",
        Param\u00E8tres: "Settings",
        Extensions: "Extensions",
        "DevTools de la page": "Page DevTools",
        "DevTools de l\u2019application": "Application DevTools",
        "\xC0 propos de Think-Browser": "About Think-Browser",
        // Paramètres.
        Configuration: "Configuration",
        "Moteur de recherche": "Search engine",
        "Utilis\xE9 par la barre d\u2019adresse et par la page d\u2019accueil locale.": "Used by the address bar and the local home page.",
        "Page locale": "Local page",
        "Page personnalis\xE9e": "Custom page",
        Ouvrir: "Open",
        "Adresse de la page personnalis\xE9e": "Custom page address",
        "D\xE9marrage et m\xE9moire": "Startup and memory",
        "Restaurer la session": "Restore session",
        "Enregistrer l\u2019historique": "Save history",
        "Confort de lecture": "Reading comfort",
        "Zoom par d\xE9faut": "Default zoom",
        "Confidentialit\xE9 et s\xE9curit\xE9": "Privacy and security",
        "Bloqueur de publicit\xE9s": "Ad blocker",
        "Donn\xE9es de navigation": "Browsing data",
        "Autorisations des sites": "Site permissions",
        "Dossier de t\xE9l\xE9chargement": "Download folder",
        "Choisir\u2026": "Choose\u2026",
        "R\xE9initialiser les pr\xE9f\xE9rences": "Reset preferences",
        "R\xE9initialiser\u2026": "Reset\u2026",
        Avanc\u00E9: "Advanced",
        Termin\u00E9: "Done",
        "Les modifications sont enregistr\xE9es automatiquement.": "Changes are saved automatically.",
        // Extensions.
        Personnalisation: "Personalization",
        Sombre: "Dark",
        Clair: "Light",
        Minuit: "Midnight",
        Fran\u00E7ais: "French",
        "Extensions internes": "Built-in extensions",
        "Th\xE8mes Think": "Think Themes",
        "Langues Think": "Think Languages",
        "Changer de th\xE8me": "Change theme",
        "Changer de langue": "Change language",
        "Th\xE8me de l\u2019interface": "Interface theme",
        "Langue de l\u2019interface": "Interface language",
        "Les extensions embarqu\xE9es ne chargent aucun code distant. Leur activation est valid\xE9e par le processus principal.": "Built-in extensions never load remote code. Their activation is validated by the main process.",
        "Les changements sont appliqu\xE9s imm\xE9diatement.": "Changes are applied immediately.",
        "Extension activ\xE9e": "Extension enabled",
        "Extension d\xE9sactiv\xE9e": "Extension disabled",
        Activer: "Enable",
        Th\u00E8me: "Theme",
        Langue: "Language",
        "Pr\xE9f\xE9rence appliqu\xE9e.": "Preference applied.",
        "Extensions indisponibles": "Extensions unavailable",
        "Modification impossible": "Change failed",
        "Change l\u2019apparence de l\u2019interface h\xF4te sans modifier le contenu des pages web.": "Changes the host interface appearance without modifying web page content.",
        "Traduit progressivement le chrome, les menus et les panneaux principaux.": "Progressively translates the browser chrome, menus and main panels.",
        "Th\xE8me sombre bleu historique de Think-Browser.": "Think-Browser\u2019s original dark blue theme.",
        "Interface claire \xE0 contraste \xE9lev\xE9 pour les environnements lumineux.": "High-contrast light interface for bright environments.",
        "Variante tr\xE8s sombre aux accents violets.": "Very dark variant with violet accents.",
        "Langue par d\xE9faut de Think-Browser.": "Default Think-Browser language.",
        "Traduction anglaise du chrome et des panneaux principaux.": "English translation of the browser chrome and main panels.",
        // Boutons et dialogues.
        Fermer: "Close",
        Annuler: "Cancel",
        Confirmer: "Confirm",
        Enregistrer: "Save",
        Effacer: "Clear",
        R\u00E9initialiser: "Reset",
        "Tout effacer": "Clear all",
        "\xC0 propos": "About",
        Version: "Version",
        "Moteur de rendu": "Rendering engine",
        "Interface Electron": "Electron interface",
        "Page d\u2019accueil locale": "Local home page"
      });
      var MESSAGES = Object.freeze({
        fr: Object.freeze({}),
        en: ENGLISH_TEXT
      });
      function normalizeMessage(value) {
        return value.replace(/\s+/g, " ").trim();
      }
      var I18n = class {
        /**
         * @param {Document} [documentRoot]
         */
        constructor(documentRoot = document) {
          this.document = documentRoot;
          this.language = DEFAULT_LANGUAGE;
          this.originalText = /* @__PURE__ */ new WeakMap();
          this.originalAttributes = /* @__PURE__ */ new WeakMap();
        }
        /**
         * Retourne la langue active.
         * @returns {string}
         */
        getLanguage() {
          return this.language;
        }
        /**
         * Retourne la locale utilisable par `Intl`.
         * @returns {string}
         */
        getLocale() {
          return LANGUAGES[this.language]?.locale || LANGUAGES.fr.locale;
        }
        /**
         * Traduit une chaîne connue.
         * @param {string} value
         * @param {string} [fallback]
         * @returns {string}
         */
        t(value, fallback = value) {
          const dictionary = MESSAGES[this.language] || MESSAGES.fr;
          return dictionary[value] || fallback;
        }
        /**
         * Applique une langue validée à tout le document hôte.
         * @param {unknown} language
         * @returns {string}
         */
        apply(language) {
          const next = LANGUAGE_KEYS.includes(language) ? language : DEFAULT_LANGUAGE;
          this.language = next;
          this.document.documentElement.lang = next;
          this.document.documentElement.dataset.language = next;
          this.#translateTextNodes();
          this.#translateAttributes();
          return next;
        }
        /**
         * Traduit les nœuds texte statiques, en conservant leurs espaces.
         */
        #translateTextNodes() {
          const dictionary = MESSAGES[this.language] || MESSAGES.fr;
          const walker = this.document.createTreeWalker(
            this.document.body,
            NodeFilter.SHOW_TEXT
          );
          const nodes = [];
          while (walker.nextNode()) {
            nodes.push(walker.currentNode);
          }
          for (const node of nodes) {
            const parent = node.parentElement;
            if (!parent || parent.closest("script, style, textarea, code, pre") || parent.closest("[data-i18n-ignore]")) {
              continue;
            }
            const raw = node.nodeValue || "";
            const trimmed = raw.trim();
            if (!trimmed) {
              continue;
            }
            const normalized = normalizeMessage(trimmed);
            const previousOriginal = this.originalText.get(node);
            const previousTranslation = previousOriginal ? dictionary[normalizeMessage(previousOriginal)] : void 0;
            const original = previousOriginal && (normalized === normalizeMessage(previousOriginal) || normalized === previousTranslation) ? previousOriginal : trimmed;
            this.originalText.set(node, original);
            const leading = raw.match(/^\s*/)?.[0] || "";
            const trailing = raw.match(/\s*$/)?.[0] || "";
            const translated = this.language === "fr" ? original : dictionary[normalizeMessage(original)] || original;
            node.nodeValue = `${leading}${translated}${trailing}`;
          }
        }
        /**
         * Traduit les attributs visibles et accessibles.
         */
        #translateAttributes() {
          const dictionary = MESSAGES[this.language] || MESSAGES.fr;
          const attributes = ["title", "aria-label", "placeholder", "alt"];
          for (const element of this.document.querySelectorAll("*")) {
            if (element.closest("script, style, [data-i18n-ignore]")) {
              continue;
            }
            let originals = this.originalAttributes.get(element);
            if (!originals) {
              originals = /* @__PURE__ */ new Map();
              this.originalAttributes.set(element, originals);
            }
            for (const attribute of attributes) {
              if (!element.hasAttribute(attribute)) {
                continue;
              }
              const current = element.getAttribute(attribute) || "";
              const previousOriginal = originals.get(attribute);
              const previousTranslation = previousOriginal ? dictionary[normalizeMessage(previousOriginal)] : void 0;
              const original = previousOriginal && (current === previousOriginal || current === previousTranslation) ? previousOriginal : current;
              originals.set(attribute, original);
              element.setAttribute(
                attribute,
                this.language === "fr" ? original : dictionary[normalizeMessage(original)] || original
              );
            }
          }
        }
      };
      module.exports = { I18n, ENGLISH_TEXT };
    }
  });

  // src/renderer/js/mediaSniffer.js
  var require_mediaSniffer = __commonJS({
    "src/renderer/js/mediaSniffer.js"(exports, module) {
      "use strict";
      var {
        getHostname,
        getStreamType,
        isHttpUrl
      } = require_utils();
      var detectionTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit"
      });
      var MediaSniffer = class {
        /**
         * @param {object} options
         * @param {HTMLElement} options.indicator
         * @param {HTMLElement} options.count
         * @param {HTMLElement} options.panel
         * @param {HTMLButtonElement} options.closeButton
         * @param {HTMLButtonElement} [options.extractButton]
         * @param {HTMLElement} options.list
         * @param {HTMLElement} [options.toolStatus]
         * @param {(url: string) => void} options.onOpenMedia
         * @param {(media: object) => void} [options.onDownloadMedia]
         * @param {() => void} [options.onExtractPage]
         * @param {() => void} [options.onBeforeOpen]
         * @param {(message: string, variant?: string) => void} options.showToast
         */
        constructor({
          indicator,
          count,
          panel,
          closeButton,
          extractButton,
          list,
          toolStatus,
          onOpenMedia,
          onDownloadMedia,
          onExtractPage,
          onBeforeOpen,
          showToast
        }) {
          this.indicator = indicator;
          this.count = count;
          this.panel = panel;
          this.closeButton = closeButton;
          this.extractButton = extractButton || null;
          this.list = list;
          this.toolStatus = toolStatus || null;
          this.onOpenMedia = onOpenMedia;
          this.onDownloadMedia = onDownloadMedia;
          this.onExtractPage = onExtractPage;
          this.onBeforeOpen = onBeforeOpen;
          this.showToast = showToast;
          this.media = /* @__PURE__ */ new Map();
          this.capabilitiesKnown = false;
          this.streamSupport = false;
          this.#setup();
        }
        /**
         * Met à jour la disponibilité de ffmpeg pour les flux HLS/DASH.
         * @param {{ffmpeg?: boolean, ffprobe?: boolean}} capabilities
         */
        setCapabilities(capabilities) {
          this.capabilitiesKnown = true;
          this.streamSupport = Boolean(capabilities?.ffmpeg);
          this.#renderToolStatus();
          if (this.isOpen) {
            this.render();
          }
        }
        /**
         * Ajoute un média et actualise l'indicateur.
         * @param {{url: string, extension?: string, resourceType?: string, detectedAt?: string}} media
         * @returns {boolean}
         */
        add(media) {
          if (!media || typeof media.url !== "string" || !isHttpUrl(media.url) || this.media.has(media.url)) {
            return false;
          }
          const detectedAt = typeof media.detectedAt === "string" && !Number.isNaN(Date.parse(media.detectedAt)) ? new Date(media.detectedAt).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
          this.media.set(media.url, {
            url: media.url,
            extension: typeof media.extension === "string" ? media.extension.toLowerCase() : "m\xE9dia",
            resourceType: media.resourceType || "other",
            detectedAt
          });
          this.#updateIndicator();
          if (this.isOpen) {
            this.render();
          }
          return true;
        }
        /**
         * Charge une liste initiale de médias.
         * @param {object[]} items
         */
        load(items) {
          if (!Array.isArray(items)) {
            return;
          }
          for (const item of items) {
            this.add(item);
          }
        }
        /**
         * Ouvre le panneau si des médias sont disponibles.
         * @returns {boolean}
         */
        open() {
          if (this.media.size === 0) {
            this.showToast?.("Aucun m\xE9dia d\xE9tect\xE9 pour le moment.", "info");
            return false;
          }
          this.onBeforeOpen?.();
          this.render();
          this.panel.hidden = false;
          this.indicator.setAttribute("aria-expanded", "true");
          return true;
        }
        /**
         * Ferme le panneau.
         * @param {boolean} [restoreFocus]
         */
        close(restoreFocus = false) {
          if (this.panel.hidden) {
            return;
          }
          this.panel.hidden = true;
          this.indicator.setAttribute("aria-expanded", "false");
          if (restoreFocus) {
            this.indicator.focus();
          }
        }
        /**
         * Indique si le panneau est ouvert.
         * @returns {boolean}
         */
        get isOpen() {
          return !this.panel.hidden;
        }
        /**
         * Nombre de médias uniques.
         * @returns {number}
         */
        get size() {
          return this.media.size;
        }
        /**
         * Vérifie si un nœud appartient au panneau ou à son déclencheur.
         * @param {Node} node
         * @returns {boolean}
         */
        contains(node) {
          return this.panel.contains(node) || this.indicator.contains(node);
        }
        /**
         * Construit la liste des médias, du plus récent au plus ancien.
         */
        render() {
          this.list.replaceChildren();
          const items = Array.from(this.media.values()).reverse();
          for (const media of items) {
            const item = document.createElement("li");
            item.className = "media-item";
            const meta = document.createElement("div");
            meta.className = "media-item__meta";
            const streamType = getStreamType(media.extension);
            const badge = document.createElement("span");
            badge.className = "media-badge";
            badge.textContent = streamType ? streamType.toUpperCase() : media.extension.toUpperCase();
            const host = document.createElement("span");
            host.className = "media-item__host";
            host.textContent = getHostname(media.url);
            const detectedDate = new Date(media.detectedAt);
            const hasValidDate = !Number.isNaN(detectedDate.getTime());
            const time = document.createElement("time");
            time.className = "media-item__time";
            time.dateTime = hasValidDate ? detectedDate.toISOString() : "";
            time.textContent = hasValidDate ? detectionTimeFormatter.format(detectedDate) : "";
            meta.append(badge, host, time);
            const url = document.createElement("p");
            url.className = "media-item__url";
            url.textContent = media.url;
            url.title = media.url;
            const actions = document.createElement("div");
            actions.className = "media-item__actions";
            const openButton = document.createElement("button");
            openButton.type = "button";
            openButton.className = "media-item__open";
            openButton.textContent = "Ouvrir";
            openButton.setAttribute(
              "aria-label",
              `Ouvrir le m\xE9dia ${media.extension.toUpperCase()} depuis ${getHostname(
                media.url
              )}`
            );
            openButton.addEventListener("click", () => {
              this.close();
              this.onOpenMedia(media.url);
            });
            actions.append(openButton);
            if (this.onDownloadMedia) {
              const downloadButton = document.createElement("button");
              downloadButton.type = "button";
              downloadButton.className = "media-item__download";
              downloadButton.textContent = streamType ? "T\xE9l\xE9charger le flux" : "T\xE9l\xE9charger";
              downloadButton.disabled = Boolean(streamType) && this.capabilitiesKnown && !this.streamSupport;
              downloadButton.title = downloadButton.disabled ? "ffmpeg est introuvable : ce flux ne peut pas \xEAtre t\xE9l\xE9charg\xE9." : streamType ? "Assembler ce flux avec ffmpeg dans le dossier de t\xE9l\xE9chargement." : "T\xE9l\xE9charger ce fichier m\xE9dia.";
              downloadButton.setAttribute(
                "aria-label",
                downloadButton.title
              );
              downloadButton.addEventListener("click", () => {
                this.close();
                this.onDownloadMedia(media);
              });
              actions.append(downloadButton);
            }
            item.append(meta, url, actions);
            this.list.append(item);
          }
        }
        /**
         * Affiche l'état du moteur d'assemblage des flux.
         */
        #renderToolStatus() {
          if (!this.toolStatus) {
            return;
          }
          this.toolStatus.hidden = !this.capabilitiesKnown;
          this.toolStatus.classList.toggle(
            "is-warning",
            this.capabilitiesKnown && !this.streamSupport
          );
          this.toolStatus.textContent = this.streamSupport ? "Flux HLS et DASH : assemblage ffmpeg disponible." : "ffmpeg est introuvable : seuls les fichiers directs peuvent \xEAtre t\xE9l\xE9charg\xE9s.";
        }
        /**
         * Met à jour le libellé et la visibilité de l'indicateur.
         */
        #updateIndicator() {
          const count = this.media.size;
          const plural = count > 1 ? "s" : "";
          this.indicator.hidden = false;
          this.count.textContent = String(count);
          this.indicator.setAttribute(
            "aria-label",
            `${count} m\xE9dia${plural} d\xE9tect\xE9${plural}. Afficher la liste.`
          );
        }
        /**
         * Installe les interactions du panneau.
         */
        #setup() {
          this.indicator.addEventListener("click", () => {
            if (this.panel.hidden) {
              this.open();
            } else {
              this.close();
            }
          });
          this.closeButton.addEventListener("click", () => {
            this.close(true);
          });
          this.extractButton?.addEventListener("click", () => {
            this.onExtractPage?.();
          });
        }
      };
      module.exports = { MediaSniffer };
    }
  });

  // src/renderer/js/navBar.js
  var require_navBar = __commonJS({
    "src/renderer/js/navBar.js"(exports, module) {
      "use strict";
      var {
        getAboutPageLabel,
        isHomeUrl,
        isHttpUrl,
        resolveNavigationTarget
      } = require_utils();
      var NavBar = class {
        /**
         * @param {object} options
         * @param {object} options.elements
         * @param {HTMLFormElement} options.elements.form
         * @param {HTMLInputElement} options.elements.urlInput
         * @param {HTMLButtonElement} options.elements.backButton
         * @param {HTMLButtonElement} options.elements.forwardButton
         * @param {HTMLButtonElement} options.elements.reloadButton
         * @param {HTMLButtonElement} options.elements.homeButton
         * @param {HTMLButtonElement} options.elements.goButton
         * @param {HTMLButtonElement} options.elements.clearAddressButton
         * @param {HTMLButtonElement} options.elements.favoriteButton
         * @param {HTMLElement} options.elements.progress
         * @param {() => string} options.getSearchEngineKey
         * @param {() => object | null} options.getActiveTab
         * @param {(url: string) => void} options.onNavigate
         * @param {() => void} options.onReload
         * @param {() => void} options.onHome
         * @param {() => void} options.onFocus
         * @param {(tab: object) => void} options.onToggleFavorite
         * @param {(url: string) => boolean} options.isFavorite
         * @param {(message: string, variant?: string) => void} options.showToast
         * @param {boolean} [options.privateMode]
         */
        constructor({
          elements,
          getSearchEngineKey,
          getActiveTab,
          onNavigate,
          onReload,
          onHome,
          onFocus,
          onToggleFavorite,
          isFavorite,
          showToast,
          privateMode = false
        }) {
          this.elements = elements;
          this.getSearchEngineKey = getSearchEngineKey;
          this.getActiveTab = getActiveTab;
          this.onNavigate = onNavigate;
          this.onReload = onReload;
          this.onHome = onHome;
          this.onFocus = onFocus;
          this.onToggleFavorite = onToggleFavorite;
          this.isFavorite = isFavorite;
          this.showToast = showToast;
          this.privateMode = privateMode;
          this.activeTabId = null;
          this.#setup();
        }
        /**
         * Synchronise la barre avec l'onglet actif.
         * @param {object | null} tab
         */
        update(tab) {
          const {
            urlInput,
            backButton,
            forwardButton,
            reloadButton,
            homeButton,
            favoriteButton,
            progress
          } = this.elements;
          if (!tab) {
            urlInput.value = "";
            urlInput.placeholder = "Rechercher ou entrer une URL\u2026";
            backButton.disabled = true;
            forwardButton.disabled = true;
            reloadButton.disabled = true;
            homeButton.disabled = true;
            favoriteButton.disabled = true;
            progress.hidden = true;
            this.activeTabId = null;
            this.#syncAddressControls();
            document.title = this.privateMode ? "Think-Browser \u2014 Navigation priv\xE9e" : "Think-Browser";
            return;
          }
          const tabChanged = this.activeTabId !== tab.id;
          const onHomePage = isHomeUrl(tab.url);
          const aboutLabel = getAboutPageLabel(tab.url);
          const isEditing = document.activeElement === urlInput;
          this.activeTabId = tab.id;
          if (tabChanged || !isEditing) {
            urlInput.value = onHomePage ? "" : aboutLabel || tab.url || "";
          }
          urlInput.placeholder = onHomePage ? "Rechercher sur le Web ou saisir une adresse\u2026" : aboutLabel ? "Page interne Think-Browser" : "Rechercher ou entrer une URL\u2026";
          const ready = Boolean(tab.ready);
          backButton.disabled = !ready || !tab.canGoBack();
          forwardButton.disabled = !ready || !tab.canGoForward();
          reloadButton.disabled = !ready;
          reloadButton.classList.toggle("is-loading", Boolean(tab.loading));
          homeButton.disabled = !ready;
          homeButton.classList.toggle("is-active", onHomePage);
          favoriteButton.disabled = this.privateMode || !isHttpUrl(tab.url);
          progress.hidden = !tab.loading;
          const suffix = this.privateMode ? "Think-Browser \u2014 Navigation priv\xE9e" : "Think-Browser";
          document.title = tab.title ? `${tab.title} \u2014 ${suffix}` : suffix;
          this.#syncAddressControls();
          this.updateFavoriteState();
        }
        /**
         * Met à jour l'étoile des favoris pour l'onglet actif.
         */
        updateFavoriteState() {
          const tab = this.getActiveTab();
          const favoriteButton = this.elements.favoriteButton;
          if (this.privateMode) {
            favoriteButton.disabled = true;
            favoriteButton.classList.remove("is-active");
            favoriteButton.setAttribute("aria-pressed", "false");
            favoriteButton.setAttribute(
              "aria-label",
              "Favoris indisponibles en navigation priv\xE9e"
            );
            favoriteButton.title = "Favoris indisponibles en navigation priv\xE9e";
            return;
          }
          const active = Boolean(
            tab && isHttpUrl(tab.url) && this.isFavorite(tab.url)
          );
          favoriteButton.classList.toggle("is-active", active);
          favoriteButton.setAttribute("aria-pressed", String(active));
          favoriteButton.setAttribute(
            "aria-label",
            active ? "Retirer cette page des favoris" : "Ajouter cette page aux favoris"
          );
          favoriteButton.title = active ? "Retirer des favoris" : "Ajouter aux favoris";
        }
        /**
         * Donne le focus à la barre d'adresse en sélectionnant son contenu.
         */
        focusAddress() {
          this.onFocus?.();
          this.elements.urlInput.focus();
          this.elements.urlInput.select();
        }
        /**
         * Aligne les contrôles secondaires sur le contenu du champ.
         */
        #syncAddressControls() {
          const { urlInput, clearAddressButton, goButton } = this.elements;
          const hasValue = Boolean(urlInput.value.trim());
          clearAddressButton.hidden = !hasValue;
          goButton.classList.toggle("is-idle", !hasValue);
        }
        /**
         * Installe les interactions de la barre.
         */
        #setup() {
          const {
            form,
            urlInput,
            backButton,
            forwardButton,
            reloadButton,
            homeButton,
            clearAddressButton,
            favoriteButton
          } = this.elements;
          form.addEventListener("submit", (event) => {
            event.preventDefault();
            const rawValue = urlInput.value.trim();
            if (!rawValue) {
              urlInput.focus();
              return;
            }
            const target = resolveNavigationTarget(
              rawValue,
              this.getSearchEngineKey()
            );
            if (!target) {
              this.showToast(
                "Adresse invalide. Utilisez une URL HTTP(S) ou un terme de recherche.",
                "error"
              );
              this.focusAddress();
              return;
            }
            urlInput.blur();
            this.onNavigate(target);
          });
          backButton.addEventListener("click", () => {
            const tab = this.getActiveTab();
            if (tab) {
              tab.goBack();
            }
          });
          forwardButton.addEventListener("click", () => {
            const tab = this.getActiveTab();
            if (tab) {
              tab.goForward();
            }
          });
          reloadButton.addEventListener("click", () => {
            this.onReload();
          });
          homeButton.addEventListener("click", () => {
            this.onHome?.();
          });
          clearAddressButton.addEventListener("click", () => {
            urlInput.value = "";
            this.#syncAddressControls();
            urlInput.focus();
          });
          favoriteButton.addEventListener("click", () => {
            const tab = this.getActiveTab();
            if (tab && !this.privateMode) {
              this.onToggleFavorite(tab);
            }
          });
          urlInput.addEventListener("input", () => {
            this.#syncAddressControls();
          });
          urlInput.addEventListener("focus", () => {
            this.onFocus?.();
            urlInput.select();
          });
          urlInput.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") {
              return;
            }
            const tab = this.getActiveTab();
            urlInput.value = tab && !isHomeUrl(tab.url) ? getAboutPageLabel(tab.url) || tab.url : "";
            this.#syncAddressControls();
            urlInput.blur();
          });
          this.#syncAddressControls();
        }
      };
      module.exports = { NavBar };
    }
  });

  // src/renderer/js/eventEmitter.js
  var require_eventEmitter = __commonJS({
    "src/renderer/js/eventEmitter.js"(exports, module) {
      "use strict";
      var EventEmitter = class {
        constructor() {
          this.listeners = /* @__PURE__ */ new Map();
        }
        /**
         * Abonne un auditeur.
         * @param {string} event
         * @param {Function} listener
         * @returns {this}
         */
        on(event, listener) {
          if (typeof listener !== "function") {
            throw new TypeError("Le listener doit \xEAtre une fonction.");
          }
          const listeners = this.listeners.get(event) || /* @__PURE__ */ new Set();
          listeners.add(listener);
          this.listeners.set(event, listeners);
          return this;
        }
        /**
         * Abonne un auditeur pour un seul événement.
         * @param {string} event
         * @param {Function} listener
         * @returns {this}
         */
        once(event, listener) {
          const wrapper = (...args) => {
            this.off(event, wrapper);
            listener.apply(this, args);
          };
          wrapper.original = listener;
          return this.on(event, wrapper);
        }
        /**
         * Retire un auditeur.
         * @param {string} event
         * @param {Function} listener
         * @returns {this}
         */
        off(event, listener) {
          const listeners = this.listeners.get(event);
          if (!listeners) {
            return this;
          }
          for (const candidate of listeners) {
            if (candidate === listener || candidate.original === listener) {
              listeners.delete(candidate);
            }
          }
          if (listeners.size === 0) {
            this.listeners.delete(event);
          }
          return this;
        }
        /**
         * Alias de `off`, conservé pour les appels existants.
         * @param {string} event
         * @param {Function} listener
         * @returns {this}
         */
        removeListener(event, listener) {
          return this.off(event, listener);
        }
        /**
         * Retire tous les auditeurs, ou ceux d'un événement précis.
         * @param {string} [event]
         * @returns {this}
         */
        removeAllListeners(event) {
          if (typeof event === "string") {
            this.listeners.delete(event);
          } else {
            this.listeners.clear();
          }
          return this;
        }
        /**
         * Émet un événement. Une erreur dans un auditeur ne bloque pas les autres.
         * @param {string} event
         * @param {...unknown} args
         * @returns {boolean}
         */
        emit(event, ...args) {
          const listeners = this.listeners.get(event);
          if (!listeners || listeners.size === 0) {
            return false;
          }
          for (const listener of Array.from(listeners)) {
            try {
              listener.apply(this, args);
            } catch (error) {
              console.warn(`[\xC9v\xE9nement] Auditeur \xAB ${event} \xBB en erreur :`, error);
            }
          }
          return true;
        }
      };
      module.exports = { EventEmitter };
    }
  });

  // src/renderer/js/tabManager.js
  var require_tabManager = __commonJS({
    "src/renderer/js/tabManager.js"(exports, module) {
      "use strict";
      var { EventEmitter } = require_eventEmitter();
      var {
        DEFAULT_ZOOM,
        MAX_CLOSED_TABS,
        MAX_TAB_TITLE_LENGTH,
        MAX_ZOOM,
        MIN_ZOOM,
        ZOOM_STEP
      } = require_constants();
      var {
        getHostname,
        isHttpUrl,
        isTabUrl
      } = require_utils();
      var Tab = class extends EventEmitter {
        /**
         * @param {object} options
         * @param {string} options.id
         * @param {string} options.url
         * @param {HTMLElement} options.tabsList
         * @param {HTMLElement} options.webviewStack
         * @param {string} [options.privatePartition]
         * @param {number} [options.defaultZoom]
         */
        constructor({
          id,
          url,
          tabsList,
          webviewStack,
          privatePartition = "",
          defaultZoom = DEFAULT_ZOOM
        }) {
          super();
          this.id = id;
          this.url = url;
          this.title = "Nouvel onglet";
          this.ready = false;
          this.loading = false;
          this.pendingUrl = null;
          this.devToolsOpen = false;
          this.destroyed = false;
          this.audioPlaying = false;
          this.zoomFactor = Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, Number(defaultZoom) || DEFAULT_ZOOM)
          );
          this.faviconUrl = "";
          this.privatePartition = privatePartition;
          this.element = document.createElement("div");
          this.element.id = `tab-element-${id}`;
          this.element.className = "tab";
          this.element.dataset.tabId = id;
          this.element.setAttribute("role", "tab");
          this.element.setAttribute("aria-selected", "false");
          this.element.tabIndex = -1;
          this.faviconElement = document.createElement("img");
          this.faviconElement.className = "tab__favicon";
          this.faviconElement.alt = "";
          this.faviconElement.width = 16;
          this.faviconElement.height = 16;
          this.faviconElement.referrerPolicy = "no-referrer";
          this.faviconElement.decoding = "async";
          this.faviconElement.src = "../../assets/icons/favicon.svg";
          this.titleElement = document.createElement("span");
          this.titleElement.className = "tab__title";
          this.titleElement.textContent = "Nouvel onglet";
          this.audioElement = document.createElement("span");
          this.audioElement.className = "tab__audio";
          this.audioElement.textContent = "\u266A";
          this.audioElement.title = "Lecture audio en cours";
          this.audioElement.setAttribute("aria-label", "Lecture audio en cours");
          this.audioElement.setAttribute("role", "img");
          this.audioElement.hidden = true;
          this.closeButton = document.createElement("button");
          this.closeButton.type = "button";
          this.closeButton.className = "tab__close";
          this.closeButton.setAttribute("aria-label", "Fermer l\u2019onglet");
          this.closeButton.title = "Fermer l\u2019onglet";
          this.closeButton.textContent = "\xD7";
          this.element.append(
            this.faviconElement,
            this.titleElement,
            this.audioElement,
            this.closeButton
          );
          this.faviconElement.addEventListener("error", () => {
            if (!this.destroyed) {
              this.faviconElement.hidden = true;
            }
          });
          this.webview = document.createElement("webview");
          this.webview.id = `webview-${id}`;
          this.webview.className = "tab-webview";
          this.webview.setAttribute("aria-label", "Contenu de la page web");
          this.webview.setAttribute("allowpopups", "");
          this.webview.hidden = true;
          if (this.privatePartition) {
            this.webview.setAttribute("partition", this.privatePartition);
          }
          this.webview.setAttribute("src", url);
          this.element.setAttribute("aria-controls", this.webview.id);
          this.#bindTabInteractions();
          this.#bindWebviewEvents();
          tabsList.append(this.element);
          webviewStack.append(this.webview);
          this.updateTitle(getHostname(url));
        }
        /**
         * Retourne l'identifiant WebContents de la webview, ou `null` tant que la
         * page n'est pas prête.
         * @returns {number | null}
         */
        getWebContentsId() {
          if (!this.ready || this.destroyed) {
            return null;
          }
          try {
            const id = this.webview.getWebContentsId();
            return Number.isInteger(id) ? id : null;
          } catch {
            return null;
          }
        }
        /**
         * Navigue vers une URL HTTP(S).
         * @param {string} url
         * @returns {boolean}
         */
        navigate(url) {
          if (!isTabUrl(url)) {
            return false;
          }
          this.url = url;
          this.pendingUrl = null;
          this.updateTitle(getHostname(url));
          this.emit("url-changed", this);
          if (!this.ready) {
            this.pendingUrl = url;
            return true;
          }
          try {
            const navigation = this.webview.loadURL(url);
            if (navigation && typeof navigation.catch === "function") {
              navigation.catch((error) => {
                if (!this.destroyed) {
                  console.warn(
                    "[Navigation] Chargement interrompu :",
                    error.message
                  );
                }
              });
            }
            return true;
          } catch (error) {
            this.emit("navigation-error", error);
            return false;
          }
        }
        /**
         * Affiche ou masque l'onglet sans toucher au contenu de la page.
         * @param {boolean} active
         */
        setActive(active) {
          this.element.classList.toggle("is-active", active);
          this.element.setAttribute("aria-selected", String(active));
          this.element.tabIndex = active ? 0 : -1;
          this.webview.hidden = !active;
        }
        /**
         * Met à jour le titre affiché dans l'onglet et dans la fenêtre.
         * @param {string} rawTitle
         */
        updateTitle(rawTitle) {
          const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim().slice(0, MAX_TAB_TITLE_LENGTH) : getHostname(this.url) || "Nouvel onglet";
          this.title = title;
          this.titleElement.textContent = title;
          this.element.title = title;
          this.element.setAttribute("aria-label", title);
          this.closeButton.setAttribute("aria-label", `Fermer l'onglet ${title}`);
          this.closeButton.title = `Fermer ${title}`;
          this.emit("title-changed", this);
        }
        /**
         * Met à jour l'indicateur de chargement.
         * @param {boolean} loading
         */
        setLoading(loading) {
          if (this.loading === loading) {
            return;
          }
          this.loading = loading;
          this.element.classList.toggle("is-loading", loading);
          this.emit("loading-changed", this);
        }
        /**
         * Met à jour l'indicateur audio de l'onglet.
         * @param {boolean} playing
         */
        setAudioPlaying(playing) {
          if (this.audioPlaying === playing) {
            return;
          }
          this.audioPlaying = playing;
          this.audioElement.hidden = !playing;
          this.emit("media-state-changed", playing);
        }
        /**
         * Met à jour la favicon affichée dans l'onglet.
         * @param {string} url
         */
        setFavicon(url) {
          let faviconUrl = "";
          if (typeof url === "string" && url) {
            try {
              const parsed = new URL(url);
              const protocol = parsed.protocol;
              if (protocol === "http:" || protocol === "https:" || protocol === "data:") {
                faviconUrl = url;
              }
            } catch {
            }
          }
          this.faviconUrl = faviconUrl;
          if (!faviconUrl) {
            this.faviconElement.hidden = true;
            return;
          }
          this.faviconElement.hidden = false;
          this.faviconElement.src = faviconUrl;
        }
        /**
         * Recherche du texte dans la page.
         * @param {string} text
         * @param {{forward?: boolean, findNext?: boolean}} [options]
         * @returns {number | null}
         */
        findInPage(text, { forward = true, findNext = false } = {}) {
          if (!this.ready || !text) {
            return null;
          }
          try {
            const options = findNext ? { forward, findNext: true } : { forward };
            return this.webview.findInPage(text, options);
          } catch (error) {
            console.warn("[Recherche] Impossible :", error.message);
            return null;
          }
        }
        /**
         * Arrête la recherche dans la page.
         * @param {'clearSelection' | 'keepSelection' | 'activateSelection'} [action]
         */
        stopFindInPage(action = "clearSelection") {
          try {
            this.webview.stopFindInPage(action);
          } catch {
          }
        }
        /**
         * Récupère le texte sélectionné dans la page.
         * @returns {Promise<string>}
         */
        async getSelectionText() {
          if (!this.ready) {
            return "";
          }
          try {
            const text = await this.webview.executeJavaScript(
              "window.getSelection().toString()",
              true
            );
            return typeof text === "string" ? text.trim().slice(0, 500) : "";
          } catch {
            return "";
          }
        }
        /**
         * Applique un facteur de zoom à la page.
         * @param {number} factor
         * @returns {number}
         */
        setZoomFactor(factor) {
          const next = Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, Math.round(factor * 100) / 100)
          );
          this.zoomFactor = next;
          try {
            if (this.ready) {
              this.webview.setZoomFactor(next);
            }
          } catch (error) {
            console.warn("[Zoom] Application impossible :", error.message);
          }
          this.emit("zoom-changed", next);
          return next;
        }
        /**
         * Retourne le facteur de zoom courant.
         * @returns {number}
         */
        getZoomFactor() {
          return this.zoomFactor;
        }
        /**
         * Augmente le zoom de la page.
         * @returns {number}
         */
        zoomIn() {
          return this.setZoomFactor(this.zoomFactor + ZOOM_STEP);
        }
        /**
         * Diminue le zoom de la page.
         * @returns {number}
         */
        zoomOut() {
          return this.setZoomFactor(this.zoomFactor - ZOOM_STEP);
        }
        /**
         * Réinitialise le zoom de la page.
         * @returns {number}
         */
        resetZoom() {
          return this.setZoomFactor(DEFAULT_ZOOM);
        }
        /**
         * Applique le zoom courant à la webview.
         */
        #applyZoom() {
          try {
            this.webview.setZoomFactor(this.zoomFactor);
          } catch {
          }
        }
        /**
         * @returns {boolean}
         */
        canGoBack() {
          try {
            return this.ready && this.webview.canGoBack();
          } catch {
            return false;
          }
        }
        /**
         * @returns {boolean}
         */
        canGoForward() {
          try {
            return this.ready && this.webview.canGoForward();
          } catch {
            return false;
          }
        }
        /**
         * @returns {boolean}
         */
        goBack() {
          try {
            if (this.canGoBack()) {
              this.webview.goBack();
              return true;
            }
          } catch (error) {
            console.warn("[Navigation] Pr\xE9c\xE9dent indisponible :", error.message);
          }
          return false;
        }
        /**
         * @returns {boolean}
         */
        goForward() {
          try {
            if (this.canGoForward()) {
              this.webview.goForward();
              return true;
            }
          } catch (error) {
            console.warn("[Navigation] Suivant indisponible :", error.message);
          }
          return false;
        }
        /**
         * Recharge la page si la webview est prête.
         * @returns {boolean}
         */
        reload() {
          if (!this.ready) {
            return false;
          }
          try {
            this.webview.reload();
            return true;
          } catch (error) {
            this.emit("navigation-error", error);
            return false;
          }
        }
        /**
         * Interrompt le chargement de la page en cours.
         * @returns {boolean}
         */
        stop() {
          if (!this.ready) {
            return false;
          }
          try {
            this.webview.stop();
            return true;
          } catch (error) {
            this.emit("navigation-error", error);
            return false;
          }
        }
        /**
         * Ouvre ou referme les DevTools de la page.
         * @returns {boolean}
         */
        toggleDevTools() {
          if (!this.ready) {
            return false;
          }
          try {
            if (this.devToolsOpen || this.webview.isDevToolsOpened()) {
              this.devToolsOpen = false;
              this.webview.closeDevTools();
            } else {
              this.devToolsOpen = true;
              this.webview.openDevTools();
            }
            return true;
          } catch (error) {
            this.devToolsOpen = false;
            throw error;
          }
        }
        /**
         * Fait défiler la barre pour rendre l'onglet visible.
         * @param {HTMLElement} viewport
         */
        scrollIntoView(viewport) {
          if (!this.element.isConnected || !viewport) {
            return;
          }
          const tabRect = this.element.getBoundingClientRect();
          const viewportRect = viewport.getBoundingClientRect();
          if (tabRect.left < viewportRect.left || tabRect.right > viewportRect.right) {
            this.element.scrollIntoView({
              block: "nearest",
              inline: "nearest"
            });
          }
        }
        /**
         * Détruit la webview et retire le DOM de l'onglet.
         */
        destroy() {
          if (this.destroyed) {
            return;
          }
          this.destroyed = true;
          try {
            if (this.devToolsOpen) {
              this.webview.closeDevTools();
            }
            this.webview.stop();
          } catch {
          }
          this.webview.remove();
          this.element.remove();
          this.removeAllListeners();
        }
        /**
         * Branche les interactions de la barre d'onglets.
         */
        #bindTabInteractions() {
          this.closeButton.addEventListener("click", (event) => {
            event.stopPropagation();
            this.emit("close-request", this);
          });
          this.element.addEventListener("click", () => {
            this.emit("activate-request", this);
          });
          this.element.addEventListener("auxclick", (event) => {
            if (event.button === 1) {
              event.preventDefault();
              this.emit("close-request", this);
            }
          });
          this.element.addEventListener("keydown", (event) => {
            if (event.target !== this.element) {
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              this.emit("activate-request", this);
              return;
            }
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              this.emit(
                "navigate-request",
                event.key === "ArrowRight" ? 1 : -1
              );
            }
          });
        }
        /**
         * Branche les événements de la webview.
         */
        #bindWebviewEvents() {
          this.webview.addEventListener("focus", () => {
            this.emit("focus", this);
          });
          this.webview.addEventListener("dom-ready", () => {
            if (this.destroyed) {
              return;
            }
            this.ready = true;
            this.#flushPendingNavigation();
            this.#syncTitleFromPage();
            this.#applyZoom();
            this.emit("ready", this);
          });
          this.webview.addEventListener("did-start-loading", () => {
            this.setLoading(true);
          });
          this.webview.addEventListener("did-stop-loading", () => {
            if (this.destroyed) {
              return;
            }
            this.ready = true;
            this.setLoading(false);
            this.#flushPendingNavigation();
            this.#syncTitleFromPage();
            this.#applyZoom();
            this.emit("ready", this);
          });
          this.webview.addEventListener("did-navigate", (event) => {
            if (this.destroyed || event.isMainFrame === false) {
              return;
            }
            if (typeof event.url === "string" && event.url) {
              this.url = event.url;
              this.updateTitle(getHostname(this.url));
            }
            this.setAudioPlaying(false);
            this.emit("url-changed", this);
          });
          this.webview.addEventListener("did-navigate-in-page", (event) => {
            if (this.destroyed || event.isMainFrame === false) {
              return;
            }
            if (typeof event.url === "string" && event.url) {
              this.url = event.url;
            }
            this.emit("url-changed", this);
          });
          this.webview.addEventListener("did-fail-load", (event) => {
            if (this.destroyed || event.isMainFrame === false || event.errorCode === -3) {
              return;
            }
            this.ready = true;
            this.setLoading(false);
            if (isTabUrl(event.validatedURL)) {
              this.url = event.validatedURL;
            }
            this.emit("load-failed", {
              errorCode: event.errorCode,
              errorDescription: event.errorDescription,
              validatedURL: event.validatedURL,
              url: this.url
            });
            this.emit("url-changed", this);
          });
          this.webview.addEventListener("page-title-updated", (event) => {
            if (this.destroyed) {
              return;
            }
            this.updateTitle(event.title);
          });
          this.webview.addEventListener("page-favicon-updated", (event) => {
            if (this.destroyed) {
              return;
            }
            const favicons = Array.isArray(event.favicons) ? event.favicons : [];
            this.setFavicon(favicons[0] || "");
          });
          this.webview.addEventListener("media-started-playing", () => {
            this.setAudioPlaying(true);
            this.emit("media-started-playing", this);
          });
          this.webview.addEventListener("media-paused", () => {
            this.setAudioPlaying(false);
          });
          this.webview.addEventListener("found-in-page", (event) => {
            if (!this.destroyed) {
              this.emit("found-in-page", event.result);
            }
          });
          this.webview.addEventListener("devtools-opened", () => {
            this.devToolsOpen = true;
            this.emit("devtools-state-changed", this);
          });
          this.webview.addEventListener("devtools-closed", () => {
            this.devToolsOpen = false;
            this.emit("devtools-state-changed", this);
          });
        }
        /**
         * Exécute une navigation demandée avant que la webview soit prête.
         */
        #flushPendingNavigation() {
          if (!this.pendingUrl) {
            return;
          }
          const pendingUrl = this.pendingUrl;
          this.pendingUrl = null;
          this.navigate(pendingUrl);
        }
        /**
         * Récupère le titre fourni par la page, s'il est disponible.
         */
        #syncTitleFromPage() {
          try {
            const pageTitle = this.webview.getTitle();
            if (pageTitle) {
              this.updateTitle(pageTitle);
            }
          } catch {
          }
        }
      };
      var TabManager = class extends EventEmitter {
        /**
         * @param {object} options
         * @param {HTMLElement} options.tabsList
         * @param {HTMLElement} options.webviewStack
         * @param {HTMLElement} options.tabsViewport
         * @param {HTMLElement} options.newTabButton
         * @param {() => string} options.getHomeUrl
         * @param {() => number} [options.getDefaultZoom]
         * @param {string} [options.privatePartition]
         */
        constructor({
          tabsList,
          webviewStack,
          tabsViewport,
          newTabButton,
          getHomeUrl,
          getDefaultZoom = () => DEFAULT_ZOOM,
          privatePartition = ""
        }) {
          super();
          this.tabsList = tabsList;
          this.webviewStack = webviewStack;
          this.tabsViewport = tabsViewport;
          this.newTabButton = newTabButton;
          this.getHomeUrl = getHomeUrl;
          this.getDefaultZoom = getDefaultZoom;
          this.privatePartition = privatePartition;
          this.tabs = /* @__PURE__ */ new Map();
          this.activeTabId = null;
          this.counter = 0;
          this.closedTabs = [];
          this.newTabButton.addEventListener("click", () => {
            this.createTab({ activate: true, focusAddress: true });
          });
        }
        /**
         * Crée un onglet et sa webview.
         * @param {{url?: string, activate?: boolean, focusAddress?: boolean}} [options]
         * @returns {Tab}
         */
        createTab({
          url = this.getHomeUrl(),
          activate = true,
          focusAddress = false
        } = {}) {
          const targetUrl = isTabUrl(url) ? url : this.getHomeUrl();
          const id = `tab-${++this.counter}`;
          const tab = new Tab({
            id,
            url: targetUrl,
            tabsList: this.tabsList,
            webviewStack: this.webviewStack,
            privatePartition: this.privatePartition,
            defaultZoom: this.getDefaultZoom()
          });
          this.tabs.set(id, tab);
          this.#wireTab(tab);
          this.emit("tab-created", tab);
          if (activate) {
            this.activateTab(id);
          }
          if (focusAddress) {
            this.emit("focus-address-requested");
          }
          return tab;
        }
        /**
         * Active un onglet et masque les autres.
         * @param {string} tabId
         */
        activateTab(tabId) {
          const tab = this.tabs.get(tabId);
          if (!tab) {
            return;
          }
          this.activeTabId = tabId;
          for (const item of this.tabs.values()) {
            item.setActive(item.id === tabId);
          }
          this.emit("active-changed", tab);
          window.requestAnimationFrame(() => {
            tab.scrollIntoView(this.tabsViewport);
          });
        }
        /**
         * Ferme un onglet. Le dernier onglet est remplacé par un nouvel onglet.
         * @param {string} tabId
         */
        closeTab(tabId) {
          const tab = this.tabs.get(tabId);
          if (!tab) {
            return;
          }
          const ids = Array.from(this.tabs.keys());
          const index = ids.indexOf(tabId);
          const wasActive = this.activeTabId === tabId;
          if (isHttpUrl(tab.url)) {
            this.closedTabs.push({ url: tab.url, title: tab.title });
            if (this.closedTabs.length > MAX_CLOSED_TABS) {
              this.closedTabs.shift();
            }
          }
          this.tabs.delete(tabId);
          if (wasActive) {
            this.activeTabId = null;
          }
          tab.destroy();
          if (this.tabs.size === 0) {
            this.createTab({ activate: true, focusAddress: true });
            this.emit("tab-closed", tab);
            return;
          }
          if (wasActive) {
            const remaining = Array.from(this.tabs.values());
            const nextTab = remaining[Math.min(index, remaining.length - 1)];
            this.activateTab(nextTab.id);
          }
          this.emit("tab-closed", tab);
        }
        /**
         * Rouvre le dernier onglet fermé.
         * @returns {Tab | null}
         */
        reopenClosedTab() {
          const entry = this.closedTabs.pop();
          if (!entry) {
            return null;
          }
          return this.createTab({
            url: entry.url,
            activate: true,
            focusAddress: false
          });
        }
        /**
         * Retourne l'index de l'onglet actif.
         * @returns {number}
         */
        getActiveIndex() {
          return Math.max(
            0,
            this.getTabs().findIndex((tab) => tab.id === this.activeTabId)
          );
        }
        /**
         * Applique un facteur de zoom à l'onglet actif.
         * @param {number} factor
         * @returns {number | null}
         */
        setZoomFactor(factor) {
          const tab = this.getActiveTab();
          return tab ? tab.setZoomFactor(factor) : null;
        }
        /**
         * Augmente le zoom de l'onglet actif.
         * @returns {number | null}
         */
        zoomIn() {
          const tab = this.getActiveTab();
          return tab ? tab.zoomIn() : null;
        }
        /**
         * Diminue le zoom de l'onglet actif.
         * @returns {number | null}
         */
        zoomOut() {
          const tab = this.getActiveTab();
          return tab ? tab.zoomOut() : null;
        }
        /**
         * Réinitialise le zoom de l'onglet actif.
         * @returns {number | null}
         */
        resetZoom() {
          const tab = this.getActiveTab();
          return tab ? tab.resetZoom() : null;
        }
        /**
         * Applique un zoom par défaut à tous les onglets ouverts.
         * @param {number} factor
         */
        setDefaultZoom(factor) {
          for (const tab of this.tabs.values()) {
            tab.setZoomFactor(factor);
          }
        }
        /**
         * Interrompt le chargement de l'onglet actif.
         * @returns {boolean}
         */
        stopActiveTab() {
          const tab = this.getActiveTab();
          return tab ? tab.stop() : false;
        }
        /**
         * Ferme l'onglet actif.
         * @returns {boolean}
         */
        closeActiveTab() {
          if (!this.activeTabId) {
            return false;
          }
          this.closeTab(this.activeTabId);
          return true;
        }
        /**
         * @returns {Tab | null}
         */
        getActiveTab() {
          return this.tabs.get(this.activeTabId) || null;
        }
        /**
         * @param {string} tabId
         * @returns {Tab | null}
         */
        getTabById(tabId) {
          return this.tabs.get(tabId) || null;
        }
        /**
         * @returns {Tab[]}
         */
        getTabs() {
          return Array.from(this.tabs.values());
        }
        /**
         * @returns {number}
         */
        get size() {
          return this.tabs.size;
        }
        /**
         * Branche les événements d'un onglet sur le gestionnaire.
         * @param {Tab} tab
         */
        #wireTab(tab) {
          tab.on("activate-request", () => {
            this.activateTab(tab.id);
          });
          tab.on("close-request", () => {
            this.closeTab(tab.id);
          });
          tab.on("focus", () => {
            this.emit("tab-focused", tab);
          });
          tab.on("navigate-request", (offset) => {
            this.#activateRelative(tab, offset);
          });
          tab.on("title-changed", () => {
            this.#notifyActive(tab);
            this.emit("tab-updated", tab);
          });
          tab.on("url-changed", () => {
            this.#notifyActive(tab);
            this.emit("tab-updated", tab);
          });
          tab.on("loading-changed", () => {
            this.#notifyActive(tab);
            this.emit("tab-updated", tab);
          });
          tab.on("ready", () => {
            this.#notifyActive(tab);
            this.emit("tab-updated", tab);
          });
          tab.on("devtools-state-changed", () => {
            this.#notifyActive(tab);
          });
          tab.on("load-failed", (details) => {
            this.emit("load-failed", tab, details);
          });
          tab.on("navigation-error", (error) => {
            this.emit("navigation-error", tab, error);
          });
          tab.on("media-started-playing", () => {
            this.emit("media-started-playing", tab);
          });
          tab.on("found-in-page", (result) => {
            this.emit("found-in-page", tab, result);
          });
          tab.on("zoom-changed", (factor) => {
            this.emit("zoom-changed", tab, factor);
          });
        }
        /**
         * Prévient l'interface si l'onglet concerné est actif.
         * @param {Tab} tab
         */
        #notifyActive(tab) {
          if (this.activeTabId === tab.id) {
            this.emit("active-tab-updated", tab);
          }
        }
        /**
         * Active l'onglet précédent ou suivant.
         * @param {Tab} tab
         * @param {number} offset
         */
        #activateRelative(tab, offset) {
          const tabs = Array.from(this.tabs.values());
          const index = tabs.indexOf(tab);
          if (index < 0) {
            return;
          }
          const nextTab = tabs[(index + offset + tabs.length) % tabs.length];
          this.activateTab(nextTab.id);
          nextTab.element.focus();
        }
      };
      module.exports = { Tab, TabManager };
    }
  });

  // src/renderer/js/theme.js
  var require_theme = __commonJS({
    "src/renderer/js/theme.js"(exports, module) {
      "use strict";
      var {
        DEFAULT_THEME,
        THEMES,
        THEME_KEYS
      } = require_extensions();
      var ThemeManager = class {
        /**
         * @param {HTMLElement} [root]
         */
        constructor(root = document.documentElement) {
          this.root = root;
          this.theme = DEFAULT_THEME;
        }
        /**
         * Applique un thème validé.
         * @param {unknown} theme
         * @returns {string}
         */
        apply(theme) {
          const next = THEME_KEYS.includes(theme) ? theme : DEFAULT_THEME;
          this.theme = next;
          this.root.dataset.theme = next;
          this.root.style.colorScheme = THEMES[next].colorScheme;
          const themeColor = document.querySelector('meta[name="theme-color"]');
          if (themeColor) {
            themeColor.content = next === "light" ? "#eef2f7" : next === "midnight" ? "#080611" : "#0b0f14";
          }
          return next;
        }
      };
      module.exports = { ThemeManager };
    }
  });

  // src/renderer/js/ui/about.js
  var require_about = __commonJS({
    "src/renderer/js/ui/about.js"(exports, module) {
      "use strict";
      var AboutPanel = class {
        /**
         * @param {object} options
         * @param {HTMLDialogElement} options.dialog
         * @param {HTMLElement} options.version
         * @param {HTMLElement} options.electron
         * @param {HTMLElement} options.chrome
         * @param {HTMLElement} options.node
         * @param {object} options.api
         * @param {import('./dialog').DialogController} options.dialogs
         */
        constructor({
          dialog,
          version,
          electron,
          chrome,
          node,
          api,
          dialogs
        }) {
          this.dialog = dialog;
          this.version = version;
          this.electron = electron;
          this.chrome = chrome;
          this.node = node;
          this.api = api;
          this.dialogs = dialogs;
        }
        /**
         * Charge les versions puis ouvre la modale.
         * @returns {Promise<void>}
         */
        async open() {
          this.version.textContent = "\u2014";
          this.electron.textContent = "\u2014";
          this.chrome.textContent = "\u2014";
          this.node.textContent = "\u2014";
          try {
            const info = await this.api.getAppInfo();
            if (info && typeof info === "object") {
              this.version.textContent = info.version ? `v${info.version}` : "\u2014";
              this.electron.textContent = info.electron || "\u2014";
              this.chrome.textContent = info.chrome || "\u2014";
              this.node.textContent = info.node || "\u2014";
            }
          } catch (error) {
            console.warn("[\xC0 propos] Versions indisponibles :", error.message);
          }
          this.dialogs.show(this.dialog);
        }
      };
      module.exports = { AboutPanel };
    }
  });

  // src/renderer/js/ui/dialog.js
  var require_dialog = __commonJS({
    "src/renderer/js/ui/dialog.js"(exports, module) {
      "use strict";
      function createEmptyState(title, description) {
        const wrapper = document.createElement("div");
        wrapper.className = "empty-state";
        const strong = document.createElement("strong");
        strong.textContent = title;
        const text = document.createElement("span");
        text.textContent = description;
        wrapper.append(strong, text);
        return wrapper;
      }
      var DialogController = class {
        /**
         * @param {object} options
         * @param {HTMLDialogElement} options.confirmDialog
         * @param {HTMLElement} options.confirmTitle
         * @param {HTMLElement} options.confirmMessage
         * @param {HTMLButtonElement} options.confirmCancel
         * @param {HTMLButtonElement} options.confirmAccept
         * @param {() => void} [options.onBeforeOpen]
         */
        constructor({
          confirmDialog,
          confirmTitle,
          confirmMessage,
          confirmCancel,
          confirmAccept,
          onBeforeOpen
        }) {
          this.confirmDialog = confirmDialog;
          this.confirmTitle = confirmTitle;
          this.confirmMessage = confirmMessage;
          this.confirmCancel = confirmCancel;
          this.confirmAccept = confirmAccept;
          this.onBeforeOpen = onBeforeOpen;
          this.confirmResolver = null;
          this.#setup();
        }
        /**
         * Ouvre une modale en refermant les menus et panneaux flottants.
         * @param {HTMLDialogElement} dialog
         */
        show(dialog) {
          if (!dialog || dialog.open) {
            return;
          }
          this.onBeforeOpen?.();
          dialog.showModal();
        }
        /**
         * Demande une confirmation à l'utilisateur.
         * @param {{title: string, message: string, confirmLabel?: string, danger?: boolean}} options
         * @returns {Promise<boolean>}
         */
        askConfirmation({
          title,
          message,
          confirmLabel = "Confirmer",
          danger = false
        }) {
          if (this.confirmResolver) {
            const previousResolver = this.confirmResolver;
            this.confirmResolver = null;
            if (this.confirmDialog.open) {
              this.confirmDialog.close();
            }
            previousResolver(false);
          }
          this.confirmTitle.textContent = title;
          this.confirmMessage.textContent = message;
          this.confirmAccept.textContent = confirmLabel;
          this.confirmAccept.className = danger ? "button button--danger" : "button button--primary";
          return new Promise((resolve) => {
            this.confirmResolver = resolve;
            this.onBeforeOpen?.();
            this.confirmDialog.showModal();
          });
        }
        /**
         * Termine la confirmation courante.
         * @param {boolean} value
         */
        #settle(value) {
          const resolver = this.confirmResolver;
          this.confirmResolver = null;
          if (this.confirmDialog.open) {
            this.confirmDialog.close();
          }
          if (resolver) {
            resolver(value);
          }
        }
        /**
         * Installe les interactions communes aux modales.
         */
        #setup() {
          document.querySelectorAll("[data-close-dialog]").forEach((button) => {
            button.addEventListener("click", () => {
              const dialog = button.closest("dialog");
              if (dialog) {
                dialog.close();
              }
            });
          });
          document.querySelectorAll("dialog.modal").forEach((dialog) => {
            dialog.addEventListener("click", (event) => {
              if (event.target === dialog) {
                dialog.close();
              }
            });
          });
          this.confirmAccept.addEventListener("click", () => {
            this.#settle(true);
          });
          this.confirmCancel.addEventListener("click", () => {
            this.#settle(false);
          });
          this.confirmDialog.addEventListener("cancel", (event) => {
            event.preventDefault();
            this.#settle(false);
          });
          this.confirmDialog.addEventListener("close", () => {
            if (this.confirmResolver) {
              const resolver = this.confirmResolver;
              this.confirmResolver = null;
              resolver(false);
            }
          });
        }
      };
      module.exports = { createEmptyState, DialogController };
    }
  });

  // src/renderer/js/ui/downloads.js
  var require_downloads = __commonJS({
    "src/renderer/js/ui/downloads.js"(exports, module) {
      "use strict";
      var {
        formatBytes,
        formatDuration,
        getHostname
      } = require_utils();
      var { createEmptyState } = require_dialog();
      function getDownloadStatusLabel(state) {
        switch (state) {
          case "completed":
            return "Termin\xE9";
          case "cancelled":
            return "Annul\xE9";
          case "interrupted":
            return "Interrompu";
          case "queued":
            return "En attente";
          default:
            return "En cours";
        }
      }
      var DownloadsPanel = class {
        /**
         * @param {object} options
         * @param {HTMLDialogElement} options.dialog
         * @param {HTMLElement} options.list
         * @param {HTMLElement} options.count
         * @param {object} options.api
         * @param {import('./dialog').DialogController} options.dialogs
         * @param {(message: string, variant?: string) => void} options.showToast
         */
        constructor({
          dialog,
          list,
          count,
          api,
          dialogs,
          showToast
        }) {
          this.dialog = dialog;
          this.list = list;
          this.count = count;
          this.api = api;
          this.dialogs = dialogs;
          this.showToast = showToast;
          this.records = /* @__PURE__ */ new Map();
        }
        /**
         * Indique si le panneau est ouvert.
         * @returns {boolean}
         */
        get isOpen() {
          return this.dialog.open;
        }
        /**
         * Ouvre le panneau après rechargement.
         * @returns {Promise<void>}
         */
        async open() {
          await this.refresh();
          this.dialogs.show(this.dialog);
        }
        /**
         * Recharge la liste depuis le processus principal.
         * @returns {Promise<void>}
         */
        async refresh() {
          try {
            const records = await this.api.listDownloads();
            this.records.clear();
            if (Array.isArray(records)) {
              for (const record of records) {
                if (record && Number.isFinite(Number(record.id))) {
                  this.records.set(Number(record.id), record);
                }
              }
            }
          } catch (error) {
            console.warn("[T\xE9l\xE9chargements] Lecture impossible :", error.message);
            this.showToast?.(
              `T\xE9l\xE9chargements indisponibles : ${error.message}`,
              "error"
            );
          }
          this.render();
        }
        /**
         * Réagit à un nouveau téléchargement.
         * @param {object} record
         */
        handleStarted(record) {
          if (!record || !Number.isFinite(Number(record.id))) {
            return;
          }
          this.records.set(Number(record.id), record);
          this.showToast?.(
            `T\xE9l\xE9chargement d\xE9marr\xE9 : ${record.filename || "fichier"}`,
            "info"
          );
          if (this.isOpen) {
            this.render();
          }
        }
        /**
         * Réagit à une progression.
         * @param {object} record
         */
        handleUpdated(record) {
          if (!record || !Number.isFinite(Number(record.id))) {
            return;
          }
          this.records.set(Number(record.id), record);
          if (this.isOpen) {
            this.render();
          }
        }
        /**
         * Réagit à la fin d'un téléchargement.
         * @param {object} record
         */
        handleDone(record) {
          if (!record || !Number.isFinite(Number(record.id))) {
            return;
          }
          this.records.set(Number(record.id), record);
          if (record.state === "completed") {
            this.showToast?.(
              `T\xE9l\xE9chargement termin\xE9 : ${record.filename || "fichier"}`,
              "success"
            );
          } else if (record.state === "cancelled") {
            this.showToast?.(
              `T\xE9l\xE9chargement annul\xE9 : ${record.filename || "fichier"}`,
              "info"
            );
          } else {
            this.showToast?.(
              `T\xE9l\xE9chargement \xE9chou\xE9 : ${record.filename || "fichier"}`,
              "error"
            );
          }
          if (this.isOpen) {
            this.render();
          }
        }
        /**
         * Construit la liste des téléchargements.
         */
        render() {
          const body = this.dialog.querySelector(".modal__body");
          const scrollTop = body?.scrollTop || 0;
          this.list.replaceChildren();
          const records = Array.from(this.records.values()).sort(
            (a, b) => Number(b.id) - Number(a.id)
          );
          const count = records.length;
          const plural = count > 1 ? "s" : "";
          this.count.textContent = count === 0 ? "Aucun t\xE9l\xE9chargement" : `${count} t\xE9l\xE9chargement${plural}`;
          if (count === 0) {
            this.list.append(
              createEmptyState(
                "Aucun t\xE9l\xE9chargement",
                "Les fichiers et flux HLS/DASH t\xE9l\xE9charg\xE9s depuis vos pages appara\xEEtront ici."
              )
            );
            if (body) {
              body.scrollTop = scrollTop;
            }
            return;
          }
          const fragment = document.createDocumentFragment();
          for (const record of records) {
            const item = document.createElement("article");
            item.className = "download-item";
            const top = document.createElement("div");
            top.className = "download-item__top";
            const savedName = typeof record.savePath === "string" && record.savePath ? record.savePath.split(/[\\/]/).pop() : "";
            const name = document.createElement("span");
            name.className = "download-item__name";
            name.textContent = savedName || record.filename || "T\xE9l\xE9chargement";
            name.title = record.savePath || record.filename || "";
            const status = document.createElement("span");
            const state = record.state || "progressing";
            status.className = `download-status download-status--${state}`;
            status.textContent = getDownloadStatusLabel(state);
            top.append(name, status);
            const meta = document.createElement("div");
            meta.className = "download-item__meta";
            if (record.kind === "stream") {
              const badge = document.createElement("span");
              badge.className = "download-item__badge";
              badge.textContent = record.ytdlp ? "YT-DLP" : record.merged ? "FUSION" : record.streamType === "dash" ? "DASH" : "HLS";
              meta.append(badge);
              if (record.isLive) {
                const liveBadge = document.createElement("span");
                liveBadge.className = "download-item__badge download-item__badge--live";
                liveBadge.textContent = "DIRECT";
                liveBadge.title = "Enregistrement d\u2019un flux en direct";
                meta.append(liveBadge);
              }
            }
            const host = document.createElement("span");
            host.className = "download-item__host";
            host.textContent = getHostname(record.url || "");
            host.title = record.url || "";
            const receivedBytes = Number(record.receivedBytes) || 0;
            const totalBytes = Number(record.totalBytes) || 0;
            const duration = formatDuration(record.durationSeconds);
            let sizeLabel = "";
            if (totalBytes > 0) {
              sizeLabel = state === "progressing" ? `${formatBytes(receivedBytes)} / ${formatBytes(totalBytes)}` : formatBytes(totalBytes);
            } else if (receivedBytes > 0) {
              sizeLabel = formatBytes(receivedBytes);
            } else if (state === "queued") {
              sizeLabel = "En attente d\u2019un emplacement";
            } else if (state === "progressing") {
              sizeLabel = record.ytdlp ? record.message || "T\xE9l\xE9chargement YouTube\u2026" : record.kind === "stream" ? record.isLive ? "Enregistrement en direct\u2026" : "Pr\xE9paration\u2026" : "En attente";
            }
            if (duration) {
              sizeLabel = sizeLabel ? `${sizeLabel} \xB7 ${duration}` : duration;
            }
            const size = document.createElement("span");
            size.className = "download-item__size";
            size.textContent = sizeLabel;
            meta.append(host, size);
            const progressRow = document.createElement("div");
            progressRow.className = "download-item__progress-row";
            const progress = document.createElement("div");
            progress.className = "download-progress";
            progress.setAttribute("role", "progressbar");
            const progressBar = document.createElement("span");
            progressBar.className = "download-progress__bar";
            const storedProgress = typeof record.progress === "number" ? record.progress : Number.NaN;
            const percent = Number.isFinite(storedProgress) ? Math.max(0, Math.min(100, Math.round(storedProgress))) : totalBytes > 0 ? Math.min(
              100,
              Math.round(receivedBytes / totalBytes * 100)
            ) : state === "completed" ? 100 : null;
            const percentLabel = document.createElement("span");
            percentLabel.className = "download-item__percent";
            if (percent !== null) {
              progress.setAttribute("aria-valuemin", "0");
              progress.setAttribute("aria-valuemax", "100");
              progress.setAttribute("aria-valuenow", String(percent));
              progressBar.style.width = `${percent}%`;
              percentLabel.textContent = `${percent} %`;
              if (state === "completed") {
                progress.classList.add("is-complete");
              }
            } else if (state === "progressing" || state === "queued") {
              progress.classList.add("download-progress--indeterminate");
              progress.removeAttribute("aria-valuenow");
              percentLabel.textContent = "\u2026";
            } else {
              progress.removeAttribute("aria-valuenow");
              percentLabel.textContent = "\u2014";
            }
            progress.append(progressBar);
            progressRow.append(progress, percentLabel);
            const actions = document.createElement("div");
            actions.className = "download-item__actions";
            const revealButton = document.createElement("button");
            revealButton.type = "button";
            revealButton.className = "button button--ghost button--small";
            revealButton.textContent = "Afficher dans le dossier";
            revealButton.disabled = !record.savePath;
            revealButton.addEventListener("click", async () => {
              revealButton.disabled = true;
              try {
                const result = await this.api.showDownloadInFolder(record.id);
                if (!result?.ok) {
                  this.showToast?.(
                    result?.message || "Fichier introuvable.",
                    "error"
                  );
                }
              } catch (error) {
                this.showToast?.(
                  `Ouverture du dossier impossible : ${error.message}`,
                  "error"
                );
              } finally {
                revealButton.disabled = false;
              }
            });
            actions.append(revealButton);
            if (state === "progressing" || state === "queued") {
              if (state === "progressing" && record.kind === "stream" && !record.ytdlp) {
                const stopButton = document.createElement("button");
                stopButton.type = "button";
                stopButton.className = "button button--ghost button--small";
                stopButton.textContent = "Arr\xEAter et conserver";
                stopButton.title = "Arr\xEAter l\u2019enregistrement du flux et conserver le fichier d\xE9j\xE0 re\xE7u.";
                stopButton.addEventListener("click", async () => {
                  stopButton.disabled = true;
                  try {
                    const result = await this.api.stopDownload(record.id);
                    if (!result?.ok) {
                      this.showToast?.(
                        result?.message || "Arr\xEAt impossible.",
                        "error"
                      );
                      stopButton.disabled = false;
                    }
                  } catch (error) {
                    this.showToast?.(
                      `Arr\xEAt impossible : ${error.message}`,
                      "error"
                    );
                    stopButton.disabled = false;
                  }
                });
                actions.append(stopButton);
              }
              const cancelButton = document.createElement("button");
              cancelButton.type = "button";
              cancelButton.className = "button button--ghost button--small";
              cancelButton.textContent = "Annuler";
              cancelButton.addEventListener("click", async () => {
                cancelButton.disabled = true;
                try {
                  const result = await this.api.cancelDownload(record.id);
                  if (!result?.ok) {
                    this.showToast?.(
                      result?.message || "Annulation impossible.",
                      "error"
                    );
                    cancelButton.disabled = false;
                    return;
                  }
                } catch (error) {
                  this.showToast?.(
                    `Annulation impossible : ${error.message}`,
                    "error"
                  );
                  cancelButton.disabled = false;
                }
              });
              actions.append(cancelButton);
            }
            if (record.kind === "file" && state === "interrupted" && record.canResume === true && !record.private) {
              const resumeButton = document.createElement("button");
              resumeButton.type = "button";
              resumeButton.className = "button button--ghost button--small";
              resumeButton.textContent = "Reprendre";
              resumeButton.title = "Reprendre le t\xE9l\xE9chargement partiel si Chromium le permet encore.";
              resumeButton.addEventListener("click", async () => {
                resumeButton.disabled = true;
                try {
                  const result = await this.api.resumeDownload(record.id);
                  if (!result?.ok) {
                    this.showToast?.(
                      result?.message || "Reprise impossible.",
                      "error"
                    );
                    resumeButton.disabled = false;
                  }
                } catch (error) {
                  this.showToast?.(
                    `Reprise impossible : ${error.message}`,
                    "error"
                  );
                  resumeButton.disabled = false;
                }
              });
              actions.append(resumeButton);
            }
            if (!record.private && !record.ytdlp && (state === "interrupted" || state === "cancelled")) {
              const retryButton = document.createElement("button");
              retryButton.type = "button";
              retryButton.className = "button button--ghost button--small";
              retryButton.textContent = "Relancer";
              retryButton.addEventListener("click", async () => {
                retryButton.disabled = true;
                try {
                  const result = await this.api.retryDownload(record.id);
                  if (!result?.ok) {
                    this.showToast?.(
                      result?.message || "Relance impossible.",
                      "error"
                    );
                    retryButton.disabled = false;
                    return;
                  }
                } catch (error) {
                  this.showToast?.(
                    `Relance impossible : ${error.message}`,
                    "error"
                  );
                  retryButton.disabled = false;
                }
              });
              actions.append(retryButton);
            }
            item.append(top, meta, progressRow);
            if (record.message && state !== "completed") {
              const message = document.createElement("p");
              message.className = "download-item__message";
              message.classList.toggle(
                "download-item__message--error",
                state === "interrupted"
              );
              message.textContent = record.message;
              item.append(message);
            }
            item.append(actions);
            fragment.append(item);
          }
          this.list.append(fragment);
          if (body) {
            body.scrollTop = scrollTop;
          }
        }
      };
      module.exports = { DownloadsPanel, getDownloadStatusLabel };
    }
  });

  // src/renderer/js/ui/extensions.js
  var require_extensions2 = __commonJS({
    "src/renderer/js/ui/extensions.js"(exports, module) {
      "use strict";
      var ExtensionsPanel = class {
        /**
         * @param {object} options
         * @param {HTMLDialogElement} options.dialog
         * @param {HTMLElement} options.list
         * @param {HTMLElement} options.status
         * @param {object} options.api
         * @param {import('./dialog').DialogController} options.dialogs
         * @param {import('../i18n').I18n} options.i18n
         * @param {(state: object) => void} [options.onStateChanged]
         * @param {(message: string, variant?: string) => void} [options.showToast]
         */
        constructor({
          dialog,
          list,
          status,
          api,
          dialogs,
          i18n,
          onStateChanged,
          showToast
        }) {
          this.dialog = dialog;
          this.list = list;
          this.status = status;
          this.api = api;
          this.dialogs = dialogs;
          this.i18n = i18n;
          this.onStateChanged = onStateChanged;
          this.showToast = showToast;
          this.state = null;
          this.statusTimer = null;
        }
        /**
         * Indique si le panneau est ouvert.
         * @returns {boolean}
         */
        get isOpen() {
          return Boolean(this.dialog?.open);
        }
        /**
         * Charge le catalogue puis ouvre la modale.
         * @returns {Promise<void>}
         */
        async open() {
          await this.refresh();
          this.dialogs.show(this.dialog);
          this.#render();
        }
        /**
         * Recharge l'état depuis le processus principal.
         * @param {{silent?: boolean}} [options]
         * @returns {Promise<void>}
         */
        async refresh({ silent = false } = {}) {
          try {
            const state = await this.api.getExtensions();
            this.applyState(state);
          } catch (error) {
            this.setStatus(
              `Extensions indisponibles : ${error.message}`,
              "error"
            );
            if (!silent) {
              this.showToast?.(
                `Extensions indisponibles : ${error.message}`,
                "error"
              );
            }
          }
        }
        /**
         * Applique un état déjà chargé.
         * @param {unknown} state
         */
        applyState(state) {
          if (!state || typeof state !== "object") {
            return;
          }
          this.state = state;
          if (this.dialog?.open) {
            this.#render();
          }
        }
        /**
         * Affiche un message temporaire.
         * @param {string} message
         * @param {'info' | 'success' | 'error'} [variant]
         */
        setStatus(message, variant = "info") {
          if (!this.status) {
            return;
          }
          window.clearTimeout(this.statusTimer);
          this.status.textContent = message;
          this.status.dataset.variant = variant;
          this.statusTimer = window.setTimeout(() => {
            this.status.textContent = this.i18n.t(
              "Les changements sont appliqu\xE9s imm\xE9diatement."
            );
            delete this.status.dataset.variant;
          }, 3600);
        }
        /**
         * Construit les cartes à partir du catalogue.
         */
        #render() {
          const state = this.state;
          if (!state || !Array.isArray(state.extensions)) {
            return;
          }
          this.list.replaceChildren();
          for (const extension of state.extensions) {
            this.list.append(this.#buildCard(extension, state));
          }
        }
        /**
         * Construit une carte d'extension.
         * @param {object} extension
         * @param {object} state
         * @returns {HTMLElement}
         */
        #buildCard(extension, state) {
          const card = document.createElement("section");
          card.className = "extension-card";
          card.dataset.extensionId = extension.id;
          if (!extension.enabled) {
            card.classList.add("extension-card--disabled");
          }
          const header = document.createElement("div");
          header.className = "extension-card__header";
          const text = document.createElement("div");
          text.className = "extension-card__text";
          const title = document.createElement("h3");
          title.className = "extension-card__title";
          title.textContent = this.i18n.t(extension.name);
          const meta = document.createElement("p");
          meta.className = "extension-card__meta";
          meta.textContent = `v${extension.version} \xB7 ${this.#typeLabel(
            extension.type
          )}`;
          text.append(title, meta);
          const toggle = document.createElement("input");
          toggle.type = "checkbox";
          toggle.className = "switch";
          toggle.checked = Boolean(extension.enabled);
          toggle.setAttribute(
            "aria-label",
            `${this.i18n.t("Activer")} ${this.i18n.t(extension.name)}`
          );
          toggle.addEventListener("change", () => {
            void this.#setEnabled(extension, toggle.checked);
          });
          header.append(text, toggle);
          const description = document.createElement("p");
          description.className = "extension-card__description";
          description.textContent = this.i18n.t(
            extension.description,
            extension.description
          );
          card.append(header, description);
          if (extension.enabled) {
            const optionRow = this.#buildOptionRow(extension, state);
            if (optionRow) {
              card.append(optionRow);
            }
          }
          return card;
        }
        /**
         * Construit le sélecteur d'option d'une extension.
         * @param {object} extension
         * @param {object} state
         * @returns {HTMLElement | null}
         */
        #buildOptionRow(extension, state) {
          const isTheme = extension.type === "theme";
          const isLanguage = extension.type === "language";
          if (!isTheme && !isLanguage) {
            return null;
          }
          const row = document.createElement("div");
          row.className = "extension-card__option";
          const label = document.createElement("label");
          label.className = "extension-card__option-label";
          label.textContent = this.i18n.t(
            isTheme ? "Th\xE8me de l\u2019interface" : "Langue de l\u2019interface"
          );
          const select = document.createElement("select");
          select.className = "select";
          select.setAttribute(
            "aria-label",
            this.i18n.t(isTheme ? "Th\xE8me de l\u2019interface" : "Langue de l\u2019interface")
          );
          const options = isTheme ? state.themes : state.languages;
          const current = isTheme ? state.theme : state.language;
          for (const option of options || []) {
            const element = document.createElement("option");
            element.value = option.id;
            element.textContent = this.i18n.t(option.label, option.label);
            select.append(element);
          }
          select.value = current;
          select.addEventListener("change", () => {
            void this.#setOption(extension, select.value, select);
          });
          row.append(label, select);
          return row;
        }
        /**
         * Active ou désactive une extension.
         * @param {object} extension
         * @param {boolean} enabled
         * @returns {Promise<void>}
         */
        async #setEnabled(extension, enabled) {
          try {
            const state = await this.api.setExtensionEnabled(extension.id, enabled);
            this.#applyRemoteState(state);
            this.setStatus(
              `${this.i18n.t(extension.name)} : ${enabled ? this.i18n.t("Extension activ\xE9e") : this.i18n.t("Extension d\xE9sactiv\xE9e")}.`,
              "success"
            );
          } catch (error) {
            this.setStatus(
              `Modification impossible : ${error.message}`,
              "error"
            );
            await this.refresh({ silent: true });
          }
        }
        /**
         * Change l'option active d'une extension.
         * @param {object} extension
         * @param {string} value
         * @param {HTMLSelectElement} select
         * @returns {Promise<void>}
         */
        async #setOption(extension, value, select) {
          select.disabled = true;
          try {
            const state = extension.type === "theme" ? await this.api.setTheme(value) : await this.api.setLanguage(value);
            this.#applyRemoteState(state);
            this.setStatus("Pr\xE9f\xE9rence appliqu\xE9e.", "success");
          } catch (error) {
            this.setStatus(
              `Modification impossible : ${error.message}`,
              "error"
            );
            await this.refresh({ silent: true });
          } finally {
            select.disabled = false;
          }
        }
        /**
         * Met à jour l'état local et prévient l'application.
         * @param {object} state
         */
        #applyRemoteState(state) {
          this.state = state;
          this.onStateChanged?.(state);
          this.#render();
        }
        /**
         * Retourne le libellé localisé d'un type d'extension.
         * @param {string} type
         * @returns {string}
         */
        #typeLabel(type) {
          if (type === "theme") {
            return this.i18n.t("Th\xE8me");
          }
          if (type === "language") {
            return this.i18n.t("Langue");
          }
          return type;
        }
      };
      module.exports = { ExtensionsPanel };
    }
  });

  // src/renderer/js/ui/favorites.js
  var require_favorites = __commonJS({
    "src/renderer/js/ui/favorites.js"(exports, module) {
      "use strict";
      var { getHostname, isHttpUrl } = require_utils();
      var { createEmptyState } = require_dialog();
      var favoriteDateFormatter = new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium"
      });
      var ALL_FOLDERS = "all";
      var NO_FOLDER = "none";
      var FavoritesPanel = class {
        /**
         * @param {object} options
         * @param {HTMLDialogElement} options.dialog
         * @param {HTMLElement} options.list
         * @param {HTMLElement} options.count
         * @param {HTMLElement} options.foldersList
         * @param {HTMLButtonElement} options.newFolderButton
         * @param {HTMLFormElement} options.folderForm
         * @param {HTMLInputElement} options.folderNameInput
         * @param {HTMLButtonElement} options.folderCancelButton
         * @param {HTMLButtonElement} options.importButton
         * @param {HTMLButtonElement} options.exportButton
         * @param {object} options.api
         * @param {import('./dialog').DialogController} options.dialogs
         * @param {(url: string) => void} options.onNavigate
         * @param {() => void} [options.onChanged]
         * @param {(message: string, variant?: string) => void} options.showToast
         */
        constructor({
          dialog,
          list,
          count,
          foldersList,
          newFolderButton,
          folderForm,
          folderNameInput,
          folderCancelButton,
          importButton,
          exportButton,
          api,
          dialogs,
          onNavigate,
          onChanged,
          showToast
        }) {
          this.dialog = dialog;
          this.list = list;
          this.count = count;
          this.foldersList = foldersList;
          this.newFolderButton = newFolderButton;
          this.folderForm = folderForm;
          this.folderNameInput = folderNameInput;
          this.folderCancelButton = folderCancelButton;
          this.importButton = importButton;
          this.exportButton = exportButton;
          this.api = api;
          this.dialogs = dialogs;
          this.onNavigate = onNavigate;
          this.onChanged = onChanged;
          this.showToast = showToast;
          this.favorites = [];
          this.folders = [];
          this.activeFolderId = ALL_FOLDERS;
          this.#bind();
        }
        /**
         * Indique si le panneau est ouvert.
         * @returns {boolean}
         */
        get isOpen() {
          return this.dialog.open;
        }
        /**
         * Ouvre le panneau après rechargement.
         * @returns {Promise<void>}
         */
        async open() {
          await this.refresh();
          this.dialogs.show(this.dialog);
        }
        /**
         * Recharge les favoris et les dossiers.
         * @param {{silent?: boolean}} [options]
         * @returns {Promise<void>}
         */
        async refresh({ silent = false } = {}) {
          try {
            const [favorites, folders] = await Promise.all([
              this.api.listFavorites(),
              this.api.listFavoriteFolders()
            ]);
            this.applyData({ favorites, folders });
          } catch (error) {
            console.warn("[Favoris] Lecture impossible :", error.message);
            if (!silent) {
              this.showToast?.(
                `Favoris indisponibles : ${error.message}`,
                "error"
              );
            }
          }
        }
        /**
         * Applique une liste de favoris reçue du processus principal.
         * @param {unknown} list
         * @param {unknown} [folders]
         */
        applyList(list, folders = this.folders) {
          this.applyData({ favorites: list, folders });
        }
        /**
         * Applique les dossiers reçus du processus principal.
         * @param {unknown} folders
         */
        applyFolders(folders) {
          this.folders = this.#normalizeFolders(folders);
          this.#ensureActiveFolder();
          this.render();
        }
        /**
         * Applique une photographie complète des favoris.
         * @param {{favorites?: unknown, folders?: unknown}} data
         */
        applyData({ favorites, folders } = {}) {
          this.folders = this.#normalizeFolders(folders);
          this.favorites = this.#normalizeFavorites(favorites, this.folders);
          this.#ensureActiveFolder();
          this.render();
          this.onChanged?.();
        }
        /**
         * Indique si une URL est en favori.
         * @param {string} url
         * @returns {boolean}
         */
        isFavorite(url) {
          return this.favorites.some((entry) => entry.url === url);
        }
        /**
         * Ajoute ou retire une page des favoris.
         * @param {{url: string, title?: string}} payload
         * @returns {Promise<object>}
         */
        async toggle({ url, title }) {
          const folderId = this.#resolveTargetFolder();
          const result = await this.api.toggleFavorite({ url, title, folderId });
          if (Array.isArray(result?.favorites)) {
            this.applyData({
              favorites: result.favorites,
              folders: result.folders || this.folders
            });
          } else {
            await this.refresh({ silent: true });
          }
          return result;
        }
        /**
         * Retire un favori.
         * @param {string} favoriteId
         * @returns {Promise<object>}
         */
        async remove(favoriteId) {
          const result = await this.api.removeFavorite(favoriteId);
          if (Array.isArray(result?.favorites)) {
            this.applyData({
              favorites: result.favorites,
              folders: result.folders || this.folders
            });
          } else {
            await this.refresh({ silent: true });
          }
          return result;
        }
        /**
         * Déplace un favori dans un dossier.
         * @param {string} favoriteId
         * @param {string | null} folderId
         * @returns {Promise<void>}
         */
        async move(favoriteId, folderId) {
          try {
            const result = await this.api.moveFavorite(favoriteId, folderId);
            if (Array.isArray(result?.favorites)) {
              this.applyData({
                favorites: result.favorites,
                folders: this.folders
              });
            } else {
              await this.refresh({ silent: true });
            }
          } catch (error) {
            this.showToast?.(
              `D\xE9placement impossible : ${error.message}`,
              "error"
            );
          }
        }
        /**
         * Construit la liste des favoris et la barre de dossiers.
         */
        render() {
          this.#renderFolders();
          this.list.replaceChildren();
          const total = this.favorites.length;
          const visible = this.#getVisibleFavorites();
          const plural = total > 1 ? "s" : "";
          this.count.textContent = total === 0 ? "Aucun favori" : this.activeFolderId === ALL_FOLDERS ? `${total} favori${plural}` : `${visible.length} sur ${total} favori${plural}`;
          if (total === 0) {
            this.list.append(
              createEmptyState(
                "Aucun favori",
                "Utilisez l\u2019\xE9toile de la barre d\u2019adresse pour conserver une page."
              )
            );
            return;
          }
          if (visible.length === 0) {
            this.list.append(
              createEmptyState(
                "Dossier vide",
                "Ajoutez un favori \xE0 ce dossier ou d\xE9placez-en un depuis la liste."
              )
            );
            return;
          }
          const fragment = document.createDocumentFragment();
          for (const favorite of visible) {
            const item = document.createElement("article");
            item.className = "favorite-item";
            const openButton = document.createElement("button");
            openButton.type = "button";
            openButton.className = "favorite-entry";
            openButton.title = favorite.url;
            const title = document.createElement("span");
            title.className = "favorite-entry__title";
            title.textContent = favorite.title || getHostname(favorite.url);
            const meta = document.createElement("span");
            meta.className = "favorite-entry__meta";
            meta.textContent = `${getHostname(favorite.url)} \xB7 ${this.#formatDate(
              favorite.addedAt
            )}`;
            const url = document.createElement("span");
            url.className = "favorite-entry__url";
            url.textContent = favorite.url;
            openButton.append(title, meta, url);
            openButton.addEventListener("click", () => {
              this.dialog.close();
              this.onNavigate(favorite.url);
            });
            const actions = document.createElement("div");
            actions.className = "favorite-actions";
            const folderSelect = document.createElement("select");
            folderSelect.className = "favorite-folder-select";
            folderSelect.setAttribute(
              "aria-label",
              `Dossier de ${favorite.title || favorite.url}`
            );
            const rootOption = document.createElement("option");
            rootOption.value = "";
            rootOption.textContent = "Sans dossier";
            folderSelect.append(rootOption);
            for (const folder of this.folders) {
              const option = document.createElement("option");
              option.value = folder.id;
              option.textContent = folder.name;
              folderSelect.append(option);
            }
            folderSelect.value = favorite.folderId || "";
            folderSelect.addEventListener("change", () => {
              void this.move(favorite.id, folderSelect.value || null);
            });
            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "favorite-remove";
            removeButton.textContent = "Retirer";
            removeButton.setAttribute(
              "aria-label",
              `Retirer ${favorite.title || favorite.url} des favoris`
            );
            removeButton.addEventListener("click", async () => {
              removeButton.disabled = true;
              try {
                await this.remove(favorite.id);
                this.showToast?.("Favori retir\xE9.", "info");
              } catch (error) {
                this.showToast?.(
                  `Retrait impossible : ${error.message}`,
                  "error"
                );
              } finally {
                removeButton.disabled = false;
              }
            });
            actions.append(folderSelect, removeButton);
            item.append(openButton, actions);
            fragment.append(item);
          }
          this.list.append(fragment);
        }
        /**
         * Construit la liste des dossiers.
         */
        #renderFolders() {
          this.foldersList.replaceChildren();
          const filters = [
            {
              id: ALL_FOLDERS,
              name: "Tous les favoris",
              count: this.favorites.length
            },
            {
              id: NO_FOLDER,
              name: "Sans dossier",
              count: this.favorites.filter((entry) => !entry.folderId).length
            },
            ...this.folders.map((folder) => ({
              id: folder.id,
              name: folder.name,
              count: this.favorites.filter(
                (entry) => entry.folderId === folder.id
              ).length,
              deletable: true
            }))
          ];
          for (const filter of filters) {
            const row = document.createElement("div");
            row.className = "favorite-folder-row";
            const button = document.createElement("button");
            button.type = "button";
            button.className = "favorite-folder-button";
            button.classList.toggle("is-active", this.activeFolderId === filter.id);
            button.setAttribute("aria-pressed", String(this.activeFolderId === filter.id));
            const name = document.createElement("span");
            name.className = "favorite-folder-button__name";
            name.textContent = filter.name;
            const count = document.createElement("span");
            count.className = "favorite-folder-button__count";
            count.textContent = String(filter.count);
            button.append(name, count);
            button.addEventListener("click", () => {
              this.activeFolderId = filter.id;
              this.render();
            });
            row.append(button);
            if (filter.deletable) {
              const deleteButton = document.createElement("button");
              deleteButton.type = "button";
              deleteButton.className = "favorite-folder-delete";
              deleteButton.textContent = "\xD7";
              deleteButton.title = `Supprimer le dossier ${filter.name}`;
              deleteButton.setAttribute(
                "aria-label",
                `Supprimer le dossier ${filter.name}`
              );
              deleteButton.addEventListener("click", async () => {
                await this.#deleteFolder(filter);
              });
              row.append(deleteButton);
            }
            this.foldersList.append(row);
          }
        }
        /**
         * Supprime un dossier après confirmation.
         * @param {{id: string, name: string}} folder
         * @returns {Promise<void>}
         */
        async #deleteFolder(folder) {
          const confirmed = await this.dialogs.askConfirmation({
            title: "Supprimer le dossier",
            message: `Le dossier \xAB ${folder.name} \xBB sera supprim\xE9. Ses favoris resteront disponibles sans dossier.`,
            confirmLabel: "Supprimer",
            danger: true
          });
          if (!confirmed) {
            return;
          }
          try {
            const result = await this.api.deleteFavoriteFolder(folder.id);
            if (this.activeFolderId === folder.id) {
              this.activeFolderId = ALL_FOLDERS;
            }
            this.applyData({
              favorites: result.favorites || this.favorites,
              folders: result.folders || this.folders
            });
            this.showToast?.("Dossier supprim\xE9.", "info");
          } catch (error) {
            this.showToast?.(
              `Suppression impossible : ${error.message}`,
              "error"
            );
          }
        }
        /**
         * Crée un dossier à partir du formulaire intégré.
         * @returns {Promise<void>}
         */
        async #createFolder() {
          const name = this.folderNameInput.value.trim();
          if (!name) {
            this.folderNameInput.focus();
            return;
          }
          try {
            const result = await this.api.createFavoriteFolder(name);
            if (Array.isArray(result?.folders)) {
              this.applyFolders(result.folders);
            }
            if (result?.folder?.id) {
              this.activeFolderId = result.folder.id;
              this.render();
            }
            this.folderForm.hidden = true;
            this.folderNameInput.value = "";
            this.showToast?.("Dossier cr\xE9\xE9.", "info");
          } catch (error) {
            this.showToast?.(
              `Cr\xE9ation impossible : ${error.message}`,
              "error"
            );
          }
        }
        /**
         * Importe des favoris depuis un fichier JSON.
         * @returns {Promise<void>}
         */
        async #import() {
          this.importButton.disabled = true;
          try {
            const result = await this.api.importFavorites();
            if (result?.canceled) {
              return;
            }
            if (!result?.ok) {
              this.showToast?.(
                result?.message || "Import impossible.",
                "error"
              );
              return;
            }
            this.applyData({
              favorites: result.favorites || this.favorites,
              folders: result.folders || this.folders
            });
            const favoriteCount = result.importedFavorites || 0;
            const folderCount = result.importedFolders || 0;
            this.showToast?.(
              `Import termin\xE9 : ${favoriteCount} favori(s), ${folderCount} dossier(s).`,
              "success"
            );
          } catch (error) {
            this.showToast?.(`Import impossible : ${error.message}`, "error");
          } finally {
            this.importButton.disabled = false;
          }
        }
        /**
         * Exporte les favoris dans un fichier JSON.
         * @returns {Promise<void>}
         */
        async #export() {
          this.exportButton.disabled = true;
          try {
            const result = await this.api.exportFavorites();
            if (result?.canceled) {
              return;
            }
            if (!result?.ok) {
              this.showToast?.(
                result?.message || "Export impossible.",
                "error"
              );
              return;
            }
            this.showToast?.("Favoris export\xE9s.", "success");
          } catch (error) {
            this.showToast?.(`Export impossible : ${error.message}`, "error");
          } finally {
            this.exportButton.disabled = false;
          }
        }
        /**
         * Branche les actions du panneau.
         */
        #bind() {
          this.newFolderButton.addEventListener("click", () => {
            this.folderForm.hidden = false;
            this.folderNameInput.focus();
          });
          this.folderCancelButton.addEventListener("click", () => {
            this.folderForm.hidden = true;
            this.folderNameInput.value = "";
          });
          this.folderForm.addEventListener("submit", (event) => {
            event.preventDefault();
            void this.#createFolder();
          });
          this.importButton.addEventListener("click", () => {
            void this.#import();
          });
          this.exportButton.addEventListener("click", () => {
            void this.#export();
          });
        }
        /**
         * Retourne les favoris correspondant au dossier actif.
         * @returns {object[]}
         */
        #getVisibleFavorites() {
          if (this.activeFolderId === ALL_FOLDERS) {
            return this.favorites;
          }
          if (this.activeFolderId === NO_FOLDER) {
            return this.favorites.filter((entry) => !entry.folderId);
          }
          return this.favorites.filter(
            (entry) => entry.folderId === this.activeFolderId
          );
        }
        /**
         * Retourne le dossier cible lors de l'ajout d'un favori.
         * @returns {string | null}
         */
        #resolveTargetFolder() {
          if (this.activeFolderId === ALL_FOLDERS || this.activeFolderId === NO_FOLDER) {
            return null;
          }
          return this.folders.some((folder) => folder.id === this.activeFolderId) ? this.activeFolderId : null;
        }
        /**
         * Vérifie que le dossier actif existe encore.
         */
        #ensureActiveFolder() {
          if (this.activeFolderId === ALL_FOLDERS || this.activeFolderId === NO_FOLDER || this.folders.some((folder) => folder.id === this.activeFolderId)) {
            return;
          }
          this.activeFolderId = ALL_FOLDERS;
        }
        /**
         * Normalise les favoris et rattache les dossiers connus.
         * @param {unknown} list
         * @param {object[]} folders
         * @returns {object[]}
         */
        #normalizeFavorites(list, folders) {
          const folderIds = new Set(folders.map((folder) => folder.id));
          return Array.isArray(list) ? list.filter((entry) => entry && isHttpUrl(entry.url)).map((entry) => ({
            ...entry,
            folderId: entry.folderId && folderIds.has(entry.folderId) ? entry.folderId : null
          })).sort(
            (a, b) => Date.parse(b.addedAt || 0) - Date.parse(a.addedAt || 0)
          ) : [];
        }
        /**
         * Normalise les dossiers.
         * @param {unknown} list
         * @returns {object[]}
         */
        #normalizeFolders(list) {
          return Array.isArray(list) ? list.filter(
            (folder) => folder && typeof folder.id === "string" && typeof folder.name === "string"
          ) : [];
        }
        /**
         * Formate la date d'ajout.
         * @param {string} value
         * @returns {string}
         */
        #formatDate(value) {
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) {
            return "date inconnue";
          }
          return favoriteDateFormatter.format(date);
        }
      };
      module.exports = { FavoritesPanel };
    }
  });

  // src/renderer/js/ui/findBar.js
  var require_findBar = __commonJS({
    "src/renderer/js/ui/findBar.js"(exports, module) {
      "use strict";
      var SEARCH_DELAY = 160;
      var FindBar = class {
        /**
         * @param {object} options
         * @param {object} options.elements
         * @param {HTMLElement} options.elements.bar
         * @param {HTMLInputElement} options.elements.input
         * @param {HTMLElement} options.elements.count
         * @param {HTMLButtonElement} options.elements.previousButton
         * @param {HTMLButtonElement} options.elements.nextButton
         * @param {HTMLButtonElement} options.elements.closeButton
         * @param {() => object | null} options.getActiveTab
         */
        constructor({
          elements,
          getActiveTab
        }) {
          this.elements = elements;
          this.getActiveTab = getActiveTab;
          this.activeTab = null;
          this.searchTimer = null;
          this.#bind();
        }
        /**
         * Indique si la barre est ouverte.
         * @returns {boolean}
         */
        get isOpen() {
          return !this.elements.bar.hidden;
        }
        /**
         * Ouvre la barre et pré-remplit avec la sélection de la page.
         * @returns {Promise<void>}
         */
        async open() {
          const tab = this.getActiveTab();
          if (!tab) {
            return;
          }
          if (this.activeTab && this.activeTab !== tab) {
            this.activeTab.stopFindInPage();
          }
          this.activeTab = tab;
          this.elements.bar.hidden = false;
          this.elements.input.focus();
          this.elements.input.select();
          const selectedText = await tab.getSelectionText();
          if (!this.isOpen || this.activeTab !== tab || !selectedText) {
            return;
          }
          this.elements.input.value = selectedText;
          this.elements.input.select();
          this.#search({ forward: true, findNext: false });
        }
        /**
         * Ferme la barre.
         * @param {{restoreFocus?: boolean}} [options]
         */
        close({ restoreFocus = true } = {}) {
          if (!this.isOpen && !this.activeTab) {
            return;
          }
          this.#clearTimer();
          if (this.activeTab) {
            this.activeTab.stopFindInPage();
          }
          this.elements.bar.hidden = true;
          this.elements.count.textContent = "";
          this.elements.bar.classList.remove("is-empty");
          this.activeTab = null;
          if (restoreFocus) {
            const tab = this.getActiveTab();
            if (tab) {
              try {
                tab.webview.focus();
              } catch {
              }
            }
          }
        }
        /**
         * Passe à la correspondance suivante.
         */
        next() {
          this.#search({ forward: true, findNext: true });
        }
        /**
         * Passe à la correspondance précédente.
         */
        previous() {
          this.#search({ forward: false, findNext: true });
        }
        /**
         * Met à jour le compteur à partir d'un résultat Electron.
         * @param {object} tab
         * @param {object} result
         */
        handleResult(tab, result) {
          if (!this.isOpen || tab !== this.activeTab) {
            return;
          }
          const matches = Number.isInteger(result?.matches) ? result.matches : 0;
          const activeMatch = Number.isInteger(result?.activeMatchOrdinal) ? result.activeMatchOrdinal : 0;
          this.elements.count.textContent = matches ? `${activeMatch} / ${matches}` : "0 r\xE9sultat";
          this.elements.bar.classList.toggle("is-empty", matches === 0);
        }
        /**
         * Lance une recherche dans l'onglet actif.
         * @param {{forward?: boolean, findNext?: boolean}} [options]
         */
        #search({ forward = true, findNext = false } = {}) {
          this.#clearTimer();
          const tab = this.activeTab || this.getActiveTab();
          const text = this.elements.input.value.trim();
          if (!tab || !text) {
            if (tab) {
              tab.stopFindInPage();
            }
            this.elements.count.textContent = "";
            this.elements.bar.classList.remove("is-empty");
            return;
          }
          this.activeTab = tab;
          tab.findInPage(text, { forward, findNext });
        }
        /**
         * Programme une recherche pendant la saisie.
         */
        #scheduleSearch() {
          this.#clearTimer();
          this.searchTimer = setTimeout(() => {
            this.searchTimer = null;
            this.#search({ forward: true, findNext: false });
          }, SEARCH_DELAY);
        }
        /**
         * Annule la recherche différée.
         */
        #clearTimer() {
          if (this.searchTimer) {
            clearTimeout(this.searchTimer);
            this.searchTimer = null;
          }
        }
        /**
         * Branche les interactions de la barre.
         */
        #bind() {
          this.elements.input.addEventListener("input", () => {
            this.#scheduleSearch();
          });
          this.elements.input.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              this.close();
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (event.shiftKey) {
                this.previous();
              } else {
                this.next();
              }
            }
          });
          this.elements.previousButton.addEventListener("click", () => {
            this.previous();
          });
          this.elements.nextButton.addEventListener("click", () => {
            this.next();
          });
          this.elements.closeButton.addEventListener("click", () => {
            this.close();
          });
        }
      };
      module.exports = { FindBar };
    }
  });

  // src/renderer/js/ui/history.js
  var require_history = __commonJS({
    "src/renderer/js/ui/history.js"(exports, module) {
      "use strict";
      var { getHostname, isHttpUrl } = require_utils();
      var { createEmptyState } = require_dialog();
      var historyDateFormatter = new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short"
      });
      var HistoryPanel = class {
        /**
         * @param {object} options
         * @param {HTMLDialogElement} options.dialog
         * @param {HTMLElement} options.list
         * @param {HTMLElement} options.count
         * @param {HTMLButtonElement} options.clearButton
         * @param {object} options.api
         * @param {import('./dialog').DialogController} options.dialogs
         * @param {(url: string) => void} options.onNavigate
         * @param {(message: string, variant?: string) => void} options.showToast
         */
        constructor({
          dialog,
          list,
          count,
          clearButton,
          api,
          dialogs,
          onNavigate,
          showToast
        }) {
          this.dialog = dialog;
          this.list = list;
          this.count = count;
          this.clearButton = clearButton;
          this.api = api;
          this.dialogs = dialogs;
          this.onNavigate = onNavigate;
          this.showToast = showToast;
          this.entries = [];
          this.#setup();
        }
        /**
         * Indique si le panneau est ouvert.
         * @returns {boolean}
         */
        get isOpen() {
          return this.dialog.open;
        }
        /**
         * Ouvre le panneau après rechargement.
         * @returns {Promise<void>}
         */
        async open() {
          await this.refresh();
          this.dialogs.show(this.dialog);
        }
        /**
         * Recharge l'historique depuis le processus principal.
         * @returns {Promise<void>}
         */
        async refresh() {
          try {
            const entries = await this.api.listHistory();
            this.entries = Array.isArray(entries) ? entries.filter((entry) => entry && isHttpUrl(entry.url)) : [];
          } catch (error) {
            console.warn("[Historique] Lecture impossible :", error.message);
            this.entries = [];
            this.showToast?.(
              `Historique indisponible : ${error.message}`,
              "error"
            );
          }
          this.render();
        }
        /**
         * Construit la liste des visites.
         */
        render() {
          this.list.replaceChildren();
          const count = this.entries.length;
          const plural = count > 1 ? "s" : "";
          this.count.textContent = count === 0 ? "Aucune visite" : `${count} visite${plural}`;
          this.clearButton.disabled = count === 0;
          if (count === 0) {
            this.list.append(
              createEmptyState(
                "Aucune visite",
                "Les pages que vous ouvrez appara\xEEtront ici."
              )
            );
            return;
          }
          const fragment = document.createDocumentFragment();
          for (const entry of this.entries) {
            const item = document.createElement("article");
            item.className = "history-item";
            const openButton = document.createElement("button");
            openButton.type = "button";
            openButton.className = "history-entry";
            openButton.title = entry.url;
            const title = document.createElement("span");
            title.className = "history-entry__title";
            title.textContent = entry.title || getHostname(entry.url);
            const meta = document.createElement("span");
            meta.className = "history-entry__meta";
            meta.textContent = this.#formatDate(entry.visitedAt);
            const url = document.createElement("span");
            url.className = "history-entry__url";
            url.textContent = entry.url;
            openButton.append(title, meta, url);
            openButton.addEventListener("click", () => {
              this.dialog.close();
              this.onNavigate(entry.url);
            });
            item.append(openButton);
            fragment.append(item);
          }
          this.list.append(fragment);
        }
        /**
         * Formate une date ISO pour l'affichage.
         * @param {string} value
         * @returns {string}
         */
        #formatDate(value) {
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) {
            return "Date inconnue";
          }
          return historyDateFormatter.format(date);
        }
        /**
         * Installe l'action d'effacement.
         */
        #setup() {
          this.clearButton.addEventListener("click", async () => {
            const confirmed = await this.dialogs.askConfirmation({
              title: "Effacer tout l\u2019historique ?",
              message: "Toutes les visites enregistr\xE9es seront supprim\xE9es. Cette action est irr\xE9versible.",
              confirmLabel: "Effacer l\u2019historique",
              danger: true
            });
            if (!confirmed) {
              return;
            }
            this.clearButton.disabled = true;
            try {
              const result = await this.api.clearHistory();
              if (!result?.ok) {
                throw new Error("Le processus principal a refus\xE9 l\u2019op\xE9ration.");
              }
              await this.refresh();
              this.showToast?.("Historique effac\xE9.", "success");
            } catch (error) {
              this.showToast?.(
                `Effacement impossible : ${error.message}`,
                "error"
              );
              await this.refresh();
            }
          });
        }
      };
      module.exports = { HistoryPanel };
    }
  });

  // src/renderer/js/ui/library.js
  var require_library = __commonJS({
    "src/renderer/js/ui/library.js"(exports, module) {
      "use strict";
      var { formatBytes } = require_utils();
      var DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium"
      });
      var NAME_COLLATOR = new Intl.Collator("fr", {
        numeric: true,
        sensitivity: "base"
      });
      function formatMediaDuration(seconds) {
        const total = Math.max(0, Math.round(Number(seconds) || 0));
        if (!Number.isFinite(total) || total <= 0) {
          return "";
        }
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor(total % 3600 / 60);
        const remaining = total % 60;
        return [
          String(hours).padStart(2, "0"),
          String(minutes).padStart(2, "0"),
          String(remaining).padStart(2, "0")
        ].join(":");
      }
      function getPlaybackProgress(entry) {
        const duration = Math.max(0, Number(entry?.durationSeconds) || 0);
        const position = Math.max(0, Number(entry?.playPosition) || 0);
        if (duration <= 0 || position <= 0) {
          return { ratio: 0, position, duration };
        }
        return {
          ratio: Math.min(1, position / duration),
          position,
          duration
        };
      }
      function sortLibraryEntries(entries, sortKey) {
        const list = Array.isArray(entries) ? [...entries] : [];
        const key = typeof sortKey === "string" ? sortKey : "date-desc";
        return list.sort((left, right) => {
          if (key === "name-asc") {
            return NAME_COLLATOR.compare(left.title || "", right.title || "") || NAME_COLLATOR.compare(left.fileName || "", right.fileName || "");
          }
          if (key === "duration-desc") {
            return (Number(right.durationSeconds) || 0) - (Number(left.durationSeconds) || 0) || NAME_COLLATOR.compare(left.title || "", right.title || "");
          }
          return (Date.parse(right.addedAt) || 0) - (Date.parse(left.addedAt) || 0) || NAME_COLLATOR.compare(left.title || "", right.title || "");
        });
      }
      function formatDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : DATE_FORMATTER.format(date);
      }
      var LibraryPanel = class {
        /**
         * @param {object} options
         * @param {HTMLDialogElement} options.dialog
         * @param {HTMLElement} options.list
         * @param {HTMLElement} options.count
         * @param {HTMLInputElement} options.search
         * @param {HTMLSelectElement} options.filter
         * @param {HTMLSelectElement} [options.sort]
         * @param {HTMLButtonElement} options.importButton
         * @param {HTMLElement} options.empty
         * @param {HTMLButtonElement} options.emptyImportButton
         * @param {HTMLDialogElement} options.renameDialog
         * @param {HTMLInputElement} options.renameInput
         * @param {HTMLElement} options.renameError
         * @param {HTMLButtonElement} options.renameConfirm
         * @param {object} options.api
         * @param {import('./dialog').DialogController} options.dialogs
         * @param {import('./player').MediaPlayer} options.player
         * @param {(message: string, variant?: string) => void} [options.showToast]
         */
        constructor({
          dialog,
          list,
          count,
          search,
          filter,
          sort,
          importButton,
          empty,
          emptyImportButton,
          renameDialog,
          renameInput,
          renameError,
          renameConfirm,
          api,
          dialogs,
          player,
          showToast
        }) {
          this.dialog = dialog;
          this.list = list;
          this.count = count;
          this.search = search;
          this.filter = filter;
          this.sort = sort || null;
          this.importButton = importButton;
          this.empty = empty;
          this.emptyImportButton = emptyImportButton;
          this.renameDialog = renameDialog;
          this.renameInput = renameInput;
          this.renameError = renameError;
          this.renameConfirm = renameConfirm;
          this.api = api;
          this.dialogs = dialogs;
          this.player = player;
          this.showToast = showToast;
          this.entries = [];
          this.currentRenameId = null;
          this.#setup();
        }
        /**
         * Indique si la médiathèque est ouverte.
         * @returns {boolean}
         */
        get isOpen() {
          return this.dialog.open;
        }
        /**
         * Ouvre la médiathèque après rechargement.
         * @returns {Promise<void>}
         */
        async open() {
          await this.refresh();
          this.dialogs.show(this.dialog);
        }
        /**
         * Recharge les fiches depuis le processus principal.
         * @returns {Promise<void>}
         */
        async refresh() {
          try {
            const entries = await this.api.listLibrary();
            this.entries = Array.isArray(entries) ? entries.filter(
              (entry) => entry && typeof entry.id === "string" && typeof entry.title === "string"
            ) : [];
          } catch (error) {
            console.warn("[M\xE9diath\xE8que] Lecture impossible :", error.message);
            this.showToast?.(
              `M\xE9diath\xE8que indisponible : ${error.message}`,
              "error"
            );
          }
          this.render();
        }
        /**
         * Réagit à une modification signalée par le processus principal.
         */
        handleChanged() {
          if (this.dialog.open) {
            void this.refresh();
          }
        }
        /**
         * Affiche les fiches correspondant à la recherche et au filtre.
         */
        render() {
          const body = this.dialog.querySelector(".modal__body");
          const scrollTop = body?.scrollTop || 0;
          const query = this.search.value.trim().toLocaleLowerCase("fr");
          const filter = this.filter.value;
          const visible = sortLibraryEntries(
            this.entries.filter((entry) => {
              if (filter !== "all" && entry.kind !== filter) {
                return false;
              }
              if (!query) {
                return true;
              }
              const haystack = [
                entry.title,
                entry.fileName,
                entry.streamType || "",
                entry.source === "import" ? "import\xE9" : "t\xE9l\xE9charg\xE9"
              ].join(" ").toLocaleLowerCase("fr");
              return haystack.includes(query);
            }),
            this.sort?.value
          );
          this.list.replaceChildren();
          this.list.hidden = visible.length === 0;
          const total = this.entries.length;
          const plural = total > 1 ? "s" : "";
          if (total === 0) {
            this.count.textContent = "Aucun m\xE9dia";
          } else if (visible.length === total) {
            this.count.textContent = `${total} m\xE9dia${plural}`;
          } else {
            this.count.textContent = `${visible.length} / ${total} m\xE9dia${plural}`;
          }
          this.empty.hidden = visible.length > 0;
          if (visible.length === 0) {
            const libraryIsEmpty = total === 0;
            const title = this.empty.querySelector(".library-empty__title");
            const text = this.empty.querySelector(".library-empty__text");
            if (title) {
              title.textContent = libraryIsEmpty ? "Votre m\xE9diath\xE8que est vide." : "Aucun r\xE9sultat.";
            }
            if (text) {
              text.textContent = libraryIsEmpty ? "Les vid\xE9os et fichiers audio termin\xE9s apparaissent ici automatiquement. Vous pouvez aussi importer un fichier local." : "Essayez un autre terme, changez le filtre de type ou le tri.";
            }
            this.emptyImportButton.hidden = !libraryIsEmpty;
          }
          if (visible.length > 0) {
            const fragment = document.createDocumentFragment();
            for (const entry of visible) {
              fragment.append(this.#createCard(entry));
            }
            this.list.append(fragment);
          }
          if (body) {
            body.scrollTop = scrollTop;
          }
        }
        /**
         * Construit une carte de média.
         * @param {object} entry
         * @returns {HTMLElement}
         */
        #createCard(entry) {
          const card = document.createElement("article");
          card.className = "library-card";
          card.dataset.id = entry.id;
          if (!entry.available) {
            card.classList.add("is-missing");
          }
          const preview = document.createElement("button");
          preview.className = "library-card__preview";
          preview.type = "button";
          preview.dataset.action = "play";
          preview.disabled = !entry.available;
          preview.title = entry.available ? `Lire ${entry.title}` : "Fichier introuvable";
          preview.setAttribute("aria-label", preview.title);
          if (entry.thumbnailUrl) {
            const image = document.createElement("img");
            image.className = "library-card__image";
            image.src = entry.thumbnailUrl;
            image.alt = "";
            image.loading = "lazy";
            image.decoding = "async";
            image.addEventListener(
              "error",
              () => {
                image.remove();
                preview.prepend(this.#createPlaceholder(entry));
              },
              { once: true }
            );
            preview.append(image);
          } else {
            preview.append(this.#createPlaceholder(entry));
          }
          const duration = formatMediaDuration(entry.durationSeconds);
          const progress = getPlaybackProgress(entry);
          if (duration) {
            const badge = document.createElement("span");
            badge.className = "library-card__duration";
            badge.textContent = duration;
            preview.append(badge);
          }
          if (progress.ratio > 0 && progress.ratio < 0.995) {
            const track = document.createElement("span");
            track.className = "library-card__progress";
            track.setAttribute("role", "progressbar");
            track.setAttribute("aria-label", "Progression de lecture");
            track.setAttribute("aria-valuemin", "0");
            track.setAttribute("aria-valuemax", "100");
            track.setAttribute("aria-valuenow", String(
              Math.round(progress.ratio * 100)
            ));
            const fill = document.createElement("span");
            fill.className = "library-card__progress-fill";
            fill.style.width = `${Math.round(progress.ratio * 100)}%`;
            track.append(fill);
            preview.append(track);
          }
          if (entry.streamType) {
            const streamBadge = document.createElement("span");
            streamBadge.className = "library-card__badge";
            streamBadge.textContent = entry.streamType === "dash" ? "DASH" : "HLS";
            preview.append(streamBadge);
          }
          const body = document.createElement("div");
          body.className = "library-card__body";
          const title = document.createElement("h3");
          title.className = "library-card__title";
          title.textContent = entry.title;
          title.title = entry.fileName;
          const meta = document.createElement("p");
          meta.className = "library-card__meta";
          const metaParts = [formatBytes(Number(entry.size) || 0)];
          if (Number(entry.width) > 0 && Number(entry.height) > 0) {
            metaParts.push(`${entry.width}\xD7${entry.height}`);
          }
          const added = formatDate(entry.addedAt);
          if (added) {
            metaParts.push(added);
          }
          meta.textContent = metaParts.join(" \xB7 ");
          const file = document.createElement("p");
          file.className = "library-card__file";
          file.textContent = entry.fileName;
          file.title = entry.fileName;
          body.append(title, meta, file);
          if (progress.ratio > 0 && progress.ratio < 0.995) {
            const resume = document.createElement("p");
            resume.className = "library-card__resume";
            resume.textContent = `Reprendre \xE0 ${formatMediaDuration(
              progress.position
            )}`;
            body.append(resume);
          }
          if (!entry.available) {
            const missing = document.createElement("p");
            missing.className = "library-card__missing";
            missing.textContent = "Fichier introuvable";
            body.append(missing);
          }
          const actions = document.createElement("div");
          actions.className = "library-card__actions";
          actions.append(
            this.#createAction("play", "Lire", !entry.available),
            this.#createAction("reveal", "Dossier", !entry.available),
            this.#createAction("rename", "Renommer", !entry.available),
            this.#createAction("delete", "Supprimer", false, true)
          );
          body.append(actions);
          card.append(preview, body);
          return card;
        }
        /**
         * Crée le visuel de remplacement d'une miniature.
         * @param {object} entry
         * @returns {HTMLElement}
         */
        #createPlaceholder(entry) {
          const placeholder = document.createElement("span");
          placeholder.className = "library-card__placeholder";
          placeholder.textContent = entry.kind === "audio" ? "\u266A" : "\u25B6";
          placeholder.setAttribute("aria-hidden", "true");
          return placeholder;
        }
        /**
         * Crée un bouton d'action de carte.
         * @param {string} action
         * @param {string} label
         * @param {boolean} disabled
         * @param {boolean} [danger]
         * @returns {HTMLButtonElement}
         */
        #createAction(action, label, disabled, danger = false) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = danger ? "library-action library-action--danger" : "library-action";
          button.dataset.action = action;
          button.textContent = label;
          button.disabled = disabled;
          return button;
        }
        /**
         * Installe les interactions du panneau.
         */
        #setup() {
          this.search.addEventListener("input", () => this.render());
          this.filter.addEventListener("change", () => this.render());
          this.sort?.addEventListener("change", () => this.render());
          this.importButton.addEventListener("click", () => {
            void this.#importFiles();
          });
          this.emptyImportButton.addEventListener("click", () => {
            void this.#importFiles();
          });
          this.list.addEventListener("click", (event) => {
            const button = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
            if (!button || !this.list.contains(button)) {
              return;
            }
            const card = button.closest(".library-card");
            const id = card?.dataset.id || "";
            const entry = this.entries.find((candidate) => candidate.id === id);
            if (!entry) {
              return;
            }
            switch (button.dataset.action) {
              case "play":
                void this.#play(entry);
                break;
              case "reveal":
                void this.#reveal(entry);
                break;
              case "rename":
                this.#openRename(entry);
                break;
              case "delete":
                void this.#delete(entry);
                break;
              default:
                break;
            }
          });
          this.renameConfirm.addEventListener("click", () => {
            void this.#confirmRename();
          });
          this.renameInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void this.#confirmRename();
            }
          });
          this.renameDialog.addEventListener("close", () => {
            this.currentRenameId = null;
            this.renameError.hidden = true;
            this.renameError.textContent = "";
          });
        }
        /**
         * Lance la lecture d'une fiche.
         * @param {object} entry
         * @returns {Promise<void>}
         */
        async #play(entry) {
          if (!entry.available) {
            this.showToast?.("Le fichier est introuvable.", "error");
            return;
          }
          this.player.open(entry);
        }
        /**
         * Affiche une fiche dans le gestionnaire de fichiers.
         * @param {object} entry
         * @returns {Promise<void>}
         */
        async #reveal(entry) {
          try {
            const result = await this.api.revealLibraryEntry(entry.id);
            if (!result?.ok) {
              this.showToast?.(result?.message || "Fichier introuvable.", "error");
            }
          } catch (error) {
            this.showToast?.(`Dossier inaccessible : ${error.message}`, "error");
          }
        }
        /**
         * Ouvre la modale de renommage.
         * @param {object} entry
         */
        #openRename(entry) {
          this.currentRenameId = entry.id;
          this.renameInput.value = entry.fileName;
          this.renameError.hidden = true;
          this.renameError.textContent = "";
          this.renameError.dataset.variant = "error";
          this.dialogs.show(this.renameDialog);
          requestAnimationFrame(() => {
            this.renameInput.focus();
            const dot = entry.fileName.lastIndexOf(".");
            const end = dot > 0 ? dot : entry.fileName.length;
            this.renameInput.setSelectionRange(0, end);
          });
        }
        /**
         * Valide le renommage courant.
         * @returns {Promise<void>}
         */
        async #confirmRename() {
          const id = this.currentRenameId;
          const name = this.renameInput.value.trim();
          if (!id) {
            return;
          }
          if (!name) {
            this.renameError.textContent = "Le nom ne peut pas \xEAtre vide.";
            this.renameError.hidden = false;
            this.renameInput.focus();
            return;
          }
          this.renameConfirm.disabled = true;
          try {
            const result = await this.api.renameLibraryEntry(id, name);
            if (!result?.ok) {
              this.renameError.textContent = result?.message || "Renommage impossible.";
              this.renameError.hidden = false;
              return;
            }
            this.renameDialog.close();
            this.showToast?.("M\xE9dia renomm\xE9.", "success");
            await this.refresh();
          } catch (error) {
            this.renameError.textContent = `Renommage impossible : ${error.message}`;
            this.renameError.hidden = false;
          } finally {
            this.renameConfirm.disabled = false;
          }
        }
        /**
         * Supprime une fiche et son fichier après confirmation.
         * @param {object} entry
         * @returns {Promise<void>}
         */
        async #delete(entry) {
          const confirmed = await this.dialogs.askConfirmation({
            title: "Supprimer ce m\xE9dia ?",
            message: `Le fichier \xAB ${entry.fileName} \xBB sera supprim\xE9 du disque. Cette action est irr\xE9versible.`,
            confirmLabel: "Supprimer",
            danger: true
          });
          if (!confirmed) {
            return;
          }
          try {
            const result = await this.api.removeLibraryEntry(entry.id, true);
            if (!result?.ok) {
              this.showToast?.(
                result?.message || "Suppression impossible.",
                "error"
              );
              return;
            }
            this.showToast?.("M\xE9dia supprim\xE9.", "success");
            await this.refresh();
          } catch (error) {
            this.showToast?.(`Suppression impossible : ${error.message}`, "error");
          }
        }
        /**
         * Ouvre le sélecteur de fichiers et importe les médias choisis.
         * @returns {Promise<void>}
         */
        async #importFiles() {
          this.importButton.disabled = true;
          this.emptyImportButton.disabled = true;
          try {
            const result = await this.api.importLibraryFiles();
            if (!result || result.canceled) {
              return;
            }
            if (!result.ok) {
              this.showToast?.(
                result.message || "Importation impossible.",
                "error"
              );
              return;
            }
            if (result.added > 0) {
              const plural = result.added > 1 ? "s" : "";
              this.showToast?.(
                `${result.added} m\xE9dia${plural} import\xE9${plural}.`,
                "success"
              );
            } else {
              this.showToast?.("Aucun nouveau m\xE9dia import\xE9.", "info");
            }
            await this.refresh();
          } catch (error) {
            this.showToast?.(`Importation impossible : ${error.message}`, "error");
          } finally {
            this.importButton.disabled = false;
            this.emptyImportButton.disabled = false;
          }
        }
      };
      module.exports = {
        LibraryPanel,
        formatMediaDuration,
        getPlaybackProgress,
        sortLibraryEntries
      };
    }
  });

  // src/renderer/js/ui/mediaOptions.js
  var require_mediaOptions = __commonJS({
    "src/renderer/js/ui/mediaOptions.js"(exports, module) {
      "use strict";
      var {
        formatDuration,
        getHostname,
        getStreamType
      } = require_utils();
      function getTrackLabel(track, position) {
        const language = typeof track.language === "string" && track.language ? track.language.toUpperCase() : "";
        const title = typeof track.title === "string" && track.title ? track.title : "";
        const codec = typeof track.codec === "string" && track.codec ? track.codec.toUpperCase() : "piste";
        const channels = Number(track.channels) === 1 ? "mono" : Number(track.channels) === 2 ? "st\xE9r\xE9o" : Number(track.channels) > 2 ? `${track.channels} canaux` : "";
        const details = [codec, channels].filter(Boolean).join(" \xB7 ");
        const name = language || title || `Piste ${position + 1}`;
        return title && title !== name ? `${name} \u2014 ${title} (${details})` : `${name} (${details})`;
      }
      var MediaOptionsDialog = class {
        /**
         * @param {object} options
         * @param {HTMLDialogElement} options.dialog
         * @param {HTMLElement} options.summary
         * @param {HTMLElement} options.liveNotice
         * @param {HTMLSelectElement} options.audioSelect
         * @param {HTMLSelectElement} options.subtitleSelect
         * @param {HTMLButtonElement} options.startButton
         * @param {HTMLButtonElement} options.cancelButton
         * @param {HTMLButtonElement} options.closeButton
         * @param {(media: object, selection: object) => void} options.onStart
         */
        constructor({
          dialog,
          summary,
          liveNotice,
          audioSelect,
          subtitleSelect,
          startButton,
          cancelButton,
          closeButton,
          onStart
        }) {
          this.dialog = dialog;
          this.summary = summary;
          this.liveNotice = liveNotice;
          this.audioSelect = audioSelect;
          this.subtitleSelect = subtitleSelect;
          this.startButton = startButton;
          this.cancelButton = cancelButton;
          this.closeButton = closeButton;
          this.onStart = onStart;
          this.media = null;
          this.prepared = null;
          this.cancelButton.addEventListener("click", () => this.close());
          this.closeButton.addEventListener("click", () => this.close());
          this.dialog.addEventListener("cancel", (event) => {
            event.preventDefault();
            this.close();
          });
          this.startButton.addEventListener("click", () => this.#start());
        }
        /**
         * Ouvre la boîte avec le résultat de l'analyse.
         * @param {object} media
         * @param {object} prepared
         */
        open(media, prepared) {
          this.media = media;
          this.prepared = prepared;
          const streamType = getStreamType(media.extension);
          const duration = formatDuration(prepared.durationSeconds);
          const pieces = [
            getHostname(media.url),
            streamType ? streamType.toUpperCase() : "Flux"
          ];
          if (duration) {
            pieces.push(duration);
          }
          this.summary.textContent = pieces.join(" \xB7 ");
          this.liveNotice.hidden = !prepared.isLive;
          this.#fillTracks(
            this.audioSelect,
            prepared.metadata?.audioTracks || [],
            "Piste audio par d\xE9faut",
            true
          );
          this.#fillTracks(
            this.subtitleSelect,
            prepared.metadata?.subtitleTracks || [],
            "Aucun sous-titre",
            false
          );
          if (!this.dialog.open) {
            this.dialog.showModal();
          }
        }
        /**
         * Ferme la boîte.
         */
        close() {
          if (this.dialog.open) {
            this.dialog.close();
          }
          this.media = null;
          this.prepared = null;
        }
        /**
         * Remplit une liste de pistes.
         * @param {HTMLSelectElement} select
         * @param {object[]} tracks
         * @param {string} emptyLabel
         * @param {boolean} preferDefault
         */
        #fillTracks(select, tracks, emptyLabel, preferDefault) {
          select.replaceChildren();
          if (!Array.isArray(tracks) || tracks.length === 0) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = emptyLabel;
            select.append(option);
            select.disabled = true;
            return;
          }
          select.disabled = false;
          if (preferDefault) {
            const automatic = document.createElement("option");
            automatic.value = "";
            automatic.textContent = "Automatique (piste par d\xE9faut)";
            select.append(automatic);
          } else {
            const none = document.createElement("option");
            none.value = "";
            none.textContent = emptyLabel;
            select.append(none);
          }
          let selectedValue = "";
          for (const [position, track] of tracks.entries()) {
            if (!Number.isInteger(track.index) || track.index < 0) {
              continue;
            }
            const option = document.createElement("option");
            option.value = String(track.index);
            option.textContent = getTrackLabel(track, position);
            select.append(option);
            if (preferDefault && selectedValue === "" && track.isDefault) {
              selectedValue = option.value;
            }
          }
          if (preferDefault && selectedValue === "" && select.options.length > 1) {
            selectedValue = select.options[1].value;
          }
          select.value = selectedValue;
        }
        /**
         * Transmet la sélection au démarrage du téléchargement.
         */
        #start() {
          if (!this.media || !this.prepared) {
            return;
          }
          const audioValue = Number(this.audioSelect.value);
          const subtitleValue = Number(this.subtitleSelect.value);
          const media = this.media;
          const prepared = this.prepared;
          this.close();
          this.onStart(media, {
            audioStreamIndex: this.audioSelect.value !== "" && Number.isInteger(audioValue) ? audioValue : null,
            subtitleStreamIndex: this.subtitleSelect.value !== "" && Number.isInteger(subtitleValue) ? subtitleValue : null,
            isLive: Boolean(prepared.isLive)
          });
        }
      };
      module.exports = { MediaOptionsDialog, getTrackLabel };
    }
  });

  // src/renderer/js/ui/linkDownload.js
  var require_linkDownload = __commonJS({
    "src/renderer/js/ui/linkDownload.js"(exports, module) {
      "use strict";
      var {
        formatBytes,
        getHostname,
        isDirectFileUrl,
        isHttpUrl
      } = require_utils();
      var { getTrackLabel } = require_mediaOptions();
      var LinkDownloadDialog = class {
        /**
         * @param {object} options
         * @param {HTMLDialogElement} options.dialog
         * @param {object} options.elements
         * @param {HTMLInputElement} options.elements.url
         * @param {HTMLButtonElement} options.elements.analyze
         * @param {HTMLElement} options.elements.result
         * @param {HTMLElement} options.elements.name
         * @param {HTMLElement} options.elements.type
         * @param {HTMLElement} options.elements.meta
         * @param {HTMLElement} options.elements.warning
         * @param {HTMLElement} options.elements.audioField
         * @param {HTMLSelectElement} options.elements.audioSelect
         * @param {HTMLElement} options.elements.subtitleField
         * @param {HTMLSelectElement} options.elements.subtitleSelect
         * @param {HTMLElement} options.elements.status
         * @param {HTMLButtonElement} options.elements.start
         * @param {HTMLButtonElement} options.elements.cancel
         * @param {HTMLButtonElement} options.elements.close
         * @param {object} options.api
         * @param {import('./dialog').DialogController} options.dialogs
         * @param {() => object | null} options.getActiveTab
         * @param {(message: string, variant?: string) => void} options.showToast
         */
        constructor({
          dialog,
          elements,
          api,
          dialogs,
          getActiveTab,
          showToast
        }) {
          this.dialog = dialog;
          this.elements = elements;
          this.api = api;
          this.dialogs = dialogs;
          this.getActiveTab = getActiveTab;
          this.showToast = showToast;
          this.inspection = null;
          this.elements.analyze.addEventListener("click", () => void this.analyze());
          this.elements.start.addEventListener("click", () => void this.download());
          this.elements.cancel.addEventListener("click", () => this.close());
          this.elements.close.addEventListener("click", () => this.close());
          this.elements.url.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void this.analyze();
            }
          });
          this.dialog.addEventListener("close", () => this.#setBusy(false));
        }
        /**
         * Ouvre la boîte et réinitialise l'analyse précédente.
         */
        open() {
          this.inspection = null;
          this.elements.result.hidden = true;
          this.elements.start.disabled = true;
          this.elements.audioField.hidden = true;
          this.elements.subtitleField.hidden = true;
          this.elements.audioSelect.replaceChildren();
          this.elements.subtitleSelect.replaceChildren();
          this.#setStatus("");
          this.dialogs.show(this.dialog);
          this.elements.url.focus();
          this.elements.url.select();
        }
        /**
         * Ferme la boîte.
         */
        close() {
          if (this.dialog.open) {
            this.dialog.close();
          }
        }
        /**
         * Retourne l'URL de la page active si elle peut servir de Referer.
         * @returns {string}
         */
        #getPageUrl() {
          const url = this.getActiveTab()?.url || "";
          return isHttpUrl(url) ? url : "";
        }
        /**
         * Retourne l'identifiant de la webview active.
         * @returns {number | null}
         */
        #getGuestId() {
          const guestId = this.getActiveTab()?.getWebContentsId?.();
          return Number.isInteger(guestId) ? guestId : null;
        }
        /**
         * Met à jour le message d'état.
         * @param {string} message
         * @param {'success' | 'error' | ''} [variant]
         */
        #setStatus(message, variant = "") {
          this.elements.status.textContent = message;
          this.elements.status.dataset.variant = variant;
        }
        /**
         * Active ou désactive les contrôles pendant une opération.
         * @param {boolean} busy
         */
        #setBusy(busy) {
          this.elements.analyze.disabled = busy;
          this.elements.start.disabled = busy || !this.inspection?.ok;
          this.elements.url.disabled = busy;
        }
        /**
         * Valide une URL HTTP(S).
         * @param {string} value
         * @returns {string | null}
         */
        #validateUrl(value) {
          const trimmed = value.trim();
          if (!isHttpUrl(trimmed)) {
            return null;
          }
          try {
            const parsed = new URL(trimmed);
            if (parsed.username || parsed.password) {
              return null;
            }
          } catch {
            return null;
          }
          return trimmed;
        }
        /**
         * Analyse le lien saisi.
         */
        async analyze() {
          const url = this.#validateUrl(this.elements.url.value);
          if (!url) {
            this.#setStatus(
              "Saisissez une URL HTTP(S) valide, sans identifiants int\xE9gr\xE9s.",
              "error"
            );
            return;
          }
          this.inspection = null;
          this.elements.result.hidden = true;
          this.elements.start.disabled = true;
          this.elements.audioField.hidden = true;
          this.elements.subtitleField.hidden = true;
          this.elements.audioSelect.replaceChildren();
          this.elements.subtitleSelect.replaceChildren();
          if (isDirectFileUrl(url)) {
            await this.download({ url });
            return;
          }
          this.#setBusy(true);
          this.#setStatus("Analyse du lien et des pistes \xE9ventuelles\u2026");
          try {
            const result = await this.api.inspectUrl({
              url,
              pageUrl: this.#getPageUrl(),
              guestId: this.#getGuestId()
            });
            if (!result?.ok) {
              this.#setStatus(
                result?.message || "L\u2019analyse du lien a \xE9chou\xE9.",
                "error"
              );
              return;
            }
            this.inspection = { ...result, url };
            this.#renderResult(result);
            this.elements.start.disabled = false;
            this.#setStatus(
              result.isMedia ? "Lien analys\xE9. V\xE9rifiez les informations avant de t\xE9l\xE9charger." : "Le lien est accessible mais ne ressemble pas \xE0 un m\xE9dia.",
              result.isMedia ? "success" : ""
            );
          } catch (error) {
            this.#setStatus(
              `Analyse impossible : ${error.message}`,
              "error"
            );
          } finally {
            this.#setBusy(false);
            this.elements.start.disabled = !this.inspection;
          }
        }
        /**
         * Affiche le résultat de l'analyse.
         * @param {object} result
         */
        #renderResult(result) {
          this.elements.result.hidden = false;
          this.elements.name.textContent = result.filename || "Lien m\xE9dia";
          this.elements.type.textContent = result.streamType ? result.streamType.toUpperCase() : result.isMedia ? "M\xC9DIA" : "FICHIER";
          const details = [
            getHostname(result.finalUrl || result.url),
            result.contentType || "type inconnu",
            formatBytes(result.contentLength),
            result.isLive ? "direct" : ""
          ].filter(Boolean);
          this.elements.meta.textContent = details.join(" \xB7 ");
          if (result.message) {
            this.elements.warning.hidden = false;
            this.elements.warning.textContent = result.message;
            this.elements.warning.dataset.variant = "error";
          } else {
            this.elements.warning.hidden = true;
            this.elements.warning.textContent = "";
            this.elements.warning.dataset.variant = "";
          }
          const metadata = result.metadata || {};
          const audioTracks = Array.isArray(metadata.audioTracks) ? metadata.audioTracks : [];
          const subtitleTracks = Array.isArray(metadata.subtitleTracks) ? metadata.subtitleTracks : [];
          this.#fillTracks(
            this.elements.audioField,
            this.elements.audioSelect,
            audioTracks,
            "Piste audio par d\xE9faut",
            audioTracks.length > 1
          );
          this.#fillTracks(
            this.elements.subtitleField,
            this.elements.subtitleSelect,
            subtitleTracks,
            "Aucun sous-titre",
            subtitleTracks.length > 0
          );
        }
        /**
         * Remplit un sélecteur de piste.
         * @param {HTMLElement} field
         * @param {HTMLSelectElement} select
         * @param {object[]} tracks
         * @param {string} emptyLabel
         * @param {boolean} visible
         */
        #fillTracks(field, select, tracks, emptyLabel, visible) {
          select.replaceChildren();
          field.hidden = !visible;
          if (!visible) {
            return;
          }
          const empty = document.createElement("option");
          empty.value = "";
          empty.textContent = emptyLabel;
          select.append(empty);
          tracks.forEach((track, position) => {
            const option = document.createElement("option");
            option.value = String(track.index);
            option.textContent = getTrackLabel(track, position);
            select.append(option);
          });
        }
        /**
         * Lance le téléchargement du lien analysé.
         */
        async download({ url: directUrl = "" } = {}) {
          const url = directUrl || this.inspection?.url;
          if (!url) {
            return;
          }
          const audioValue = Number(this.elements.audioSelect.value);
          const subtitleValue = Number(this.elements.subtitleSelect.value);
          this.#setBusy(true);
          this.#setStatus("D\xE9marrage du t\xE9l\xE9chargement\u2026");
          try {
            const result = await this.api.downloadUrl({
              url,
              pageUrl: this.#getPageUrl(),
              guestId: this.#getGuestId(),
              audioStreamIndex: this.elements.audioSelect.value !== "" && Number.isInteger(audioValue) ? audioValue : null,
              subtitleStreamIndex: this.elements.subtitleSelect.value !== "" && Number.isInteger(subtitleValue) ? subtitleValue : null,
              isLive: Boolean(this.inspection?.isLive)
            });
            if (!result?.ok) {
              const message2 = result?.message || "Le t\xE9l\xE9chargement a \xE9chou\xE9.";
              this.#setStatus(message2, "error");
              this.showToast(message2, "error");
              return;
            }
            const message = result.queued ? "Flux mis en file d\u2019attente. Il d\xE9marrera d\xE8s qu\u2019un emplacement sera libre." : result.mode === "stream" ? "T\xE9l\xE9chargement du flux lanc\xE9. Suivez sa progression dans T\xE9l\xE9chargements." : "T\xE9l\xE9chargement lanc\xE9. Suivez sa progression dans T\xE9l\xE9chargements.";
            this.showToast(message, "success");
            this.close();
          } catch (error) {
            const message = `T\xE9l\xE9chargement impossible : ${error.message}`;
            this.#setStatus(message, "error");
            this.showToast(message, "error");
          } finally {
            this.#setBusy(false);
          }
        }
      };
      module.exports = { LinkDownloadDialog };
    }
  });

  // src/renderer/js/ui/menu.js
  var require_menu = __commonJS({
    "src/renderer/js/ui/menu.js"(exports, module) {
      "use strict";
      var AppMenu = class {
        /**
         * @param {object} options
         * @param {HTMLButtonElement} options.button
         * @param {HTMLElement} options.menu
         * @param {HTMLElement} options.container
         * @param {(action: string) => void} options.onAction
         * @param {() => void} [options.onBeforeOpen]
         */
        constructor({ button, menu, container, onAction, onBeforeOpen }) {
          this.button = button;
          this.menu = menu;
          this.container = container;
          this.onAction = onAction;
          this.onBeforeOpen = onBeforeOpen;
          this.#setup();
        }
        /**
         * Indique si le menu est ouvert.
         * @returns {boolean}
         */
        get isOpen() {
          return !this.menu.hidden;
        }
        /**
         * Ouvre le menu.
         * @param {{focusFirst?: boolean}} [options]
         */
        open({ focusFirst = false } = {}) {
          if (!this.menu.hidden) {
            return;
          }
          this.onBeforeOpen?.();
          this.menu.hidden = false;
          this.button.setAttribute("aria-expanded", "true");
          if (focusFirst) {
            this.menu.querySelector(".menu-item")?.focus();
          }
        }
        /**
         * Ferme le menu.
         * @param {{restoreFocus?: boolean}} [options]
         */
        close({ restoreFocus = false } = {}) {
          if (this.menu.hidden) {
            return;
          }
          this.menu.hidden = true;
          this.button.setAttribute("aria-expanded", "false");
          if (restoreFocus) {
            this.button.focus();
          }
        }
        /**
         * Vérifie si un nœud appartient au menu.
         * @param {Node} node
         * @returns {boolean}
         */
        contains(node) {
          return this.container.contains(node);
        }
        /**
         * Installe les interactions souris et clavier.
         */
        #setup() {
          this.button.addEventListener("click", (event) => {
            if (this.menu.hidden) {
              this.open({ focusFirst: event.detail === 0 });
            } else {
              this.close({ restoreFocus: true });
            }
          });
          this.button.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
              return;
            }
            event.preventDefault();
            if (this.menu.hidden) {
              this.open();
            }
            const items = this.menu.querySelectorAll(".menu-item");
            const targetIndex = event.key === "ArrowDown" ? 0 : items.length - 1;
            items[targetIndex]?.focus();
          });
          this.menu.addEventListener("click", (event) => {
            if (!(event.target instanceof Element)) {
              return;
            }
            const item = event.target.closest("[data-action]");
            if (!item) {
              return;
            }
            this.close();
            this.onAction(item.dataset.action);
          });
          this.menu.addEventListener("keydown", (event) => {
            const items = Array.from(this.menu.querySelectorAll(".menu-item"));
            const currentIndex = items.indexOf(document.activeElement);
            if (event.key === "Escape") {
              event.preventDefault();
              this.close({ restoreFocus: true });
              return;
            }
            if (event.key === "Tab") {
              this.close();
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (items.length === 0) {
                return;
              }
              const offset = event.key === "ArrowDown" ? 1 : -1;
              const nextIndex = currentIndex < 0 ? offset > 0 ? 0 : items.length - 1 : (currentIndex + offset + items.length) % items.length;
              items[nextIndex]?.focus();
              return;
            }
            if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              const targetIndex = event.key === "Home" ? 0 : items.length - 1;
              items[targetIndex]?.focus();
            }
          });
        }
      };
      module.exports = { AppMenu };
    }
  });

  // src/renderer/js/ui/player.js
  var require_player = __commonJS({
    "src/renderer/js/ui/player.js"(exports, module) {
      "use strict";
      var { IPC } = require_constants();
      var { formatBytes, formatDuration } = require_utils();
      function formatClock(seconds) {
        const total = Math.max(0, Math.floor(Number(seconds) || 0));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor(total % 3600 / 60);
        const remaining = String(total % 60).padStart(2, "0");
        if (hours > 0) {
          return `${hours}:${String(minutes).padStart(2, "0")}:${remaining}`;
        }
        return `${minutes}:${remaining}`;
      }
      var MediaPlayer = class {
        /**
         * @param {object} options
         * @param {HTMLDialogElement} options.dialog
         * @param {object} options.elements
         * @param {HTMLVideoElement} options.elements.video
         * @param {HTMLElement} options.elements.title
         * @param {HTMLElement} options.elements.subtitle
         * @param {HTMLElement} options.elements.error
         * @param {HTMLButtonElement} options.elements.reveal
         * @param {HTMLButtonElement} options.elements.rewind
         * @param {HTMLButtonElement} options.elements.toggle
         * @param {HTMLButtonElement} options.elements.forward
         * @param {HTMLElement} options.elements.time
         * @param {HTMLInputElement} options.elements.progress
         * @param {HTMLButtonElement} options.elements.mute
         * @param {HTMLInputElement} options.elements.volume
         * @param {HTMLSelectElement} options.elements.speed
         * @param {HTMLButtonElement} options.elements.fullscreen
         * @param {object} options.api
         * @param {import('./dialog').DialogController} options.dialogs
         * @param {(message: string, variant?: string) => void} [options.showToast]
         * @param {() => void} [options.onClosed]
         */
        constructor({ dialog, elements, api, dialogs, showToast, onClosed }) {
          this.dialog = dialog;
          this.video = elements.video;
          this.titleElement = elements.title;
          this.subtitleElement = elements.subtitle;
          this.errorElement = elements.error;
          this.revealButton = elements.reveal;
          this.rewindButton = elements.rewind;
          this.toggleButton = elements.toggle;
          this.forwardButton = elements.forward;
          this.timeElement = elements.time;
          this.progressInput = elements.progress;
          this.muteButton = elements.mute;
          this.volumeInput = elements.volume;
          this.speedSelect = elements.speed;
          this.fullscreenButton = elements.fullscreen;
          this.api = api;
          this.dialogs = dialogs;
          this.showToast = showToast;
          this.onClosed = typeof onClosed === "function" ? onClosed : null;
          this.currentEntry = null;
          this.pendingSeek = 0;
          this.lastSavedAt = 0;
          this.isSeeking = false;
          this.hasError = false;
          this.isWindowFullscreen = false;
          this.playerFullscreen = false;
          this.#setup();
        }
        /**
         * Ouvre un média dans le lecteur.
         * @param {object} entry
         * @returns {void}
         */
        open(entry) {
          if (!entry || !entry.playUrl) {
            this.showToast?.("Ce m\xE9dia ne peut pas \xEAtre lu.", "error");
            return;
          }
          this.currentEntry = entry;
          this.pendingSeek = Number(entry.playPosition) || 0;
          this.lastSavedAt = 0;
          this.hasError = false;
          this.titleElement.textContent = entry.title || entry.fileName || "M\xE9dia";
          this.subtitleElement.textContent = this.#buildSubtitle(entry);
          this.errorElement.hidden = true;
          this.errorElement.textContent = "";
          this.#setControlsEnabled(false);
          this.video.src = entry.playUrl;
          this.video.load();
          this.#resetControls();
          this.dialogs.show(this.dialog);
          this.video.focus();
          this.playerFullscreen = false;
          this.#syncFullscreenClass();
          void this.api.isWindowFullscreen().then((fullscreen) => {
            if (!this.dialog.open || this.playerFullscreen) {
              return;
            }
            this.isWindowFullscreen = Boolean(fullscreen);
            this.#syncFullscreenClass();
            this.#updateFullscreenButton();
          }).catch(() => {
          });
        }
        /**
         * Ferme le lecteur et libère le fichier.
         * @returns {void}
         */
        close() {
          if (this.dialog.open) {
            this.dialog.close();
          }
        }
        /**
         * Construit la ligne d'informations secondaires.
         * @param {object} entry
         * @returns {string}
         */
        #buildSubtitle(entry) {
          const parts = [entry.fileName];
          if (Number(entry.size) > 0) {
            parts.push(formatBytes(entry.size));
          }
          if (Number(entry.width) > 0 && Number(entry.height) > 0) {
            parts.push(`${entry.width}\xD7${entry.height}`);
          }
          const duration = formatDuration(entry.durationSeconds);
          if (duration) {
            parts.push(duration);
          }
          return parts.filter(Boolean).join(" \xB7 ");
        }
        /**
         * Installe les écouteurs du lecteur.
         */
        #setup() {
          this.video.addEventListener("loadedmetadata", () => {
            this.#setControlsEnabled(true);
            const duration = Number(this.video.duration);
            const nearEndLimit = Number.isFinite(duration) ? Math.max(duration - 1, duration * 0.98) : 0;
            if (this.pendingSeek > 0 && Number.isFinite(duration) && this.pendingSeek < nearEndLimit) {
              this.video.currentTime = this.pendingSeek;
            }
            this.pendingSeek = 0;
            this.#updateTime();
            void this.video.play().catch(() => {
            });
          });
          this.video.addEventListener("timeupdate", () => {
            if (!this.isSeeking) {
              this.#updateTime();
            }
            if (!this.video.paused) {
              this.#savePosition();
            }
          });
          this.video.addEventListener("play", () => this.#updateToggle());
          this.video.addEventListener("pause", () => {
            this.#updateToggle();
            this.#savePosition(true);
          });
          this.video.addEventListener("ended", () => {
            this.#updateTime();
            this.#savePosition(true);
          });
          this.video.addEventListener("volumechange", () => this.#updateMute());
          this.video.addEventListener("error", () => this.#showPlaybackError());
          this.video.addEventListener("click", () => this.#togglePlayback());
          this.video.addEventListener("dblclick", () => this.#toggleFullscreen());
          this.toggleButton.addEventListener("click", () => this.#togglePlayback());
          this.rewindButton.addEventListener("click", () => this.#seekBy(-10));
          this.forwardButton.addEventListener("click", () => this.#seekBy(10));
          this.muteButton.addEventListener("click", () => this.#toggleMute());
          this.fullscreenButton.addEventListener(
            "click",
            () => this.#toggleFullscreen()
          );
          this.revealButton.addEventListener("click", () => {
            void this.#reveal();
          });
          this.progressInput.addEventListener("input", () => {
            this.isSeeking = true;
            const duration = Number(this.video.duration);
            if (Number.isFinite(duration) && duration > 0) {
              this.video.currentTime = Number(this.progressInput.value) / 1e3 * duration;
              this.#updateTime();
            }
          });
          this.progressInput.addEventListener("change", () => {
            this.isSeeking = false;
          });
          this.volumeInput.addEventListener("input", () => {
            const volume = Math.max(0, Math.min(1, Number(this.volumeInput.value)));
            this.video.volume = volume;
            this.video.muted = volume === 0;
          });
          this.speedSelect.addEventListener("change", () => {
            const rate = Number(this.speedSelect.value);
            this.video.playbackRate = Number.isFinite(rate) ? rate : 1;
          });
          this.dialog.addEventListener("keydown", (event) => {
            this.#handleKeydown(event);
          });
          this.dialog.addEventListener("close", () => {
            void this.#cleanup();
          });
          this.api.on(IPC.WINDOW_FULLSCREEN_CHANGED, (fullscreen) => {
            this.isWindowFullscreen = Boolean(fullscreen);
            if (!this.isWindowFullscreen) {
              this.playerFullscreen = false;
            }
            this.#syncFullscreenClass();
            this.#updateFullscreenButton();
          });
        }
        /**
         * Gère les raccourcis clavier du lecteur.
         * @param {KeyboardEvent} event
         */
        #handleKeydown(event) {
          const target = event.target;
          const tagName = target instanceof HTMLElement ? target.tagName : "";
          if (tagName === "INPUT" || tagName === "SELECT" || tagName === "BUTTON") {
            return;
          }
          switch (event.key) {
            case " ":
              event.preventDefault();
              this.#togglePlayback();
              break;
            case "ArrowLeft":
              event.preventDefault();
              this.#seekBy(-10);
              break;
            case "ArrowRight":
              event.preventDefault();
              this.#seekBy(10);
              break;
            case "ArrowUp":
              event.preventDefault();
              this.#changeVolume(0.05);
              break;
            case "ArrowDown":
              event.preventDefault();
              this.#changeVolume(-0.05);
              break;
            case "Home":
              event.preventDefault();
              this.#seekTo(0);
              break;
            case "End":
              event.preventDefault();
              this.#seekTo(this.video.duration);
              break;
            case "m":
            case "M":
              event.preventDefault();
              this.#toggleMute();
              break;
            case "f":
            case "F":
              event.preventDefault();
              this.#toggleFullscreen();
              break;
            default:
              break;
          }
        }
        /**
         * Bascule lecture/pause.
         */
        #togglePlayback() {
          if (!this.currentEntry) {
            return;
          }
          if (this.video.paused) {
            void this.video.play().catch(() => {
              this.#showPlaybackError();
            });
          } else {
            this.video.pause();
          }
        }
        /**
         * Déplace la lecture d'un nombre de secondes.
         * @param {number} delta
         */
        #seekBy(delta) {
          const duration = Number(this.video.duration);
          const current = Number(this.video.currentTime) || 0;
          if (!Number.isFinite(duration) || duration <= 0) {
            return;
          }
          this.video.currentTime = Math.max(
            0,
            Math.min(duration, current + delta)
          );
          this.#updateTime();
        }
        /**
         * Déplace la lecture à une position absolue.
         * @param {number} position
         */
        #seekTo(position) {
          const duration = Number(this.video.duration);
          if (!Number.isFinite(duration) || duration <= 0) {
            return;
          }
          this.video.currentTime = Math.max(
            0,
            Math.min(duration, Number(position) || 0)
          );
          this.#updateTime();
        }
        /**
         * Modifie le volume par pas.
         * @param {number} delta
         */
        #changeVolume(delta) {
          const volume = Math.max(0, Math.min(1, this.video.volume + delta));
          this.video.volume = volume;
          this.video.muted = volume === 0;
        }
        /**
         * Coupe ou rétablit le son.
         */
        #toggleMute() {
          this.video.muted = !this.video.muted;
          if (!this.video.muted && this.video.volume === 0) {
            this.video.volume = 0.5;
          }
        }
        /**
         * Bascule le plein écran.
         */
        #toggleFullscreen() {
          const target = !this.isWindowFullscreen;
          const previous = this.isWindowFullscreen;
          this.playerFullscreen = target;
          this.isWindowFullscreen = target;
          this.#syncFullscreenClass();
          this.#updateFullscreenButton();
          void this.api.setWindowFullscreen(target).catch(() => {
            this.playerFullscreen = false;
            this.isWindowFullscreen = previous;
            this.#syncFullscreenClass();
            this.#updateFullscreenButton();
            this.showToast?.("Le plein \xE9cran est indisponible.", "error");
          });
        }
        /**
         * Agrandit la modale lorsque la fenêtre passe en plein écran.
         */
        #syncFullscreenClass() {
          this.dialog.classList.toggle(
            "player-modal--fullscreen",
            this.dialog.open && this.isWindowFullscreen
          );
        }
        /**
         * Met à jour l'affichage du temps et de la progression.
         */
        #updateTime() {
          const current = Number(this.video.currentTime) || 0;
          const duration = Number(this.video.duration);
          this.timeElement.textContent = `${formatClock(current)} / ${formatClock(
            Number.isFinite(duration) ? duration : 0
          )}`;
          if (Number.isFinite(duration) && duration > 0 && !this.hasError) {
            this.progressInput.value = String(
              Math.round(current / duration * 1e3)
            );
            this.progressInput.disabled = false;
          } else {
            this.progressInput.value = "0";
            this.progressInput.disabled = true;
          }
        }
        /**
         * Met à jour le bouton lecture/pause.
         */
        #updateToggle() {
          const paused = this.video.paused;
          this.toggleButton.textContent = paused ? "\u25B6" : "\u23F8";
          this.toggleButton.setAttribute(
            "aria-label",
            paused ? "Lire" : "Mettre en pause"
          );
        }
        /**
         * Met à jour le bouton son.
         */
        #updateMute() {
          const muted = this.video.muted || this.video.volume === 0;
          this.muteButton.textContent = muted ? "\u{1F507}" : "\u{1F50A}";
          this.muteButton.setAttribute(
            "aria-label",
            muted ? "R\xE9tablir le son" : "Couper le son"
          );
          this.volumeInput.value = String(
            this.video.muted ? 0 : this.video.volume
          );
        }
        /**
         * Met à jour le bouton plein écran.
         */
        #updateFullscreenButton() {
          this.fullscreenButton.textContent = this.isWindowFullscreen ? "\u2922" : "\u26F6";
          this.fullscreenButton.setAttribute(
            "aria-label",
            this.isWindowFullscreen ? "Quitter le plein \xE9cran" : "Plein \xE9cran"
          );
        }
        /**
         * Active ou désactive les contrôles qui dépendent des métadonnées.
         * @param {boolean} enabled
         */
        #setControlsEnabled(enabled) {
          const allowed = enabled && !this.hasError;
          this.toggleButton.disabled = !allowed;
          this.rewindButton.disabled = !allowed;
          this.forwardButton.disabled = !allowed;
          this.progressInput.disabled = !allowed;
          this.speedSelect.disabled = !allowed;
        }
        /**
         * Réinitialise les contrôles à l'ouverture.
         */
        #resetControls() {
          this.progressInput.value = "0";
          this.timeElement.textContent = "0:00 / 0:00";
          this.video.playbackRate = 1;
          this.speedSelect.value = "1";
          this.#updateToggle();
          this.#updateMute();
          this.#updateFullscreenButton();
        }
        /**
         * Affiche une erreur de lecture.
         */
        #showPlaybackError() {
          if (!this.currentEntry || !this.dialog.open) {
            return;
          }
          this.hasError = true;
          this.errorElement.textContent = "Lecture impossible. Le fichier est peut-\xEAtre absent, d\xE9plac\xE9 ou encod\xE9 dans un format non pris en charge par le moteur.";
          this.errorElement.hidden = false;
          this.#setControlsEnabled(false);
        }
        /**
         * Enregistre la position de lecture, au plus toutes les cinq secondes.
         * @param {boolean} [force]
         */
        #savePosition(force = false) {
          if (!this.currentEntry || !Number.isFinite(this.video.currentTime)) {
            return Promise.resolve();
          }
          const now = Date.now();
          if (!force && now - this.lastSavedAt < 5e3) {
            return Promise.resolve();
          }
          this.lastSavedAt = now;
          return this.api.updateLibraryPlayback(this.currentEntry.id, this.video.currentTime).catch((error) => {
            console.warn(
              "[M\xE9diath\xE8que] Position de lecture non enregistr\xE9e :",
              error.message
            );
          });
        }
        /**
         * Affiche le fichier dans le gestionnaire de fichiers.
         * @returns {Promise<void>}
         */
        async #reveal() {
          if (!this.currentEntry) {
            return;
          }
          try {
            const result = await this.api.revealLibraryEntry(this.currentEntry.id);
            if (!result?.ok) {
              this.showToast?.(
                result?.message || "Fichier introuvable.",
                "error"
              );
            }
          } catch (error) {
            this.showToast?.(`Dossier inaccessible : ${error.message}`, "error");
          }
        }
        /**
         * Arrête la lecture et libère la source locale.
         * @returns {Promise<void>}
         */
        async #cleanup() {
          await this.#savePosition(true);
          this.video.pause();
          this.video.removeAttribute("src");
          this.video.load();
          this.currentEntry = null;
          this.pendingSeek = 0;
          this.errorElement.hidden = true;
          this.errorElement.textContent = "";
          this.titleElement.textContent = "M\xE9dia";
          this.subtitleElement.textContent = "";
          this.#resetControls();
          this.#setControlsEnabled(false);
          const shouldExitFullscreen = this.playerFullscreen;
          this.playerFullscreen = false;
          if (shouldExitFullscreen) {
            this.isWindowFullscreen = false;
            void this.api.setWindowFullscreen(false).catch(() => {
            });
          }
          this.#syncFullscreenClass();
          this.onClosed?.();
        }
      };
      module.exports = { MediaPlayer, formatClock };
    }
  });

  // src/renderer/js/ui/settings.js
  var require_settings = __commonJS({
    "src/renderer/js/ui/settings.js"(exports, module) {
      "use strict";
      var {
        DEFAULT_SETTINGS,
        HOME_PAGE_MODES,
        SEARCH_ENGINE_KEYS,
        SEARCH_ENGINES,
        SETTINGS_STATUS_TIMEOUT
      } = require_constants();
      var { isHttpUrl } = require_utils();
      var DEFAULT_STATUS = "Les modifications sont enregistr\xE9es automatiquement.";
      var SettingsPanel = class {
        /**
         * @param {object} options
         * @param {HTMLDialogElement} options.dialog
         * @param {object} options.elements
         * @param {HTMLSelectElement} options.elements.searchEngineSelect
         * @param {HTMLSelectElement} options.elements.homepageModeSelect
         * @param {HTMLElement} options.elements.homepageCustomRow
         * @param {HTMLInputElement} options.elements.homepageUrlInput
         * @param {HTMLButtonElement} options.elements.homepageSaveButton
         * @param {HTMLButtonElement} options.elements.openHomeButton
         * @param {HTMLInputElement} options.elements.restoreSessionToggle
         * @param {HTMLInputElement} options.elements.saveHistoryToggle
         * @param {HTMLSelectElement} options.elements.defaultZoomSelect
         * @param {HTMLInputElement} options.elements.adblockToggle
         * @param {HTMLInputElement} options.elements.downloadFolderInput
         * @param {HTMLButtonElement} options.elements.chooseFolderButton
         * @param {HTMLButtonElement} options.elements.clearDataButton
         * @param {HTMLButtonElement} options.elements.resetPermissionsButton
         * @param {HTMLButtonElement} options.elements.resetSettingsButton
         * @param {HTMLElement} options.elements.status
         * @param {object} options.api
         * @param {import('./dialog').DialogController} options.dialogs
         * @param {(settings: object) => void} [options.onSettingsChanged]
         * @param {() => void} [options.onOpenHome]
         */
        constructor({
          dialog,
          elements,
          api,
          dialogs,
          onSettingsChanged,
          onOpenHome
        }) {
          this.dialog = dialog;
          this.elements = elements;
          this.api = api;
          this.dialogs = dialogs;
          this.onSettingsChanged = onSettingsChanged;
          this.onOpenHome = onOpenHome;
          this.settings = {
            ...DEFAULT_SETTINGS,
            downloadDir: ""
          };
          this.statusTimer = null;
          this.#setup();
          this.#syncForm();
        }
        /**
         * Applique une photographie des paramètres au formulaire.
         * @param {object} settings
         */
        applySettings(settings) {
          if (!settings || typeof settings !== "object") {
            return;
          }
          this.settings = {
            ...this.settings,
            ...settings
          };
          this.#syncForm();
        }
        /**
         * Retourne une copie des paramètres connus du panneau.
         * @returns {object}
         */
        getSettings() {
          return { ...this.settings };
        }
        /**
         * Recharge les paramètres depuis le processus principal.
         * @returns {Promise<object>}
         */
        async refresh() {
          try {
            const settings = await this.api.getSettings();
            this.applySettings(settings);
          } catch (error) {
            console.warn("[Param\xE8tres] Lecture impossible :", error.message);
            this.setStatus(
              `Lecture impossible : ${error.message}`,
              "error"
            );
          }
          return this.getSettings();
        }
        /**
         * Ouvre le panneau après synchronisation.
         * @returns {Promise<void>}
         */
        async open() {
          await this.refresh();
          this.setStatus(DEFAULT_STATUS);
          this.dialogs.show(this.dialog);
        }
        /**
         * Affiche un message de statut temporaire.
         * @param {string} message
         * @param {'info' | 'success' | 'error'} [variant]
         */
        setStatus(message, variant = "info") {
          const status = this.elements.status;
          if (!status) {
            return;
          }
          window.clearTimeout(this.statusTimer);
          status.textContent = message;
          status.className = `settings-status settings-status--${variant}`;
          this.statusTimer = window.setTimeout(() => {
            status.textContent = DEFAULT_STATUS;
            status.className = "settings-status";
          }, SETTINGS_STATUS_TIMEOUT);
        }
        /**
         * Enregistre un patch et synchronise les différents consommateurs.
         * @param {Record<string, unknown>} patch
         * @returns {Promise<object>}
         */
        async #save(patch) {
          const updated = await this.api.updateSettings(patch);
          if (updated && typeof updated === "object") {
            this.applySettings(updated);
            this.onSettingsChanged?.(updated);
          }
          return updated;
        }
        /**
         * Synchronise les contrôles avec l'état courant.
         */
        #syncForm() {
          const {
            searchEngineSelect,
            homepageModeSelect,
            homepageCustomRow,
            homepageUrlInput,
            homepageSaveButton,
            restoreSessionToggle,
            saveHistoryToggle,
            defaultZoomSelect,
            adblockToggle,
            downloadFolderInput
          } = this.elements;
          if (SEARCH_ENGINE_KEYS.includes(this.settings.searchEngine)) {
            searchEngineSelect.value = this.settings.searchEngine;
          }
          const homePageMode = Object.values(HOME_PAGE_MODES).includes(
            this.settings.homePageMode
          ) ? this.settings.homePageMode : HOME_PAGE_MODES.BUILTIN;
          homepageModeSelect.value = homePageMode;
          homepageCustomRow.hidden = homePageMode !== HOME_PAGE_MODES.CUSTOM;
          homepageUrlInput.value = this.settings.homePageUrl || "";
          homepageSaveButton.disabled = !isHttpUrl(homepageUrlInput.value.trim());
          restoreSessionToggle.checked = this.settings.restoreSession !== false;
          saveHistoryToggle.checked = this.settings.saveHistory !== false;
          const zoomValue = String(
            Number(this.settings.defaultZoom) || DEFAULT_SETTINGS.defaultZoom
          );
          if (!Array.from(defaultZoomSelect.options).some(
            (option) => option.value === zoomValue
          )) {
            const option = document.createElement("option");
            option.value = zoomValue;
            option.textContent = `${Math.round(Number(zoomValue) * 100)} %`;
            defaultZoomSelect.append(option);
          }
          defaultZoomSelect.value = zoomValue;
          adblockToggle.checked = Boolean(this.settings.adBlockEnabled);
          downloadFolderInput.value = this.settings.downloadDir || "";
          downloadFolderInput.title = this.settings.downloadDir || "";
        }
        /**
         * Enregistre la page d'accueil personnalisée après validation.
         * @returns {Promise<void>}
         */
        async #saveCustomHomePage() {
          const { homepageUrlInput, homepageSaveButton } = this.elements;
          const url = homepageUrlInput.value.trim();
          if (!isHttpUrl(url)) {
            this.setStatus(
              "Saisissez une adresse HTTP(S) valide, par exemple https://exemple.com/.",
              "error"
            );
            homepageUrlInput.focus();
            return;
          }
          homepageSaveButton.disabled = true;
          try {
            await this.#save({
              homePageMode: HOME_PAGE_MODES.CUSTOM,
              homePageUrl: url
            });
            this.setStatus("Page d\u2019accueil personnalis\xE9e enregistr\xE9e.", "success");
          } catch (error) {
            this.setStatus(
              `Modification impossible : ${error.message}`,
              "error"
            );
          } finally {
            homepageSaveButton.disabled = !isHttpUrl(
              homepageUrlInput.value.trim()
            );
          }
        }
        /**
         * Installe les interactions du panneau.
         */
        #setup() {
          const {
            searchEngineSelect,
            homepageModeSelect,
            homepageCustomRow,
            homepageUrlInput,
            homepageSaveButton,
            openHomeButton,
            restoreSessionToggle,
            saveHistoryToggle,
            defaultZoomSelect,
            adblockToggle,
            chooseFolderButton,
            clearDataButton,
            resetPermissionsButton,
            resetSettingsButton
          } = this.elements;
          searchEngineSelect.addEventListener("change", async () => {
            const previousValue = this.settings.searchEngine;
            const nextValue = searchEngineSelect.value;
            searchEngineSelect.disabled = true;
            try {
              await this.#save({ searchEngine: nextValue });
              const label = SEARCH_ENGINES[nextValue]?.label || nextValue;
              this.setStatus(`Moteur de recherche : ${label}.`, "success");
            } catch (error) {
              searchEngineSelect.value = previousValue;
              this.setStatus(
                `Modification impossible : ${error.message}`,
                "error"
              );
            } finally {
              searchEngineSelect.disabled = false;
            }
          });
          homepageModeSelect.addEventListener("change", async () => {
            const nextValue = homepageModeSelect.value;
            if (nextValue === HOME_PAGE_MODES.BUILTIN) {
              homepageCustomRow.hidden = true;
              try {
                await this.#save({ homePageMode: HOME_PAGE_MODES.BUILTIN });
                this.setStatus("Page d\u2019accueil locale activ\xE9e.", "success");
              } catch (error) {
                this.setStatus(
                  `Modification impossible : ${error.message}`,
                  "error"
                );
                this.#syncForm();
              }
              return;
            }
            homepageCustomRow.hidden = false;
            homepageSaveButton.disabled = !isHttpUrl(
              homepageUrlInput.value.trim()
            );
            if (isHttpUrl(this.settings.homePageUrl)) {
              try {
                await this.#save({ homePageMode: HOME_PAGE_MODES.CUSTOM });
                this.setStatus(
                  "Page d\u2019accueil personnalis\xE9e activ\xE9e.",
                  "success"
                );
              } catch (error) {
                this.setStatus(
                  `Modification impossible : ${error.message}`,
                  "error"
                );
                this.#syncForm();
              }
              return;
            }
            this.setStatus(
              "Saisissez une adresse HTTP(S), puis cliquez sur Enregistrer.",
              "info"
            );
            homepageUrlInput.focus();
          });
          homepageUrlInput.addEventListener("input", () => {
            homepageSaveButton.disabled = !isHttpUrl(
              homepageUrlInput.value.trim()
            );
          });
          homepageUrlInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void this.#saveCustomHomePage();
            }
          });
          homepageSaveButton.addEventListener("click", () => {
            void this.#saveCustomHomePage();
          });
          openHomeButton.addEventListener("click", () => {
            this.onOpenHome?.();
          });
          restoreSessionToggle.addEventListener("change", async () => {
            const nextValue = restoreSessionToggle.checked;
            restoreSessionToggle.disabled = true;
            try {
              await this.#save({ restoreSession: nextValue });
              this.setStatus(
                nextValue ? "Restauration de session activ\xE9e." : "Restauration de session d\xE9sactiv\xE9e.",
                "success"
              );
            } catch (error) {
              restoreSessionToggle.checked = !nextValue;
              this.setStatus(
                `Modification impossible : ${error.message}`,
                "error"
              );
            } finally {
              restoreSessionToggle.disabled = false;
            }
          });
          saveHistoryToggle.addEventListener("change", async () => {
            const nextValue = saveHistoryToggle.checked;
            saveHistoryToggle.disabled = true;
            try {
              await this.#save({ saveHistory: nextValue });
              this.setStatus(
                nextValue ? "Enregistrement de l\u2019historique activ\xE9." : "Enregistrement de l\u2019historique d\xE9sactiv\xE9.",
                "success"
              );
            } catch (error) {
              saveHistoryToggle.checked = !nextValue;
              this.setStatus(
                `Modification impossible : ${error.message}`,
                "error"
              );
            } finally {
              saveHistoryToggle.disabled = false;
            }
          });
          defaultZoomSelect.addEventListener("change", async () => {
            const previousValue = this.settings.defaultZoom;
            const nextValue = Number(defaultZoomSelect.value);
            defaultZoomSelect.disabled = true;
            try {
              await this.#save({ defaultZoom: nextValue });
              this.setStatus(
                `Zoom par d\xE9faut : ${Math.round(nextValue * 100)} %.`,
                "success"
              );
            } catch (error) {
              defaultZoomSelect.value = String(previousValue);
              this.setStatus(
                `Modification impossible : ${error.message}`,
                "error"
              );
            } finally {
              defaultZoomSelect.disabled = false;
            }
          });
          adblockToggle.addEventListener("change", async () => {
            const nextValue = adblockToggle.checked;
            adblockToggle.disabled = true;
            try {
              await this.#save({ adBlockEnabled: nextValue });
              this.setStatus(
                nextValue ? "Bloqueur de publicit\xE9s activ\xE9." : "Bloqueur de publicit\xE9s d\xE9sactiv\xE9.",
                "success"
              );
            } catch (error) {
              adblockToggle.checked = !nextValue;
              this.setStatus(
                `Modification impossible : ${error.message}`,
                "error"
              );
            } finally {
              adblockToggle.disabled = false;
            }
          });
          chooseFolderButton.addEventListener("click", async () => {
            chooseFolderButton.disabled = true;
            try {
              const result = await this.api.chooseDownloadDir();
              if (result?.settings) {
                this.applySettings(result.settings);
                this.onSettingsChanged?.(result.settings);
              }
              if (result && !result.canceled) {
                this.setStatus("Dossier de t\xE9l\xE9chargement mis \xE0 jour.", "success");
              }
            } catch (error) {
              this.setStatus(
                `Dossier non modifi\xE9 : ${error.message}`,
                "error"
              );
            } finally {
              chooseFolderButton.disabled = false;
            }
          });
          clearDataButton.addEventListener("click", async () => {
            const confirmed = await this.dialogs.askConfirmation({
              title: "Effacer les donn\xE9es de navigation ?",
              message: "Les cookies, le cache, les stockages locaux et les service workers seront supprim\xE9s. Votre historique et vos favoris sont conserv\xE9s.",
              confirmLabel: "Effacer les donn\xE9es",
              danger: true
            });
            if (!confirmed) {
              return;
            }
            clearDataButton.disabled = true;
            try {
              const result = await this.api.clearBrowsingData();
              if (!result?.ok) {
                this.setStatus(
                  result?.message || "Effacement impossible.",
                  "error"
                );
                return;
              }
              this.setStatus("Donn\xE9es de navigation effac\xE9es.", "success");
            } catch (error) {
              this.setStatus(`Effacement impossible : ${error.message}`, "error");
            } finally {
              clearDataButton.disabled = false;
            }
          });
          resetPermissionsButton.addEventListener("click", async () => {
            const confirmed = await this.dialogs.askConfirmation({
              title: "R\xE9initialiser les autorisations ?",
              message: "Les choix m\xE9moris\xE9s pour la cam\xE9ra, le microphone, la g\xE9olocalisation, les notifications et les autres permissions sensibles seront oubli\xE9s.",
              confirmLabel: "R\xE9initialiser",
              danger: true
            });
            if (!confirmed) {
              return;
            }
            resetPermissionsButton.disabled = true;
            try {
              const result = await this.api.resetSitePermissions();
              if (!result?.ok) {
                this.setStatus(
                  result?.message || "R\xE9initialisation impossible.",
                  "error"
                );
                return;
              }
              this.setStatus("Autorisations des sites r\xE9initialis\xE9es.", "success");
            } catch (error) {
              this.setStatus(
                `R\xE9initialisation impossible : ${error.message}`,
                "error"
              );
            } finally {
              resetPermissionsButton.disabled = false;
            }
          });
          resetSettingsButton.addEventListener("click", async () => {
            const confirmed = await this.dialogs.askConfirmation({
              title: "R\xE9initialiser les pr\xE9f\xE9rences ?",
              message: "Le moteur de recherche, la page d\u2019accueil, le zoom, la restauration de session, l\u2019historique et AdBlock retrouveront leur valeur par d\xE9faut. Vos fichiers, favoris et l\u2019historique existant sont conserv\xE9s.",
              confirmLabel: "R\xE9initialiser",
              danger: true
            });
            if (!confirmed) {
              return;
            }
            resetSettingsButton.disabled = true;
            try {
              await this.#save({
                searchEngine: DEFAULT_SETTINGS.searchEngine,
                adBlockEnabled: DEFAULT_SETTINGS.adBlockEnabled,
                homePageMode: DEFAULT_SETTINGS.homePageMode,
                homePageUrl: DEFAULT_SETTINGS.homePageUrl,
                restoreSession: DEFAULT_SETTINGS.restoreSession,
                saveHistory: DEFAULT_SETTINGS.saveHistory,
                defaultZoom: DEFAULT_SETTINGS.defaultZoom
              });
              this.setStatus("Pr\xE9f\xE9rences r\xE9initialis\xE9es.", "success");
            } catch (error) {
              this.setStatus(
                `R\xE9initialisation impossible : ${error.message}`,
                "error"
              );
            } finally {
              resetSettingsButton.disabled = false;
            }
          });
          this.dialog.addEventListener("close", () => {
            window.clearTimeout(this.statusTimer);
            this.#syncForm();
            this.setStatus(DEFAULT_STATUS);
          });
        }
      };
      module.exports = { SettingsPanel };
    }
  });

  // src/renderer/js/ui/toast.js
  var require_toast = __commonJS({
    "src/renderer/js/ui/toast.js"(exports, module) {
      "use strict";
      var Toast = class {
        /**
         * @param {HTMLElement} element
         */
        constructor(element) {
          this.element = element;
          this.timer = null;
        }
        /**
         * @param {string} message
         * @param {'info' | 'success' | 'error'} [variant]
         * @param {number} [duration]
         */
        show(message, variant = "info", duration = 3200) {
          window.clearTimeout(this.timer);
          this.element.textContent = String(message || "");
          this.element.className = `toast toast--${variant} is-visible`;
          this.timer = window.setTimeout(() => {
            this.element.classList.remove("is-visible");
          }, duration);
        }
      };
      module.exports = { Toast };
    }
  });

  // src/renderer/js/app.js
  var require_app = __commonJS({
    "src/renderer/js/app.js"() {
      "use strict";
      var { api } = require_api();
      var {
        DEFAULT_SETTINGS,
        IPC,
        SHORTCUT_ACTIONS
      } = require_constants();
      var {
        buildHomeUrl,
        getStreamType,
        isHomeUrl,
        isHttpUrl,
        isTabUrl,
        resolveAboutPageUrl
      } = require_utils();
      var { I18n } = require_i18n();
      var { MediaSniffer } = require_mediaSniffer();
      var { NavBar } = require_navBar();
      var { TabManager } = require_tabManager();
      var { ThemeManager } = require_theme();
      var { AboutPanel } = require_about();
      var { DialogController } = require_dialog();
      var { DownloadsPanel } = require_downloads();
      var { ExtensionsPanel } = require_extensions2();
      var { FavoritesPanel } = require_favorites();
      var { FindBar } = require_findBar();
      var { HistoryPanel } = require_history();
      var { LibraryPanel } = require_library();
      var { LinkDownloadDialog } = require_linkDownload();
      var { AppMenu } = require_menu();
      var { MediaOptionsDialog } = require_mediaOptions();
      var { MediaPlayer } = require_player();
      var { SettingsPanel } = require_settings();
      var { Toast } = require_toast();
      var windowQuery = new URLSearchParams(window.location.search);
      var isPrivate = windowQuery.get("mode") === "private";
      var privatePartition = isPrivate ? windowQuery.get("partition") || `think-private-fallback-${Date.now()}-${Math.random().toString(16).slice(2)}` : "";
      if (isPrivate) {
        document.body.classList.add("is-private");
      }
      var appSettings = {
        ...DEFAULT_SETTINGS,
        downloadDir: ""
      };
      function getHomeUrl() {
        if (appSettings.homePageMode === "custom" && isHttpUrl(appSettings.homePageUrl)) {
          return String(appSettings.homePageUrl);
        }
        return buildHomeUrl(String(appSettings.searchEngine || "google"));
      }
      var elements = {
        tabsList: document.getElementById("tabs-list"),
        tabsViewport: document.querySelector(".tabs-viewport"),
        webviewStack: document.getElementById("webview-stack"),
        newTabButton: document.getElementById("new-tab-button"),
        navForm: document.getElementById("nav-form"),
        urlInput: document.getElementById("url-input"),
        backButton: document.getElementById("back-button"),
        forwardButton: document.getElementById("forward-button"),
        reloadButton: document.getElementById("reload-button"),
        homeButton: document.getElementById("home-button"),
        goButton: document.getElementById("go-button"),
        clearAddressButton: document.getElementById("clear-address-button"),
        favoriteButton: document.getElementById("favorite-button"),
        pageProgress: document.getElementById("page-progress"),
        privateBadge: document.getElementById("private-badge"),
        findBar: document.getElementById("find-bar"),
        findInput: document.getElementById("find-input"),
        findCount: document.getElementById("find-count"),
        findPreviousButton: document.getElementById("find-previous"),
        findNextButton: document.getElementById("find-next"),
        findCloseButton: document.getElementById("find-close"),
        trackerIndicator: document.getElementById("tracker-indicator"),
        trackerCount: document.getElementById("tracker-count"),
        mediaIndicator: document.getElementById("media-indicator"),
        mediaCount: document.getElementById("media-count"),
        mediaPanel: document.getElementById("media-panel"),
        mediaPanelClose: document.getElementById("media-panel-close"),
        mediaExtract: document.getElementById("media-extract"),
        mediaList: document.getElementById("media-list"),
        mediaToolStatus: document.getElementById("media-tool-status"),
        mediaOptionsDialog: document.getElementById("media-options-dialog"),
        mediaOptionsSummary: document.getElementById("media-options-summary"),
        mediaOptionsLive: document.getElementById("media-options-live"),
        mediaAudioTrack: document.getElementById("media-audio-track"),
        mediaSubtitleTrack: document.getElementById("media-subtitle-track"),
        mediaOptionsStart: document.getElementById("media-options-start"),
        mediaOptionsCancel: document.getElementById("media-options-cancel"),
        mediaOptionsClose: document.getElementById("media-options-close"),
        toast: document.getElementById("toast"),
        linkDownloadDialog: document.getElementById("link-download-dialog"),
        linkDownloadUrl: document.getElementById("link-download-url"),
        linkDownloadAnalyze: document.getElementById("link-download-analyze"),
        linkDownloadResult: document.getElementById("link-download-result"),
        linkDownloadName: document.getElementById("link-download-name"),
        linkDownloadType: document.getElementById("link-download-type"),
        linkDownloadMeta: document.getElementById("link-download-meta"),
        linkDownloadWarning: document.getElementById("link-download-warning"),
        linkDownloadAudioField: document.getElementById(
          "link-download-audio-field"
        ),
        linkDownloadAudio: document.getElementById("link-download-audio"),
        linkDownloadSubtitleField: document.getElementById(
          "link-download-subtitle-field"
        ),
        linkDownloadSubtitle: document.getElementById("link-download-subtitle"),
        linkDownloadStatus: document.getElementById("link-download-status"),
        linkDownloadStart: document.getElementById("link-download-start"),
        linkDownloadCancel: document.getElementById("link-download-cancel"),
        linkDownloadClose: document.getElementById("link-download-close"),
        menuButton: document.getElementById("menu-button"),
        appMenu: document.getElementById("app-menu"),
        menuContainer: document.querySelector(".menu-container"),
        historyDialog: document.getElementById("history-dialog"),
        historyCount: document.getElementById("history-count"),
        historyList: document.getElementById("history-list"),
        clearHistoryButton: document.getElementById("clear-history-button"),
        downloadsDialog: document.getElementById("downloads-dialog"),
        downloadsCount: document.getElementById("downloads-count"),
        downloadsList: document.getElementById("downloads-list"),
        libraryDialog: document.getElementById("library-dialog"),
        libraryList: document.getElementById("library-list"),
        libraryCount: document.getElementById("library-count"),
        librarySearch: document.getElementById("library-search"),
        libraryFilter: document.getElementById("library-filter"),
        librarySort: document.getElementById("library-sort"),
        libraryImport: document.getElementById("library-import"),
        libraryEmpty: document.getElementById("library-empty"),
        libraryEmptyImport: document.getElementById("library-empty-import"),
        libraryRenameDialog: document.getElementById("library-rename-dialog"),
        libraryRenameInput: document.getElementById("library-rename-input"),
        libraryRenameError: document.getElementById("library-rename-error"),
        libraryRenameConfirm: document.getElementById("library-rename-confirm"),
        playerDialog: document.getElementById("player-dialog"),
        playerVideo: document.getElementById("player-video"),
        playerTitle: document.getElementById("player-title"),
        playerSubtitle: document.getElementById("player-subtitle"),
        playerError: document.getElementById("player-error"),
        playerReveal: document.getElementById("player-reveal"),
        playerRewind: document.getElementById("player-rewind"),
        playerToggle: document.getElementById("player-toggle"),
        playerForward: document.getElementById("player-forward"),
        playerTime: document.getElementById("player-time"),
        playerProgress: document.getElementById("player-progress"),
        playerMute: document.getElementById("player-mute"),
        playerVolume: document.getElementById("player-volume"),
        playerSpeed: document.getElementById("player-speed"),
        playerFullscreen: document.getElementById("player-fullscreen"),
        favoritesDialog: document.getElementById("favorites-dialog"),
        favoritesCount: document.getElementById("favorites-count"),
        favoritesList: document.getElementById("favorites-list"),
        favoriteFolders: document.getElementById("favorite-folders"),
        newFavoriteFolderButton: document.getElementById(
          "new-favorite-folder-button"
        ),
        favoriteFolderForm: document.getElementById("favorite-folder-form"),
        favoriteFolderName: document.getElementById("favorite-folder-name"),
        favoriteFolderCancel: document.getElementById(
          "favorite-folder-cancel"
        ),
        importFavoritesButton: document.getElementById("import-favorites-button"),
        exportFavoritesButton: document.getElementById("export-favorites-button"),
        settingsDialog: document.getElementById("settings-dialog"),
        searchEngineSelect: document.getElementById("search-engine-select"),
        homepageModeSelect: document.getElementById("homepage-mode-select"),
        homepageCustomRow: document.getElementById("homepage-custom-row"),
        homepageUrlInput: document.getElementById("homepage-url-input"),
        homepageSaveButton: document.getElementById("homepage-save-button"),
        openHomeButton: document.getElementById("open-home-button"),
        restoreSessionToggle: document.getElementById("restore-session-toggle"),
        saveHistoryToggle: document.getElementById("save-history-toggle"),
        defaultZoomSelect: document.getElementById("default-zoom-select"),
        adblockToggle: document.getElementById("adblock-toggle"),
        downloadFolderInput: document.getElementById("download-folder-input"),
        chooseFolderButton: document.getElementById("choose-folder-button"),
        clearDataButton: document.getElementById("clear-browsing-data-button"),
        resetPermissionsButton: document.getElementById(
          "reset-permissions-button"
        ),
        resetSettingsButton: document.getElementById("reset-settings-button"),
        settingsStatus: document.getElementById("settings-status"),
        extensionsDialog: document.getElementById("extensions-dialog"),
        extensionsList: document.getElementById("extensions-list"),
        extensionsStatus: document.getElementById("extensions-status"),
        aboutDialog: document.getElementById("about-dialog"),
        aboutVersion: document.getElementById("about-version"),
        aboutElectron: document.getElementById("about-electron"),
        aboutChrome: document.getElementById("about-chrome"),
        aboutNode: document.getElementById("about-node"),
        confirmDialog: document.getElementById("confirm-dialog"),
        confirmTitle: document.getElementById("confirm-title"),
        confirmMessage: document.getElementById("confirm-message"),
        confirmCancel: document.getElementById("confirm-cancel"),
        confirmAccept: document.getElementById("confirm-accept")
      };
      var toast = new Toast(elements.toast);
      var themeManager = new ThemeManager();
      var i18n = new I18n();
      var tabManager = new TabManager({
        tabsList: elements.tabsList,
        webviewStack: elements.webviewStack,
        tabsViewport: elements.tabsViewport,
        newTabButton: elements.newTabButton,
        getHomeUrl,
        getDefaultZoom: () => Number(appSettings.defaultZoom) || DEFAULT_SETTINGS.defaultZoom,
        privatePartition
      });
      if (elements.privateBadge) {
        elements.privateBadge.hidden = !isPrivate;
      }
      var menu = null;
      var mediaSniffer = null;
      var mediaOptions = null;
      var linkDownload = null;
      var navBar = null;
      var findBar = null;
      var sessionSaveTimer = null;
      var dialogs = new DialogController({
        confirmDialog: elements.confirmDialog,
        confirmTitle: elements.confirmTitle,
        confirmMessage: elements.confirmMessage,
        confirmCancel: elements.confirmCancel,
        confirmAccept: elements.confirmAccept,
        onBeforeOpen: () => {
          menu?.close();
          mediaSniffer?.close();
          mediaOptions?.close();
          linkDownload?.close();
        }
      });
      mediaSniffer = new MediaSniffer({
        indicator: elements.mediaIndicator,
        count: elements.mediaCount,
        panel: elements.mediaPanel,
        closeButton: elements.mediaPanelClose,
        list: elements.mediaList,
        toolStatus: elements.mediaToolStatus,
        extractButton: elements.mediaExtract,
        onOpenMedia: (url) => navigateActiveTab(url),
        onDownloadMedia: (media) => {
          void downloadDetectedMedia(media);
        },
        onExtractPage: () => {
          void extractActivePageMedia();
        },
        onBeforeOpen: () => menu?.close(),
        showToast: (message, variant) => toast.show(message, variant)
      });
      mediaOptions = new MediaOptionsDialog({
        dialog: elements.mediaOptionsDialog,
        summary: elements.mediaOptionsSummary,
        liveNotice: elements.mediaOptionsLive,
        audioSelect: elements.mediaAudioTrack,
        subtitleSelect: elements.mediaSubtitleTrack,
        startButton: elements.mediaOptionsStart,
        cancelButton: elements.mediaOptionsCancel,
        closeButton: elements.mediaOptionsClose,
        onStart: (media, selection) => {
          void startDetectedMediaDownload(media, selection);
        }
      });
      linkDownload = new LinkDownloadDialog({
        dialog: elements.linkDownloadDialog,
        elements: {
          url: elements.linkDownloadUrl,
          analyze: elements.linkDownloadAnalyze,
          result: elements.linkDownloadResult,
          name: elements.linkDownloadName,
          type: elements.linkDownloadType,
          meta: elements.linkDownloadMeta,
          warning: elements.linkDownloadWarning,
          audioField: elements.linkDownloadAudioField,
          audioSelect: elements.linkDownloadAudio,
          subtitleField: elements.linkDownloadSubtitleField,
          subtitleSelect: elements.linkDownloadSubtitle,
          status: elements.linkDownloadStatus,
          start: elements.linkDownloadStart,
          cancel: elements.linkDownloadCancel,
          close: elements.linkDownloadClose
        },
        api,
        dialogs,
        getActiveTab: () => tabManager.getActiveTab(),
        showToast: (message, variant) => toast.show(message, variant)
      });
      var favorites = new FavoritesPanel({
        dialog: elements.favoritesDialog,
        list: elements.favoritesList,
        count: elements.favoritesCount,
        foldersList: elements.favoriteFolders,
        newFolderButton: elements.newFavoriteFolderButton,
        folderForm: elements.favoriteFolderForm,
        folderNameInput: elements.favoriteFolderName,
        folderCancelButton: elements.favoriteFolderCancel,
        importButton: elements.importFavoritesButton,
        exportButton: elements.exportFavoritesButton,
        api,
        dialogs,
        onNavigate: (url) => navigateActiveTab(url),
        onChanged: () => navBar?.updateFavoriteState(),
        showToast: (message, variant) => toast.show(message, variant)
      });
      var history = new HistoryPanel({
        dialog: elements.historyDialog,
        list: elements.historyList,
        count: elements.historyCount,
        clearButton: elements.clearHistoryButton,
        api,
        dialogs,
        onNavigate: (url) => navigateActiveTab(url),
        showToast: (message, variant) => toast.show(message, variant)
      });
      var downloads = new DownloadsPanel({
        dialog: elements.downloadsDialog,
        list: elements.downloadsList,
        count: elements.downloadsCount,
        api,
        dialogs,
        showToast: (message, variant) => toast.show(message, variant)
      });
      var player = new MediaPlayer({
        dialog: elements.playerDialog,
        elements: {
          video: elements.playerVideo,
          title: elements.playerTitle,
          subtitle: elements.playerSubtitle,
          error: elements.playerError,
          reveal: elements.playerReveal,
          rewind: elements.playerRewind,
          toggle: elements.playerToggle,
          forward: elements.playerForward,
          time: elements.playerTime,
          progress: elements.playerProgress,
          mute: elements.playerMute,
          volume: elements.playerVolume,
          speed: elements.playerSpeed,
          fullscreen: elements.playerFullscreen
        },
        api,
        dialogs,
        showToast: (message, variant) => toast.show(message, variant)
      });
      var library = new LibraryPanel({
        dialog: elements.libraryDialog,
        list: elements.libraryList,
        count: elements.libraryCount,
        search: elements.librarySearch,
        filter: elements.libraryFilter,
        sort: elements.librarySort,
        importButton: elements.libraryImport,
        empty: elements.libraryEmpty,
        emptyImportButton: elements.libraryEmptyImport,
        renameDialog: elements.libraryRenameDialog,
        renameInput: elements.libraryRenameInput,
        renameError: elements.libraryRenameError,
        renameConfirm: elements.libraryRenameConfirm,
        api,
        dialogs,
        player,
        showToast: (message, variant) => toast.show(message, variant)
      });
      player.onClosed = () => library.handleChanged();
      var settings = new SettingsPanel({
        dialog: elements.settingsDialog,
        elements: {
          searchEngineSelect: elements.searchEngineSelect,
          homepageModeSelect: elements.homepageModeSelect,
          homepageCustomRow: elements.homepageCustomRow,
          homepageUrlInput: elements.homepageUrlInput,
          homepageSaveButton: elements.homepageSaveButton,
          openHomeButton: elements.openHomeButton,
          restoreSessionToggle: elements.restoreSessionToggle,
          saveHistoryToggle: elements.saveHistoryToggle,
          defaultZoomSelect: elements.defaultZoomSelect,
          adblockToggle: elements.adblockToggle,
          downloadFolderInput: elements.downloadFolderInput,
          chooseFolderButton: elements.chooseFolderButton,
          clearDataButton: elements.clearDataButton,
          resetPermissionsButton: elements.resetPermissionsButton,
          resetSettingsButton: elements.resetSettingsButton,
          status: elements.settingsStatus
        },
        api,
        dialogs,
        onSettingsChanged: (updated) => applyRuntimeSettings(updated),
        onOpenHome: () => {
          elements.settingsDialog.close();
          openHomePage();
        }
      });
      var extensions = new ExtensionsPanel({
        dialog: elements.extensionsDialog,
        list: elements.extensionsList,
        status: elements.extensionsStatus,
        api,
        dialogs,
        i18n,
        onStateChanged: (state) => {
          applyRuntimeSettings({
            theme: state.theme,
            language: state.language,
            enabledExtensions: state.enabledExtensions
          });
        },
        showToast: (message, variant) => toast.show(message, variant)
      });
      var about = new AboutPanel({
        dialog: elements.aboutDialog,
        version: elements.aboutVersion,
        electron: elements.aboutElectron,
        chrome: elements.aboutChrome,
        node: elements.aboutNode,
        api,
        dialogs
      });
      navBar = new NavBar({
        elements: {
          form: elements.navForm,
          urlInput: elements.urlInput,
          backButton: elements.backButton,
          forwardButton: elements.forwardButton,
          reloadButton: elements.reloadButton,
          homeButton: elements.homeButton,
          goButton: elements.goButton,
          clearAddressButton: elements.clearAddressButton,
          favoriteButton: elements.favoriteButton,
          progress: elements.pageProgress
        },
        getSearchEngineKey: () => String(appSettings.searchEngine || "google"),
        getActiveTab: () => tabManager.getActiveTab(),
        onNavigate: (url) => navigateActiveTab(url),
        onReload: () => reloadActiveTab(),
        onHome: () => openHomePage(),
        onFocus: () => {
          menu?.close();
          mediaSniffer?.close();
        },
        onToggleFavorite: (tab) => {
          void toggleFavorite(tab);
        },
        isFavorite: (url) => favorites.isFavorite(url),
        showToast: (message, variant) => toast.show(message, variant),
        privateMode: isPrivate
      });
      findBar = new FindBar({
        elements: {
          bar: elements.findBar,
          input: elements.findInput,
          count: elements.findCount,
          previousButton: elements.findPreviousButton,
          nextButton: elements.findNextButton,
          closeButton: elements.findCloseButton
        },
        getActiveTab: () => tabManager.getActiveTab()
      });
      menu = new AppMenu({
        button: elements.menuButton,
        menu: elements.appMenu,
        container: elements.menuContainer,
        onAction: (action) => handleMenuAction(action),
        onBeforeOpen: () => {
          mediaSniffer?.close();
          mediaOptions?.close();
        }
      });
      var ipcUnsubscribers = [];
      function navigateActiveTab(url) {
        const target = resolveAboutPageUrl(url) || url;
        if (!isTabUrl(target)) {
          toast.show("Adresse invalide.", "error");
          return;
        }
        const tab = tabManager.getActiveTab();
        if (!tab) {
          tabManager.createTab({ url: target, activate: true });
          return;
        }
        tab.navigate(target);
      }
      async function downloadDetectedMedia(media) {
        if (!media || !isHttpUrl(media.url)) {
          toast.show("Ce m\xE9dia ne peut pas \xEAtre t\xE9l\xE9charg\xE9.", "error");
          return;
        }
        const tab = tabManager.getActiveTab();
        const streamType = getStreamType(media.extension);
        if (!streamType) {
          await startDetectedMediaDownload(media, {});
          return;
        }
        toast.show("Analyse du flux\u2026", "info", 1800);
        try {
          const prepared = await api.prepareMedia({
            url: media.url,
            pageUrl: tab?.url || ""
          });
          if (!prepared || !prepared.ok) {
            toast.show(
              prepared?.message || "L\u2019analyse du flux a \xE9chou\xE9.",
              "error"
            );
            return;
          }
          if (prepared.hasTracks || prepared.isLive) {
            mediaOptions?.open(media, prepared);
            return;
          }
          await startDetectedMediaDownload(media, {
            isLive: Boolean(prepared.isLive)
          });
        } catch (error) {
          console.warn("[M\xE9dia] Pr\xE9paration impossible :", error.message);
          toast.show("L\u2019analyse du flux a \xE9chou\xE9.", "error");
        }
      }
      async function startDetectedMediaDownload(media, selection = {}) {
        const tab = tabManager.getActiveTab();
        try {
          const result = await api.downloadMedia({
            url: media.url,
            pageUrl: tab?.url || "",
            audioStreamIndex: selection.audioStreamIndex ?? null,
            subtitleStreamIndex: selection.subtitleStreamIndex ?? null,
            isLive: selection.isLive === true
          });
          if (!result || !result.ok) {
            toast.show(
              result?.message || "Le t\xE9l\xE9chargement du m\xE9dia a \xE9chou\xE9.",
              "error"
            );
            return;
          }
          if (result.queued) {
            toast.show(
              "Flux mis en file d\u2019attente. Il d\xE9marrera d\xE8s qu\u2019un emplacement sera libre.",
              "info",
              3600
            );
            return;
          }
          toast.show(
            result.mode === "stream" ? "Assemblage du flux lanc\xE9. Suivez sa progression dans T\xE9l\xE9chargements." : "T\xE9l\xE9chargement lanc\xE9.",
            "success",
            3200
          );
        } catch (error) {
          console.warn("[M\xE9dia] T\xE9l\xE9chargement impossible :", error.message);
          toast.show("Le t\xE9l\xE9chargement du m\xE9dia a \xE9chou\xE9.", "error");
        }
      }
      async function extractActivePageMedia() {
        const tab = tabManager.getActiveTab();
        const guestId = tab?.getWebContentsId?.();
        if (!Number.isInteger(guestId)) {
          toast.show("La page active n\u2019est pas encore pr\xEAte.", "info");
          return;
        }
        try {
          const result = await api.extractPageMedia(guestId);
          if (!result || !result.ok) {
            toast.show(
              result?.message || "L\u2019analyse de la page a \xE9chou\xE9.",
              "error"
            );
            return;
          }
          if (result.added > 0) {
            if (Array.isArray(result.media)) {
              mediaSniffer?.load(result.media);
            }
            toast.show(
              `${result.added} nouveau m\xE9dia d\xE9tect\xE9. Ouvrez le panneau M\xE9dias.`,
              "success",
              3600
            );
            if (!mediaSniffer?.isOpen) {
              mediaSniffer?.open();
            }
            return;
          }
          if (result.found > 0) {
            toast.show(
              "Ces m\xE9dias sont d\xE9j\xE0 pr\xE9sents dans la liste.",
              "info"
            );
            return;
          }
          toast.show(
            "Aucun m\xE9dia public trouv\xE9 dans cette page. Les flux DRM ou prot\xE9g\xE9s par un anti-bot restent indisponibles.",
            "info",
            4200
          );
        } catch (error) {
          console.warn("[M\xE9dia] Extraction impossible :", error.message);
          toast.show("L\u2019analyse de la page a \xE9chou\xE9.", "error");
        }
      }
      function openHomePage() {
        const url = getHomeUrl();
        const tab = tabManager.getActiveTab();
        if (!tab) {
          tabManager.createTab({ url, activate: true });
          return;
        }
        tab.navigate(url);
      }
      function reloadActiveTab() {
        const tab = tabManager.getActiveTab();
        if (!tab) {
          return;
        }
        if (tab.loading) {
          tab.stop();
          return;
        }
        if (!tab.reload()) {
          toast.show("La page n\u2019est pas encore pr\xEAte.", "info");
        }
      }
      function applyRuntimeSettings(updated) {
        if (!updated || typeof updated !== "object") {
          return;
        }
        const previousZoom = Number(appSettings.defaultZoom);
        appSettings = { ...appSettings, ...updated };
        if (Number(appSettings.defaultZoom) !== previousZoom) {
          tabManager.setDefaultZoom(
            Number(appSettings.defaultZoom) || DEFAULT_SETTINGS.defaultZoom
          );
        }
        themeManager.apply(appSettings.theme);
        i18n.apply(appSettings.language);
        settings.applySettings(appSettings);
        scheduleTrackerRefresh();
      }
      var trackerRefreshTimer = null;
      var trackerRequestSerial = 0;
      function hideTrackerIndicator() {
        elements.trackerIndicator.hidden = true;
        elements.trackerIndicator.classList.remove("is-active");
      }
      function renderTrackerStats(stats) {
        if (!appSettings.adBlockEnabled || !stats?.active) {
          hideTrackerIndicator();
          return;
        }
        const blocked = Math.max(0, Number(stats.blocked) || 0);
        const label = blocked === 0 ? "Aucune publicit\xE9 ou traqueur bloqu\xE9 sur cette page." : `${blocked} publicit\xE9${blocked > 1 ? "s" : ""} ou traqueur${blocked > 1 ? "s" : ""} bloqu\xE9${blocked > 1 ? "s" : ""} sur cette page.`;
        elements.trackerCount.textContent = String(blocked);
        elements.trackerIndicator.title = label;
        elements.trackerIndicator.setAttribute("aria-label", label);
        elements.trackerIndicator.classList.toggle("is-active", blocked > 0);
        elements.trackerIndicator.hidden = false;
      }
      async function refreshTrackerStatus() {
        const tab = tabManager.getActiveTab();
        const guestId = tab?.getWebContentsId?.();
        if (!appSettings.adBlockEnabled || !Number.isInteger(guestId)) {
          trackerRequestSerial += 1;
          hideTrackerIndicator();
          return;
        }
        const serial = ++trackerRequestSerial;
        try {
          const stats = await api.getAdBlockStats(guestId);
          if (serial !== trackerRequestSerial) {
            return;
          }
          if (tabManager.getActiveTab()?.getWebContentsId?.() !== guestId) {
            return;
          }
          renderTrackerStats(stats);
        } catch (error) {
          if (serial === trackerRequestSerial) {
            hideTrackerIndicator();
            console.warn(
              "[AdBlock] Statistiques indisponibles :",
              error.message
            );
          }
        }
      }
      function scheduleTrackerRefresh() {
        if (trackerRefreshTimer) {
          clearTimeout(trackerRefreshTimer);
        }
        trackerRefreshTimer = setTimeout(() => {
          trackerRefreshTimer = null;
          void refreshTrackerStatus();
        }, 160);
      }
      function scheduleSessionSave() {
        if (isPrivate) {
          return;
        }
        if (sessionSaveTimer) {
          window.clearTimeout(sessionSaveTimer);
        }
        sessionSaveTimer = window.setTimeout(() => {
          sessionSaveTimer = null;
          api.saveSession({
            tabs: tabManager.getTabs().map((tab) => ({
              url: tab.url,
              title: tab.title
            })),
            activeIndex: tabManager.getActiveIndex()
          });
        }, 250);
      }
      function saveSessionNow() {
        if (isPrivate) {
          return;
        }
        if (sessionSaveTimer) {
          window.clearTimeout(sessionSaveTimer);
          sessionSaveTimer = null;
        }
        api.saveSession({
          tabs: tabManager.getTabs().map((tab) => ({
            url: tab.url,
            title: tab.title
          })),
          activeIndex: tabManager.getActiveIndex()
        });
      }
      function changeZoom(direction) {
        let factor = null;
        if (direction === "in") {
          factor = tabManager.zoomIn();
        } else if (direction === "out") {
          factor = tabManager.zoomOut();
        } else {
          factor = tabManager.resetZoom();
        }
        if (factor === null) {
          toast.show("Aucune page active.", "info");
        }
      }
      async function openFindBar() {
        if (!findBar) {
          return;
        }
        await findBar.open();
      }
      function togglePageDevTools() {
        const tab = tabManager.getActiveTab();
        if (!tab || !tab.ready) {
          toast.show("Aucune page active pour ouvrir les DevTools.", "error");
          return;
        }
        try {
          tab.toggleDevTools();
        } catch (error) {
          toast.show(`DevTools indisponibles : ${error.message}`, "error");
        }
      }
      async function toggleApplicationDevTools() {
        try {
          const opened = await api.toggleAppDevTools();
          if (!opened) {
            toast.show("DevTools de l\u2019application indisponibles.", "error");
          }
        } catch (error) {
          toast.show(`DevTools indisponibles : ${error.message}`, "error");
        }
      }
      async function toggleFavorite(tab) {
        if (isPrivate) {
          toast.show(
            "Les favoris sont d\xE9sactiv\xE9s en navigation priv\xE9e.",
            "info"
          );
          return;
        }
        if (!tab || !isHttpUrl(tab.url)) {
          toast.show(
            "Ouvrez une page HTTP(S) pour l\u2019ajouter aux favoris.",
            "error"
          );
          return;
        }
        try {
          const result = await favorites.toggle({
            url: tab.url,
            title: tab.title
          });
          if (result?.active) {
            toast.show("Page ajout\xE9e aux favoris.", "success");
          } else {
            toast.show("Page retir\xE9e des favoris.", "info");
          }
          navBar?.updateFavoriteState();
        } catch (error) {
          toast.show(`Favoris indisponibles : ${error.message}`, "error");
        }
      }
      function handleShortcutAction(action) {
        switch (action) {
          case SHORTCUT_ACTIONS.NEW_TAB:
            tabManager.createTab({ activate: true, focusAddress: true });
            break;
          case SHORTCUT_ACTIONS.NEW_PRIVATE_WINDOW:
            api.openNewPrivateWindow();
            break;
          case SHORTCUT_ACTIONS.HOME_PAGE:
            openHomePage();
            break;
          case SHORTCUT_ACTIONS.CLOSE_TAB:
            tabManager.closeActiveTab();
            break;
          case SHORTCUT_ACTIONS.REOPEN_TAB:
            if (!tabManager.reopenClosedTab()) {
              toast.show("Aucun onglet ferm\xE9 \xE0 rouvrir.", "info");
            }
            break;
          case SHORTCUT_ACTIONS.RELOAD:
            reloadActiveTab();
            break;
          case SHORTCUT_ACTIONS.FIND_IN_PAGE:
            void openFindBar();
            break;
          case SHORTCUT_ACTIONS.FIND_NEXT:
            if (findBar?.isOpen) {
              findBar.next();
            } else {
              void openFindBar();
            }
            break;
          case SHORTCUT_ACTIONS.FIND_PREVIOUS:
            if (findBar?.isOpen) {
              findBar.previous();
            }
            break;
          case SHORTCUT_ACTIONS.ZOOM_IN:
            changeZoom("in");
            break;
          case SHORTCUT_ACTIONS.ZOOM_OUT:
            changeZoom("out");
            break;
          case SHORTCUT_ACTIONS.ZOOM_RESET:
            changeZoom("reset");
            break;
          case SHORTCUT_ACTIONS.TOGGLE_PAGE_DEVTOOLS:
            togglePageDevTools();
            break;
          case SHORTCUT_ACTIONS.FOCUS_ADDRESS:
            navBar?.focusAddress();
            break;
          default:
            console.warn("[Raccourci] Action inconnue :", action);
        }
      }
      function handleMenuAction(action) {
        switch (action) {
          case "new-tab":
            tabManager.createTab({ activate: true, focusAddress: true });
            break;
          case "new-window":
            api.openNewWindow();
            break;
          case "new-private-window":
            api.openNewPrivateWindow();
            break;
          case "home-page":
            openHomePage();
            break;
          case "reopen-tab":
            if (!tabManager.reopenClosedTab()) {
              toast.show("Aucun onglet ferm\xE9 \xE0 rouvrir.", "info");
            }
            break;
          case "find-in-page":
            void openFindBar();
            break;
          case "zoom-in":
            changeZoom("in");
            break;
          case "zoom-out":
            changeZoom("out");
            break;
          case "zoom-reset":
            changeZoom("reset");
            break;
          case "favorites":
            if (isPrivate) {
              toast.show(
                "Les favoris sont d\xE9sactiv\xE9s en navigation priv\xE9e.",
                "info"
              );
              break;
            }
            void favorites.open();
            break;
          case "history":
            void history.open();
            break;
          case "extract-media":
            void extractActivePageMedia();
            break;
          case "downloads":
            void downloads.open();
            break;
          case "download-link":
            linkDownload?.open();
            break;
          case "library":
            if (isPrivate) {
              toast.show(
                "La m\xE9diath\xE8que est d\xE9sactiv\xE9e en navigation priv\xE9e.",
                "info"
              );
              break;
            }
            void library.open();
            break;
          case "settings":
            void settings.open();
            break;
          case "extensions":
            void extensions.open();
            break;
          case "devtools-page":
            togglePageDevTools();
            break;
          case "devtools-app":
            void toggleApplicationDevTools();
            break;
          case "about":
            void about.open();
            break;
          default:
            console.warn("[Menu] Action inconnue :", action);
        }
      }
      function setupTabEvents() {
        tabManager.on("active-changed", (tab) => {
          navBar?.update(tab);
          menu?.close();
          mediaSniffer?.close();
          mediaOptions?.close();
          if (findBar?.isOpen) {
            findBar.close({ restoreFocus: false });
          }
          scheduleSessionSave();
          scheduleTrackerRefresh();
        });
        tabManager.on("active-tab-updated", (tab) => {
          navBar?.update(tab);
          scheduleSessionSave();
          scheduleTrackerRefresh();
        });
        tabManager.on("tab-created", () => {
          scheduleSessionSave();
          scheduleTrackerRefresh();
        });
        tabManager.on("tab-closed", () => {
          scheduleSessionSave();
          scheduleTrackerRefresh();
        });
        tabManager.on("tab-updated", () => {
          scheduleSessionSave();
          scheduleTrackerRefresh();
        });
        tabManager.on("found-in-page", (tab, result) => {
          findBar?.handleResult(tab, result);
        });
        tabManager.on("zoom-changed", (tab, factor) => {
          if (tab === tabManager.getActiveTab()) {
            toast.show(`Zoom : ${Math.round(factor * 100)} %`, "info", 1400);
          }
        });
        tabManager.on("tab-focused", () => {
          menu?.close();
          mediaSniffer?.close();
        });
        tabManager.on("focus-address-requested", () => {
          navBar?.focusAddress();
        });
        tabManager.on("load-failed", (tab, details) => {
          if (tabManager.getActiveTab() !== tab) {
            return;
          }
          navBar?.update(tab);
          toast.show(
            `Chargement impossible : ${details?.errorDescription || "erreur inconnue"}`,
            "error",
            4500
          );
        });
        tabManager.on("navigation-error", (tab, error) => {
          if (tabManager.getActiveTab() === tab) {
            toast.show(`Navigation impossible : ${error.message}`, "error");
          }
        });
        tabManager.on("media-started-playing", (tab) => {
          const message = tab === tabManager.getActiveTab() ? "Lecture m\xE9dia d\xE9tect\xE9e sur cette page." : `Lecture m\xE9dia d\xE9tect\xE9e dans \xAB ${tab.title} \xBB.`;
          toast.show(message, "success");
        });
      }
      function setupGlobalOverlays() {
        document.addEventListener("click", (event) => {
          if (!(event.target instanceof Node)) {
            return;
          }
          if (menu?.isOpen && !menu.contains(event.target)) {
            menu.close();
          }
          if (mediaSniffer?.isOpen && !mediaSniffer.contains(event.target)) {
            mediaSniffer.close();
          }
        });
        document.addEventListener("keydown", (event) => {
          if (event.key !== "Escape") {
            return;
          }
          if (findBar?.isOpen) {
            event.preventDefault();
            findBar.close();
            return;
          }
          if (menu?.isOpen) {
            event.preventDefault();
            menu.close({ restoreFocus: true });
            return;
          }
          if (mediaSniffer?.isOpen) {
            event.preventDefault();
            mediaSniffer.close(true);
          }
        });
        window.addEventListener("blur", () => {
          menu?.close();
        });
      }
      function setupIpcListeners() {
        const listen = (channel, listener) => {
          ipcUnsubscribers.push(api.on(channel, listener));
        };
        listen(IPC.MEDIA_DETECTED, (media) => {
          mediaSniffer?.add(media);
        });
        listen(IPC.ADBLOCK_STATS_UPDATED, (stats) => {
          const guestId = tabManager.getActiveTab()?.getWebContentsId?.();
          if (Number.isInteger(guestId) && stats?.webContentsId === guestId) {
            renderTrackerStats(stats);
          }
        });
        listen(IPC.OPEN_URL_IN_NEW_TAB, (url) => {
          if (isHttpUrl(url)) {
            tabManager.createTab({ url, activate: true });
          }
        });
        listen(IPC.SHORTCUT, (action) => {
          if (typeof action === "string") {
            handleShortcutAction(action);
          }
        });
        listen(IPC.SETTINGS_UPDATED, (updated) => {
          applyRuntimeSettings(updated);
          if (extensions.isOpen) {
            void extensions.refresh({ silent: true });
          }
        });
        listen(IPC.HISTORY_UPDATED, () => {
          if (history.isOpen) {
            void history.refresh();
          }
        });
        listen(IPC.FAVORITES_UPDATED, (list) => {
          favorites.applyList(list);
        });
        listen(IPC.FAVORITE_FOLDERS_UPDATED, (folders) => {
          favorites.applyFolders(folders);
        });
        listen(IPC.PERMISSIONS_UPDATED, () => {
          settings.setStatus("Autorisations des sites mises \xE0 jour.", "info");
        });
        listen(IPC.DOWNLOAD_STARTED, (record) => {
          downloads.handleStarted(record);
        });
        listen(IPC.DOWNLOAD_UPDATED, (record) => {
          downloads.handleUpdated(record);
        });
        listen(IPC.DOWNLOAD_DONE, (record) => {
          downloads.handleDone(record);
        });
        listen(IPC.APP_NOTIFICATION, (payload) => {
          const message = payload && typeof payload.message === "string" ? payload.message.trim() : "";
          if (!message) {
            return;
          }
          const variant = payload?.variant === "success" || payload?.variant === "error" ? payload.variant : "info";
          toast.show(message, variant);
        });
        listen(IPC.LIBRARY_UPDATED, () => {
          library.handleChanged();
        });
        listen(IPC.BROWSING_DATA_CLEARED, () => {
          toast.show("Donn\xE9es de navigation effac\xE9es.", "success");
          settings.setStatus("Donn\xE9es de navigation effac\xE9es.", "success");
          for (const tab of tabManager.getTabs()) {
            tab.reload();
          }
        });
        window.addEventListener("beforeunload", () => {
          saveSessionNow();
          for (const unsubscribe of ipcUnsubscribers) {
            unsubscribe();
          }
          ipcUnsubscribers.length = 0;
        });
      }
      async function initialize() {
        try {
          const loadedSettings = await api.getSettings();
          if (loadedSettings && typeof loadedSettings === "object") {
            applyRuntimeSettings(loadedSettings);
          }
        } catch (error) {
          console.warn("[Param\xE8tres] Lecture initiale impossible :", error.message);
          toast.show(
            "Param\xE8tres par d\xE9faut utilis\xE9s : le stockage local est indisponible.",
            "error"
          );
        }
        await Promise.allSettled([
          api.listMedia().then((media) => mediaSniffer?.load(media)).catch((error) => {
            console.warn("[M\xE9dia] Liste initiale indisponible :", error.message);
          }),
          api.getMediaCapabilities().then((capabilities) => mediaSniffer?.setCapabilities(capabilities)).catch((error) => {
            console.warn(
              "[M\xE9dia] Capacit\xE9s de t\xE9l\xE9chargement indisponibles :",
              error.message
            );
            mediaSniffer?.setCapabilities({ ffmpeg: false, ffprobe: false });
          }),
          favorites.refresh({ silent: true })
        ]);
        let sessionState = null;
        if (!isPrivate && appSettings.restoreSession) {
          try {
            sessionState = await api.getSession();
          } catch (error) {
            console.warn("[Session] Restauration impossible :", error.message);
          }
        }
        if (tabManager.size === 0) {
          const restoredTabs = [];
          if (sessionState && Array.isArray(sessionState.tabs)) {
            for (const entry of sessionState.tabs) {
              if (entry && isTabUrl(entry.url)) {
                restoredTabs.push(
                  tabManager.createTab({
                    url: isHomeUrl(entry.url) ? getHomeUrl() : entry.url,
                    activate: false
                  })
                );
              }
            }
          }
          if (restoredTabs.length === 0) {
            tabManager.createTab({ activate: true });
          } else {
            const requestedIndex = Number.isInteger(sessionState.activeIndex) ? sessionState.activeIndex : 0;
            const activeIndex = Math.min(
              Math.max(requestedIndex, 0),
              restoredTabs.length - 1
            );
            tabManager.activateTab(restoredTabs[activeIndex].id);
            scheduleSessionSave();
          }
        }
      }
      setupTabEvents();
      setupGlobalOverlays();
      setupIpcListeners();
      void initialize();
    }
  });

  // src/renderer/js/bootstrap.js
  var { loadPartials } = require_partials();
  function showBootError(error) {
    const banner = document.getElementById("boot-error");
    if (!banner) {
      return;
    }
    banner.hidden = false;
    banner.textContent = `Interface indisponible : ${error.message}`;
  }
  async function bootstrapRenderer() {
    try {
      await loadPartials();
      require_app();
    } catch (error) {
      console.error("[Interface] D\xE9marrage impossible :", error);
      showBootError(error);
    }
  }
  void bootstrapRenderer();
})();
