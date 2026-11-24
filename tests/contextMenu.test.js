'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
let template = null;
let copiedText = '';

Module._load = function load(request, parent, isMain) {
  if (request === 'electron') {
    return {
      clipboard: {
        writeText(value) {
          copiedText = value;
        },
      },
      Menu: {
        buildFromTemplate(items) {
          template = items;
          return {
            popup() {},
          };
        },
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

const { attachContextMenu } = require('../src/main/contextMenu');

Module._load = originalLoad;

/**
 * Construit une webview minimale pour le menu contextuel.
 * @returns {object}
 */
function makeGuest() {
  return {
    handler: null,
    on(event, handler) {
      if (event === 'context-menu') {
        this.handler = handler;
      }
    },
    canGoBack: () => false,
    canGoForward: () => false,
    getURL: () => 'https://site.test/watch',
    reload() {},
    inspectElement() {},
  };
}

/**
 * Construit des paramètres de clic droit complets.
 * @param {object} overrides
 * @returns {object}
 */
function makeParams(overrides = {}) {
  return {
    mediaType: 'none',
    srcURL: '',
    linkURL: '',
    pageURL: 'https://site.test/watch',
    selectionText: '',
    isEditable: false,
    editFlags: {},
    x: 10,
    y: 20,
    ...overrides,
  };
}

/**
 * Laisse les handlers asynchrones du menu se terminer.
 * @returns {Promise<void>}
 */
function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('un clic droit sur une vidéo HTML5 propose le téléchargement et la copie', async () => {
  const guest = makeGuest();
  const notifications = [];
  const downloads = [];

  attachContextMenu({
    browserWindow: {},
    guest,
    sendToWindow: (_window, channel, payload) =>
      notifications.push({ channel, payload }),
    onDownloadMedia: async (payload) => {
      downloads.push(payload);
      return { ok: true, mode: 'file' };
    },
  });

  guest.handler(
    {},
    makeParams({
      mediaType: 'video',
      srcURL: 'https://cdn.test/clip.mp4',
    }),
  );

  const downloadItem = template.find(
    (item) => item.label === 'Télécharger le média',
  );
  const copyItem = template.find(
    (item) => item.label === 'Copier le lien du média',
  );

  assert.ok(downloadItem, 'Action de téléchargement absente.');
  assert.ok(copyItem, 'Action de copie absente.');

  downloadItem.click();
  await flush();

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].url, 'https://cdn.test/clip.mp4');
  assert.equal(downloads[0].pageUrl, 'https://site.test/watch');
  assert.equal(notifications.at(-1).channel, 'app:notification');
  assert.equal(notifications.at(-1).payload.variant, 'success');

  copyItem.click();
  assert.equal(copiedText, 'https://cdn.test/clip.mp4');
});

test('une vidéo MSE YouTube résout son flux HTTP(S) avant le téléchargement', async () => {
  const guest = makeGuest();
  const downloads = [];
  const resolvedUrl =
    'https://rr1---sn.googlevideo.com/videoplayback?mime=video%2Fmp4&itag=137';

  attachContextMenu({
    browserWindow: {},
    guest,
    sendToWindow: () => {},
    resolveMediaUrl: () => resolvedUrl,
    onDownloadMedia: async (payload) => {
      downloads.push(payload);
      return { ok: true, mode: 'file' };
    },
  });

  guest.handler(
    {},
    makeParams({
      mediaType: 'video',
      srcURL: 'blob:https://www.youtube.com/abc',
      pageURL: 'https://www.youtube.com/watch?v=test',
    }),
  );

  const downloadItem = template.find(
    (item) => item.label === 'Télécharger le média',
  );

  assert.ok(downloadItem, 'Action de téléchargement absente pour YouTube.');

  downloadItem.click();
  await flush();

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].url, resolvedUrl);
  assert.equal(downloads[0].pageUrl, 'https://www.youtube.com/watch?v=test');
});

test('une vidéo adaptative propose la fusion audio + vidéo', async () => {
  const guest = makeGuest();
  const downloads = [];
  const pair = {
    videoUrl: 'https://cdn.test/video.mp4',
    audioUrl: 'https://cdn.test/audio.m4a',
    videoExtension: 'mp4',
    audioExtension: 'm4a',
    videoContentType: 'video/mp4',
    audioContentType: 'audio/mp4',
    outputExtension: 'mp4',
  };

  attachContextMenu({
    browserWindow: {},
    guest,
    sendToWindow: () => {},
    resolveMediaPair: () => pair,
    onDownloadMedia: async (payload) => {
      downloads.push(payload);
      return { ok: true, mode: 'merged' };
    },
  });

  guest.handler(
    {},
    makeParams({
      mediaType: 'video',
      srcURL: 'blob:https://www.youtube.com/abc',
      pageURL: 'https://www.youtube.com/watch?v=test',
    }),
  );

  const mergedItem = template.find(
    (item) => item.label === 'Télécharger la vidéo complète (audio + vidéo)',
  );

  assert.ok(mergedItem, 'Action de fusion absente.');

  mergedItem.click();
  await flush();

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].videoUrl, pair.videoUrl);
  assert.equal(downloads[0].audioUrl, pair.audioUrl);
  assert.equal(downloads[0].outputExtension, 'mp4');
  assert.equal(downloads[0].pageUrl, 'https://www.youtube.com/watch?v=test');
});

test('une page YouTube propose le téléchargement via yt-dlp', async () => {
  const guest = makeGuest();
  const downloads = [];
  const notifications = [];

  attachContextMenu({
    browserWindow: {},
    guest,
    sendToWindow: (_window, channel, payload) =>
      notifications.push({ channel, payload }),
    onDownloadMedia: async (payload) => {
      downloads.push(payload);
      return { ok: true, mode: 'ytdlp' };
    },
  });

  guest.handler(
    {},
    makeParams({
      pageURL: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    }),
  );

  const item = template.find(
    (candidate) => candidate.label === 'Télécharger la vidéo YouTube (yt-dlp)',
  );

  assert.ok(item, 'Action yt-dlp absente.');

  item.click();
  await flush();

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].ytdlp, true);
  assert.equal(downloads[0].url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(downloads[0].pageUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(notifications.at(-1).payload.variant, 'success');
});

test('un lien de manifeste HLS propose aussi le téléchargement média', async () => {
  const guest = makeGuest();
  const downloads = [];

  attachContextMenu({
    browserWindow: {},
    guest,
    sendToWindow: () => {},
    onDownloadMedia: async (payload) => {
      downloads.push(payload);
      return { ok: true, mode: 'stream', streamType: 'hls' };
    },
  });

  guest.handler(
    {},
    makeParams({
      linkURL: 'https://cdn.test/live/index.m3u8',
    }),
  );

  const downloadItem = template.find(
    (item) => item.label === 'Télécharger le média',
  );

  assert.ok(downloadItem, 'Action de téléchargement absente pour le manifeste.');

  downloadItem.click();
  await flush();

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].url, 'https://cdn.test/live/index.m3u8');
});
