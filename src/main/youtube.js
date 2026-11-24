'use strict';

/**
 * Think-Browser — utilitaires YouTube.
 *
 * Ces fonctions ne contactent aucun service : elles reconnaissent uniquement
 * les URL de vidéos YouTube et en extraient l'identifiant public. Le
 * téléchargement effectif est délégué à un outil externe optionnel.
 *
 * @module main/youtube
 */

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

/**
 * Extrait l'identifiant d'une URL de vidéo YouTube.
 * @param {unknown} value
 * @returns {string}
 */
function getYouTubeVideoId(value) {
  try {
    const parsed = new URL(String(value || ''));
    const hostname = parsed.hostname.toLowerCase();
    let candidate = '';

    if (hostname === 'youtu.be' || hostname === 'www.youtu.be') {
      candidate = parsed.pathname.split('/').filter(Boolean)[0] || '';
    } else if (YOUTUBE_HOSTS.has(hostname)) {
      const segments = parsed.pathname.split('/').filter(Boolean);

      if (segments[0] === 'watch') {
        candidate = parsed.searchParams.get('v') || '';
      } else if (
        ['shorts', 'live', 'embed', 'v'].includes(segments[0])
      ) {
        candidate = segments[1] || '';
      }
    }

    return /^[a-z0-9_-]{6,20}$/i.test(candidate) ? candidate : '';
  } catch {
    return '';
  }
}

/**
 * Indique si une URL désigne une vidéo YouTube individuelle.
 * Les playlists, les pages de chaîne et les URL non HTTP(S) sont refusées.
 * @param {unknown} value
 * @returns {boolean}
 */
function isYouTubeVideoUrl(value) {
  try {
    const parsed = new URL(String(value || ''));

    if (!/^https?:$/i.test(parsed.protocol)) {
      return false;
    }

    return Boolean(getYouTubeVideoId(value));
  } catch {
    return false;
  }
}

module.exports = {
  YOUTUBE_HOSTS,
  getYouTubeVideoId,
  isYouTubeVideoUrl,
};
