'use strict';

/**
 * Think-Browser — téléchargement des flux HLS et DASH.
 *
 * ffmpeg télécharge le manifeste, récupère les segments, assemble les pistes
 * audio/vidéo et écrit un fichier MP4 sans réencodage lorsque les codecs le
 * permettent. Ce module ne traite ni les flux MSE (`blob:`) ni les contenus
 * protégés par DRM : aucune clé ni contournement n'est mis en œuvre.
 *
 * @module main/videoDownloader
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  DOWNLOAD_PROGRESS_THROTTLE,
  MAX_STREAM_DOWNLOADS,
} = require('../shared/constants');
const {
  getStreamType,
  isHttpUrl,
  makeId,
  sanitizeFilename,
} = require('../shared/utils');
const { sanitizeHeaderValue } = require('./videoTools');

/**
 * Construit un nom de fichier lisible pour un manifeste de streaming.
 * @param {string} rawUrl
 * @returns {string}
 */
function buildStreamFilename(rawUrl) {
  let basename = '';
  let hostname = 'video';

  try {
    const parsed = new URL(rawUrl);
    hostname = parsed.hostname.replace(/^www\./i, '') || hostname;

    try {
      basename = decodeURIComponent(path.basename(parsed.pathname));
    } catch {
      basename = path.basename(parsed.pathname);
    }
  } catch {
    // L'URL a déjà été validée en amont ; ce cas reste un simple filet.
  }

  basename = basename.replace(/\.(m3u8|mpd)$/i, '').trim();

  if (!basename || /^(index|master|manifest|playlist|stream)$/i.test(basename)) {
    basename = `${hostname}-video`;
  }

  const filename = sanitizeFilename(`${basename}.mp4`);
  return filename.toLowerCase().endsWith('.mp4') ? filename : `${filename}.mp4`;
}

/**
 * Exécute des téléchargements ffmpeg et expose leur progression.
 */
class VideoDownloader {
  /**
   * @param {object} options
   * @param {import('./videoTools').VideoTools} options.tools
   * @param {(message: string) => void} [options.log]
   */
  constructor({ tools, log }) {
    this.tools = tools;
    this.log = log || ((message) => console.log(message));

    /** @type {Map<string, object>} */
    this.jobs = new Map();
  }

  /**
   * Indique si ffmpeg peut être utilisé.
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    const capabilities = await this.tools.getCapabilities();
    return capabilities.ffmpeg;
  }

  /**
   * Retourne le nombre de tâches actives.
   * @returns {number}
   */
  get activeCount() {
    return this.jobs.size;
  }

