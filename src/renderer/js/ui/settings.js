'use strict';

/**
 * Think-Browser — panneau Paramètres.
 *
 * Le composant gère le formulaire et les retours visuels. Les écritures
 * disque et le cycle de vie du bloqueur restent dans le processus principal.
 *
 * @module renderer/ui/settings
 */

const {
  DEFAULT_SETTINGS,
  HOME_PAGE_MODES,
  SEARCH_ENGINE_KEYS,
  SEARCH_ENGINES,
  SETTINGS_STATUS_TIMEOUT,
} = require('../../../shared/constants');
const { isHttpUrl } = require('../../../shared/utils');

const DEFAULT_STATUS =
  'Les modifications sont enregistrées automatiquement.';

/**
 * Contrôle la modale de paramètres.
 */
class SettingsPanel {
  /**
   * @param {object} options
   * @param {HTMLDialogElement} options.dialog
   * @param {object} options.elements
   * @param {HTMLSelectElement} options.elements.searchEngineSelect
   * @param {HTMLSelectElement} options.elements.homepageModeSelect
   * @param {HTMLElement} options.elements.homepageCustomRow
   * @param {HTMLInputElement} options.elements.homepageUrlInput
   * @param {HTMLButtonElement} options.elements.homepageSaveButton
   * @param {HTMLButtonElement} options.elements.openHomeButton
   * @param {HTMLInputElement} options.elements.restoreSessionToggle
   * @param {HTMLInputElement} options.elements.saveHistoryToggle
   * @param {HTMLSelectElement} options.elements.defaultZoomSelect
   * @param {HTMLInputElement} options.elements.adblockToggle
   * @param {HTMLInputElement} options.elements.downloadFolderInput
   * @param {HTMLButtonElement} options.elements.chooseFolderButton
   * @param {HTMLButtonElement} options.elements.clearDataButton
   * @param {HTMLButtonElement} options.elements.resetPermissionsButton
   * @param {HTMLButtonElement} options.elements.resetSettingsButton
   * @param {HTMLElement} options.elements.status
   * @param {object} options.api
   * @param {import('./dialog').DialogController} options.dialogs
   * @param {(settings: object) => void} [options.onSettingsChanged]
   * @param {() => void} [options.onOpenHome]
   */
  constructor({
    dialog,
    elements,
    api,
    dialogs,
    onSettingsChanged,
    onOpenHome,
  }) {
    this.dialog = dialog;
    this.elements = elements;
    this.api = api;
    this.dialogs = dialogs;
    this.onSettingsChanged = onSettingsChanged;
    this.onOpenHome = onOpenHome;

    this.settings = {
      ...DEFAULT_SETTINGS,
      downloadDir: '',
    };

    this.statusTimer = null;
    this.#setup();
    this.#syncForm();
  }

  /**
   * Applique une photographie des paramètres au formulaire.
   * @param {object} settings
   */
  applySettings(settings) {
    if (!settings || typeof settings !== 'object') {
      return;
    }

    this.settings = {
      ...this.settings,
      ...settings,
    };

    this.#syncForm();
  }

  /**
   * Retourne une copie des paramètres connus du panneau.
   * @returns {object}
   */
  getSettings() {
    return { ...this.settings };
  }

  /**
   * Recharge les paramètres depuis le processus principal.
   * @returns {Promise<object>}
   */
  async refresh() {
    try {
      const settings = await this.api.getSettings();
      this.applySettings(settings);
    } catch (error) {
      console.warn('[Paramètres] Lecture impossible :', error.message);
      this.setStatus(
        `Lecture impossible : ${error.message}`,
        'error',
      );
    }

    return this.getSettings();
  }

  /**
   * Ouvre le panneau après synchronisation.
   * @returns {Promise<void>}
   */
  async open() {
    await this.refresh();
    this.setStatus(DEFAULT_STATUS);
    this.dialogs.show(this.dialog);
  }

  /**
   * Affiche un message de statut temporaire.
   * @param {string} message
   * @param {'info' | 'success' | 'error'} [variant]
   */
  setStatus(message, variant = 'info') {
    const status = this.elements.status;

    if (!status) {
      return;
    }

    window.clearTimeout(this.statusTimer);
    status.textContent = message;
    status.className = `settings-status settings-status--${variant}`;

    this.statusTimer = window.setTimeout(() => {
      status.textContent = DEFAULT_STATUS;
      status.className = 'settings-status';
    }, SETTINGS_STATUS_TIMEOUT);
  }

