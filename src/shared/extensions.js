'use strict';

/**
 * Think-Browser — catalogue des extensions internes.
 *
 * Le navigateur n'installe pas encore d'extensions arbitraires : ce module
 * décrit uniquement des paquets embarqués et déclaratifs. Aucun manifeste ne
 * contient de code exécutable, d'URL distante ou de permission système. Le
 * processus principal reste la seule source de vérité pour les identifiants,
 * les thèmes et les langues acceptés.
 *
 * @module shared/extensions
 */

/** Identifiants stables des extensions livrées avec l'application. */
const EXTENSION_IDS = Object.freeze({
  THEME: 'think.theme',
  LANGUAGE: 'think.language',
});

/** Thèmes disponibles pour l'interface hôte. */
const THEMES = Object.freeze({
  dark: Object.freeze({
    id: 'dark',
    label: 'Sombre',
    description: 'Thème sombre bleu historique de Think-Browser.',
    colorScheme: 'dark',
  }),
  light: Object.freeze({
    id: 'light',
    label: 'Clair',
    description: 'Interface claire à contraste élevé pour les environnements lumineux.',
    colorScheme: 'light',
  }),
  midnight: Object.freeze({
    id: 'midnight',
    label: 'Minuit',
    description: 'Variante très sombre aux accents violets.',
    colorScheme: 'dark',
  }),
});

/** Langues disponibles pour le chrome de l'interface. */
const LANGUAGES = Object.freeze({
  fr: Object.freeze({
    id: 'fr',
    label: 'Français',
    locale: 'fr-FR',
    description: 'Langue par défaut de Think-Browser.',
  }),
  en: Object.freeze({
    id: 'en',
    label: 'English',
    locale: 'en-US',
    description: 'Traduction anglaise du chrome et des panneaux principaux.',
  }),
});

const THEME_KEYS = Object.freeze(Object.keys(THEMES));
const LANGUAGE_KEYS = Object.freeze(Object.keys(LANGUAGES));

const DEFAULT_THEME = 'dark';
const DEFAULT_LANGUAGE = 'fr';

/**
 * Catalogue public. Les options sont exposées sous forme de tableaux pour
 * éviter de laisser le renderer dépendre de l'ordre des clés d'un objet.
 */
const BUILT_IN_EXTENSIONS = Object.freeze([
  Object.freeze({
    id: EXTENSION_IDS.THEME,
    name: 'Thèmes Think',
    version: '1.0.0',
    type: 'theme',
    description:
      'Change l’apparence de l’interface hôte sans modifier le contenu des pages web.',
    permissions: Object.freeze(['ui.theme']),
    options: Object.freeze(
      THEME_KEYS.map((key) => Object.freeze({ ...THEMES[key] })),
    ),
    defaultOption: DEFAULT_THEME,
  }),
  Object.freeze({
    id: EXTENSION_IDS.LANGUAGE,
    name: 'Langues Think',
    version: '1.0.0',
    type: 'language',
    description:
      'Traduit progressivement le chrome, les menus et les panneaux principaux.',
    permissions: Object.freeze(['ui.language']),
    options: Object.freeze(
      LANGUAGE_KEYS.map((key) => Object.freeze({ ...LANGUAGES[key] })),
    ),
    defaultOption: DEFAULT_LANGUAGE,
  }),
]);

const EXTENSION_KEYS = Object.freeze(
  BUILT_IN_EXTENSIONS.map((extension) => extension.id),
);

const DEFAULT_ENABLED_EXTENSIONS = Object.freeze([
  EXTENSION_IDS.THEME,
  EXTENSION_IDS.LANGUAGE,
]);

/**
 * Vérifie qu'un identifiant correspond à une extension embarquée.
 * @param {unknown} id
 * @returns {boolean}
 */
function isExtensionId(id) {
  return typeof id === 'string' && EXTENSION_KEYS.includes(id);
}

/**
 * Normalise une liste d'extensions activées.
 * @param {unknown} value
 * @param {readonly string[]} [fallback]
 * @returns {string[]}
 */
function normalizeEnabledExtensions(
  value,
  fallback = DEFAULT_ENABLED_EXTENSIONS,
) {
  const source = Array.isArray(value) ? value : fallback;
  const enabled = [];

  for (const id of source) {
    if (isExtensionId(id) && !enabled.includes(id)) {
      enabled.push(id);
    }
  }

  return enabled;
}

/**
 * Indique si une extension est activée dans une liste normalisée.
 * @param {readonly string[]} enabledExtensions
 * @param {string} id
 * @returns {boolean}
 */
function isExtensionEnabled(enabledExtensions, id) {
  return (
    Array.isArray(enabledExtensions) &&
    enabledExtensions.includes(id)
  );
}

module.exports = {
  BUILT_IN_EXTENSIONS,
  DEFAULT_ENABLED_EXTENSIONS,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  EXTENSION_IDS,
  EXTENSION_KEYS,
  LANGUAGES,
  LANGUAGE_KEYS,
  THEMES,
  THEME_KEYS,
  isExtensionEnabled,
  isExtensionId,
  normalizeEnabledExtensions,
};
