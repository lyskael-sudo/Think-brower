'use strict';

/**
 * Think-Browser — contrôleur des webviews invitées.
 *
 * Centralise le comportement commun à tous les onglets : ouverture contrôlée
 * des liens `target="_blank"`, refus des protocoles non HTTP(S), suivi de
 * l'historique et interception des raccourcis clavier.
 *
 * @module main/guestController
 */

const { IPC } = require('../shared/constants');
const {
  isHttpUrl,
  isSafeHttpUrl,
  isTabUrl,
  resolveAboutPageUrl,
} = require('../shared/utils');
const { APP_ICON_PATH } = require('./appIcon');
const { attachContextMenu } = require('./contextMenu');
const { handleBrowserShortcut } = require('./shortcuts');
const { applyWebContentsUserAgent } = require('./userAgent');

/**
 * Hôtes de connexion connus. Une page qui appelle `window.open` vers l'un de
 * ces domaines doit obtenir une vraie fenêtre fille, même si Chromium annonce
 * une ouverture dans l'onglet courant : les fournisseurs OAuth ont besoin de
 * `window.opener` et d'une navigation de premier niveau.
 */
const OAUTH_POPUP_HOSTS = Object.freeze([
  'accounts.google.com',
  'accounts.youtube.com',
  'login.microsoftonline.com',
  'login.live.com',
  'login.microsoft.com',
  'appleid.apple.com',
  'github.com',
  'gitlab.com',
  'auth0.com',
  'okta.com',
  'facebook.com',
  'linkedin.com',
  'discord.com',
  'slack.com',
]);

const GOOGLE_AUTH_REJECTED_MESSAGE =
  'Google a refusé la connexion. Les navigateurs intégrés (Electron) peuvent ' +
  'être bloqués par Google ; essayez Gmail dans votre navigateur système.';

/**
 * Indique si une URL peut être chargée dans une fenêtre surgissante.
 * @param {unknown} value
 * @returns {boolean}
 */
function isAllowedPopupUrl(value) {
  return value === '' || value === 'about:blank' || isSafeHttpUrl(value);
}

/**
 * Indique si une URL appartient à un fournisseur d'identité connu.
 * @param {unknown} value
 * @returns {boolean}
 */
