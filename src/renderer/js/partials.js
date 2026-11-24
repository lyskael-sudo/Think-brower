'use strict';

/**
 * Think-Browser — assembleur de fragments HTML.
 *
 * L'interface hôte est découpée en fichiers indépendants pour éviter un
 * document unique de plusieurs centaines de lignes. Les fragments sont lus
 * par le preload depuis une liste fermée, puis insérés à la place de leurs
 * points d'ancrage.
 *
 * @module renderer/partials
 */

const bridge = window.thinkBridge;

if (!bridge) {
  throw new Error(
    'Pont IPC indisponible : le preload du renderer n’a pas été chargé.',
  );
}

/**
 * Charge et insère un fragment HTML.
 * @param {HTMLElement} placeholder
 * @returns {Promise<void>}
 */
async function replacePartial(placeholder) {
  const key = placeholder.dataset.partial || '';

  if (!key) {
    throw new Error('Fragment HTML sans nom.');
  }

  const markup = bridge.readPartial(key);
  const template = document.createElement('template');

  template.innerHTML = markup.trim();

  if (template.content.childElementCount === 0) {
    throw new Error(`Fragment HTML vide : « ${key} ».`);
  }

  placeholder.replaceWith(template.content);
}

/**
 * Assemble tous les fragments de l'interface.
 * @param {Document} [documentRoot]
 * @returns {Promise<void>}
 */
async function loadPartials(documentRoot = document) {
  const placeholders = Array.from(
    documentRoot.querySelectorAll('[data-partial]'),
  );

  if (placeholders.length === 0) {
    throw new Error('Aucun point d’ancrage de fragment HTML trouvé.');
  }

  await Promise.all(placeholders.map(replacePartial));
}

module.exports = { loadPartials };
