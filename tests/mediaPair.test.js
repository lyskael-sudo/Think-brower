'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildMergedFilename,
  getTrackKind,
  selectMediaPair,
} = require('../src/main/mediaPair');

/**
 * Construit un média détecté minimal.
 * @param {object} overrides
 * @returns {object}
 */
function makeMedia(overrides) {
  return {
    url: 'https://rr1---sn.googlevideo.com/videoplayback?itag=1',
    extension: 'mp4',
    contentType: 'video/mp4',
    size: 1000,
    ...overrides,
  };
}

test('une paire MP4 est préférée pour une fusion sans réencodage', () => {
  const pair = selectMediaPair([
    makeMedia({
      url: 'https://cdn.test/video.webm',
      extension: 'webm',
      contentType: 'video/webm',
      size: 9000,
    }),
    makeMedia({
      url: 'https://cdn.test/video.mp4',
      extension: 'mp4',
      contentType: 'video/mp4',
      size: 5000,
    }),
    makeMedia({
      url: 'https://cdn.test/audio.webm',
      extension: 'webm',
      contentType: 'audio/webm',
      size: 3000,
    }),
    makeMedia({
      url: 'https://cdn.test/audio.m4a',
      extension: 'm4a',
      contentType: 'audio/mp4',
      size: 2000,
    }),
  ]);

  assert.ok(pair);
  assert.equal(pair.videoUrl, 'https://cdn.test/video.mp4');
  assert.equal(pair.audioUrl, 'https://cdn.test/audio.m4a');
  assert.equal(pair.outputExtension, 'mp4');
});

test('une paire WebM est fusionnée dans un conteneur MKV', () => {
  const pair = selectMediaPair([
    makeMedia({
      url: 'https://cdn.test/video.webm',
      extension: 'webm',
      contentType: 'video/webm',
      size: 9000,
    }),
    makeMedia({
      url: 'https://cdn.test/audio.webm',
      extension: 'webm',
      contentType: 'audio/webm',
      size: 3000,
    }),
  ]);

  assert.ok(pair);
  assert.equal(pair.outputExtension, 'mkv');
});

test('les manifestes et les URL non HTTP sont ignorés', () => {
  assert.equal(
    selectMediaPair([
      makeMedia({
        url: 'https://cdn.test/master.m3u8',
        extension: 'm3u8',
        contentType: 'application/vnd.apple.mpegurl',
      }),
      makeMedia({
        url: 'blob:https://youtube.com/abc',
        extension: 'mp4',
        contentType: 'video/mp4',
      }),
      makeMedia({
        url: 'https://cdn.test/audio.m4a',
        extension: 'm4a',
        contentType: 'audio/mp4',
      }),
    ]),
    null,
  );
});

test('le type de piste se fonde sur le MIME, pas seulement l’extension', () => {
  assert.equal(
    getTrackKind({
      extension: 'mp4',
      contentType: 'audio/mp4',
    }),
    'audio',
  );
  assert.equal(
    getTrackKind({
      extension: 'webm',
      contentType: 'video/webm',
    }),
    'video',
  );
  assert.equal(getTrackKind({ extension: 'mp4' }), null);
});

test('le nom de fichier YouTube utilise l’identifiant de la vidéo', () => {
  assert.equal(
    buildMergedFilename(
      'https://www.youtube.com/watch?v=yF4e6mZDVYc&list=RDyF4e6mZDVYc',
      'mp4',
    ),
    'youtube-yF4e6mZDVYc.mp4',
  );
  assert.equal(
    buildMergedFilename('https://example.test/videos/demo', 'mkv'),
    'demo.mkv',
  );
});
