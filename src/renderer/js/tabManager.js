'use strict';

/**
 * Think-Browser — modèle et gestionnaire d'onglets.
 *
 * `Tab` encapsule le DOM de l'onglet et sa `<webview>`. `TabManager` gère la
 * collection, l'onglet actif et les interactions de la barre d'onglets.
 * L'activation se contente de masquer/afficher les webviews : la page n'est
 * jamais rechargée lors d'un changement d'onglet.
 *
 * @module renderer/tabManager
 */

const { EventEmitter } = require('./eventEmitter');
const {
  DEFAULT_ZOOM,
  MAX_CLOSED_TABS,
  MAX_TAB_TITLE_LENGTH,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
} = require('../../shared/constants');
const {
  getHostname,
  isHttpUrl,
  isTabUrl,
} = require('../../shared/utils');

/**
 * Onglet unique : élément de barre d'onglets + webview associée.
 *
 * Événements émis :
 * - `activate-request`
 * - `close-request`
 * - `focus`
 * - `navigate-request` (-1 ou 1)
 * - `title-changed`
 * - `url-changed`
 * - `loading-changed`
 * - `ready`
 * - `load-failed` (details)
 * - `navigation-error` (error)
 * - `media-started-playing`
 * - `media-state-changed` (boolean)
 * - `found-in-page` (result)
 * - `zoom-changed` (factor)
 * - `devtools-state-changed`
 */
