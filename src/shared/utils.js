'use strict';

/**
 * Think-Browser — utilitaires partagés.
 *
 * Fonctions pures (ou dépendant uniquement de Node standard) utilisées par le
 * processus principal et le renderer : validation d'URL, résolution de la
 * saisie de la barre d'adresse, formatage et génération d'identifiants.
 *
 * @module shared/utils
 */

const {
  ABOUT_PAGE_LABELS,
  ABOUT_PAGE_URLS,
  ALLOWED_URL_PROTOCOLS,
  DEFAULT_SEARCH_ENGINE,
  DIRECT_DOWNLOAD_EXTENSIONS,
  HOME_HOST,
  HOME_SCHEME,
  HOME_URL,
  MAX_HISTORY_TITLE_LENGTH,
  PAGE_HOSTS,
  PAGE_SCHEME,
  SEARCH_ENGINES,
  SEARCH_ENGINE_KEYS,
  STREAM_TYPES,
} = require('./constants');

/**
 * Vérifie qu'une valeur est une URL HTTP ou HTTPS valide.
 * @param {unknown} value
 * @returns {boolean}
 */
function isHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  try {
    const { protocol } = new URL(value);
    return ALLOWED_URL_PROTOCOLS.has(protocol);
  } catch {
    return false;
  }
}

/**
 * Refuse les URL HTTP(S) contenant des identifiants intégrés. Ces derniers
 * finissent dans des journaux, des en-têtes ou l'historique et permettent de
 * masquer l'hôte réellement contacté.
 * @param {unknown} value
 * @returns {boolean}
 */
function hasUrlCredentials(value) {
  if (!isHttpUrl(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return Boolean(parsed.username || parsed.password);
  } catch {
    return true;
  }
}

/**
 * Vérifie qu'une URL HTTP(S) peut être utilisée sans identifiants intégrés.
 * @param {unknown} value
 * @returns {boolean}
 */
function isSafeHttpUrl(value) {
  return isHttpUrl(value) && !hasUrlCredentials(value);
}

/**
 * Vérifie qu'une URL appartient à la page d'accueil locale.
 * @param {unknown} value
 * @returns {boolean}
 */
function isHomeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === `${HOME_SCHEME}:` &&
      parsed.hostname === HOME_HOST &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port
    );
  } catch {
    return false;
  }
}

/**
 * Vérifie qu'une URL désigne une page interne connue (`about:config`,
 * `about:security` ou `about:dev`) servie par le protocole `think-page`.
 *
 * Seule la racine de chaque hôte est navigable. Les sous-ressources et les
 * routes d'API restent accessibles au document interne, mais ne peuvent pas
 * être ouvertes comme onglet.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isInternalPageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const hosts = Object.values(PAGE_HOSTS);

    return (
      parsed.protocol === `${PAGE_SCHEME}:` &&
      hosts.includes(parsed.hostname) &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      (parsed.pathname === '/' || parsed.pathname === '/index.html')
    );
  } catch {
    return false;
  }
}

/**
 * Résout un alias `about:` connu vers sa page interne, avant toute recherche
 * web. Les variantes avec barre oblique, paramètres ou fragment restent des
 * alias connus ; les autres pages `about:` sont refusées.
 * @param {unknown} value
 * @returns {string | null}
 */
