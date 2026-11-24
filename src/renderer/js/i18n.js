'use strict';

/**
 * Think-Browser — traductions de l'interface hôte.
 *
 * Le renderer ne charge aucun fichier de langue distant. Les traductions sont
 * embarquées et appliquées aux nœuds texte/attributs déjà assemblés. Cette
 * première couverture cible le chrome, les menus et les panneaux principaux ;
 * les chaînes dynamiques peuvent utiliser `t()`.
 *
 * @module renderer/i18n
 */

const {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_KEYS,
} = require('../../shared/extensions');

/**
 * Traductions anglaises indexées par le texte français exact.
 * Les clés sans correspondance restent en français.
 */
const ENGLISH_TEXT = Object.freeze({
  // Chrome et barre d'outils.
  Navigation: 'Navigation',
  Précédent: 'Back',
  'Page précédente': 'Previous page',
  Suivant: 'Forward',
  'Page suivante': 'Next page',
  'Actualiser (Ctrl+R ou F5)': 'Reload (Ctrl+R or F5)',
  'Actualiser la page': 'Reload page',
  "Page d'accueil (Alt+Home)": 'Home page (Alt+Home)',
  "Ouvrir la page d'accueil": 'Open home page',
  'Effacer l’adresse': 'Clear address',
  'Rechercher ou saisir une adresse': 'Search or enter an address',
  'Rechercher ou entrer une URL…': 'Search or enter a URL…',
  Aller: 'Go',
  'Ajouter aux favoris': 'Add to favorites',
  'Ajouter cette page aux favoris': 'Add this page to favorites',
  'Afficher les médias détectés': 'Show detected media',
  'Médias détectés': 'Detected media',
  Menu: 'Menu',
  'Ouvrir le menu principal': 'Open main menu',
  'Navigation privée': 'Private browsing',
  'Fermer l’onglet': 'Close tab',
  'Lecture audio en cours': 'Audio playing',

  // Menu principal.
  'Nouvel onglet': 'New tab',
  'Page d’accueil': 'Home page',
  'Rouvrir l’onglet fermé': 'Reopen closed tab',
  'Nouvelle fenêtre': 'New window',
  'Nouvelle fenêtre privée': 'New private window',
  'Rechercher dans la page': 'Find in page',
  'Zoom avant': 'Zoom in',
  'Zoom arrière': 'Zoom out',
  'Zoom 100 %': 'Zoom 100%',
  Favoris: 'Bookmarks',
  Historique: 'History',
  'Analyser les médias de la page': 'Scan page media',
  Téléchargements: 'Downloads',
  Médiathèque: 'Media library',
  Paramètres: 'Settings',
  Extensions: 'Extensions',
  'DevTools de la page': 'Page DevTools',
  'DevTools de l’application': 'Application DevTools',
  'À propos de Think-Browser': 'About Think-Browser',

  // Paramètres.
  Configuration: 'Configuration',
  'Moteur de recherche': 'Search engine',
  'Utilisé par la barre d’adresse et par la page d’accueil locale.':
    'Used by the address bar and the local home page.',
  'Page locale': 'Local page',
  'Page personnalisée': 'Custom page',
  Ouvrir: 'Open',
  'Adresse de la page personnalisée': 'Custom page address',
  'Démarrage et mémoire': 'Startup and memory',
  'Restaurer la session': 'Restore session',
  'Enregistrer l’historique': 'Save history',
  'Confort de lecture': 'Reading comfort',
  'Zoom par défaut': 'Default zoom',
  'Confidentialité et sécurité': 'Privacy and security',
  'Bloqueur de publicités': 'Ad blocker',
  'Données de navigation': 'Browsing data',
  'Autorisations des sites': 'Site permissions',
  'Dossier de téléchargement': 'Download folder',
  'Choisir…': 'Choose…',
  'Réinitialiser les préférences': 'Reset preferences',
  'Réinitialiser…': 'Reset…',
  Avancé: 'Advanced',
  Terminé: 'Done',
  'Les modifications sont enregistrées automatiquement.':
    'Changes are saved automatically.',

  // Extensions.
  Personnalisation: 'Personalization',
  Sombre: 'Dark',
  Clair: 'Light',
  Minuit: 'Midnight',
  Français: 'French',
  'Extensions internes': 'Built-in extensions',
  'Thèmes Think': 'Think Themes',
  'Langues Think': 'Think Languages',
  'Changer de thème': 'Change theme',
  'Changer de langue': 'Change language',
  'Thème de l’interface': 'Interface theme',
  'Langue de l’interface': 'Interface language',
  'Les extensions embarquées ne chargent aucun code distant. Leur activation est validée par le processus principal.':
    'Built-in extensions never load remote code. Their activation is validated by the main process.',
  'Les changements sont appliqués immédiatement.':
    'Changes are applied immediately.',
  'Extension activée': 'Extension enabled',
  'Extension désactivée': 'Extension disabled',
  Activer: 'Enable',
  Thème: 'Theme',
  Langue: 'Language',
  'Préférence appliquée.': 'Preference applied.',
  'Extensions indisponibles': 'Extensions unavailable',
  'Modification impossible': 'Change failed',
  'Change l’apparence de l’interface hôte sans modifier le contenu des pages web.':
    'Changes the host interface appearance without modifying web page content.',
  'Traduit progressivement le chrome, les menus et les panneaux principaux.':
    'Progressively translates the browser chrome, menus and main panels.',
  'Thème sombre bleu historique de Think-Browser.':
    'Think-Browser’s original dark blue theme.',
  'Interface claire à contraste élevé pour les environnements lumineux.':
    'High-contrast light interface for bright environments.',
  'Variante très sombre aux accents violets.':
    'Very dark variant with violet accents.',
  'Langue par défaut de Think-Browser.':
    'Default Think-Browser language.',
  'Traduction anglaise du chrome et des panneaux principaux.':
    'English translation of the browser chrome and main panels.',

  // Boutons et dialogues.
  Fermer: 'Close',
  Annuler: 'Cancel',
  Confirmer: 'Confirm',
  Enregistrer: 'Save',
  Effacer: 'Clear',
  Réinitialiser: 'Reset',
  'Tout effacer': 'Clear all',
  'À propos': 'About',
  Version: 'Version',
  'Moteur de rendu': 'Rendering engine',
  'Interface Electron': 'Electron interface',
  'Page d’accueil locale': 'Local home page',
});

