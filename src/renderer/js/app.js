'use strict';

/**
 * Think-Browser — point d'entrée du renderer.
 *
 * Ce module assemble les composants d'interface, relie leurs callbacks et
 * écoute les événements du processus principal. Il ne contient aucune logique
 * réseau, disque ou Electron bas niveau : chaque responsabilité est déléguée
 * au module spécialisé.
 *
 * @module renderer/app
 */

// Ce module est chargé par `bootstrap.js` après l'assemblage des fragments.
// Les chemins ci-dessous sont relatifs au dossier `src/renderer/js`. Les
// modules d'interface utilisent ensuite leurs propres chemins Node.
const { api } = require('./api');
const {
  DEFAULT_SETTINGS,
  IPC,
  SHORTCUT_ACTIONS,
} = require('../../shared/constants');
const {
  buildHomeUrl,
  getStreamType,
  isHomeUrl,
  isHttpUrl,
  isTabUrl,
  resolveAboutPageUrl,
} = require('../../shared/utils');
const { I18n } = require('./i18n');
const { MediaSniffer } = require('./mediaSniffer');
const { NavBar } = require('./navBar');
const { TabManager } = require('./tabManager');
const { ThemeManager } = require('./theme');
const { AboutPanel } = require('./ui/about');
const { DialogController } = require('./ui/dialog');
const { DownloadsPanel } = require('./ui/downloads');
const { ExtensionsPanel } = require('./ui/extensions');
const { FavoritesPanel } = require('./ui/favorites');
const { FindBar } = require('./ui/findBar');
const { HistoryPanel } = require('./ui/history');
const { LibraryPanel } = require('./ui/library');
const { LinkDownloadDialog } = require('./ui/linkDownload');
const { AppMenu } = require('./ui/menu');
const { MediaOptionsDialog } = require('./ui/mediaOptions');
const { MediaPlayer } = require('./ui/player');
const { SettingsPanel } = require('./ui/settings');
const { Toast } = require('./ui/toast');

const windowQuery = new URLSearchParams(window.location.search);
const isPrivate = windowQuery.get('mode') === 'private';
const privatePartition = isPrivate
  ? windowQuery.get('partition') ||
    `think-private-fallback-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`
  : '';

if (isPrivate) {
  document.body.classList.add('is-private');
}

/** @type {Record<string, unknown>} */
let appSettings = {
  ...DEFAULT_SETTINGS,
  downloadDir: '',
};

/**
 * Retourne l'URL à ouvrir pour un nouvel onglet ou le bouton d'accueil.
 * La page locale reçoit le moteur courant en paramètre afin que sa recherche
 * reste alignée sur les paramètres.
 * @returns {string}
 */
function getHomeUrl() {
  if (
    appSettings.homePageMode === 'custom' &&
    isHttpUrl(appSettings.homePageUrl)
  ) {
    return String(appSettings.homePageUrl);
  }

  return buildHomeUrl(String(appSettings.searchEngine || 'google'));
}