  /**
   * Démarre un téléchargement de flux.
   *
   * La méthode rend la main immédiatement : la progression et le résultat sont
   * transmis par les callbacks fournis.
   *
   * @param {object} options
   * @param {string} options.url
   * @param {string} options.extension
   * @param {string} options.outputPath
   * @param {string} [options.pageUrl]
   * @param {string} [options.cookieHeader]
   * @param {string} [options.userAgent]
   * @param {string} [options.secondaryUrl] Piste audio séparée à fusionner.
   * @param {string} [options.secondaryExtension]
   * @param {string} [options.secondaryCookieHeader]
   * @param {boolean} [options.merged]
   * @param {number | null} [options.audioStreamIndex]
   * @param {number | null} [options.subtitleStreamIndex]
   * @param {boolean} [options.isLive]
   * @param {(patch: object) => void} options.onUpdate
   * @param {(result: object) => void} options.onDone
   * @returns {Promise<{ok: boolean, jobId?: string, message?: string}>}
   */
  async start({
    url,
    extension,
    outputPath,
    pageUrl,
    cookieHeader,
    userAgent,
    secondaryUrl = '',
    secondaryExtension = '',
    secondaryCookieHeader = '',
    merged = false,
    audioStreamIndex = null,
    subtitleStreamIndex = null,
    isLive = false,
    onUpdate,
    onDone,
  }) {
    if (
      !isHttpUrl(url) ||
      (!getStreamType(extension) && !(merged && secondaryUrl))
    ) {
      return {
        ok: false,
        message: 'Ce média ne peut pas être téléchargé comme un flux.',
      };
    }

    if (secondaryUrl && !isHttpUrl(secondaryUrl)) {
      return {
        ok: false,
        message: 'La piste audio à fusionner n’est pas une URL HTTP(S) valide.',
      };
    }

    if (!(await this.isAvailable())) {
      return {
        ok: false,
        message:
          'ffmpeg est introuvable. Le téléchargement des flux HLS et DASH ' +
          'est indisponible.',
      };
    }

    if (this.jobs.size >= MAX_STREAM_DOWNLOADS) {
      return {
        ok: false,
        message:
          `Limite de ${MAX_STREAM_DOWNLOADS} téléchargements de flux ` +
          'simultanés atteinte. Attendez la fin d’une tâche.',
      };
    }

    const job = {
      id: makeId('stream-'),
      url,
      extension,
      outputPath,
      pageUrl,
      cookieHeader,
      userAgent,
      secondaryUrl,
      secondaryExtension,
      secondaryCookieHeader,
      merged: Boolean(merged),
      audioStreamIndex: Number.isInteger(audioStreamIndex)
        ? audioStreamIndex
        : null,
      subtitleStreamIndex: Number.isInteger(subtitleStreamIndex)
        ? subtitleStreamIndex
        : null,
      isLive: Boolean(isLive),
      onUpdate,
      onDone,
      startedAt: new Date().toISOString(),
      finished: false,
      cancelRequested: false,
      stopRequested: false,
      finalizing: false,
      child: null,
      stopTimer: null,
      probeController: null,
      tempPath: '',
      durationSeconds: 0,
      receivedBytes: 0,
      lastBroadcastAt: 0,
      stderrTail: '',
    };

    this.jobs.set(job.id, job);
    this.log(`[Médias] Préparation du flux — ${url}`);

    void this.#run(job).catch((error) => {
      this.#finish(job, {
        ok: false,
        cancelled: false,
        message: 'Le téléchargement du flux a échoué.',
        error,
      });
    });

    return { ok: true, jobId: job.id };
  }

  /**
   * Annule une tâche active.
   * @param {string} jobId
   * @returns {boolean}
   */
  cancel(jobId) {
    const job = this.jobs.get(jobId);

    if (!job || job.finished || job.finalizing) {
      return false;
    }

    job.cancelRequested = true;
    clearTimeout(job.stopTimer);
    job.stopTimer = null;
    job.probeController?.abort();

    if (job.child) {
      this.#terminateChild(job);
    }

    if (job.tempPath) {
      void fs.promises.rm(job.tempPath, { force: true }).catch(() => {});
    }

    // L'interface est libérée immédiatement ; le processus tué net termine son
    // nettoyage de fichier temporaire dans le gestionnaire `close`.
    this.#finish(job, {
      ok: false,
      cancelled: true,
      message: 'Téléchargement annulé.',
    });
    return true;
  }

  /**
   * Arrête proprement une tâche et conserve le fichier déjà enregistré.
   *
   * Utilisé pour les directs : ffmpeg reçoit `q` sur son entrée standard afin
   * d'écrire l'atome `moov` du MP4. Un second délai de sécurité force l'arrêt
   * si le processus ne répond pas.
   *
   * @param {string} jobId
   * @returns {boolean}
   */
  stop(jobId) {
    const job = this.jobs.get(jobId);

    if (!job || job.finished || job.finalizing || job.stopRequested) {
      return false;
    }

    job.stopRequested = true;

    // L'arrêt peut être demandé pendant la sonde, avant que ffmpeg ne soit
    // lancé. Dans ce cas, aucun fichier n'a encore été écrit : on termine
    // proprement la tâche au lieu de laisser le téléchargement continuer.
    if (!job.child) {
      job.probeController?.abort();
      this.#finish(job, {
        ok: false,
        cancelled: true,
        message: 'Téléchargement arrêté avant le début de l’enregistrement.',
      });
      return true;
    }

    job.stopTimer = setTimeout(() => {
      if (job.child && !job.finished) {
        try {
          job.child.kill('SIGKILL');
        } catch {
          // Le processus s'est déjà arrêté.
        }
      }
    }, 10_000);

    if (job.child?.stdin?.writable) {
      try {
        job.child.stdin.write('q\n');
        return true;
      } catch {
        // Repli sur un signal si l'entrée standard est fermée.
      }
    }

    try {
      job.child?.kill('SIGINT');
      return Boolean(job.child);
    } catch {
      return false;
    }
  }

  /**
   * Arrête toutes les tâches, par exemple avant de quitter l'application.
   */
  cancelAll() {
    for (const job of Array.from(this.jobs.values())) {
      this.cancel(job.id);
    }
  }

  /**
   * Exécute successivement la sonde, puis ffmpeg.
   * @param {object} job
   * @returns {Promise<void>}
   */
  async #run(job) {
    if (job.finished) {
      return;
    }

    if (job.cancelRequested) {
      this.#finish(job, {
        ok: false,
        cancelled: true,
        message: 'Téléchargement annulé.',
      });
      return;
    }

    this.#update(job, { message: 'Analyse du flux…' });

    const probeController = new AbortController();
    job.probeController = probeController;
    const metadata = await this.tools.probe(job.url, {
      pageUrl: job.pageUrl,
      cookieHeader: job.cookieHeader,
      userAgent: job.userAgent,
      signal: probeController.signal,
    });
    job.probeController = null;

    if (job.finished) {
      return;
    }

    if (job.cancelRequested) {
      this.#finish(job, {
        ok: false,
        cancelled: true,
        message: 'Téléchargement annulé.',
      });
      return;
    }

    if (metadata) {
      job.durationSeconds = metadata.durationSeconds;
      job.isLive = job.isLive || Boolean(metadata.isLive);
      this.#update(job, {
        durationSeconds: metadata.durationSeconds,
        hasVideo: metadata.hasVideo,
        hasAudio: Boolean(metadata.hasAudio) || Boolean(job.secondaryUrl),
        streamFormat: metadata.formatName,
        isLive: job.isLive,
        audioTracks: metadata.audioTracks,
        subtitleTracks: metadata.subtitleTracks,
      });
    }

    const extension = path.extname(job.outputPath) || '.mp4';
    const base = path.basename(job.outputPath, extension);
    // Le suffixe de tâche évite qu'un nettoyage différé supprime le fichier
    // temporaire d'une nouvelle tentative qui réutiliserait le même nom.
    job.tempPath = path.join(
      path.dirname(job.outputPath),
      `${base}.part-${job.id}${extension}`,
    );

    await fs.promises.rm(job.tempPath, { force: true }).catch(() => {});

    if (job.finished) {
      return;
    }

    if (job.cancelRequested) {
      this.#finish(job, {
        ok: false,
        cancelled: true,
        message: 'Téléchargement annulé.',
      });
      return;
    }

    const args = [
      '-hide_banner',
      '-y',
      '-loglevel',
      'error',
      '-progress',
      'pipe:1',
      '-rw_timeout',
      '30000000',
    ];

    /**
     * Ajoute une entrée ffmpeg avec ses propres en-têtes. `-headers` et
     * `-user_agent` sont des options d'entrée : elles doivent être répétées
     * avant chaque `-i` lorsqu'on fusionne deux URL distinctes.
     * @param {string} inputUrl
     * @param {string} inputCookieHeader
     */
    const appendInput = (inputUrl, inputCookieHeader) => {
      if (job.userAgent) {
        args.push('-user_agent', sanitizeHeaderValue(job.userAgent));
      }

      const headerBlock = this.tools.buildHeaderBlock({
        pageUrl: job.pageUrl,
        cookieHeader: inputCookieHeader,
      });

      if (headerBlock) {
        args.push('-headers', headerBlock);
      }

      args.push('-i', inputUrl);
    };

    appendInput(job.url, job.cookieHeader);

    if (job.secondaryUrl) {
      appendInput(
        job.secondaryUrl,
        job.secondaryCookieHeader || job.cookieHeader,
      );
    }

    args.push('-map', '0:v:0?');

    if (job.secondaryUrl) {
      args.push('-map', '1:a:0?');
    } else if (
      Number.isInteger(job.audioStreamIndex) &&
      job.audioStreamIndex >= 0
    ) {
      args.push('-map', `0:${job.audioStreamIndex}`);
    } else {
      args.push('-map', '0:a:0?');
    }

    if (
      !job.secondaryUrl &&
      Number.isInteger(job.subtitleStreamIndex) &&
      job.subtitleStreamIndex >= 0
    ) {
      args.push(
        '-map',
        `0:${job.subtitleStreamIndex}`,
        '-c:s',
        'mov_text',
      );
    }

    const isMatroska =
      path.extname(job.outputPath).toLowerCase() === '.mkv';

    args.push('-c:v', 'copy', '-c:a', 'copy');

    if (isMatroska) {
      args.push('-f', 'matroska');
    } else {
      args.push('-movflags', '+faststart', '-f', 'mp4');
    }

    args.push(job.tempPath);

    const tools = await this.tools.getCapabilities();

    // Une annulation ou un arrêt peut survenir pendant la vérification des
    // binaires : ne jamais lancer ffmpeg après la fin logique de la tâche.
    if (job.finished || job.cancelRequested || job.stopRequested) {
      return;
    }

    if (!tools.ffmpeg) {
      this.#finish(job, {
        ok: false,
        cancelled: false,
        message: 'ffmpeg n’est plus disponible.',
      });
      return;
    }

    this.#update(job, { message: 'Téléchargement et assemblage…' });

    const child = spawn(this.tools.ffmpegPath, args, {
      windowsHide: true,
      // L'entrée standard reste ouverte pour permettre un arrêt propre d'un
      // direct avec la commande `q` de ffmpeg.
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    job.child = child;

    if (job.cancelRequested) {
      this.#terminateChild(job);
      return;
    }

    let stdoutBuffer = '';
    let stderrBuffer = '';

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        this.#handleProgressLine(job, line);
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString('utf8');

      if (stderrBuffer.length > 16_384) {
        stderrBuffer = stderrBuffer.slice(-16_384);
      }

      job.stderrTail = stderrBuffer;
    });

    child.once('error', (error) => {
      job.child = null;
      this.#finish(job, {
        ok: false,
        cancelled: job.cancelRequested,
        message: job.cancelRequested
          ? 'Téléchargement annulé.'
          : 'ffmpeg n’a pas pu démarrer.',
        error,
      });
    });

    child.once('close', (code) => {
      job.child = null;
      clearTimeout(job.stopTimer);
      job.stopTimer = null;

      if (job.cancelRequested) {
        void fs.promises.rm(job.tempPath, { force: true }).catch(() => {});
        this.#finish(job, {
          ok: false,
          cancelled: true,
          message: 'Téléchargement annulé.',
        });
        return;
      }

      if (job.stopRequested) {
        if (code !== 0) {
          console.log(
            `[Médias] Arrêt de l’enregistrement (code ffmpeg ${code}).`,
          );
        }

        void this.#finalize(job).catch((error) => {
          void fs.promises.rm(job.tempPath, { force: true }).catch(() => {});
          this.#finish(job, {
            ok: false,
            cancelled: false,
            message:
              'L’enregistrement a été arrêté, mais le fichier n’a pas pu ' +
              'être finalisé.',
            error,
          });
        });
        return;
      }

      if (code !== 0) {
        const details = job.stderrTail.trim().split(/\r?\n/).slice(-3).join(' ');
        console.warn(
          `[Médias] ffmpeg a échoué (code ${code}) —`,
          details || 'aucun détail',
        );
        void fs.promises.rm(job.tempPath, { force: true }).catch(() => {});
        this.#finish(job, {
          ok: false,
          cancelled: false,
          message:
            'Le flux n’a pas pu être assemblé. Il est peut-être protégé ' +
            '(DRM), expiré ou nécessite une authentification supplémentaire.',
        });
        return;
      }

      void this.#finalize(job).catch((error) => {
        void fs.promises.rm(job.tempPath, { force: true }).catch(() => {});
        this.#finish(job, {
          ok: false,
          cancelled: false,
          message: 'Le fichier vidéo final n’a pas pu être créé.',
          error,
        });
      });
    });
  }

  /**
   * Interprète une ligne de la sortie `-progress pipe:1`.
   * @param {object} job
   * @param {string} line
   */
  #handleProgressLine(job, line) {
    const separator = line.indexOf('=');

    if (separator <= 0) {
      return;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();

    if (key === 'out_time_us' || key === 'out_time_ms') {
      const microseconds = Number(value);

      if (Number.isFinite(microseconds) && microseconds >= 0) {
        const seconds = microseconds / 1_000_000;
        const progress =
          job.durationSeconds > 0
            ? Math.max(
                0,
                Math.min(99, Math.round((seconds / job.durationSeconds) * 100)),
              )
            : null;

        this.#update(job, {
          progress,
          elapsedSeconds: seconds,
          message: 'Téléchargement et assemblage…',
        });
      }
    } else if (key === 'total_size') {
      const bytes = Number(value);

      if (Number.isFinite(bytes) && bytes >= 0) {
        job.receivedBytes = bytes;
        this.#update(job, { receivedBytes: bytes });
      }
    } else if (key === 'progress' && value === 'end') {
      this.#update(job, { progress: 99, message: 'Finalisation du fichier…' });
    }
  }

  /**
   * Renomme le fichier temporaire et annonce le résultat.
   * @param {object} job
   * @returns {Promise<void>}
   */
  async #finalize(job) {
    job.finalizing = true;

    const stats = await fs.promises.stat(job.tempPath);

    if (!stats.isFile() || stats.size === 0) {
      throw new Error('Fichier temporaire vide.');
    }

    await fs.promises.rename(job.tempPath, job.outputPath);

    this.#finish(job, {
      ok: true,
      cancelled: false,
      message: job.stopRequested
        ? 'Enregistrement arrêté et conservé.'
        : 'Téléchargement terminé.',
      outputPath: job.outputPath,
      receivedBytes: stats.size,
      durationSeconds: job.durationSeconds,
      isLive: job.isLive,
    });
  }

  /**
   * Met à jour un enregistrement avec une fréquence raisonnable.
   * @param {object} job
   * @param {object} patch
   */
  #update(job, patch) {
    if (job.finished) {
      return;
    }

    const now = Date.now();
    const isImportant =
      patch.progress === 99 ||
      Boolean(patch.message && !Object.hasOwn(patch, 'progress')) ||
      Array.isArray(patch.audioTracks) ||
      Array.isArray(patch.subtitleTracks) ||
      typeof patch.isLive === 'boolean' ||
      typeof patch.hasVideo === 'boolean' ||
      typeof patch.hasAudio === 'boolean';

    if (!isImportant && now - job.lastBroadcastAt < DOWNLOAD_PROGRESS_THROTTLE) {
      return;
    }

    job.lastBroadcastAt = now;

    try {
      job.onUpdate(patch);
    } catch (error) {
      console.warn('[Médias] Mise à jour de progression ignorée :', error.message);
    }
  }

  /**
   * Termine une tâche une seule fois.
   * @param {object} job
   * @param {object} result
   */
  #finish(job, result) {
    if (job.finished) {
      return;
    }

    job.finished = true;
    clearTimeout(job.stopTimer);
    job.stopTimer = null;
    job.probeController?.abort();
    job.probeController = null;
    this.jobs.delete(job.id);

    if (result.ok) {
      this.log(`[Médias] Terminé — ${job.outputPath}`);
    } else if (result.cancelled) {
      this.log(`[Médias] Annulé — ${job.url}`);
    } else {
      console.warn('[Médias] Échec —', result.message || 'raison inconnue');
    }

    try {
      job.onDone({
        ...result,
        jobId: job.id,
        endedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('[Médias] Fin de tâche ignorée :', error.message);
    }
  }

  /**
   * Arrête immédiatement ffmpeg. Aucun fichier final n'est en cours d'écriture :
   * le processus travaille uniquement sur le fichier temporaire, supprimé
   * ensuite. Un arrêt forcé est donc préférable à une attente réseau.
   * @param {object} job
   */
  #terminateChild(job) {
    if (!job.child) {
      return;
    }

    try {
      job.child.kill('SIGKILL');
    } catch {
      // Le processus a déjà pu se terminer.
    }
  }
}

module.exports = {
  VideoDownloader,
  buildStreamFilename,
};
