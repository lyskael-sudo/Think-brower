'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildHomeUrl,
  formatDuration,
  getAboutPageLabel,
  getStreamType,
  hasUrlCredentials,
  isHttpUrl,
  isSafeHttpUrl,
  isTabUrl,
  resolveAboutPageUrl,
  resolveNavigationTarget,
  sanitizeFilename,
} = require('../src/shared/utils');

test('isHttpUrl accepte uniquement HTTP(S)', () => {
  assert.equal(isHttpUrl('https://example.com/video'), true);
  assert.equal(isHttpUrl('http://example.com/video'), true);
  assert.equal(isHttpUrl('file:///etc/passwd'), false);
  assert.equal(isHttpUrl('javascript:alert(1)'), false);
  assert.equal(isHttpUrl(''), false);
});

test('isTabUrl accepte aussi la page d’accueil locale', () => {
  assert.equal(isTabUrl(buildHomeUrl('bing')), true);
  assert.equal(isTabUrl('https://example.com'), true);
  assert.equal(isTabUrl('think-home://start/?engine=bing'), true);
  assert.equal(isTabUrl('about:blank'), false);
});

test('les URL avec identifiants intégrés sont refusées à la navigation', () => {
  assert.equal(hasUrlCredentials('https://user:secret@example.com/'), true);
  assert.equal(hasUrlCredentials('https://user@example.com/'), true);
  assert.equal(hasUrlCredentials('https://example.com/'), false);
  assert.equal(isSafeHttpUrl('https://user:secret@example.com/'), false);
  assert.equal(isSafeHttpUrl('https://example.com/'), true);
  assert.equal(isTabUrl('https://user:secret@example.com/'), false);
  assert.equal(
    resolveNavigationTarget('https://user:secret@example.com/'),
    null,
  );
});

test('les alias about: connus sont résolus avant toute recherche web', () => {
  assert.equal(resolveAboutPageUrl('about:config'), 'think-page://config/');
  assert.equal(
    resolveAboutPageUrl('about:security/'),
    'think-page://security/',
  );
  assert.equal(
    resolveAboutPageUrl('about:dev?tab=files#haut'),
    'think-page://dev/',
  );
  assert.equal(resolveAboutPageUrl('about:config/route'), null);
  assert.equal(resolveAboutPageUrl('about:blank'), null);
  assert.equal(
    resolveNavigationTarget('about:config?section=reseau'),
    'think-page://config/',
  );
  assert.equal(resolveNavigationTarget('about:blank'), null);
  assert.equal(
    getAboutPageLabel('think-page://config/index.html?section=reseau#haut'),
    'about:config',
  );
  assert.equal(
    getAboutPageLabel('think-page://security/?onglet=permissions'),
    'about:security',
  );
  assert.equal(getAboutPageLabel('think-page://config/route'), null);
});

test('getStreamType reconnaît HLS et DASH', () => {
  assert.equal(getStreamType('m3u8'), 'hls');
  assert.equal(getStreamType('M3U8'), 'hls');
  assert.equal(getStreamType('mpd'), 'dash');
  assert.equal(getStreamType('mp4'), null);
  assert.equal(getStreamType(null), null);
});

test('formatDuration formate les durées', () => {
  assert.equal(formatDuration(0), '');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3661), '1:01:01');
});

test('sanitizeFilename supprime les traversées de chemin', () => {
  assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFilename('..\\..\\secret.txt'), 'secret.txt');
  assert.equal(sanitizeFilename('a<b>c:d?.mp4'), 'a_b_c_d_.mp4');
  assert.equal(sanitizeFilename(''), 'telechargement');
  assert.equal(sanitizeFilename('.'), 'telechargement');
  assert.equal(sanitizeFilename('..'), 'telechargement');
  assert.equal(sanitizeFilename('...'), 'telechargement');
  assert.equal(sanitizeFilename('nom.'), 'nom');
  assert.equal(sanitizeFilename('nom   '), 'nom');
  assert.equal(sanitizeFilename('CON'), '_CON');
  assert.equal(sanitizeFilename('con.txt'), '_con.txt');
  assert.equal(sanitizeFilename('NUL.mp4'), '_NUL.mp4');
  assert.equal(sanitizeFilename('COM1'), '_COM1');
  assert.equal(sanitizeFilename('a'.repeat(300)).length, 180);
});
