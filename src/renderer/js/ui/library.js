'use strict';

/**
 * Think-Browser — panneau Médiathèque.
 *
 * Affiche les fichiers téléchargés ou importés, permet de les rechercher, de
 * les lire, de les renommer, de les supprimer et d'ouvrir leur dossier.
 *
 * @module renderer/ui/library
 */

const { formatBytes } = require('../../../shared/utils');

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
});

const NAME_COLLATOR = new Intl.Collator('fr', {
  numeric: true,
  sensitivity: 'base',
});

/**
 * Formate une durée de média en `HH:MM:SS`.
 * @param {unknown} seconds
 * @returns {string}
 */
function formatMediaDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));

  if (!Number.isFinite(total) || total <= 0) {
    return '';
  }

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(remaining).padStart(2, '0'),
  ].join(':');
}

/**
 * Calcule la progression de lecture d'une fiche.
 * @param {object} entry
 * @returns {{ratio: number, position: number, duration: number}}
 */
function getPlaybackProgress(entry) {
  const duration = Math.max(0, Number(entry?.durationSeconds) || 0);
  const position = Math.max(0, Number(entry?.playPosition) || 0);

  if (duration <= 0 || position <= 0) {
    return { ratio: 0, position, duration };
  }

  return {
    ratio: Math.min(1, position / duration),
    position,
    duration,
  };
}

/**
 * Trie une copie des fiches selon le sélecteur de la médiathèque.
 * @param {object[]} entries
 * @param {unknown} sortKey
 * @returns {object[]}
 */
function sortLibraryEntries(entries, sortKey) {
  const list = Array.isArray(entries) ? [...entries] : [];
  const key = typeof sortKey === 'string' ? sortKey : 'date-desc';

  return list.sort((left, right) => {
    if (key === 'name-asc') {
      return (
        NAME_COLLATOR.compare(left.title || '', right.title || '') ||
        NAME_COLLATOR.compare(left.fileName || '', right.fileName || '')
      );
    }

    if (key === 'duration-desc') {
      return (
        (Number(right.durationSeconds) || 0) -
          (Number(left.durationSeconds) || 0) ||
        NAME_COLLATOR.compare(left.title || '', right.title || '')
      );
    }

    return (
      (Date.parse(right.addedAt) || 0) - (Date.parse(left.addedAt) || 0) ||
      NAME_COLLATOR.compare(left.title || '', right.title || '')
    );
  });
}

/**
 * Formate une date ISO pour l'affichage.
 * @param {string} value
 * @returns {string}
 */
function formatDate(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? '' : DATE_FORMATTER.format(date);
}

/**
 * Contrôle la médiathèque et ses actions.
 */
class LibraryPanel {
  /**
   * @param {object} options
   * @param {HTMLDialogElement} options.dialog
   * @param {HTMLElement} options.list
   * @param {HTMLElement} options.count
   * @param {HTMLInputElement} options.search
   * @param {HTMLSelectElement} options.filter
   * @param {HTMLSelectElement} [options.sort]
   * @param {HTMLButtonElement} options.importButton
   * @param {HTMLElement} options.empty
   * @param {HTMLButtonElement} options.emptyImportButton
   * @param {HTMLDialogElement} options.renameDialog
   * @param {HTMLInputElement} options.renameInput
   * @param {HTMLElement} options.renameError
   * @param {HTMLButtonElement} options.renameConfirm
   * @param {object} options.api
   * @param {import('./dialog').DialogController} options.dialogs
   * @param {import('./player').MediaPlayer} options.player
   * @param {(message: string, variant?: string) => void} [options.showToast]
   */
  constructor({
    dialog,
    list,
    count,
    search,
    filter,
    sort,
    importButton,
    empty,
    emptyImportButton,
    renameDialog,
    renameInput,
    renameError,
    renameConfirm,
    api,
    dialogs,
    player,
    showToast,
  }) {
    this.dialog = dialog;
    this.list = list;
    this.count = count;
    this.search = search;
    this.filter = filter;
    this.sort = sort || null;
    this.importButton = importButton;
    this.empty = empty;
    this.emptyImportButton = emptyImportButton;
    this.renameDialog = renameDialog;
    this.renameInput = renameInput;
    this.renameError = renameError;
    this.renameConfirm = renameConfirm;
    this.api = api;
    this.dialogs = dialogs;
    this.player = player;
    this.showToast = showToast;

    /** @type {object[]} */
    this.entries = [];

    /** @type {string | null} */
    this.currentRenameId = null;

    this.#setup();
  }

