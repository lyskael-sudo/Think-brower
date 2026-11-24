'use strict';

/**
 * Think-Browser — panneau Téléchargements.
 *
 * @module renderer/ui/downloads
 */

const {
  formatBytes,
  formatDuration,
  getHostname,
} = require('../../../shared/utils');
const { createEmptyState } = require('./dialog');

/**
 * Retourne le libellé français d'un état de téléchargement.
 * @param {string} state
 * @returns {string}
 */
function getDownloadStatusLabel(state) {
  switch (state) {
    case 'completed':
      return 'Terminé';
    case 'cancelled':
      return 'Annulé';
    case 'interrupted':
      return 'Interrompu';
    case 'queued':
      return 'En attente';
    default:
      return 'En cours';
  }
}

/**
 * Affiche la progression des téléchargements de la session.
 */
class DownloadsPanel {
  /**
   * @param {object} options
   * @param {HTMLDialogElement} options.dialog
   * @param {HTMLElement} options.list
   * @param {HTMLElement} options.count
   * @param {object} options.api
   * @param {import('./dialog').DialogController} options.dialogs
   * @param {(message: string, variant?: string) => void} options.showToast
   */
  constructor({
    dialog,
    list,
    count,
    api,
    dialogs,
    showToast,
  }) {
    this.dialog = dialog;
    this.list = list;
    this.count = count;
    this.api = api;
    this.dialogs = dialogs;
    this.showToast = showToast;

    /** @type {Map<number, object>} */
    this.records = new Map();
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
   * Recharge la liste depuis le processus principal.
   * @returns {Promise<void>}
   */
  async refresh() {
    try {
      const records = await this.api.listDownloads();

      this.records.clear();

      if (Array.isArray(records)) {
        for (const record of records) {
          if (record && Number.isFinite(Number(record.id))) {
            this.records.set(Number(record.id), record);
          }
        }
      }
    } catch (error) {
      console.warn('[Téléchargements] Lecture impossible :', error.message);
      this.showToast?.(
        `Téléchargements indisponibles : ${error.message}`,
        'error',
      );
    }

    this.render();
  }

  /**
   * Réagit à un nouveau téléchargement.
   * @param {object} record
   */
  handleStarted(record) {
    if (!record || !Number.isFinite(Number(record.id))) {
      return;
    }

    this.records.set(Number(record.id), record);
    this.showToast?.(
      `Téléchargement démarré : ${record.filename || 'fichier'}`,
      'info',
    );

    if (this.isOpen) {
      this.render();
    }
  }

  /**
   * Réagit à une progression.
   * @param {object} record
   */
  handleUpdated(record) {
    if (!record || !Number.isFinite(Number(record.id))) {
      return;
    }

    this.records.set(Number(record.id), record);

    if (this.isOpen) {
      this.render();
    }
  }

  /**
   * Réagit à la fin d'un téléchargement.
   * @param {object} record
   */
  handleDone(record) {
    if (!record || !Number.isFinite(Number(record.id))) {
      return;
    }

    this.records.set(Number(record.id), record);

    if (record.state === 'completed') {
      this.showToast?.(
        `Téléchargement terminé : ${record.filename || 'fichier'}`,
        'success',
      );
    } else if (record.state === 'cancelled') {
      this.showToast?.(
        `Téléchargement annulé : ${record.filename || 'fichier'}`,
        'info',
      );
    } else {
      this.showToast?.(
        `Téléchargement échoué : ${record.filename || 'fichier'}`,
        'error',
      );
    }

    if (this.isOpen) {
      this.render();
    }
  }

  /**
   * Construit la liste des téléchargements.
   */
  render() {
    const body = this.dialog.querySelector('.modal__body');
    const scrollTop = body?.scrollTop || 0;
    this.list.replaceChildren();

    const records = Array.from(this.records.values()).sort(
      (a, b) => Number(b.id) - Number(a.id),
    );
    const count = records.length;
    const plural = count > 1 ? 's' : '';

    this.count.textContent =
      count === 0
        ? 'Aucun téléchargement'
        : `${count} téléchargement${plural}`;

    if (count === 0) {
      this.list.append(
        createEmptyState(
          'Aucun téléchargement',
          'Les fichiers et flux HLS/DASH téléchargés depuis vos pages apparaîtront ici.',
        ),
      );

      if (body) {
        body.scrollTop = scrollTop;
      }

      return;
    }

    const fragment = document.createDocumentFragment();

    for (const record of records) {
      const item = document.createElement('article');
      item.className = 'download-item';

      const top = document.createElement('div');
      top.className = 'download-item__top';

      const savedName =
        typeof record.savePath === 'string' && record.savePath
          ? record.savePath.split(/[\\/]/).pop()
          : '';
      const name = document.createElement('span');
      name.className = 'download-item__name';
      name.textContent = savedName || record.filename || 'Téléchargement';
      name.title = record.savePath || record.filename || '';

      const status = document.createElement('span');
      const state = record.state || 'progressing';
      status.className = `download-status download-status--${state}`;
      status.textContent = getDownloadStatusLabel(state);

      top.append(name, status);

      const meta = document.createElement('div');
      meta.className = 'download-item__meta';

      if (record.kind === 'stream') {
        const badge = document.createElement('span');
        badge.className = 'download-item__badge';
        badge.textContent = record.ytdlp
          ? 'YT-DLP'
          : record.merged
            ? 'FUSION'
            : record.streamType === 'dash'
              ? 'DASH'
              : 'HLS';
        meta.append(badge);

        if (record.isLive) {
          const liveBadge = document.createElement('span');
          liveBadge.className = 'download-item__badge download-item__badge--live';
          liveBadge.textContent = 'DIRECT';
          liveBadge.title = 'Enregistrement d’un flux en direct';
          meta.append(liveBadge);
        }
      }

      const host = document.createElement('span');
      host.className = 'download-item__host';
      host.textContent = getHostname(record.url || '');
      host.title = record.url || '';

      const receivedBytes = Number(record.receivedBytes) || 0;
      const totalBytes = Number(record.totalBytes) || 0;
      const duration = formatDuration(record.durationSeconds);
      let sizeLabel = '';

      if (totalBytes > 0) {
        sizeLabel =
          state === 'progressing'
            ? `${formatBytes(receivedBytes)} / ${formatBytes(totalBytes)}`
            : formatBytes(totalBytes);
      } else if (receivedBytes > 0) {
        sizeLabel = formatBytes(receivedBytes);
      } else if (state === 'queued') {
        sizeLabel = 'En attente d’un emplacement';
      } else if (state === 'progressing') {
        sizeLabel = record.ytdlp
          ? record.message || 'Téléchargement YouTube…'
          : record.kind === 'stream'
            ? record.isLive
              ? 'Enregistrement en direct…'
              : 'Préparation…'
            : 'En attente';
      }

      if (duration) {
        sizeLabel = sizeLabel ? `${sizeLabel} · ${duration}` : duration;
      }

      const size = document.createElement('span');
      size.className = 'download-item__size';
      size.textContent = sizeLabel;
      meta.append(host, size);

      const progressRow = document.createElement('div');
      progressRow.className = 'download-item__progress-row';

      const progress = document.createElement('div');
      progress.className = 'download-progress';
      progress.setAttribute('role', 'progressbar');

      const progressBar = document.createElement('span');
      progressBar.className = 'download-progress__bar';

      const storedProgress =
        typeof record.progress === 'number'
          ? record.progress
          : Number.NaN;
      const percent = Number.isFinite(storedProgress)
        ? Math.max(0, Math.min(100, Math.round(storedProgress)))
        : totalBytes > 0
          ? Math.min(
              100,
              Math.round((receivedBytes / totalBytes) * 100),
            )
          : state === 'completed'
            ? 100
            : null;

      const percentLabel = document.createElement('span');
      percentLabel.className = 'download-item__percent';

      if (percent !== null) {
        progress.setAttribute('aria-valuemin', '0');
        progress.setAttribute('aria-valuemax', '100');
        progress.setAttribute('aria-valuenow', String(percent));
        progressBar.style.width = `${percent}%`;
        percentLabel.textContent = `${percent} %`;

        if (state === 'completed') {
          progress.classList.add('is-complete');
        }
      } else if (state === 'progressing' || state === 'queued') {
        progress.classList.add('download-progress--indeterminate');
        progress.removeAttribute('aria-valuenow');
        percentLabel.textContent = '…';
      } else {
        progress.removeAttribute('aria-valuenow');
        percentLabel.textContent = '—';
      }

      progress.append(progressBar);
      progressRow.append(progress, percentLabel);

      const actions = document.createElement('div');
      actions.className = 'download-item__actions';

      const revealButton = document.createElement('button');
      revealButton.type = 'button';
      revealButton.className = 'button button--ghost button--small';
      revealButton.textContent = 'Afficher dans le dossier';
      revealButton.disabled = !record.savePath;
      revealButton.addEventListener('click', async () => {
        revealButton.disabled = true;

        try {
          const result = await this.api.showDownloadInFolder(record.id);

          if (!result?.ok) {
            this.showToast?.(
              result?.message || 'Fichier introuvable.',
              'error',
            );
          }
        } catch (error) {
          this.showToast?.(
            `Ouverture du dossier impossible : ${error.message}`,
            'error',
          );
        } finally {
          revealButton.disabled = false;
        }
      });

      actions.append(revealButton);

      if (state === 'progressing' || state === 'queued') {
        if (
          state === 'progressing' &&
          record.kind === 'stream' &&
          !record.ytdlp
        ) {
          const stopButton = document.createElement('button');
          stopButton.type = 'button';
          stopButton.className = 'button button--ghost button--small';
          stopButton.textContent = 'Arrêter et conserver';
          stopButton.title =
            'Arrêter l’enregistrement du flux et conserver le fichier déjà reçu.';
          stopButton.addEventListener('click', async () => {
            stopButton.disabled = true;

            try {
              const result = await this.api.stopDownload(record.id);

              if (!result?.ok) {
                this.showToast?.(
                  result?.message || 'Arrêt impossible.',
                  'error',
                );
                stopButton.disabled = false;
              }
            } catch (error) {
              this.showToast?.(
                `Arrêt impossible : ${error.message}`,
                'error',
              );
              stopButton.disabled = false;
            }
          });
          actions.append(stopButton);
        }

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'button button--ghost button--small';
        cancelButton.textContent = 'Annuler';
        cancelButton.addEventListener('click', async () => {
          cancelButton.disabled = true;

          try {
            const result = await this.api.cancelDownload(record.id);

            if (!result?.ok) {
              this.showToast?.(
                result?.message || 'Annulation impossible.',
                'error',
              );
              cancelButton.disabled = false;
              return;
            }
          } catch (error) {
            this.showToast?.(
              `Annulation impossible : ${error.message}`,
              'error',
            );
            cancelButton.disabled = false;
          }
        });

        actions.append(cancelButton);
      }

      if (
        record.kind === 'file' &&
        state === 'interrupted' &&
        record.canResume === true &&
        !record.private
      ) {
        const resumeButton = document.createElement('button');
        resumeButton.type = 'button';
        resumeButton.className = 'button button--ghost button--small';
        resumeButton.textContent = 'Reprendre';
        resumeButton.title =
          'Reprendre le téléchargement partiel si Chromium le permet encore.';
        resumeButton.addEventListener('click', async () => {
          resumeButton.disabled = true;

          try {
            const result = await this.api.resumeDownload(record.id);

            if (!result?.ok) {
              this.showToast?.(
                result?.message || 'Reprise impossible.',
                'error',
              );
              resumeButton.disabled = false;
            }
          } catch (error) {
            this.showToast?.(
              `Reprise impossible : ${error.message}`,
              'error',
            );
            resumeButton.disabled = false;
          }
        });

        actions.append(resumeButton);
      }

      if (
        !record.private &&
        !record.ytdlp &&
        (state === 'interrupted' || state === 'cancelled')
      ) {
        const retryButton = document.createElement('button');
        retryButton.type = 'button';
        retryButton.className = 'button button--ghost button--small';
        retryButton.textContent = 'Relancer';
        retryButton.addEventListener('click', async () => {
          retryButton.disabled = true;

          try {
            const result = await this.api.retryDownload(record.id);

            if (!result?.ok) {
              this.showToast?.(
                result?.message || 'Relance impossible.',
                'error',
              );
              retryButton.disabled = false;
              return;
            }
          } catch (error) {
            this.showToast?.(
              `Relance impossible : ${error.message}`,
              'error',
            );
            retryButton.disabled = false;
          }
        });

        actions.append(retryButton);
      }

      item.append(top, meta, progressRow);

      if (record.message && state !== 'completed') {
        const message = document.createElement('p');
        message.className = 'download-item__message';
        message.classList.toggle(
          'download-item__message--error',
          state === 'interrupted',
        );
        message.textContent = record.message;
        item.append(message);
      }

      item.append(actions);
      fragment.append(item);
    }

    this.list.append(fragment);

    if (body) {
      body.scrollTop = scrollTop;
    }
  }
}

module.exports = { DownloadsPanel, getDownloadStatusLabel };
