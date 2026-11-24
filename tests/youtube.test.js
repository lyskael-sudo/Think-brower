'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getYouTubeVideoId,
  isYouTubeVideoUrl,
} = require('../src/main/youtube');

test('extrait l’identifiant des URL YouTube courantes', () => {
  const cases = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=10', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ];

  for (const [url, expected] of cases) {
    assert.equal(getYouTubeVideoId(url), expected, url);
    assert.equal(isYouTubeVideoUrl(url), true, url);
  }
});

test('refuse les pages YouTube sans vidéo et les protocoles dangereux', () => {
  const refused = [
    'https://www.youtube.com/',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/@chaine',
    'javascript:alert(1)',
    'file:///tmp/video.mp4',
    'https://example.test/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=abc',
  ];

  for (const url of refused) {
    assert.equal(isYouTubeVideoUrl(url), false, url);
  }
});
