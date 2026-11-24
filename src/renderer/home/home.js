'use strict';

/**
 * Think-Browser — comportement de la page d'accueil locale.
 *
 * Ce script s'exécute dans une webview isolée, sans accès à Node.js ni à
 * l'API Electron. Il ne fait que configurer le formulaire de recherche et
 * afficher l'heure locale.
 *
 * @module renderer/home
 */

/** Configuration minimale des moteurs utilisés par la page d'accueil. */
const ENGINES = Object.freeze({
  google: Object.freeze({
    label: 'Google',
    endpoint: 'https://www.google.com/search',
  }),
  duckduckgo: Object.freeze({
    label: 'DuckDuckGo',
    endpoint: 'https://duckduckgo.com/',
  }),
  bing: Object.freeze({
    label: 'Bing',
    endpoint: 'https://www.bing.com/search',
  }),
});

/**
 * Retourne le moteur demandé dans l'URL, avec un repli sûr sur Google.
 * @returns {{key: string, label: string, endpoint: string}}
 */
function readEngine() {
  try {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('engine') || 'google';
    const key = Object.prototype.hasOwnProperty.call(ENGINES, requested)
      ? requested
      : 'google';

    return { key, ...ENGINES[key] };
  } catch {
    return { key: 'google', ...ENGINES.google };
  }
}

/**
 * Retourne une salutation adaptée à l'heure locale.
 * @param {number} hour
 * @returns {string}
 */
function getGreeting(hour) {
  if (hour < 6) {
    return 'Bonne nuit';
  }

  if (hour < 12) {
    return 'Bonjour';
  }

  if (hour < 18) {
    return 'Bon après-midi';
  }

  return 'Bonsoir';
}

/**
 * Met à jour l'horloge de la page.
 */
function updateClock() {
  const now = new Date();
  const timeElement = document.getElementById('clock-time');
  const dateElement = document.getElementById('clock-date');
  const greetingElement = document.getElementById('greeting');

  if (timeElement) {
    timeElement.textContent = new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(now);
  }

  if (dateElement) {
    dateElement.textContent = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(now);
  }

  if (greetingElement) {
    greetingElement.textContent = getGreeting(now.getHours());
  }
}

/**
 * Configure le formulaire de recherche avec le moteur actif.
 */
function setupSearchForm() {
  const form = document.getElementById('home-search-form');
  const input = document.getElementById('home-search-input');
  const label = document.getElementById('engine-label');
  const engine = readEngine();

  if (!form || !input) {
    return;
  }

  form.action = engine.endpoint;

  if (label) {
    label.textContent = engine.label;
  }

  input.placeholder = `Rechercher sur ${engine.label}…`;
  form.dataset.engine = engine.key;

  form.addEventListener('submit', (event) => {
    if (!input.value.trim()) {
      event.preventDefault();
      input.focus();
    }
  });
}

/**
 * Démarre les éléments dynamiques de la page d'accueil.
 */
function initialize() {
  try {
    setupSearchForm();
    updateClock();
    window.setInterval(updateClock, 30_000);
  } catch (error) {
    console.warn('[Accueil] Initialisation partielle :', error.message);
  }
}

initialize();