class Tab extends EventEmitter {
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
    privatePartition = '',
    defaultZoom = DEFAULT_ZOOM,
  }) {
    super();

    this.id = id;
    this.url = url;
    this.title = 'Nouvel onglet';
    this.ready = false;
    this.loading = false;
    this.pendingUrl = null;
    this.devToolsOpen = false;
    this.destroyed = false;
    this.audioPlaying = false;
    this.zoomFactor = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Number(defaultZoom) || DEFAULT_ZOOM),
    );
    this.faviconUrl = '';
    this.privatePartition = privatePartition;

    this.element = document.createElement('div');
    this.element.id = `tab-element-${id}`;
    this.element.className = 'tab';
    this.element.dataset.tabId = id;
    this.element.setAttribute('role', 'tab');
    this.element.setAttribute('aria-selected', 'false');
    this.element.tabIndex = -1;

    this.faviconElement = document.createElement('img');
    this.faviconElement.className = 'tab__favicon';
    this.faviconElement.alt = '';
    this.faviconElement.width = 16;
    this.faviconElement.height = 16;
    this.faviconElement.referrerPolicy = 'no-referrer';
    this.faviconElement.decoding = 'async';
    this.faviconElement.src = '../../assets/icons/favicon.svg';

    this.titleElement = document.createElement('span');
    this.titleElement.className = 'tab__title';
    this.titleElement.textContent = 'Nouvel onglet';

    this.audioElement = document.createElement('span');
    this.audioElement.className = 'tab__audio';
    this.audioElement.textContent = '♪';
    this.audioElement.title = 'Lecture audio en cours';
    this.audioElement.setAttribute('aria-label', 'Lecture audio en cours');
    this.audioElement.setAttribute('role', 'img');
    this.audioElement.hidden = true;

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'tab__close';
    this.closeButton.setAttribute('aria-label', 'Fermer l’onglet');
    this.closeButton.title = 'Fermer l’onglet';
    this.closeButton.textContent = '×';

    this.element.append(
      this.faviconElement,
      this.titleElement,
      this.audioElement,
      this.closeButton,
    );

    this.faviconElement.addEventListener('error', () => {
      if (!this.destroyed) {
        this.faviconElement.hidden = true;
      }
    });

    this.webview = document.createElement('webview');
    this.webview.id = `webview-${id}`;
    this.webview.className = 'tab-webview';
    this.webview.setAttribute('aria-label', 'Contenu de la page web');
    this.webview.setAttribute('allowpopups', '');
    this.webview.hidden = true;

    if (this.privatePartition) {
      this.webview.setAttribute('partition', this.privatePartition);
    }

    this.webview.setAttribute('src', url);

    this.element.setAttribute('aria-controls', this.webview.id);

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
    this.emit('url-changed', this);

    if (!this.ready) {
      this.pendingUrl = url;
      return true;
    }

    try {
      const navigation = this.webview.loadURL(url);

      if (navigation && typeof navigation.catch === 'function') {
        navigation.catch((error) => {
          if (!this.destroyed) {
            console.warn(
              '[Navigation] Chargement interrompu :',
              error.message,
            );
          }
        });
      }

      return true;
    } catch (error) {
      this.emit('navigation-error', error);
      return false;
    }
  }

  /**
   * Affiche ou masque l'onglet sans toucher au contenu de la page.
   * @param {boolean} active
   */
  setActive(active) {
    this.element.classList.toggle('is-active', active);
    this.element.setAttribute('aria-selected', String(active));
    this.element.tabIndex = active ? 0 : -1;
    this.webview.hidden = !active;
  }

  /**
   * Met à jour le titre affiché dans l'onglet et dans la fenêtre.
   * @param {string} rawTitle
   */
  updateTitle(rawTitle) {
    const title =
      typeof rawTitle === 'string' && rawTitle.trim()
        ? rawTitle.trim().slice(0, MAX_TAB_TITLE_LENGTH)
        : getHostname(this.url) || 'Nouvel onglet';

    this.title = title;
    this.titleElement.textContent = title;
    this.element.title = title;
    this.element.setAttribute('aria-label', title);
    this.closeButton.setAttribute('aria-label', `Fermer l'onglet ${title}`);
    this.closeButton.title = `Fermer ${title}`;
    this.emit('title-changed', this);
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
    this.element.classList.toggle('is-loading', loading);
    this.emit('loading-changed', this);
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
    this.emit('media-state-changed', playing);
  }

  /**
   * Met à jour la favicon affichée dans l'onglet.
   * @param {string} url
   */
  setFavicon(url) {
    let faviconUrl = '';

    if (typeof url === 'string' && url) {
      try {
        const parsed = new URL(url);
        const protocol = parsed.protocol;

        if (
          protocol === 'http:' ||
          protocol === 'https:' ||
          protocol === 'data:'
        ) {
          faviconUrl = url;
        }
      } catch {
        // Une favicon invalide est simplement ignorée.
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
      // Electron 44 n'émet 'found-in-page' que si `findNext` est absent ou
      // vrai ; passer explicitement `false` perd le premier résultat.
      const options = findNext
        ? { forward, findNext: true }
        : { forward };

      return this.webview.findInPage(text, options);
    } catch (error) {
      console.warn('[Recherche] Impossible :', error.message);
      return null;
    }
  }

  /**
   * Arrête la recherche dans la page.
   * @param {'clearSelection' | 'keepSelection' | 'activateSelection'} [action]
   */
  stopFindInPage(action = 'clearSelection') {
    try {
      this.webview.stopFindInPage(action);
    } catch {
      // La webview peut être en cours de destruction.
    }
  }

  /**
   * Récupère le texte sélectionné dans la page.
   * @returns {Promise<string>}
   */
  async getSelectionText() {
    if (!this.ready) {
      return '';
    }

    try {
      const text = await this.webview.executeJavaScript(
        'window.getSelection().toString()',
        true,
      );
      return typeof text === 'string' ? text.trim().slice(0, 500) : '';
    } catch {
      return '';
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
      Math.max(MIN_ZOOM, Math.round(factor * 100) / 100),
    );

    this.zoomFactor = next;

    try {
      if (this.ready) {
        this.webview.setZoomFactor(next);
      }
    } catch (error) {
      console.warn('[Zoom] Application impossible :', error.message);
    }

    this.emit('zoom-changed', next);
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
      // La webview peut ne pas être prête.
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
      console.warn('[Navigation] Précédent indisponible :', error.message);
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
      console.warn('[Navigation] Suivant indisponible :', error.message);
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
      this.emit('navigation-error', error);
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
      this.emit('navigation-error', error);
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

    if (
      tabRect.left < viewportRect.left ||
      tabRect.right > viewportRect.right
    ) {
      this.element.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
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
      // La webview peut déjà être arrêtée ou détruite.
    }

    this.webview.remove();
    this.element.remove();
    this.removeAllListeners();
  }

  /**
   * Branche les interactions de la barre d'onglets.
   */
  #bindTabInteractions() {
    this.closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.emit('close-request', this);
    });

    this.element.addEventListener('click', () => {
      this.emit('activate-request', this);
    });

    this.element.addEventListener('auxclick', (event) => {
      if (event.button === 1) {
        event.preventDefault();
        this.emit('close-request', this);
      }
    });

    this.element.addEventListener('keydown', (event) => {
      if (event.target !== this.element) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.emit('activate-request', this);
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        this.emit(
          'navigate-request',
          event.key === 'ArrowRight' ? 1 : -1,
        );
      }
    });
  }

  /**
   * Branche les événements de la webview.
   */
  #bindWebviewEvents() {
    this.webview.addEventListener('focus', () => {
      this.emit('focus', this);
    });

    this.webview.addEventListener('dom-ready', () => {
      if (this.destroyed) {
        return;
      }

      this.ready = true;
      this.#flushPendingNavigation();
      this.#syncTitleFromPage();
      this.#applyZoom();
      this.emit('ready', this);
    });

    this.webview.addEventListener('did-start-loading', () => {
      this.setLoading(true);
    });

    this.webview.addEventListener('did-stop-loading', () => {
      if (this.destroyed) {
        return;
      }

      this.ready = true;
      this.setLoading(false);
      this.#flushPendingNavigation();
      this.#syncTitleFromPage();
      this.#applyZoom();
      this.emit('ready', this);
    });

    this.webview.addEventListener('did-navigate', (event) => {
      if (this.destroyed || event.isMainFrame === false) {
        return;
      }

      if (typeof event.url === 'string' && event.url) {
        this.url = event.url;
        this.updateTitle(getHostname(this.url));
      }

      this.setAudioPlaying(false);
      this.emit('url-changed', this);
    });

    this.webview.addEventListener('did-navigate-in-page', (event) => {
      if (this.destroyed || event.isMainFrame === false) {
        return;
      }

      if (typeof event.url === 'string' && event.url) {
        this.url = event.url;
      }

      this.emit('url-changed', this);
    });

    this.webview.addEventListener('did-fail-load', (event) => {
      if (this.destroyed || event.isMainFrame === false || event.errorCode === -3) {
        return;
      }

      this.ready = true;
      this.setLoading(false);

      if (isTabUrl(event.validatedURL)) {
        this.url = event.validatedURL;
      }

      this.emit('load-failed', {
        errorCode: event.errorCode,
        errorDescription: event.errorDescription,
        validatedURL: event.validatedURL,
        url: this.url,
      });
      this.emit('url-changed', this);
    });

    this.webview.addEventListener('page-title-updated', (event) => {
      if (this.destroyed) {
        return;
      }

      this.updateTitle(event.title);
    });

    this.webview.addEventListener('page-favicon-updated', (event) => {
      if (this.destroyed) {
        return;
      }

      const favicons = Array.isArray(event.favicons) ? event.favicons : [];
      this.setFavicon(favicons[0] || '');
    });

    this.webview.addEventListener('media-started-playing', () => {
      this.setAudioPlaying(true);
      this.emit('media-started-playing', this);
    });

    this.webview.addEventListener('media-paused', () => {
      this.setAudioPlaying(false);
    });

    this.webview.addEventListener('found-in-page', (event) => {
      if (!this.destroyed) {
        this.emit('found-in-page', event.result);
      }
    });

    this.webview.addEventListener('devtools-opened', () => {
      this.devToolsOpen = true;
      this.emit('devtools-state-changed', this);
    });

    this.webview.addEventListener('devtools-closed', () => {
      this.devToolsOpen = false;
      this.emit('devtools-state-changed', this);
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
      // Le titre sera fourni par `page-title-updated`.
    }
  }
}

