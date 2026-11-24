'use strict';

/**
 * Think-Browser — émetteur d'événements léger pour le renderer.
 *
 * Le renderer durci n'a plus accès à `node:events`. Cette implémentation
 * couvre uniquement les opérations utilisées par les composants de
 * l'interface (`on`, `once`, `off`, `removeAllListeners`, `emit`) sans
 * dépendance Node.js.
 *
 * @module renderer/eventEmitter
 */
class EventEmitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  /**
   * Abonne un auditeur.
   * @param {string} event
   * @param {Function} listener
   * @returns {this}
   */
  on(event, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Le listener doit être une fonction.');
    }

    const listeners = this.listeners.get(event) || new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  /**
   * Abonne un auditeur pour un seul événement.
   * @param {string} event
   * @param {Function} listener
   * @returns {this}
   */
  once(event, listener) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      listener.apply(this, args);
    };

    wrapper.original = listener;
    return this.on(event, wrapper);
  }

  /**
   * Retire un auditeur.
   * @param {string} event
   * @param {Function} listener
   * @returns {this}
   */
  off(event, listener) {
    const listeners = this.listeners.get(event);

    if (!listeners) {
      return this;
    }

    for (const candidate of listeners) {
      if (candidate === listener || candidate.original === listener) {
        listeners.delete(candidate);
      }
    }

    if (listeners.size === 0) {
      this.listeners.delete(event);
    }

    return this;
  }

  /**
   * Alias de `off`, conservé pour les appels existants.
   * @param {string} event
   * @param {Function} listener
   * @returns {this}
   */
  removeListener(event, listener) {
    return this.off(event, listener);
  }

  /**
   * Retire tous les auditeurs, ou ceux d'un événement précis.
   * @param {string} [event]
   * @returns {this}
   */
  removeAllListeners(event) {
    if (typeof event === 'string') {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }

    return this;
  }

  /**
   * Émet un événement. Une erreur dans un auditeur ne bloque pas les autres.
   * @param {string} event
   * @param {...unknown} args
   * @returns {boolean}
   */
  emit(event, ...args) {
    const listeners = this.listeners.get(event);

    if (!listeners || listeners.size === 0) {
      return false;
    }

    for (const listener of Array.from(listeners)) {
      try {
        listener.apply(this, args);
      } catch (error) {
        console.warn(`[Événement] Auditeur « ${event} » en erreur :`, error);
      }
    }

    return true;
  }
}

module.exports = { EventEmitter };
