'use strict';

/**
 * Tests d'intrusion ciblés sur les pages internes `think-page://`.
 *
 * Les routes sont exécutées sans lancer Electron : le module `electron` est
 * remplacé par un double minimal. Les assertions portent sur les contrôles qui
 * protègent réellement les données locales : origine des requêtes API,
 * résolution des fichiers statiques, corps borné, actions privées et délégation
 * de l'atelier de développement.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const electronMock = {
  app: {
    getVersion: () => '2.0.0-test',
  },
  BrowserWindow: {
    getFocusedWindow: () => null,
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  },
  protocol: {
    registerSchemesAsPrivileged: () => {},
    handle: () => {},
  },
};

const originalLoad = Module._load;
Module._load = function loadWithElectronMock(request, parent, isMain) {
  if (request === 'electron') {
    return electronMock;
  }

  return originalLoad.call(this, request, parent, isMain);
};

const {
  DEFAULT_SETTINGS,
  PAGE_HOSTS,
} = require('../src/shared/constants');
const { handlePageRequest } = require('../src/main/pageProtocol');

/**
 * Construit une requête minimale compatible avec les routes du protocole.
 * @param {string} url
 * @param {{method?: string, headers?: Record<string, string>, body?: string}} [options]
 * @returns {object}
 */
function makeRequest(
  url,
  { method = 'GET', headers = {}, body = '', trusted = true } = {},
) {
  const finalHeaders = { ...headers };

  if (method === 'POST' && trusted) {
    finalHeaders['x-think-request'] = '1';
    finalHeaders['content-type'] =
      finalHeaders['content-type'] || 'application/json';
  }

  return {
    url,
    method,
    headers: new Headers(finalHeaders),
    text: async () => body,
  };
}

/**
 * Construit des dépendances factices et observables.
 * @param {object} [overrides]
 * @returns {object}
 */
function makeDeps(overrides = {}) {
  const calls = {
    updateSettings: [],
    inspectUrl: [],
    startUrlDownload: [],
    devHandleFile: [],
    devHandlePreview: [],
    devHandleApi: [],
    clearStorage: [],
    broadcast: [],
    clearHistory: 0,
    clearPermissions: 0,
  };

  const settings = {
    ...DEFAULT_SETTINGS,
    downloadDir: '/tmp/think-test-downloads',
    devWorkspace: '/tmp/think-test-dev',
  };

  const deps = {
    calls,
    store: {
      getSettings: () => ({ ...settings }),
      updateSettings: async (patch) => {
        calls.updateSettings.push(patch);
        Object.assign(settings, patch);
        return { ...settings };
      },
      getHistory: () => [],
      getFavorites: () => [],
      getSitePermissions: () => ({}),
      clearHistory: async () => {
        calls.clearHistory += 1;
      },
      clearSitePermissions: async () => {
        calls.clearPermissions += 1;
      },
    },
    session: {
      cookies: {
        get: async () => [],
        remove: async () => {},
      },
      getCacheSize: async () => 0,
      getUserAgent: () => 'Think-Test/2.0',
      clearStorageData: async (options) => {
        calls.clearStorage.push(options);
      },
    },
    appSession: {
      getUserAgent: () => 'Think-Test/2.0',
    },
    windowManager: {
      broadcast: (channel) => calls.broadcast.push(channel),
    },
    downloadManager: {
      listForWindow: () => [],
      getMediaCapabilities: async () => ({
        ffmpeg: true,
        ffprobe: true,
      }),
      inspectUrl: async (payload) => {
        calls.inspectUrl.push(payload);
        return { ok: true, extension: 'mp4', isMedia: true };
      },
      startUrlDownload: async (payload) => {
        calls.startUrlDownload.push(payload);
        return { ok: true, id: 7 };
      },
    },
    adBlocker: {
      isActive: () => true,
      applySetting: async () => {},
    },
    extensionManager: {
      getState: () => ({
        extensions: [],
        themes: [],
        languages: [],
      }),
      setEnabled: async () => ({ extensions: [] }),
    },
    devWorkspace: {
      handleFile: async (_request, relative) => {
        calls.devHandleFile.push(relative);
        return new Response('fichier', { status: 200 });
      },
      handlePreview: async (_request, token) => {
        calls.devHandlePreview.push(token);
        return new Response('aperçu', { status: 200 });
      },
      handleApi: async (_request, pathname) => {
        calls.devHandleApi.push(pathname);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
    isPrivateSession: false,
    ...overrides,
  };

  return deps;
}

test('les pages internes refusent une origine distante sur les API', async () => {
  const deps = makeDeps();
  const response = await handlePageRequest(
    makeRequest('think-page://config/api/update', {
      method: 'POST',
      headers: {
        origin: 'https://attaquant.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ adBlockEnabled: false }),
    }),
    deps,
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    ok: false,
    message: 'Origine refusée.',
  });
  assert.equal(deps.calls.updateSettings.length, 0);
});

test('les pages internes refusent aussi une origine opaque ou usurpée', async () => {
  const deps = makeDeps();
  const urls = [
    'think-page://config/api/update',
    'think-page://config/api/update',
  ];
  const origins = ['null', 'think-page://config.attaquant.example'];

  for (let index = 0; index < urls.length; index += 1) {
    const response = await handlePageRequest(
      makeRequest(urls[index], {
        method: 'POST',
        headers: { origin: origins[index] },
        body: '{}',
        trusted: false,
      }),
      deps,
    );

    assert.equal(response.status, 403, origins[index]);
  }

  assert.equal(deps.calls.updateSettings.length, 0);
});

test('une mutation sans en-tête de requête interne est refusée', async () => {
  const deps = makeDeps();
  const response = await handlePageRequest(
    makeRequest('think-page://config/api/update', {
      method: 'POST',
      body: JSON.stringify({ adBlockEnabled: false }),
      trusted: false,
    }),
    deps,
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    ok: false,
    message: 'Origine refusée.',
  });
  assert.equal(deps.calls.updateSettings.length, 0);
});

test('une mutation sans Origin mais avec la preuve interne est acceptée', async () => {
  const deps = makeDeps();
  const response = await handlePageRequest(
    makeRequest('think-page://config/api/update', {
      method: 'POST',
      body: JSON.stringify({ adBlockEnabled: false }),
    }),
    deps,
  );

  assert.equal(response.status, 200);
  assert.equal(deps.calls.updateSettings.length, 1);
  assert.equal(deps.calls.updateSettings[0].adBlockEnabled, false);
});

test('une preuve interne sans corps JSON est refusée', async () => {
  const deps = makeDeps();
  const response = await handlePageRequest(
    makeRequest('think-page://config/api/update', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'x-think-request': '1',
      },
      body: JSON.stringify({ adBlockEnabled: false }),
    }),
    deps,
  );

  assert.equal(response.status, 403);
  assert.equal(deps.calls.updateSettings.length, 0);
});

