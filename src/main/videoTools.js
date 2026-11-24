'use strict';

/**
 * Think-Browser — outils ffmpeg et ffprobe.
 *
 * Ce module localise les binaires embarqués — ou une installation système
 * explicitement disponible — vérifie qu'ils fonctionnent réellement et fournit
 * les primitives partagées par le téléchargement de flux : lecture des
 * métadonnées et construction des en-têtes HTTP. Il ne lance jamais de
 * téléchargement complet.
 *
 * @module main/videoTools
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { FFMPEG_PROBE_TIMEOUT } = require('../shared/constants');
const { isHttpUrl } = require('../shared/utils');

const execFileAsync = promisify(execFile);

/**
 * Nettoie une valeur destinée à un en-tête HTTP ffmpeg.
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeHeaderValue(value) {
  // Les caractères de contrôle (CR, LF, NUL, etc.) ne doivent jamais
  // atteindre un en-tête HTTP, même si Chromium ou ffmpeg les rejette déjà.
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dans une application empaquetée, les binaires déclarés dans `asarUnpack`
 * restent physiquement dans `app.asar.unpacked`. `require` renvoie toutefois
 * le chemin virtuel `app.asar` : on le corrige avant de lancer le processus.
 * @param {string} candidate
 * @returns {string}
 */
function resolveUnpackedPath(candidate) {
  return String(candidate || '').replace(
    /([\\/])app\.asar([\\/])/,
    '$1app.asar.unpacked$2',
  );
}

/**
 * Retourne le chemin d'un binaire embarqué, sans faire échouer le démarrage
 * lorsque le paquet optionnel est absent.
 * @param {string} moduleName
 * @returns {string}
 */
function resolveBundledPath(moduleName) {
  try {
    const loaded = require(moduleName);

    if (typeof loaded === 'string') {
      return resolveUnpackedPath(loaded);
    }

    if (loaded && typeof loaded.path === 'string') {
      return resolveUnpackedPath(loaded.path);
    }
  } catch {
    // Le paquet n'est pas installé : le candidat suivant sera examiné.
  }

  return '';
}

/**
 * Cherche un exécutable dans le PATH du processus.
 * @param {string} binaryName
 * @returns {string}
 */
function findOnPath(binaryName) {
  const directories = String(process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean);
  const names =
    process.platform === 'win32'
      ? [`${binaryName}.exe`, binaryName]
      : [binaryName];

  for (const directory of directories) {
    for (const name of names) {
      const candidate = path.join(directory, name);

      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // Candidat absent ou non exécutable.
      }
    }
  }

  return '';
}

/**
 * Construit une liste ordonnée et sans doublon de binaires candidats.
 * @param {object} options
 * @param {string} options.envPath
 * @param {string} options.binaryName
 * @param {string[]} options.moduleNames
 * @returns {string[]}
 */
function collectCandidates({ envPath, binaryName, moduleNames }) {
  const candidates = [];
  const add = (candidate) => {
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  };

  add(envPath);
  add(findOnPath(binaryName));

  for (const moduleName of moduleNames) {
    add(resolveBundledPath(moduleName));
  }

  return candidates;
}

/**
 * Vérifie qu'un binaire existe, répond à `-version` et, pour ffmpeg, qu'il
 * sait réellement écrire puis relire un petit flux MPEG-TS.
 *
 * Certaines versions statiques se lancent correctement mais échouent sur le
 * démultiplexage TS utilisé par HLS. Cet autotest évite de sélectionner un
 * binaire inutilisable pour les flux.
 *
 * @param {string} binaryPath
 * @param {boolean} [functional]
 * @returns {Promise<{available: boolean, version: string, reason: string}>}
 */
