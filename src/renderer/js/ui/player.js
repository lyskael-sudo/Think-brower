'use strict';

/**
 * Think-Browser — lecteur média intégré.
 *
 * Le lecteur utilise les API HTMLMediaElement et le protocole local
 * `think-media:`. Il mémorise régulièrement la position de lecture et expose
 * des raccourcis clavier cohérents avec les autres lecteurs de bureau.
 *
 * @module renderer/ui/player
 */

const { IPC } = require('../../../shared/constants');
const { formatBytes, formatDuration } = require('../../../shared/utils');

/**
 * Formate une durée de lecteur, y compris zéro.
 * @param {number} seconds
 * @returns {string}
 */
function formatClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = String(total % 60).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${remaining}`;
  }

  return `${minutes}:${remaining}`;
}

/**
 * Contrôle la modale de lecture.
 */
class MediaPlayer {
  /**
   * @param {object} options
   * @param {HTMLDialogElement} options.dialog
   * @param {object} options.elements
   * @param {HTMLVideoElement} options.elements.video
   * @param {HTMLElement} options.elements.title
   * @param {HTMLElement} options.elements.subtitle
   * @param {HTMLElement} options.elements.error
   * @param {HTMLButtonElement} options.elements.reveal
   * @param {HTMLButtonElement} options.elements.rewind
   * @param {HTMLButtonElement} options.elements.toggle
   * @param {HTMLButtonElement} options.elements.forward
   * @param {HTMLElement} options.elements.time
   * @param {HTMLInputElement} options.elements.progress
   * @param {HTMLButtonElement} options.elements.mute
   * @param {HTMLInputElement} options.elements.volume
   * @param {HTMLSelectElement} options.elements.speed
   * @param {HTMLButtonElement} options.elements.fullscreen
   * @param {object} options.api
   * @param {import('./dialog').DialogController} options.dialogs
   * @param {(message: string, variant?: string) => void} [options.showToast]
   * @param {() => void} [options.onClosed]
   */
  constructor({ dialog, elements, api, dialogs, showToast, onClosed }) {
    this.dialog = dialog;
    this.video = elements.video;
    this.titleElement = elements.title;
    this.subtitleElement = elements.subtitle;
    this.errorElement = elements.error;
    this.revealButton = elements.reveal;
    this.rewindButton = elements.rewind;
    this.toggleButton = elements.toggle;
    this.forwardButton = elements.forward;
    this.timeElement = elements.time;
    this.progressInput = elements.progress;
    this.muteButton = elements.mute;
    this.volumeInput = elements.volume;
    this.speedSelect = elements.speed;
    this.fullscreenButton = elements.fullscreen;
    this.api = api;
    this.dialogs = dialogs;
    this.showToast = showToast;
    this.onClosed = typeof onClosed === 'function' ? onClosed : null;

    /** @type {object | null} */
    this.currentEntry = null;

    this.pendingSeek = 0;
    this.lastSavedAt = 0;
    this.isSeeking = false;
    this.hasError = false;
    this.isWindowFullscreen = false;
    this.playerFullscreen = false;

    this.#setup();
  }

  /**
   * Ouvre un média dans le lecteur.
   * @param {object} entry
   * @returns {void}
   */
  open(entry) {
    if (!entry || !entry.playUrl) {
      this.showToast?.('Ce média ne peut pas être lu.', 'error');
      return;
    }

    this.currentEntry = entry;
    this.pendingSeek = Number(entry.playPosition) || 0;
    this.lastSavedAt = 0;
    this.hasError = false;
    this.titleElement.textContent = entry.title || entry.fileName || 'Média';
    this.subtitleElement.textContent = this.#buildSubtitle(entry);
    this.errorElement.hidden = true;
    this.errorElement.textContent = '';
    this.#setControlsEnabled(false);
    this.video.src = entry.playUrl;
    this.video.load();
    this.#resetControls();

    this.dialogs.show(this.dialog);
    this.video.focus();
    this.playerFullscreen = false;
    this.#syncFullscreenClass();
    void this.api
      .isWindowFullscreen()
      .then((fullscreen) => {
        if (!this.dialog.open || this.playerFullscreen) {
          return;
        }

        this.isWindowFullscreen = Boolean(fullscreen);
        this.#syncFullscreenClass();
        this.#updateFullscreenButton();
      })
      .catch(() => {});
  }

  /**
   * Ferme le lecteur et libère le fichier.
   * @returns {void}
   */
  close() {
    if (this.dialog.open) {
      this.dialog.close();
    }
  }

  /**
   * Construit la ligne d'informations secondaires.
   * @param {object} entry
   * @returns {string}
   */
  #buildSubtitle(entry) {
    const parts = [entry.fileName];

    if (Number(entry.size) > 0) {
      parts.push(formatBytes(entry.size));
    }

    if (Number(entry.width) > 0 && Number(entry.height) > 0) {
      parts.push(`${entry.width}×${entry.height}`);
    }

    const duration = formatDuration(entry.durationSeconds);

    if (duration) {
      parts.push(duration);
    }

    return parts.filter(Boolean).join(' · ');
  }

  /**
   * Installe les écouteurs du lecteur.
   */
  #setup() {
    this.video.addEventListener('loadedmetadata', () => {
      this.#setControlsEnabled(true);

      const duration = Number(this.video.duration);
      const nearEndLimit = Number.isFinite(duration)
        ? Math.max(duration - 1, duration * 0.98)
        : 0;

      if (
        this.pendingSeek > 0 &&
        Number.isFinite(duration) &&
        this.pendingSeek < nearEndLimit
      ) {
        this.video.currentTime = this.pendingSeek;
      }

      this.pendingSeek = 0;
      this.#updateTime();
      void this.video.play().catch(() => {
        // La lecture automatique peut être refusée : l'utilisateur garde le
        // bouton de lecture.
      });
    });

    this.video.addEventListener('timeupdate', () => {
      if (!this.isSeeking) {
        this.#updateTime();
      }

      if (!this.video.paused) {
        this.#savePosition();
      }
    });

    this.video.addEventListener('play', () => this.#updateToggle());
    this.video.addEventListener('pause', () => {
      this.#updateToggle();
      this.#savePosition(true);
    });
    this.video.addEventListener('ended', () => {
      this.#updateTime();
      this.#savePosition(true);
    });
    this.video.addEventListener('volumechange', () => this.#updateMute());
    this.video.addEventListener('error', () => this.#showPlaybackError());
    this.video.addEventListener('click', () => this.#togglePlayback());
    this.video.addEventListener('dblclick', () => this.#toggleFullscreen());

    this.toggleButton.addEventListener('click', () => this.#togglePlayback());
    this.rewindButton.addEventListener('click', () => this.#seekBy(-10));
    this.forwardButton.addEventListener('click', () => this.#seekBy(10));
    this.muteButton.addEventListener('click', () => this.#toggleMute());
    this.fullscreenButton.addEventListener('click', () =>
      this.#toggleFullscreen(),
    );
    this.revealButton.addEventListener('click', () => {
      void this.#reveal();
    });

    this.progressInput.addEventListener('input', () => {
      this.isSeeking = true;
      const duration = Number(this.video.duration);

      if (Number.isFinite(duration) && duration > 0) {
        this.video.currentTime =
          (Number(this.progressInput.value) / 1000) * duration;
        this.#updateTime();
      }
    });

    this.progressInput.addEventListener('change', () => {
      this.isSeeking = false;
    });

    this.volumeInput.addEventListener('input', () => {
      const volume = Math.max(0, Math.min(1, Number(this.volumeInput.value)));
      this.video.volume = volume;
      this.video.muted = volume === 0;
    });

    this.speedSelect.addEventListener('change', () => {
      const rate = Number(this.speedSelect.value);
      this.video.playbackRate = Number.isFinite(rate) ? rate : 1;
    });

    this.dialog.addEventListener('keydown', (event) => {
      this.#handleKeydown(event);
    });

    this.dialog.addEventListener('close', () => {
      void this.#cleanup();
    });

    this.api.on(IPC.WINDOW_FULLSCREEN_CHANGED, (fullscreen) => {
      this.isWindowFullscreen = Boolean(fullscreen);

      if (!this.isWindowFullscreen) {
        this.playerFullscreen = false;
      }

      this.#syncFullscreenClass();
      this.#updateFullscreenButton();
    });
  }

  /**
   * Gère les raccourcis clavier du lecteur.
   * @param {KeyboardEvent} event
   */
  #handleKeydown(event) {
    const target = event.target;
    const tagName = target instanceof HTMLElement ? target.tagName : '';

    if (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'BUTTON') {
      return;
    }

    switch (event.key) {
      case ' ':
        event.preventDefault();
        this.#togglePlayback();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.#seekBy(-10);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.#seekBy(10);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.#changeVolume(0.05);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.#changeVolume(-0.05);
        break;
      case 'Home':
        event.preventDefault();
        this.#seekTo(0);
        break;
      case 'End':
        event.preventDefault();
        this.#seekTo(this.video.duration);
        break;
      case 'm':
      case 'M':
        event.preventDefault();
        this.#toggleMute();
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        this.#toggleFullscreen();
        break;
      default:
        break;
    }
  }

  /**
   * Bascule lecture/pause.
   */
  #togglePlayback() {
    if (!this.currentEntry) {
      return;
    }

    if (this.video.paused) {
      void this.video.play().catch(() => {
        this.#showPlaybackError();
      });
    } else {
      this.video.pause();
    }
  }

  /**
   * Déplace la lecture d'un nombre de secondes.
   * @param {number} delta
   */
  #seekBy(delta) {
    const duration = Number(this.video.duration);
    const current = Number(this.video.currentTime) || 0;

    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }

    this.video.currentTime = Math.max(
      0,
      Math.min(duration, current + delta),
    );
    this.#updateTime();
  }

  /**
   * Déplace la lecture à une position absolue.
   * @param {number} position
   */
  #seekTo(position) {
    const duration = Number(this.video.duration);

    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }

    this.video.currentTime = Math.max(
      0,
      Math.min(duration, Number(position) || 0),
    );
    this.#updateTime();
  }

  /**
   * Modifie le volume par pas.
   * @param {number} delta
   */
  #changeVolume(delta) {
    const volume = Math.max(0, Math.min(1, this.video.volume + delta));
    this.video.volume = volume;
    this.video.muted = volume === 0;
  }

  /**
   * Coupe ou rétablit le son.
   */
  #toggleMute() {
    this.video.muted = !this.video.muted;

    if (!this.video.muted && this.video.volume === 0) {
      this.video.volume = 0.5;
    }
  }

  /**
   * Bascule le plein écran.
   */
  #toggleFullscreen() {
    const target = !this.isWindowFullscreen;
    const previous = this.isWindowFullscreen;

    this.playerFullscreen = target;
    this.isWindowFullscreen = target;
    this.#syncFullscreenClass();
    this.#updateFullscreenButton();

    void this.api
      .setWindowFullscreen(target)
      .catch(() => {
        this.playerFullscreen = false;
        this.isWindowFullscreen = previous;
        this.#syncFullscreenClass();
        this.#updateFullscreenButton();
        this.showToast?.('Le plein écran est indisponible.', 'error');
      });
  }

  /**
   * Agrandit la modale lorsque la fenêtre passe en plein écran.
   */
  #syncFullscreenClass() {
    this.dialog.classList.toggle(
      'player-modal--fullscreen',
      this.dialog.open && this.isWindowFullscreen,
    );
  }

  /**
   * Met à jour l'affichage du temps et de la progression.
   */
  #updateTime() {
    const current = Number(this.video.currentTime) || 0;
    const duration = Number(this.video.duration);

    this.timeElement.textContent = `${formatClock(current)} / ${formatClock(
      Number.isFinite(duration) ? duration : 0,
    )}`;

    if (Number.isFinite(duration) && duration > 0 && !this.hasError) {
      this.progressInput.value = String(
        Math.round((current / duration) * 1000),
      );
      this.progressInput.disabled = false;
    } else {
      this.progressInput.value = '0';
      this.progressInput.disabled = true;
    }
  }

  /**
   * Met à jour le bouton lecture/pause.
   */
  #updateToggle() {
    const paused = this.video.paused;
    this.toggleButton.textContent = paused ? '▶' : '⏸';
    this.toggleButton.setAttribute(
      'aria-label',
      paused ? 'Lire' : 'Mettre en pause',
    );
  }

  /**
   * Met à jour le bouton son.
   */
  #updateMute() {
    const muted = this.video.muted || this.video.volume === 0;
    this.muteButton.textContent = muted ? '🔇' : '🔊';
    this.muteButton.setAttribute(
      'aria-label',
      muted ? 'Rétablir le son' : 'Couper le son',
    );
    this.volumeInput.value = String(
      this.video.muted ? 0 : this.video.volume,
    );
  }

  /**
   * Met à jour le bouton plein écran.
   */
  #updateFullscreenButton() {
    this.fullscreenButton.textContent = this.isWindowFullscreen
      ? '⤢'
      : '⛶';
    this.fullscreenButton.setAttribute(
      'aria-label',
      this.isWindowFullscreen ? 'Quitter le plein écran' : 'Plein écran',
    );
  }

  /**
   * Active ou désactive les contrôles qui dépendent des métadonnées.
   * @param {boolean} enabled
   */
  #setControlsEnabled(enabled) {
    const allowed = enabled && !this.hasError;
    this.toggleButton.disabled = !allowed;
    this.rewindButton.disabled = !allowed;
    this.forwardButton.disabled = !allowed;
    this.progressInput.disabled = !allowed;
    this.speedSelect.disabled = !allowed;
  }

  /**
   * Réinitialise les contrôles à l'ouverture.
   */
  #resetControls() {
    this.progressInput.value = '0';
    this.timeElement.textContent = '0:00 / 0:00';
    this.video.playbackRate = 1;
    this.speedSelect.value = '1';
    this.#updateToggle();
    this.#updateMute();
    this.#updateFullscreenButton();
  }

  /**
   * Affiche une erreur de lecture.
   */
  #showPlaybackError() {
    if (!this.currentEntry || !this.dialog.open) {
      return;
    }

    this.hasError = true;
    this.errorElement.textContent =
      'Lecture impossible. Le fichier est peut-être absent, déplacé ou ' +
      'encodé dans un format non pris en charge par le moteur.';
    this.errorElement.hidden = false;
    this.#setControlsEnabled(false);
  }

  /**
   * Enregistre la position de lecture, au plus toutes les cinq secondes.
   * @param {boolean} [force]
   */
  #savePosition(force = false) {
    if (!this.currentEntry || !Number.isFinite(this.video.currentTime)) {
      return Promise.resolve();
    }

    const now = Date.now();

    if (!force && now - this.lastSavedAt < 5_000) {
      return Promise.resolve();
    }

    this.lastSavedAt = now;
    return this.api
      .updateLibraryPlayback(this.currentEntry.id, this.video.currentTime)
      .catch((error) => {
        console.warn(
          '[Médiathèque] Position de lecture non enregistrée :',
          error.message,
        );
      });
  }

  /**
   * Affiche le fichier dans le gestionnaire de fichiers.
   * @returns {Promise<void>}
   */
  async #reveal() {
    if (!this.currentEntry) {
      return;
    }

    try {
      const result = await this.api.revealLibraryEntry(this.currentEntry.id);

      if (!result?.ok) {
        this.showToast?.(
          result?.message || 'Fichier introuvable.',
          'error',
        );
      }
    } catch (error) {
      this.showToast?.(`Dossier inaccessible : ${error.message}`, 'error');
    }
  }

  /**
   * Arrête la lecture et libère la source locale.
   * @returns {Promise<void>}
   */
  async #cleanup() {
    await this.#savePosition(true);
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.currentEntry = null;
    this.pendingSeek = 0;
    this.errorElement.hidden = true;
    this.errorElement.textContent = '';
    this.titleElement.textContent = 'Média';
    this.subtitleElement.textContent = '';
    this.#resetControls();
    this.#setControlsEnabled(false);

    const shouldExitFullscreen = this.playerFullscreen;
    this.playerFullscreen = false;

    if (shouldExitFullscreen) {
      this.isWindowFullscreen = false;
      void this.api.setWindowFullscreen(false).catch(() => {});
    }

    this.#syncFullscreenClass();
    this.onClosed?.();
  }
}

module.exports = { MediaPlayer, formatClock };
