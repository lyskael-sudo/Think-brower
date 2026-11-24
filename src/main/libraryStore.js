'use strict';

/**
 * Think-Browser — persistance de la médiathèque.
 *
 * Les fiches de la médiathèque sont stockées séparément des téléchargements et
 * de l'historique. Le fichier ne contient que des métadonnées : les octets des
 * médias restent à leur emplacement d'origine et ne sont jamais dupliqués.
 * Les écritures sont atomiques et différées.
 *
 * @module main/libraryStore
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  LIBRARY_LIMIT,
  LIBRARY_MEDIA_EXTENSIONS,
  LIBRARY_STORE_SAVE_DELAY,
} = require('../shared/constants');
const { isHttpUrl } = require('../shared/utils');

const VALID_SOURCES = new Set(['download', 'import']);
const VALID_KINDS = new Set(['video', 'audio']);
const VALID_STREAM_TYPES = new Set(['hls', 'dash']);

/**
 * Vérifie qu'une valeur est un identifiant de médiathèque plausible.
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidLibraryId(value) {
  return typeof value === 'string' && /^library-[a-z0-9-]{8,80}$/i.test(value);
}

/**
 * Normalise un chemin absolu.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeAbsolutePath(value) {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value)) {
    return '';
  }

  return path.normalize(value);
}

/**
 * Normalise une date ISO.
 * @param {unknown} value
 * @param {string | null} fallback
 * @returns {string | null}
 */
function normalizeDate(value, fallback = null) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }

  return fallback;
}

/**
 * Normalise un nombre positif.
 * @param {unknown} value
 * @returns {number}
 */
function normalizePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * Normalise une fiche de médiathèque.
 * @param {unknown} entry
 * @returns {object | null}
 */
function normalizeLibraryEntry(entry) {
  if (!entry || typeof entry !== 'object' || !isValidLibraryId(entry.id)) {
    return null;
  }

  const filePath = normalizeAbsolutePath(entry.filePath);

  if (!filePath) {
    return null;
  }

  const extension = path.extname(filePath).slice(1).toLowerCase();

  if (!LIBRARY_MEDIA_EXTENSIONS.has(extension)) {
    return null;
  }

  const fileName =
    typeof entry.fileName === 'string' && entry.fileName.trim()
      ? path.basename(entry.fileName).slice(0, 255)
      : path.basename(filePath);
  const title =
    typeof entry.title === 'string' && entry.title.trim()
      ? entry.title.trim().slice(0, 255)
      : path.parse(fileName).name.slice(0, 255);
  const kind = VALID_KINDS.has(entry.kind) ? entry.kind : 'video';
  const source = VALID_SOURCES.has(entry.source) ? entry.source : 'import';
  const addedAt =
    normalizeDate(entry.addedAt) ||
    normalizeDate(entry.updatedAt) ||
    new Date().toISOString();
  const updatedAt = normalizeDate(entry.updatedAt, addedAt) || addedAt;

  return {
    id: entry.id,
    title,
    filePath,
    fileName,
    mimeType:
      typeof entry.mimeType === 'string' ? entry.mimeType.slice(0, 100) : '',
    size: normalizePositiveNumber(entry.size),
    kind,
    source,
    downloadId: Number.isInteger(entry.downloadId) ? entry.downloadId : null,
    url: isHttpUrl(entry.url) ? entry.url : '',
    pageUrl: isHttpUrl(entry.pageUrl) ? entry.pageUrl : '',
    streamType: VALID_STREAM_TYPES.has(entry.streamType)
      ? entry.streamType
      : null,
    durationSeconds: normalizePositiveNumber(entry.durationSeconds),
    width: normalizePositiveNumber(entry.width),
    height: normalizePositiveNumber(entry.height),
    bitrate: normalizePositiveNumber(entry.bitrate),
    hasVideo:
      typeof entry.hasVideo === 'boolean' ? entry.hasVideo : null,
    hasAudio:
      typeof entry.hasAudio === 'boolean' ? entry.hasAudio : null,
    videoCodec:
      typeof entry.videoCodec === 'string'
        ? entry.videoCodec.slice(0, 40)
        : '',
    audioCodec:
      typeof entry.audioCodec === 'string'
        ? entry.audioCodec.slice(0, 40)
        : '',
    thumbnailPath: normalizeAbsolutePath(entry.thumbnailPath),
    addedAt,
    updatedAt,
    lastPlayedAt: normalizeDate(entry.lastPlayedAt),
    playPosition: normalizePositiveNumber(entry.playPosition),
  };
}