  /**
   * Indique si la médiathèque est ouverte.
   * @returns {boolean}
   */
  get isOpen() {
    return this.dialog.open;
  }

  /**
   * Ouvre la médiathèque après rechargement.
   * @returns {Promise<void>}
   */
  async open() {
    await this.refresh();
    this.dialogs.show(this.dialog);
  }

  /**
   * Recharge les fiches depuis le processus principal.
   * @returns {Promise<void>}
   */
  async refresh() {
    try {
      const entries = await this.api.listLibrary();

      this.entries = Array.isArray(entries)
        ? entries.filter(
            (entry) =>
              entry &&
              typeof entry.id === 'string' &&
              typeof entry.title === 'string',
          )
        : [];
    } catch (error) {
      console.warn('[Médiathèque] Lecture impossible :', error.message);
      this.showToast?.(
        `Médiathèque indisponible : ${error.message}`,
        'error',
      );
    }

    this.render();
  }

  /**
   * Réagit à une modification signalée par le processus principal.
   */
  handleChanged() {
    if (this.dialog.open) {
      void this.refresh();
    }
  }

  /**
   * Affiche les fiches correspondant à la recherche et au filtre.
   */
  render() {
    const body = this.dialog.querySelector('.modal__body');
    const scrollTop = body?.scrollTop || 0;
    const query = this.search.value.trim().toLocaleLowerCase('fr');
    const filter = this.filter.value;
    const visible = sortLibraryEntries(
      this.entries.filter((entry) => {
        if (filter !== 'all' && entry.kind !== filter) {
          return false;
        }

        if (!query) {
          return true;
        }

        const haystack = [
          entry.title,
          entry.fileName,
          entry.streamType || '',
          entry.source === 'import' ? 'importé' : 'téléchargé',
        ]
          .join(' ')
          .toLocaleLowerCase('fr');

        return haystack.includes(query);
      }),
      this.sort?.value,
    );

    this.list.replaceChildren();
    this.list.hidden = visible.length === 0;

    const total = this.entries.length;
    const plural = total > 1 ? 's' : '';

    if (total === 0) {
      this.count.textContent = 'Aucun média';
    } else if (visible.length === total) {
      this.count.textContent = `${total} média${plural}`;
    } else {
      this.count.textContent = `${visible.length} / ${total} média${plural}`;
    }

    this.empty.hidden = visible.length > 0;

    if (visible.length === 0) {
      const libraryIsEmpty = total === 0;
      const title = this.empty.querySelector('.library-empty__title');
      const text = this.empty.querySelector('.library-empty__text');

      if (title) {
        title.textContent = libraryIsEmpty
          ? 'Votre médiathèque est vide.'
          : 'Aucun résultat.';
      }

      if (text) {
        text.textContent = libraryIsEmpty
          ? 'Les vidéos et fichiers audio terminés apparaissent ici automatiquement. Vous pouvez aussi importer un fichier local.'
          : 'Essayez un autre terme, changez le filtre de type ou le tri.';
      }

      this.emptyImportButton.hidden = !libraryIsEmpty;
    }

    if (visible.length > 0) {
      const fragment = document.createDocumentFragment();

      for (const entry of visible) {
        fragment.append(this.#createCard(entry));
      }

      this.list.append(fragment);
    }

    if (body) {
      body.scrollTop = scrollTop;
    }
  }

  /**
   * Construit une carte de média.
   * @param {object} entry
   * @returns {HTMLElement}
   */
  #createCard(entry) {
    const card = document.createElement('article');
    card.className = 'library-card';
    card.dataset.id = entry.id;

    if (!entry.available) {
      card.classList.add('is-missing');
    }

    const preview = document.createElement('button');
    preview.className = 'library-card__preview';
    preview.type = 'button';
    preview.dataset.action = 'play';
    preview.disabled = !entry.available;
    preview.title = entry.available
      ? `Lire ${entry.title}`
      : 'Fichier introuvable';
    preview.setAttribute('aria-label', preview.title);

    if (entry.thumbnailUrl) {
      const image = document.createElement('img');
      image.className = 'library-card__image';
      image.src = entry.thumbnailUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener(
        'error',
        () => {
          image.remove();
          preview.prepend(this.#createPlaceholder(entry));
        },
        { once: true },
      );
      preview.append(image);
    } else {
      preview.append(this.#createPlaceholder(entry));
    }

    const duration = formatMediaDuration(entry.durationSeconds);
    const progress = getPlaybackProgress(entry);

    if (duration) {
      const badge = document.createElement('span');
      badge.className = 'library-card__duration';
      badge.textContent = duration;
      preview.append(badge);
    }

    if (progress.ratio > 0 && progress.ratio < 0.995) {
      const track = document.createElement('span');
      track.className = 'library-card__progress';
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-label', 'Progression de lecture');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(
        Math.round(progress.ratio * 100),
      ));

      const fill = document.createElement('span');
      fill.className = 'library-card__progress-fill';
      fill.style.width = `${Math.round(progress.ratio * 100)}%`;
      track.append(fill);
      preview.append(track);
    }

    if (entry.streamType) {
      const streamBadge = document.createElement('span');
      streamBadge.className = 'library-card__badge';
      streamBadge.textContent =
        entry.streamType === 'dash' ? 'DASH' : 'HLS';
      preview.append(streamBadge);
    }

    const body = document.createElement('div');
    body.className = 'library-card__body';

    const title = document.createElement('h3');
    title.className = 'library-card__title';
    title.textContent = entry.title;
    title.title = entry.fileName;

    const meta = document.createElement('p');
    meta.className = 'library-card__meta';
    const metaParts = [formatBytes(Number(entry.size) || 0)];

    if (Number(entry.width) > 0 && Number(entry.height) > 0) {
      metaParts.push(`${entry.width}×${entry.height}`);
    }

    const added = formatDate(entry.addedAt);

    if (added) {
      metaParts.push(added);
    }

    meta.textContent = metaParts.join(' · ');

    const file = document.createElement('p');
    file.className = 'library-card__file';
    file.textContent = entry.fileName;
    file.title = entry.fileName;

    body.append(title, meta, file);

    if (progress.ratio > 0 && progress.ratio < 0.995) {
      const resume = document.createElement('p');
      resume.className = 'library-card__resume';
      resume.textContent = `Reprendre à ${formatMediaDuration(
        progress.position,
      )}`;
      body.append(resume);
    }

    if (!entry.available) {
      const missing = document.createElement('p');
      missing.className = 'library-card__missing';
      missing.textContent = 'Fichier introuvable';
      body.append(missing);
    }

    const actions = document.createElement('div');
    actions.className = 'library-card__actions';
    actions.append(
      this.#createAction('play', 'Lire', !entry.available),
      this.#createAction('reveal', 'Dossier', !entry.available),
      this.#createAction('rename', 'Renommer', !entry.available),
      this.#createAction('delete', 'Supprimer', false, true),
    );
    body.append(actions);
    card.append(preview, body);

    return card;
  }

