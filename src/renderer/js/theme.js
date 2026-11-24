'use strict';

/**
 * Think-Browser — application du thème de l'interface hôte.
 *
 * Le thème ne touche jamais au contenu des webviews : il ne change que les
 * variables CSS du document local. Les valeurs autorisées proviennent du
 * catalogue partagé, jamais d'une chaîne arbitraire envoyée par une page.
 *
 * @module renderer/theme
 */

const {
  DEFAULT_THEME,
  THEMES,
  THEME_KEYS,
} = require('../../shared/extensions');

class ThemeManager {
  /**
   * @param {HTMLElement} [root]
   */
  constructor(root = document.documentElement) {
    this.root = root;
    this.theme = DEFAULT_THEME;
  }

  /**
   * Applique un thème validé.
   * @param {unknown} theme
   * @returns {string}
   */
  apply(theme) {
    const next = THEME_KEYS.includes(theme) ? theme : DEFAULT_THEME;
    this.theme = next;
    this.root.dataset.theme = next;
    this.root.style.colorScheme = THEMES[next].colorScheme;

    const themeColor = document.querySelector('meta[name="theme-color"]');

    if (themeColor) {
      themeColor.content =
        next === 'light' ? '#eef2f7' : next === 'midnight' ? '#080611' : '#0b0f14';
    }

    return next;
  }
}

module.exports = { ThemeManager };
