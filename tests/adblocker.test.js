'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;

Module._load = function load(request, parent, isMain) {
  if (request === 'electron') {
    return {
      ipcMain: {
        removeAllListeners() {},
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

const { AdBlocker } = require('../src/main/adblocker');

Module._load = originalLoad;

function makeBlocker({ events = [] } = {}) {
  const monitor = {
    handler: null,
    setAdBlockHandler(handler) {
      this.handler = handler;
    },
    install() {},
  };

  const session = {};

  const adBlocker = new AdBlocker({
    session,
    networkMonitor: monitor,
    store: { getSettings: () => ({ adBlockEnabled: true }) },
    onStatsChanged: (stats) => events.push(stats),
    statsDelay: 0,
  });

  adBlocker.blocker = {
    isBlockingEnabled: () => true,
    enableBlockingInSession() {},
    disableBlockingInSession() {},
    onBeforeRequest(details, callback) {
      callback(
        /(?:^|[/.])ad(?:[/.]|$)/.test(new URL(details.url).pathname)
          ? { cancel: true }
          : {},
      );
    },
  };

  return { adBlocker, monitor, session };
}

test('les publicités bloquées sont comptées par webview', async () => {
  const events = [];
  const { adBlocker, monitor } = makeBlocker({ events });

  await adBlocker.applySetting(true);

  assert.equal(typeof monitor.handler, 'function');

  let response = null;
  monitor.handler(
    {
      url: 'https://ads.test/ad/banner.js',
      resourceType: 'script',
      webContentsId: 17,
    },
    (result) => {
      response = result;
    },
  );

  assert.deepEqual(response, { cancel: true });
  assert.deepEqual(adBlocker.getStats(17), {
    webContentsId: 17,
    blocked: 1,
    active: true,
  });
  assert.equal(events.at(-1).blocked, 1);

  monitor.handler(
    {
      url: 'https://site.test/app.js',
      resourceType: 'script',
      webContentsId: 17,
    },
    () => {},
  );

  assert.equal(adBlocker.getStats(17).blocked, 1);
});

test('le compteur repart de zéro au chargement du document principal', async () => {
  const { adBlocker, monitor } = makeBlocker();

  await adBlocker.applySetting(true);

  monitor.handler(
    {
      url: 'https://ads.test/ad/tracker.gif',
      resourceType: 'image',
      webContentsId: 9,
    },
    () => {},
  );

  assert.equal(adBlocker.getStats(9).blocked, 1);

  monitor.handler(
    {
      url: 'https://site.test/',
      resourceType: 'mainFrame',
      webContentsId: 9,
    },
    () => {},
  );

  assert.equal(adBlocker.getStats(9).blocked, 0);

  adBlocker.clearStats(9);
  assert.equal(adBlocker.getStats(9).blocked, 0);
});
