'use strict';

/**
 * Think-Browser — détection des flux média.
 *
 * Ce module n'écoute pas le réseau : il reçoit les requêtes du moniteur réseau
 * et conserve les URL audio/vidéo uniques détectées pendant la session.
 *
 * Les fichiers ne sont ajoutés qu'après réception des en-têtes de réponse. Cela
 * permet d'écarter les sons d'interface, les petites ressources décoratives et
 * les URL qui renvoient en réalité une page HTML.
 *
 * @module main/mediaDetector
 */

const {
  MEDIA_EXTENSIONS,
  MIN_MEDIA_SIZE_BYTES,
  STREAM_EXTENSIONS,
} = require('../shared/constants');
const { isHttpUrl, makeId } = require('../shared/utils');

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'aac',
  'ogg',
  'wav',
  'flac',
]);

/**
 * Types MIME qui identifient un média même lorsque l'URL ne contient aucune
 * extension. YouTube sert notamment ses flux depuis `videoplayback` avec des
 * paramètres `mime=video/mp4` ou `mime=audio/webm`.
 */
const MEDIA_CONTENT_TYPE_EXTENSIONS = Object.freeze({
  'application/dash+xml': 'mpd',
  'application/ogg': 'ogg',
  'application/vnd.apple.mpegurl': 'm3u8',
  'application/x-mpegurl': 'm3u8',
  'application/x-ogg': 'ogg',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/x-aac': 'aac',
  'audio/x-flac': 'flac',
  'audio/x-m4a': 'm4a',
  'audio/x-mpeg': 'mp3',
  'audio/x-wav': 'wav',
  'video/mp4': 'mp4',
  'video/ogg': 'ogg',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
});

/**
 * Indices d'URL pour les flux sans extension. Le motif reste volontairement
 * étroit afin de ne pas transformer chaque requête XHR en média.
 */
