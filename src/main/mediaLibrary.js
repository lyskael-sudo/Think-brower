'use strict';

/**
 * Think-Browser — médiathèque locale.
 *
 * La médiathèque référence les fichiers téléchargés ou importés sans les
 * copier. Elle fournit au renderer des URL de lecture opaques (`think-media:`)
 * et conserve les métadonnées, la position de lecture et les miniatures.
 *
 * @module main/mediaLibrary
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { shell } = require('electron');
const {
  LIBRARY_MEDIA_EXTENSIONS,
  MEDIA_MIME_TYPES,
} = require('../shared/constants');
const { isHttpUrl } = require('../shared/utils');
const { LibraryStore, isValidLibraryId } = require('./libraryStore');

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'aac',
  'ogg',
  'oga',
  'wav',
  'flac',
  'opus',
]);

/**
 * Crée un identifiant opaque et imprévisible.
 * @returns {string}
 */
function createLibraryId() {
  // UUID complet : l'identifiant sert de capacité opaque dans les URL
  // `think-media://`, il doit rester imprévisible.
  return `library-${crypto.randomUUID()}`;
}

/**
 * Retourne l'extension normalisée d'un chemin.
 * @param {string} filePath
 * @returns {string}
 */
function getExtension(filePath) {
  return path.extname(String(filePath || '')).replace('.', '').toLowerCase();
}

/**
 * Indique si un fichier peut entrer dans la médiathèque.
 * @param {string} filePath
 * @returns {boolean}
 */
function isLibraryMediaFile(filePath) {
  return LIBRARY_MEDIA_EXTENSIONS.has(getExtension(filePath));
}

/**
 * Retourne le type MIME d'un fichier.
 * @param {string} filePath
 * @returns {string}
 */
function getMediaMimeType(filePath) {
  return MEDIA_MIME_TYPES[getExtension(filePath)] || 'application/octet-stream';
}

/**
 * Détermine le type principal d'un fichier.
 * @param {string} filePath
 * @param {object} [record]
 * @returns {'video' | 'audio'}
 */
function getMediaKind(filePath, record = {}) {
  if (record.hasVideo === true) {
    return 'video';
  }

  if (record.hasVideo === false && record.hasAudio === true) {
    return 'audio';
  }

  return AUDIO_EXTENSIONS.has(getExtension(filePath)) ? 'audio' : 'video';
}

/**
 * Construit un titre lisible depuis un nom de fichier.
 * @param {string} fileName
 * @returns {string}
 */
function titleFromFileName(fileName) {
  return path.parse(fileName).name.trim().slice(0, 255) || 'Média';
}

/**
 * Nettoie un nom de fichier saisi par l'utilisateur.
 * @param {string} value
 * @returns {string}
 */
function sanitizeBaseName(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim()
    .slice(0, 180);
}

/**
 * Vérifie qu'un chemin se trouve bien dans un dossier donné.
 * @param {string} candidate
 * @param {string} directory
 * @returns {boolean}
 */
function isInsideDirectory(candidate, directory) {
  const relative = path.relative(
    path.resolve(directory),
    path.resolve(candidate),
  );

  return (
    relative !== '' &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  );
}

/**
 * Retourne une clé de comparaison de chemins adaptée à la plateforme.
 * @param {string} filePath
 * @returns {string}
 */
