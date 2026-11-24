'use strict';

/**
 * Think-Browser — pages internes `about:config`, `about:security` et
 * `about:dev`.
 *
 * Les pages sont des documents statiques servis par le protocole
 * `think-page`. Elles ne reçoivent aucun preload et n'ont pas accès à Node.js.
 * Les données sensibles (cookies, permissions, réglages) sont exposées par des
 * routes JSON same-origin, uniquement sur la session qui a chargé la page.
 *
 * @module main/pageProtocol
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  dialog,
  protocol,
} = require('electron');
const {
  DEFAULT_SETTINGS,
  IPC,
  MAX_STREAM_DOWNLOADS_LIMIT,
  MIN_STREAM_DOWNLOADS,
  PAGE_HOSTS,
  PAGE_SCHEME,
  PAGE_URLS,
  SEARCH_ENGINES,
} = require('../shared/constants');
const {
  EXTENSION_IDS,
  isExtensionEnabled,
} = require('../shared/extensions');
const { isHttpUrl } = require('../shared/utils');
const { clearBrowsingData } = require('./browsingData');
const { collectSecuritySummary } = require('./securityPosture');

const PAGE_ROOT = path.resolve(__dirname, '..', 'renderer', 'pages');

/** @type {WeakSet<Electron.Session>} */
const installedSessions = new WeakSet();

let schemeRegistered = false;

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
});

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const API_REQUEST_HEADER = 'x-think-request';

const API_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
});

/**
 * Déclare le schéma avant la création des sessions.
 */
function registerPageScheme() {
  if (schemeRegistered) {
    return;
  }

  protocol.registerSchemesAsPrivileged([
    {
      scheme: PAGE_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        stream: false,
      },
    },
  ]);

  schemeRegistered = true;
}

/**
 * Construit une réponse texte.
 * @param {string} body
 * @param {number} status
 * @returns {Response}
 */
function textResponse(body, status) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

/**
 * Construit une réponse JSON.
 * @param {unknown} payload
 * @param {number} [status]
 * @returns {Response}
 */
function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: API_HEADERS,
  });
}

/**
 * Résout un fichier statique autorisé pour un hôte interne.
 * @param {string} host
 * @param {string} pathname
 * @returns {string | null}
 */
function resolvePageAsset(host, pathname) {
  let decoded = '/';

  try {
    decoded = decodeURIComponent(pathname || '/');
  } catch {
    return null;
  }

  const relative =
    decoded === '/' || decoded === '' || decoded === '/index.html'
      ? `${host}.html`
      : decoded.replace(/^\/+/, '');

  if (relative === 'pages.css') {
    // Feuille de styles commune aux pages internes.
  } else if (
    !new RegExp(`^${host}\\.(?:html|css|js)$`).test(relative)
  ) {
    return null;
  }

  if (relative.includes('..') || relative.includes('/') || relative.includes('\\')) {
    return null;
  }

  const candidate = path.resolve(PAGE_ROOT, relative);
  const prefix = `${PAGE_ROOT}${path.sep}`;

  if (candidate !== PAGE_ROOT && !candidate.startsWith(prefix)) {
    return null;
  }

  return candidate;
}

/**
 * Sert un document ou une ressource statique interne.
 * @param {Request} request
 * @param {string} host
 * @returns {Promise<Response>}
 */
async function servePageAsset(request, host) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return textResponse('Méthode non autorisée.', 405);
  }

  const url = new URL(request.url);
  const assetPath = resolvePageAsset(host, url.pathname);

  if (!assetPath) {
    return textResponse('Ressource introuvable.', 404);
  }

  try {
    const content = await fs.promises.readFile(assetPath);
    const extension = path.extname(assetPath).toLowerCase();
    const contentType = MIME_TYPES[extension];

    if (!contentType) {
      return textResponse('Type de ressource non autorisé.', 415);
    }

    return new Response(request.method === 'HEAD' ? null : content, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'content-security-policy': CONTENT_SECURITY_POLICY,
      },
    });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[Pages] Lecture impossible :', error.message);
    }

    return textResponse('Ressource introuvable.', 404);
  }
}

