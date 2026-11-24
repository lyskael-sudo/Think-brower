'use strict';

/**
 * Think-Browser — protocole local de lecture.
 *
 * Le renderer ne reçoit jamais de chemin disque. Il lit des URL opaques
 * `think-media://media/<id>` et `think-media://thumbnail/<id>` que ce module
 * résout uniquement vers des fiches connues de la médiathèque. Le protocole
 * prend en charge les requêtes `Range` nécessaires au déplacement dans une
 * vidéo.
 *
 * @module main/mediaProtocol
 */

const fs = require('node:fs');
const { Readable } = require('node:stream');
const { protocol } = require('electron');

const MEDIA_SCHEME = 'think-media';
const MEDIA_HOST = 'media';
const THUMBNAIL_HOST = 'thumbnail';

/** @type {WeakSet<Electron.Session>} */
const installedSessions = new WeakSet();

let schemeRegistered = false;

/**
 * Déclare le schéma avant le démarrage d'Electron.
 * @returns {void}
 */
function registerMediaScheme() {
  if (schemeRegistered) {
    return;
  }

  schemeRegistered = true;
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

/**
 * Analyse un en-tête Range simple.
 * @param {string} value
 * @param {number} size
 * @returns {{start: number, end: number} | {invalid: true}}
 */
function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(value || '').trim());

  if (!match) {
    return { invalid: true };
  }

  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);

  if (start === null && end === null) {
    return { invalid: true };
  }

  if (start === null) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (end === null || end >= size) {
    end = size - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return { invalid: true };
  }

  return { start, end };
}

/**
 * Construit une réponse 404 ou 416 en texte brut.
 * @param {number} status
 * @param {string} message
 * @param {Record<string, string>} [extraHeaders]
 * @returns {Response}
 */
function textResponse(status, message, extraHeaders = {}) {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

/**
 * Construit la réponse HTTP correspondant à un fichier local.
 * @param {Request} request
 * @param {{filePath: string, mimeType: string, size: number}} resolved
 * @returns {Response}
 */
function createFileResponse(request, resolved) {
  const headers = {
    'Content-Type': resolved.mimeType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Disposition': 'inline',
  };

  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: {
        ...headers,
        'Content-Length': String(resolved.size),
      },
    });
  }

  const rangeHeader = request.headers.get('range');

  if (rangeHeader) {
    const range = parseRange(rangeHeader, resolved.size);

    if ('invalid' in range) {
      return textResponse(416, 'Plage invalide.', {
        'Content-Range': `bytes */${resolved.size}`,
        'Accept-Ranges': 'bytes',
      });
    }

    const stream = fs.createReadStream(resolved.filePath, {
      start: range.start,
      end: range.end,
    });

    return new Response(Readable.toWeb(stream), {
      status: 206,
      headers: {
        ...headers,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${resolved.size}`,
      },
    });
  }

  const stream = fs.createReadStream(resolved.filePath);

  return new Response(Readable.toWeb(stream), {
    status: 200,
    headers: {
      ...headers,
      'Content-Length': String(resolved.size),
    },
  });
}

/**
 * Installe le protocole sur une session.
 * @param {Electron.Session} targetSession
 * @param {import('./mediaLibrary').MediaLibrary} mediaLibrary
 * @returns {void}
 */
function installMediaProtocol(targetSession, mediaLibrary) {
  if (
    !targetSession ||
    !mediaLibrary ||
    installedSessions.has(targetSession)
  ) {
    return;
  }

  installedSessions.add(targetSession);

  targetSession.protocol.handle(MEDIA_SCHEME, async (request) => {
    let parsed;

    try {
      parsed = new URL(request.url);
    } catch {
      return textResponse(400, 'URL locale invalide.');
    }

    if (parsed.protocol !== `${MEDIA_SCHEME}:`) {
      return textResponse(404, 'Ressource introuvable.');
    }

    const host = parsed.hostname.toLowerCase();
    let id;

    try {
      id = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ''));
    } catch {
      return textResponse(400, 'Identifiant invalide.');
    }

    if (!id) {
      return textResponse(404, 'Ressource introuvable.');
    }

    const resolved =
      host === MEDIA_HOST
        ? await mediaLibrary.resolveMedia(id)
        : host === THUMBNAIL_HOST
          ? await mediaLibrary.resolveThumbnail(id)
          : null;

    if (!resolved) {
      return textResponse(404, 'Média introuvable.');
    }

    try {
      return createFileResponse(request, resolved);
    } catch (error) {
      console.warn('[Médiathèque] Lecture locale impossible :', error.message);
      return textResponse(500, 'Lecture impossible.');
    }
  });
}

module.exports = {
  MEDIA_SCHEME,
  installMediaProtocol,
  parseRange,
  registerMediaScheme,
};