const elements = {
  tabsList: document.getElementById('tabs-list'),
  tabsViewport: document.querySelector('.tabs-viewport'),
  webviewStack: document.getElementById('webview-stack'),
  newTabButton: document.getElementById('new-tab-button'),

  navForm: document.getElementById('nav-form'),
  urlInput: document.getElementById('url-input'),
  backButton: document.getElementById('back-button'),
  forwardButton: document.getElementById('forward-button'),
  reloadButton: document.getElementById('reload-button'),
  homeButton: document.getElementById('home-button'),
  goButton: document.getElementById('go-button'),
  clearAddressButton: document.getElementById('clear-address-button'),
  favoriteButton: document.getElementById('favorite-button'),
  pageProgress: document.getElementById('page-progress'),
  privateBadge: document.getElementById('private-badge'),

  findBar: document.getElementById('find-bar'),
  findInput: document.getElementById('find-input'),
  findCount: document.getElementById('find-count'),
  findPreviousButton: document.getElementById('find-previous'),
  findNextButton: document.getElementById('find-next'),
  findCloseButton: document.getElementById('find-close'),

  trackerIndicator: document.getElementById('tracker-indicator'),
  trackerCount: document.getElementById('tracker-count'),

  mediaIndicator: document.getElementById('media-indicator'),
  mediaCount: document.getElementById('media-count'),
  mediaPanel: document.getElementById('media-panel'),
  mediaPanelClose: document.getElementById('media-panel-close'),
  mediaExtract: document.getElementById('media-extract'),
  mediaList: document.getElementById('media-list'),
  mediaToolStatus: document.getElementById('media-tool-status'),

  mediaOptionsDialog: document.getElementById('media-options-dialog'),
  mediaOptionsSummary: document.getElementById('media-options-summary'),
  mediaOptionsLive: document.getElementById('media-options-live'),
  mediaAudioTrack: document.getElementById('media-audio-track'),
  mediaSubtitleTrack: document.getElementById('media-subtitle-track'),
  mediaOptionsStart: document.getElementById('media-options-start'),
  mediaOptionsCancel: document.getElementById('media-options-cancel'),
  mediaOptionsClose: document.getElementById('media-options-close'),
  toast: document.getElementById('toast'),

  linkDownloadDialog: document.getElementById('link-download-dialog'),
  linkDownloadUrl: document.getElementById('link-download-url'),
  linkDownloadAnalyze: document.getElementById('link-download-analyze'),
  linkDownloadResult: document.getElementById('link-download-result'),
  linkDownloadName: document.getElementById('link-download-name'),
  linkDownloadType: document.getElementById('link-download-type'),
  linkDownloadMeta: document.getElementById('link-download-meta'),
  linkDownloadWarning: document.getElementById('link-download-warning'),
  linkDownloadAudioField: document.getElementById(
    'link-download-audio-field',
  ),
  linkDownloadAudio: document.getElementById('link-download-audio'),
  linkDownloadSubtitleField: document.getElementById(
    'link-download-subtitle-field',
  ),
  linkDownloadSubtitle: document.getElementById('link-download-subtitle'),
  linkDownloadStatus: document.getElementById('link-download-status'),
  linkDownloadStart: document.getElementById('link-download-start'),
  linkDownloadCancel: document.getElementById('link-download-cancel'),
  linkDownloadClose: document.getElementById('link-download-close'),

  menuButton: document.getElementById('menu-button'),
  appMenu: document.getElementById('app-menu'),
  menuContainer: document.querySelector('.menu-container'),

  historyDialog: document.getElementById('history-dialog'),
  historyCount: document.getElementById('history-count'),
  historyList: document.getElementById('history-list'),
  clearHistoryButton: document.getElementById('clear-history-button'),

  downloadsDialog: document.getElementById('downloads-dialog'),
  downloadsCount: document.getElementById('downloads-count'),
  downloadsList: document.getElementById('downloads-list'),

  libraryDialog: document.getElementById('library-dialog'),
  libraryList: document.getElementById('library-list'),
  libraryCount: document.getElementById('library-count'),
  librarySearch: document.getElementById('library-search'),
  libraryFilter: document.getElementById('library-filter'),
  librarySort: document.getElementById('library-sort'),
  libraryImport: document.getElementById('library-import'),
  libraryEmpty: document.getElementById('library-empty'),
  libraryEmptyImport: document.getElementById('library-empty-import'),
  libraryRenameDialog: document.getElementById('library-rename-dialog'),
  libraryRenameInput: document.getElementById('library-rename-input'),
  libraryRenameError: document.getElementById('library-rename-error'),
  libraryRenameConfirm: document.getElementById('library-rename-confirm'),

  playerDialog: document.getElementById('player-dialog'),
  playerVideo: document.getElementById('player-video'),
  playerTitle: document.getElementById('player-title'),
  playerSubtitle: document.getElementById('player-subtitle'),
  playerError: document.getElementById('player-error'),
  playerReveal: document.getElementById('player-reveal'),
  playerRewind: document.getElementById('player-rewind'),
  playerToggle: document.getElementById('player-toggle'),
  playerForward: document.getElementById('player-forward'),
  playerTime: document.getElementById('player-time'),
  playerProgress: document.getElementById('player-progress'),
  playerMute: document.getElementById('player-mute'),
  playerVolume: document.getElementById('player-volume'),
  playerSpeed: document.getElementById('player-speed'),
  playerFullscreen: document.getElementById('player-fullscreen'),

  favoritesDialog: document.getElementById('favorites-dialog'),
  favoritesCount: document.getElementById('favorites-count'),
  favoritesList: document.getElementById('favorites-list'),
  favoriteFolders: document.getElementById('favorite-folders'),
  newFavoriteFolderButton: document.getElementById(
    'new-favorite-folder-button',
  ),
  favoriteFolderForm: document.getElementById('favorite-folder-form'),
  favoriteFolderName: document.getElementById('favorite-folder-name'),
  favoriteFolderCancel: document.getElementById(
    'favorite-folder-cancel',
  ),
  importFavoritesButton: document.getElementById('import-favorites-button'),
  exportFavoritesButton: document.getElementById('export-favorites-button'),

  settingsDialog: document.getElementById('settings-dialog'),
  searchEngineSelect: document.getElementById('search-engine-select'),
  homepageModeSelect: document.getElementById('homepage-mode-select'),
  homepageCustomRow: document.getElementById('homepage-custom-row'),
  homepageUrlInput: document.getElementById('homepage-url-input'),
  homepageSaveButton: document.getElementById('homepage-save-button'),
  openHomeButton: document.getElementById('open-home-button'),
  restoreSessionToggle: document.getElementById('restore-session-toggle'),
  saveHistoryToggle: document.getElementById('save-history-toggle'),
  defaultZoomSelect: document.getElementById('default-zoom-select'),
  adblockToggle: document.getElementById('adblock-toggle'),
  downloadFolderInput: document.getElementById('download-folder-input'),
  chooseFolderButton: document.getElementById('choose-folder-button'),
  clearDataButton: document.getElementById('clear-browsing-data-button'),
  resetPermissionsButton: document.getElementById(
    'reset-permissions-button',
  ),
  resetSettingsButton: document.getElementById('reset-settings-button'),
  settingsStatus: document.getElementById('settings-status'),

  extensionsDialog: document.getElementById('extensions-dialog'),
  extensionsList: document.getElementById('extensions-list'),
  extensionsStatus: document.getElementById('extensions-status'),

  aboutDialog: document.getElementById('about-dialog'),
  aboutVersion: document.getElementById('about-version'),
  aboutElectron: document.getElementById('about-electron'),
  aboutChrome: document.getElementById('about-chrome'),
  aboutNode: document.getElementById('about-node'),

  confirmDialog: document.getElementById('confirm-dialog'),
  confirmTitle: document.getElementById('confirm-title'),
  confirmMessage: document.getElementById('confirm-message'),
  confirmCancel: document.getElementById('confirm-cancel'),
  confirmAccept: document.getElementById('confirm-accept'),
};

