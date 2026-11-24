'use strict';

/**
 * Think-Browser — panneau des extensions internes.
 *
 * Le panneau ne connaît ni Electron ni le disque : il affiche le catalogue
 * fourni par le processus principal et demande des changements validés par
 * celui-ci. Aucun code d'extension n'est évalué dans le renderer.
 *
 * @module renderer/ui/extensions
 */

/**
 * Contrôle la modale des extensions.
 */
class ExtensionsPanel {
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
    showToast,
  }) {
    this.dialog = dialog;
    this.list = list;
    this.status = status;
    this.api = api;
    this.dialogs = dialogs;
    this.i18n = i18n;
    this.onStateChanged = onStateChanged;
    this.showToast = showToast;

    /** @type {object | null} */
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
        'error',
      );

      if (!silent) {
        this.showToast?.(
          `Extensions indisponibles : ${error.message}`,
          'error',
        );
      }
    }
  }

  /**
   * Applique un état déjà chargé.
   * @param {unknown} state
   */
  applyState(state) {
    if (!state || typeof state !== 'object') {
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
  setStatus(message, variant = 'info') {
    if (!this.status) {
      return;
    }

    window.clearTimeout(this.statusTimer);
    this.status.textContent = message;
    this.status.dataset.variant = variant;
    this.statusTimer = window.setTimeout(() => {
      this.status.textContent = this.i18n.t(
        'Les changements sont appliqués immédiatement.',
      );
      delete this.status.dataset.variant;
    }, 3_600);
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
    const card = document.createElement('section');
    card.className = 'extension-card';
    card.dataset.extensionId = extension.id;

    if (!extension.enabled) {
      card.classList.add('extension-card--disabled');
    }

    const header = document.createElement('div');
    header.className = 'extension-card__header';

    const text = document.createElement('div');
    text.className = 'extension-card__text';

    const title = document.createElement('h3');
    title.className = 'extension-card__title';
    title.textContent = this.i18n.t(extension.name);

    const meta = document.createElement('p');
    meta.className = 'extension-card__meta';
    meta.textContent = `v${extension.version} · ${this.#typeLabel(
      extension.type,
    )}`;

    text.append(title, meta);

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'switch';
    toggle.checked = Boolean(extension.enabled);
    toggle.setAttribute(
      'aria-label',
      `${this.i18n.t('Activer')} ${this.i18n.t(extension.name)}`,
    );
    toggle.addEventListener('change', () => {
      void this.#setEnabled(extension, toggle.checked);
    });

    header.append(text, toggle);

    const description = document.createElement('p');
    description.className = 'extension-card__description';
    description.textContent = this.i18n.t(
      extension.description,
      extension.description,
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
    const isTheme = extension.type === 'theme';
    const isLanguage = extension.type === 'language';

    if (!isTheme && !isLanguage) {
      return null;
    }

    const row = document.createElement('div');
    row.className = 'extension-card__option';

    const label = document.createElement('label');
    label.className = 'extension-card__option-label';
    label.textContent = this.i18n.t(
      isTheme ? 'Thème de l’interface' : 'Langue de l’interface',
    );

    const select = document.createElement('select');
    select.className = 'select';
    select.setAttribute(
      'aria-label',
      this.i18n.t(isTheme ? 'Thème de l’interface' : 'Langue de l’interface'),
    );

    const options = isTheme ? state.themes : state.languages;
    const current = isTheme ? state.theme : state.language;

    for (const option of options || []) {
      const element = document.createElement('option');
      element.value = option.id;
      element.textContent = this.i18n.t(option.label, option.label);
      select.append(element);
    }

    select.value = current;
    select.addEventListener('change', () => {
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
        `${this.i18n.t(extension.name)} : ${
          enabled
            ? this.i18n.t('Extension activée')
            : this.i18n.t('Extension désactivée')
        }.`,
        'success',
      );
    } catch (error) {
      this.setStatus(
        `Modification impossible : ${error.message}`,
        'error',
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
      const state =
        extension.type === 'theme'
          ? await this.api.setTheme(value)
          : await this.api.setLanguage(value);
      this.#applyRemoteState(state);
      this.setStatus('Préférence appliquée.', 'success');
    } catch (error) {
      this.setStatus(
        `Modification impossible : ${error.message}`,
        'error',
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
    if (type === 'theme') {
      return this.i18n.t('Thème');
    }

    if (type === 'language') {
      return this.i18n.t('Langue');
    }

    return type;
  }
}

module.exports = { ExtensionsPanel };