test('une origine same-origin explicite est acceptée', async () => {
  const deps = makeDeps();
  const response = await handlePageRequest(
    makeRequest('think-page://config/api/update', {
      method: 'POST',
      headers: { origin: 'think-page://config' },
      body: JSON.stringify({ adBlockEnabled: false }),
    }),
    deps,
  );

  assert.equal(response.status, 200);
  assert.equal(deps.calls.updateSettings.length, 1);
  assert.equal(deps.calls.updateSettings[0].adBlockEnabled, false);
});

test('about:config ne peut pas imposer un espace de développement arbitraire', async () => {
  const deps = makeDeps();
  const before = deps.store.getSettings().devWorkspace;
  const response = await handlePageRequest(
    makeRequest('think-page://config/api/update', {
      method: 'POST',
      headers: { origin: 'think-page://config' },
      body: JSON.stringify({ devWorkspace: '/tmp/espace-attaquant' }),
    }),
    deps,
  );

  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /sélecteur natif/);
  assert.equal(deps.store.getSettings().devWorkspace, before);
  assert.equal(deps.calls.updateSettings.length, 0);

  const reset = await handlePageRequest(
    makeRequest('think-page://config/api/reset-settings', {
      method: 'POST',
      headers: { origin: 'think-page://config' },
      body: '{}',
    }),
    deps,
  );
  assert.equal(reset.status, 200);
  assert.equal(deps.store.getSettings().devWorkspace, before);
});

test('les fichiers statiques ne sortent pas du dossier des pages', async () => {
  const deps = makeDeps();
  const paths = [
    '/../../package.json',
    '/..%2fpackage.json',
    '/config.js/../../package.json',
    '/config%2f..%2f..%2fpackage.json',
    '/../src/main/index.js',
  ];

  for (const pathname of paths) {
    const response = await handlePageRequest(
      makeRequest(`think-page://config${pathname}`),
      deps,
    );

    assert.equal(response.status, 404, pathname);
  }

  const crossHost = await handlePageRequest(
    makeRequest('think-page://config/dev.js'),
    deps,
  );
  assert.equal(crossHost.status, 404);
});

