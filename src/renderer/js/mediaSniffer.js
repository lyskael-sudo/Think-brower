'use strict';

/**
 * Think-Browser — panneau des médias détectés.
 *
 * Le renderer ne fait aucune analyse réseau : il reçoit les médias du
 * processus principal et gère uniquement l'indicateur et la liste.
 *
 * @module renderer/mediaSniffer
 */

const {
  getHostname,
  getStreamType,
  isHttpUrl,
} = require('../../shared/utils');

const detectionTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Affiche et organise les flux audio/vidéo détectés.
 */
class MediaSniffer {
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
    showToast,
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

    /** @type {Map<string, object>} */
    this.media = new Map();

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
    if (
      !media ||
      typeof media.url !== 'string' ||
      !isHttpUrl(media.url) ||
      this.media.has(media.url)
    ) {
      return false;
    }

    const detectedAt =
      typeof media.detectedAt === 'string' &&
      !Number.isNaN(Date.parse(media.detectedAt))
        ? new Date(media.detectedAt).toISOString()
        : new Date().toISOString();

    this.media.set(media.url, {
      url: media.url,
      extension:
        typeof media.extension === 'string'
          ? media.extension.toLowerCase()
          : 'média',
      resourceType: media.resourceType || 'other',
      detectedAt,
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
      this.showToast?.('Aucun média détecté pour le moment.', 'info');
      return false;
    }

    this.onBeforeOpen?.();
    this.render();
    this.panel.hidden = false;
    this.indicator.setAttribute('aria-expanded', 'true');
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
    this.indicator.setAttribute('aria-expanded', 'false');

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
      const item = document.createElement('li');
      item.className = 'media-item';

      const meta = document.createElement('div');
      meta.className = 'media-item__meta';

      const streamType = getStreamType(media.extension);
      const badge = document.createElement('span');
      badge.className = 'media-badge';
      badge.textContent = streamType
        ? streamType.toUpperCase()
        : media.extension.toUpperCase();

      const host = document.createElement('span');
      host.className = 'media-item__host';
      host.textContent = getHostname(media.url);

      const detectedDate = new Date(media.detectedAt);
      const hasValidDate = !Number.isNaN(detectedDate.getTime());
      const time = document.createElement('time');
      time.className = 'media-item__time';
      time.dateTime = hasValidDate ? detectedDate.toISOString() : '';
      time.textContent = hasValidDate
        ? detectionTimeFormatter.format(detectedDate)
        : '';

      meta.append(badge, host, time);

      const url = document.createElement('p');
      url.className = 'media-item__url';
      url.textContent = media.url;
      url.title = media.url;

      const actions = document.createElement('div');
      actions.className = 'media-item__actions';

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'media-item__open';
      openButton.textContent = 'Ouvrir';
      openButton.setAttribute(
        'aria-label',
        `Ouvrir le média ${media.extension.toUpperCase()} depuis ${getHostname(
          media.url,
        )}`,
      );
      openButton.addEventListener('click', () => {
        this.close();
        this.onOpenMedia(media.url);
      });

      actions.append(openButton);

      if (this.onDownloadMedia) {
        const downloadButton = document.createElement('button');
        downloadButton.type = 'button';
        downloadButton.className = 'media-item__download';
        downloadButton.textContent = streamType
          ? 'Télécharger le flux'
          : 'Télécharger';
        downloadButton.disabled =
          Boolean(streamType) &&
          this.capabilitiesKnown &&
          !this.streamSupport;
        downloadButton.title = downloadButton.disabled
          ? 'ffmpeg est introuvable : ce flux ne peut pas être téléchargé.'
          : streamType
            ? 'Assembler ce flux avec ffmpeg dans le dossier de téléchargement.'
            : 'Télécharger ce fichier média.';
        downloadButton.setAttribute(
          'aria-label',
          downloadButton.title,
        );
        downloadButton.addEventListener('click', () => {
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
      'is-warning',
      this.capabilitiesKnown && !this.streamSupport,
    );
    this.toolStatus.textContent = this.streamSupport
      ? 'Flux HLS et DASH : assemblage ffmpeg disponible.'
      : 'ffmpeg est introuvable : seuls les fichiers directs peuvent être téléchargés.';
  }

  /**
   * Met à jour le libellé et la visibilité de l'indicateur.
   */
  #updateIndicator() {
    const count = this.media.size;
    const plural = count > 1 ? 's' : '';

    this.indicator.hidden = false;
    this.count.textContent = String(count);
    this.indicator.setAttribute(
      'aria-label',
      `${count} média${plural} détecté${plural}. Afficher la liste.`,
    );
  }

  /**
   * Installe les interactions du panneau.
   */
  #setup() {
    this.indicator.addEventListener('click', () => {
      if (this.panel.hidden) {
        this.open();
      } else {
        this.close();
      }
    });

    this.closeButton.addEventListener('click', () => {
      this.close(true);
    });

    this.extractButton?.addEventListener('click', () => {
      this.onExtractPage?.();
    });
  }
}

module.exports = { MediaSniffer };