/**
 * Vérifie l'origine d'une requête API. Une page distante ne doit pas pouvoir
 * déclencher une modification via une requête intersite.
 * @param {Request} request
 * @param {string} host
 * @returns {boolean}
 */
function isAllowedApiOrigin(request, host) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return true;
  }

  if (request.method !== 'POST') {
    return false;
  }

  // Le schéma `think-page` est standard mais Chromium sérialise son origine
  // en `null` pour les fetch : l'en-tête Origin est donc absent. La preuve
  // same-origin repose sur un en-tête personnalisé et un corps JSON, qui ne
  // peuvent pas être envoyés par un formulaire intersite ni par un fetch
  // `no-cors` (préflight CORS obligatoire, refusé par `corsEnabled: false`).
  const contentType = (request.headers.get('content-type') || '').trim();
  const trustedRequest =
    request.headers.get(API_REQUEST_HEADER) === '1' &&
    /^application\/json(?:\s*;|$)/i.test(contentType);

  if (!trustedRequest) {
    return false;
  }

  const origin = request.headers.get('origin');

  // Origine opaque ou absente : la requête vient du document interne, car un
  // site distant ne peut pas ajouter cet en-tête sans passer un préflight CORS.
  if (!origin || origin === 'null') {
    return true;
  }

  try {
    const parsed = new URL(origin);
    return (
      parsed.protocol === `${PAGE_SCHEME}:` &&
      parsed.hostname === host &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port
    );
  } catch {
    return false;
  }
}

/**
 * Lit un corps JSON borné.
 * @param {Request} request
 * @returns {Promise<object>}
 */
async function readJsonBody(request) {
  const declaredLength = Number(request.headers.get('content-length') || 0);

  if (declaredLength > 64 * 1024) {
    throw new Error('Requête trop volumineuse.');
  }

  const text = await request.text();

  if (text.length > 64 * 1024) {
    throw new Error('Requête trop volumineuse.');
  }

  let parsed = {};

  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Corps JSON invalide.');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Corps JSON invalide.');
  }

  return parsed;
}

/**
 * Construit l'état de la page `about:config`.
 * @param {object} deps
 * @returns {Promise<object>}
 */
async function buildConfigState(deps) {
  const settings = deps.store.getSettings();

  return {
    settings,
    searchEngines: Object.entries(SEARCH_ENGINES).map(([id, engine]) => ({
      id,
      ...engine,
    })),
    extensions: deps.extensionManager.getState(),
    capabilities: deps.downloadManager
      ? await deps.downloadManager.getMediaCapabilities()
      : { ffmpeg: false, ffprobe: false },
    adBlockActive: Boolean(deps.adBlocker?.isActive()),
    app: {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    userAgent: String(
      deps.session?.getUserAgent?.() ||
        deps.appSession?.getUserAgent?.() ||
        '',
    ),
    limits: {
      minStreamDownloads: MIN_STREAM_DOWNLOADS,
      maxStreamDownloads: MAX_STREAM_DOWNLOADS_LIMIT,
    },
    private: Boolean(deps.isPrivateSession),
    pages: { ...PAGE_URLS },
  };
}

/**
 * Valide les extensions avant une modification de thème ou de langue.
 * @param {object} deps
 * @param {object} patch
 */
function assertExtensionOptionsEnabled(deps, patch) {
  const settings = deps.store.getSettings();

  if (
    Object.prototype.hasOwnProperty.call(patch, 'theme') &&
    !isExtensionEnabled(settings.enabledExtensions, EXTENSION_IDS.THEME)
  ) {
    throw new Error('Activez d’abord l’extension Thèmes.');
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, 'language') &&
    !isExtensionEnabled(settings.enabledExtensions, EXTENSION_IDS.LANGUAGE)
  ) {
    throw new Error('Activez d’abord l’extension Langues.');
  }
}

/**
 * Applique un patch de paramètres depuis `about:config`.
 * @param {object} deps
 * @param {object} patch
 * @returns {Promise<object>}
 */
