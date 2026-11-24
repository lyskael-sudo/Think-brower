'use strict';

/**
 * Think-Browser — menu principal.
 *
 * @module renderer/ui/menu
 */

/**
 * Contrôle le menu déroulant et sa navigation clavier.
 */
class AppMenu {
  /**
   * @param {object} options
   * @param {HTMLButtonElement} options.button
   * @param {HTMLElement} options.menu
   * @param {HTMLElement} options.container
   * @param {(action: string) => void} options.onAction
   * @param {() => void} [options.onBeforeOpen]
   */
  constructor({ button, menu, container, onAction, onBeforeOpen }) {
    this.button = button;
    this.menu = menu;
    this.container = container;
    this.onAction = onAction;
    this.onBeforeOpen = onBeforeOpen;

    this.#setup();
  }

  /**
   * Indique si le menu est ouvert.
   * @returns {boolean}
   */
  get isOpen() {
    return !this.menu.hidden;
  }

  /**
   * Ouvre le menu.
   * @param {{focusFirst?: boolean}} [options]
   */
  open({ focusFirst = false } = {}) {
    if (!this.menu.hidden) {
      return;
    }

    this.onBeforeOpen?.();
    this.menu.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');

    if (focusFirst) {
      this.menu.querySelector('.menu-item')?.focus();
    }
  }

  /**
   * Ferme le menu.
   * @param {{restoreFocus?: boolean}} [options]
   */
  close({ restoreFocus = false } = {}) {
    if (this.menu.hidden) {
      return;
    }

    this.menu.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');

    if (restoreFocus) {
      this.button.focus();
    }
  }

  /**
   * Vérifie si un nœud appartient au menu.
   * @param {Node} node
   * @returns {boolean}
   */
  contains(node) {
    return this.container.contains(node);
  }

  /**
   * Installe les interactions souris et clavier.
   */
  #setup() {
    this.button.addEventListener('click', (event) => {
      if (this.menu.hidden) {
        // `detail === 0` indique une activation au clavier.
        this.open({ focusFirst: event.detail === 0 });
      } else {
        this.close({ restoreFocus: true });
      }
    });

    this.button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return;
      }

      event.preventDefault();

      if (this.menu.hidden) {
        this.open();
      }

      const items = this.menu.querySelectorAll('.menu-item');
      const targetIndex = event.key === 'ArrowDown' ? 0 : items.length - 1;
      items[targetIndex]?.focus();
    });

    this.menu.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const item = event.target.closest('[data-action]');

      if (!item) {
        return;
      }

      this.close();
      this.onAction(item.dataset.action);
    });

    this.menu.addEventListener('keydown', (event) => {
      const items = Array.from(this.menu.querySelectorAll('.menu-item'));
      const currentIndex = items.indexOf(document.activeElement);

      if (event.key === 'Escape') {
        event.preventDefault();
        this.close({ restoreFocus: true });
        return;
      }

      if (event.key === 'Tab') {
        this.close();
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();

        if (items.length === 0) {
          return;
        }

        const offset = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex =
          currentIndex < 0
            ? offset > 0
              ? 0
              : items.length - 1
            : (currentIndex + offset + items.length) % items.length;

        items[nextIndex]?.focus();
        return;
      }

      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const targetIndex = event.key === 'Home' ? 0 : items.length - 1;
        items[targetIndex]?.focus();
      }
    });
  }
}

module.exports = { AppMenu };