const EXTENSIONLESS_MEDIA_HINT_PATTERN =
  /(?:videoplayback|googlevideo\.com|(?:^|[/_.-])(?:manifest|playlist|master|m3u8|mpd|dash|hls)(?=[/_.?#-]|$)|[?&](?:mime|format|type)=(?:video|audio|m3u8|mpd|hls|dash|application%2F))/i;

const UI_SOUND_PATH_SEGMENTS = new Set([
  'ui',
  'sfx',
  'sound',
  'sounds',
  'effect',
  'effects',
  'sound-effects',
  'sound_effects',
  'ui-sounds',
  'ui_sounds',
]);

const UI_SOUND_FILENAME_PATTERN =
  /(?:^|[-_.])(?:click|hover|tap|toggle|beep|blip|notification|notify|alert|success|error|warning|pop|ding|chime|whoosh|swipe|button|interface|feedback|cursor|select|switch|check|tick|typing|scroll|impact|coin|score|win|lose|gameover|ui|sfx|sound|effect)(?:[-_.]|$)/i;

// Un fichier sous `/audio/` est généralement un son d'interface, mais les
// podcasts, épisodes, musiques et livres audio utilisent aussi ce dossier.
// Ces mots-clés indiquent un contenu éditorial complet à conserver.
const EDITORIAL_AUDIO_FILENAME_PATTERN =
  /(?:^|[-_.])(?:episode|ep|podcast|track|album|song|music|musique|mix|radio|stream|live|concert|interview|audiobook|chapter|lecture|course|cours|emission|émission|full)(?:[-_.]|$)/i;

const STREAMING_SEGMENT_PATTERN =
  /(?:^|[/_.-])(?:seg|segment|chunk|frag|fragment|part|init)[-_.]?\d*\.(?:mp4|m4a|m4s|ts|aac|webm)$/i;

const MAX_PENDING_MEDIA = 500;
const MAX_REJECTED_MEDIA = 1000;

/**
 * Extrait l'extension média d'une URL.
 * @param {string} rawUrl
 * @returns {string | null}
 */
function getMediaExtension(rawUrl) {
  try {
    const { pathname } = new URL(rawUrl);
    const match = pathname.match(/\.([a-z0-9]+)$/i);

    if (!match) {
      return null;
    }

    const extension = match[1].toLowerCase();
    return MEDIA_EXTENSIONS.has(extension) ? extension : null;
  } catch {
    return null;
  }
}

/**
 * Déduit une extension média d'un type MIME.
 * @param {unknown} contentType
 * @returns {string | null}
 */
function getMediaExtensionFromContentType(contentType) {
  const type = String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  return MEDIA_CONTENT_TYPE_EXTENSIONS[type] || null;
}

/**
 * Déduit une extension média depuis les paramètres `mime`, `format` ou `type`
 * d'une URL (YouTube, CDN de streaming).
 * @param {string} rawUrl
 * @returns {string | null}
 */
function getMediaExtensionFromUrlHint(rawUrl) {
  try {
    const parsed = new URL(rawUrl);

    for (const key of ['mime', 'format', 'type']) {
      const value = parsed.searchParams.get(key);

      if (!value) {
        continue;
      }

      let decoded = value;

      try {
        decoded = decodeURIComponent(value);
      } catch {
        // La valeur brute reste exploitable.
      }

      const normalized = decoded.toLowerCase();

      if (normalized === 'm3u8' || normalized === 'hls') {
        return 'm3u8';
      }

      if (normalized === 'mpd' || normalized === 'dash') {
        return 'mpd';
      }

      const extension = getMediaExtensionFromContentType(normalized);

      if (extension) {
        return extension;
      }

      const bareExtension = normalized.replace(/^\./, '');

      if (MEDIA_EXTENSIONS.has(bareExtension)) {
        return bareExtension;
      }
    }
  } catch {
    // URL invalide : le candidat sera écarté par l'appelant.
  }

  return null;
}

/**
 * Indique si une URL sans extension peut malgré tout être un média. On accepte
 * les requêtes `media` et quelques motifs de streaming connus, puis la réponse
 * MIME confirme ou infirme le candidat.
 * @param {string} rawUrl
 * @param {string} resourceType
 * @returns {boolean}
 */
function isPotentialExtensionlessMediaUrl(rawUrl, resourceType) {
  if (resourceType === 'media') {
    return true;
  }

  return EXTENSIONLESS_MEDIA_HINT_PATTERN.test(String(rawUrl || ''));
}

/**
 * Retourne le chemin décodé d'une URL, en minuscules.
 * @param {string} rawUrl
 * @returns {string}
 */
function getLowercasePath(rawUrl) {
  try {
    const { pathname } = new URL(rawUrl);

    try {
      return decodeURIComponent(pathname).toLowerCase();
    } catch {
      return pathname.toLowerCase();
    }
  } catch {
    return '';
  }
}

/**
 * Détecte les URL qui ressemblent à un son d'interface. Le filtre ne
 * s'applique qu'aux fichiers audio : une vidéo dont le chemin contient
 * « click » reste un média légitime.
 * @param {string} rawUrl
 * @param {string | null} [extension]
 * @returns {boolean}
 */
function isLikelyUiSoundUrl(rawUrl, extension = getMediaExtension(rawUrl)) {
  if (!extension || !AUDIO_EXTENSIONS.has(extension)) {
    return false;
  }

  const pathname = getLowercasePath(rawUrl);

  if (!pathname) {
    return false;
  }

  const segments = pathname.split('/').filter(Boolean);

  // Les segments de streaming audio/vidéo restent des médias légitimes, même
  // lorsqu'ils sont servis depuis un dossier `audio`.
  if (isStreamingSegmentUrl(rawUrl)) {
    return false;
  }

  if (segments.some((segment) => UI_SOUND_PATH_SEGMENTS.has(segment))) {
    return true;
  }

  const filename = segments[segments.length - 1] || '';

  if (UI_SOUND_FILENAME_PATTERN.test(filename)) {
    return true;
  }

  // Les sons d'interface de YouTube et de nombreux lecteurs vivent dans
  // `/audio/` avec des noms courts (`open.mp3`, `failure.mp3`,
  // `no_input.mp3`). On écarte ce dossier, sauf pour un contenu éditorial
  // identifiable ou un segment de streaming.
  return (
    segments.includes('audio') &&
    !EDITORIAL_AUDIO_FILENAME_PATTERN.test(filename)
  );
}

/**
 * Indique si l'URL ressemble à un segment de streaming qui peut être plus
 * petit qu'un fichier complet sans être un son d'interface.
 * @param {string} rawUrl
 * @returns {boolean}
 */
function isStreamingSegmentUrl(rawUrl) {
  return STREAMING_SEGMENT_PATTERN.test(getLowercasePath(rawUrl));
}

/**
 * Indique si une taille connue doit faire rejeter le média.
 * @param {number} size
 * @param {string} extension
 * @param {string} rawUrl
 * @returns {boolean}
 */
function isTinyMedia(size, extension, rawUrl) {
  if (!Number.isFinite(size) || size <= 0) {
    return false;
  }

  if (size >= MIN_MEDIA_SIZE_BYTES) {
    return false;
  }

  // Un manifeste HLS/DASH est naturellement petit : c'est sa taille qui le
  // rend utile, pas son contenu.
  if (STREAM_EXTENSIONS.has(extension)) {
    return false;
  }

  // Certains serveurs découpent les vidéos en segments de quelques dizaines de
  // kilo-octets. Ils restent des médias légitimes.
  return !isStreamingSegmentUrl(rawUrl);
}

/**
 * Lit une valeur d'en-tête sans tenir compte de la casse.
 * @param {Record<string, string[] | string> | undefined} headers
 * @param {string} name
 * @returns {string}
 */
function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') {
    return '';
  }

  const expected = name.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== expected) {
      continue;
    }

    if (Array.isArray(value)) {
      return String(value[0] || '');
    }

    return String(value || '');
  }

  return '';
}