const MESSAGES = Object.freeze({
  fr: Object.freeze({}),
  en: ENGLISH_TEXT,
});

/**
 * Réduit les espaces et retours à la ligne pour retrouver une clé de
 * traduction, sans modifier l'espacement d'origine du document.
 * @param {string} value
 * @returns {string}
 */
function normalizeMessage(value) {
  return value.replace(/\s+/g, ' ').trim();
}

class I18n {
  /**
   * @param {Document} [documentRoot]
   */
  constructor(documentRoot = document) {
    this.document = documentRoot;
    this.language = DEFAULT_LANGUAGE;
    this.originalText = new WeakMap();
    this.originalAttributes = new WeakMap();
  }

  /**
   * Retourne la langue active.
   * @returns {string}
   */
  getLanguage() {
    return this.language;
  }

  /**
   * Retourne la locale utilisable par `Intl`.
   * @returns {string}
   */
  getLocale() {
    return LANGUAGES[this.language]?.locale || LANGUAGES.fr.locale;
  }

  /**
   * Traduit une chaîne connue.
   * @param {string} value
   * @param {string} [fallback]
   * @returns {string}
   */
  t(value, fallback = value) {
    const dictionary = MESSAGES[this.language] || MESSAGES.fr;
    return dictionary[value] || fallback;
  }

  /**
   * Applique une langue validée à tout le document hôte.
   * @param {unknown} language
   * @returns {string}
   */
  apply(language) {
    const next = LANGUAGE_KEYS.includes(language)
      ? language
      : DEFAULT_LANGUAGE;
    this.language = next;
    this.document.documentElement.lang = next;
    this.document.documentElement.dataset.language = next;

    this.#translateTextNodes();
    this.#translateAttributes();
    return next;
  }

  /**
   * Traduit les nœuds texte statiques, en conservant leurs espaces.
   */
  #translateTextNodes() {
    const dictionary = MESSAGES[this.language] || MESSAGES.fr;
    const walker = this.document.createTreeWalker(
      this.document.body,
      NodeFilter.SHOW_TEXT,
    );
    const nodes = [];

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    for (const node of nodes) {
      const parent = node.parentElement;

      if (
        !parent ||
        parent.closest('script, style, textarea, code, pre') ||
        parent.closest('[data-i18n-ignore]')
      ) {
        continue;
      }

      const raw = node.nodeValue || '';
      const trimmed = raw.trim();

      if (!trimmed) {
        continue;
      }

      const normalized = normalizeMessage(trimmed);
      const previousOriginal = this.originalText.get(node);
      const previousTranslation = previousOriginal
        ? dictionary[normalizeMessage(previousOriginal)]
        : undefined;
      const original =
        previousOriginal &&
        (normalized === normalizeMessage(previousOriginal) ||
          normalized === previousTranslation)
          ? previousOriginal
          : trimmed;

      this.originalText.set(node, original);

      const leading = raw.match(/^\s*/)?.[0] || '';
      const trailing = raw.match(/\s*$/)?.[0] || '';
      const translated =
        this.language === 'fr'
          ? original
          : dictionary[normalizeMessage(original)] || original;

      node.nodeValue = `${leading}${translated}${trailing}`;
    }
  }

  /**
   * Traduit les attributs visibles et accessibles.
   */
  #translateAttributes() {
    const dictionary = MESSAGES[this.language] || MESSAGES.fr;
    const attributes = ['title', 'aria-label', 'placeholder', 'alt'];

    for (const element of this.document.querySelectorAll('*')) {
      if (element.closest('script, style, [data-i18n-ignore]')) {
        continue;
      }

      let originals = this.originalAttributes.get(element);

      if (!originals) {
        originals = new Map();
        this.originalAttributes.set(element, originals);
      }

      for (const attribute of attributes) {
        if (!element.hasAttribute(attribute)) {
          continue;
        }

        const current = element.getAttribute(attribute) || '';
        const previousOriginal = originals.get(attribute);
        const previousTranslation = previousOriginal
          ? dictionary[normalizeMessage(previousOriginal)]
          : undefined;
        const original =
          previousOriginal &&
          (current === previousOriginal || current === previousTranslation)
            ? previousOriginal
            : current;

        originals.set(attribute, original);

        element.setAttribute(
          attribute,
          this.language === 'fr'
            ? original
            : dictionary[normalizeMessage(original)] || original,
        );
      }
    }
  }
}

module.exports = { I18n, ENGLISH_TEXT };