/**
 * Gère le fichier JSON de la médiathèque.
 */
class LibraryStore {
  /**
   * @param {object} options
   * @param {string} options.filePath
   * @param {number} [options.saveDelay]
   */
  constructor({ filePath, saveDelay = LIBRARY_STORE_SAVE_DELAY }) {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      throw new Error('Le chemin du fichier de médiathèque est invalide.');
    }

    this.filePath = path.resolve(filePath);
    this.saveDelay = saveDelay;

    /** @type {object[]} */
    this.entries = [];

    /** @type {ReturnType<typeof setTimeout> | null} */
    this.saveTimer = null;

    /** @type {Promise<void>} */
    this.writeChain = Promise.resolve();
  }

  /**
   * Charge les fiches existantes. Un fichier corrompu est ignoré sans bloquer
   * le démarrage du navigateur.
   * @returns {Promise<object[]>}
   */
  async load() {
    try {
      const content = await fs.promises.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(content);
      const source = Array.isArray(parsed)
        ? parsed
        : parsed && Array.isArray(parsed.entries)
          ? parsed.entries
          : [];

      const seenPaths = new Set();

      this.entries = source
        .map(normalizeLibraryEntry)
        .filter(Boolean)
        .filter((entry) => {
          const key =
            process.platform === 'win32'
              ? entry.filePath.toLowerCase()
              : entry.filePath;

          if (seenPaths.has(key)) {
            return false;
          }

          seenPaths.add(key);
          return true;
        })
        .slice(0, LIBRARY_LIMIT);

      await this.flush();
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(
          '[Médiathèque] Lecture impossible, bibliothèque vide :',
          error.message,
        );
      }

      this.entries = [];
    }

    return this.list();
  }

  /**
   * Retourne une copie des fiches.
   * @returns {object[]}
   */
  list() {
    return this.entries.map((entry) => ({ ...entry }));
  }

  /**
   * Programme l'écriture de la bibliothèque.
   * @param {object[]} entries
   */
  save(entries) {
    this.entries = entries
      .map(normalizeLibraryEntry)
      .filter(Boolean)
      .slice(0, LIBRARY_LIMIT);

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.#persist().catch((error) => {
        console.warn(
          '[Médiathèque] Écriture différée impossible :',
          error.message,
        );
      });
    }, this.saveDelay);
  }

  /**
   * Force l'écriture immédiate.
   * @returns {Promise<void>}
   */
  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    await this.#persist();
  }

  /**
   * Écrit le fichier de façon atomique et sérialisée.
   * @returns {Promise<void>}
   */
  #persist() {
    const snapshot = `${JSON.stringify(
      { version: 1, entries: this.entries },
      null,
      2,
    )}\n`;
    const temporaryPath = `${this.filePath}.tmp`;

    const operation = this.writeChain
      .catch(() => {
        // Une écriture précédente a échoué : la chaîne doit continuer.
      })
      .then(async () => {
        await fs.promises.mkdir(path.dirname(this.filePath), {
          recursive: true,
        });
        await fs.promises.writeFile(temporaryPath, snapshot, 'utf8');
        await fs.promises.rename(temporaryPath, this.filePath);
      });

    this.writeChain = operation.catch(() => {});
    return operation;
  }
}

module.exports = { LibraryStore, isValidLibraryId };