async function updateConfig(deps, patch) {
  assertExtensionOptionsEnabled(deps, patch);

  // L’espace de travail de about:dev ne se change que par le sélecteur natif.
  // about:config peut conserver la valeur courante lors d’une réinitialisation,
  // mais jamais imposer un nouveau chemin.
  if (Object.prototype.hasOwnProperty.call(patch, 'devWorkspace')) {
    const current = deps.store.getSettings().devWorkspace || '';
    const requested =
      typeof patch.devWorkspace === 'string'
        ? patch.devWorkspace.trim()
        : null;

    if (requested === null || requested !== current) {
      throw new Error(
        'L’espace de développement doit être choisi avec le sélecteur natif ' +
          'dans about:dev.',
      );
    }
  }

  const updated = await deps.store.updateSettings(patch);

  if (
    Object.prototype.hasOwnProperty.call(patch, 'adBlockEnabled') &&
    deps.adBlocker
  ) {
    await deps.adBlocker.applySetting(updated.adBlockEnabled);
  }

  return updated;
}

/**
 * Ouvre le sélecteur natif de dossier de téléchargement.
 * @param {object} deps
 * @returns {Promise<object>}
 */
async function chooseDownloadDirectory(deps) {
  const options = {
    title: 'Choisir le dossier de téléchargement',
    defaultPath: deps.store.getSettings().downloadDir,
    properties: ['openDirectory', 'createDirectory'],
  };
  const parentWindow = BrowserWindow.getFocusedWindow();
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, settings: deps.store.getSettings() };
  }

  const settings = await deps.store.updateSettings({
    downloadDir: result.filePaths[0],
  });

  return { canceled: false, settings };
}

/**
 * Construit l'URL d'un cookie pour `cookies.remove`.
 * @param {object} payload
 * @returns {string | null}
 */
function buildCookieUrl(payload) {
  if (
    !payload ||
    typeof payload.domain !== 'string' ||
    !payload.domain.trim() ||
    typeof payload.name !== 'string' ||
    !payload.name ||
    typeof payload.path !== 'string' ||
    !payload.path.startsWith('/')
  ) {
    return null;
  }

  const domain = payload.domain.replace(/^\./, '').toLowerCase();
  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(domain);
  const isHostname =
    domain.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
      domain,
    );

  if (
    (!isIpv4 && !isHostname) ||
    /[?#@\\\s\u0000-\u001f]/.test(payload.path)
  ) {
    return null;
  }

  return `${payload.secure ? 'https' : 'http'}://${domain}${payload.path}`;
}

/**
 * Exécute une action de la page `about:security`.
 * @param {object} deps
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function runSecurityAction(deps, payload) {
  const action = typeof payload.action === 'string' ? payload.action : '';

  if (action === 'clear-data') {
    await clearBrowsingData(deps.session);
    deps.windowManager?.broadcast(IPC.BROWSING_DATA_CLEARED);
    return { ok: true, message: 'Données de navigation effacées.' };
  }

  if (action === 'reset-permissions') {
    if (deps.isPrivateSession) {
      return {
        ok: false,
        message:
          'Les permissions privées sont éphémères et disparaissent à la ' +
          'fermeture de la fenêtre.',
      };
    }

    await deps.store.clearSitePermissions();
    return { ok: true, message: 'Permissions des sites réinitialisées.' };
  }

  if (action === 'clear-history') {
    if (deps.isPrivateSession) {
      return {
        ok: false,
        message: 'L’historique global ne peut pas être effacé depuis une fenêtre privée.',
      };
    }

    await deps.store.clearHistory();
    return { ok: true, message: 'Historique effacé.' };
  }

  if (action === 'clear-cookies') {
    await deps.session.clearStorageData({ storages: ['cookies'] });
    return { ok: true, message: 'Cookies supprimés pour cette session.' };
  }

  if (action === 'delete-cookie') {
    const url = buildCookieUrl(payload);

    if (!url || !isHttpUrl(url)) {
      return { ok: false, message: 'Cookie invalide.' };
    }

    await deps.session.cookies.remove(url, payload.name);
    return { ok: true, message: 'Cookie supprimé.' };
  }

  return { ok: false, message: 'Action inconnue.' };
}

/**
 * Traite une route API de `about:config`.
 * @param {Request} request
 * @param {string} pathname
 * @param {object} deps
 * @returns {Promise<Response>}
 */