  /**
   * Enregistre un patch et synchronise les différents consommateurs.
   * @param {Record<string, unknown>} patch
   * @returns {Promise<object>}
   */
  async #save(patch) {
    const updated = await this.api.updateSettings(patch);

    if (updated && typeof updated === 'object') {
      this.applySettings(updated);
      this.onSettingsChanged?.(updated);
    }

    return updated;
  }

  /**
   * Synchronise les contrôles avec l'état courant.
   */
  #syncForm() {
    const {
      searchEngineSelect,
      homepageModeSelect,
      homepageCustomRow,
      homepageUrlInput,
      homepageSaveButton,
      restoreSessionToggle,
      saveHistoryToggle,
      defaultZoomSelect,
      adblockToggle,
      downloadFolderInput,
    } = this.elements;

    if (SEARCH_ENGINE_KEYS.includes(this.settings.searchEngine)) {
      searchEngineSelect.value = this.settings.searchEngine;
    }

    const homePageMode = Object.values(HOME_PAGE_MODES).includes(
      this.settings.homePageMode,
    )
      ? this.settings.homePageMode
      : HOME_PAGE_MODES.BUILTIN;

    homepageModeSelect.value = homePageMode;
    homepageCustomRow.hidden = homePageMode !== HOME_PAGE_MODES.CUSTOM;
    homepageUrlInput.value = this.settings.homePageUrl || '';
    homepageSaveButton.disabled = !isHttpUrl(homepageUrlInput.value.trim());

    restoreSessionToggle.checked = this.settings.restoreSession !== false;
    saveHistoryToggle.checked = this.settings.saveHistory !== false;

    const zoomValue = String(
      Number(this.settings.defaultZoom) || DEFAULT_SETTINGS.defaultZoom,
    );

    if (
      !Array.from(defaultZoomSelect.options).some(
        (option) => option.value === zoomValue,
      )
    ) {
      const option = document.createElement('option');
      option.value = zoomValue;
      option.textContent = `${Math.round(Number(zoomValue) * 100)} %`;
      defaultZoomSelect.append(option);
    }

    defaultZoomSelect.value = zoomValue;
    adblockToggle.checked = Boolean(this.settings.adBlockEnabled);
    downloadFolderInput.value = this.settings.downloadDir || '';
    downloadFolderInput.title = this.settings.downloadDir || '';
  }

  /**
   * Enregistre la page d'accueil personnalisée après validation.
   * @returns {Promise<void>}
   */
  async #saveCustomHomePage() {
    const { homepageUrlInput, homepageSaveButton } = this.elements;
    const url = homepageUrlInput.value.trim();

    if (!isHttpUrl(url)) {
      this.setStatus(
        'Saisissez une adresse HTTP(S) valide, par exemple https://exemple.com/.',
        'error',
      );
      homepageUrlInput.focus();
      return;
    }

    homepageSaveButton.disabled = true;

    try {
      await this.#save({
        homePageMode: HOME_PAGE_MODES.CUSTOM,
        homePageUrl: url,
      });
      this.setStatus('Page d’accueil personnalisée enregistrée.', 'success');
    } catch (error) {
      this.setStatus(
        `Modification impossible : ${error.message}`,
        'error',
      );
    } finally {
      homepageSaveButton.disabled = !isHttpUrl(
        homepageUrlInput.value.trim(),
      );
    }
  }

  /**
   * Installe les interactions du panneau.
   */
  #setup() {
    const {
      searchEngineSelect,
      homepageModeSelect,
      homepageCustomRow,
      homepageUrlInput,
      homepageSaveButton,
      openHomeButton,
      restoreSessionToggle,
      saveHistoryToggle,
      defaultZoomSelect,
      adblockToggle,
      chooseFolderButton,
      clearDataButton,
      resetPermissionsButton,
      resetSettingsButton,
    } = this.elements;

    searchEngineSelect.addEventListener('change', async () => {
      const previousValue = this.settings.searchEngine;
      const nextValue = searchEngineSelect.value;

      searchEngineSelect.disabled = true;

      try {
        await this.#save({ searchEngine: nextValue });
        const label = SEARCH_ENGINES[nextValue]?.label || nextValue;
        this.setStatus(`Moteur de recherche : ${label}.`, 'success');
      } catch (error) {
        searchEngineSelect.value = previousValue;
        this.setStatus(
          `Modification impossible : ${error.message}`,
          'error',
        );
      } finally {
        searchEngineSelect.disabled = false;
      }
    });

    homepageModeSelect.addEventListener('change', async () => {
      const nextValue = homepageModeSelect.value;

      if (nextValue === HOME_PAGE_MODES.BUILTIN) {
        homepageCustomRow.hidden = true;

        try {
          await this.#save({ homePageMode: HOME_PAGE_MODES.BUILTIN });
          this.setStatus('Page d’accueil locale activée.', 'success');
        } catch (error) {
          this.setStatus(
            `Modification impossible : ${error.message}`,
            'error',
          );
          this.#syncForm();
        }

        return;
      }

      homepageCustomRow.hidden = false;
      homepageSaveButton.disabled = !isHttpUrl(
        homepageUrlInput.value.trim(),
      );

      if (isHttpUrl(this.settings.homePageUrl)) {
        try {
          await this.#save({ homePageMode: HOME_PAGE_MODES.CUSTOM });
          this.setStatus(
            'Page d’accueil personnalisée activée.',
            'success',
          );
        } catch (error) {
          this.setStatus(
            `Modification impossible : ${error.message}`,
            'error',
          );
          this.#syncForm();
        }
        return;
      }

      this.setStatus(
        'Saisissez une adresse HTTP(S), puis cliquez sur Enregistrer.',
        'info',
      );
      homepageUrlInput.focus();
    });

    homepageUrlInput.addEventListener('input', () => {
      homepageSaveButton.disabled = !isHttpUrl(
        homepageUrlInput.value.trim(),
      );
    });

    homepageUrlInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void this.#saveCustomHomePage();
      }
    });

    homepageSaveButton.addEventListener('click', () => {
      void this.#saveCustomHomePage();
    });

    openHomeButton.addEventListener('click', () => {
      this.onOpenHome?.();
    });

    restoreSessionToggle.addEventListener('change', async () => {
      const nextValue = restoreSessionToggle.checked;
      restoreSessionToggle.disabled = true;

      try {
        await this.#save({ restoreSession: nextValue });
        this.setStatus(
          nextValue
            ? 'Restauration de session activée.'
            : 'Restauration de session désactivée.',
          'success',
        );
      } catch (error) {
        restoreSessionToggle.checked = !nextValue;
        this.setStatus(
          `Modification impossible : ${error.message}`,
          'error',
        );
      } finally {
        restoreSessionToggle.disabled = false;
      }
    });

    saveHistoryToggle.addEventListener('change', async () => {
      const nextValue = saveHistoryToggle.checked;
      saveHistoryToggle.disabled = true;

      try {
        await this.#save({ saveHistory: nextValue });
        this.setStatus(
          nextValue
            ? 'Enregistrement de l’historique activé.'
            : 'Enregistrement de l’historique désactivé.',
          'success',
        );
      } catch (error) {
        saveHistoryToggle.checked = !nextValue;
        this.setStatus(
          `Modification impossible : ${error.message}`,
          'error',
        );
      } finally {
        saveHistoryToggle.disabled = false;
      }
    });

    defaultZoomSelect.addEventListener('change', async () => {
      const previousValue = this.settings.defaultZoom;
      const nextValue = Number(defaultZoomSelect.value);
      defaultZoomSelect.disabled = true;

      try {
        await this.#save({ defaultZoom: nextValue });
        this.setStatus(
          `Zoom par défaut : ${Math.round(nextValue * 100)} %.`,
          'success',
        );
      } catch (error) {
        defaultZoomSelect.value = String(previousValue);
        this.setStatus(
          `Modification impossible : ${error.message}`,
          'error',
        );
      } finally {
        defaultZoomSelect.disabled = false;
      }
    });

    adblockToggle.addEventListener('change', async () => {
      const nextValue = adblockToggle.checked;
      adblockToggle.disabled = true;

      try {
        await this.#save({ adBlockEnabled: nextValue });
        this.setStatus(
          nextValue
            ? 'Bloqueur de publicités activé.'
            : 'Bloqueur de publicités désactivé.',
          'success',
        );
      } catch (error) {
        adblockToggle.checked = !nextValue;
        this.setStatus(
          `Modification impossible : ${error.message}`,
          'error',
        );
      } finally {
        adblockToggle.disabled = false;
      }
    });

    chooseFolderButton.addEventListener('click', async () => {
      chooseFolderButton.disabled = true;

      try {
        const result = await this.api.chooseDownloadDir();

        if (result?.settings) {
          this.applySettings(result.settings);
          this.onSettingsChanged?.(result.settings);
        }

        if (result && !result.canceled) {
          this.setStatus('Dossier de téléchargement mis à jour.', 'success');
        }
      } catch (error) {
        this.setStatus(
          `Dossier non modifié : ${error.message}`,
          'error',
        );
      } finally {
        chooseFolderButton.disabled = false;
      }
    });

    clearDataButton.addEventListener('click', async () => {
      const confirmed = await this.dialogs.askConfirmation({
        title: 'Effacer les données de navigation ?',
        message:
          'Les cookies, le cache, les stockages locaux et les service workers seront supprimés. Votre historique et vos favoris sont conservés.',
        confirmLabel: 'Effacer les données',
        danger: true,
      });

      if (!confirmed) {
        return;
      }

      clearDataButton.disabled = true;

      try {
        const result = await this.api.clearBrowsingData();

        if (!result?.ok) {
          this.setStatus(
            result?.message || 'Effacement impossible.',
            'error',
          );
          return;
        }

        this.setStatus('Données de navigation effacées.', 'success');
      } catch (error) {
        this.setStatus(`Effacement impossible : ${error.message}`, 'error');
      } finally {
        clearDataButton.disabled = false;
      }
    });

    resetPermissionsButton.addEventListener('click', async () => {
      const confirmed = await this.dialogs.askConfirmation({
        title: 'Réinitialiser les autorisations ?',
        message:
          'Les choix mémorisés pour la caméra, le microphone, la géolocalisation, les notifications et les autres permissions sensibles seront oubliés.',
        confirmLabel: 'Réinitialiser',
        danger: true,
      });

      if (!confirmed) {
        return;
      }

      resetPermissionsButton.disabled = true;

      try {
        const result = await this.api.resetSitePermissions();

        if (!result?.ok) {
          this.setStatus(
            result?.message || 'Réinitialisation impossible.',
            'error',
          );
          return;
        }

        this.setStatus('Autorisations des sites réinitialisées.', 'success');
      } catch (error) {
        this.setStatus(
          `Réinitialisation impossible : ${error.message}`,
          'error',
        );
      } finally {
        resetPermissionsButton.disabled = false;
      }
    });

    resetSettingsButton.addEventListener('click', async () => {
      const confirmed = await this.dialogs.askConfirmation({
        title: 'Réinitialiser les préférences ?',
        message:
          'Le moteur de recherche, la page d’accueil, le zoom, la restauration de session, l’historique et AdBlock retrouveront leur valeur par défaut. Vos fichiers, favoris et l’historique existant sont conservés.',
        confirmLabel: 'Réinitialiser',
        danger: true,
      });

      if (!confirmed) {
        return;
      }

      resetSettingsButton.disabled = true;

      try {
        await this.#save({
          searchEngine: DEFAULT_SETTINGS.searchEngine,
          adBlockEnabled: DEFAULT_SETTINGS.adBlockEnabled,
          homePageMode: DEFAULT_SETTINGS.homePageMode,
          homePageUrl: DEFAULT_SETTINGS.homePageUrl,
          restoreSession: DEFAULT_SETTINGS.restoreSession,
          saveHistory: DEFAULT_SETTINGS.saveHistory,
          defaultZoom: DEFAULT_SETTINGS.defaultZoom,
        });
        this.setStatus('Préférences réinitialisées.', 'success');
      } catch (error) {
        this.setStatus(
          `Réinitialisation impossible : ${error.message}`,
          'error',
        );
      } finally {
        resetSettingsButton.disabled = false;
      }
    });

    this.dialog.addEventListener('close', () => {
      window.clearTimeout(this.statusTimer);
      this.#syncForm();
      this.setStatus(DEFAULT_STATUS);
    });
  }
}

module.exports = { SettingsPanel };
