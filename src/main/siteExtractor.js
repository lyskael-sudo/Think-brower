'use strict';

/**
 * Think-Browser — extraction de médias depuis une page.
 *
 * Le détecteur réseau ne voit que les requêtes réellement émises. Cette
 * analyse complémentaire lit le DOM et les scripts déjà chargés pour proposer
 * des manifestes HLS/DASH ou des fichiers directs qui n'ont pas encore été
 * demandés. Aucun contournement de DRM, de CAPTCHA ou de protection
 * anti-bot n'est effectué : les ressources publiques sont simplement listées.
 *
 * @module main/siteExtractor
 */

const { getMediaExtension } = require('./mediaDetector');
const { isSafeHttpUrl } = require('../shared/utils');

const MAX_HTML_LENGTH = 2 * 1024 * 1024;
const MAX_RESULTS = 40;
const MEDIA_EXTENSIONS_PATTERN =
  'm3u8|mpd|mp4|webm|mkv|mov|mp3|m4a|aac|ogg|wav|flac';
const ABSOLUTE_MEDIA_PATTERN = new RegExp(
  `(?:https?:)?\\/\\/[^\\s"'<>\\\\]+?\\.(?:${MEDIA_EXTENSIONS_PATTERN})(?:\\?[^\\s"'<>\\\\]*)?`,
  'gi',
);
const RELATIVE_MEDIA_PATTERN = new RegExp(
  `(?:^|[\\s"'(=])((?:\\.{1,2}\\/|\\/)?[A-Za-z0-9_~%.-]+(?:\\/[A-Za-z0-9_~%.-]+)*\\.(?:${MEDIA_EXTENSIONS_PATTERN})(?:\\?[^\\s"'<>\\\\]*)?)`,
  'gi',
);

/**
 * Décode les échappements les plus courants trouvés dans le HTML et les
 * scripts JSON (`&amp;`, `\/`, `\u0026`).
 * @param {string} value
 * @returns {string}
 */
function decodeCandidate(value) {
  return String(value || '')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u003f/gi, '?')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x2f;/gi, '/')
    .trim();
}

/**
 * Extrait les URL média d'un texte HTML ou JavaScript.
 * @param {string} text
 * @param {string} baseUrl
 * @returns {string[]}
 */
function extractMediaUrls(text, baseUrl) {
  if (typeof text !== 'string' || !text) {
    return [];
  }

  const found = new Set();
  const candidates = [];
  const normalizedText = decodeCandidate(text);

  for (const match of normalizedText.matchAll(ABSOLUTE_MEDIA_PATTERN)) {
    candidates.push(match[0]);
  }

  for (const match of normalizedText.matchAll(RELATIVE_MEDIA_PATTERN)) {
    candidates.push(match[1]);
  }

  for (const candidate of candidates) {
    const decoded = decodeCandidate(candidate);

    try {
      const url = new URL(decoded, baseUrl).toString();

      if (!/^https?:/i.test(url)) {
        continue;
      }

      const extension = getMediaExtension(url);

      if (extension) {
        found.add(url);
      }
    } catch {
      // URL relative invalide ou fragment de script : ignorée.
    }

    if (found.size >= MAX_RESULTS) {
      break;
    }
  }

  return Array.from(found);
}

/**
 * Récupère le HTML et les attributs média de la page active.
 * @param {Electron.WebContents} webContents
 * @returns {Promise<{html: string, urls: string[], pageUrl: string} | null>}
 */
async function collectPageData(webContents) {
  if (!webContents || webContents.isDestroyed?.()) {
    return null;
  }

  const script = `(() => {
    const values = new Set();
    const attributes = ['src', 'href', 'data-src', 'data-url', 'data-video-url'];

    for (const node of document.querySelectorAll(
      'video, source, audio, a[href], [data-src], [data-url], [data-video-url]',
    )) {
      for (const attribute of attributes) {
        const value = node.getAttribute(attribute);

        if (value) {
          values.add(value);
        }
      }
    }

    for (const script of document.scripts) {
      if (script.src) {
        values.add(script.src);
      }
    }

    return {
      pageUrl: location.href,
      html: document.documentElement.outerHTML.slice(0, ${MAX_HTML_LENGTH}),
      urls: Array.from(values).slice(0, 300),
    };
  })()`;

  try {
    return await webContents.executeJavaScript(script, true);
  } catch (error) {
    console.warn('[Médias] Analyse de la page impossible :', error.message);
    return null;
  }
}

/**
 * Neutralise les retours à la ligne dans une valeur d'en-tête HTTP.
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeHeaderValue(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Construit un en-tête Cookie pour les requêtes d'extraction.
 * @param {Electron.Session} targetSession
 * @param {string} url
 * @returns {Promise<string>}
 */
async function getCookieHeader(targetSession, url) {
  if (!targetSession?.cookies?.get) {
    return '';
  }

  try {
    const cookies = await targetSession.cookies.get({ url });
    return cookies
      .filter((cookie) => cookie && cookie.name)
      .map(
        (cookie) =>
          `${sanitizeHeaderValue(cookie.name)}=${sanitizeHeaderValue(
            cookie.value,
          )}`,
      )
      .join('; ');
  } catch {
    return '';
  }
}

/**
 * Lit un petit document JSON avec les en-têtes de la page.
 * @param {string} url
 * @param {object} options
 * @param {string} options.referer
 * @param {string} options.userAgent
 * @param {string} options.cookieHeader
 * @returns {Promise<object | null>}
 */