const toast = new Toast(elements.toast);
const themeManager = new ThemeManager();
const i18n = new I18n();

const tabManager = new TabManager({
  tabsList: elements.tabsList,
  webviewStack: elements.webviewStack,
  tabsViewport: elements.tabsViewport,
  newTabButton: elements.newTabButton,
  getHomeUrl,
  getDefaultZoom: () =>
    Number(appSettings.defaultZoom) || DEFAULT_SETTINGS.defaultZoom,
  privatePartition,
});

if (elements.privateBadge) {
  elements.privateBadge.hidden = !isPrivate;
}

/** @type {AppMenu | null} */
let menu = null;

/** @type {MediaSniffer | null} */
let mediaSniffer = null;

/** @type {MediaOptionsDialog | null} */
let mediaOptions = null;

/** @type {LinkDownloadDialog | null} */
let linkDownload = null;

/** @type {NavBar | null} */
let navBar = null;

/** @type {FindBar | null} */
let findBar = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let sessionSaveTimer = null;

const dialogs = new DialogController({
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
  },
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
  showToast: (message, variant) => toast.show(message, variant),
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
  },
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
    close: elements.linkDownloadClose,
  },
  api,
  dialogs,
  getActiveTab: () => tabManager.getActiveTab(),
  showToast: (message, variant) => toast.show(message, variant),
});

const favorites = new FavoritesPanel({
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
  showToast: (message, variant) => toast.show(message, variant),
});

const history = new HistoryPanel({
  dialog: elements.historyDialog,
  list: elements.historyList,
  count: elements.historyCount,
  clearButton: elements.clearHistoryButton,
  api,
  dialogs,
  onNavigate: (url) => navigateActiveTab(url),
  showToast: (message, variant) => toast.show(message, variant),
});

