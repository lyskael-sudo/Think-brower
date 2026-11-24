'use strict';

/**
 * Think-Browser — panneau À propos.
 *
 * @module renderer/ui/about
 */

/**
 * Affiche les informations de version de l'application et de ses moteurs.
 */
class AboutPanel {
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
    dialogs,
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
    this.version.textContent = '—';
    this.electron.textContent = '—';
    this.chrome.textContent = '—';
    this.node.textContent = '—';

    try {
      const info = await this.api.getAppInfo();

      if (info && typeof info === 'object') {
        this.version.textContent = info.version
          ? `v${info.version}`
          : '—';
        this.electron.textContent = info.electron || '—';
        this.chrome.textContent = info.chrome || '—';
        this.node.textContent = info.node || '—';
      }
    } catch (error) {
      console.warn('[À propos] Versions indisponibles :', error.message);
    }

    this.dialogs.show(this.dialog);
  }
}

module.exports = { AboutPanel };
