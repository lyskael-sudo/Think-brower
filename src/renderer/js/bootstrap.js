'use strict';

/**
 * Think-Browser — démarrage du renderer.
 *
 * Assemble d'abord les fragments HTML, puis charge l'application. Ce fichier
 * reste volontairement minimal : il garantit que le DOM complet existe avant
 * la construction des composants.
 *
 * @module renderer/bootstrap
 */

// Les scripts injectés par index.html sont résolus depuis le document hôte,
// et non depuis le dossier de ce fichier.
const { loadPartials } = require('./partials');

/**
 * Affiche une erreur de démarrage dans la fenêtre.
 * @param {Error} error
 */
function showBootError(error) {
  const banner = document.getElementById('boot-error');

  if (!banner) {
    return;
  }

  banner.hidden = false;
  banner.textContent = `Interface indisponible : ${error.message}`;
}

/**
 * Assemble l'interface puis lance le navigateur.
 * @returns {Promise<void>}
 */
async function bootstrapRenderer() {
  try {
    await loadPartials();
    require('./app');
  } catch (error) {
    console.error('[Interface] Démarrage impossible :', error);
    showBootError(error);
  }
}

void bootstrapRenderer();
