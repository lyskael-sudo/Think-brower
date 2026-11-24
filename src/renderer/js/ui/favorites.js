'use strict';

/**
 * Think-Browser — panneau Favoris.
 *
 * Le panneau gère la liste, les dossiers, le déplacement des favoris et les
 * opérations d'import/export. Le disque et les dialogues natifs restent dans
 * le processus principal.
 *
 * @module renderer/ui/favorites
 */

const { getHostname, isHttpUrl } = require('../../../shared/utils');
const { createEmptyState } = require('./dialog');

const favoriteDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
});

const ALL_FOLDERS = 'all';
const NO_FOLDER = 'none';

/**
 * Affiche, organise et retire les favoris.
 */
class FavoritesPanel {
  /**
   * @param {object} options
   * @param {HTMLDialogElement} options.dialog
   * @param {HTMLElement} options.list
   * @param {HTMLElement} options.count
   * @param {HTMLElement} options.foldersList
   * @param {HTMLButtonElement} options.newFolderButton
   * @param {HTMLFormElement} options.folderForm
   * @param {HTMLInputElement} options.folderNameInput
   * @param {HTMLButtonElement} options.folderCancelButton
   * @param {HTMLButtonElement} options.importButton
   * @param {HTMLButtonElement} options.exportButton
   * @param {object} options.api
   * @param {import('./dialog').DialogController} options.dialogs
   * @param {(url: string) => void} options.onNavigate
   * @param {() => void} [options.onChanged]
   * @param {(message: string, variant?: string) => void} options.showToast
   */
  constructor({
    dialog,
    list,
    count,
    foldersList,
    newFolderButton,
    folderForm,
    folderNameInput,
    folderCancelButton,
    importButton,
    exportButton,
    api,
    dialogs,
    onNavigate,
    onChanged,
    showToast,
  }) {
    this.dialog = dialog;
    this.list = list;
    this.count = count;
    this.foldersList = foldersList;
    this.newFolderButton = newFolderButton;
    this.folderForm = folderForm;
    this.folderNameInput = folderNameInput;
    this.folderCancelButton = folderCancelButton;
    this.importButton = importButton;
    this.exportButton = exportButton;
    this.api = api;
    this.dialogs = dialogs;
    this.onNavigate = onNavigate;
    this.onChanged = onChanged;
    this.showToast = showToast;

    /** @type {object[]} */
    this.favorites = [];

    /** @type {object[]} */
    this.folders = [];

    /** @type {string} */
    this.activeFolderId = ALL_FOLDERS;

    this.#bind();
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
   * Recharge les favoris et les dossiers.
   * @param {{silent?: boolean}} [options]
   * @returns {Promise<void>}
   */
  async refresh({ silent = false } = {}) {
    try {
      const [favorites, folders] = await Promise.all([
        this.api.listFavorites(),
        this.api.listFavoriteFolders(),
      ]);

      this.applyData({ favorites, folders });
    } catch (error) {
      console.warn('[Favoris] Lecture impossible :', error.message);

      if (!silent) {
        this.showToast?.(
          `Favoris indisponibles : ${error.message}`,
          'error',
        );
      }
    }
  }

  /**
   * Applique une liste de favoris reçue du processus principal.
   * @param {unknown} list
   * @param {unknown} [folders]
   */
  applyList(list, folders = this.folders) {
    this.applyData({ favorites: list, folders });
  }

  /**
   * Applique les dossiers reçus du processus principal.
   * @param {unknown} folders
   */
  applyFolders(folders) {
    this.folders = this.#normalizeFolders(folders);
    this.#ensureActiveFolder();
    this.render();
  }

  /**
   * Applique une photographie complète des favoris.
   * @param {{favorites?: unknown, folders?: unknown}} data
   */
  applyData({ favorites, folders } = {}) {
    this.folders = this.#normalizeFolders(folders);
    this.favorites = this.#normalizeFavorites(favorites, this.folders);
    this.#ensureActiveFolder();
    this.render();
    this.onChanged?.();
  }

  /**
   * Indique si une URL est en favori.
   * @param {string} url
   * @returns {boolean}
   */
  isFavorite(url) {
    return this.favorites.some((entry) => entry.url === url);
  }

  /**
   * Ajoute ou retire une page des favoris.
   * @param {{url: string, title?: string}} payload
   * @returns {Promise<object>}
   */
  async toggle({ url, title }) {
    const folderId = this.#resolveTargetFolder();
    const result = await this.api.toggleFavorite({ url, title, folderId });

    if (Array.isArray(result?.favorites)) {
      this.applyData({
        favorites: result.favorites,
        folders: result.folders || this.folders,
      });
    } else {
      await this.refresh({ silent: true });
    }

    return result;
  }

  /**
   * Retire un favori.
   * @param {string} favoriteId
   * @returns {Promise<object>}
   */
  async remove(favoriteId) {
    const result = await this.api.removeFavorite(favoriteId);

    if (Array.isArray(result?.favorites)) {
      this.applyData({
        favorites: result.favorites,
        folders: result.folders || this.folders,
      });
    } else {
      await this.refresh({ silent: true });
    }

    return result;
  }

  /**
   * Déplace un favori dans un dossier.
   * @param {string} favoriteId
   * @param {string | null} folderId
   * @returns {Promise<void>}
   */
  async move(favoriteId, folderId) {
    try {
      const result = await this.api.moveFavorite(favoriteId, folderId);

      if (Array.isArray(result?.favorites)) {
        this.applyData({
          favorites: result.favorites,
          folders: this.folders,
        });
      } else {
        await this.refresh({ silent: true });
      }
    } catch (error) {
      this.showToast?.(
        `Déplacement impossible : ${error.message}`,
        'error',
      );
    }
  }

  /**
   * Construit la liste des favoris et la barre de dossiers.
   */
  render() {
    this.#renderFolders();
    this.list.replaceChildren();

    const total = this.favorites.length;
    const visible = this.#getVisibleFavorites();
    const plural = total > 1 ? 's' : '';

    this.count.textContent =
      total === 0
        ? 'Aucun favori'
        : this.activeFolderId === ALL_FOLDERS
          ? `${total} favori${plural}`
          : `${visible.length} sur ${total} favori${plural}`;

    if (total === 0) {
      this.list.append(
        createEmptyState(
          'Aucun favori',
          'Utilisez l’étoile de la barre d’adresse pour conserver une page.',
        ),
      );
      return;
    }

    if (visible.length === 0) {
      this.list.append(
        createEmptyState(
          'Dossier vide',
          'Ajoutez un favori à ce dossier ou déplacez-en un depuis la liste.',
        ),
      );
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const favorite of visible) {
      const item = document.createElement('article');
      item.className = 'favorite-item';

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'favorite-entry';
      openButton.title = favorite.url;

      const title = document.createElement('span');
      title.className = 'favorite-entry__title';
      title.textContent = favorite.title || getHostname(favorite.url);

      const meta = document.createElement('span');
      meta.className = 'favorite-entry__meta';
      meta.textContent = `${getHostname(favorite.url)} · ${this.#formatDate(
        favorite.addedAt,
      )}`;

      const url = document.createElement('span');
      url.className = 'favorite-entry__url';
      url.textContent = favorite.url;

      openButton.append(title, meta, url);
      openButton.addEventListener('click', () => {
        this.dialog.close();
        this.onNavigate(favorite.url);
      });

      const actions = document.createElement('div');
      actions.className = 'favorite-actions';

      const folderSelect = document.createElement('select');
      folderSelect.className = 'favorite-folder-select';
      folderSelect.setAttribute(
        'aria-label',
        `Dossier de ${favorite.title || favorite.url}`,
      );

      const rootOption = document.createElement('option');
      rootOption.value = '';
      rootOption.textContent = 'Sans dossier';
      folderSelect.append(rootOption);

      for (const folder of this.folders) {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.name;
        folderSelect.append(option);
      }

      folderSelect.value = favorite.folderId || '';
      folderSelect.addEventListener('change', () => {
        void this.move(favorite.id, folderSelect.value || null);
      });

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'favorite-remove';
      removeButton.textContent = 'Retirer';
      removeButton.setAttribute(
        'aria-label',
        `Retirer ${favorite.title || favorite.url} des favoris`,
      );
      removeButton.addEventListener('click', async () => {
        removeButton.disabled = true;

        try {
          await this.remove(favorite.id);
          this.showToast?.('Favori retiré.', 'info');
        } catch (error) {
          this.showToast?.(
            `Retrait impossible : ${error.message}`,
            'error',
          );
        } finally {
          removeButton.disabled = false;
        }
      });

      actions.append(folderSelect, removeButton);
      item.append(openButton, actions);
      fragment.append(item);
    }

    this.list.append(fragment);
  }

  /**
   * Construit la liste des dossiers.
   */
  #renderFolders() {
    this.foldersList.replaceChildren();

    const filters = [
      {
        id: ALL_FOLDERS,
        name: 'Tous les favoris',
        count: this.favorites.length,
      },
      {
        id: NO_FOLDER,
        name: 'Sans dossier',
        count: this.favorites.filter((entry) => !entry.folderId).length,
      },
      ...this.folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        count: this.favorites.filter(
          (entry) => entry.folderId === folder.id,
        ).length,
        deletable: true,
      })),
    ];

    for (const filter of filters) {
      const row = document.createElement('div');
      row.className = 'favorite-folder-row';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'favorite-folder-button';
      button.classList.toggle('is-active', this.activeFolderId === filter.id);
      button.setAttribute('aria-pressed', String(this.activeFolderId === filter.id));

      const name = document.createElement('span');
      name.className = 'favorite-folder-button__name';
      name.textContent = filter.name;

      const count = document.createElement('span');
      count.className = 'favorite-folder-button__count';
      count.textContent = String(filter.count);

      button.append(name, count);
      button.addEventListener('click', () => {
        this.activeFolderId = filter.id;
        this.render();
      });

      row.append(button);

      if (filter.deletable) {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'favorite-folder-delete';
        deleteButton.textContent = '×';
        deleteButton.title = `Supprimer le dossier ${filter.name}`;
        deleteButton.setAttribute(
          'aria-label',
          `Supprimer le dossier ${filter.name}`,
        );
        deleteButton.addEventListener('click', async () => {
          await this.#deleteFolder(filter);
        });
        row.append(deleteButton);
      }

      this.foldersList.append(row);
    }
  }

  /**
   * Supprime un dossier après confirmation.
   * @param {{id: string, name: string}} folder
   * @returns {Promise<void>}
   */
  async #deleteFolder(folder) {
    const confirmed = await this.dialogs.askConfirmation({
      title: 'Supprimer le dossier',
      message:
        `Le dossier « ${folder.name} » sera supprimé. ` +
        'Ses favoris resteront disponibles sans dossier.',
      confirmLabel: 'Supprimer',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    try {
      const result = await this.api.deleteFavoriteFolder(folder.id);

      if (this.activeFolderId === folder.id) {
        this.activeFolderId = ALL_FOLDERS;
      }

      this.applyData({
        favorites: result.favorites || this.favorites,
        folders: result.folders || this.folders,
      });
      this.showToast?.('Dossier supprimé.', 'info');
    } catch (error) {
      this.showToast?.(
        `Suppression impossible : ${error.message}`,
        'error',
      );
    }
  }

  /**
   * Crée un dossier à partir du formulaire intégré.
   * @returns {Promise<void>}
   */
  async #createFolder() {
    const name = this.folderNameInput.value.trim();

    if (!name) {
      this.folderNameInput.focus();
      return;
    }

    try {
      const result = await this.api.createFavoriteFolder(name);

      if (Array.isArray(result?.folders)) {
        this.applyFolders(result.folders);
      }

      if (result?.folder?.id) {
        this.activeFolderId = result.folder.id;
        this.render();
      }

      this.folderForm.hidden = true;
      this.folderNameInput.value = '';
      this.showToast?.('Dossier créé.', 'info');
    } catch (error) {
      this.showToast?.(
        `Création impossible : ${error.message}`,
        'error',
      );
    }
  }

  /**
   * Importe des favoris depuis un fichier JSON.
   * @returns {Promise<void>}
   */
  async #import() {
    this.importButton.disabled = true;

    try {
      const result = await this.api.importFavorites();

      if (result?.canceled) {
        return;
      }

      if (!result?.ok) {
        this.showToast?.(
          result?.message || 'Import impossible.',
          'error',
        );
        return;
      }

      this.applyData({
        favorites: result.favorites || this.favorites,
        folders: result.folders || this.folders,
      });

      const favoriteCount = result.importedFavorites || 0;
      const folderCount = result.importedFolders || 0;
      this.showToast?.(
        `Import terminé : ${favoriteCount} favori(s), ${folderCount} dossier(s).`,
        'success',
      );
    } catch (error) {
      this.showToast?.(`Import impossible : ${error.message}`, 'error');
    } finally {
      this.importButton.disabled = false;
    }
  }

  /**
   * Exporte les favoris dans un fichier JSON.
   * @returns {Promise<void>}
   */
  async #export() {
    this.exportButton.disabled = true;

    try {
      const result = await this.api.exportFavorites();

      if (result?.canceled) {
        return;
      }

      if (!result?.ok) {
        this.showToast?.(
          result?.message || 'Export impossible.',
          'error',
        );
        return;
      }

      this.showToast?.('Favoris exportés.', 'success');
    } catch (error) {
      this.showToast?.(`Export impossible : ${error.message}`, 'error');
    } finally {
      this.exportButton.disabled = false;
    }
  }

  /**
   * Branche les actions du panneau.
   */
  #bind() {
    this.newFolderButton.addEventListener('click', () => {
      this.folderForm.hidden = false;
      this.folderNameInput.focus();
    });

    this.folderCancelButton.addEventListener('click', () => {
      this.folderForm.hidden = true;
      this.folderNameInput.value = '';
    });

    this.folderForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.#createFolder();
    });

    this.importButton.addEventListener('click', () => {
      void this.#import();
    });

    this.exportButton.addEventListener('click', () => {
      void this.#export();
    });
  }

  /**
   * Retourne les favoris correspondant au dossier actif.
   * @returns {object[]}
   */
  #getVisibleFavorites() {
    if (this.activeFolderId === ALL_FOLDERS) {
      return this.favorites;
    }

    if (this.activeFolderId === NO_FOLDER) {
      return this.favorites.filter((entry) => !entry.folderId);
    }

    return this.favorites.filter(
      (entry) => entry.folderId === this.activeFolderId,
    );
  }

  /**
   * Retourne le dossier cible lors de l'ajout d'un favori.
   * @returns {string | null}
   */
  #resolveTargetFolder() {
    if (
      this.activeFolderId === ALL_FOLDERS ||
      this.activeFolderId === NO_FOLDER
    ) {
      return null;
    }

    return this.folders.some((folder) => folder.id === this.activeFolderId)
      ? this.activeFolderId
      : null;
  }

  /**
   * Vérifie que le dossier actif existe encore.
   */
  #ensureActiveFolder() {
    if (
      this.activeFolderId === ALL_FOLDERS ||
      this.activeFolderId === NO_FOLDER ||
      this.folders.some((folder) => folder.id === this.activeFolderId)
    ) {
      return;
    }

    this.activeFolderId = ALL_FOLDERS;
  }

  /**
   * Normalise les favoris et rattache les dossiers connus.
   * @param {unknown} list
   * @param {object[]} folders
   * @returns {object[]}
   */
  #normalizeFavorites(list, folders) {
    const folderIds = new Set(folders.map((folder) => folder.id));

    return Array.isArray(list)
      ? list
          .filter((entry) => entry && isHttpUrl(entry.url))
          .map((entry) => ({
            ...entry,
            folderId:
              entry.folderId && folderIds.has(entry.folderId)
                ? entry.folderId
                : null,
          }))
          .sort(
            (a, b) =>
              Date.parse(b.addedAt || 0) - Date.parse(a.addedAt || 0),
          )
      : [];
  }

  /**
   * Normalise les dossiers.
   * @param {unknown} list
   * @returns {object[]}
   */
  #normalizeFolders(list) {
    return Array.isArray(list)
      ? list.filter(
          (folder) =>
            folder &&
            typeof folder.id === 'string' &&
            typeof folder.name === 'string',
        )
      : [];
  }

  /**
   * Formate la date d'ajout.
   * @param {string} value
   * @returns {string}
   */
  #formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'date inconnue';
    }

    return favoriteDateFormatter.format(date);
  }
}

module.exports = { FavoritesPanel };
