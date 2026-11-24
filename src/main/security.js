'use strict';

/**
 * Think-Browser — durcissement de la session et des webviews.
 *
 * L'interface hôte est locale et chargée depuis `file://`. Les pages distantes
 * n'ont jamais accès à Node.js : chaque webview est reconfigurée avant son
 * attachement et les permissions sensibles passent par une demande explicite.
 *
 * @module main/security
 */

const { isTabUrl } = require('../shared/utils');
const { configurePermissions } = require('./permissions');

/**
 * Installe les garde-fous de la session, dont les permissions par site.
 * @param {Electron.Session} appSession
 * @param {object} options
 * @param {import('./store').Store} options.store
 * @param {boolean} [options.persistPermissions] `false` pour une partition
 * privée : les décisions restent éphémères.
 */
function configureSessionSecurity(
  appSession,
  { store, persistPermissions = true },
) {
  configurePermissions(appSession, {
    store,
    persistDecisions: persistPermissions,
  });
}

/**
 * Sécurise une webview avant son attachement.
 *
 * @param {Electron.Event} event
 * @param {Electron.WebPreferences} webPreferences
 * @param {Electron.WebviewTag} params
 */
function hardenGuestWebview(event, webPreferences, params) {
  const source = typeof params?.src === 'string' ? params.src : '';

  if (source && source !== 'about:blank' && !isTabUrl(source)) {
    event.preventDefault();
    console.warn('[Webview] Navigation refusée :', source);
    return;
  }

  delete webPreferences.preload;
  delete webPreferences.preloadURL;
  // JavaScript reste indispensable aux applications modernes (YouTube, Gmail,
  // OAuth). Il est activé explicitement pour ne pas dépendre du défaut
  // d'Electron, tout en gardant Node.js hors de la page.
  webPreferences.javascript = true;
  webPreferences.nodeIntegration = false;
  webPreferences.nodeIntegrationInSubFrames = false;
  webPreferences.nodeIntegrationInWorker = false;
  webPreferences.contextIsolation = true;
  // Les webviews n'ont aucun preload : la sandbox Chromium peut rester active
  // même pour les pages qui utilisent le visualiseur PDF.
  webPreferences.sandbox = true;
  webPreferences.webviewTag = false;
  webPreferences.webSecurity = true;
  webPreferences.allowRunningInsecureContent = false;
  // Le visualiseur PDF intégré fait partie des fonctions attendues d'un
  // navigateur de bureau ; il reste exécuté dans le processus invité.
  webPreferences.plugins = true;
}

module.exports = { configureSessionSecurity, hardenGuestWebview };