const downloads = new DownloadsPanel({
  dialog: elements.downloadsDialog,
  list: elements.downloadsList,
  count: elements.downloadsCount,
  api,
  dialogs,
  showToast: (message, variant) => toast.show(message, variant),
});

const player = new MediaPlayer({
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
    fullscreen: elements.playerFullscreen,
  },
  api,
  dialogs,
  showToast: (message, variant) => toast.show(message, variant),
});

const library = new LibraryPanel({
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
  showToast: (message, variant) => toast.show(message, variant),
});

player.onClosed = () => library.handleChanged();

const settings = new SettingsPanel({
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
    status: elements.settingsStatus,
  },
  api,
  dialogs,
  onSettingsChanged: (updated) => applyRuntimeSettings(updated),
  onOpenHome: () => {
    elements.settingsDialog.close();
    openHomePage();
  },
});

const extensions = new ExtensionsPanel({
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
      enabledExtensions: state.enabledExtensions,
    });
  },
  showToast: (message, variant) => toast.show(message, variant),
});

const about = new AboutPanel({
  dialog: elements.aboutDialog,
  version: elements.aboutVersion,
  electron: elements.aboutElectron,
  chrome: elements.aboutChrome,
  node: elements.aboutNode,
  api,
  dialogs,
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
    progress: elements.pageProgress,
  },
  getSearchEngineKey: () => String(appSettings.searchEngine || 'google'),
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
  privateMode: isPrivate,
});

findBar = new FindBar({
  elements: {
    bar: elements.findBar,
    input: elements.findInput,
    count: elements.findCount,
    previousButton: elements.findPreviousButton,
    nextButton: elements.findNextButton,
    closeButton: elements.findCloseButton,
  },
  getActiveTab: () => tabManager.getActiveTab(),
});

menu = new AppMenu({
  button: elements.menuButton,
  menu: elements.appMenu,
  container: elements.menuContainer,
  onAction: (action) => handleMenuAction(action),
  onBeforeOpen: () => {
    mediaSniffer?.close();
    mediaOptions?.close();
  },
});

/** @type {Array<() => void>} */
const ipcUnsubscribers = [];

/**
 * Navigue dans l'onglet actif, ou crée un onglet si nécessaire.
 * @param {string} url
 */
function navigateActiveTab(url) {
  const target = resolveAboutPageUrl(url) || url;

  if (!isTabUrl(target)) {
    toast.show('Adresse invalide.', 'error');
    return;
  }

  const tab = tabManager.getActiveTab();

  if (!tab) {
    tabManager.createTab({ url: target, activate: true });
    return;
  }

  tab.navigate(target);
}

/**
 * Lance le téléchargement d'un média détecté, après analyse des pistes pour
 * les manifestes HLS/DASH.
 * @param {{url: string, extension?: string}} media
 * @returns {Promise<void>}
 */
async function downloadDetectedMedia(media) {
  if (!media || !isHttpUrl(media.url)) {
    toast.show('Ce média ne peut pas être téléchargé.', 'error');
    return;
  }

  const tab = tabManager.getActiveTab();
  const streamType = getStreamType(media.extension);

  if (!streamType) {
    await startDetectedMediaDownload(media, {});
    return;
  }

  toast.show('Analyse du flux…', 'info', 1800);

  try {
    const prepared = await api.prepareMedia({
      url: media.url,
      pageUrl: tab?.url || '',
    });

    if (!prepared || !prepared.ok) {
      toast.show(
        prepared?.message || 'L’analyse du flux a échoué.',
        'error',
      );
      return;
    }

    if (prepared.hasTracks || prepared.isLive) {
      mediaOptions?.open(media, prepared);
      return;
    }

    await startDetectedMediaDownload(media, {
      isLive: Boolean(prepared.isLive),
    });
  } catch (error) {
    console.warn('[Média] Préparation impossible :', error.message);
    toast.show('L’analyse du flux a échoué.', 'error');
  }
}

/**
 * Envoie la demande de téléchargement au processus principal.
 * @param {{url: string}} media
 * @param {object} [selection]
 * @returns {Promise<void>}
 */
