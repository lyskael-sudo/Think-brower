'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decodeCandidate,
  extractMediaUrls,
} = require('../src/main/siteExtractor');

test('extractMediaUrls résout les URL absolues et relatives', () => {
  const html = `
    <video src="/media/film.mp4"></video>
    <a href="audio/podcast.mp3">podcast</a>
    <script>window.manifest = "https://cdn.example.test/live/master.m3u8?token=1";</script>
  `;

  const urls = extractMediaUrls(html, 'https://site.example/page');

  assert.deepEqual(urls.sort(), [
    'https://cdn.example.test/live/master.m3u8?token=1',
    'https://site.example/audio/podcast.mp3',
    'https://site.example/media/film.mp4',
  ]);
});

test('extractMediaUrls décode les URL JSON échappées', () => {
  const script =
    'var source = "https:\\/\\/cdn.example.test\\/video\\/index.m3u8?x=1&amp;y=2";';
  const urls = extractMediaUrls(script, 'https://site.example/');

  assert.deepEqual(urls, [
    'https://cdn.example.test/video/index.m3u8?x=1&y=2',
  ]);
});

test('extractMediaUrls déduplique et ignore les protocoles non HTTP', () => {
  const text = `
    https://cdn.example.test/a.mp4
    https://cdn.example.test/a.mp4
    blob:https://example.test/123
    data:video/mp4;base64,AAAA
    javascript:alert(1)
  `;
  const urls = extractMediaUrls(text, 'https://site.example/');

  assert.deepEqual(urls, ['https://cdn.example.test/a.mp4']);
});

test('decodeCandidate neutralise les échappements courants', () => {
  assert.equal(
    decodeCandidate('https:\\/\\/x.test\\/a.mp4?x=1&amp;y=2'),
    'https://x.test/a.mp4?x=1&y=2',
  );
});
