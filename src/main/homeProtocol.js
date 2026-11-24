'use strict';

/**
 * Think-Browser — protocole de la page d'accueil locale.
 *
 * La page d'accueil est un document statique isolé dans une webview. Elle est
 * servie par un protocole interne afin de ne jamais accorder l'accès au
 * système de fichiers aux pages distantes. Le même protocole est installé sur
 * chaque session, y compris les partitions privées.
 *
 * @module main/homeProtocol
 */

const fs = require('node:fs');
const path = require('node:path');
const { protocol } = require('electron');
const {
  HOME_HOST,
  HOME_SCHEME,
} = require('../shared/constants');

const HOME_ROOT = path.resolve(__dirname, '..', 'renderer', 'home');

/** @type {WeakSet<Electron.Session>} */
const installedSessions = new WeakSet();

let schemeRegistered = false;

/** Types MIME des ressources statiques autorisées. */
const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
});

/**
 * Déclare le schéma avant que l'application soit prête. Cette opération doit
 * être exécutée une seule fois, avant la création des sessions.
 */
function registerHomeScheme() {
  if (schemeRegistered) {
    return;
  }

  protocol.registerSchemesAsPrivileged([
    {
      scheme: HOME_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        stream: true,
      },
    },
  ]);

  schemeRegistered = true;
}

/**
 * Construit une réponse texte courte.
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
 * Résout un chemin demandé dans le dossier de la page d'accueil en refusant
 * toute sortie du dossier autorisé.
 * @param {string} pathname
 * @returns {string | null}
 */
function resolveAssetPath(pathname) {
  let decoded = '/';

  try {
    decoded = decodeURIComponent(pathname || '/');
  } catch {
    return null;
  }

  const relative =
    decoded === '/' || decoded === ''
      ? 'index.html'
      : decoded.replace(/^\/+/, '');
  const candidate = path.resolve(HOME_ROOT, relative);
  const prefix = `${HOME_ROOT}${path.sep}`;

  if (candidate !== HOME_ROOT && !candidate.startsWith(prefix)) {
    return null;
  }

  return candidate;
}

/**
 * Sert une ressource statique de la page d'accueil.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function serveHomeAsset(request) {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return textResponse('Méthode non autorisée.', 405);
    }

    const url = new URL(request.url);

    if (url.hostname !== HOME_HOST) {
      return textResponse('Ressource introuvable.', 404);
    }

    const assetPath = resolveAssetPath(url.pathname);

    if (!assetPath) {
      return textResponse('Chemin refusé.', 403);
    }

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
      },
    });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[Accueil] Lecture impossible :', error.message);
    }

    return textResponse('Ressource introuvable.', 404);
  }
}

/**
 * Installe le protocole sur une session. Les partitions privées possèdent
 * leur propre instance de protocole.
 * @param {Electron.Session} targetSession
 */
function installHomeProtocol(targetSession) {
  if (!targetSession || installedSessions.has(targetSession)) {
    return;
  }

  try {
    targetSession.protocol.handle(HOME_SCHEME, serveHomeAsset);
    installedSessions.add(targetSession);
  } catch (error) {
    console.warn(
      '[Accueil] Installation du protocole impossible :',
      error.message,
    );
  }
}

module.exports = {
  HOME_ROOT,
  installHomeProtocol,
  registerHomeScheme,
  serveHomeAsset,
};
