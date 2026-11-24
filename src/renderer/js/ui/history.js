'use strict';

/**
 * Think-Browser — panneau Historique.
 *
 * @module renderer/ui/history
 */

const { getHostname, isHttpUrl } = require('../../../shared/utils');
const { createEmptyState } = require('./dialog');

const historyDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * Affiche et efface l'historique de navigation.
 */
class HistoryPanel {
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
    showToast,
  }) {
    this.dialog = dialog;
    this.list = list;
    this.count = count;
    this.clearButton = clearButton;
    this.api = api;
    this.dialogs = dialogs;
    this.onNavigate = onNavigate;
    this.showToast = showToast;

    /** @type {object[]} */
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
      this.entries = Array.isArray(entries)
        ? entries.filter((entry) => entry && isHttpUrl(entry.url))
        : [];
    } catch (error) {
      console.warn('[Historique] Lecture impossible :', error.message);
      this.entries = [];
      this.showToast?.(
        `Historique indisponible : ${error.message}`,
        'error',
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
    const plural = count > 1 ? 's' : '';

    this.count.textContent =
      count === 0 ? 'Aucune visite' : `${count} visite${plural}`;
    this.clearButton.disabled = count === 0;

    if (count === 0) {
      this.list.append(
        createEmptyState(
          'Aucune visite',
          'Les pages que vous ouvrez apparaîtront ici.',
        ),
      );
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const entry of this.entries) {
      const item = document.createElement('article');
      item.className = 'history-item';

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'history-entry';
      openButton.title = entry.url;

      const title = document.createElement('span');
      title.className = 'history-entry__title';
      title.textContent = entry.title || getHostname(entry.url);

      const meta = document.createElement('span');
      meta.className = 'history-entry__meta';
      meta.textContent = this.#formatDate(entry.visitedAt);

      const url = document.createElement('span');
      url.className = 'history-entry__url';
      url.textContent = entry.url;

      openButton.append(title, meta, url);
      openButton.addEventListener('click', () => {
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
      return 'Date inconnue';
    }

    return historyDateFormatter.format(date);
  }

  /**
   * Installe l'action d'effacement.
   */
  #setup() {
    this.clearButton.addEventListener('click', async () => {
      const confirmed = await this.dialogs.askConfirmation({
        title: 'Effacer tout l’historique ?',
        message:
          'Toutes les visites enregistrées seront supprimées. Cette action est irréversible.',
        confirmLabel: 'Effacer l’historique',
        danger: true,
      });

      if (!confirmed) {
        return;
      }

      this.clearButton.disabled = true;

      try {
        const result = await this.api.clearHistory();

        if (!result?.ok) {
          throw new Error('Le processus principal a refusé l’opération.');
        }

        await this.refresh();
        this.showToast?.('Historique effacé.', 'success');
      } catch (error) {
        this.showToast?.(
          `Effacement impossible : ${error.message}`,
          'error',
        );
        await this.refresh();
      }
    });
  }
}

module.exports = { HistoryPanel };
