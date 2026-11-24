'use strict';

/**
 * Think-Browser — icône commune aux fenêtres.
 *
 * Le fichier PNG est embarqué dans l'application (dossier `assets`) et non
 * dans `build`, qui sert uniquement de ressource de distribution à
 * electron-builder. Il est donc disponible aussi bien depuis les sources que
 * depuis l'archive asar.
 *
 * @module main/appIcon
 */

const path = require('node:path');

const APP_ICON_PATH = path.join(
  __dirname,
  '..',
  '..',
  'assets',
  'icons',
  'app.png',
);

module.exports = { APP_ICON_PATH };
