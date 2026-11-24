'use strict';

/**
 * Tests ciblés du suivi d'historique des webviews.
 *
 * Ce test protège une régression précise : `trackGuestHistory` doit importer
 * `isHttpUrl` avant d'enregistrer une navigation. Sans cet import, la première
 * navigation HTTP lève une ReferenceError dans le processus principal.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function loadWithElectronMock(request, parent, isMain) {
  if (request === 'electron') {
    return {
      clipboard: {},
      Menu: class Menu {},
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

const {
  attachPopupController,
  buildPopupWindowOptions,
  isGoogleAuthRejectedUrl,
  isOAuthPopupUrl,
  shouldOpenPopup,
  trackGuestHistory,
} = require('../src/main/guestController');
const { buildChromeUserAgent } = require('../src/main/userAgent');

Module._load = originalLoad;

test('le suivi d’historique enregistre les navigations HTTP sans erreur', () => {
  const guest = new EventEmitter();
  guest.getTitle = () => 'Titre initial';
  guest.getURL = () => 'https://example.test/page';

  const calls = [];
  const store = {
    addHistoryEntry: (url, title) => {
      calls.push({ type: 'add', url, title });
      return { id: 'history-1', url, title };
    },
    updateHistoryEntry: (id, title, currentUrl) => {
      calls.push({ type: 'update', id, title, currentUrl });
      return true;
    },
  };

  trackGuestHistory(guest, store);

  assert.doesNotThrow(() => {
    guest.emit('did-navigate', {}, 'https://example.test/page');
  });
  assert.deepEqual(calls[0], {
    type: 'add',
    url: 'https://example.test/page',
    title: 'Titre initial',
  });

  guest.emit('page-title-updated', {}, 'Titre final');
  assert.deepEqual(calls[1], {
    type: 'update',
    id: 'history-1',
    title: 'Titre final',
    currentUrl: 'https://example.test/page',
  });

  const before = calls.length;
  guest.emit('did-navigate', {}, 'think-home://start/');
  assert.equal(calls.length, before);
});

test('les domaines OAuth connus ouvrent une fenêtre fille', () => {
  assert.equal(
    isOAuthPopupUrl('https://accounts.google.com/o/oauth2/v2/auth?client_id=x'),
    true,
  );
  assert.equal(
    isOAuthPopupUrl('https://login.microsoftonline.com/common/oauth2/v2.0/authorize'),
    true,
  );
  assert.equal(isOAuthPopupUrl('https://www.youtube.com/watch?v=x'), false);
  assert.equal(
    isOAuthPopupUrl('https://accounts.google.com.attaquant.example/login'),
    false,
  );

  assert.equal(
    shouldOpenPopup(
      {
        disposition: 'foreground-tab',
        features: '',
        frameName: '_blank',
      },
      'https://accounts.google.com/o/oauth2/v2/auth',
    ),
    true,
  );
  assert.equal(
    shouldOpenPopup(
      {
        disposition: 'foreground-tab',
        features: '',
        frameName: '_blank',
      },
      'https://example.test/page',
    ),
    false,
  );
});

test('le refus Google est reconnu sans confondre les autres pages', () => {
  assert.equal(
    isGoogleAuthRejectedUrl(
      'https://accounts.google.com/v3/signin/rejected?dsh=1&flowName=GlifWebSignIn',
    ),
    true,
  );
  assert.equal(
    isGoogleAuthRejectedUrl(
      'https://accounts.google.com/v3/signin/identifier?service=mail',
    ),
    false,
  );
  assert.equal(
    isGoogleAuthRejectedUrl(
      'https://accounts.google.com.attaquant.example/v3/signin/rejected',
    ),
    false,
  );
});

test('les fenêtres OAuth activent JavaScript, l’isolation et la partition', () => {
  const normal = buildPopupWindowOptions(
    {},
    '',
    { features: 'width=480,height=720' },
  );
  const privatePopup = buildPopupWindowOptions(
    {},
    'think-private-test',
    { features: '' },
  );

  assert.equal(normal.webPreferences.javascript, true);
  assert.equal(normal.webPreferences.nodeIntegration, false);
  assert.equal(normal.webPreferences.contextIsolation, true);
  assert.equal(normal.webPreferences.sandbox, true);
  assert.equal(normal.webPreferences.partition, undefined);
  assert.equal(privatePopup.webPreferences.partition, 'think-private-test');
  assert.equal(privatePopup.width, 520);
  assert.equal(privatePopup.height, 640);
});

test('une fenêtre fille force le User-Agent Chrome et limite ses popups', () => {
  const webContents = new EventEmitter();
  const popup = new EventEmitter();
  let userAgent = '';
  let windowOpenHandler = null;
  let authRejected = 0;

  webContents.id = 42;
  webContents.isDestroyed = () => false;
  webContents.setUserAgent = (value) => {
    userAgent = value;
  };
  webContents.setWindowOpenHandler = (handler) => {
    windowOpenHandler = handler;
  };
  popup.webContents = webContents;
  popup.setMenuBarVisibility = () => {};

  attachPopupController(popup, {
    partition: 'think-private-test',
    onAuthRejected: () => {
      authRejected += 1;
    },
  });

  assert.equal(userAgent, buildChromeUserAgent());
  assert.equal(
    windowOpenHandler({
      url: 'https://accounts.google.com/o/oauth2/v2/auth',
    }).action,
    'allow',
  );
  assert.equal(
    windowOpenHandler({ url: 'https://example.test/popup' }).action,
    'deny',
  );

  webContents.emit(
    'did-navigate',
    {},
    'https://accounts.google.com/v3/signin/rejected?dsh=1',
  );
  webContents.emit(
    'did-navigate',
    {},
    'https://accounts.google.com/v3/signin/rejected?dsh=1',
  );
  assert.equal(authRejected, 1);
});