function resolveAboutPageUrl(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value
    .trim()
    .toLowerCase()
    .match(/^about:([a-z0-9-]+)\/?(?:[?#].*)?$/);

  if (!match) {
    return null;
  }

  return ABOUT_PAGE_URLS[`about:${match[1]}`] || null;
}

/**
 * Retourne le libellé `about:*` d'une page interne, ou `null`.
 * @param {unknown} value
 * @returns {string | null}
 */
function getAboutPageLabel(value) {
  if (!isInternalPageUrl(value)) {
    return null;
  }

  try {
    const parsed = new URL(value);
    const normalized = `${parsed.protocol}//${parsed.hostname}/`;

    if (ABOUT_PAGE_LABELS[normalized]) {
      return ABOUT_PAGE_LABELS[normalized];
    }
  } catch {
    // La validation précédente a déjà écarté les URL invalides.
  }

  return null;
}

/**
 * Vérifie qu'une URL peut être chargée dans un onglet : une page HTTP(S), la
 * page d'accueil interne ou une page `about:` locale connue.
 * @param {unknown} value
 * @returns {boolean}
 */
function isTabUrl(value) {
  return (
    isSafeHttpUrl(value) ||
    isHomeUrl(value) ||
    isInternalPageUrl(value)
  );
}

/**
 * Retourne l'extension de fichier d'une URL HTTP(S), en minuscules et sans
 * point. Les paramètres de requête et le fragment sont ignorés.
 * @param {unknown} value
 * @returns {string}
 */
function getUrlExtension(value) {
  if (!isHttpUrl(value)) {
    return '';
  }

  try {
    const pathname = new URL(value).pathname;
    const filename = pathname.split('/').filter(Boolean).pop() || '';
    const dot = filename.lastIndexOf('.');

    if (dot <= 0 || dot === filename.length - 1) {
      return '';
    }

    return filename.slice(dot + 1).toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Indique si l'URL pointe vers un fichier que Chromium peut télécharger
 * directement. Les manifestes HLS/DASH sont exclus : ils passent par ffmpeg.
 * @param {unknown} value
 * @returns {boolean}
 */
function isDirectFileUrl(value) {
  const extension = getUrlExtension(value);

  if (!extension) {
    return false;
  }

  return (
    DIRECT_DOWNLOAD_EXTENSIONS.has(extension) &&
    !getStreamType(extension)
  );
}

/**
 * Construit un nom de fichier lisible à partir d'une URL.
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
function getFilenameFromUrl(value, fallback = 'telechargement') {
  if (!isHttpUrl(value)) {
    return fallback;
  }

  try {
    const pathname = new URL(value).pathname;
    const candidate = pathname.split('/').filter(Boolean).pop() || '';

    try {
      return sanitizeFilename(decodeURIComponent(candidate)) || fallback;
    } catch {
      return sanitizeFilename(candidate) || fallback;
    }
  } catch {
    return fallback;
  }
}

/**
 * Construit l'URL de la page d'accueil locale pour un moteur de recherche.
 * @param {string} [searchEngineKey]
 * @returns {string}
 */
function buildHomeUrl(searchEngineKey = DEFAULT_SEARCH_ENGINE) {
  const engine = SEARCH_ENGINE_KEYS.includes(searchEngineKey)
    ? searchEngineKey
    : DEFAULT_SEARCH_ENGINE;
  const url = new URL(HOME_URL);
  url.searchParams.set('engine', engine);
  return url.toString();
}

/**
 * Retourne un nom d'hôte lisible, sans le préfixe « www. ».
 * @param {string} url
 * @returns {string}
 */
function getHostname(url) {
  if (isHomeUrl(url)) {
    return 'Page d’accueil';
  }

  try {
    return new URL(url).hostname.replace(/^www\./i, '') || 'source inconnue';
  } catch {
    return 'source inconnue';
  }
}

/**
 * Détermine si une saisie ressemble à un nom d'hôte plutôt qu'à une recherche.
 * @param {string} value
 * @returns {boolean}
 */
function looksLikeHost(value) {
  if (/\s/.test(value)) {
    return false;
  }

  if (
    /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(?::\d+)?(?:\/.*)?$/i.test(
      value,
    )
  ) {
    return true;
  }

  if (/^\[[0-9a-f:]+\](?::\d+)?(?:\/.*)?$/i.test(value)) {
    return true;
  }

  return value.includes('.');
}

/**
 * Retourne la configuration d'un moteur de recherche, avec repli sur Google.
 * @param {string} [key]
 * @returns {{label: string, homeUrl: string, searchUrl: string}}
 */
function getSearchEngine(key = DEFAULT_SEARCH_ENGINE) {
  return SEARCH_ENGINES[key] || SEARCH_ENGINES[DEFAULT_SEARCH_ENGINE];
}

/**
 * Retourne le type de manifeste correspondant à une extension.
 * @param {unknown} extension
 * @returns {'hls' | 'dash' | null}
 */
function getStreamType(extension) {
  if (typeof extension !== 'string') {
    return null;
  }

  return STREAM_TYPES[extension.trim().toLowerCase()] || null;
}

/**
 * Formate une durée en secondes pour l'interface.
 * @param {unknown} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  const total = Math.round(Number(seconds));

  if (!Number.isFinite(total) || total <= 0) {
    return '';
  }

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  const paddedSeconds = String(remainingSeconds).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

/**
 * Transforme la saisie de la barre d'adresse en URL navigable.
 *
 * - une URL HTTP(S) est conservée ;
 * - un nom d'hôte évident reçoit le préfixe HTTPS ;
 * - tout le reste devient une recherche sur le moteur courant ;
 * - les protocoles dangereux ou inconnus sont refusés.
 *
 * @param {string} rawValue
 * @param {string} [searchEngineKey]
 * @returns {string | null}
 */
function resolveNavigationTarget(
  rawValue,
  searchEngineKey = DEFAULT_SEARCH_ENGINE,
) {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';

  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return isSafeHttpUrl(value) ? value : null;
  }

  // Alias internes : `about:config`, `about:security`, `about:dev`.
  // Cette résolution passe avant la recherche web et avant le refus des
  // schémas locaux pour qu'une saisie `about:...` ne soit jamais transformée
  // en requête sur le moteur de recherche.
  const aboutPageUrl = resolveAboutPageUrl(value);

  if (aboutPageUrl) {
    return aboutPageUrl;
  }

  // Une URL `think-page://` déjà résolue reste navigable si elle cible une
  // page interne connue.
  if (isInternalPageUrl(value)) {
    return value;
  }

  // Refus explicite des autres schémas locaux ou exécutables.
  if (/^(javascript|data|file|vbscript|about):/i.test(value)) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return null;
  }

  if (looksLikeHost(value)) {
    const candidate = `https://${value}`;
    return isSafeHttpUrl(candidate) ? candidate : null;
  }

  const engine = getSearchEngine(searchEngineKey);
  return `${engine.searchUrl}${encodeURIComponent(value)}`;
}

/**
 * Normalise un titre d'historique ou de favori.
 * @param {unknown} title
 * @param {string} url
 * @returns {string}
 */
function normalizeTitle(title, url) {
  if (typeof title === 'string' && title.trim()) {
    return title.trim().slice(0, MAX_HISTORY_TITLE_LENGTH);
  }

  return getHostname(url);
}

/**
 * Formate une taille en octets dans une unité lisible.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'taille inconnue';
  }

  if (bytes === 0) {
    return '0 o';
  }

  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

/**
 * Génère un identifiant local simple et unique.
 * @param {string} [prefix]
 * @returns {string}
 */
function makeId(prefix = '') {
  return `${prefix}${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * Nettoie un nom de fichier pour éviter les chemins malveillants.
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFilename(filename) {
  // Ce module est aussi embarqué dans le bundle du renderer : on évite
  // volontairement `node:path` pour rester exécutable dans un contexte
  // navigateur sans intégration Node.js.
  const normalized = String(filename || '').replace(/\\/g, '/');
  const base = normalized.split('/').filter(Boolean).pop() || '';
  let sanitized = base
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
    // Windows refuse les points et espaces finaux ; les retirer évite aussi
    // les noms spéciaux `.` et `..` qui pourraient sortir du dossier.
    .replace(/[. ]+$/g, '');

  if (!sanitized || sanitized === '.' || sanitized === '..') {
    return 'telechargement';
  }

  // Noms réservés Windows (CON, NUL, COM1…) : un préfixe les rend sûrs sans
  // changer le reste du nom.
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  // Une limite raisonnable évite les erreurs de système de fichiers avec un
  // Content-Disposition ou une URL démesurément longue.
  return sanitized.slice(0, 180) || 'telechargement';
}

module.exports = {
  buildHomeUrl,
  formatBytes,
  formatDuration,
  getAboutPageLabel,
  getFilenameFromUrl,
  getHostname,
  getSearchEngine,
  getStreamType,
  getUrlExtension,
  hasUrlCredentials,
  isDirectFileUrl,
  isHomeUrl,
  isHttpUrl,
  isInternalPageUrl,
  isSafeHttpUrl,
  isTabUrl,
  looksLikeHost,
  makeId,
  normalizeTitle,
  resolveAboutPageUrl,
  resolveNavigationTarget,
  sanitizeFilename,
};