/**
 * Extrait la taille totale d'une réponse. Pour une réponse partielle (206),
 * `Content-Range` indique la taille complète du fichier.
 * @param {Electron.OnResponseStartedListenerDetails} details
 * @returns {number}
 */
function getResponseSize(details) {
  const contentLength = Number(getHeader(details?.responseHeaders, 'content-length'));

  if (details?.statusCode === 206) {
    const contentRange = getHeader(details?.responseHeaders, 'content-range');
    const match = contentRange.match(/\/(\d+)\s*$/);

    if (match) {
      return Number(match[1]);
    }
  }

  return Number.isFinite(contentLength) && contentLength > 0
    ? contentLength
    : 0;
}

/**
 * Indique si le type de contenu correspond à un document texte. Un lien
 * `video.mp4` qui renvoie une page HTML ne doit pas être présenté comme un
 * média.
 * @param {string} contentType
 * @returns {boolean}
 */
function isTextualContentType(contentType) {
  return /^(?:text\/|application\/(?:json|xml|xhtml\+xml|problem\+json))/i.test(
    contentType || '',
  );
}

/**
 * Indique si un type MIME connu ne peut pas être un média. Les serveurs qui
 * renvoient `application/octet-stream` ou un type de téléchargement générique
 * restent acceptés : l'extension ou le MIME de l'URL tranche alors.
 * @param {string} contentType
 * @returns {boolean}
 */
function isClearlyNonMediaContentType(contentType) {
  const type = String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (!type) {
    return false;
  }

  if (/^(?:audio|video)\//.test(type)) {
    return false;
  }

  if (MEDIA_CONTENT_TYPE_EXTENSIONS[type]) {
    return false;
  }

  return ![
    'application/octet-stream',
    'application/download',
    'application/force-download',
    'application/x-download',
    'binary/octet-stream',
  ].includes(type);
}

/**
 * Détecte et mémorise les médias vus dans les requêtes HTTP(S).
 */
