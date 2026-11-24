'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;

Module._load = function load(request, parent, isMain) {
  if (request === 'electron') {
    return {
      BrowserWindow: { fromWebContents: () => null },
      dialog: { showMessageBox: async () => ({ response: 0 }) },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

const { configurePermissions } = require('../src/main/permissions');

Module._load = originalLoad;

function makeSession() {
  const handlers = {};

  return {
    handlers,
    setPermissionCheckHandler(handler) {
      handlers.check = handler;
    },
    setPermissionRequestHandler(handler) {
      handlers.request = handler;
    },
    setDevicePermissionHandler(handler) {
      handlers.device = handler;
    },
    setDisplayMediaRequestHandler(handler) {
      handlers.display = handler;
    },
  };
}

function makeStore() {
  return {
    getSitePermission: () => null,
    setSitePermission: async () => {},
  };
}

test('le stockage persistant est accordé aux applications web', async () => {
  const session = makeSession();

  configurePermissions(session, { store: makeStore() });

  const webContents = { getURL: () => 'https://app.test/' };

  assert.equal(
    session.handlers.check(
      webContents,
      'persistent-storage',
      'https://app.test/',
    ),
    true,
  );

  const allowed = await new Promise((resolve) => {
    session.handlers.request(
      webContents,
      'persistent-storage',
      resolve,
      { requestingUrl: 'https://app.test/' },
    );
  });

  assert.equal(allowed, true);
});

test('les permissions sensibles restent refusées sans décision utilisateur', () => {
  const session = makeSession();

  configurePermissions(session, { store: makeStore() });

  const webContents = { getURL: () => 'https://app.test/' };

  assert.equal(
    session.handlers.check(webContents, 'media', 'https://app.test/'),
    false,
  );
  assert.equal(
    session.handlers.check(webContents, 'geolocation', 'https://app.test/'),
    false,
  );
  assert.equal(
    session.handlers.check(
      { getURL: () => 'file:///tmp/test.html' },
      'persistent-storage',
      'file:///tmp/test.html',
    ),
    false,
  );
});

test('les origines média reconnues reçoivent mediaKeySystem automatiquement', () => {
  const session = makeSession();

  configurePermissions(session, { store: makeStore() });

  const youtube = { getURL: () => 'https://www.youtube.com/watch?v=test' };

  for (const origin of [
    'https://www.youtube.com',
    'https://music.youtube.com',
    'https://youtube-nocookie.com',
    'https://youtu.be',
  ]) {
    assert.equal(
      session.handlers.check(youtube, 'mediaKeySystem', origin),
      true,
      origin,
    );
  }

  assert.equal(
    session.handlers.check(
      { getURL: () => 'https://video.example.test/' },
      'mediaKeySystem',
      'https://video.example.test/',
    ),
    false,
  );
});

test('les notifications YouTube restent soumises au consentement', async () => {
  const session = makeSession();

  configurePermissions(session, { store: makeStore() });

  const youtube = { getURL: () => 'https://www.youtube.com/' };

  assert.equal(
    session.handlers.check(
      youtube,
      'notifications',
      'https://www.youtube.com/',
    ),
    false,
  );

  const allowed = await new Promise((resolve) => {
    session.handlers.request(
      youtube,
      'notifications',
      resolve,
      { requestingUrl: 'https://www.youtube.com/' },
    );
  });

  assert.equal(allowed, false);
});