/**
 * Gestionnaire de la collection d'onglets d'une fenêtre.
 *
 * Événements émis :
 * - `tab-created` (tab)
 * - `active-changed` (tab)
 * - `active-tab-updated` (tab)
 * - `tab-updated` (tab)
 * - `tab-focused` (tab)
 * - `tab-closed` (tab)
 * - `focus-address-requested`
 * - `load-failed` (tab, details)
 * - `navigation-error` (tab, error)
 * - `media-started-playing` (tab)
 * - `found-in-page` (tab, result)
 * - `zoom-changed` (tab, factor)
 */
class TabManager extends EventEmitter {
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
    privatePartition = '',
  }) {
    super();

    this.tabsList = tabsList;
    this.webviewStack = webviewStack;
    this.tabsViewport = tabsViewport;
    this.newTabButton = newTabButton;
    this.getHomeUrl = getHomeUrl;
    this.getDefaultZoom = getDefaultZoom;
    this.privatePartition = privatePartition;

    /** @type {Map<string, Tab>} */
    this.tabs = new Map();
    this.activeTabId = null;
    this.counter = 0;

    /** @type {{url: string, title: string}[]} */
    this.closedTabs = [];

    this.newTabButton.addEventListener('click', () => {
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
    focusAddress = false,
  } = {}) {
    const targetUrl = isTabUrl(url) ? url : this.getHomeUrl();
    const id = `tab-${++this.counter}`;
    const tab = new Tab({
      id,
      url: targetUrl,
      tabsList: this.tabsList,
      webviewStack: this.webviewStack,
      privatePartition: this.privatePartition,
      defaultZoom: this.getDefaultZoom(),
    });

    this.tabs.set(id, tab);
    this.#wireTab(tab);
    this.emit('tab-created', tab);

    if (activate) {
      this.activateTab(id);
    }

    if (focusAddress) {
      this.emit('focus-address-requested');
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

    this.emit('active-changed', tab);

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
      this.emit('tab-closed', tab);
      return;
    }

    if (wasActive) {
      const remaining = Array.from(this.tabs.values());
      const nextTab = remaining[Math.min(index, remaining.length - 1)];
      this.activateTab(nextTab.id);
    }

    this.emit('tab-closed', tab);
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
      focusAddress: false,
    });
  }

  /**
   * Retourne l'index de l'onglet actif.
   * @returns {number}
   */
  getActiveIndex() {
    return Math.max(
      0,
      this.getTabs().findIndex((tab) => tab.id === this.activeTabId),
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
    tab.on('activate-request', () => {
      this.activateTab(tab.id);
    });

    tab.on('close-request', () => {
      this.closeTab(tab.id);
    });

    tab.on('focus', () => {
      this.emit('tab-focused', tab);
    });

    tab.on('navigate-request', (offset) => {
      this.#activateRelative(tab, offset);
    });

    tab.on('title-changed', () => {
      this.#notifyActive(tab);
      this.emit('tab-updated', tab);
    });

    tab.on('url-changed', () => {
      this.#notifyActive(tab);
      this.emit('tab-updated', tab);
    });

    tab.on('loading-changed', () => {
      this.#notifyActive(tab);
      this.emit('tab-updated', tab);
    });

    tab.on('ready', () => {
      this.#notifyActive(tab);
      this.emit('tab-updated', tab);
    });

    tab.on('devtools-state-changed', () => {
      this.#notifyActive(tab);
    });

    tab.on('load-failed', (details) => {
      this.emit('load-failed', tab, details);
    });

    tab.on('navigation-error', (error) => {
      this.emit('navigation-error', tab, error);
    });

    tab.on('media-started-playing', () => {
      this.emit('media-started-playing', tab);
    });

    tab.on('found-in-page', (result) => {
      this.emit('found-in-page', tab, result);
    });

    tab.on('zoom-changed', (factor) => {
      this.emit('zoom-changed', tab, factor);
    });
  }

  /**
   * Prévient l'interface si l'onglet concerné est actif.
   * @param {Tab} tab
   */
  #notifyActive(tab) {
    if (this.activeTabId === tab.id) {
      this.emit('active-tab-updated', tab);
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
}

module.exports = { Tab, TabManager };
