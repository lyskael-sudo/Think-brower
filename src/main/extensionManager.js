'use strict';

/**
 * Think-Browser — gestionnaire des extensions internes.
 *
 * Ce gestionnaire ne charge aucun module tiers et n'exécute aucun code
 * provenant d'une extension. Il valide les identifiants contre le catalogue
 * embarqué, met à jour les paramètres persistés et renvoie un état prêt pour
 * le renderer.
 *
 * @module main/extensionManager
 */

const {
  BUILT_IN_EXTENSIONS,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  EXTENSION_IDS,
  LANGUAGES,
  LANGUAGE_KEYS,
  THEMES,
  THEME_KEYS,
  isExtensionEnabled,
  isExtensionId,
  normalizeEnabledExtensions,
} = require('../shared/extensions');

/**
 * Gère l'activation des extensions et leurs options.
 */
class ExtensionManager {
  /**
   * @param {object} options
   * @param {import('./store').Store} options.store
   */
  constructor({ store }) {
    if (!store) {
      throw new Error('Le gestionnaire d’extensions requiert le Store.');
    }

    this.store = store;
  }

  /**
   * Retourne le catalogue avec l'état courant.
   * @returns {object}
   */
  getState() {
    const settings = this.store.getSettings();
    const enabledExtensions = normalizeEnabledExtensions(
      settings.enabledExtensions,
    );

    return {
      extensions: BUILT_IN_EXTENSIONS.map((extension) => ({
        ...extension,
        enabled: isExtensionEnabled(enabledExtensions, extension.id),
      })),
      enabledExtensions: [...enabledExtensions],
      theme: THEME_KEYS.includes(settings.theme)
        ? settings.theme
        : DEFAULT_THEME,
      language: LANGUAGE_KEYS.includes(settings.language)
        ? settings.language
        : DEFAULT_LANGUAGE,
      themes: THEME_KEYS.map((id) => ({ ...THEMES[id] })),
      languages: LANGUAGE_KEYS.map((id) => ({ ...LANGUAGES[id] })),
    };
  }

  /**
   * Active ou désactive une extension embarquée.
   * @param {unknown} id
   * @param {unknown} enabled
   * @returns {Promise<object>}
   */
  async setEnabled(id, enabled) {
    if (!isExtensionId(id)) {
      throw new Error('Extension inconnue.');
    }

    if (typeof enabled !== 'boolean') {
      throw new Error('État d’extension invalide.');
    }

    const settings = this.store.getSettings();
    const current = normalizeEnabledExtensions(settings.enabledExtensions);
    const alreadyEnabled = current.includes(id);

    if (alreadyEnabled === enabled) {
      return this.getState();
    }

    const next = enabled
      ? [...current, id]
      : current.filter((extensionId) => extensionId !== id);
    const patch = { enabledExtensions: next };

    if (!enabled && id === EXTENSION_IDS.THEME) {
      patch.theme = DEFAULT_THEME;
    }

    if (!enabled && id === EXTENSION_IDS.LANGUAGE) {
      patch.language = DEFAULT_LANGUAGE;
    }

    await this.store.updateSettings(patch);
    return this.getState();
  }

  /**
   * Change le thème actif. L'extension Thèmes doit être activée.
   * @param {unknown} theme
   * @returns {Promise<object>}
   */
  async setTheme(theme) {
    if (!THEME_KEYS.includes(theme)) {
      throw new Error('Thème inconnu.');
    }

    const settings = this.store.getSettings();

    if (
      !isExtensionEnabled(settings.enabledExtensions, EXTENSION_IDS.THEME)
    ) {
      throw new Error('Activez d’abord l’extension Thèmes.');
    }

    await this.store.updateSettings({ theme });
    return this.getState();
  }

  /**
   * Change la langue de l'interface. L'extension Langues doit être activée.
   * @param {unknown} language
   * @returns {Promise<object>}
   */
  async setLanguage(language) {
    if (!LANGUAGE_KEYS.includes(language)) {
      throw new Error('Langue inconnue.');
    }

    const settings = this.store.getSettings();

    if (
      !isExtensionEnabled(settings.enabledExtensions, EXTENSION_IDS.LANGUAGE)
    ) {
      throw new Error('Activez d’abord l’extension Langues.');
    }

    await this.store.updateSettings({ language });
    return this.getState();
  }
}

module.exports = { ExtensionManager };