function isOAuthPopupUrl(value) {
  if (!isSafeHttpUrl(value)) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname
      .toLowerCase()
      .replace(/\.$/, '');

    return OAUTH_POPUP_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

/**
 * Détecte la page de refus renvoyée par Google après une tentative de
 * connexion. Elle ne prouve pas à elle seule la cause du refus, mais elle
 * survient systématiquement dans un navigateur Electron embarqué.
 * @param {unknown} value
 * @returns {boolean}
 */
function isGoogleAuthRejectedUrl(value) {
  if (!isSafeHttpUrl(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);

    return (
      parsed.hostname === 'accounts.google.com' &&
      /\/signin\/rejected\/?$/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * Détecte une taille explicite dans les options de `window.open`.
 * @param {string} features
 * @returns {boolean}
 */
function hasExplicitPopupSize(features) {
  return /(?:^|,)\s*(?:width|height)\s*=/i.test(features || '');
}

/**
 * Décide si une demande `window.open` doit créer une fenêtre fille.
 * @param {Electron.HandlerDetails} details
 * @param {string} url
 * @returns {boolean}
 */
function shouldOpenPopup(details, url) {
  const frameName =
    typeof details?.frameName === 'string' ? details.frameName : '';

  return (
    details?.disposition === 'new-window' ||
    Boolean(details?.features?.trim()) ||
    Boolean(details?.postBody) ||
    url === '' ||
    url === 'about:blank' ||
    (Boolean(frameName) && !frameName.startsWith('_')) ||
    isOAuthPopupUrl(url)
  );
}

/**
 * Construit les options sécurisées d'une fenêtre surgissante.
 * @param {Electron.BrowserWindow} browserWindow
 * @param {string} partition
 * @param {Electron.HandlerDetails} details
 * @returns {Electron.BrowserWindowConstructorOptions}
 */
function buildPopupWindowOptions(browserWindow, partition, details) {
  /** @type {Electron.WebPreferences} */
  const webPreferences = {
    javascript: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    contextIsolation: true,
    sandbox: true,
    webviewTag: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    plugins: true,
  };

  // Fenêtre normale : pas de partition explicite, donc session par défaut
  // persistante (cookies Gmail/YouTube conservés). Fenêtre privée : la
  // partition éphémère de la fenêtre hôte est réutilisée.
  if (partition) {
    webPreferences.partition = partition;
  }

  const options = {
    parent: browserWindow,
    modal: false,
    show: true,
    autoHideMenuBar: true,
    backgroundColor: '#0b0f14',
    icon: APP_ICON_PATH,
    title: 'Think-Browser',
    webPreferences,
  };

  if (!hasExplicitPopupSize(details?.features)) {
    options.width = 520;
    options.height = 640;
  }

  return options;
}

/**
 * Applique les garde-fous à une fenêtre ouverte par `window.open`.
 * @param {Electron.BrowserWindow} popup
 * @param {object} options
 * @param {string} [options.partition] Partition de session de la fenêtre hôte.
 * @param {(guestId: number) => void} [options.registerOwnedGuest]
 * @param {(guestId: number) => void} [options.unregisterOwnedGuest]
 * @param {() => void} [options.onAuthRejected]
 */
function attachPopupController(
  popup,
  {
    partition = '',
    registerOwnedGuest,
    unregisterOwnedGuest,
    onAuthRejected,
  } = {},
) {
  const webContents = popup.webContents;
  let authRejectedNotified = false;

  registerOwnedGuest?.(webContents.id);
  applyWebContentsUserAgent(webContents);
  popup.setMenuBarVisibility(false);

  // Une fenêtre OAuth peut elle-même ouvrir une seconde fenêtre (choix du
  // compte, fournisseur fédéré). On autorise uniquement les domaines de
  // connexion connus ; tout le reste reste bloqué.
  webContents.setWindowOpenHandler((details) => {
    const url = typeof details?.url === 'string' ? details.url : '';

    if (isOAuthPopupUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: buildPopupWindowOptions(
          popup,
          partition,
          details,
        ),
      };
    }

    return { action: 'deny' };
  });

  const guardNavigation = (event, url) => {
    if (!isAllowedPopupUrl(url)) {
      event.preventDefault();
      console.warn('[Fenêtre] Navigation refusée :', url);
    }
  };

  webContents.on('will-navigate', guardNavigation);
  webContents.on('will-redirect', guardNavigation);

  webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  const notifyAuthRejected = (_event, url) => {
    if (authRejectedNotified || !isGoogleAuthRejectedUrl(url)) {
      return;
    }

    authRejectedNotified = true;
    onAuthRejected?.();
  };

  webContents.on('did-navigate', notifyAuthRejected);
  webContents.on('did-navigate-in-page', notifyAuthRejected);
  webContents.on('did-redirect-navigation', notifyAuthRejected);

  webContents.on('did-create-window', (child) => {
    attachPopupController(child, {
      partition,
      registerOwnedGuest,
      unregisterOwnedGuest,
      onAuthRejected,
    });
  });

  popup.once('closed', () => {
    unregisterOwnedGuest?.(webContents.id);
  });
}

/**
 * Attache les comportements Think-Browser à une webview.
 *
 * Les liens `target="_blank"` restent des onglets. Les appels à `window.open`
 * avec des options (OAuth, paiement, impression) deviennent de vraies fenêtres
 * filles sécurisées, afin de conserver `window.opener` et les échanges
 * `postMessage` attendus par les sites.
 *
 * @param {Electron.BrowserWindow} browserWindow
 * @param {Electron.WebContents} guest
 * @param {object} options
 * @param {import('./store').Store} options.store
 * @param {(browserWindow: Electron.BrowserWindow, channel: string, payload?: unknown) => void} options.sendToWindow
 * @param {(browserWindow: Electron.BrowserWindow) => void} options.onToggleAppDevTools
 * @param {boolean} [options.trackHistory]
 * @param {string} [options.partition]
 * @param {(guestId: number) => void} [options.registerOwnedGuest]
 * @param {(guestId: number) => void} [options.unregisterOwnedGuest]
 * @param {(payload: object) => Promise<object> | object} [options.onDownloadMedia]
 * @param {(guest: Electron.WebContents, params: Electron.ContextMenuParams) => string | null} [options.resolveMediaUrl]
 * @param {(guest: Electron.WebContents, params: Electron.ContextMenuParams) => object | null} [options.resolveMediaPair]
 */
function attachGuestController(
  browserWindow,
  guest,
  {
    store,
    sendToWindow,
    onToggleAppDevTools,
    trackHistory = true,
    partition = '',
    registerOwnedGuest,
    unregisterOwnedGuest,
    onDownloadMedia,
    resolveMediaUrl,
    resolveMediaPair,
  },
) {
  applyWebContentsUserAgent(guest);

  let authRejectedNotified = false;

  const reportAuthRejected = () => {
    if (authRejectedNotified) {
      return;
    }

    authRejectedNotified = true;
    sendToWindow?.(browserWindow, IPC.APP_NOTIFICATION, {
      message: GOOGLE_AUTH_REJECTED_MESSAGE,
      variant: 'error',
    });
  };

  const notifyAuthRejected = (_event, url) => {
    if (isGoogleAuthRejectedUrl(url)) {
      reportAuthRejected();
    }
  };

  guest.on('did-navigate', notifyAuthRejected);
  guest.on('did-navigate-in-page', notifyAuthRejected);
  guest.on('did-redirect-navigation', notifyAuthRejected);

  guest.setWindowOpenHandler((details) => {
    const url = typeof details?.url === 'string' ? details.url : '';

    if (shouldOpenPopup(details, url) && isAllowedPopupUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: buildPopupWindowOptions(
          browserWindow,
          partition,
          details,
        ),
      };
    }

    if (isSafeHttpUrl(url)) {
      sendToWindow(browserWindow, IPC.OPEN_URL_IN_NEW_TAB, url);
    } else if (url && url !== 'about:blank') {
      console.warn('[Webview] Ouverture refusée :', url);
    }

    return { action: 'deny' };
  });

  guest.on('did-create-window', (popup) => {
    attachPopupController(popup, {
      partition,
      registerOwnedGuest,
      unregisterOwnedGuest,
      onAuthRejected: reportAuthRejected,
    });
  });

  /**
   * Redirige un alias `about:*` connu vers sa page interne. Une page distante
   * ne peut donc pas ouvrir un document `about:` brut dans la webview, et
   * l'alias ne part jamais vers le moteur de recherche.
   * @param {Electron.Event} event
   * @param {unknown} url
   * @returns {boolean} `true` si l'événement a été traité.
   */
  const openInternalAlias = (event, url) => {
    const internalUrl = resolveAboutPageUrl(url);

    if (!internalUrl) {
      return false;
    }

    event.preventDefault();

    try {
      if (!guest.isDestroyed()) {
        guest.loadURL(internalUrl);
      }
    } catch (error) {
      console.warn('[Webview] Page interne inaccessible :', error.message);
    }

    return true;
  };

  guest.on('will-navigate', (event, url) => {
    if (openInternalAlias(event, url)) {
      return;
    }

    if (!isTabUrl(url)) {
      event.preventDefault();
      console.warn('[Webview] Protocole non autorisé :', url);
    }
  });

  guest.on('will-redirect', (event, url) => {
    if (openInternalAlias(event, url)) {
      return;
    }

    if (!isTabUrl(url)) {
      event.preventDefault();
      console.warn('[Webview] Redirection non autorisée :', url);
    }
  });

  guest.on('before-input-event', (event, input) => {
    handleBrowserShortcut(event, input, browserWindow, {
      onToggleAppDevTools,
    });
  });

  attachContextMenu({
    browserWindow,
    guest,
    sendToWindow,
    onDownloadMedia,
    resolveMediaUrl,
    resolveMediaPair,
  });

  if (trackHistory) {
    trackGuestHistory(guest, store);
  }
}

/**
 * Enregistre les navigations d'une webview dans l'historique global.
 * @param {Electron.WebContents} guest
 * @param {import('./store').Store} store
 */
function trackGuestHistory(guest, store) {
  /** @type {{id: string, url: string, title: string, visitedAt: string} | null} */
  let currentEntry = null;

  /**
   * @param {string} url
   */
  const recordNavigation = (url) => {
    if (!isHttpUrl(url)) {
      return;
    }

    let pageTitle = '';

    try {
      pageTitle = guest.getTitle();
    } catch {
      // La webview peut être détruite pendant la navigation.
    }

    currentEntry = store.addHistoryEntry(url, pageTitle);
  };

  guest.on('did-navigate', (_event, url) => {
    recordNavigation(url);
  });

  guest.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame) {
      recordNavigation(url);
    }
  });

  guest.on('page-title-updated', (_event, title) => {
    if (!currentEntry) {
      return;
    }

    let currentUrl = currentEntry.url;

    try {
      currentUrl = guest.getURL() || currentEntry.url;
    } catch {
      // On conserve l'URL mémorisée lors de la navigation.
    }

    store.updateHistoryEntry(currentEntry.id, title, currentUrl);
  });
}

module.exports = {
  attachGuestController,
  attachPopupController,
  buildPopupWindowOptions,
  isGoogleAuthRejectedUrl,
  isOAuthPopupUrl,
  shouldOpenPopup,
  trackGuestHistory,
};