async function fetchJson(url, { referer, userAgent, cookieHeader }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const headers = { Accept: 'application/json,text/plain,*/*' };

  if (referer) {
    headers.Referer = sanitizeHeaderValue(referer);
  }

  if (userAgent) {
    headers['User-Agent'] = sanitizeHeaderValue(userAgent);
  }

  if (cookieHeader) {
    headers.Cookie = sanitizeHeaderValue(cookieHeader);
  }

  try {
    const response = await fetch(url, {
      headers,
      // Ne jamais suivre une redirection avec un en-tête Cookie construit
      // pour un autre hôte : cela pourrait exfiltrer les cookies de la page.
      redirect: 'error',
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    return JSON.parse(text.slice(0, 4 * 1024 * 1024));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Ajoute des URL issues d'un objet JSON de site connu.
 * @param {unknown} value
 * @param {Set<string>} output
 * @param {string} baseUrl
 */
function collectJsonUrls(value, output, baseUrl) {
  if (typeof value === 'string') {
    if (new RegExp(`\\.(?:${MEDIA_EXTENSIONS_PATTERN})(?:[?#]|$)`, 'i').test(value)) {
      try {
        const resolved = new URL(decodeCandidate(value), baseUrl).toString();

        if (isSafeHttpUrl(resolved)) {
          output.add(resolved);
        }
      } catch {
        // URL invalide.
      }
    }

    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonUrls(item, output, baseUrl);
    }

    return;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      collectJsonUrls(item, output, baseUrl);
    }
  }
}

/**
 * Analyse spécifique de quelques sites dont le manifeste est exposé dans une
 * réponse JSON publique. Les échecs restent silencieux.
 * @param {string} pageUrl
 * @param {object} options
 * @returns {Promise<string[]>}
 */
async function extractKnownSite(pageUrl, options) {
  let parsed;

  try {
    parsed = new URL(pageUrl);
  } catch {
    return [];
  }

  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  const urls = new Set();

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const idMatch = parsed.pathname.match(/\/video\/(\d+)/) ||
      parsed.pathname.match(/\/(\d+)$/);

    if (idMatch) {
      const data = await fetchJson(
        `https://player.vimeo.com/video/${idMatch[1]}/config`,
        options,
      );
      collectJsonUrls(data?.request?.files, urls, pageUrl);
    }
  } else if (host === 'dailymotion.com' || host === 'dai.ly') {
    const idMatch = parsed.pathname.match(/\/video\/([a-z0-9]+)/i) ||
      parsed.pathname.match(/\/([a-z0-9]+)$/i);

    if (idMatch) {
      const data = await fetchJson(
        `https://www.dailymotion.com/player/metadata/video/${idMatch[1]}`,
        options,
      );
      collectJsonUrls(data?.qualities, urls, pageUrl);
    }
  }

  return Array.from(urls).slice(0, MAX_RESULTS);
}

/**
 * Analyse la page active et retourne des médias prêts pour le panneau.
 * @param {Electron.WebContents} webContents
 * @returns {Promise<{pageUrl: string, media: object[], knownSiteCount: number}>}
 */
async function extractPageMedia(webContents) {
  const pageData = await collectPageData(webContents);

  if (!pageData || !/^https?:/i.test(pageData.pageUrl)) {
    return { pageUrl: '', media: [], knownSiteCount: 0 };
  }

  const targetSession = webContents.session;
  const userAgent = String(webContents.getUserAgent?.() || '').trim();
  const cookieHeader = await getCookieHeader(targetSession, pageData.pageUrl);
  const found = new Set();

  for (const candidate of pageData.urls) {
    // Les attributs `src`/`href` peuvent être relatifs sans barre initiale
    // (`video.mp4`, `index.m3u8`) : on les résout directement.
    try {
      const directUrl = new URL(
        decodeCandidate(candidate),
        pageData.pageUrl,
      ).toString();

      if (isSafeHttpUrl(directUrl) && getMediaExtension(directUrl)) {
        found.add(directUrl);
      }
    } catch {
      // Attribut vide ou URL invalide.
    }

    for (const url of extractMediaUrls(candidate, pageData.pageUrl)) {
      if (isSafeHttpUrl(url)) {
        found.add(url);
      }
    }
  }

  for (const url of extractMediaUrls(pageData.html, pageData.pageUrl)) {
    if (isSafeHttpUrl(url)) {
      found.add(url);
    }
  }

  const knownUrls = await extractKnownSite(pageData.pageUrl, {
    referer: pageData.pageUrl,
    userAgent,
    cookieHeader,
  });

  for (const url of knownUrls) {
    found.add(url);
  }

  const media = [];

  for (const url of found) {
    const extension = getMediaExtension(url);

    if (!extension) {
      continue;
    }

    media.push({
      url,
      extension,
      resourceType: 'extracted',
      webContentsId: webContents.id,
      referrer: pageData.pageUrl,
      detectedAt: new Date().toISOString(),
    });

    if (media.length >= MAX_RESULTS) {
      break;
    }
  }

  return {
    pageUrl: pageData.pageUrl,
    media,
    knownSiteCount: knownUrls.length,
  };
}

module.exports = {
  collectPageData,
  decodeCandidate,
  extractMediaUrls,
  extractPageMedia,
};