async function startDetectedMediaDownload(media, selection = {}) {
  const tab = tabManager.getActiveTab();

  try {
    const result = await api.downloadMedia({
      url: media.url,
      pageUrl: tab?.url || '',
      audioStreamIndex: selection.audioStreamIndex ?? null,
      subtitleStreamIndex: selection.subtitleStreamIndex ?? null,
      isLive: selection.isLive === true,
    });

    if (!result || !result.ok) {
      toast.show(
        result?.message || 'Le téléchargement du média a échoué.',
        'error',
      );
      return;
    }

    if (result.queued) {
      toast.show(
        'Flux mis en file d’attente. Il démarrera dès qu’un emplacement ' +
          'sera libre.',
        'info',
        3600,
      );
      return;
    }

    toast.show(
      result.mode === 'stream'
        ? 'Assemblage du flux lancé. Suivez sa progression dans Téléchargements.'
        : 'Téléchargement lancé.',
      'success',
      3200,
    );
  } catch (error) {
    console.warn('[Média] Téléchargement impossible :', error.message);
    toast.show('Le téléchargement du média a échoué.', 'error');
  }
}

/**
 * Analyse la page active pour proposer les médias présents dans son DOM ou
 * dans les scripts publics de sites pris en charge.
 * @returns {Promise<void>}
 */
async function extractActivePageMedia() {
  const tab = tabManager.getActiveTab();
  const guestId = tab?.getWebContentsId?.();

  if (!Number.isInteger(guestId)) {
    toast.show('La page active n’est pas encore prête.', 'info');
    return;
  }

  try {
    const result = await api.extractPageMedia(guestId);

    if (!result || !result.ok) {
      toast.show(
        result?.message || 'L’analyse de la page a échoué.',
        'error',
      );
      return;
    }

    if (result.added > 0) {
      // L'événement MEDIA_DETECTED peut arriver après la réponse IPC : on
      // synchronise explicitement la liste avant d'ouvrir le panneau.
      if (Array.isArray(result.media)) {
        mediaSniffer?.load(result.media);
      }

      toast.show(
        `${result.added} nouveau média détecté. Ouvrez le panneau Médias.`,
        'success',
        3600,
      );

      if (!mediaSniffer?.isOpen) {
        mediaSniffer?.open();
      }

      return;
    }

    if (result.found > 0) {
      toast.show(
        'Ces médias sont déjà présents dans la liste.',
        'info',
      );
      return;
    }

    toast.show(
      'Aucun média public trouvé dans cette page. Les flux DRM ou ' +
        'protégés par un anti-bot restent indisponibles.',
      'info',
      4200,
    );
  } catch (error) {
    console.warn('[Média] Extraction impossible :', error.message);
    toast.show('L’analyse de la page a échoué.', 'error');
  }
}

/**
 * Ouvre la page d'accueil configurée dans l'onglet actif.
 */
function openHomePage() {
  const url = getHomeUrl();
  const tab = tabManager.getActiveTab();

  if (!tab) {
    tabManager.createTab({ url, activate: true });
    return;
  }

  tab.navigate(url);
}

/**
 * Recharge l'onglet actif ou interrompt son chargement.
 */
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
    toast.show('La page n’est pas encore prête.', 'info');
  }
}

/**
 * Applique une mise à jour de paramètres aux composants actifs.
 * @param {unknown} updated
 */
function applyRuntimeSettings(updated) {
  if (!updated || typeof updated !== 'object') {
    return;
  }

  const previousZoom = Number(appSettings.defaultZoom);
  appSettings = { ...appSettings, ...updated };

  if (Number(appSettings.defaultZoom) !== previousZoom) {
    tabManager.setDefaultZoom(
      Number(appSettings.defaultZoom) || DEFAULT_SETTINGS.defaultZoom,
    );
  }

  themeManager.apply(appSettings.theme);
  i18n.apply(appSettings.language);
  settings.applySettings(appSettings);
  scheduleTrackerRefresh();
}

/** @type {ReturnType<typeof setTimeout> | null} */
let trackerRefreshTimer = null;

let trackerRequestSerial = 0;

/**
 * Masque l'indicateur de blocage.
 */
function hideTrackerIndicator() {
  elements.trackerIndicator.hidden = true;
  elements.trackerIndicator.classList.remove('is-active');
}

/**
 * Affiche les statistiques de l'onglet actif.
 * @param {object} stats
 */
