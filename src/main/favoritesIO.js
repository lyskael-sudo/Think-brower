'use strict';

/**
 * Think-Browser — import et export des favoris.
 *
 * Le format exporté est un JSON autonome contenant les dossiers et les
 * favoris. Les dialogues natifs restent dans ce module, tandis que la
 * validation et la fusion sont déléguées au store.
 *
 * @module main/favoritesIO
 */

const fs = require('node:fs');
const { dialog } = require('electron');

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

/**
 * Demande un fichier JSON de favoris et retourne son contenu.
 * @param {Electron.BrowserWindow | null} parentWindow
 * @returns {Promise<{canceled: boolean, payload?: unknown, message?: string}>}
 */
async function readFavoritesFile(parentWindow) {
  const options = {
    title: 'Importer des favoris',
    properties: ['openFile'],
    filters: [
      { name: 'Favoris Think-Browser', extensions: ['json'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
  };

  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  try {
    const filePath = result.filePaths[0];
    const stats = await fs.promises.stat(filePath);

    if (stats.size > MAX_IMPORT_BYTES) {
      return {
        canceled: false,
        message: 'Le fichier de favoris est trop volumineux.',
      };
    }

    const content = await fs.promises.readFile(filePath, 'utf8');
    return { canceled: false, payload: JSON.parse(content) };
  } catch (error) {
    return {
      canceled: false,
      message: `Fichier de favoris illisible : ${error.message}`,
    };
  }
}

/**
 * Demande un emplacement et écrit l'export JSON des favoris.
 * @param {Electron.BrowserWindow | null} parentWindow
 * @param {object} data
 * @returns {Promise<{canceled: boolean, filePath?: string, message?: string}>}
 */
async function writeFavoritesFile(parentWindow, data) {
  const options = {
    title: 'Exporter les favoris',
    defaultPath: 'think-browser-favoris.json',
    filters: [{ name: 'Favoris Think-Browser', extensions: ['json'] }],
  };

  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, options)
    : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  try {
    await fs.promises.writeFile(
      result.filePath,
      `${JSON.stringify(data, null, 2)}\n`,
      'utf8',
    );
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    return {
      canceled: false,
      message: `Export impossible : ${error.message}`,
    };
  }
}

module.exports = { readFavoritesFile, writeFavoritesFile };
