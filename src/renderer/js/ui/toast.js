'use strict';

/**
 * Think-Browser — notifications éphémères.
 *
 * @module renderer/ui/toast
 */

/**
 * Affiche un message discret au bas de la fenêtre.
 */
class Toast {
  /**
   * @param {HTMLElement} element
   */
  constructor(element) {
    this.element = element;
    this.timer = null;
  }

  /**
   * @param {string} message
   * @param {'info' | 'success' | 'error'} [variant]
   * @param {number} [duration]
   */
  show(message, variant = 'info', duration = 3200) {
    window.clearTimeout(this.timer);

    this.element.textContent = String(message || '');
    this.element.className = `toast toast--${variant} is-visible`;

    this.timer = window.setTimeout(() => {
      this.element.classList.remove('is-visible');
    }, duration);
  }
}

module.exports = { Toast };