class MediaDetector {
  constructor() {
    /** @type {Map<string, object>} */
    this.media = new Map();

    /** @type {Map<string, object>} */
    this.pending = new Map();

    /** @type {Set<string>} */
    this.rejected = new Set();
  }

  /**
   * Inspecte une requête réseau et garde le candidat en attente de ses
   * en-têtes de réponse.
   * @param {Electron.OnBeforeRequestListenerDetails} details
   * @returns {object | null} Toujours `null` : la confirmation arrive avec la
   * réponse.
   */
  inspect(details) {
    try {
      if (!details || !isHttpUrl(details.url)) {
        return null;
      }

      if (
        this.media.has(details.url) ||
        this.pending.has(details.url) ||
        this.rejected.has(details.url)
      ) {
        return null;
      }

      const extension = getMediaExtension(details.url);
      const resourceType = details.resourceType || 'other';

      if (
        !extension &&
        !isPotentialExtensionlessMediaUrl(details.url, resourceType)
      ) {
        return null;
      }

      if (extension && isLikelyUiSoundUrl(details.url, extension)) {
        this.#reject(details.url);
        return null;
      }

      const candidate = {
        url: details.url,
        extension: extension || '',
        resourceType,
        webContentsId: Number.isInteger(details.webContentsId)
          ? details.webContentsId
          : null,
        referrer: isHttpUrl(details.referrer) ? details.referrer : '',
        detectedAt: new Date().toISOString(),
      };

      this.pending.set(candidate.url, candidate);
      this.#trimPending();
      return null;
    } catch (error) {
      console.warn('[Média] Analyse de requête impossible :', error.message);
      return null;
    }
  }

  /**
   * Confirme un candidat à partir des en-têtes de réponse.
   * @param {Electron.OnResponseStartedListenerDetails} details
   * @returns {object | null} Le média s'il vient d'être découvert.
   */
  inspectResponse(details) {
    try {
      if (!details || !isHttpUrl(details.url)) {
        return null;
      }

      if (this.media.has(details.url) || this.rejected.has(details.url)) {
        return null;
      }

      let candidate = this.pending.get(details.url);

      // Une redirection peut avoir changé l'URL entre la requête et la
      // réponse. On reconstruit alors le candidat depuis la réponse finale.
      if (!candidate) {
        this.inspect(details);
        candidate = this.pending.get(details.url);
      }

      if (candidate) {
        this.pending.delete(details.url);
      }

      if (Number(details.statusCode) >= 400) {
        this.#reject(details.url);
        return null;
      }

      const contentType = getHeader(details.responseHeaders, 'content-type');

      if (
        isTextualContentType(contentType) ||
        isClearlyNonMediaContentType(contentType)
      ) {
        this.#reject(details.url);
        return null;
      }

      // Certaines requêtes média sans extension ne passent pas par
      // `onBeforeRequest` (service worker, redirection, cache). Le type MIME
      // de la réponse suffit alors à confirmer un vrai flux audio/vidéo.
      if (!candidate) {
        const responseExtension =
          getMediaExtension(details.url) ||
          getMediaExtensionFromContentType(contentType) ||
          getMediaExtensionFromUrlHint(details.url);

        if (!responseExtension) {
          return null;
        }

        candidate = {
          url: details.url,
          extension: responseExtension,
          resourceType: details.resourceType || 'other',
          webContentsId: Number.isInteger(details.webContentsId)
            ? details.webContentsId
            : null,
          referrer: isHttpUrl(details.referrer) ? details.referrer : '',
          detectedAt: new Date().toISOString(),
        };
      }

      const extension =
        candidate.extension ||
        getMediaExtension(details.url) ||
        getMediaExtensionFromContentType(contentType) ||
        getMediaExtensionFromUrlHint(details.url);

      if (!extension || !MEDIA_EXTENSIONS.has(extension)) {
        this.#reject(details.url);
        return null;
      }

      // Le filtre des sons d'interface doit aussi s'appliquer après la
      // déduction MIME, car une URL sans extension peut cacher `/audio/open`.
      if (isLikelyUiSoundUrl(candidate.url, extension)) {
        this.#reject(details.url);
        return null;
      }

      const size = getResponseSize(details);

      if (isTinyMedia(size, extension, candidate.url)) {
        this.#reject(details.url);
        return null;
      }

      const record = {
        ...candidate,
        id: makeId('media-'),
        extension,
        contentType,
        size,
      };

      this.media.set(record.url, record);
      return { ...record };
    } catch (error) {
      console.warn('[Média] Analyse de réponse impossible :', error.message);
      return null;
    }
  }