function renderTrackerStats(stats) {
  if (!appSettings.adBlockEnabled || !stats?.active) {
    hideTrackerIndicator();
    return;
  }

  const blocked = Math.max(0, Number(stats.blocked) || 0);
  const label =
    blocked === 0
      ? 'Aucune publicité ou traqueur bloqué sur cette page.'
      : `${blocked} publicité${blocked > 1 ? 's' : ''} ou traqueur${
          blocked > 1 ? 's' : ''
        } bloqué${blocked > 1 ? 's' : ''} sur cette page.`;

  elements.trackerCount.textContent = String(blocked);
  elements.trackerIndicator.title = label;
  elements.trackerIndicator.setAttribute('aria-label', label);
  elements.trackerIndicator.classList.toggle('is-active', blocked > 0);
  elements.trackerIndicator.hidden = false;
}

/**
 * Demande les statistiques de la webview active.
 * @returns {Promise<void>}
 */
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
        '[AdBlock] Statistiques indisponibles :',
        error.message,
      );
    }
  }
}

/**
 * Regroupe les rafraîchissements pour éviter un appel IPC à chaque événement
 * de cycle de vie d'un onglet.
 */
function scheduleTrackerRefresh() {
  if (trackerRefreshTimer) {
    clearTimeout(trackerRefreshTimer);
  }

  trackerRefreshTimer = setTimeout(() => {
    trackerRefreshTimer = null;
    void refreshTrackerStatus();
  }, 160);
}

/**
 * Programme l'enregistrement de l'état de session. Les fenêtres privées ne
 * participent jamais à la restauration.
 */
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
        title: tab.title,
      })),
      activeIndex: tabManager.getActiveIndex(),
    });
  }, 250);
}

/**
 * Enregistre immédiatement la session avant la fermeture de la fenêtre.
 */
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
      title: tab.title,
    })),
    activeIndex: tabManager.getActiveIndex(),
  });
}

/**
 * Applique un zoom et affiche le pourcentage obtenu.
 * @param {'in' | 'out' | 'reset'} direction
 */
function changeZoom(direction) {
  let factor = null;

  if (direction === 'in') {
    factor = tabManager.zoomIn();
  } else if (direction === 'out') {
    factor = tabManager.zoomOut();
  } else {
    factor = tabManager.resetZoom();
  }

  if (factor === null) {
    toast.show('Aucune page active.', 'info');
  }
}

/**
 * Ouvre la recherche dans la page.
 * @returns {Promise<void>}
 */
async function openFindBar() {
  if (!findBar) {
    return;
  }

  await findBar.open();
}

/**
 * Ouvre ou referme les DevTools de la page active.
 */
function togglePageDevTools() {
  const tab = tabManager.getActiveTab();

  if (!tab || !tab.ready) {
    toast.show('Aucune page active pour ouvrir les DevTools.', 'error');
    return;
  }

  try {
    tab.toggleDevTools();
  } catch (error) {
    toast.show(`DevTools indisponibles : ${error.message}`, 'error');
  }
}

/**
 * Ouvre ou referme les DevTools de l'application.
 * @returns {Promise<void>}
 */
async function toggleApplicationDevTools() {
  try {
    const opened = await api.toggleAppDevTools();

    if (!opened) {
      toast.show('DevTools de l’application indisponibles.', 'error');
    }
  } catch (error) {
    toast.show(`DevTools indisponibles : ${error.message}`, 'error');
  }
}

/**
 * Ajoute ou retire l'onglet actif des favoris.
 * @param {object} tab
 * @returns {Promise<void>}
 */
async function toggleFavorite(tab) {
  if (isPrivate) {
    toast.show(
      'Les favoris sont désactivés en navigation privée.',
      'info',
    );
    return;
  }

  if (!tab || !isHttpUrl(tab.url)) {
    toast.show(
      'Ouvrez une page HTTP(S) pour l’ajouter aux favoris.',
      'error',
    );
    return;
  }

  try {
    const result = await favorites.toggle({
      url: tab.url,
      title: tab.title,
    });

    if (result?.active) {
      toast.show('Page ajoutée aux favoris.', 'success');
    } else {
      toast.show('Page retirée des favoris.', 'info');
    }

    navBar?.updateFavoriteState();
  } catch (error) {
    toast.show(`Favoris indisponibles : ${error.message}`, 'error');
  }
}