test('les ressources statiques autorisées ont une CSP stricte', async () => {
  const deps = makeDeps();
  const response = await handlePageRequest(
    makeRequest('think-page://security/security.js'),
    deps,
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get('content-security-policy') || '',
    /default-src 'none'/,
  );
  assert.match(
    response.headers.get('content-security-policy') || '',
    /frame-ancestors 'none'/,
  );
  assert.doesNotMatch(
    response.headers.get('content-security-policy') || '',
    /unsafe-inline|unsafe-eval/,
  );
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('les chemins /file et /preview sont délégués avec validation', async () => {
  const deps = makeDeps();
  const traversal = await handlePageRequest(
    makeRequest('think-page://dev/file/..%2f..%2fetc%2fpasswd'),
    deps,
  );
  assert.equal(traversal.status, 200);
  assert.deepEqual(deps.calls.devHandleFile, ['../../etc/passwd']);

  const invalidPreview = await handlePageRequest(
    makeRequest('think-page://dev/preview/court'),
    deps,
  );
  assert.equal(invalidPreview.status, 404);
  assert.deepEqual(deps.calls.devHandlePreview, []);

  const validToken = 'a'.repeat(36);
  const preview = await handlePageRequest(
    makeRequest(`think-page://dev/preview/${validToken}`),
    deps,
  );
  assert.equal(preview.status, 200);
  assert.deepEqual(deps.calls.devHandlePreview, [validToken]);

  const api = await handlePageRequest(
    makeRequest('think-page://dev/api/dev/state'),
    deps,
  );
  assert.equal(api.status, 200);
  assert.deepEqual(deps.calls.devHandleApi, ['/api/dev/state']);
});

test('les corps API sont bornés avant analyse JSON', async () => {
  const deps = makeDeps();
  const declared = await handlePageRequest(
    makeRequest('think-page://config/api/update', {
      method: 'POST',
      headers: {
        origin: 'think-page://config',
        'content-length': String(65 * 1024),
      },
      body: '{}',
    }),
    deps,
  );
  assert.equal(declared.status, 400);
  assert.match((await declared.json()).message, /volumineuse/);

  const actual = await handlePageRequest(
    makeRequest('think-page://config/api/update', {
      method: 'POST',
      headers: { origin: 'think-page://config' },
      body: 'x'.repeat(65 * 1024),
    }),
    deps,
  );
  assert.equal(actual.status, 400);
  assert.equal(deps.calls.updateSettings.length, 0);
});

test('les téléchargements directs depuis about:config restent dans la session normale', async () => {
  const deps = makeDeps();
  const response = await handlePageRequest(
    makeRequest('think-page://config/api/start-link', {
      method: 'POST',
      headers: { origin: 'think-page://config' },
      body: JSON.stringify({
        url: 'https://cdn.example.test/video.mp4',
        audioStreamIndex: 1,
        isLive: false,
      }),
    }),
    deps,
  );

  assert.equal(response.status, 200);
  assert.equal(deps.calls.startUrlDownload.length, 1);
  assert.deepEqual(deps.calls.startUrlDownload[0], {
    url: 'https://cdn.example.test/video.mp4',
    pageUrl: '',
    requestingWebContents: null,
    access: { isPrivate: false },
    audioStreamIndex: 1,
    subtitleStreamIndex: null,
    isLive: false,
  });
});

test('une fenêtre privée reçoit une consigne et ne démarre pas de lien direct', async () => {
  const deps = makeDeps({ isPrivateSession: true });
  const response = await handlePageRequest(
    makeRequest('think-page://config/api/start-link', {
      method: 'POST',
      headers: { origin: 'think-page://config' },
      body: JSON.stringify({ url: 'https://cdn.example.test/video.mp4' }),
    }),
    deps,
  );

  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /menu de la fenêtre/);
  assert.equal(deps.calls.startUrlDownload.length, 0);
});

test('la synthèse de sécurité est locale et expose les avis embarqués', async () => {
  const deps = makeDeps();
  const response = await handlePageRequest(
    makeRequest('think-page://security/api/summary'),
    deps,
  );

  assert.equal(response.status, 200);
  const summary = await response.json();
  assert.equal(summary.private, false);
  assert.equal(summary.counts.cookies, 0);
  assert.ok(Array.isArray(summary.securityNotices.notices));
  assert.ok(summary.securityNotices.notices.length >= 6);
  assert.ok(
    summary.securityNotices.notices.some(
      (notice) => notice.id === 'TB-SEC-001',
    ),
  );
  assert.ok(
    summary.posture.checks.some(
      (check) => check.id === 'certificate-validation' && check.status === 'pass',
    ),
  );
  assert.ok(
    summary.posture.checks.some(
      (check) => check.id === 'dev-terminal' && check.status === 'warn',
    ),
  );
});

test('about:security en fenêtre privée ne divulgue pas les données normales', async () => {
  const deps = makeDeps({ isPrivateSession: true });
  deps.store.getHistory = () => [
    {
      url: 'http://normal.example.test/',
      title: 'Session normale',
      visitedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  deps.store.getFavorites = () => [{ id: 'favori-normal' }];
  deps.store.getSitePermissions = () => ({
    'https://normal.example.test': { geolocation: 'allow' },
  });
  deps.downloadManager.listForWindow = () => [
    {
      id: 1,
      filename: 'normal.mp4',
      state: 'completed',
      totalBytes: 10,
      receivedBytes: 10,
      endedAt: '2026-01-01T00:00:00.000Z',
      kind: 'file',
    },
  ];
  deps.session.cookies.get = async () => [
    {
      domain: 'private.example.test',
      name: 'sid',
      value: 'privé',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      session: true,
      hostOnly: true,
    },
  ];

  const response = await handlePageRequest(
    makeRequest('think-page://security/api/summary'),
    deps,
  );
  const summary = await response.json();

  assert.equal(summary.private, true);
  assert.equal(summary.counts.history, 0);
  assert.equal(summary.counts.favorites, 0);
  assert.equal(summary.counts.sitePermissions, 0);
  assert.equal(summary.counts.recentDownloads, 0);
  assert.deepEqual(summary.permissions, {});
  assert.deepEqual(summary.permissionRisks, []);
  assert.deepEqual(summary.httpHistory, []);
  assert.deepEqual(summary.recentDownloads, []);
  assert.equal(summary.cookies.length, 1);
  assert.equal(summary.cookies[0].domain, 'private.example.test');
});

test('les actions destructives de about:security restent limitées à la session', async () => {
  const deps = makeDeps();
  const response = await handlePageRequest(
    makeRequest('think-page://security/api/action', {
      method: 'POST',
      headers: { origin: 'think-page://security' },
      body: JSON.stringify({ action: 'clear-cookies' }),
    }),
    deps,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(deps.calls.clearStorage, [{ storages: ['cookies'] }]);
});

test('une action inconnue ou une origine distante ne modifie rien', async () => {
  const deps = makeDeps();
  const unknown = await handlePageRequest(
    makeRequest('think-page://security/api/action', {
      method: 'POST',
      headers: { origin: 'think-page://security' },
      body: JSON.stringify({ action: 'ouvrir-backdoor' }),
    }),
    deps,
  );
  assert.equal(unknown.status, 400);

  const crossOrigin = await handlePageRequest(
    makeRequest('think-page://security/api/action', {
      method: 'POST',
      headers: { origin: 'https://attaquant.example' },
      body: JSON.stringify({ action: 'clear-data' }),
    }),
    deps,
  );
  assert.equal(crossOrigin.status, 403);
  assert.equal(deps.calls.clearStorage.length, 0);
  assert.equal(deps.calls.clearHistory, 0);
  assert.equal(deps.calls.clearPermissions, 0);
});

test('un cookie ne peut pas être supprimé avec un domaine ou un chemin forgé', async () => {
  const deps = makeDeps();
  const responses = [];

  for (const payload of [
    { action: 'delete-cookie', domain: 'exa mple.test', name: 'sid', path: '/' },
    { action: 'delete-cookie', domain: 'example.test', name: 'sid', path: 'x' },
    { action: 'delete-cookie', domain: '', name: 'sid', path: '/' },
  ]) {
    responses.push(
      await handlePageRequest(
        makeRequest('think-page://security/api/action', {
          method: 'POST',
          headers: { origin: 'think-page://security' },
          body: JSON.stringify(payload),
        }),
        deps,
      ),
    );
  }

  for (const response of responses) {
    assert.equal(response.status, 400);
  }
});

test('les hôtes inconnus et les méthodes non autorisées sont refusés', async () => {
  const deps = makeDeps();
  const unknownHost = await handlePageRequest(
    makeRequest('think-page://inconnu/'),
    deps,
  );
  assert.equal(unknownHost.status, 404);

  const postStatic = await handlePageRequest(
    makeRequest('think-page://config/', { method: 'POST' }),
    deps,
  );
  assert.equal(postStatic.status, 405);

  const head = await handlePageRequest(
    makeRequest('think-page://config/config.js', { method: 'HEAD' }),
    deps,
  );
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('PAGE_HOSTS reste la liste fermée utilisée par le routeur', () => {
  assert.deepEqual(Object.values(PAGE_HOSTS), ['config', 'security', 'dev']);
});
