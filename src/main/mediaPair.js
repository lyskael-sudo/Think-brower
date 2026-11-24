'use strict';

/**
 * Think-Browser — association des pistes audio et vidéo détectées.
 *
 * YouTube et plusieurs lecteurs adaptatifs exposent une piste vidéo et une
 * piste audio séparées. Ce module choisit une paire cohérente parmi les flux
 * HTTP(S) déjà observés. Il ne capture ni ne décode les tampons MSE : aucune
 * URL `blob:` n'est acceptée ici.
 *
 * @module main/mediaPair
 */

const { isSafeHttpUrl, sanitizeFilename } = require('../shared/utils');

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mkv', 'mov']);
const AUDIO_EXTENSIONS = new Set([
  'm4a',
  'mp3',
  'aac',
  'ogg',
  'wav',
  'flac',
  'webm',
]);

/**
 * Normalise un type MIME pour les comparaisons.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeContentType(value) {
  return String(value || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

/**
 * Retourne le type de piste d'un média détecté, ou `null` si le type n'est pas
 * identifiable. Le type MIME est prioritaire : une extension `mp4` peut
 * désigner une piste audio ou vidéo.
 * @param {object} item
 * @returns {'video' | 'audio' | null}
 */
function getTrackKind(item) {
  const contentType = normalizeContentType(item?.contentType);

  if (contentType.startsWith('video/')) {
    return 'video';
  }

  if (contentType.startsWith('audio/')) {
    return 'audio';
  }

  return null;
}

/**
 * Indique si un média est un manifeste HLS/DASH. Ces manifestes sont déjà
 * assemblés par ffmpeg et ne doivent pas être associés à une piste séparée.
 * @param {object} item
 * @returns {boolean}
 */
function isManifest(item) {
  return item?.extension === 'm3u8' || item?.extension === 'mpd';
}

/**
 * Vérifie qu'un média peut participer à une fusion.
 * @param {object} item
 * @returns {boolean}
 */
function isUsableTrack(item) {
  return Boolean(
    item &&
      isSafeHttpUrl(item.url) &&
      !isManifest(item) &&
      getTrackKind(item),
  );
}

/**
 * Score de préférence pour une piste. Les flux MP4/M4A sont privilégiés car
 * ils peuvent être assemblés sans réencodage dans un fichier MP4. La taille
 * départage ensuite les variantes de même famille.
 * @param {object} item
 * @param {'video' | 'audio'} kind
 * @returns {number}
 */
function trackScore(item, kind) {
  const contentType = normalizeContentType(item.contentType);
  const extension = String(item.extension || '').toLowerCase();
  const size = Number(item.size);
  let score = Number.isFinite(size) && size > 0 ? size : 0;

  if (kind === 'video') {
    if (contentType === 'video/mp4' || extension === 'mp4') {
      score += 1e12;
    }
  } else if (
    contentType === 'audio/mp4' ||
    contentType === 'audio/m4a' ||
    contentType === 'audio/x-m4a' ||
    extension === 'm4a' ||
    extension === 'mp4'
  ) {
    score += 1e12;
  }

  return score;
}

/**
 * Sélectionne la meilleure piste d'un type donné.
 * @param {object[]} items
 * @param {'video' | 'audio'} kind
 * @returns {object | null}
 */
function bestTrack(items, kind) {
  const candidates = items.filter(
    (item) => isUsableTrack(item) && getTrackKind(item) === kind,
  );

  if (candidates.length === 0) {
    return null;
  }

  return candidates.slice().sort((a, b) => trackScore(b, kind) - trackScore(a, kind))[0];
}

/**
 * Indique si la paire peut être copiée dans un conteneur MP4 sans réencodage.
 * @param {object} video
 * @param {object} audio
 * @returns {boolean}
 */
function isMp4Compatible(video, audio) {
  const videoType = normalizeContentType(video.contentType);
  const audioType = normalizeContentType(audio.contentType);
  const videoExtension = String(video.extension || '').toLowerCase();
  const audioExtension = String(audio.extension || '').toLowerCase();

  return (
    (videoType === 'video/mp4' || videoExtension === 'mp4') &&
    (audioType === 'audio/mp4' ||
      audioType === 'audio/m4a' ||
      audioType === 'audio/x-m4a' ||
      audioExtension === 'm4a' ||
      audioExtension === 'mp4')
  );
}

/**
 * Choisit une paire audio/vidéo parmi les médias d'une même webview.
 *
 * @param {object[]} items
 * @returns {{
 *   videoUrl: string,
 *   audioUrl: string,
 *   videoExtension: string,
 *   audioExtension: string,
 *   videoContentType: string,
 *   audioContentType: string,
 *   outputExtension: 'mp4' | 'mkv'
 * } | null}
 */
function selectMediaPair(items) {
  if (!Array.isArray(items) || items.length < 2) {
    return null;
  }

  const video = bestTrack(items, 'video');
  const audio = bestTrack(items, 'audio');

  if (!video || !audio || video.url === audio.url) {
    return null;
  }

  return {
    videoUrl: video.url,
    audioUrl: audio.url,
    videoExtension: String(video.extension || 'mp4').toLowerCase(),
    audioExtension: String(audio.extension || 'm4a').toLowerCase(),
    videoContentType: String(video.contentType || ''),
    audioContentType: String(audio.contentType || ''),
    outputExtension: isMp4Compatible(video, audio) ? 'mp4' : 'mkv',
  };
}

/**
 * Construit un nom de fichier lisible pour une fusion. Une URL YouTube
 * `watch?v=...` donne `youtube-<id>.mp4` plutôt que `watch.mp4`.
 *
 * @param {string} pageUrl
 * @param {'mp4' | 'mkv'} [extension]
 * @returns {string}
 */
function buildMergedFilename(pageUrl, extension = 'mp4') {
  const safeExtension = extension === 'mkv' ? 'mkv' : 'mp4';
  let base = 'video';

  try {
    const parsed = new URL(pageUrl);
    const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();

    if (
      hostname === 'youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'music.youtube.com'
    ) {
      const videoId = parsed.searchParams.get('v');

      if (videoId && /^[a-z0-9_-]{6,20}$/i.test(videoId)) {
        base = `youtube-${videoId}`;
      }
    }

    if (base === 'video') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1] || '';
      let decoded = last;

      try {
        decoded = decodeURIComponent(last);
      } catch {
        // Le nom brut reste utilisable.
      }

      const cleaned = decoded
        .replace(/\.(?:html?|php|aspx?)$/i, '')
        .trim();

      base = cleaned && !/^(watch|video|index|player|embed)$/i.test(cleaned)
        ? cleaned
        : `${hostname || 'video'}-video`;
    }
  } catch {
    // Une page sans URL valide garde le nom générique.
  }

  const filename = sanitizeFilename(`${base}.${safeExtension}`);
  return filename.toLowerCase().endsWith(`.${safeExtension}`)
    ? filename
    : `${filename}.${safeExtension}`;
}

module.exports = {
  AUDIO_EXTENSIONS,
  VIDEO_EXTENSIONS,
  buildMergedFilename,
  getTrackKind,
  isMp4Compatible,
  selectMediaPair,
};
