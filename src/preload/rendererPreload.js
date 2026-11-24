'use strict';

/**
 * Think-Browser — pont sécurisé entre le renderer local et le processus
 * principal.
 *
 * Le renderer n'a plus d'intégration Node.js ni d'accès direct à
 * `ipcRenderer`. Ce preload expose uniquement :
 * - les canaux IPC déclarés dans `shared/constants.js` ;
 * - les événements explicitement autorisés ;
 * - la lecture des fragments HTML internes, depuis une liste fermée.
 *
 * Les pages distantes ne reçoivent jamais ce preload : il est uniquement
 * attaché à la fenêtre hôte locale.
 *
 * @module preload/rendererPreload
 */

const fs = require('node:fs');
const path = require('node:path');
const { contextBridge, ipcRenderer } = require('electron');
const { IPC, IPC_EVENTS } = require('../shared/constants');

const EVENT_CHANNELS = new Set(IPC_EVENTS);
const ACTION_CHANNELS = new Set(
  Object.values(IPC).filter((channel) => !EVENT_CHANNELS.has(channel)),
);
const SEND_CHANNELS = new Set([
  IPC.SESSION_SAVE,
  IPC.WINDOW_NEW,
  IPC.WINDOW_NEW_PRIVATE,
]);

const PARTIALS_DIRECTORY = path.join(__dirname, '..', 'renderer', 'partials');
const PARTIALS = Object.freeze({
  tabbar: 'tabbar.html',
  toolbar: 'toolbar.html',
  browser: 'browser.html',
  'favorites-dialog': 'dialogs/favorites.html',
  'history-dialog': 'dialogs/history.html',
  'downloads-dialog': 'dialogs/downloads.html',
  'media-options-dialog': 'dialogs/media-options.html',
  'link-download-dialog': 'dialogs/link-download.html',
  'library-dialog': 'dialogs/library.html',
  'settings-dialog': 'dialogs/settings.html',
  'extensions-dialog': 'dialogs/extensions.html',
  'about-dialog': 'dialogs/about.html',
  'confirm-dialog': 'dialogs/confirm.html',
});

/**
 * Vérifie qu'un canal d'action est autorisé.
 * @param {unknown} channel
 * @param {Set<string>} allowlist
 * @returns {string}
 */
function assertChannel(channel, allowlist) {
  if (typeof channel !== 'string' || !allowlist.has(channel)) {
    throw new Error('Canal IPC non autorisé.');
  }

  return channel;
}

const bridge = {
  /**
   * Appelle un handler IPC et attend sa réponse.
   * @param {string} channel
   * @param {...unknown} args
   * @returns {Promise<unknown>}
   */
  invoke(channel, ...args) {
    return ipcRenderer.invoke(assertChannel(channel, ACTION_CHANNELS), ...args);
  },

  /**
   * Envoie un message sans réponse.
   * @param {string} channel
   * @param {...unknown} args
   */
  send(channel, ...args) {
    ipcRenderer.send(assertChannel(channel, SEND_CHANNELS), ...args);
  },

  /**
   * S'abonne à un événement du processus principal.
   * @param {string} channel
   * @param {(payload: unknown) => void} listener
   * @returns {() => void}
   */
  on(channel, listener) {
    assertChannel(channel, EVENT_CHANNELS);

    if (typeof listener !== 'function') {
      throw new Error('Le listener IPC doit être une fonction.');
    }

    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);

    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },

  /**
   * Lit un fragment HTML interne autorisé.
   * @param {string} name
   * @returns {string}
   */
  readPartial(name) {
    if (typeof name !== 'string' || !Object.hasOwn(PARTIALS, name)) {
      throw new Error('Fragment HTML non autorisé.');
    }

    const filePath = path.join(PARTIALS_DIRECTORY, PARTIALS[name]);
    return fs.readFileSync(filePath, 'utf8');
  },
};

contextBridge.exposeInMainWorld('thinkBridge', Object.freeze(bridge));
