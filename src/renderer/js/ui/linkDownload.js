'use strict';

/**
 * Think-Browser — téléchargement d'un lien direct ou d'un manifeste.
 *
 * La boîte ne télécharge rien elle-même : elle demande une analyse au
 * processus principal, affiche les pistes détectées, puis transmet la
 * sélection. Les cookies et le Referer restent gérés côté session Chromium.
 *
 * @module renderer/ui/linkDownload
 */

const {
  formatBytes,
  getHostname,
  isDirectFileUrl,
  isHttpUrl,
} = require('../../../shared/utils');
const { getTrackLabel } = require('./mediaOptions');

/**
 * Contrôle la boîte de téléchargement par lien.
 */
class LinkDownloadDialog {
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
    showToast,
  }) {
    this.dialog = dialog;
    this.elements = elements;
    this.api = api;
    this.dialogs = dialogs;
    this.getActiveTab = getActiveTab;
    this.showToast = showToast;

    /** @type {object | null} */
    this.inspection = null;

    this.elements.analyze.addEventListener('click', () => void this.analyze());
    this.elements.start.addEventListener('click', () => void this.download());
    this.elements.cancel.addEventListener('click', () => this.close());
    this.elements.close.addEventListener('click', () => this.close());
    this.elements.url.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void this.analyze();
      }
    });
    this.dialog.addEventListener('close', () => this.#setBusy(false));
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
    this.#setStatus('');
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
    const url = this.getActiveTab()?.url || '';
    return isHttpUrl(url) ? url : '';
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
  #setStatus(message, variant = '') {
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
        'Saisissez une URL HTTP(S) valide, sans identifiants intégrés.',
        'error',
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

    // Un fichier direct (mp4, zip, pdf…) part immédiatement vers Chromium.
    // Une erreur HEAD sur certains serveurs ne doit plus bloquer le lien.
    if (isDirectFileUrl(url)) {
      await this.download({ url });
      return;
    }

    this.#setBusy(true);
    this.#setStatus('Analyse du lien et des pistes éventuelles…');

    try {
      const result = await this.api.inspectUrl({
        url,
        pageUrl: this.#getPageUrl(),
        guestId: this.#getGuestId(),
      });

      if (!result?.ok) {
        this.#setStatus(
          result?.message || 'L’analyse du lien a échoué.',
          'error',
        );
        return;
      }

      this.inspection = { ...result, url };
      this.#renderResult(result);
      this.elements.start.disabled = false;
      this.#setStatus(
        result.isMedia
          ? 'Lien analysé. Vérifiez les informations avant de télécharger.'
          : 'Le lien est accessible mais ne ressemble pas à un média.',
        result.isMedia ? 'success' : '',
      );
    } catch (error) {
      this.#setStatus(
        `Analyse impossible : ${error.message}`,
        'error',
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
    this.elements.name.textContent = result.filename || 'Lien média';
    this.elements.type.textContent = result.streamType
      ? result.streamType.toUpperCase()
      : result.isMedia
        ? 'MÉDIA'
        : 'FICHIER';

    const details = [
      getHostname(result.finalUrl || result.url),
      result.contentType || 'type inconnu',
      formatBytes(result.contentLength),
      result.isLive ? 'direct' : '',
    ].filter(Boolean);

    this.elements.meta.textContent = details.join(' · ');

    if (result.message) {
      this.elements.warning.hidden = false;
      this.elements.warning.textContent = result.message;
      this.elements.warning.dataset.variant = 'error';
    } else {
      this.elements.warning.hidden = true;
      this.elements.warning.textContent = '';
      this.elements.warning.dataset.variant = '';
    }

    const metadata = result.metadata || {};
    const audioTracks = Array.isArray(metadata.audioTracks)
      ? metadata.audioTracks
      : [];
    const subtitleTracks = Array.isArray(metadata.subtitleTracks)
      ? metadata.subtitleTracks
      : [];

    this.#fillTracks(
      this.elements.audioField,
      this.elements.audioSelect,
      audioTracks,
      'Piste audio par défaut',
      audioTracks.length > 1,
    );
    this.#fillTracks(
      this.elements.subtitleField,
      this.elements.subtitleSelect,
      subtitleTracks,
      'Aucun sous-titre',
      subtitleTracks.length > 0,
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

    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = emptyLabel;
    select.append(empty);

    tracks.forEach((track, position) => {
      const option = document.createElement('option');
      option.value = String(track.index);
      option.textContent = getTrackLabel(track, position);
      select.append(option);
    });
  }

  /**
   * Lance le téléchargement du lien analysé.
   */
  async download({ url: directUrl = '' } = {}) {
    const url = directUrl || this.inspection?.url;

    if (!url) {
      return;
    }

    const audioValue = Number(this.elements.audioSelect.value);
    const subtitleValue = Number(this.elements.subtitleSelect.value);

    this.#setBusy(true);
    this.#setStatus('Démarrage du téléchargement…');

    try {
      const result = await this.api.downloadUrl({
        url,
        pageUrl: this.#getPageUrl(),
        guestId: this.#getGuestId(),
        audioStreamIndex:
          this.elements.audioSelect.value !== '' &&
          Number.isInteger(audioValue)
            ? audioValue
            : null,
        subtitleStreamIndex:
          this.elements.subtitleSelect.value !== '' &&
          Number.isInteger(subtitleValue)
            ? subtitleValue
            : null,
        isLive: Boolean(this.inspection?.isLive),
      });

      if (!result?.ok) {
        const message =
          result?.message || 'Le téléchargement a échoué.';
        this.#setStatus(message, 'error');
        this.showToast(message, 'error');
        return;
      }

      const message = result.queued
        ? 'Flux mis en file d’attente. Il démarrera dès qu’un emplacement sera libre.'
        : result.mode === 'stream'
          ? 'Téléchargement du flux lancé. Suivez sa progression dans Téléchargements.'
          : 'Téléchargement lancé. Suivez sa progression dans Téléchargements.';

      this.showToast(message, 'success');
      this.close();
    } catch (error) {
      const message = `Téléchargement impossible : ${error.message}`;
      this.#setStatus(message, 'error');
      this.showToast(message, 'error');
    } finally {
      this.#setBusy(false);
    }
  }
}

module.exports = { LinkDownloadDialog };
