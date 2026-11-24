'use strict';

/**
 * Think-Browser — barre d'adresse et navigation.
 *
 * Ce composant ne connaît ni la collection d'onglets ni le processus
 * principal : il reçoit des callbacks et met à jour son propre DOM. La page
 * d'accueil interne est représentée par un champ vide, comme dans un
 * navigateur classique, plutôt que par son URL de protocole.
 *
 * @module renderer/navBar
 */

const {
  getAboutPageLabel,
  isHomeUrl,
  isHttpUrl,
  resolveNavigationTarget,
} = require('../../shared/utils');

/**
 * Contrôle la barre d'outils de navigation.
 */
class NavBar {
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
    privateMode = false,
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

    /** @type {string | null} */
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
      progress,
    } = this.elements;

    if (!tab) {
      urlInput.value = '';
      urlInput.placeholder = 'Rechercher ou entrer une URL…';
      backButton.disabled = true;
      forwardButton.disabled = true;
      reloadButton.disabled = true;
      homeButton.disabled = true;
      favoriteButton.disabled = true;
      progress.hidden = true;
      this.activeTabId = null;
      this.#syncAddressControls();
      document.title = this.privateMode
        ? 'Think-Browser — Navigation privée'
        : 'Think-Browser';
      return;
    }

    const tabChanged = this.activeTabId !== tab.id;
    const onHomePage = isHomeUrl(tab.url);
    const aboutLabel = getAboutPageLabel(tab.url);
    const isEditing = document.activeElement === urlInput;

    this.activeTabId = tab.id;

    if (tabChanged || !isEditing) {
      urlInput.value = onHomePage ? '' : aboutLabel || tab.url || '';
    }

    urlInput.placeholder = onHomePage
      ? 'Rechercher sur le Web ou saisir une adresse…'
      : aboutLabel
        ? 'Page interne Think-Browser'
        : 'Rechercher ou entrer une URL…';

    const ready = Boolean(tab.ready);
    backButton.disabled = !ready || !tab.canGoBack();
    forwardButton.disabled = !ready || !tab.canGoForward();
    reloadButton.disabled = !ready;
    reloadButton.classList.toggle('is-loading', Boolean(tab.loading));
    homeButton.disabled = !ready;
    homeButton.classList.toggle('is-active', onHomePage);
    favoriteButton.disabled = this.privateMode || !isHttpUrl(tab.url);
    progress.hidden = !tab.loading;

    const suffix = this.privateMode
      ? 'Think-Browser — Navigation privée'
      : 'Think-Browser';
    document.title = tab.title ? `${tab.title} — ${suffix}` : suffix;

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
      favoriteButton.classList.remove('is-active');
      favoriteButton.setAttribute('aria-pressed', 'false');
      favoriteButton.setAttribute(
        'aria-label',
        'Favoris indisponibles en navigation privée',
      );
      favoriteButton.title = 'Favoris indisponibles en navigation privée';
      return;
    }

    const active = Boolean(
      tab && isHttpUrl(tab.url) && this.isFavorite(tab.url),
    );

    favoriteButton.classList.toggle('is-active', active);
    favoriteButton.setAttribute('aria-pressed', String(active));
    favoriteButton.setAttribute(
      'aria-label',
      active
        ? 'Retirer cette page des favoris'
        : 'Ajouter cette page aux favoris',
    );
    favoriteButton.title = active
      ? 'Retirer des favoris'
      : 'Ajouter aux favoris';
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
    goButton.classList.toggle('is-idle', !hasValue);
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
      favoriteButton,
    } = this.elements;

    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const rawValue = urlInput.value.trim();

      if (!rawValue) {
        urlInput.focus();
        return;
      }

      const target = resolveNavigationTarget(
        rawValue,
        this.getSearchEngineKey(),
      );

      if (!target) {
        this.showToast(
          'Adresse invalide. Utilisez une URL HTTP(S) ou un terme de recherche.',
          'error',
        );
        this.focusAddress();
        return;
      }

      urlInput.blur();
      this.onNavigate(target);
    });

    backButton.addEventListener('click', () => {
      const tab = this.getActiveTab();

      if (tab) {
        tab.goBack();
      }
    });

    forwardButton.addEventListener('click', () => {
      const tab = this.getActiveTab();

      if (tab) {
        tab.goForward();
      }
    });

    reloadButton.addEventListener('click', () => {
      this.onReload();
    });

    homeButton.addEventListener('click', () => {
      this.onHome?.();
    });

    clearAddressButton.addEventListener('click', () => {
      urlInput.value = '';
      this.#syncAddressControls();
      urlInput.focus();
    });

    favoriteButton.addEventListener('click', () => {
      const tab = this.getActiveTab();

      if (tab && !this.privateMode) {
        this.onToggleFavorite(tab);
      }
    });

    urlInput.addEventListener('input', () => {
      this.#syncAddressControls();
    });

    urlInput.addEventListener('focus', () => {
      this.onFocus?.();
      urlInput.select();
    });

    urlInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      const tab = this.getActiveTab();
      urlInput.value =
        tab && !isHomeUrl(tab.url)
          ? getAboutPageLabel(tab.url) || tab.url
          : '';
      this.#syncAddressControls();
      urlInput.blur();
    });

    this.#syncAddressControls();
  }
}

module.exports = { NavBar };
