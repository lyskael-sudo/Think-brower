'use strict';

/**
 * Think-Browser — raccourcis clavier.
 *
 * Les raccourcis sont interceptés dans le processus principal afin de
 * fonctionner aussi bien quand l'interface a le focus que lorsqu'une page
 * web invitée le possède.
 *
 * @module main/shortcuts
 */

const { IPC, SHORTCUT_ACTIONS } = require('../shared/constants');

/**
 * Détermine l'action correspondant à une combinaison clavier.
 * @param {Electron.Input} input
 * @returns {string | null}
 */
function getShortcutAction(input) {
  if (
    !input ||
    input.type !== 'keyDown' ||
    input.isAutoRepeat ||
    input.isComposing
  ) {
    return null;
  }

  const key = input.key;
  const lowerKey = typeof key === 'string' ? key.toLowerCase() : '';
  const primaryModifier = input.control || input.meta;
  const isF5 = key === 'F5' || input.code === 'F5';
  const isF12 = key === 'F12' || input.code === 'F12';

  if (
    (primaryModifier &&
      input.shift &&
      !input.alt &&
      lowerKey === 'i') ||
    (!primaryModifier && !input.shift && isF12)
  ) {
    return SHORTCUT_ACTIONS.TOGGLE_PAGE_DEVTOOLS;
  }

  if (
    primaryModifier &&
    !input.shift &&
    !input.alt &&
    lowerKey === 't'
  ) {
    return SHORTCUT_ACTIONS.NEW_TAB;
  }

  if (
    primaryModifier &&
    !input.shift &&
    !input.alt &&
    lowerKey === 'w'
  ) {
    return SHORTCUT_ACTIONS.CLOSE_TAB;
  }

  if (
    (primaryModifier &&
      !input.shift &&
      !input.alt &&
      lowerKey === 'r') ||
    (!primaryModifier && !input.shift && isF5)
  ) {
    return SHORTCUT_ACTIONS.RELOAD;
  }

  if (
    primaryModifier &&
    input.shift &&
    !input.alt &&
    lowerKey === 't'
  ) {
    return SHORTCUT_ACTIONS.REOPEN_TAB;
  }

  if (
    primaryModifier &&
    input.shift &&
    !input.alt &&
    lowerKey === 'p'
  ) {
    return SHORTCUT_ACTIONS.NEW_PRIVATE_WINDOW;
  }

  if (
    primaryModifier &&
    !input.alt &&
    (lowerKey === '+' || lowerKey === '=')
  ) {
    return SHORTCUT_ACTIONS.ZOOM_IN;
  }

  if (primaryModifier && !input.alt && lowerKey === '-') {
    return SHORTCUT_ACTIONS.ZOOM_OUT;
  }

  if (
    primaryModifier &&
    !input.shift &&
    !input.alt &&
    lowerKey === '0'
  ) {
    return SHORTCUT_ACTIONS.ZOOM_RESET;
  }

  if (
    primaryModifier &&
    !input.shift &&
    !input.alt &&
    lowerKey === 'f'
  ) {
    return SHORTCUT_ACTIONS.FIND_IN_PAGE;
  }

  if (
    primaryModifier &&
    input.shift &&
    !input.alt &&
    lowerKey === 'g'
  ) {
    return SHORTCUT_ACTIONS.FIND_PREVIOUS;
  }

  if (
    primaryModifier &&
    !input.shift &&
    !input.alt &&
    lowerKey === 'g'
  ) {
    return SHORTCUT_ACTIONS.FIND_NEXT;
  }

  if (!primaryModifier && !input.alt && key === 'F3') {
    return input.shift
      ? SHORTCUT_ACTIONS.FIND_PREVIOUS
      : SHORTCUT_ACTIONS.FIND_NEXT;
  }

  if (
    primaryModifier &&
    !input.shift &&
    !input.alt &&
    lowerKey === 'l'
  ) {
    return SHORTCUT_ACTIONS.FOCUS_ADDRESS;
  }

  if (!primaryModifier && input.alt && key === 'Home') {
    return SHORTCUT_ACTIONS.HOME_PAGE;
  }

  return null;
}

/**
 * Intercepte les raccourcis navigateur.
 *
 * @param {Electron.Event} event
 * @param {Electron.Input} input
 * @param {Electron.BrowserWindow} browserWindow
 * @param {{onToggleAppDevTools?: (browserWindow: Electron.BrowserWindow) => void}} [options]
 */
function handleBrowserShortcut(
  event,
  input,
  browserWindow,
  { onToggleAppDevTools } = {},
) {
  if (
    !browserWindow ||
    browserWindow.isDestroyed() ||
    !input ||
    input.type !== 'keyDown' ||
    input.isAutoRepeat ||
    input.isComposing
  ) {
    return;
  }

  const primaryModifier = input.control || input.meta;
  const lowerKey =
    typeof input.key === 'string' ? input.key.toLowerCase() : '';

  // DevTools de l'application : Ctrl+Shift+Alt+I.
  if (
    primaryModifier &&
    input.shift &&
    input.alt &&
    lowerKey === 'i'
  ) {
    event.preventDefault();

    if (typeof onToggleAppDevTools === 'function') {
      onToggleAppDevTools(browserWindow);
    }

    return;
  }

  const action = getShortcutAction(input);

  if (!action) {
    return;
  }

  event.preventDefault();

  if (!browserWindow.webContents.isDestroyed()) {
    browserWindow.webContents.send(IPC.SHORTCUT, action);
  }
}

module.exports = { getShortcutAction, handleBrowserShortcut };