/**
 * Exécute une action envoyée par le processus principal.
 * @param {string} action
 */
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
        toast.show('Aucun onglet fermé à rouvrir.', 'info');
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
      changeZoom('in');
      break;
    case SHORTCUT_ACTIONS.ZOOM_OUT:
      changeZoom('out');
      break;
    case SHORTCUT_ACTIONS.ZOOM_RESET:
      changeZoom('reset');
      break;
    case SHORTCUT_ACTIONS.TOGGLE_PAGE_DEVTOOLS:
      togglePageDevTools();
      break;
    case SHORTCUT_ACTIONS.FOCUS_ADDRESS:
      navBar?.focusAddress();
      break;
    default:
      console.warn('[Raccourci] Action inconnue :', action);
  }
}

/**
 * Exécute une entrée du menu principal.
 * @param {string} action
 */
function handleMenuAction(action) {
  switch (action) {
    case 'new-tab':
      tabManager.createTab({ activate: true, focusAddress: true });
      break;
    case 'new-window':
      api.openNewWindow();
      break;
    case 'new-private-window':
      api.openNewPrivateWindow();
      break;
    case 'home-page':
      openHomePage();
      break;
    case 'reopen-tab':
      if (!tabManager.reopenClosedTab()) {
        toast.show('Aucun onglet fermé à rouvrir.', 'info');
      }
      break;
    case 'find-in-page':
      void openFindBar();
      break;
    case 'zoom-in':
      changeZoom('in');
      break;
    case 'zoom-out':
      changeZoom('out');
      break;
    case 'zoom-reset':
      changeZoom('reset');
      break;
    case 'favorites':
      if (isPrivate) {
        toast.show(
          'Les favoris sont désactivés en navigation privée.',
          'info',
        );
        break;
      }

      void favorites.open();
      break;
    case 'history':
      void history.open();
      break;
    case 'extract-media':
      void extractActivePageMedia();
      break;
    case 'downloads':
      void downloads.open();
      break;
    case 'download-link':
      linkDownload?.open();
      break;
    case 'library':
      if (isPrivate) {
        toast.show(
          'La médiathèque est désactivée en navigation privée.',
          'info',
        );
        break;
      }

      void library.open();
      break;
    case 'settings':
      void settings.open();
      break;
    case 'extensions':
      void extensions.open();
      break;
    case 'devtools-page':
      togglePageDevTools();
      break;
    case 'devtools-app':
      void toggleApplicationDevTools();
      break;
    case 'about':
      void about.open();
      break;
    default:
      console.warn('[Menu] Action inconnue :', action);
  }
}

/**
 * Branche les événements de la collection d'onglets.
 */
