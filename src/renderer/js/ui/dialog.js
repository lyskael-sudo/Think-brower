'use strict';

/**
 * Think-Browser — boîtes de dialogue et états vides.
 *
 * @module renderer/ui/dialog
 */

/**
 * Crée un état vide réutilisable pour les listes.
 * @param {string} title
 * @param {string} description
 * @returns {HTMLDivElement}
 */
function createEmptyState(title, description) {
  const wrapper = document.createElement('div');
  wrapper.className = 'empty-state';

  const strong = document.createElement('strong');
  strong.textContent = title;

  const text = document.createElement('span');
  text.textContent = description;

  wrapper.append(strong, text);
  return wrapper;
}

/**
 * Coordonne l'ouverture des modales et la confirmation native.
 */
class DialogController {
  /**
   * @param {object} options
   * @param {HTMLDialogElement} options.confirmDialog
   * @param {HTMLElement} options.confirmTitle
   * @param {HTMLElement} options.confirmMessage
   * @param {HTMLButtonElement} options.confirmCancel
   * @param {HTMLButtonElement} options.confirmAccept
   * @param {() => void} [options.onBeforeOpen]
   */
  constructor({
    confirmDialog,
    confirmTitle,
    confirmMessage,
    confirmCancel,
    confirmAccept,
    onBeforeOpen,
  }) {
    this.confirmDialog = confirmDialog;
    this.confirmTitle = confirmTitle;
    this.confirmMessage = confirmMessage;
    this.confirmCancel = confirmCancel;
    this.confirmAccept = confirmAccept;
    this.onBeforeOpen = onBeforeOpen;

    /** @type {((value: boolean) => void) | null} */
    this.confirmResolver = null;

    this.#setup();
  }

  /**
   * Ouvre une modale en refermant les menus et panneaux flottants.
   * @param {HTMLDialogElement} dialog
   */
  show(dialog) {
    if (!dialog || dialog.open) {
      return;
    }

    this.onBeforeOpen?.();
    dialog.showModal();
  }

  /**
   * Demande une confirmation à l'utilisateur.
   * @param {{title: string, message: string, confirmLabel?: string, danger?: boolean}} options
   * @returns {Promise<boolean>}
   */
  askConfirmation({
    title,
    message,
    confirmLabel = 'Confirmer',
    danger = false,
  }) {
    // Une nouvelle demande remplace proprement une éventuelle précédente.
    if (this.confirmResolver) {
      const previousResolver = this.confirmResolver;
      this.confirmResolver = null;

      if (this.confirmDialog.open) {
        this.confirmDialog.close();
      }

      previousResolver(false);
    }

    this.confirmTitle.textContent = title;
    this.confirmMessage.textContent = message;
    this.confirmAccept.textContent = confirmLabel;
    this.confirmAccept.className = danger
      ? 'button button--danger'
      : 'button button--primary';

    return new Promise((resolve) => {
      this.confirmResolver = resolve;
      this.onBeforeOpen?.();
      this.confirmDialog.showModal();
    });
  }

  /**
   * Termine la confirmation courante.
   * @param {boolean} value
   */
  #settle(value) {
    const resolver = this.confirmResolver;
    this.confirmResolver = null;

    if (this.confirmDialog.open) {
      this.confirmDialog.close();
    }

    if (resolver) {
      resolver(value);
    }
  }

  /**
   * Installe les interactions communes aux modales.
   */
  #setup() {
    document.querySelectorAll('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => {
        const dialog = button.closest('dialog');

        if (dialog) {
          dialog.close();
        }
      });
    });

    document.querySelectorAll('dialog.modal').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        // Un clic sur le backdrop a pour cible le <dialog> lui-même.
        if (event.target === dialog) {
          dialog.close();
        }
      });
    });

    this.confirmAccept.addEventListener('click', () => {
      this.#settle(true);
    });

    this.confirmCancel.addEventListener('click', () => {
      this.#settle(false);
    });

    this.confirmDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.#settle(false);
    });

    this.confirmDialog.addEventListener('close', () => {
      if (this.confirmResolver) {
        const resolver = this.confirmResolver;
        this.confirmResolver = null;
        resolver(false);
      }
    });
  }
}

module.exports = { createEmptyState, DialogController };
