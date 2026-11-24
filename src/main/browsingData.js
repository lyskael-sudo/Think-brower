'use strict';

/**
 * Think-Browser — effacement des données de navigation.
 *
 * @module main/browsingData
 */

/**
 * Supprime cookies, cache, stockages locaux et service workers de la session.
 * @param {Electron.Session} appSession
 * @returns {Promise<void>}
 */
async function clearBrowsingData(appSession) {
  await appSession.clearCache();
  await appSession.clearStorageData({
    storages: [
      'cookies',
      'localstorage',
      'indexdb',
      'serviceworkers',
      'cachestorage',
    ],
  });
  await appSession.clearAuthCache();
  await appSession.clearHostResolverCache();
}

module.exports = { clearBrowsingData };