function pathKey(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Gère les fiches, les fichiers et les miniatures de la médiathèque.
 */
class MediaLibrary {
  /**
   * @param {object} options
   * @param {LibraryStore} options.store
   * @param {import('./videoTools').VideoTools} options.videoTools
   * @param {string} options.thumbnailDir
   * @param {() => void} [options.onChanged]
   * @param {(downloadId: number | null, oldPath: string, newPath: string) => void} [options.onFileRenamed]
   */
  constructor({
    store,
    videoTools,
    thumbnailDir,
    onChanged,
    onFileRenamed,
  }) {
    if (!(store instanceof LibraryStore)) {
      throw new Error('Le stockage de la médiathèque est invalide.');
    }

    this.store = store;
    this.videoTools = videoTools;
    this.thumbnailDir = path.resolve(thumbnailDir);
    this.onChanged = typeof onChanged === 'function' ? onChanged : null;
    this.onFileRenamed =
      typeof onFileRenamed === 'function' ? onFileRenamed : null;

    /** @type {Map<string, object>} */
    this.entries = new Map();

    /** @type {Set<string>} */
    this.refreshing = new Set();

    this.initialized = false;
  }

  /**
   * Charge la bibliothèque et prépare le dossier des miniatures.
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    const entries = await this.store.load();
    this.entries = new Map(entries.map((entry) => [entry.id, entry]));

    try {
      await fs.promises.mkdir(this.thumbnailDir, { recursive: true });
    } catch (error) {
      console.warn(
        '[Médiathèque] Dossier de miniatures inaccessible :',
        error.message,
      );
    }

    this.initialized = true;
  }

  /**
   * Liste les fiches avec leur disponibilité réelle sur le disque.
   * @returns {Promise<object[]>}
   */
  async list() {
    const entries = Array.from(this.entries.values());
    const result = await Promise.all(
      entries.map(async (entry) => {
        const stats = await this.#statFile(entry.filePath);

        return this.#toPublicEntry(entry, stats);
      }),
    );

    return result.sort(
      (left, right) =>
        Date.parse(right.addedAt) - Date.parse(left.addedAt),
    );
  }

  /**
   * Retourne une fiche publique.
   * @param {string} id
   * @returns {Promise<object | null>}
   */
  async get(id) {
    const entry = this.entries.get(id);

    if (!entry) {
      return null;
    }

    return this.#toPublicEntry(entry, await this.#statFile(entry.filePath));
  }

  /**
   * Ajoute ou met à jour un téléchargement terminé.
   * @param {object} record
   * @returns {Promise<object | null>}
   */
  async addFromDownload(record) {
    if (
      !record ||
      record.private ||
      record.state !== 'completed' ||
      typeof record.savePath !== 'string' ||
      !path.isAbsolute(record.savePath) ||
      !isLibraryMediaFile(record.savePath)
    ) {
      return null;
    }

    const stats = await this.#statFile(record.savePath);

    if (!stats) {
      return null;
    }

    const filePath = path.resolve(record.savePath);
    const existing = this.#findByPath(filePath);
    const now = new Date().toISOString();

    if (existing) {
      existing.downloadId = Number.isInteger(record.id)
        ? record.id
        : existing.downloadId;
      existing.url = isHttpUrl(record.url) ? record.url : existing.url;
      existing.pageUrl = isHttpUrl(record.pageUrl)
        ? record.pageUrl
        : existing.pageUrl;
      existing.streamType =
        record.streamType === 'hls' || record.streamType === 'dash'
          ? record.streamType
          : existing.streamType;
      existing.durationSeconds =
        Number(record.durationSeconds) > 0
          ? Number(record.durationSeconds)
          : existing.durationSeconds;
      existing.hasVideo =
        typeof record.hasVideo === 'boolean'
          ? record.hasVideo
          : existing.hasVideo;
      existing.hasAudio =
        typeof record.hasAudio === 'boolean'
          ? record.hasAudio
          : existing.hasAudio;
      existing.size = stats.size;
      existing.updatedAt = now;
      existing.kind = getMediaKind(filePath, existing);
      this.#persist();
      this.#emitChanged();
      void this.#refreshMetadata(existing.id);
      return this.#toPublicEntry(existing, stats);
    }

    const fileName = path.basename(filePath);
    const entry = {
      id: createLibraryId(),
      title: titleFromFileName(fileName),
      filePath,
      fileName,
      mimeType: getMediaMimeType(filePath),
      size: stats.size,
      kind: getMediaKind(filePath, record),
      source: 'download',
      downloadId: Number.isInteger(record.id) ? record.id : null,
      url: isHttpUrl(record.url) ? record.url : '',
      pageUrl: isHttpUrl(record.pageUrl) ? record.pageUrl : '',
      streamType:
        record.streamType === 'hls' || record.streamType === 'dash'
          ? record.streamType
          : null,
      durationSeconds: Number(record.durationSeconds) || 0,
      width: 0,
      height: 0,
      bitrate: 0,
      hasVideo:
        typeof record.hasVideo === 'boolean' ? record.hasVideo : null,
      hasAudio:
        typeof record.hasAudio === 'boolean' ? record.hasAudio : null,
      videoCodec: '',
      audioCodec: '',
      thumbnailPath: '',
      addedAt: now,
      updatedAt: now,
      lastPlayedAt: null,
      playPosition: 0,
    };

    this.entries.set(entry.id, entry);
    this.#persist();
    this.#emitChanged();
    void this.#refreshMetadata(entry.id);
    return this.#toPublicEntry(entry, stats);
  }

  /**
   * Importe une liste de fichiers locaux.
   * @param {string[]} filePaths
   * @returns {Promise<{added: number, skipped: number}>}
   */
  async importFiles(filePaths) {
    if (!Array.isArray(filePaths)) {
      return { added: 0, skipped: 0 };
    }

    let added = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (const candidate of filePaths) {
      if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) {
        skipped += 1;
        continue;
      }

      const filePath = path.resolve(candidate);

      if (!isLibraryMediaFile(filePath) || this.#findByPath(filePath)) {
        skipped += 1;
        continue;
      }

      const stats = await this.#statFile(filePath);

      if (!stats) {
        skipped += 1;
        continue;
      }

      const fileName = path.basename(filePath);
      const entry = {
        id: createLibraryId(),
        title: titleFromFileName(fileName),
        filePath,
        fileName,
        mimeType: getMediaMimeType(filePath),
        size: stats.size,
        kind: getMediaKind(filePath),
        source: 'import',
        downloadId: null,
        url: '',
        pageUrl: '',
        streamType: null,
        durationSeconds: 0,
        width: 0,
        height: 0,
        bitrate: 0,
        hasVideo: null,
        hasAudio: null,
        videoCodec: '',
        audioCodec: '',
        thumbnailPath: '',
        addedAt: now,
        updatedAt: now,
        lastPlayedAt: null,
        playPosition: 0,
      };

      this.entries.set(entry.id, entry);
      added += 1;
      void this.#refreshMetadata(entry.id);
    }

    if (added > 0) {
      this.#persist();
      this.#emitChanged();
    }

    return { added, skipped };
  }

  /**
   * Retire une fiche et, si demandé, supprime le fichier du disque.
   * @param {string} id
   * @param {object} [options]
   * @param {boolean} [options.deleteFile]
   * @returns {Promise<{ok: boolean, message?: string}>}
   */
  async remove(id, { deleteFile = false } = {}) {
    if (!isValidLibraryId(id)) {
      return { ok: false, message: 'Média invalide.' };
    }

    const entry = this.entries.get(id);

    if (!entry) {
      return { ok: false, message: 'Ce média n’existe plus.' };
    }

    if (deleteFile) {
      try {
        await fs.promises.rm(entry.filePath, { force: true });
      } catch (error) {
        return {
          ok: false,
          message: `Suppression impossible : ${error.message}`,
        };
      }
    }

    if (entry.thumbnailPath) {
      await fs.promises.rm(entry.thumbnailPath, { force: true }).catch(() => {});
    }

    this.entries.delete(id);
    this.#persist();
    this.#emitChanged();
    return { ok: true };
  }

  /**
   * Renomme le fichier et le titre d'une fiche.
   * @param {string} id
   * @param {string} requestedName
   * @returns {Promise<{ok: boolean, entry?: object, message?: string}>}
   */
  async rename(id, requestedName) {
    if (!isValidLibraryId(id)) {
      return { ok: false, message: 'Média invalide.' };
    }

    const entry = this.entries.get(id);

    if (!entry) {
      return { ok: false, message: 'Ce média n’existe plus.' };
    }

    const currentExtension = path.extname(entry.filePath);
    const requestedBase = path.basename(String(requestedName || '').trim());
    const requestedExtension = path.extname(requestedBase);
    const baseName = sanitizeBaseName(
      requestedExtension
        ? requestedBase.slice(0, -requestedExtension.length)
        : requestedBase,
    );

    if (!baseName) {
      return { ok: false, message: 'Le nom demandé est vide.' };
    }

    const targetName = `${baseName}${currentExtension}`;
    const targetPath = path.join(path.dirname(entry.filePath), targetName);

    if (pathKey(targetPath) === pathKey(entry.filePath)) {
      entry.title = baseName;
      entry.updatedAt = new Date().toISOString();
      this.#persist();
      this.#emitChanged();
      return {
        ok: true,
        entry: this.#toPublicEntry(entry, await this.#statFile(entry.filePath)),
      };
    }

    const existingEntry = this.#findByPath(targetPath);
    const existingStats = await this.#statFile(targetPath);

    if (existingEntry || existingStats) {
      return {
        ok: false,
        message: 'Un fichier portant ce nom existe déjà.',
      };
    }

    try {
      await fs.promises.rename(entry.filePath, targetPath);
    } catch (error) {
      return {
        ok: false,
        message: `Renommage impossible : ${error.message}`,
      };
    }

    const oldPath = entry.filePath;
    entry.filePath = targetPath;
    entry.fileName = targetName;
    entry.title = baseName;
    entry.updatedAt = new Date().toISOString();
    this.#persist();
    this.#emitChanged();
    this.onFileRenamed?.(entry.downloadId, oldPath, targetPath);

    return {
      ok: true,
      entry: this.#toPublicEntry(entry, await this.#statFile(targetPath)),
    };
  }

  /**
   * Mémorise la position de lecture.
   * @param {string} id
   * @param {number} position
   * @returns {boolean}
   */
  updatePlayback(id, position) {
    if (!isValidLibraryId(id) || !Number.isFinite(position)) {
      return false;
    }

    const entry = this.entries.get(id);

    if (!entry) {
      return false;
    }

    const safePosition = Math.max(0, position);

    const nearEnd =
      entry.durationSeconds > 0 &&
      safePosition >=
        Math.max(
          entry.durationSeconds - 1,
          entry.durationSeconds * 0.98,
        );

    entry.playPosition = nearEnd ? 0 : safePosition;
    entry.lastPlayedAt = new Date().toISOString();
    entry.updatedAt = entry.lastPlayedAt;
    this.#persist();
    return true;
  }

  /**
   * Affiche le fichier dans le gestionnaire de fichiers.
   * @param {string} id
   * @returns {Promise<{ok: boolean, message?: string}>}
   */
  async reveal(id) {
    if (!isValidLibraryId(id)) {
      return { ok: false, message: 'Média invalide.' };
    }

    const entry = this.entries.get(id);

    if (!entry) {
      return { ok: false, message: 'Ce média n’existe plus.' };
    }

    const stats = await this.#statFile(entry.filePath);

    if (!stats) {
      return { ok: false, message: 'Le fichier est introuvable.' };
    }

    shell.showItemInFolder(entry.filePath);
    return { ok: true };
  }

  /**
   * Résout un média pour le protocole local.
   * @param {string} id
   * @returns {Promise<{filePath: string, mimeType: string, size: number} | null>}
   */
  async resolveMedia(id) {
    if (!isValidLibraryId(id)) {
      return null;
    }

    const entry = this.entries.get(id);

    if (!entry || !isLibraryMediaFile(entry.filePath)) {
      return null;
    }

    const stats = await this.#statFile(entry.filePath);

    if (!stats) {
      return null;
    }

    return {
      filePath: entry.filePath,
      mimeType: getMediaMimeType(entry.filePath),
      size: stats.size,
    };
  }

  /**
   * Résout une miniature pour le protocole local.
   * @param {string} id
   * @returns {Promise<{filePath: string, mimeType: string, size: number} | null>}
   */
  async resolveThumbnail(id) {
    if (!isValidLibraryId(id)) {
      return null;
    }

    const entry = this.entries.get(id);

    if (!entry?.thumbnailPath) {
      return null;
    }

    const thumbnailPath = path.resolve(entry.thumbnailPath);

    if (!isInsideDirectory(thumbnailPath, this.thumbnailDir)) {
      return null;
    }

    const stats = await this.#statFile(thumbnailPath);

    if (!stats) {
      return null;
    }

    return {
      filePath: thumbnailPath,
      mimeType: 'image/jpeg',
      size: stats.size,
    };
  }

  /**
   * Force l'écriture des métadonnées.
   * @returns {Promise<void>}
   */
  async flush() {
    await this.store.flush();
  }

  /**
   * Retourne une fiche sans exposer son chemin disque.
   * @param {object} entry
   * @param {fs.Stats | null} stats
   * @returns {object}
   */
  #toPublicEntry(entry, stats) {
    const available = Boolean(stats?.isFile());

    return {
      id: entry.id,
      title: entry.title,
      fileName: entry.fileName,
      mimeType: entry.mimeType,
      size: available ? stats.size : entry.size,
      kind: entry.kind,
      source: entry.source,
      streamType: entry.streamType,
      durationSeconds: entry.durationSeconds,
      width: entry.width,
      height: entry.height,
      bitrate: entry.bitrate,
      hasVideo: entry.hasVideo,
      hasAudio: entry.hasAudio,
      videoCodec: entry.videoCodec,
      audioCodec: entry.audioCodec,
      addedAt: entry.addedAt,
      lastPlayedAt: entry.lastPlayedAt,
      playPosition: entry.playPosition,
      available,
      playUrl: available ? `think-media://media/${entry.id}` : '',
      thumbnailUrl: entry.thumbnailPath
        ? `think-media://thumbnail/${entry.id}`
        : '',
    };
  }

  /**
   * Retrouve une fiche par chemin de fichier.
   * @param {string} filePath
   * @returns {object | null}
   */
  #findByPath(filePath) {
    const key = pathKey(filePath);

    for (const entry of this.entries.values()) {
      if (pathKey(entry.filePath) === key) {
        return entry;
      }
    }

    return null;
  }

  /**
   * Vérifie l'existence d'un fichier.
   * @param {string} filePath
   * @returns {Promise<fs.Stats | null>}
   */
  async #statFile(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.isFile() ? stats : null;
    } catch {
      return null;
    }
  }

  /**
   * Complète les métadonnées et la miniature d'une fiche en arrière-plan.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async #refreshMetadata(id) {
    if (this.refreshing.has(id)) {
      return;
    }

    const entry = this.entries.get(id);

    if (!entry) {
      return;
    }

    this.refreshing.add(id);

    try {
      const stats = await this.#statFile(entry.filePath);

      if (!stats || this.entries.get(id) !== entry) {
        return;
      }

      const metadata = await this.videoTools.probeFile(entry.filePath);

      if (this.entries.get(id) !== entry) {
        return;
      }

      if (metadata) {
        entry.durationSeconds =
          metadata.durationSeconds > 0
            ? metadata.durationSeconds
            : entry.durationSeconds;
        entry.width = metadata.width || entry.width;
        entry.height = metadata.height || entry.height;
        entry.bitrate = metadata.bitrate || entry.bitrate;
        entry.hasVideo = metadata.hasVideo;
        entry.hasAudio = metadata.hasAudio;
        entry.videoCodec = metadata.videoCodec || entry.videoCodec;
        entry.audioCodec = metadata.audioCodec || entry.audioCodec;
        entry.kind = metadata.hasVideo
          ? 'video'
          : metadata.hasAudio
            ? 'audio'
            : entry.kind;
      }

      const hasThumbnail = entry.thumbnailPath
        ? Boolean(await this.#statFile(entry.thumbnailPath))
        : false;

      if (entry.kind === 'video' && !hasThumbnail) {
        const thumbnailPath = path.join(
          this.thumbnailDir,
          `${entry.id}.jpg`,
        );
        const created = await this.videoTools.createThumbnail(
          entry.filePath,
          thumbnailPath,
          { seekSeconds: 1, width: 480 },
        );

        if (created) {
          if (this.entries.get(id) === entry) {
            entry.thumbnailPath = thumbnailPath;
          } else {
            await fs.promises
              .rm(thumbnailPath, { force: true })
              .catch(() => {});
          }
        }
      }

      if (this.entries.get(id) !== entry) {
        return;
      }

      entry.size = stats.size;
      entry.updatedAt = new Date().toISOString();
      this.#persist();
      this.#emitChanged();
    } catch (error) {
      console.warn(
        '[Médiathèque] Enrichissement impossible :',
        error.message,
      );
    } finally {
      this.refreshing.delete(id);
    }
  }

  /**
   * Persiste l'état courant.
   */
  #persist() {
    this.store.save(Array.from(this.entries.values()));
  }

  /**
   * Signale une modification au processus principal.
   */
  #emitChanged() {
    this.onChanged?.();
  }
}

module.exports = { MediaLibrary, getMediaMimeType };