  /**
   * Ajoute un média issu d'une analyse de page (DOM ou extraction connue).
   * @param {object} candidate
   * @returns {object | null}
   */
  add(candidate) {
    if (!candidate || !isHttpUrl(candidate.url)) {
      return null;
    }

    if (this.media.has(candidate.url) || this.rejected.has(candidate.url)) {
      return null;
    }

    const extension =
      typeof candidate.extension === 'string'
        ? candidate.extension.toLowerCase()
        : getMediaExtension(candidate.url);

    if (!extension || !MEDIA_EXTENSIONS.has(extension)) {
      return null;
    }

    if (isLikelyUiSoundUrl(candidate.url, extension)) {
      this.#reject(candidate.url);
      return null;
    }

    const size = Number(candidate.size);

    if (
      Number.isFinite(size) &&
      isTinyMedia(size, extension, candidate.url)
    ) {
      this.#reject(candidate.url);
      return null;
    }

    const record = {
      id: makeId('media-'),
      url: candidate.url,
      extension,
      resourceType: candidate.resourceType || 'extracted',
      webContentsId: Number.isInteger(candidate.webContentsId)
        ? candidate.webContentsId
        : null,
      referrer: isHttpUrl(candidate.referrer) ? candidate.referrer : '',
      detectedAt:
        typeof candidate.detectedAt === 'string' &&
        !Number.isNaN(Date.parse(candidate.detectedAt))
          ? candidate.detectedAt
          : new Date().toISOString(),
      contentType:
        typeof candidate.contentType === 'string'
          ? candidate.contentType
          : '',
      size: Number.isFinite(size) && size > 0 ? size : 0,
    };

    this.pending.delete(record.url);
    this.media.set(record.url, record);
    return { ...record };
  }

  /**
   * Retourne une copie de tous les médias détectés.
   * @returns {object[]}
   */
  getAll() {
    return Array.from(this.media.values(), (item) => ({ ...item }));
  }

  /**
   * Nombre de médias uniques détectés.
   * @returns {number}
   */
  get size() {
    return this.media.size;
  }

  /**
   * Vide la liste des médias (utile aux tests ou à une future action UI).
   */
  clear() {
    this.media.clear();
    this.pending.clear();
    this.rejected.clear();
  }

  /**
   * Mémorise une URL refusée pour ne pas l'analyser à chaque requête.
   * @param {string} url
   */
  #reject(url) {
    this.pending.delete(url);
    this.rejected.add(url);

    if (this.rejected.size > MAX_REJECTED_MEDIA) {
      const oldest = this.rejected.values().next().value;

      if (oldest) {
        this.rejected.delete(oldest);
      }
    }
  }

  /**
   * Limite la mémoire utilisée par les candidats qui ne reçoivent jamais de
   * réponse (requêtes annulées, navigation interrompue).
   */
  #trimPending() {
    while (this.pending.size > MAX_PENDING_MEDIA) {
      const oldest = this.pending.keys().next().value;

      if (!oldest) {
        break;
      }

      this.pending.delete(oldest);
    }
  }
}

module.exports = {
  MediaDetector,
  getMediaExtension,
  getMediaExtensionFromContentType,
  getMediaExtensionFromUrlHint,
  isLikelyUiSoundUrl,
  isPotentialExtensionlessMediaUrl,
  isStreamingSegmentUrl,
  isTextualContentType,
  isTinyMedia,
};
