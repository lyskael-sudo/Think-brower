'use strict';

/**
 * Think-Browser — persistance de l'historique des téléchargements.
 *
 * Les téléchargements sont stockés dans un fichier JSON séparé du reste des
 * données afin que les mises à jour de progression ne réécrivent pas
 * l'historique de navigation. Les écritures sont atomiques et différées.
 *
 * @module main/downloadStore
 */

const fs = require('node:fs');
const path = require('node:path');
const { DOWNLOAD_STORE_SAVE_DELAY } = require('../shared/constants');
const { isHttpUrl } = require('../shared/utils');

const VALID_STATES = new Set([
  'queued',
  'progressing',
  'completed',
  'cancelled',
  'interrupted',
]);

/**
 * Normalise une piste audio ou de sous-titres.
 * @param {unknown} track
 * @returns {object | null}
 */
function normalizeTrack(track) {
  if (!track || typeof track !== 'object') {
    return null;
  }

  const index = Number(track.index);

  if (!Number.isInteger(index) || index < 0) {
    return null;
  }

  return {
    index,
    relativeIndex: Number.isInteger(track.relativeIndex)
      ? Math.max(0, track.relativeIndex)
      : 0,
    codec: typeof track.codec === 'string' ? track.codec.slice(0, 40) : '',
    language:
      typeof track.language === 'string' ? track.language.slice(0, 20) : '',
    title: typeof track.title === 'string' ? track.title.slice(0, 120) : '',
    channels: Number.isFinite(track.channels)
      ? Math.max(0, Math.round(track.channels))
      : 0,
    bitrate: Number.isFinite(track.bitrate)
      ? Math.max(0, Math.round(track.bitrate))
      : 0,
    isDefault: track.isDefault === true,
    isForced: track.isForced === true,
  };
}

/**
 * Normalise une liste de pistes.
 * @param {unknown} tracks
 * @returns {object[]}
 */
function normalizeTracks(tracks) {
  return Array.isArray(tracks)
    ? tracks.map(normalizeTrack).filter(Boolean).slice(0, 64)
    : [];
}

/**
 * Normalise un enregistrement de téléchargement.
 * @param {unknown} entry
 * @returns {object | null}
 */
function normalizeDownloadRecord(entry) {
  if (!entry || typeof entry !== 'object' || !isHttpUrl(entry.url)) {
    return null;
  }

  if (!Number.isInteger(entry.id) || entry.id <= 0) {
    return null;
  }

  const totalBytes = Number.isFinite(entry.totalBytes)
    ? Math.max(0, Math.round(entry.totalBytes))
    : 0;
  const receivedBytes = Number.isFinite(entry.receivedBytes)
    ? Math.max(0, Math.round(entry.receivedBytes))
    : 0;

  return {
    id: entry.id,
    url: entry.url,
    filename:
      typeof entry.filename === 'string' && entry.filename
        ? entry.filename
        : 'Téléchargement',
    savePath: typeof entry.savePath === 'string' ? entry.savePath : '',
    state: VALID_STATES.has(entry.state) ? entry.state : 'interrupted',
    receivedBytes,
    totalBytes,
    startedAt:
      typeof entry.startedAt === 'string' &&
      !Number.isNaN(Date.parse(entry.startedAt))
        ? entry.startedAt
        : new Date().toISOString(),
    endedAt:
      typeof entry.endedAt === 'string' &&
      !Number.isNaN(Date.parse(entry.endedAt))
        ? entry.endedAt
        : null,
    kind: entry.kind === 'stream' ? 'stream' : 'file',
    streamType:
      entry.streamType === 'hls' || entry.streamType === 'dash'
        ? entry.streamType
        : null,
    merged: entry.merged === true,
    ytdlp: entry.ytdlp === true,
    progress: Number.isFinite(entry.progress)
      ? Math.max(0, Math.min(100, Math.round(entry.progress)))
      : null,
    durationSeconds: Number.isFinite(entry.durationSeconds)
      ? Math.max(0, entry.durationSeconds)
      : 0,
    hasVideo:
      typeof entry.hasVideo === 'boolean' ? entry.hasVideo : null,
    hasAudio:
      typeof entry.hasAudio === 'boolean' ? entry.hasAudio : null,
    message:
      typeof entry.message === 'string' ? entry.message.slice(0, 300) : '',
    pageUrl: isHttpUrl(entry.pageUrl) ? entry.pageUrl : '',
    streamFormat:
      typeof entry.streamFormat === 'string'
        ? entry.streamFormat.slice(0, 80)
        : '',
    isLive: entry.isLive === true,
    audioStreamIndex:
      Number.isInteger(entry.audioStreamIndex) && entry.audioStreamIndex >= 0
        ? entry.audioStreamIndex
        : null,
    subtitleStreamIndex:
      Number.isInteger(entry.subtitleStreamIndex) &&
      entry.subtitleStreamIndex >= 0
        ? entry.subtitleStreamIndex
        : null,
    audioTracks: normalizeTracks(entry.audioTracks),
    subtitleTracks: normalizeTracks(entry.subtitleTracks),
  };
}

/**
 * Gère le fichier JSON des téléchargements.
 */
class DownloadStore {
  /**
   * @param {object} options
   * @param {string} options.filePath
   * @param {number} [options.saveDelay]
   */
  constructor({ filePath, saveDelay = DOWNLOAD_STORE_SAVE_DELAY }) {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      throw new Error('Le chemin du fichier de téléchargements est invalide.');
    }

    this.filePath = path.resolve(filePath);
    this.saveDelay = saveDelay;

    /** @type {object[]} */
    this.records = [];

    /** @type {ReturnType<typeof setTimeout> | null} */
    this.saveTimer = null;

    /** @type {Promise<void>} */
    this.writeChain = Promise.resolve();
  }

  /**
   * Charge l'historique et convertit les téléchargements actifs en
   * téléchargements interrompus (impossible de reprendre un DownloadItem
   * après le redémarrage du processus).
   * @returns {Promise<object[]>}
   */
  async load() {
    try {
      const content = await fs.promises.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(content);
      const source = Array.isArray(parsed)
        ? parsed
        : parsed && Array.isArray(parsed.records)
          ? parsed.records
          : [];

      this.records = source
        .map(normalizeDownloadRecord)
        .filter(Boolean)
        .slice(0, 500)
        .map((record) => ({
          ...record,
          state:
            record.state === 'progressing' ? 'interrupted' : record.state,
          message:
            record.state === 'progressing' && !record.message
              ? 'Téléchargement interrompu par l’arrêt de l’application.'
              : record.message,
        }));

      await this.flush();
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(
          '[Téléchargements] Lecture impossible, historique vide :',
          error.message,
        );
      }

      this.records = [];
    }

    return this.list();
  }

  /**
   * Retourne une copie des enregistrements.
   * @returns {object[]}
   */
  list() {
    return this.records.map((record) => ({ ...record }));
  }

  /**
   * Programme l'écriture de l'historique.
   * @param {object[]} records
   */
  save(records) {
    this.records = records.map((record) => ({ ...record }));

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.#persist().catch((error) => {
        console.warn(
          '[Téléchargements] Écriture différée impossible :',
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
      { version: 1, records: this.records },
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

module.exports = { DownloadStore };