async function handleConfigApi(request, pathname, deps) {
  if (pathname === '/api/state' && request.method === 'GET') {
    return jsonResponse(await buildConfigState(deps));
  }

  if (pathname === '/api/update' && request.method === 'POST') {
    try {
      const patch = await readJsonBody(request);
      const settings = await updateConfig(deps, patch);
      return jsonResponse({
        ok: true,
        settings,
        state: await buildConfigState(deps),
      });
    } catch (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }
  }

  if (
    pathname === '/api/choose-download-dir' &&
    request.method === 'POST'
  ) {
    try {
      const result = await chooseDownloadDirectory(deps);
      return jsonResponse({
        ...result,
        state: await buildConfigState(deps),
      });
    } catch (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }
  }

  if (pathname === '/api/inspect-link' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request);
      return jsonResponse(
        await deps.downloadManager.inspectUrl({
          url: typeof body.url === 'string' ? body.url : '',
          pageUrl: '',
          requestingWebContents: null,
          access: { isPrivate: Boolean(deps.isPrivateSession) },
          probeStreams: true,
        }),
      );
    } catch (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }
  }

  if (pathname === '/api/start-link' && request.method === 'POST') {
    try {
      if (deps.isPrivateSession) {
        return jsonResponse(
          {
            ok: false,
            message:
              'Depuis une fenêtre privée, utilisez le menu de la fenêtre ' +
              'pour associer le téléchargement à cette session.',
          },
          400,
        );
      }

      const body = await readJsonBody(request);
      return jsonResponse(
        await deps.downloadManager.startUrlDownload({
          url: typeof body.url === 'string' ? body.url : '',
          pageUrl: '',
          requestingWebContents: null,
          access: { isPrivate: false },
          audioStreamIndex: Number.isInteger(body.audioStreamIndex)
            ? body.audioStreamIndex
            : null,
          subtitleStreamIndex: Number.isInteger(body.subtitleStreamIndex)
            ? body.subtitleStreamIndex
            : null,
          isLive: body.isLive === true,
        }),
      );
    } catch (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }
  }

  if (pathname === '/api/extension' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request);
      const state = await deps.extensionManager.setEnabled(
        body.id,
        body.enabled === true,
      );
      return jsonResponse({
        ok: true,
        extensions: state,
        state: await buildConfigState(deps),
      });
    } catch (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }
  }

  if (pathname === '/api/reset-settings' && request.method === 'POST') {
    try {
      const current = deps.store.getSettings();
      const settings = await updateConfig(deps, {
        ...DEFAULT_SETTINGS,
        downloadDir: current.downloadDir,
        devWorkspace: current.devWorkspace,
      });
      return jsonResponse({
        ok: true,
        settings,
        state: await buildConfigState(deps),
      });
    } catch (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }
  }

  return jsonResponse({ ok: false, message: 'Route inconnue.' }, 404);
}

/**
 * Traite une route API de `about:security`.
 * @param {Request} request
 * @param {string} pathname
 * @param {object} deps
 * @returns {Promise<Response>}
 */
async function handleSecurityApi(request, pathname, deps) {
  if (pathname === '/api/summary' && request.method === 'GET') {
    return jsonResponse(
      await collectSecuritySummary({
        session: deps.session,
        store: deps.store,
        downloadManager: deps.downloadManager,
        adBlocker: deps.adBlocker,
        isPrivateSession: deps.isPrivateSession,
        appInfo: {
          version: app.getVersion(),
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
        },
      }),
    );
  }

  if (pathname === '/api/action' && request.method === 'POST') {
    try {
      const payload = await readJsonBody(request);
      const result = await runSecurityAction(deps, payload);
      return jsonResponse(result, result.ok ? 200 : 400);
    } catch (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }
  }

  return jsonResponse({ ok: false, message: 'Route inconnue.' }, 404);
}

