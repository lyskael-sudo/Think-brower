'use strict';

/**
 * Think-Browser — gestion des téléchargements.
 *
 * Intercepte `will-download`, choisit un nom de fichier non conflictuel,
 * journalise la progression et diffuse les mises à jour au renderer.
 *
 * @module main/downloadManager
 */

const fs = require('node:fs');
const path = require('node:path');
const { shell } = require('electron');
const {
  DOWNLOAD_PROGRESS_THROTTLE,
  IPC,
  MAX_STREAM_DOWNLOADS,
  MAX_STREAM_DOWNLOADS_LIMIT,
  MEDIA_EXTENSIONS,
  MIN_STREAM_DOWNLOADS,
  STREAM_EXTENSIONS,
} = require('../shared/constants');
const {
  formatBytes,
  getFilenameFromUrl,
  getStreamType,
  getUrlExtension,
  hasUrlCredentials,
  isDirectFileUrl,
  isHttpUrl,
  isSafeHttpUrl,
  sanitizeFilename,
} = require('../shared/utils');
const { buildStreamFilename } = require('./videoDownloader');
const { buildMergedFilename } = require('./mediaPair');
const { sanitizeHeaderValue } = require('./videoTools');
const { isYouTubeVideoUrl } = require('./youtube');

/**
 * Indique si une URL peut être utilisée par le gestionnaire de téléchargement.
 * @param {unknown} value
 * @returns {boolean}
 */
function isSafeDownloadUrl(value) {
  return isSafeHttpUrl(value);
}

const INVALID_DIRECT_MEDIA_MESSAGE =
  'Ce lien ne pointe pas vers un fichier vidéo direct valide';

const MEDIA_PAGE_MESSAGE =
  'Ce lien est une page de lecture, pas un fichier média direct. Ouvrez la ' +
  'page, lancez la vidéo puis utilisez « Télécharger le média » dans le menu ' +
  'contextuel.';

/**
 * Hôtes de pages de lecture dont l'URL ne contient généralement pas
 * d'extension média. Le téléchargement par lien ne doit pas confondre leur
 * document HTML avec une vidéo.
 */
const MEDIA_PAGE_HOSTS = Object.freeze([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'vimeo.com',
  'www.vimeo.com',
  'player.vimeo.com',
  'dailymotion.com',
  'www.dailymotion.com',
  'dai.ly',
]);

/**
 * Indique si l'URL désigne une page de lecture connue plutôt qu'un fichier ou
 * un manifeste. Les URL `videoplayback` de YouTube restent des médias directs.
 * @param {unknown} value
 * @returns {boolean}
 */
function isMediaPageUrl(value) {
  if (!isHttpUrl(value)) {
    return false;
  }

  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');

  if (!MEDIA_PAGE_HOSTS.includes(hostname)) {
    return false;
  }

  if (/\/videoplayback(?:\/|$)/i.test(parsed.pathname)) {
    return false;
  }

  const extension = getUrlExtension(value);

  return (
    !extension ||
    (!MEDIA_EXTENSIONS.has(extension) && !getStreamType(extension))
  );
}

/**
 * Indique si l'extension correspond à un fichier média direct (hors manifeste
 * HLS/DASH). Ces liens doivent être vérifiés avant d'être confiés à Chromium.
 * @param {unknown} extension
 * @returns {boolean}
 */
function isDirectMediaExtension(extension) {
  return (
    typeof extension === 'string' &&
    MEDIA_EXTENSIONS.has(extension) &&
    !STREAM_EXTENSIONS.has(extension)
  );
}

/**
 * Détecte une réponse textuelle (page HTML, JSON, XML) qui ne peut pas être
 * un fichier vidéo direct.
 * @param {unknown} contentType
 * @returns {boolean}
 */
function isTextualContentType(contentType) {
  return /^(?:text\/|application\/(?:json|xml|xhtml\+xml|problem\+json))/i.test(
    typeof contentType === 'string' ? contentType : '',
  );
}

/**
 * Surveille, expose et persiste les téléchargements.
 */
class DownloadManager {
  /**
   * @param {object} options
   * @param {Electron.Session} options.session
   * @param {() => string} options.getDownloadDir
   * @param {() => object} [options.getSettings]
   * @param {string} options.fallbackDownloadDir
   * @param {(channel: string, payload: unknown, webContents?: Electron.WebContents) => void} options.onEvent
   * @param {import('./downloadStore').DownloadStore} options.downloadStore
   * @param {import('./videoDownloader').VideoDownloader} [options.videoDownloader]
   * @param {import('./ytDlpDownloader').YtDlpDownloader} [options.ytDlpDownloader]
   * @param {(webContents: Electron.WebContents | undefined) => boolean} [options.isPrivateSource]
   * @param {(guestId: number) => number | null} [options.getWindowIdForGuest]
   * @param {(record: object) => void | Promise<void>} [options.onMediaCompleted]
   */
  constructor({
    session,
    getDownloadDir,
    getSettings,
    fallbackDownloadDir,
    onEvent,
    downloadStore,
    videoDownloader,
    ytDlpDownloader,
    isPrivateSource,
    getWindowIdForGuest,
    onMediaCompleted,
  }) {
    this.session = session;
    this.getDownloadDir = getDownloadDir;
    this.getSettings =
      typeof getSettings === 'function' ? getSettings : () => ({});
    this.fallbackDownloadDir = fallbackDownloadDir;
    this.onEvent = onEvent;
    this.downloadStore = downloadStore;
    this.videoDownloader = videoDownloader || null;
    this.ytDlpDownloader = ytDlpDownloader || null;
    this.isPrivateSource = isPrivateSource || (() => false);
    this.getWindowIdForGuest = getWindowIdForGuest || (() => null);
    this.onMediaCompleted =
      typeof onMediaCompleted === 'function' ? onMediaCompleted : null;

    /** @type {Map<number, object>} */
    this.downloads = new Map();

    /** @type {Map<number, Electron.DownloadItem>} */
    this.activeItems = new Map();

    /**
     * Temporisations de reprise automatique, séparées des enregistrements :
     * un objet `Timeout` n'est ni sérialisable en JSON ni transmissible par
     * IPC.
     * @type {Map<number, ReturnType<typeof setTimeout>>}
     */
    this.resumeTimers = new Map();

    /** @type {Map<number, string>} */
    this.streamJobIds = new Map();

    /** @type {Map<number, string>} */
    this.streamOutputPaths = new Map();

    /** @type {Array<object>} */
    this.streamQueue = [];

    /** @type {Map<number, object>} */
    this.queuedStreams = new Map();

    this.pumpingStreamQueue = false;

    /** @type {Map<number, Electron.WebContents>} */
    this.downloadSources = new Map();

    /** @type {Set<string>} */
    this.reservedPaths = new Set();

    /** @type {WeakSet<Electron.Session>} */
    this.listenedSessions = new WeakSet();

    this.nextId = 1;
    this.initialized = false;
    this.shuttingDown = false;

    this.attachSession(session);
  }

  /**
   * Branche l'interception des téléchargements sur une session. Les fenêtres
   * privées utilisent une partition éphémère : sans cet appel, Chromium
   * enregistrerait le fichier sans suivi ni rattachement à la fenêtre.
   * @param {Electron.Session} targetSession
   */
  attachSession(targetSession) {
    if (!targetSession || this.listenedSessions.has(targetSession)) {
      return;
    }

    this.listenedSessions.add(targetSession);
    targetSession.on('will-download', (event, item, webContents) => {
      this.#handleDownload(event, item, webContents, targetSession);
    });
  }

  /**
   * Charge l'historique persistant avant l'ouverture des fenêtres.
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    const records = await this.downloadStore.load();
    let repaired = false;

    for (const record of records) {
      // Un arrêt brutal de l'application ne doit pas laisser une tâche
      // éternellement « en cours » : elle devient reprenable manuellement.
      if (record.state === 'progressing' || record.state === 'queued') {
        const wasQueued = record.state === 'queued';
        record.state = 'interrupted';
        record.progress = null;
        record.endedAt = record.endedAt || new Date().toISOString();
        record.message = wasQueued
          ? 'File d’attente interrompue par le redémarrage.'
          : 'Téléchargement interrompu par le redémarrage.';
        repaired = true;
      }

      this.downloads.set(record.id, record);
    }

    this.nextId =
      records.reduce((maximum, record) => Math.max(maximum, record.id), 0) + 1;
    this.initialized = true;

    if (repaired) {
      this.#persist();
    }
  }

  /**
   * Expose la disponibilité des outils d'assemblage de flux.
   * @returns {Promise<{ffmpeg: boolean, ffprobe: boolean, ffmpegVersion: string, ffprobeVersion: string}>}
   */
  async getMediaCapabilities() {
    if (!this.videoDownloader) {
      return {
        ffmpeg: false,
        ffprobe: false,
        ffmpegVersion: '',
        ffprobeVersion: '',
      };
    }

    return this.videoDownloader.tools.getCapabilities();
  }

  /**
   * Retourne la limite de flux simultanés choisie dans les paramètres.
   * @returns {number}
   */
  #getStreamConcurrency() {
    const value = Number(this.getSettings().maxStreamDownloads);

    if (!Number.isInteger(value)) {
      return MAX_STREAM_DOWNLOADS;
    }

