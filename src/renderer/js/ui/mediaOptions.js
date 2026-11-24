'use strict';

/**
 * Think-Browser — boîte de dialogue des options de flux.
 *
 * Affiche les pistes audio et de sous-titres détectées par ffprobe avant
 * l'assemblage. Les valeurs transmises sont des index absolus ffprobe.
 *
 * @module renderer/ui/mediaOptions
 */

const {
  formatDuration,
  getHostname,
  getStreamType,
} = require('../../../shared/utils');

/**
 * Construit le libellé lisible d'une piste.
 * @param {object} track
 * @param {number} position
 * @returns {string}
 */
function getTrackLabel(track, position) {
  const language =
    typeof track.language === 'string' && track.language
      ? track.language.toUpperCase()
      : '';
  const title =
    typeof track.title === 'string' && track.title ? track.title : '';
  const codec =
    typeof track.codec === 'string' && track.codec
      ? track.codec.toUpperCase()
      : 'piste';
  const channels =
    Number(track.channels) === 1
      ? 'mono'
      : Number(track.channels) === 2
        ? 'stéréo'
        : Number(track.channels) > 2
          ? `${track.channels} canaux`
          : '';
  const details = [codec, channels].filter(Boolean).join(' · ');
  const name = language || title || `Piste ${position + 1}`;

  return title && title !== name
    ? `${name} — ${title} (${details})`
    : `${name} (${details})`;
}

class MediaOptionsDialog {
  /**
   * @param {object} options
   * @param {HTMLDialogElement} options.dialog
   * @param {HTMLElement} options.summary
   * @param {HTMLElement} options.liveNotice
   * @param {HTMLSelectElement} options.audioSelect
   * @param {HTMLSelectElement} options.subtitleSelect
   * @param {HTMLButtonElement} options.startButton
   * @param {HTMLButtonElement} options.cancelButton
   * @param {HTMLButtonElement} options.closeButton
   * @param {(media: object, selection: object) => void} options.onStart
   */
  constructor({
    dialog,
    summary,
    liveNotice,
    audioSelect,
    subtitleSelect,
    startButton,
    cancelButton,
    closeButton,
    onStart,
  }) {
    this.dialog = dialog;
    this.summary = summary;
    this.liveNotice = liveNotice;
    this.audioSelect = audioSelect;
    this.subtitleSelect = subtitleSelect;
    this.startButton = startButton;
    this.cancelButton = cancelButton;
    this.closeButton = closeButton;
    this.onStart = onStart;
    this.media = null;
    this.prepared = null;

    this.cancelButton.addEventListener('click', () => this.close());
    this.closeButton.addEventListener('click', () => this.close());
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });
    this.startButton.addEventListener('click', () => this.#start());
  }

  /**
   * Ouvre la boîte avec le résultat de l'analyse.
   * @param {object} media
   * @param {object} prepared
   */
  open(media, prepared) {
    this.media = media;
    this.prepared = prepared;

    const streamType = getStreamType(media.extension);
    const duration = formatDuration(prepared.durationSeconds);
    const pieces = [
      getHostname(media.url),
      streamType ? streamType.toUpperCase() : 'Flux',
    ];

    if (duration) {
      pieces.push(duration);
    }

    this.summary.textContent = pieces.join(' · ');
    this.liveNotice.hidden = !prepared.isLive;
    this.#fillTracks(
      this.audioSelect,
      prepared.metadata?.audioTracks || [],
      'Piste audio par défaut',
      true,
    );
    this.#fillTracks(
      this.subtitleSelect,
      prepared.metadata?.subtitleTracks || [],
      'Aucun sous-titre',
      false,
    );

    if (!this.dialog.open) {
      this.dialog.showModal();
    }
  }

  /**
   * Ferme la boîte.
   */
  close() {
    if (this.dialog.open) {
      this.dialog.close();
    }

    this.media = null;
    this.prepared = null;
  }

  /**
   * Remplit une liste de pistes.
   * @param {HTMLSelectElement} select
   * @param {object[]} tracks
   * @param {string} emptyLabel
   * @param {boolean} preferDefault
   */
  #fillTracks(select, tracks, emptyLabel, preferDefault) {
    select.replaceChildren();

    if (!Array.isArray(tracks) || tracks.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = emptyLabel;
      select.append(option);
      select.disabled = true;
      return;
    }

    select.disabled = false;

    if (preferDefault) {
      const automatic = document.createElement('option');
      automatic.value = '';
      automatic.textContent = 'Automatique (piste par défaut)';
      select.append(automatic);
    } else {
      const none = document.createElement('option');
      none.value = '';
      none.textContent = emptyLabel;
      select.append(none);
    }

    let selectedValue = '';

    for (const [position, track] of tracks.entries()) {
      if (!Number.isInteger(track.index) || track.index < 0) {
        continue;
      }

      const option = document.createElement('option');
      option.value = String(track.index);
      option.textContent = getTrackLabel(track, position);
      select.append(option);

      if (preferDefault && selectedValue === '' && track.isDefault) {
        selectedValue = option.value;
      }
    }

    if (preferDefault && selectedValue === '' && select.options.length > 1) {
      selectedValue = select.options[1].value;
    }

    select.value = selectedValue;
  }

  /**
   * Transmet la sélection au démarrage du téléchargement.
   */
  #start() {
    if (!this.media || !this.prepared) {
      return;
    }

    const audioValue = Number(this.audioSelect.value);
    const subtitleValue = Number(this.subtitleSelect.value);
    const media = this.media;
    const prepared = this.prepared;

    this.close();
    this.onStart(media, {
      audioStreamIndex:
        this.audioSelect.value !== '' && Number.isInteger(audioValue)
          ? audioValue
          : null,
      subtitleStreamIndex:
        this.subtitleSelect.value !== '' && Number.isInteger(subtitleValue)
          ? subtitleValue
          : null,
      isLive: Boolean(prepared.isLive),
    });
  }
}

module.exports = { MediaOptionsDialog, getTrackLabel };