/**
 * Point d'entrée du protocole pour une session.
 * @param {Request} request
 * @param {object} deps
 * @returns {Promise<Response>}
 */
async function handlePageRequest(request, deps) {
  let url;

  try {
    url = new URL(request.url);
  } catch {
    return textResponse('Requête invalide.', 400);
  }

  const host = url.hostname;
  const allowedHosts = Object.values(PAGE_HOSTS);

  if (!allowedHosts.includes(host)) {
    return textResponse('Page inconnue.', 404);
  }

  if (host === PAGE_HOSTS.DEV && url.pathname.startsWith('/file/')) {
    if (!deps.devWorkspace) {
      return textResponse('Ressource indisponible.', 503);
    }

    let relative;

    try {
      relative = decodeURIComponent(url.pathname.slice('/file/'.length));
    } catch {
      return textResponse('Chemin invalide.', 400);
    }

    return deps.devWorkspace.handleFile(request, relative);
  }

  if (host === PAGE_HOSTS.DEV && url.pathname.startsWith('/preview/')) {
    if (!deps.devWorkspace) {
      return textResponse('Aperçu indisponible.', 503);
    }

    const token = url.pathname.slice('/preview/'.length);

    if (!/^[a-f0-9]{36}$/.test(token)) {
      return textResponse('Aperçu inconnu.', 404);
    }

    return deps.devWorkspace.handlePreview(request, token);
  }

  if (url.pathname.startsWith('/api/')) {
    if (!isAllowedApiOrigin(request, host)) {
      return jsonResponse({ ok: false, message: 'Origine refusée.' }, 403);
    }

    if (host === PAGE_HOSTS.CONFIG) {
      return handleConfigApi(request, url.pathname, deps);
    }

    if (host === PAGE_HOSTS.SECURITY) {
      return handleSecurityApi(request, url.pathname, deps);
    }

    if (host === PAGE_HOSTS.DEV) {
      return handleDevApi(request, url.pathname, deps);
    }
  }

  return servePageAsset(request, host);
}

/**
 * Route réservée à `about:dev`; implémentée dans `devWorkspace` pour garder
 * les opérations disque hors de ce module.
 * @param {Request} request
 * @param {string} pathname
 * @param {object} deps
 * @returns {Promise<Response>}
 */
async function handleDevApi(request, pathname, deps) {
  if (!deps.devWorkspace) {
    return jsonResponse(
      { ok: false, message: 'L’espace de développement est indisponible.' },
      503,
    );
  }

  return deps.devWorkspace.handleApi(request, pathname, deps);
}

/**
 * Installe le protocole sur une session.
 * @param {Electron.Session} targetSession
 * @param {object} deps
 * @param {import('./store').Store} deps.store
 * @param {Electron.Session} deps.appSession
 * @param {import('./windowManager').WindowManager} deps.windowManager
 * @param {import('./downloadManager').DownloadManager} deps.downloadManager
 * @param {import('./adblocker').AdBlocker} deps.adBlocker
 * @param {import('./extensionManager').ExtensionManager} deps.extensionManager
 * @param {boolean} [deps.isPrivateSession]
 */
function installPageProtocol(targetSession, deps) {
  if (!targetSession || installedSessions.has(targetSession)) {
    return;
  }

  const sessionDeps = {
    ...deps,
    session: targetSession,
    isPrivateSession: Boolean(deps.isPrivateSession),
  };

  try {
    targetSession.protocol.handle(PAGE_SCHEME, (request) =>
      handlePageRequest(request, sessionDeps),
    );
    installedSessions.add(targetSession);
  } catch (error) {
    console.warn(
      '[Pages] Installation du protocole impossible :',
      error.message,
    );
  }
}

module.exports = {
  PAGE_ROOT,
  buildConfigState,
  handlePageRequest,
  installPageProtocol,
  registerPageScheme,
  resolvePageAsset,
  servePageAsset,
};