    return Math.min(
      MAX_STREAM_DOWNLOADS_LIMIT,
      Math.max(MIN_STREAM_DOWNLOADS, value),
    );
  }

  /**
   * Construit les en-têtes d'une requête de téléchargement direct. Les cookies
   * sont ajoutés automatiquement par la session Chromium : aucun cookie n'est
   * manipulé ni exposé au renderer.
   * @param {string} pageUrl
   * @param {Electron.WebContents | null} source
   * @returns {Record<string, string>}
   */
  #buildDownloadHeaders(pageUrl, source) {
    const headers = {
      Accept: '*/*',
    };
    const settings = this.getSettings();

    if (
      settings.linkDownloadReferer !== false &&
      isSafeDownloadUrl(pageUrl)
    ) {
      headers.Referer = sanitizeHeaderValue(pageUrl);
    }

    const userAgent = sanitizeHeaderValue(source?.getUserAgent?.());

    if (userAgent) {
      headers['User-Agent'] = userAgent;
    }

    return headers;
  }

  /**
   * Extrait un nom de fichier d'un en-tête Content-Disposition.
   * @param {string} value
   * @returns {string}
   */
  #parseContentDisposition(value) {
    if (typeof value !== 'string' || !value) {
      return '';
    }

    const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(value);

    if (encoded?.[1]) {
      try {
        return sanitizeFilename(decodeURIComponent(encoded[1].trim()));
      } catch {
        return sanitizeFilename(encoded[1].trim());
      }
    }

    const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(value);

    return plain?.[1] ? sanitizeFilename(plain[1].trim()) : '';
  }

  /**
   * Déduit une extension de média à partir du type MIME.
   * @param {string} contentType
   * @returns {string}
   */
  #extensionFromContentType(contentType) {
    const type = String(contentType || '')
      .split(';')[0]
      .trim()
      .toLowerCase();

    const mapping = {
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
    };

    if (mapping[type]) {
      return mapping[type];
    }

    if (type === 'application/octet-stream') {
      return '';
    }

    return '';
  }

  /**
   * Interroge un lien sans télécharger son contenu. HEAD est privilégié, avec
   * un repli GET limité au premier octet pour les serveurs qui le refusent.
   * @param {string} url
   * @param {object} options
   * @param {Electron.Session} options.targetSession
   * @param {Record<string, string>} options.headers
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<{ok: boolean, status: number, finalUrl: string, contentType: string, contentLength: number, contentDisposition: string, message?: string}>}
   */
  async #requestUrlMetadata(url, { targetSession, headers, signal }) {
    /**
     * @param {string} method
     * @param {Record<string, string>} extraHeaders
     * @returns {Promise<object>}
     */
    const request = async (method, extraHeaders = {}) => {
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      const timer = setTimeout(() => controller.abort(), 10_000);

      if (signal) {
        if (signal.aborted) {
          controller.abort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      try {
        const response = await targetSession.fetch(url, {
          method,
          headers: { ...headers, ...extraHeaders },
          redirect: 'follow',
          signal: controller.signal,
        });

        try {
          await response.body?.cancel();
        } catch {
          // Le corps a déjà été consommé ou annulé par Chromium.
        }

        return {
          ok: response.ok,
          status: response.status,
          finalUrl: response.url || url,
          contentType: response.headers.get('content-type') || '',
          contentLength: Number(
            response.headers.get('content-length') || 0,
          ),
          contentDisposition:
            response.headers.get('content-disposition') || '',
        };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    };

    try {
      const head = await request('HEAD');

      if (
        head.ok ||
        ![403, 405, 501].includes(head.status)
      ) {
        return head;
      }
    } catch {
      // Certains serveurs coupent la connexion sur HEAD : on tente GET.
    }

    try {
      return await request('GET', { Range: 'bytes=0-0' });
    } catch (error) {
      return {
        ok: false,
        status: 0,
        finalUrl: url,
        contentType: '',
        contentLength: 0,
        contentDisposition: '',
        message: `Le serveur n’a pas répondu : ${error.message}`,
      };
    }
  }

  /**
   * Analyse un lien fourni par l'utilisateur. Le résultat sert uniquement à
   * l'interface : aucune donnée du renderer n'est utilisée comme type de
   * média ou nom de fichier sans validation.
   * @param {object} options
   * @param {string} options.url
   * @param {string} [options.pageUrl]
   * @param {Electron.WebContents | null} [options.requestingWebContents]
   * @param {{windowId?: number | null, isPrivate?: boolean}} [options.access]
   * @param {boolean} [options.probeStreams]
   * @returns {Promise<object>}
   */
  async inspectUrl({
    url,
    pageUrl = '',
    requestingWebContents = null,
    access = {},
    probeStreams = true,
  }) {
    if (!isSafeDownloadUrl(url)) {
      return {
        ok: false,
        message:
          'Le lien doit être une URL HTTP(S) valide, sans identifiants intégrés.',
      };
    }

    if (isMediaPageUrl(url)) {
      return {
        ok: false,
        code: 'media-page',
        message: MEDIA_PAGE_MESSAGE,
      };
    }

    const requestedExtension = getUrlExtension(url);
    const directMediaRequested = isDirectMediaExtension(requestedExtension);
    const source =
      requestingWebContents && !requestingWebContents.isDestroyed?.()
        ? requestingWebContents
        : null;
    const targetSession =
      source?.session || (access.isPrivate ? null : this.session);

    if (!targetSession) {
      return {
        ok: false,
        message:
          'Le lien ne peut pas être analysé depuis une fenêtre privée sans ' +
          'page d’origine.',
      };
    }

    const headers = this.#buildDownloadHeaders(
      isHttpUrl(pageUrl) ? pageUrl : '',
      source,
    );
    const result = await this.#requestUrlMetadata(url, {
      targetSession,
      headers,
    });

    if (!result.ok) {
      if (directMediaRequested) {
        return {
          ok: false,
          code: 'invalid-media',
          message: INVALID_DIRECT_MEDIA_MESSAGE,
        };
      }

      return {
        ok: false,
        message:
          result.message ||
          `Le serveur a répondu ${result.status || 'sans statut'}.`,
      };
    }

    if (!isSafeDownloadUrl(result.finalUrl)) {
      return {
        ok: false,
        code: 'unsafe-redirect',
        message:
          'La redirection du lien est refusée : elle contient des identifiants ou un protocole non HTTP(S).',
      };
    }

    const finalUrl = result.finalUrl;
    let extension =
      getUrlExtension(finalUrl) ||
      this.#extensionFromContentType(result.contentType);
    let streamType = getStreamType(extension);
    let filename =
      this.#parseContentDisposition(result.contentDisposition) ||
      getFilenameFromUrl(finalUrl);

    if (!extension && filename.includes('.')) {
      extension = filename.split('.').pop().toLowerCase();
      streamType = getStreamType(extension);
    }

    if (!filename || filename === 'telechargement') {
      filename = extension
        ? `telechargement.${extension}`
        : 'telechargement';
    }

    if (extension && !filename.toLowerCase().endsWith(`.${extension}`)) {
      const hasAnotherExtension = /\.[a-z0-9]{1,8}$/i.test(filename);

      if (!hasAnotherExtension) {
        filename = `${filename}.${extension}`;
      }
    }

    // Un lien `.mp4` (ou une réponse annoncée comme vidéo/audio) qui renvoie
    // du HTML est presque toujours une page d'erreur, un mur d'authentification
    // ou une page de lecteur. Chromium téléchargerait ce document : on refuse.
    if (
      (directMediaRequested || isDirectMediaExtension(extension)) &&
      isTextualContentType(result.contentType)
    ) {
      return {
        ok: false,
        code: 'invalid-media',
        message: INVALID_DIRECT_MEDIA_MESSAGE,
      };
    }

    const isMedia =
      Boolean(streamType) ||
      MEDIA_EXTENSIONS.has(extension) ||
      /^(?:audio|video)\//i.test(result.contentType);

    let metadata = null;

    if (streamType && probeStreams && this.videoDownloader) {
      const cookieHeader = await this.videoDownloader.tools.getCookieHeader(
        targetSession,
        finalUrl,
      );
      const userAgent = String(
        source?.getUserAgent?.() || targetSession.getUserAgent?.() || '',
      ).trim();

      try {
        metadata = await this.videoDownloader.tools.probe(finalUrl, {
          pageUrl: isHttpUrl(pageUrl) ? pageUrl : '',
          cookieHeader,
          userAgent,
        });
      } catch (error) {
        console.warn(
          '[Téléchargement] Analyse du lien incomplète :',
          error.message,
        );
      }
    }

    return {
      ok: true,
      url,
      finalUrl,
      filename,
      extension,
      streamType,
      isMedia,
      contentType: result.contentType,
      contentLength: Number.isFinite(result.contentLength)
        ? Math.max(0, result.contentLength)
        : 0,
      metadata,
      hasTracks:
        Boolean(metadata?.audioTracks?.length) ||
        Boolean(metadata?.subtitleTracks?.length),
      isLive: Boolean(metadata?.isLive),
      message: isMedia
        ? ''
        : 'Ce lien ne ressemble pas à un média. Le téléchargement reste ' +
          'possible si le serveur renvoie un fichier.',
    };
  }

  /**
   * Confie un fichier direct à Chromium, avec les en-têtes de la page source.
   * Aucune requête HEAD n'est effectuée ici : les serveurs qui refusent HEAD
   * ne doivent pas empêcher un téléchargement valide. La réponse est contrôlée
   * dans `will-download` pour annuler une page HTML déguisée en média.
   * @param {object} options
   * @param {string} options.url
   * @param {string} options.extension
   * @param {string} [options.pageUrl]
   * @param {Electron.WebContents | null} [options.requestingWebContents]
   * @param {{windowId?: number | null, isPrivate?: boolean}} [options.access]
   * @param {string} [options.filename]
   * @param {string} [options.warning]
   * @returns {object}
   */
  #startChromiumDownload({
    url,
    extension,
    pageUrl = '',
    requestingWebContents = null,
    access = {},
    filename = '',
    warning = '',
  }) {
    const source =
      requestingWebContents && !requestingWebContents.isDestroyed?.()
        ? requestingWebContents
        : null;
    const targetSession =
      source?.session || (access.isPrivate ? null : this.session);

    if (!targetSession) {
      return {
        ok: false,
        message:
          'Le téléchargement direct est indisponible : la page d’origine ' +
          'a été fermée.',
      };
    }

    const headers = this.#buildDownloadHeaders(
      isHttpUrl(pageUrl) ? pageUrl : '',
      source,
    );

    try {
      if (source) {
        source.downloadURL(url, { headers });
      } else {
        targetSession.downloadURL(url, { headers });
      }

      return {
        ok: true,
        mode: 'file',
        filename: filename || getFilenameFromUrl(url),
        extension,
        streamType: null,
        warning,
      };
    } catch (error) {
      console.warn(
        '[Téléchargement] Lien direct impossible :',
        error.message,
      );
      return {
        ok: false,
        message: 'Le téléchargement de ce lien a échoué.',
      };
    }
  }

  /**
   * Télécharge un lien fourni par l'utilisateur. Les manifestes HLS/DASH
   * passent directement par ffmpeg ; les fichiers directs (`.mp4`, `.zip`,
   * `.pdf`, etc.) sont confiés immédiatement à Chromium, sans HEAD préalable.
   * Les URL sans extension sont analysées pour distinguer un manifeste d'un
   * fichier.
   * @param {object} options
   * @param {string} options.url
   * @param {string} [options.pageUrl]
   * @param {Electron.WebContents | null} [options.requestingWebContents]
   * @param {{windowId?: number | null, isPrivate?: boolean}} [options.access]
   * @param {number | null} [options.audioStreamIndex]
   * @param {number | null} [options.subtitleStreamIndex]
   * @param {boolean} [options.isLive]
   * @returns {Promise<object>}
   */
  async startUrlDownload({
    url,
    pageUrl = '',
    requestingWebContents = null,
    access = {},
    audioStreamIndex = null,
    subtitleStreamIndex = null,
    isLive = false,
  }) {
    if (!isSafeDownloadUrl(url)) {
      return {
        ok: false,
        message:
          'Le lien doit être une URL HTTP(S) valide, sans identifiants intégrés.',
      };
    }

    if (isMediaPageUrl(url)) {
      return {
        ok: false,
        code: 'media-page',
        message: MEDIA_PAGE_MESSAGE,
      };
    }

    const source =
      requestingWebContents && !requestingWebContents.isDestroyed?.()
        ? requestingWebContents
        : null;
    const requestedExtension = getUrlExtension(url);
    const requestedStreamType = getStreamType(requestedExtension);

    // Un manifeste identifié par son extension part directement dans la file
    // ffmpeg : inutile de le télécharger une première fois avec HEAD.
    if (requestedStreamType) {
      const result = await this.startMediaDownload({
        url,
        extension: requestedExtension,
        pageUrl: isHttpUrl(pageUrl) ? pageUrl : '',
        requestingWebContents: source,
        access,
        audioStreamIndex: Number.isInteger(audioStreamIndex)
          ? audioStreamIndex
          : null,
        subtitleStreamIndex: Number.isInteger(subtitleStreamIndex)
          ? subtitleStreamIndex
          : null,
        isLive: Boolean(isLive),
      });

      return {
        ...result,
        filename: buildStreamFilename(url),
        streamType: requestedStreamType,
      };
    }

    // Fichier direct : Chromium démarre immédiatement. Le contrôle du type
    // MIME réel est effectué dans `will-download` pour intercepter un faux
    // `.mp4` sans bloquer les serveurs qui refusent HEAD.
    if (isDirectFileUrl(url)) {
      return this.#startChromiumDownload({
        url,
        extension: requestedExtension,
        pageUrl,
        requestingWebContents: source,
        access,
        filename: getFilenameFromUrl(url),
      });
    }

    const inspection = await this.inspectUrl({
      url,
      pageUrl,
      requestingWebContents: source,
      access,
      probeStreams: false,
    });

    // Une inspection qui a suivi une redirection dangereuse doit bloquer le
    // téléchargement : sinon Chromium suivrait à nouveau cette redirection
    // hors du contrôle effectué ci-dessus.
    if (!inspection.ok && inspection.code === 'unsafe-redirect') {
      return {
        ok: false,
        message: inspection.message,
      };
    }

    if (!inspection.ok && inspection.code === 'invalid-media') {
      return {
        ok: false,
        code: 'invalid-media',
        message: INVALID_DIRECT_MEDIA_MESSAGE,
      };
    }

    if (
      inspection.ok &&
      isTextualContentType(inspection.contentType) &&
      isDirectMediaExtension(inspection.extension)
    ) {
      return {
        ok: false,
        code: 'invalid-media',
        message: INVALID_DIRECT_MEDIA_MESSAGE,
      };
    }

    const extension = inspection.ok
      ? inspection.extension
      : requestedExtension;
    const streamType = getStreamType(extension);
    const downloadUrl =
      inspection.ok && isSafeDownloadUrl(inspection.finalUrl)
        ? inspection.finalUrl
        : url;

    if (streamType) {
      const result = await this.startMediaDownload({
        url: downloadUrl,
        extension,
        pageUrl: isHttpUrl(pageUrl) ? pageUrl : '',
        requestingWebContents: source,
        access,
        audioStreamIndex: Number.isInteger(audioStreamIndex)
          ? audioStreamIndex
          : null,
        subtitleStreamIndex: Number.isInteger(subtitleStreamIndex)
          ? subtitleStreamIndex
          : null,
        isLive: Boolean(isLive),
      });

      return {
        ...result,
        filename: inspection.ok
          ? inspection.filename
          : buildStreamFilename(downloadUrl),
        streamType,
      };
    }

    return this.#startChromiumDownload({
      url: downloadUrl,
      extension,
      pageUrl,
      requestingWebContents: source,
      access,
      filename: inspection.ok
        ? inspection.filename
        : getFilenameFromUrl(downloadUrl),
      warning: inspection.message || '',
    });
  }

  /**
   * Lance le téléchargement d'un média détecté. Les fichiers directs passent
   * par le moteur de Chromium ; les manifestes HLS/DASH sont confiés à ffmpeg.
   *
   * @param {object} options
   * @param {string} options.url
   * @param {string} options.extension
   * @param {string} [options.pageUrl]
   * @param {Electron.WebContents | null} [options.requestingWebContents]
   * @param {{windowId?: number | null, isPrivate?: boolean}} [options.access]
   * @param {number | null} [options.audioStreamIndex]
   * @param {number | null} [options.subtitleStreamIndex]
   * @param {boolean} [options.isLive]
   * @param {string} [options.contentType] Type MIME déjà observé par le détecteur.
   * @returns {Promise<{ok: boolean, mode?: string, downloadId?: number, message?: string, queued?: boolean}>}
   */
  async startMediaDownload({
    url,
    extension,
    pageUrl = '',
    requestingWebContents = null,
    access = {},
    audioStreamIndex = null,
    subtitleStreamIndex = null,
    isLive = false,
    contentType = '',
  }) {
    if (!isSafeDownloadUrl(url)) {
      return {
        ok: false,
        message:
          'Cette adresse média n’est pas une URL HTTP(S) valide, sans identifiants intégrés.',
      };
    }

    const streamType = getStreamType(extension);

    if (!streamType && isDirectMediaExtension(extension)) {
      const observedType =
        typeof contentType === 'string' ? contentType.trim() : '';

      // Un média détecté par le réseau possède déjà son type MIME. Pour une
      // URL seulement extraite du DOM, on vérifie le lien avant de confier le
      // fichier à Chromium, qui téléchargerait sinon une page HTML d'erreur.
      if (isTextualContentType(observedType)) {
        return {
          ok: false,
          code: 'invalid-media',
          message: INVALID_DIRECT_MEDIA_MESSAGE,
        };
      }

      if (!observedType) {
        const inspection = await this.inspectUrl({
          url,
          pageUrl,
          requestingWebContents,
          access,
          probeStreams: false,
        });

        if (!inspection.ok && inspection.code === 'unsafe-redirect') {
          return {
            ok: false,
            message: inspection.message,
          };
        }

        if (
          !inspection.ok ||
          isTextualContentType(inspection.contentType)
        ) {
          return {
            ok: false,
            code: 'invalid-media',
            message: INVALID_DIRECT_MEDIA_MESSAGE,
          };
        }
      }
    }

    if (!streamType) {
      try {
        if (
          !requestingWebContents ||
          requestingWebContents.isDestroyed?.()
        ) {
          if (access.isPrivate) {
            return {
              ok: false,
              message:
                'Le téléchargement direct est indisponible : la page ' +
                'd’origine a été fermée.',
            };
          }

          this.session.downloadURL(url);
        } else {
          requestingWebContents.downloadURL(url);
        }

        return { ok: true, mode: 'file' };
      } catch (error) {
        console.warn(
          '[Téléchargement] Lancement du média impossible :',
          error.message,
        );
        return {
          ok: false,
          message: 'Le téléchargement de ce média a échoué.',
        };
      }
    }

    if (!this.videoDownloader) {
      return {
        ok: false,
        message: 'Le module de téléchargement de flux n’est pas disponible.',
      };
    }

    const capabilities = await this.videoDownloader.tools.getCapabilities();

    if (!capabilities.ffmpeg) {
      return {
        ok: false,
        message:
          'ffmpeg est introuvable. Les flux HLS et DASH ne peuvent pas ' +
          'être téléchargés.',
      };
    }

    const directory = this.#resolveDownloadDirectory();

    if (!directory) {
      return {
        ok: false,
        message: 'Aucun dossier de téléchargement accessible.',
      };
    }

    const outputPath = this.#getUniquePath(
      directory,
      buildStreamFilename(url),
    );
    const source =
      requestingWebContents && !requestingWebContents.isDestroyed?.()
        ? requestingWebContents
        : null;
    const targetSession =
      source?.session ||
      (access.isPrivate ? null : this.session);
    const isPrivate =
      Boolean(access.isPrivate) ||
      !targetSession ||
      targetSession !== this.session ||
      this.isPrivateSource(source || undefined);
    const ownerWindowId = isPrivate
      ? access.windowId ?? this.getWindowIdForGuest(source?.id) ?? null
      : null;
    const userAgent = String(
      source?.getUserAgent?.() || targetSession?.getUserAgent?.() || '',
    ).trim();
    const cookieHeader = targetSession
      ? await this.videoDownloader.tools.getCookieHeader(targetSession, url)
      : '';
    const record = {
      id: this.nextId,
      filename: path.basename(outputPath),
      url,
      totalBytes: 0,
      receivedBytes: 0,
      state: 'progressing',
      savePath: '',
      startedAt: new Date().toISOString(),
      endedAt: null,
      private: isPrivate,
      ownerWindowId,
      kind: 'stream',
      streamType,
      progress: null,
      durationSeconds: 0,
      hasVideo: null,
      hasAudio: null,
      isLive: Boolean(isLive),
      audioStreamIndex: Number.isInteger(audioStreamIndex)
        ? audioStreamIndex
        : null,
      subtitleStreamIndex: Number.isInteger(subtitleStreamIndex)
        ? subtitleStreamIndex
        : null,
      audioTracks: [],
      subtitleTracks: [],
      message: 'Préparation du flux…',
      pageUrl: isHttpUrl(pageUrl) ? pageUrl : '',
    };

    this.nextId += 1;
    this.downloads.set(record.id, record);
    this.streamOutputPaths.set(record.id, outputPath);

    if (source) {
      this.downloadSources.set(record.id, source);
    }

    this.#persist();
    this.#emit(IPC.DOWNLOAD_STARTED, record, source || undefined);
    console.log(`[Médias] Téléchargement ${streamType.toUpperCase()} —`, url);
    console.log('  Destination :', outputPath);

    const context = {
      downloadId: record.id,
      url,
      extension,
      outputPath,
      pageUrl: record.pageUrl,
      cookieHeader,
      userAgent,
      audioStreamIndex: record.audioStreamIndex,
      subtitleStreamIndex: record.subtitleStreamIndex,
      isLive: record.isLive,
    };

    const streamConcurrency = this.#getStreamConcurrency();

    if (
      this.streamQueue.length > 0 ||
      this.videoDownloader.activeCount >= streamConcurrency
    ) {
      record.state = 'queued';
      record.message =
        `En attente — ${streamConcurrency} flux déjà en cours.`;
      this.queuedStreams.set(record.id, context);
      this.streamQueue.push(context);
      this.#persist();
      this.#emit(IPC.DOWNLOAD_UPDATED, record, source || undefined);
      void this.#pumpStreamQueue();
      return {
        ok: true,
        mode: 'stream',
        downloadId: record.id,
        queued: true,
      };
    }

    const launch = await this.#launchStream(context);

    return launch.ok
      ? {
          ok: true,
          mode: 'stream',
          downloadId: record.id,
        }
      : {
          ok: false,
          downloadId: record.id,
          message: launch.message,
        };
  }

  /**
   * Télécharge une piste vidéo et une piste audio séparées puis les assemble
   * avec ffmpeg. Ce chemin ne traite ni les manifestes HLS/DASH, ni les flux
   * MSE (`blob:`), ni les contenus protégés par DRM.
   *
   * @param {object} options
   * @param {string} options.videoUrl
   * @param {string} options.audioUrl
   * @param {string} [options.videoExtension]
   * @param {string} [options.audioExtension]
   * @param {string} [options.videoContentType]
   * @param {string} [options.audioContentType]
   * @param {'mp4' | 'mkv'} [options.outputExtension]
   * @param {string} [options.pageUrl]
   * @param {Electron.WebContents | null} [options.requestingWebContents]
   * @param {{windowId?: number | null, isPrivate?: boolean}} [options.access]
   * @returns {Promise<{ok: boolean, mode?: string, downloadId?: number, queued?: boolean, message?: string}>}
   */
  async startMergedDownload({
    videoUrl,
    audioUrl,
    videoExtension = 'mp4',
    audioExtension = 'm4a',
    videoContentType = '',
    audioContentType = '',
    outputExtension = 'mp4',
    pageUrl = '',
    requestingWebContents = null,
    access = {},
  }) {
    if (!isSafeDownloadUrl(videoUrl) || !isSafeDownloadUrl(audioUrl)) {
      return {
        ok: false,
        message:
          'Les deux pistes doivent être des URL HTTP(S) valides, sans ' +
          'identifiants intégrés.',
      };
    }

    if (videoUrl === audioUrl) {
      return {
        ok: false,
        message: 'Les pistes audio et vidéo sont identiques.',
      };
    }

    if (isMediaPageUrl(videoUrl) || isMediaPageUrl(audioUrl)) {
      return {
        ok: false,
        code: 'media-page',
        message: MEDIA_PAGE_MESSAGE,
      };
    }

    // Un manifeste contient déjà les pistes : le chemin HLS/DASH existant est
    // plus fiable qu'une fusion de deux entrées.
    if (getStreamType(videoExtension) || getStreamType(audioExtension)) {
      return this.startMediaDownload({
        url: videoUrl,
        extension: videoExtension,
        pageUrl,
        requestingWebContents,
        access,
      });
    }

    if (!this.videoDownloader) {
      return {
        ok: false,
        message: 'Le module de téléchargement de flux n’est pas disponible.',
      };
    }

    const capabilities = await this.videoDownloader.tools.getCapabilities();

    if (!capabilities.ffmpeg) {
      return {
        ok: false,
        message:
          'ffmpeg est introuvable. La fusion audio/vidéo est indisponible.',
      };
    }

    const directory = this.#resolveDownloadDirectory();

    if (!directory) {
      return {
        ok: false,
        message: 'Aucun dossier de téléchargement accessible.',
      };
    }

    const extension = outputExtension === 'mkv' ? 'mkv' : 'mp4';
    const outputPath = this.#getUniquePath(
      directory,
      buildMergedFilename(pageUrl, extension),
    );
    const source =
      requestingWebContents && !requestingWebContents.isDestroyed?.()
        ? requestingWebContents
        : null;
    const targetSession =
      source?.session ||
      (access.isPrivate ? null : this.session);

    if (!targetSession) {
      return {
        ok: false,
        message:
          'La session de la page d’origine n’est plus disponible. ' +
          'Rechargez la page puis réessayez.',
      };
    }

    const isPrivate =
      Boolean(access.isPrivate) ||
      targetSession !== this.session ||
      this.isPrivateSource(source || undefined);
    const ownerWindowId = isPrivate
      ? access.windowId ?? this.getWindowIdForGuest(source?.id) ?? null
      : null;
    const userAgent = String(
      source?.getUserAgent?.() || targetSession?.getUserAgent?.() || '',
    ).trim();
    const getCookieHeader = this.videoDownloader.tools.getCookieHeader;
    const videoCookieHeader =
      typeof getCookieHeader === 'function'
        ? await getCookieHeader.call(
            this.videoDownloader.tools,
            targetSession,
            videoUrl,
          )
        : '';
    const audioCookieHeader =
      typeof getCookieHeader === 'function'
        ? await getCookieHeader.call(
            this.videoDownloader.tools,
            targetSession,
            audioUrl,
          )
        : '';
    const record = {
      id: this.nextId,
      filename: path.basename(outputPath),
      url: videoUrl,
      audioUrl,
      totalBytes: 0,
      receivedBytes: 0,
      state: 'progressing',
      savePath: '',
      startedAt: new Date().toISOString(),
      endedAt: null,
      private: isPrivate,
      ownerWindowId,
      kind: 'stream',
      streamType: null,
      merged: true,
      videoExtension,
      audioExtension,
      videoContentType,
      audioContentType,
      progress: null,
      durationSeconds: 0,
      hasVideo: true,
      hasAudio: true,
      isLive: false,
      audioStreamIndex: null,
      subtitleStreamIndex: null,
      audioTracks: [],
      subtitleTracks: [],
      message: 'Préparation de la fusion audio/vidéo…',
      pageUrl: isHttpUrl(pageUrl) ? pageUrl : '',
    };

    this.nextId += 1;
    this.downloads.set(record.id, record);
    this.streamOutputPaths.set(record.id, outputPath);

    if (source) {
      this.downloadSources.set(record.id, source);
    }

    this.#persist();
    this.#emit(IPC.DOWNLOAD_STARTED, record, source || undefined);
    console.log('[Médias] Fusion audio/vidéo —', videoUrl);
    console.log('  Piste audio :', audioUrl);
    console.log('  Destination :', outputPath);

    const context = {
      downloadId: record.id,
      url: videoUrl,
      extension: videoExtension,
      outputPath,
      pageUrl: record.pageUrl,
      cookieHeader: videoCookieHeader,
      userAgent,
      secondaryUrl: audioUrl,
      secondaryExtension: audioExtension,
      secondaryCookieHeader: audioCookieHeader,
      merged: true,
      audioStreamIndex: null,
      subtitleStreamIndex: null,
      isLive: false,
    };

    const streamConcurrency = this.#getStreamConcurrency();

    if (
      this.streamQueue.length > 0 ||
      this.videoDownloader.activeCount >= streamConcurrency
    ) {
      record.state = 'queued';
      record.message =
        `En attente — ${streamConcurrency} flux déjà en cours.`;
      this.queuedStreams.set(record.id, context);
      this.streamQueue.push(context);
      this.#persist();
      this.#emit(IPC.DOWNLOAD_UPDATED, record, source || undefined);
      void this.#pumpStreamQueue();
      return {
        ok: true,
        mode: 'merged',
        downloadId: record.id,
        queued: true,
      };
    }

    const launch = await this.#launchStream(context);

    return launch.ok
      ? {
          ok: true,
          mode: 'merged',
          downloadId: record.id,
        }
      : {
          ok: false,
          downloadId: record.id,
          message: launch.message,
        };
  }

  /**
   * Télécharge une vidéo YouTube avec l'exécutable externe optionnel yt-dlp.
   * Aucun binaire n'est embarqué : si l'outil est absent, la méthode retourne
   * un message d'installation. yt-dlp est utilisé uniquement pour YouTube et
   * ne reçoit aucun contournement DRM de la part de Think-Browser.
   *
   * @param {object} options
   * @param {string} options.url
   * @param {string} [options.pageUrl]
   * @param {Electron.WebContents | null} [options.requestingWebContents]
   * @param {{windowId?: number | null, isPrivate?: boolean}} [options.access]
   * @returns {Promise<{ok: boolean, mode?: string, downloadId?: number, message?: string}>}
   */
  async startYtDlpDownload({
    url,
    pageUrl = '',
    requestingWebContents = null,
    access = {},
  }) {
    if (!isYouTubeVideoUrl(url)) {
      return {
        ok: false,
        message: 'Seules les URL de vidéos YouTube sont prises en charge.',
      };
    }

    if (!this.ytDlpDownloader) {
      return {
        ok: false,
        message: 'Le moteur yt-dlp n’est pas disponible dans cette version.',
      };
    }

    let capabilities = await this.ytDlpDownloader.getCapabilities();

    // L'utilisateur peut installer yt-dlp pendant que l'application tourne :
    // une absence mémorisée au démarrage ne doit pas bloquer jusqu'au prochain
    // lancement.
    if (!capabilities.available) {
      capabilities = await this.ytDlpDownloader.getCapabilities(true);
    }

    if (!capabilities.available) {
      return {
        ok: false,
        message: capabilities.message,
      };
    }

    let ffmpegPath = '';

    if (this.videoDownloader?.tools?.getCapabilities) {
      const mediaCapabilities =
        await this.videoDownloader.tools.getCapabilities();

      if (!mediaCapabilities.ffmpeg) {
        return {
          ok: false,
          message:
            'ffmpeg est requis pour fusionner les pistes YouTube. ' +
            'Installez ffmpeg ou utilisez le binaire fourni avec ' +
            'l’application.',
        };
      }

      ffmpegPath = String(this.videoDownloader.tools.ffmpegPath || '');
    }

    const directory = this.#resolveDownloadDirectory();

    if (!directory) {
      return {
        ok: false,
        message: 'Aucun dossier de téléchargement accessible.',
      };
    }

    const outputPath = this.#getUniquePath(
      directory,
      buildMergedFilename(pageUrl || url, 'mp4'),
    );
    const source =
      requestingWebContents && !requestingWebContents.isDestroyed?.()
        ? requestingWebContents
        : null;
    const targetSession =
      source?.session ||
      (access.isPrivate ? null : this.session);
    const isPrivate =
      Boolean(access.isPrivate) ||
      targetSession !== this.session ||
      this.isPrivateSource(source || undefined);
    const ownerWindowId = isPrivate
      ? access.windowId ?? this.getWindowIdForGuest(source?.id) ?? null
      : null;
    const userAgent = String(
      source?.getUserAgent?.() || targetSession?.getUserAgent?.() || '',
    ).trim();
    const record = {
      id: this.nextId,
      filename: path.basename(outputPath),
      url,
      totalBytes: 0,
      receivedBytes: 0,
      state: 'progressing',
      savePath: '',
      startedAt: new Date().toISOString(),
      endedAt: null,
      private: isPrivate,
      ownerWindowId,
      kind: 'stream',
      streamType: null,
      merged: true,
      ytdlp: true,
      progress: null,
      durationSeconds: 0,
      hasVideo: true,
      hasAudio: true,
      isLive: false,
      audioTracks: [],
      subtitleTracks: [],
      message: 'Préparation de yt-dlp…',
      pageUrl: isHttpUrl(pageUrl) ? pageUrl : url,
    };

    this.nextId += 1;
    this.downloads.set(record.id, record);
    this.streamOutputPaths.set(record.id, outputPath);

    if (source) {
      this.downloadSources.set(record.id, source);
    }

    this.#persist();
    this.#emit(IPC.DOWNLOAD_STARTED, record, source || undefined);
    console.log('[yt-dlp] Téléchargement YouTube —', url);
    console.log('  Destination :', outputPath);

    const started = await this.#launchYtDlp({
      downloadId: record.id,
      url,
      outputPath,
      pageUrl: record.pageUrl,
      userAgent,
      ffmpegPath,
    });

    if (!started.ok) {
      this.#finishStreamRecord(record.id, {
        ok: false,
        message: started.message,
      });
      return {
        ok: false,
        downloadId: record.id,
        message: started.message,
      };
    }

    return {
      ok: true,
      mode: 'ytdlp',
      downloadId: record.id,
    };
  }

  /**
   * Lance une tâche yt-dlp et rattache sa fin à l'enregistrement de
   * téléchargement.
   * @param {object} context
   * @returns {Promise<{ok: boolean, jobId?: string, message?: string}>}
   */
  async #launchYtDlp(context) {
    if (!this.ytDlpDownloader) {
      return {
        ok: false,
        message: 'Le moteur yt-dlp n’est pas disponible.',
      };
    }

    try {
      const result = await this.ytDlpDownloader.start({
        url: context.url,
        outputPath: context.outputPath,
        pageUrl: context.pageUrl,
        userAgent: context.userAgent,
        ffmpegPath: context.ffmpegPath,
        onUpdate: (patch) =>
          this.#updateStreamRecord(context.downloadId, patch),
        onDone: (done) =>
          this.#finishStreamRecord(context.downloadId, done),
      });

      if (result.ok && result.jobId) {
        this.streamJobIds.set(context.downloadId, result.jobId);
      }

      return result;
    } catch (error) {
      return {
        ok: false,
        message: `Le lancement de yt-dlp a échoué : ${error.message}`,
      };
    }
  }

  /**
   * Analyse un flux avant son téléchargement : pistes audio/sous-titres,
   * durée et caractère direct. Le résultat est indicatif : un échec de sonde
   * ne bloque pas le téléchargement.
   * @param {object} options
   * @param {string} options.url
   * @param {string} options.extension
   * @param {string} [options.pageUrl]
   * @param {Electron.WebContents | null} [options.requestingWebContents]
   * @param {{windowId?: number | null, isPrivate?: boolean}} [options.access]
   * @returns {Promise<object>}
   */
  async prepareMediaDownload({
    url,
    extension,
    pageUrl = '',
    requestingWebContents = null,
    access = {},
  }) {
    if (!isSafeDownloadUrl(url) || !getStreamType(extension)) {
      return {
        ok: false,
        message: 'Ce média ne peut pas être analysé comme un flux.',
      };
    }

    if (!this.videoDownloader) {
      return {
        ok: false,
        message: 'Le module d’analyse des flux n’est pas disponible.',
      };
    }

    const capabilities = await this.videoDownloader.tools.getCapabilities();

    if (!capabilities.ffprobe && !capabilities.ffmpeg) {
      return {
        ok: false,
        message: 'ffprobe et ffmpeg sont introuvables.',
      };
    }

    const source =
      requestingWebContents && !requestingWebContents.isDestroyed?.()
        ? requestingWebContents
        : null;
    const targetSession =
      source?.session ||
      (access.isPrivate ? null : this.session);
    const userAgent = String(
      source?.getUserAgent?.() || targetSession?.getUserAgent?.() || '',
    ).trim();
    const cookieHeader = targetSession
      ? await this.videoDownloader.tools.getCookieHeader(targetSession, url)
      : '';

    let metadata = null;

    try {
      metadata = await this.videoDownloader.tools.probe(url, {
        pageUrl: isHttpUrl(pageUrl) ? pageUrl : '',
        cookieHeader,
        userAgent,
      });
    } catch (error) {
      console.warn('[Médias] Préparation du flux impossible :', error.message);
    }

    return {
      ok: true,
      metadata: metadata || {
        durationSeconds: 0,
        isLive: false,
        audioTracks: [],
        subtitleTracks: [],
      },
      hasTracks:
        Boolean(metadata?.audioTracks?.length) ||
        Boolean(metadata?.subtitleTracks?.length),
      isLive: Boolean(metadata?.isLive),
      durationSeconds: metadata?.durationSeconds || 0,
    };
  }

  /**
   * Démarre effectivement un flux préparé.
   * @param {object} context
   * @returns {Promise<{ok: boolean, message?: string}>}
   */
  async #launchStream(context) {
    const record = this.downloads.get(context.downloadId);

    if (!record || record.state !== 'progressing') {
      return { ok: false, message: 'Ce téléchargement n’est plus en attente.' };
    }

    record.message = 'Analyse du flux…';
    this.#persist();
    this.#emit(
      IPC.DOWNLOAD_UPDATED,
      record,
      this.downloadSources.get(record.id),
    );

    let startResult;

    try {
      startResult = await this.videoDownloader.start({
        url: context.url,
        extension: context.extension,
        outputPath: context.outputPath,
        pageUrl: context.pageUrl,
        cookieHeader: context.cookieHeader,
        userAgent: context.userAgent,
        secondaryUrl: context.secondaryUrl || '',
        secondaryExtension: context.secondaryExtension || '',
        secondaryCookieHeader: context.secondaryCookieHeader || '',
        merged: Boolean(context.merged),
        audioStreamIndex: context.audioStreamIndex,
        subtitleStreamIndex: context.subtitleStreamIndex,
        isLive: context.isLive,
        onUpdate: (patch) => this.#updateStreamRecord(record.id, patch),
        onDone: (result) => this.#finishStreamRecord(record.id, result),
      });
    } catch (error) {
      startResult = {
        ok: false,
        message: 'Le lancement de ffmpeg a échoué.',
        error,
      };
    }

    if (!startResult.ok) {
      this.reservedPaths.delete(context.outputPath);
      this.#finishStreamRecord(record.id, {
        ok: false,
        cancelled: false,
        message:
          startResult.message || 'Le téléchargement du flux n’a pas démarré.',
        endedAt: new Date().toISOString(),
      });

      return {
        ok: false,
        message: startResult.message,
      };
    }

    this.streamJobIds.set(record.id, startResult.jobId);
    return { ok: true };
  }

  /**
   * Lance les flux en attente tant qu'un emplacement est libre.
   * @returns {Promise<void>}
   */
  async #pumpStreamQueue() {
    if (this.pumpingStreamQueue) {
      return;
    }

    this.pumpingStreamQueue = true;

    try {
      while (
        this.streamQueue.length > 0 &&
        this.videoDownloader &&
        this.videoDownloader.activeCount < this.#getStreamConcurrency()
      ) {
        const context = this.streamQueue.shift();

        if (!context) {
          continue;
        }

        this.queuedStreams.delete(context.downloadId);
        const record = this.downloads.get(context.downloadId);

        if (!record || record.state !== 'queued') {
          this.reservedPaths.delete(context.outputPath);
          this.streamOutputPaths.delete(context.downloadId);
          continue;
        }

        record.state = 'progressing';
        record.message = 'Préparation du flux…';
        this.#persist();
        this.#emit(
          IPC.DOWNLOAD_UPDATED,
          record,
          this.downloadSources.get(record.id),
        );

        const result = await this.#launchStream(context);

        if (!result.ok) {
          // Le flux a déjà été clôturé par #launchStream ; on continue avec
          // les suivants sans consommer un emplacement.
          continue;
        }
      }
    } finally {
      this.pumpingStreamQueue = false;
    }
  }

  /**
   * Retourne les téléchargements visibles dans une fenêtre. Les fichiers
   * privés restent rattachés à la fenêtre privée qui les a lancés et ne sont
   * jamais exposés aux autres fenêtres.
   * @param {{windowId?: number | null, isPrivate?: boolean}} [access]
   * @returns {object[]}
   */
  listForWindow({ windowId = null, isPrivate = false } = {}) {
    return Array.from(this.downloads.values())
      .filter((record) => {
        if (isPrivate) {
          return record.private && record.ownerWindowId === windowId;
        }

        return !record.private;
      })
      .map((record) => this.#serializeRecord(record))
      .sort((a, b) => b.id - a.id);
  }

  /**
   * Oublie les téléchargements privés d'une fenêtre fermée. Les fichiers déjà
   * enregistrés restent sur disque, mais leurs métadonnées ne sont plus
   * accessibles.
   * @param {number} windowId
   */
  purgePrivateForWindow(windowId) {
    for (const [downloadId, record] of this.downloads) {
      if (!record.private || record.ownerWindowId !== windowId) {
        continue;
      }

      const jobId = this.streamJobIds.get(downloadId);

      if (jobId) {
        this.videoDownloader?.cancel(jobId);
        this.streamJobIds.delete(downloadId);
      }

      this.#clearResumeTimer(downloadId);
      const item = this.activeItems.get(downloadId);

      if (item) {
        try {
          item.cancel();
        } catch {
          // Le téléchargement est déjà terminé.
        }

        this.activeItems.delete(downloadId);
      }

      const outputPath = this.streamOutputPaths.get(downloadId);

      if (outputPath) {
        this.reservedPaths.delete(outputPath);
        this.streamOutputPaths.delete(downloadId);
      }

      this.downloadSources.delete(downloadId);
      this.downloads.delete(downloadId);
    }

    this.streamQueue = this.streamQueue.filter((context) => {
      const record = this.downloads.get(context.downloadId);

      if (!record) {
        this.queuedStreams.delete(context.downloadId);
        this.reservedPaths.delete(context.outputPath);
        this.streamOutputPaths.delete(context.downloadId);
        return false;
      }

      return true;
    });
  }

  /**
   * Retourne un téléchargement accessible depuis une fenêtre.
   * @param {number} downloadId
   * @param {{windowId?: number | null, isPrivate?: boolean}} [access]
   * @returns {object | null}
   */
  #getAccessibleRecord(downloadId, access = {}) {
    const record = this.downloads.get(Number(downloadId));

    if (!record) {
      return null;
    }

    if (record.private) {
      return access.isPrivate && record.ownerWindowId === access.windowId
        ? record
        : null;
    }

    return access.isPrivate ? null : record;
  }

  /**
   * Affiche un fichier téléchargé dans le gestionnaire de fichiers.
   * @param {number} downloadId
   * @param {{windowId?: number | null, isPrivate?: boolean}} [access]
   * @returns {{ok: boolean, message?: string}}
   */
  showInFolder(downloadId, access = {}) {
    const record = this.#getAccessibleRecord(downloadId, access);

    if (!record || !record.savePath) {
      return {
        ok: false,
        message: 'Le fichier de ce téléchargement est introuvable.',
      };
    }

    if (!fs.existsSync(record.savePath)) {
      return {
        ok: false,
        message: 'Le fichier a été déplacé ou supprimé.',
      };
    }

    shell.showItemInFolder(record.savePath);
    return { ok: true };
  }

  /**
   * Synchronise le chemin d'un téléchargement après un renommage effectué
   * depuis la médiathèque.
   * @param {number | null} downloadId
   * @param {string} oldPath
   * @param {string} newPath
   * @returns {boolean}
   */
  updateFilePath(downloadId, oldPath, newPath) {
    if (
      typeof newPath !== 'string' ||
      !path.isAbsolute(newPath)
    ) {
      return false;
    }

    let record = Number.isInteger(downloadId)
      ? this.downloads.get(downloadId)
      : null;

    if (!record && typeof oldPath === 'string') {
      const oldKey = path.resolve(oldPath);

      record =
        Array.from(this.downloads.values()).find(
          (candidate) =>
            candidate.savePath &&
            path.resolve(candidate.savePath) === oldKey,
        ) || null;
    }

    if (!record || record.private) {
      return false;
    }

    record.savePath = path.resolve(newPath);
    record.filename = path.basename(newPath);
    this.#persist();
    this.#emit(IPC.DOWNLOAD_UPDATED, record);
    return true;
  }

  /**
   * Relance un téléchargement interrompu ou annulé à partir de son URL.
   * Electron ne permet pas de restaurer un `DownloadItem` après redémarrage ;
   * la relance crée donc un nouveau téléchargement, sans écraser l'ancien.
   * @param {number} downloadId
   * @param {{windowId?: number | null, isPrivate?: boolean}} [access]
   * @returns {Promise<{ok: boolean, message?: string, downloadId?: number}>}
   */
  async retry(downloadId, access = {}) {
    const record = this.#getAccessibleRecord(downloadId, access);

    if (!record || !isHttpUrl(record.url)) {
      return {
        ok: false,
        message: 'Ce téléchargement ne peut pas être relancé.',
      };
    }

    if (record.private) {
      return {
        ok: false,
        message:
          'La relance est indisponible en navigation privée. ' +
          'Téléchargez à nouveau le fichier depuis sa page.',
      };
    }

    this.#clearResumeTimer(record.id);

    if (record.kind === 'stream') {
      if (record.ytdlp) {
        return {
          ok: false,
          message:
            'La relance d’un téléchargement yt-dlp n’est pas disponible. ' +
            'Relancez-le depuis la page YouTube.',
        };
      }

      if (record.merged) {
        return {
          ok: false,
          message:
            'La relance d’une fusion audio/vidéo n’est pas disponible. ' +
            'Relancez-la depuis la page d’origine.',
        };
      }

      const extension = record.streamType === 'dash' ? 'mpd' : 'm3u8';

      return this.startMediaDownload({
        url: record.url,
        extension,
        pageUrl: record.pageUrl || '',
        requestingWebContents: null,
        access: { windowId: access.windowId, isPrivate: false },
        audioStreamIndex: record.audioStreamIndex,
        subtitleStreamIndex: record.subtitleStreamIndex,
        isLive: record.isLive,
      });
    }

    const item = this.activeItems.get(record.id);

    if (item && item.canResume()) {
      return this.resume(record.id, access);
    }

    try {
      this.session.downloadURL(record.url);
      return { ok: true };
    } catch (error) {
      console.warn('[Téléchargement] Relance impossible :', error.message);
      return {
        ok: false,
        message: 'La relance du téléchargement a échoué.',
      };
    }
  }

  /**
   * Annule un téléchargement actif.
   * @param {number} downloadId
   * @param {{windowId?: number | null, isPrivate?: boolean}} [access]
   * @returns {{ok: boolean, message?: string}}
   */
  cancel(downloadId, access = {}) {
    const record = this.#getAccessibleRecord(downloadId, access);

    if (!record) {
      return { ok: false, message: 'Téléchargement introuvable.' };
    }

    if (record.state === 'queued') {
      const index = this.streamQueue.findIndex(
        (context) => context.downloadId === record.id,
      );

      if (index >= 0) {
        const [context] = this.streamQueue.splice(index, 1);
        this.queuedStreams.delete(record.id);
        this.reservedPaths.delete(context.outputPath);
        this.streamOutputPaths.delete(record.id);
      }

      record.state = 'cancelled';
      record.progress = null;
      record.endedAt = new Date().toISOString();
      record.message = 'Téléchargement annulé avant son démarrage.';
      this.#persist();
      this.#emit(
        IPC.DOWNLOAD_DONE,
        record,
        this.downloadSources.get(record.id),
      );
      this.downloadSources.delete(record.id);
      void this.#pumpStreamQueue();
      return { ok: true };
    }

    if (record.state !== 'progressing') {
      return {
        ok: false,
        message: 'Ce téléchargement n’est plus en cours.',
      };
    }

    if (record.kind === 'stream') {
      const jobId = this.streamJobIds.get(record.id);
      const cancelled = jobId
        ? record.ytdlp
          ? this.ytDlpDownloader?.cancel(jobId)
          : this.videoDownloader?.cancel(jobId)
        : false;

      return cancelled
        ? { ok: true }
        : { ok: false, message: 'Ce flux ne peut plus être annulé.' };
    }

    const item = this.activeItems.get(record.id);

    if (!item) {
      return { ok: false, message: 'Ce téléchargement ne peut plus être annulé.' };
    }

    this.#clearResumeTimer(record.id);

    try {
      item.cancel();
      return { ok: true };
    } catch (error) {
      console.warn('[Téléchargement] Annulation impossible :', error.message);
      return { ok: false, message: 'L’annulation du téléchargement a échoué.' };
    }
  }

  /**
   * Arrête un flux en cours tout en conservant la partie déjà enregistrée.
   * Utilisé principalement pour les directs HLS.
   * @param {number} downloadId
   * @param {{windowId?: number | null, isPrivate?: boolean}} [access]
   * @returns {{ok: boolean, message?: string}}
   */
  stop(downloadId, access = {}) {
    const record = this.#getAccessibleRecord(downloadId, access);

    if (!record) {
      return { ok: false, message: 'Téléchargement introuvable.' };
    }

    if (record.kind !== 'stream' || record.state !== 'progressing') {
      return {
        ok: false,
        message: 'Cet enregistrement n’est plus en cours.',
      };
    }

    if (record.ytdlp) {
      return {
        ok: false,
        message:
          'Un téléchargement yt-dlp s’arrête avec « Annuler ». ' +
          'La partie déjà reçue n’est pas conservée.',
      };
    }

    const jobId = this.streamJobIds.get(record.id);
    const stopped = jobId ? this.videoDownloader?.stop(jobId) : false;

    if (!stopped) {
      return {
        ok: false,
        message: 'L’arrêt de cet enregistrement est indisponible.',
      };
    }

    // Un arrêt demandé pendant la sonde peut terminer la tâche immédiatement.
    // Dans ce cas, le message final est déjà celui de l’annulation.
    if (record.state !== 'progressing') {
      return { ok: true };
    }

    record.message = 'Arrêt demandé, finalisation du fichier…';
    this.#persist();
    this.#emit(
      IPC.DOWNLOAD_UPDATED,
      record,
      this.downloadSources.get(record.id),
    );
    return { ok: true };
  }

  /**
   * Reprend un téléchargement direct interrompu lorsque Chromium conserve
   * encore son `DownloadItem`. Après un redémarrage, la relance complète reste
   * nécessaire : Electron ne restaure pas les téléchargements partiels.
   * @param {number} downloadId
   * @param {{windowId?: number | null, isPrivate?: boolean}} [access]
   * @returns {{ok: boolean, message?: string}}
   */
  resume(downloadId, access = {}) {
    const record = this.#getAccessibleRecord(downloadId, access);

    if (!record) {
      return { ok: false, message: 'Téléchargement introuvable.' };
    }

    if (record.kind === 'stream') {
      return {
        ok: false,
        message:
          'Un flux doit être relancé depuis le début avec « Relancer ».',
      };
    }

    const item = this.activeItems.get(record.id);

    if (!item) {
      return {
        ok: false,
        message:
          'La reprise partielle n’est plus disponible après redémarrage. ' +
          'Utilisez « Relancer » pour recommencer le téléchargement.',
      };
    }

    this.#clearResumeTimer(record.id);

    try {
      if (!item.canResume()) {
        return {
          ok: false,
          message: 'Ce téléchargement ne peut pas être repris.',
        };
      }

      item.resume();
      record.state = 'progressing';
      record.message = 'Reprise du téléchargement…';
      this.#persist();
      this.#emit(
        IPC.DOWNLOAD_UPDATED,
        record,
        this.downloadSources.get(record.id),
      );
      return { ok: true };
    } catch (error) {
      console.warn('[Téléchargement] Reprise impossible :', error.message);
      return {
        ok: false,
        message: 'La reprise du téléchargement a échoué.',
      };
    }
  }

  /**
   * Force l'écriture de l'historique persistant.
   * @returns {Promise<void>}
   */
  async flush() {
    await this.downloadStore.flush();
  }

  /**
   * Arrête les processus ffmpeg avant la fermeture de l'application.
   */
  shutdown() {
    this.shuttingDown = true;

    for (const context of this.streamQueue) {
      const record = this.downloads.get(context.downloadId);

      if (record && record.state === 'queued') {
        record.state = 'interrupted';
        record.progress = null;
        record.endedAt = new Date().toISOString();
        record.message = 'File d’attente interrompue par l’arrêt de l’application.';
      }

      this.reservedPaths.delete(context.outputPath);
      this.streamOutputPaths.delete(context.downloadId);
      this.queuedStreams.delete(context.downloadId);
    }

    this.streamQueue = [];

    for (const timer of this.resumeTimers.values()) {
      clearTimeout(timer);
    }

    this.resumeTimers.clear();
    this.ytDlpDownloader?.cancelAll();
    this.videoDownloader?.cancelAll();
    this.#persist();
  }

  /**
   * Applique une mise à jour de progression à un flux.
   * @param {number} downloadId
   * @param {object} patch
   */
  #updateStreamRecord(downloadId, patch) {
    const record = this.downloads.get(downloadId);

    if (!record || record.state !== 'progressing') {
      return;
    }

    if (Object.hasOwn(patch, 'progress')) {
      const progress = Number(patch.progress);
      record.progress = Number.isFinite(progress)
        ? Math.max(0, Math.min(100, progress))
        : null;
    }

    if (Object.hasOwn(patch, 'receivedBytes')) {
      const receivedBytes = Number(patch.receivedBytes);
      record.receivedBytes =
        Number.isFinite(receivedBytes) && receivedBytes >= 0
          ? Math.round(receivedBytes)
          : record.receivedBytes;
    }

    if (Object.hasOwn(patch, 'totalBytes')) {
      const totalBytes = Number(patch.totalBytes);
      record.totalBytes =
        Number.isFinite(totalBytes) && totalBytes > 0
          ? Math.round(totalBytes)
          : record.totalBytes;
    }

    if (Object.hasOwn(patch, 'durationSeconds')) {
      const durationSeconds = Number(patch.durationSeconds);

      if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        record.durationSeconds = Math.round(durationSeconds * 10) / 10;
      }
    }

    if (typeof patch.hasVideo === 'boolean') {
      record.hasVideo = patch.hasVideo;
    }

    if (typeof patch.hasAudio === 'boolean') {
      record.hasAudio = patch.hasAudio;
    }

    if (typeof patch.streamFormat === 'string') {
      record.streamFormat = patch.streamFormat.slice(0, 80);
    }

    if (typeof patch.isLive === 'boolean') {
      record.isLive = patch.isLive;
    }

    if (Array.isArray(patch.audioTracks)) {
      record.audioTracks = patch.audioTracks.slice(0, 32);
    }

    if (Array.isArray(patch.subtitleTracks)) {
      record.subtitleTracks = patch.subtitleTracks.slice(0, 64);
    }

    if (typeof patch.message === 'string' && patch.message) {
      record.message = patch.message.slice(0, 300);
    }

    this.#persist();
    this.#emit(
      IPC.DOWNLOAD_UPDATED,
      record,
      this.downloadSources.get(downloadId),
    );
  }

  /**
   * Clôt un téléchargement de flux et libère sa réservation de chemin.
   * @param {number} downloadId
   * @param {object} result
   */
  #finishStreamRecord(downloadId, result) {
    const record = this.downloads.get(downloadId);

    if (!record) {
      return;
    }

    const source = this.downloadSources.get(downloadId);
    const outputPath = this.streamOutputPaths.get(downloadId);

    if (outputPath) {
      this.reservedPaths.delete(outputPath);
      this.streamOutputPaths.delete(downloadId);
    }

    this.streamJobIds.delete(downloadId);

    record.endedAt = result.endedAt || new Date().toISOString();
    record.message =
      typeof result.message === 'string'
        ? result.message.slice(0, 300)
        : record.message;

    if (typeof result.isLive === 'boolean') {
      record.isLive = result.isLive;
    }

    if (result.ok) {
      record.state = 'completed';
      record.savePath = result.outputPath || outputPath || record.savePath;
      record.filename = path.basename(record.savePath) || record.filename;
      record.receivedBytes = Number(result.receivedBytes) || record.receivedBytes;
      record.totalBytes = record.receivedBytes;
      record.progress = 100;
      record.message = '';

      if (Number(result.durationSeconds) > 0) {
        record.durationSeconds = result.durationSeconds;
      }

      console.log('[Médias] Fichier assemblé :', record.savePath);
    } else {
      // Un arrêt provoqué par la fermeture de l'application n'est pas une
      // annulation volontaire : la tâche doit rester « interrompue » pour
      // pouvoir être relancée au prochain démarrage.
      const stoppedByQuit = this.shuttingDown && result.cancelled;

      record.state =
        result.cancelled && !stoppedByQuit ? 'cancelled' : 'interrupted';
      record.progress = null;

      if (stoppedByQuit) {
        record.message =
          'Téléchargement interrompu par l’arrêt de l’application.';
      } else if (!result.cancelled && !record.message) {
        record.message = 'Le téléchargement du flux a été interrompu.';
      }
    }

    this.#persist();
    this.#emit(IPC.DOWNLOAD_DONE, record, source);
    this.downloadSources.delete(downloadId);

    if (result.ok) {
      this.#notifyMediaCompleted(record);
    }

    void this.#pumpStreamQueue();
  }

  /**
   * Prépare et suit un téléchargement individuel.
   * @param {Electron.DownloadItem} item
   * @param {Electron.WebContents | undefined} webContents
   * @param {Electron.Session} targetSession
   */
  #handleDownload(event, item, webContents, targetSession) {
    const filename = sanitizeFilename(item.getFilename());
    const sourceUrl = String(item.getURL?.() || '');
    const mimeType = String(item.getMimeType?.() || '');

    // Un fichier direct peut mentir sur son extension. Chromium déclenche le
    // téléchargement, puis nous annulons immédiatement une réponse HTML : le
    // lien n'a pas été bloqué par une requête HEAD préalable, mais une fausse
    // vidéo n'est jamais enregistrée comme un fichier valide.
    if (
      isDirectMediaExtension(getUrlExtension(sourceUrl)) &&
      isTextualContentType(mimeType)
    ) {
      try {
        event?.preventDefault?.();
        item.cancel();
      } catch {
        // Le téléchargement est déjà annulé ou terminé.
      }

      this.#notify(
        INVALID_DIRECT_MEDIA_MESSAGE,
        'error',
        webContents,
      );
      return;
    }

    const totalBytes = item.getTotalBytes();
    let savePath = '';
    let reservedPath = '';

    const directory = this.#resolveDownloadDirectory();

    if (directory) {
      savePath = this.#getUniquePath(directory, filename);
      reservedPath = savePath;

      try {
        item.setSavePath(savePath);
      } catch (error) {
        this.reservedPaths.delete(reservedPath);
        reservedPath = '';
        savePath = '';
        console.warn(
          '[Téléchargement] Chemin imposé impossible, choix système utilisé :',
          error.message,
        );
      }
    }

    const isPrivate =
      targetSession !== this.session ||
      Boolean(this.isPrivateSource(webContents));
    const ownerWindowId = isPrivate
      ? this.getWindowIdForGuest(webContents?.id)
      : null;

    const record = {
      id: this.nextId,
      filename,
      url: item.getURL(),
      totalBytes,
      receivedBytes: 0,
      state: 'progressing',
      savePath: savePath || item.getSavePath() || '',
      startedAt: new Date().toISOString(),
      endedAt: null,
      private: isPrivate,
      ownerWindowId,
      kind: 'file',
      progress: null,
      message: '',
      resumeAttempts: 0,
    };

    this.nextId += 1;
    this.downloads.set(record.id, record);
    this.activeItems.set(record.id, item);

    if (webContents) {
      this.downloadSources.set(record.id, webContents);
    }

    this.#persist();
    this.#emit(IPC.DOWNLOAD_STARTED, record, webContents);

    let lastLoggedProgress = -5;
    let lastLoggedReceived = 0;
    let lastBroadcastAt = 0;

    console.log('[Téléchargement] Début —', filename);
    console.log('  Source :', item.getURL());
    console.log(
      '  Taille :',
      totalBytes > 0 ? formatBytes(totalBytes) : 'taille inconnue',
    );

    if (record.savePath) {
      console.log('  Destination :', record.savePath);
    }

    item.on('updated', (_downloadEvent, state) => {
      const receivedBytes = item.getReceivedBytes();
      const currentTotal = item.getTotalBytes();

      record.receivedBytes = receivedBytes;
      record.totalBytes = currentTotal;
      record.savePath = record.savePath || item.getSavePath() || '';
      record.progress =
        currentTotal > 0
          ? Math.min(100, Math.floor((receivedBytes / currentTotal) * 100))
          : null;

      if (state === 'interrupted') {
        record.state = 'interrupted';
        console.warn('[Téléchargement] En attente de reprise —', filename);

        const attempts = Number(record.resumeAttempts) || 0;
        let canResume = false;

        if (this.activeItems.has(record.id)) {
          try {
            canResume = item.canResume();
          } catch {
            canResume = false;
          }
        }

        if (
          canResume &&
          attempts < 3 &&
          !this.resumeTimers.has(record.id)
        ) {
          record.resumeAttempts = attempts + 1;
          record.message = `Reprise automatique (${attempts + 1}/3)…`;
          const timer = setTimeout(() => {
            this.resumeTimers.delete(record.id);

            if (!this.activeItems.has(record.id)) {
              return;
            }

            try {
              item.resume();
              record.state = 'progressing';
              record.message = '';
              this.#persist();
              this.#emit(IPC.DOWNLOAD_UPDATED, record, webContents);
            } catch (error) {
              console.warn(
                '[Téléchargement] Reprise automatique impossible :',
                error.message,
              );
            }
          }, 1_000 * (attempts + 1));

          this.resumeTimers.set(record.id, timer);
        } else if (!canResume) {
          record.message =
            'Téléchargement interrompu. Utilisez « Relancer » pour le reprendre.';
        } else if (attempts >= 3) {
          record.message =
            'Reprises automatiques épuisées. Utilisez « Reprendre » ou « Relancer ».';
        }
      } else {
        record.state = 'progressing';
      }

      this.#persist();

      const now = Date.now();

      if (
        state === 'interrupted' ||
        now - lastBroadcastAt >= DOWNLOAD_PROGRESS_THROTTLE ||
        (currentTotal > 0 && receivedBytes >= currentTotal)
      ) {
        lastBroadcastAt = now;
        this.#emit(IPC.DOWNLOAD_UPDATED, record, webContents);
      }

      if (state !== 'progressing') {
        return;
      }

      if (currentTotal > 0) {
        const percent = Math.min(
          100,
          Math.floor((receivedBytes / currentTotal) * 100),
        );
        const progressStep = Math.floor(percent / 5) * 5;

        if (progressStep > lastLoggedProgress) {
          lastLoggedProgress = progressStep;
          console.log(
            `[Téléchargement] ${filename} — ${percent} % ` +
              `(${formatBytes(receivedBytes)} / ${formatBytes(currentTotal)})`,
          );
        }
      } else if (receivedBytes - lastLoggedReceived >= 5 * 1024 * 1024) {
        lastLoggedReceived = receivedBytes;
        console.log(
          `[Téléchargement] ${filename} — ${formatBytes(receivedBytes)} reçus`,
        );
      }
    });

    item.once('done', (_downloadEvent, state) => {
      this.#clearResumeTimer(record.id);

      if (reservedPath) {
        this.reservedPaths.delete(reservedPath);
        reservedPath = '';
      }

      this.activeItems.delete(record.id);

      record.state = state;
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes();
      record.savePath = item.getSavePath() || record.savePath;
      record.endedAt = new Date().toISOString();
      record.progress =
        state === 'completed'
          ? 100
          : record.totalBytes > 0
            ? Math.min(
                100,
                Math.floor(
                  (record.receivedBytes / record.totalBytes) * 100,
                ),
              )
            : null;

      this.#persist();
      this.#emit(IPC.DOWNLOAD_DONE, record, webContents);
      this.downloadSources.delete(record.id);

      if (state === 'completed') {
        this.#notifyMediaCompleted(record);
        console.log('[Téléchargement] Terminé —', filename);
        console.log('  Enregistré dans :', record.savePath);
      } else {
        console.warn(
          `[Téléchargement] ${
            state === 'cancelled' ? 'Annulé' : 'Échoué'
          } —`,
          filename,
        );
      }
    });
  }

  /**
   * Résout le dossier cible en le créant au besoin.
   * @returns {string | null}
   */
  #resolveDownloadDirectory() {
    const candidates = [
      this.getDownloadDir(),
      this.fallbackDownloadDir,
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !candidate.trim()) {
        continue;
      }

      try {
        const directory = path.resolve(candidate);
        fs.mkdirSync(directory, { recursive: true });
        return directory;
      } catch (error) {
        console.warn(
          '[Téléchargement] Dossier indisponible :',
          candidate,
          '—',
          error.message,
        );
      }
    }

    return null;
  }

  /**
   * Construit un chemin de destination sans écraser un fichier existant ni
   * entrer en collision avec un téléchargement simultané.
   * @param {string} directory
   * @param {string} filename
   * @returns {string}
   */
  #getUniquePath(directory, filename) {
    const safeName = path.basename(sanitizeFilename(filename));
    const extension = path.extname(safeName);
    const base = path.basename(safeName, extension) || 'telechargement';
    let candidate = path.join(directory, safeName);
    let counter = 1;

    if (path.dirname(candidate) !== path.resolve(directory)) {
      throw new Error('Nom de fichier de téléchargement invalide.');
    }

    while (
      fs.existsSync(candidate) ||
      this.reservedPaths.has(candidate)
    ) {
      candidate = path.join(directory, `${base} (${counter})${extension}`);
      counter += 1;
    }

    this.reservedPaths.add(candidate);
    return candidate;
  }

  /**
   * Signale à la médiathèque qu'un fichier non privé est prêt.
   * @param {object} record
   */
  #notifyMediaCompleted(record) {
    if (!this.onMediaCompleted || record.private || !record.savePath) {
      return;
    }

    try {
      const result = this.onMediaCompleted({ ...record });

      if (result && typeof result.catch === 'function') {
        result.catch((error) => {
          console.warn(
            '[Médiathèque] Ajout automatique impossible :',
            error.message,
          );
        });
      }
    } catch (error) {
      console.warn(
        '[Médiathèque] Ajout automatique impossible :',
        error.message,
      );
    }
  }

  /**
   * Persiste les téléchargements non privés.
   */
  #persist() {
    try {
      this.downloadStore.save(
        Array.from(this.downloads.values()).filter(
          (record) => !record.private,
        ),
      );
    } catch (error) {
      console.warn(
        '[Téléchargement] Persistance impossible :',
        error.message,
      );
    }
  }

  /**
   * Annule une reprise automatique programmée pour un téléchargement direct.
   * @param {number} downloadId
   */
  #clearResumeTimer(downloadId) {
    const timer = this.resumeTimers.get(downloadId);

    if (timer) {
      clearTimeout(timer);
      this.resumeTimers.delete(downloadId);
    }
  }

  /**
   * Prépare une copie d'un téléchargement pour le renderer. Les capacités de
   * reprise dépendent du `DownloadItem` vivant : elles ne sont donc jamais
   * persistées, mais recalculées à chaque diffusion.
   * @param {object} record
   * @returns {object}
   */
  #serializeRecord(record) {
    const copy = { ...record };

    if (record.kind === 'file') {
      const item = this.activeItems.get(record.id);

      try {
        copy.canResume = Boolean(item?.canResume?.());
      } catch {
        copy.canResume = false;
      }
    }

    return copy;
  }

  /**
   * Diffuse un événement de téléchargement en isolant les erreurs IPC.
   * @param {string} channel
   * @param {object} record
   * @param {Electron.WebContents | undefined} webContents
   */
  #emit(channel, record, webContents) {
    try {
      this.onEvent(channel, this.#serializeRecord(record), webContents);
    } catch (error) {
      console.warn('[Téléchargement] Diffusion impossible :', error.message);
    }
  }

  /**
   * Affiche une notification dans la fenêtre propriétaire de la webview.
   * @param {string} message
   * @param {'info' | 'success' | 'error'} variant
   * @param {Electron.WebContents | undefined} webContents
   */
  #notify(message, variant, webContents) {
    try {
      this.onEvent(IPC.APP_NOTIFICATION, { message, variant }, webContents);
    } catch (error) {
      console.warn(
        '[Téléchargement] Notification impossible :',
        error.message,
      );
    }
  }
}

module.exports = {
  DownloadManager,
  INVALID_DIRECT_MEDIA_MESSAGE,
  MEDIA_PAGE_MESSAGE,
  hasUrlCredentials,
  isDirectMediaExtension,
  isMediaPageUrl,
  isSafeDownloadUrl,
  isTextualContentType,
};