function setupTabEvents() {
  tabManager.on('active-changed', (tab) => {
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

  tabManager.on('active-tab-updated', (tab) => {
    navBar?.update(tab);
    scheduleSessionSave();
    scheduleTrackerRefresh();
  });

  tabManager.on('tab-created', () => {
    scheduleSessionSave();
    scheduleTrackerRefresh();
  });

  tabManager.on('tab-closed', () => {
    scheduleSessionSave();
    scheduleTrackerRefresh();
  });

  tabManager.on('tab-updated', () => {
    scheduleSessionSave();
    scheduleTrackerRefresh();
  });

  tabManager.on('found-in-page', (tab, result) => {
    findBar?.handleResult(tab, result);
  });

  tabManager.on('zoom-changed', (tab, factor) => {
    if (tab === tabManager.getActiveTab()) {
      toast.show(`Zoom : ${Math.round(factor * 100)} %`, 'info', 1400);
    }
  });

  tabManager.on('tab-focused', () => {
    menu?.close();
    mediaSniffer?.close();
  });

  tabManager.on('focus-address-requested', () => {
    navBar?.focusAddress();
  });

  tabManager.on('load-failed', (tab, details) => {
    if (tabManager.getActiveTab() !== tab) {
      return;
    }

    navBar?.update(tab);
    toast.show(
      `Chargement impossible : ${
        details?.errorDescription || 'erreur inconnue'
      }`,
      'error',
      4500,
    );
  });

  tabManager.on('navigation-error', (tab, error) => {
    if (tabManager.getActiveTab() === tab) {
      toast.show(`Navigation impossible : ${error.message}`, 'error');
    }
  });

  tabManager.on('media-started-playing', (tab) => {
    const message =
      tab === tabManager.getActiveTab()
        ? 'Lecture média détectée sur cette page.'
        : `Lecture média détectée dans « ${tab.title} ».`;

    toast.show(message, 'success');
  });
}

/**
 * Ferme les surfaces flottantes lors d'un clic extérieur ou d'Échap.
 */
function setupGlobalOverlays() {
  document.addEventListener('click', (event) => {
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

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
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

  window.addEventListener('blur', () => {
    menu?.close();
  });
}

/**
 * S'abonne aux événements du processus principal.
 */
function setupIpcListeners() {
  /**
   * @param {string} channel
   * @param {(payload: unknown) => void} listener
   */
  const listen = (channel, listener) => {
    ipcUnsubscribers.push(api.on(channel, listener));
  };

  listen(IPC.MEDIA_DETECTED, (media) => {
    mediaSniffer?.add(media);
  });

  listen(IPC.ADBLOCK_STATS_UPDATED, (stats) => {
    const guestId = tabManager.getActiveTab()?.getWebContentsId?.();

    if (
      Number.isInteger(guestId) &&
      stats?.webContentsId === guestId
    ) {
      renderTrackerStats(stats);
    }
  });

  listen(IPC.OPEN_URL_IN_NEW_TAB, (url) => {
    if (isHttpUrl(url)) {
      tabManager.createTab({ url, activate: true });
    }
  });

  listen(IPC.SHORTCUT, (action) => {
    if (typeof action === 'string') {
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
    settings.setStatus('Autorisations des sites mises à jour.', 'info');
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
    const message =
      payload && typeof payload.message === 'string'
        ? payload.message.trim()
        : '';

    if (!message) {
      return;
    }

    const variant =
      payload?.variant === 'success' || payload?.variant === 'error'
        ? payload.variant
        : 'info';

    toast.show(message, variant);
  });

  listen(IPC.LIBRARY_UPDATED, () => {
    library.handleChanged();
  });

  listen(IPC.BROWSING_DATA_CLEARED, () => {
    toast.show('Données de navigation effacées.', 'success');
    settings.setStatus('Données de navigation effacées.', 'success');

    for (const tab of tabManager.getTabs()) {
      tab.reload();
    }
  });

  window.addEventListener('beforeunload', () => {
    saveSessionNow();

    for (const unsubscribe of ipcUnsubscribers) {
      unsubscribe();
    }

    ipcUnsubscribers.length = 0;
  });
}

/**
 * Charge l'état initial puis ouvre le premier onglet.
 * @returns {Promise<void>}
 */
async function initialize() {
  try {
    const loadedSettings = await api.getSettings();

    if (loadedSettings && typeof loadedSettings === 'object') {
      applyRuntimeSettings(loadedSettings);
    }
  } catch (error) {
    console.warn('[Paramètres] Lecture initiale impossible :', error.message);
    toast.show(
      'Paramètres par défaut utilisés : le stockage local est indisponible.',
      'error',
    );
  }

  await Promise.allSettled([
    api
      .listMedia()
      .then((media) => mediaSniffer?.load(media))
      .catch((error) => {
        console.warn('[Média] Liste initiale indisponible :', error.message);
      }),
    api
      .getMediaCapabilities()
      .then((capabilities) => mediaSniffer?.setCapabilities(capabilities))
      .catch((error) => {
        console.warn(
          '[Média] Capacités de téléchargement indisponibles :',
          error.message,
        );
        mediaSniffer?.setCapabilities({ ffmpeg: false, ffprobe: false });
      }),
    favorites.refresh({ silent: true }),
  ]);

  let sessionState = null;

  if (!isPrivate && appSettings.restoreSession) {
    try {
      sessionState = await api.getSession();
    } catch (error) {
      console.warn('[Session] Restauration impossible :', error.message);
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
              activate: false,
            }),
          );
        }
      }
    }

    if (restoredTabs.length === 0) {
      tabManager.createTab({ activate: true });
    } else {
      const requestedIndex = Number.isInteger(sessionState.activeIndex)
        ? sessionState.activeIndex
        : 0;
      const activeIndex = Math.min(
        Math.max(requestedIndex, 0),
        restoredTabs.length - 1,
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
