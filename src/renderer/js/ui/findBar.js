'use strict';

/**
 * Think-Browser — barre de recherche dans la page.
 *
 * Le composant ne dialogue qu'avec l'onglet actif et sa webview. Les résultats
 * sont fournis par l'événement `found-in-page` d'Electron.
 *
 * @module renderer/ui/findBar
 */

const SEARCH_DELAY = 160;

/**
 * Contrôle la barre de recherche.
 */
class FindBar {
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
    getActiveTab,
  }) {
    this.elements = elements;
    this.getActiveTab = getActiveTab;

    /** @type {object | null} */
    this.activeTab = null;

    /** @type {ReturnType<typeof setTimeout> | null} */
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

    if (
      !this.isOpen ||
      this.activeTab !== tab ||
      !selectedText
    ) {
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
    this.elements.count.textContent = '';
    this.elements.bar.classList.remove('is-empty');
    this.activeTab = null;

    if (restoreFocus) {
      const tab = this.getActiveTab();

      if (tab) {
        try {
          tab.webview.focus();
        } catch {
          // La webview peut être en cours de destruction.
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
    const activeMatch = Number.isInteger(result?.activeMatchOrdinal)
      ? result.activeMatchOrdinal
      : 0;

    this.elements.count.textContent = matches
      ? `${activeMatch} / ${matches}`
      : '0 résultat';
    this.elements.bar.classList.toggle('is-empty', matches === 0);
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

      this.elements.count.textContent = '';
      this.elements.bar.classList.remove('is-empty');
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
    this.elements.input.addEventListener('input', () => {
      this.#scheduleSearch();
    });

    this.elements.input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.close();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();

        if (event.shiftKey) {
          this.previous();
        } else {
          this.next();
        }
      }
    });

    this.elements.previousButton.addEventListener('click', () => {
      this.previous();
    });

    this.elements.nextButton.addEventListener('click', () => {
      this.next();
    });

    this.elements.closeButton.addEventListener('click', () => {
      this.close();
    });
  }
}

module.exports = { FindBar };
