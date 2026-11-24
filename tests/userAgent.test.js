'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applySessionUserAgent,
  applyWebContentsUserAgent,
  buildChromeUserAgent,
} = require('../src/main/userAgent');

test('le User-Agent présente Chrome sans révéler Electron ni Think-Browser', () => {
  const userAgent = buildChromeUserAgent();

  assert.match(
    userAgent,
    /^Mozilla\/5\.0 \([^)]+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.\d+\.\d+\.\d+ Safari\/537\.36$/,
  );
  assert.doesNotMatch(userAgent, /Electron|electron|Think-Browser/i);
});

test('le User-Agent est appliqué aux sessions et aux WebContents', () => {
  const expected = buildChromeUserAgent();
  let sessionUserAgent = '';
  let webContentsUserAgent = '';

  applySessionUserAgent({
    setUserAgent(value) {
      sessionUserAgent = value;
    },
  });
  applyWebContentsUserAgent({
    isDestroyed: () => false,
    setUserAgent(value) {
      webContentsUserAgent = value;
    },
  });

  assert.equal(sessionUserAgent, expected);
  assert.equal(webContentsUserAgent, expected);
});

test('un WebContents détruit ou incomplet est ignoré sans erreur', () => {
  assert.doesNotThrow(() => applyWebContentsUserAgent(null));
  assert.doesNotThrow(() =>
    applyWebContentsUserAgent({
      isDestroyed: () => true,
      setUserAgent() {
        throw new Error('ne doit pas être appelé');
      },
    }),
  );
});