async function verifyBinary(binaryPath, functional = false) {
  if (!binaryPath) {
    return { available: false, version: '', reason: 'chemin absent' };
  }

  try {
    await fs.promises.access(binaryPath, fs.constants.X_OK);
    const { stdout } = await execFileAsync(binaryPath, ['-version'], {
      timeout: 8_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const firstLine = String(stdout).split(/\r?\n/, 1)[0].trim();

    if (!functional) {
      return { available: true, version: firstLine, reason: '' };
    }

    const samplePath = path.join(
      os.tmpdir(),
      `think-ffmpeg-check-${process.pid}-${Date.now()}.ts`,
    );

    try {
      await execFileAsync(
        binaryPath,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=128x72:rate=10',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:sample_rate=44100',
          '-t',
          '0.4',
          '-shortest',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-f',
          'mpegts',
          '-y',
          samplePath,
        ],
        {
          timeout: 12_000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );

      await execFileAsync(
        binaryPath,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          samplePath,
          '-map',
          '0:v:0?',
          '-map',
          '0:a:0?',
          '-c',
          'copy',
          '-f',
          'null',
          '-',
        ],
        {
          timeout: 12_000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );
    } finally {
      await fs.promises.rm(samplePath, { force: true }).catch(() => {});
    }

    return { available: true, version: firstLine, reason: '' };
  } catch (error) {
    return {
      available: false,
      version: '',
      reason: String(error?.message || 'échec').split('\n')[0],
    };
  }
}

/**
 * Normalise une piste ffprobe pour l'interface de sélection.
 * @param {object} stream
 * @param {number} relativeIndex
 * @returns {object}
 */
function normalizeTrack(stream, relativeIndex) {
  const disposition = stream?.disposition || {};
  const channels = Number(stream?.channels);
  const bitrate = Number(stream?.bit_rate);

  return {
    index: Number(stream?.index),
    relativeIndex,
    codec:
      typeof stream?.codec_name === 'string'
        ? stream.codec_name.slice(0, 40)
        : '',
    language:
      typeof stream?.tags?.language === 'string'
        ? stream.tags.language.slice(0, 20)
        : '',
    title:
      typeof stream?.tags?.title === 'string'
        ? stream.tags.title.slice(0, 120)
        : '',
    channels: Number.isFinite(channels) && channels > 0 ? channels : 0,
    bitrate: Number.isFinite(bitrate) && bitrate > 0 ? bitrate : 0,
    width: Number.isFinite(Number(stream?.width))
      ? Number(stream.width)
      : 0,
    height: Number.isFinite(Number(stream?.height))
      ? Number(stream.height)
      : 0,
    isDefault: disposition.default === 1,
    isForced: disposition.forced === 1,
  };
}

/**
 * Convertit la sortie JSON de ffprobe en métadonnées normalisées.
 *
 * Les listes de pistes permettent à l'utilisateur de choisir une autre langue
 * audio ou un sous-titre avant l'assemblage. Les index conservés sont les
 * index absolus ffprobe, utilisables directement avec `-map 0:<index>`.
 *
 * @param {string} stdout
 * @returns {{
 *   durationSeconds: number,
 *   hasVideo: boolean,
 *   hasAudio: boolean,
 *   formatName: string,
 *   width: number,
 *   height: number,
 *   videoCodec: string,
 *   audioCodec: string,
 *   bitrate: number,
 *   videoTracks: object[],
 *   audioTracks: object[],
 *   subtitleTracks: object[]
 * }}
 */
function parseProbeOutput(stdout) {
  const parsed = JSON.parse(stdout);
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const videoStreams = streams.filter(
    (stream) =>
      stream?.codec_type === 'video' &&
      stream?.disposition?.attached_pic !== 1,
  );
  const audioStreams = streams.filter(
    (stream) => stream?.codec_type === 'audio',
  );
  const subtitleStreams = streams.filter(
    (stream) => stream?.codec_type === 'subtitle',
  );
  const videoStream = videoStreams[0] || null;
  const audioStream = audioStreams[0] || null;
  const streamDuration = streams.reduce((longest, stream) => {
    const duration = Number(stream?.duration);
    return Number.isFinite(duration) ? Math.max(longest, duration) : longest;
  }, 0);
  const formatDuration = Number(parsed.format?.duration);
  const durationSeconds =
    Number.isFinite(formatDuration) && formatDuration > 0
      ? formatDuration
      : streamDuration;
  const formatBitrate = Number(parsed.format?.bit_rate);
  const videoBitrate = Number(videoStream?.bit_rate);
  const bitrate =
    Number.isFinite(formatBitrate) && formatBitrate > 0
      ? formatBitrate
      : Number.isFinite(videoBitrate) && videoBitrate > 0
        ? videoBitrate
        : 0;

  return {
    durationSeconds:
      Number.isFinite(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : 0,
    hasVideo: videoStreams.length > 0,
    hasAudio: audioStreams.length > 0,
    formatName:
      typeof parsed.format?.format_name === 'string'
        ? parsed.format.format_name.slice(0, 80)
        : '',
    width: Number.isFinite(Number(videoStream?.width))
      ? Number(videoStream.width)
      : 0,
    height: Number.isFinite(Number(videoStream?.height))
      ? Number(videoStream.height)
      : 0,
    videoCodec:
      typeof videoStream?.codec_name === 'string'
        ? videoStream.codec_name.slice(0, 40)
        : '',
    audioCodec:
      typeof audioStream?.codec_name === 'string'
        ? audioStream.codec_name.slice(0, 40)
        : '',
    bitrate: Number.isFinite(bitrate) && bitrate > 0 ? bitrate : 0,
    videoTracks: videoStreams.map(normalizeTrack),
    audioTracks: audioStreams.map(normalizeTrack),
    subtitleTracks: subtitleStreams.map(normalizeTrack),
  };
}

/**
 * Localise et expose les outils média du processus principal.
 */
class VideoTools {
  constructor() {
    const ffmpegCandidates = collectCandidates({
      envPath: process.env.THINK_FFMPEG_PATH || '',
      binaryName: 'ffmpeg',
      // Le paquet distribué utilise @ffmpeg-installer ; ffmpeg-static reste un
      // repli pour le développement. L'ordre évite aussi de payer son autotest
      // MPEG-TS (qui échoue sur certaines versions statiques) à chaque
      // démarrage.
      moduleNames: ['@ffmpeg-installer/ffmpeg', 'ffmpeg-static'],
    });
    const ffprobeCandidates = collectCandidates({
      envPath: process.env.THINK_FFPROBE_PATH || '',
      binaryName: 'ffprobe',
      moduleNames: ['ffprobe-static'],
    });

    this.ffmpegCandidates = ffmpegCandidates;
    this.ffprobeCandidates = ffprobeCandidates;
    this.ffmpegPath = ffmpegCandidates[0] || '';
    this.ffprobePath = ffprobeCandidates[0] || '';

    /** @type {Promise<{ffmpeg: boolean, ffprobe: boolean, ffmpegVersion: string, ffprobeVersion: string}> | null} */
    this.capabilitiesPromise = null;
  }

  /**
   * Vérifie une seule fois la disponibilité des binaires. Le premier ffmpeg
   * qui réussit l'autotest MPEG-TS est retenu.
   * @returns {Promise<{ffmpeg: boolean, ffprobe: boolean, ffmpegVersion: string, ffprobeVersion: string}>}
   */
  getCapabilities() {
    if (!this.capabilitiesPromise) {
      this.capabilitiesPromise = Promise.all([
        this.#resolveFfmpeg(),
        this.#resolveFfprobe(),
      ]).then(([ffmpeg, ffprobe]) => {
        this.ffmpegPath = ffmpeg.path;
        this.ffprobePath = ffprobe.path;

        if (!ffmpeg.available) {
          console.warn(
            '[Médias] Aucun binaire ffmpeg fonctionnel n’a été trouvé.',
          );
        }

        if (!ffprobe.available) {
          console.warn(
            '[Médias] ffprobe est indisponible : la durée des flux ne sera pas affichée.',
          );
        }

        return {
          ffmpeg: ffmpeg.available,
          ffprobe: ffprobe.available,
          ffmpegVersion: ffmpeg.version,
          ffprobeVersion: ffprobe.version,
        };
      });
    }

    return this.capabilitiesPromise;
  }

  /**
   * Sélectionne le premier ffmpeg capable de traiter un flux MPEG-TS.
   * @returns {Promise<{path: string, available: boolean, version: string}>}
   */
  async #resolveFfmpeg() {
    for (const candidate of this.ffmpegCandidates) {
      const result = await verifyBinary(candidate, true);

      if (result.available) {
        console.log('[Médias] ffmpeg sélectionné :', candidate);

        return { path: candidate, ...result };
      }

      console.warn(
        '[Médias] ffmpeg ignoré, autotest MPEG-TS échoué :',
        candidate,
        result.reason,
      );
    }

    return { path: '', available: false, version: '' };
  }

  /**
   * Sélectionne le premier ffprobe exécutable.
   * @returns {Promise<{path: string, available: boolean, version: string}>}
   */
  async #resolveFfprobe() {
    for (const candidate of this.ffprobeCandidates) {
      const result = await verifyBinary(candidate);

      if (result.available) {
        console.log('[Médias] ffprobe sélectionné :', candidate);

        return { path: candidate, ...result };
      }
    }

    return { path: '', available: false, version: '' };
  }

  /**
   * Récupère les cookies nécessaires au manifeste et à ses segments.
   * @param {Electron.Session} targetSession
   * @param {string} url
   * @returns {Promise<string>}
   */
  async getCookieHeader(targetSession, url) {
    if (!targetSession || !isHttpUrl(url)) {
      return '';
    }

    try {
      const cookies = await targetSession.cookies.get({ url });
      return cookies
        .filter(
          (cookie) =>
            cookie &&
            typeof cookie.name === 'string' &&
            cookie.name &&
            typeof cookie.value === 'string',
        )
        .map(
          (cookie) =>
            `${sanitizeHeaderValue(cookie.name)}=${sanitizeHeaderValue(
              cookie.value,
            )}`,
        )
        .join('; ');
    } catch (error) {
      console.warn('[Médias] Lecture des cookies impossible :', error.message);
      return '';
    }
  }

  /**
   * Construit la valeur de l'option ffmpeg `-headers`.
   * @param {object} options
   * @param {string} [options.pageUrl]
   * @param {string} [options.cookieHeader]
   * @returns {string}
   */
  buildHeaderBlock({ pageUrl, cookieHeader }) {
    const lines = [];

    if (isHttpUrl(pageUrl)) {
      lines.push(`Referer: ${sanitizeHeaderValue(pageUrl)}`);
      lines.push(`Origin: ${sanitizeHeaderValue(new URL(pageUrl).origin)}`);
    }

    if (cookieHeader) {
      lines.push(`Cookie: ${sanitizeHeaderValue(cookieHeader)}`);
    }

    return lines.length ? `${lines.join('\r\n')}\r\n` : '';
  }

  /**
   * Construit les en-têtes utilisés pour lire un manifeste.
   * @param {{pageUrl?: string, cookieHeader?: string, userAgent?: string}} options
   * @returns {Record<string, string>}
   */
  buildFetchHeaders({ pageUrl, cookieHeader, userAgent } = {}) {
    const headers = {
      Accept: '*/*',
    };

    if (userAgent) {
      headers['User-Agent'] = sanitizeHeaderValue(userAgent);
    }

    if (isHttpUrl(pageUrl)) {
      headers.Referer = sanitizeHeaderValue(pageUrl);
      headers.Origin = sanitizeHeaderValue(new URL(pageUrl).origin);
    }

    if (cookieHeader) {
      headers.Cookie = sanitizeHeaderValue(cookieHeader);
    }

    return headers;
  }

  /**
   * Télécharge un petit document texte (manifeste) avec une limite de temps.
   * @param {string} url
   * @param {Record<string, string>} headers
   * @param {AbortSignal} [signal]
   * @returns {Promise<string | null>}
   */
  async #fetchText(url, headers, signal) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    try {
      const response = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      const contentLength = Number(response.headers.get('content-length'));

      if (Number.isFinite(contentLength) && contentLength > 4 * 1024 * 1024) {
        return null;
      }

      const text = await response.text();
      return text.slice(0, 4 * 1024 * 1024);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.warn(
          '[Médias] Lecture du manifeste impossible :',
          error.message.split('\n')[0],
        );
      }

      return null;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /**
   * Détermine si une playlist HLS est un direct.
   *
   * Un manifeste maître ne contient pas `#EXT-X-ENDLIST` : on suit la première
   * variante pour éviter de classer tous les directs comme des VOD (et
   * inversement).
   *
   * @param {string} url
   * @param {Record<string, string>} headers
   * @param {AbortSignal} [signal]
   * @param {number} [depth]
   * @returns {Promise<{isLive: boolean, durationSeconds: number, manifestType: string} | null>}
   */
  async #inspectHls(url, headers, signal, depth = 0) {
    const text = await this.#fetchText(url, headers, signal);

    if (!text) {
      return null;
    }

    const lines = text.split(/\r?\n/);
    const isMaster = lines.some((line) =>
      line.trim().startsWith('#EXT-X-STREAM-INF:'),
    );

    if (isMaster && depth < 2) {
      const variant = lines
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('#'));

      if (variant) {
        try {
          return await this.#inspectHls(
            new URL(variant, url).toString(),
            headers,
            signal,
            depth + 1,
          );
        } catch {
          // Variante invalide : on garde l'analyse du manifeste maître.
        }
      }
    }

    const playlistTypeMatch = text.match(
      /#EXT-X-PLAYLIST-TYPE:\s*([A-Z]+)/i,
    );
    const playlistType = playlistTypeMatch
      ? playlistTypeMatch[1].toUpperCase()
      : '';
    const hasEndList = /#EXT-X-ENDLIST/i.test(text);
    const isLive =
      !hasEndList &&
      playlistType !== 'VOD' &&
      (playlistType === 'EVENT' || !isMaster || depth >= 2);
    let durationSeconds = 0;

    for (const match of text.matchAll(/#EXTINF:\s*([0-9.]+)/gi)) {
      const value = Number(match[1]);

      if (Number.isFinite(value) && value > 0) {
        durationSeconds += value;
      }
    }

    return {
      isLive,
      durationSeconds: Math.round(durationSeconds * 10) / 10,
      manifestType: isMaster ? 'hls-master' : 'hls-media',
    };
  }

  /**
   * Analyse un manifeste DASH statique ou dynamique.
   * @param {string} text
   * @returns {{isLive: boolean, durationSeconds: number, manifestType: string}}
   */
  #inspectDash(text) {
    const typeMatch = text.match(/<MPD\b[^>]*\btype\s*=\s*["']([^"']+)["']/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'static';
    const durationMatch = text.match(
      /\bmediaPresentationDuration\s*=\s*["']([^"']+)["']/i,
    );
    let durationSeconds = 0;

    if (durationMatch) {
      const match = durationMatch[1].match(
        /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?)?$/i,
      );

      if (match) {
        const days = Number(match[1]) || 0;
        const hours = Number(match[2]) || 0;
        const minutes = Number(match[3]) || 0;
        const seconds = Number(match[4]) || 0;
        durationSeconds = days * 86400 + hours * 3600 + minutes * 60 + seconds;
      }
    }

    return {
      isLive: type === 'dynamic',
      durationSeconds: Math.round(durationSeconds * 10) / 10,
      manifestType: `dash-${type}`,
    };
  }

  /**
   * Inspecte un manifeste HLS/DASH pour distinguer un direct d'une VOD.
   * Un échec réseau reste non fatal : la sonde ffprobe peut suffire.
   * @param {string} url
   * @param {object} [options]
   * @param {string} [options.pageUrl]
   * @param {string} [options.cookieHeader]
   * @param {string} [options.userAgent]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<{isLive: boolean, durationSeconds: number, manifestType: string} | null>}
   */
  async inspectManifest(
    url,
    { pageUrl, cookieHeader, userAgent, signal } = {},
  ) {
    if (!isHttpUrl(url)) {
      return null;
    }

    let pathname = '';

    try {
      pathname = new URL(url).pathname.toLowerCase();
    } catch {
      return null;
    }

    const headers = this.buildFetchHeaders({
      pageUrl,
      cookieHeader,
      userAgent,
    });

    if (pathname.endsWith('.m3u8')) {
      return this.#inspectHls(url, headers, signal);
    }

    if (pathname.endsWith('.mpd')) {
      const text = await this.#fetchText(url, headers, signal);
      return text ? this.#inspectDash(text) : null;
    }

    return null;
  }

  /**
   * Lit les métadonnées d'un flux avec ffprobe et inspecte son manifeste.
   *
   * Une erreur de sonde n'est pas fatale : certains serveurs refusent ffprobe
   * tout en laissant ffmpeg récupérer le flux. Le téléchargement peut alors
   * continuer avec une progression indéterminée.
   *
   * @param {string} url
   * @param {object} [options]
   * @param {string} [options.pageUrl]
   * @param {string} [options.cookieHeader]
   * @param {string} [options.userAgent]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<object | null>}
   */
  async probe(url, { pageUrl, cookieHeader, userAgent, signal } = {}) {
    if (!isHttpUrl(url)) {
      return null;
    }

    const capabilities = await this.getCapabilities();
    const manifestPromise = this.inspectManifest(url, {
      pageUrl,
      cookieHeader,
      userAgent,
      signal,
    });
    let metadataPromise = Promise.resolve(null);

    if (capabilities.ffprobe && this.ffprobePath) {
      const args = [
        '-v',
        'error',
        '-show_format',
        '-show_streams',
        '-print_format',
        'json',
      ];
      const headerBlock = this.buildHeaderBlock({ pageUrl, cookieHeader });

      if (userAgent) {
        args.push('-user_agent', sanitizeHeaderValue(userAgent));
      }

      if (headerBlock) {
        args.push('-headers', headerBlock);
      }

      args.push(url);

      metadataPromise = execFileAsync(this.ffprobePath, args, {
        timeout: FFMPEG_PROBE_TIMEOUT,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        signal,
      })
        .then(({ stdout }) => parseProbeOutput(stdout))
        .catch((error) => {
          if (signal?.aborted || error.name === 'AbortError') {
            return null;
          }

          console.warn(
            '[Médias] Analyse ffprobe impossible, poursuite sans durée :',
            error.message.split('\n')[0],
          );
          return null;
        });
    }

    const [metadata, manifest] = await Promise.all([
      metadataPromise,
      manifestPromise,
    ]);

    if (!metadata && !manifest) {
      return null;
    }

    const base = metadata || {
      durationSeconds: 0,
      hasVideo: false,
      hasAudio: false,
      formatName: '',
      width: 0,
      height: 0,
      videoCodec: '',
      audioCodec: '',
      bitrate: 0,
      videoTracks: [],
      audioTracks: [],
      subtitleTracks: [],
    };

    return {
      ...base,
      durationSeconds:
        base.durationSeconds > 0
          ? base.durationSeconds
          : manifest?.durationSeconds || 0,
      isLive: Boolean(manifest?.isLive),
      manifestType: manifest?.manifestType || '',
    };
  }

  /**
   * Lit les métadonnées d'un fichier média local.
   *
   * Une erreur de sonde n'est jamais fatale : le fichier reste lisible et la
   * fiche de médiathèque conserve simplement des informations partielles.
   *
   * @param {string} filePath
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<ReturnType<typeof parseProbeOutput> | null>}
   */
  async probeFile(filePath, { signal } = {}) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
      return null;
    }

    const capabilities = await this.getCapabilities();

    if (!capabilities.ffprobe || !this.ffprobePath) {
      return null;
    }

    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      const { stdout } = await execFileAsync(
        this.ffprobePath,
        [
          '-v',
          'error',
          '-show_format',
          '-show_streams',
          '-print_format',
          'json',
          filePath,
        ],
        {
          timeout: FFMPEG_PROBE_TIMEOUT,
          windowsHide: true,
          maxBuffer: 8 * 1024 * 1024,
          signal,
        },
      );

      return parseProbeOutput(stdout);
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') {
        return null;
      }

      console.warn(
        '[Médiathèque] Analyse locale impossible :',
        error.message.split('\n')[0],
      );
      return null;
    }
  }

  /**
   * Extrait une miniature JPEG d'une vidéo locale avec ffmpeg.
   *
   * La première image est cherchée à une seconde, puis au début du fichier
   * pour les clips très courts. Un échec laisse simplement la fiche sans
   * miniature.
   *
   * @param {string} inputPath
   * @param {string} outputPath
   * @param {object} [options]
   * @param {number} [options.seekSeconds]
   * @param {number} [options.width]
   * @returns {Promise<boolean>}
   */
  async createThumbnail(
    inputPath,
    outputPath,
    { seekSeconds = 1, width = 480 } = {},
  ) {
    if (
      typeof inputPath !== 'string' ||
      !path.isAbsolute(inputPath) ||
      typeof outputPath !== 'string' ||
      !path.isAbsolute(outputPath)
    ) {
      return false;
    }

    const capabilities = await this.getCapabilities();

    if (!capabilities.ffmpeg || !this.ffmpegPath) {
      return false;
    }

    try {
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    } catch (error) {
      console.warn(
        '[Médiathèque] Dossier de miniatures inaccessible :',
        error.message,
      );
      return false;
    }

    const attempts = [...new Set([Math.max(0, seekSeconds), 0])];

    for (const seek of attempts) {
      try {
        await execFileAsync(
          this.ffmpegPath,
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-y',
            '-ss',
            String(seek),
            '-i',
            inputPath,
            '-frames:v',
            '1',
            '-an',
            '-sn',
            '-vf',
            `scale=${Math.max(64, width)}:-2`,
            '-q:v',
            '4',
            outputPath,
          ],
          {
            timeout: 20_000,
            windowsHide: true,
            maxBuffer: 2 * 1024 * 1024,
          },
        );

        const stats = await fs.promises.stat(outputPath);

        if (stats.size > 0) {
          return true;
        }
      } catch (error) {
        console.warn(
          '[Médiathèque] Miniature impossible :',
          error.message.split('\n')[0],
        );
      }

      await fs.promises.rm(outputPath, { force: true }).catch(() => {});
    }

    return false;
  }
}

module.exports = {
  VideoTools,
  parseProbeOutput,
  sanitizeHeaderValue,
};