  /**
   * Crée le visuel de remplacement d'une miniature.
   * @param {object} entry
   * @returns {HTMLElement}
   */
  #createPlaceholder(entry) {
    const placeholder = document.createElement('span');
    placeholder.className = 'library-card__placeholder';
    placeholder.textContent = entry.kind === 'audio' ? '♪' : '▶';
    placeholder.setAttribute('aria-hidden', 'true');
    return placeholder;
  }

  /**
   * Crée un bouton d'action de carte.
   * @param {string} action
   * @param {string} label
   * @param {boolean} disabled
   * @param {boolean} [danger]
   * @returns {HTMLButtonElement}
   */
  #createAction(action, label, disabled, danger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = danger
      ? 'library-action library-action--danger'
      : 'library-action';
    button.dataset.action = action;
    button.textContent = label;
    button.disabled = disabled;
    return button;
  }

  /**
   * Installe les interactions du panneau.
   */
  #setup() {
    this.search.addEventListener('input', () => this.render());
    this.filter.addEventListener('change', () => this.render());
    this.sort?.addEventListener('change', () => this.render());
    this.importButton.addEventListener('click', () => {
      void this.#importFiles();
    });
    this.emptyImportButton.addEventListener('click', () => {
      void this.#importFiles();
    });

    this.list.addEventListener('click', (event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest('button[data-action]')
          : null;

      if (!button || !this.list.contains(button)) {
        return;
      }

      const card = button.closest('.library-card');
      const id = card?.dataset.id || '';
      const entry = this.entries.find((candidate) => candidate.id === id);

      if (!entry) {
        return;
      }

      switch (button.dataset.action) {
        case 'play':
          void this.#play(entry);
          break;
        case 'reveal':
          void this.#reveal(entry);
          break;
        case 'rename':
          this.#openRename(entry);
          break;
        case 'delete':
          void this.#delete(entry);
          break;
        default:
          break;
      }
    });

    this.renameConfirm.addEventListener('click', () => {
      void this.#confirmRename();
    });

    this.renameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void this.#confirmRename();
      }
    });

    this.renameDialog.addEventListener('close', () => {
      this.currentRenameId = null;
      this.renameError.hidden = true;
      this.renameError.textContent = '';
    });
  }

  /**
   * Lance la lecture d'une fiche.
   * @param {object} entry
   * @returns {Promise<void>}
   */
  async #play(entry) {
    if (!entry.available) {
      this.showToast?.('Le fichier est introuvable.', 'error');
      return;
    }

    this.player.open(entry);
  }

  /**
   * Affiche une fiche dans le gestionnaire de fichiers.
   * @param {object} entry
   * @returns {Promise<void>}
   */
  async #reveal(entry) {
    try {
      const result = await this.api.revealLibraryEntry(entry.id);

      if (!result?.ok) {
        this.showToast?.(result?.message || 'Fichier introuvable.', 'error');
      }
    } catch (error) {
      this.showToast?.(`Dossier inaccessible : ${error.message}`, 'error');
    }
  }

  /**
   * Ouvre la modale de renommage.
   * @param {object} entry
   */
  #openRename(entry) {
    this.currentRenameId = entry.id;
    this.renameInput.value = entry.fileName;
    this.renameError.hidden = true;
    this.renameError.textContent = '';
    this.renameError.dataset.variant = 'error';
    this.dialogs.show(this.renameDialog);

    requestAnimationFrame(() => {
      this.renameInput.focus();
      const dot = entry.fileName.lastIndexOf('.');
      const end = dot > 0 ? dot : entry.fileName.length;
      this.renameInput.setSelectionRange(0, end);
    });
  }

  /**
   * Valide le renommage courant.
   * @returns {Promise<void>}
   */
  async #confirmRename() {
    const id = this.currentRenameId;
    const name = this.renameInput.value.trim();

    if (!id) {
      return;
    }

    if (!name) {
      this.renameError.textContent = 'Le nom ne peut pas être vide.';
      this.renameError.hidden = false;
      this.renameInput.focus();
      return;
    }

    this.renameConfirm.disabled = true;

    try {
      const result = await this.api.renameLibraryEntry(id, name);

      if (!result?.ok) {
        this.renameError.textContent =
          result?.message || 'Renommage impossible.';
        this.renameError.hidden = false;
        return;
      }

      this.renameDialog.close();
      this.showToast?.('Média renommé.', 'success');
      await this.refresh();
    } catch (error) {
      this.renameError.textContent = `Renommage impossible : ${error.message}`;
      this.renameError.hidden = false;
    } finally {
      this.renameConfirm.disabled = false;
    }
  }

  /**
   * Supprime une fiche et son fichier après confirmation.
   * @param {object} entry
   * @returns {Promise<void>}
   */
  async #delete(entry) {
    const confirmed = await this.dialogs.askConfirmation({
      title: 'Supprimer ce média ?',
      message:
        `Le fichier « ${entry.fileName} » sera supprimé du disque. ` +
        'Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    try {
      const result = await this.api.removeLibraryEntry(entry.id, true);

      if (!result?.ok) {
        this.showToast?.(
          result?.message || 'Suppression impossible.',
          'error',
        );
        return;
      }

      this.showToast?.('Média supprimé.', 'success');
      await this.refresh();
    } catch (error) {
      this.showToast?.(`Suppression impossible : ${error.message}`, 'error');
    }
  }

  /**
   * Ouvre le sélecteur de fichiers et importe les médias choisis.
   * @returns {Promise<void>}
   */
  async #importFiles() {
    this.importButton.disabled = true;
    this.emptyImportButton.disabled = true;

    try {
      const result = await this.api.importLibraryFiles();

      if (!result || result.canceled) {
        return;
      }

      if (!result.ok) {
        this.showToast?.(
          result.message || 'Importation impossible.',
          'error',
        );
        return;
      }

      if (result.added > 0) {
        const plural = result.added > 1 ? 's' : '';
        this.showToast?.(
          `${result.added} média${plural} importé${plural}.`,
          'success',
        );
      } else {
        this.showToast?.('Aucun nouveau média importé.', 'info');
      }

      await this.refresh();
    } catch (error) {
      this.showToast?.(`Importation impossible : ${error.message}`, 'error');
    } finally {
      this.importButton.disabled = false;
      this.emptyImportButton.disabled = false;
    }
  }
}

module.exports = {
  LibraryPanel,
  formatMediaDuration,
  getPlaybackProgress,
  sortLibraryEntries,
};
