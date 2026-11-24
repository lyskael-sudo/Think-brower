'use strict';

/**
 * Think-Browser — pont optionnel vers yt-dlp.
 *
 * yt-dlp n'est ni embarqué ni installé automatiquement. Ce module détecte un
 * exécutable présent sur la machine, vérifie sa version, puis lance un
 * téléchargement YouTube avec ffmpeg pour fusionner les pistes. Il ne traite
 * aucun contenu DRM et ne fournit aucune clé ni contournement de protection.
 *
 * L'utilisateur reste responsable du respect des conditions d'utilisation de
 * YouTube et des droits sur les contenus téléchargés.
 *
 * @module main/ytDlpDownloader
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { isHttpUrl, makeId } = require('../shared/utils');
const { isYouTubeVideoUrl } = require('./youtube');
const { sanitizeHeaderValue } = require('./videoTools');

const execFileAsync = promisify(execFile);
const MAX_ERROR_OUTPUT = 8000;
const KILL_GRACE_MS = 5000;
// Le binaire officiel de yt-dlp est une archive Python : son démarrage peut
// dépasser plusieurs secondes sur une machine chargée. Un délai trop court le
// ferait passer à tort pour absent.
const VERSION_TIMEOUT_MS = 15_000;
const JS_RUNTIME_TIMEOUT_MS = 15_000;
const VIDEO_OUTPUT_EXTENSIONS = new Set([
  'mp4',
  'mkv',
  'webm',
  'mov',
  'flv',
  'avi',
  'ts',
  '3gp',
]);

/**
 * Convertit une taille yt-dlp (`1.25MiB`, `800KiB`, etc.) en octets.
 * @param {string} value
 * @param {string} unit
 * @returns {number}
 */
function parseSize(value, unit) {
  const amount = Number(value);
  const normalized = String(unit || '').toUpperCase();
  const multipliers = {
    B: 1,
    KB: 1000,
    KIB: 1024,
    MB: 1000 ** 2,
    MIB: 1024 ** 2,
    GB: 1000 ** 3,
    GIB: 1024 ** 3,
    TB: 1000 ** 4,
    TIB: 1024 ** 4,
  };

  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return Math.round(amount * (multipliers[normalized] || 1));
}

/**
 * Indique si un chemin est un fichier exécutable.
 * @param {string} candidate
 * @returns {boolean}
 */
function isExecutable(candidate) {
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) {
      return false;
    }

    if (process.platform === 'win32') {
      return true;
    }

    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Construit la liste ordonnée des emplacements à tester.
 * @returns {string[]}
 */
function getCandidatePaths() {
  const candidates = [];
  const names =
    process.platform === 'win32' ? ['yt-dlp.exe', 'yt-dlp'] : ['yt-dlp'];
  const directories = String(process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean);

  for (const envName of ['THINK_YTDLP_PATH', 'YTDLP_PATH']) {
    const value = String(process.env[envName] || '').trim();
    if (value) {
      candidates.push(value);
    }
  }

  for (const directory of directories) {
    for (const name of names) {
      candidates.push(path.join(directory, name));
    }
  }

  const home = os.homedir();
  const common = [
    path.join(home, '.local', 'bin', 'yt-dlp'),
    path.join(home, 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/opt/homebrew/bin/yt-dlp',
    '/snap/bin/yt-dlp',
  ];

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.ProgramFiles || '';
    if (localAppData) {
      common.push(
        path.join(localAppData, 'Programs', 'yt-dlp', 'yt-dlp.exe'),
        path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe'),
      );
    }
    if (programFiles) {
      common.push(path.join(programFiles, 'yt-dlp', 'yt-dlp.exe'));
    }
  }

  candidates.push(...common);

  return Array.from(new Set(candidates.filter(Boolean)));
}

/**
 * Indique si un exécutable `node` utilisable est présent dans le PATH.
 * yt-dlp accepte l'option `--js-runtimes node` même si Node est absent ; on
 * vérifie donc réellement le moteur avant de l'imposer.
 * @returns {Promise<boolean>}
 */
async function hasNodeRuntime() {
  try {
    const { stdout } = await execFileAsync('node', ['--version'], {
      timeout: 3000,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    });

    return /^v\d+\.\d+\.\d+/i.test(String(stdout || '').trim());
  } catch {
    return false;
  }
}

/**
 * Vérifie qu'un binaire répond et retourne sa version.
 * @param {string} candidate
 * @returns {Promise<{available: boolean, path: string, version: string, error: string}>}
 */
async function verifyBinary(candidate) {
  try {
    const { stdout } = await execFileAsync(candidate, ['--version'], {
      timeout: VERSION_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const version = String(stdout || '')
      .trim()
      .split(/\s+/)[0];

    if (!version) {
      return {
        available: false,
        path: '',
        version: '',
        supportsJsRuntime: false,
        error: 'version vide',
      };
    }

    let supportsJsRuntime = false;

    // Les versions récentes de yt-dlp acceptent `--js-runtimes` pour utiliser
    // Node comme moteur de résolution des défis JavaScript de YouTube. Les
    // anciennes versions rejettent cette option : on ne l'ajoute qu'après
    // l'avoir testée avec `--version`, qui ne déclenche aucun téléchargement.
    if (await hasNodeRuntime()) {
      try {
        await execFileAsync(
          candidate,
          ['--js-runtimes', 'node', '--version'],
          {
            timeout: JS_RUNTIME_TIMEOUT_MS,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
          },
        );
        supportsJsRuntime = true;
      } catch {
        supportsJsRuntime = false;
      }
    }

    return {
      available: true,
      path: candidate,
      version,
      supportsJsRuntime,
      error: '',
    };
  } catch (error) {
    return {
      available: false,
      path: '',
      version: '',
      supportsJsRuntime: false,
      error: String(error?.message || error).slice(0, 300),
    };
  }
}

/**
 * Téléchargeur YouTube optionnel fondé sur un exécutable yt-dlp.
 */
class YtDlpDownloader {
  constructor() {
    /** @type {Map<string, object>} */
    this.jobs = new Map();

    /** @type {Promise<object> | null} */
    this.capabilitiesPromise = null;

    this.capabilities = null;
  }

  /**
   * Nombre de téléchargements yt-dlp actifs.
   * @returns {number}
   */
  get activeCount() {
    return this.jobs.size;
  }

  /**
   * Détecte et vérifie yt-dlp. Le résultat est mis en cache, sauf demande
   * explicite de rafraîchissement.
   * @param {boolean} [force]
   * @returns {Promise<{
   *   available: boolean,
   *   path: string,
   *   version: string,
   *   supportsJsRuntime: boolean,
   *   message: string
   * }>}
   */
  getCapabilities(force = false) {
    if (force) {
      this.capabilities = null;
      this.capabilitiesPromise = null;
    }

    if (this.capabilities) {
      return Promise.resolve({ ...this.capabilities });
    }

    if (this.capabilitiesPromise) {
      return this.capabilitiesPromise;
    }

    this.capabilitiesPromise = (async () => {
      for (const candidate of getCandidatePaths()) {
        if (!isExecutable(candidate)) {
          continue;
        }

        const result = await verifyBinary(candidate);

        if (result.available) {
          const capabilities = {
            available: true,
            path: result.path,
            version: result.version,
            supportsJsRuntime: result.supportsJsRuntime,
            message: '',
          };
          this.capabilities = capabilities;
          console.log(
            `[yt-dlp] Exécutable sélectionné : ${result.path} (${result.version})`,
          );
          return capabilities;
        }

        console.warn(
          `[yt-dlp] Candidat ignoré : ${candidate} — ${result.error}`,
        );
      }

      const capabilities = {
        available: false,
        path: '',
        version: '',
        supportsJsRuntime: false,
        message:
          'yt-dlp est introuvable. Installez-le séparément (par exemple avec ' +
          '« pipx install yt-dlp » ou le binaire officiel), ou définissez ' +
          'THINK_YTDLP_PATH vers l’exécutable.',
      };
      this.capabilities = capabilities;
      console.warn('[yt-dlp] Aucun exécutable fonctionnel trouvé.');
      return capabilities;
    })();

    return this.capabilitiesPromise;
  }

  /**
   * Lance un téléchargement YouTube.
   * @param {object} options
   * @param {string} options.url
   * @param {string} options.outputPath
   * @param {string} [options.pageUrl]
   * @param {string} [options.userAgent]
   * @param {string} [options.ffmpegPath]
   * @param {(patch: object) => void} [options.onUpdate]
   * @param {(result: object) => void} [options.onDone]
   * @returns {Promise<{ok: boolean, jobId?: string, message?: string}>}
   */
  async start({
    url,
    outputPath,
    pageUrl = '',
    userAgent = '',
    ffmpegPath = '',
    onUpdate,
    onDone,
  }) {
    if (!isYouTubeVideoUrl(url)) {
      return {
        ok: false,
        message: 'Seules les URL de vidéos YouTube sont prises en charge.',
      };
    }

    if (!outputPath || !path.isAbsolute(outputPath)) {
      return {
        ok: false,
        message: 'Le chemin de destination de yt-dlp est invalide.',
      };
    }

    const capabilities = await this.getCapabilities();

    if (!capabilities.available) {
      return {
        ok: false,
        message: capabilities.message,
      };
    }

    const directory = path.dirname(outputPath);

    try {
      await fs.promises.mkdir(directory, { recursive: true });
      await fs.promises.rm(outputPath, { force: true });
    } catch (error) {
      return {
        ok: false,
        message: `Le dossier de téléchargement est inaccessible : ${error.message}`,
      };
    }

    const jobId = makeId('ytdlp-');
    const outputExtension = path.extname(outputPath);
    const outputStem = path.basename(outputPath, outputExtension);
    const outputTemplate = path.join(directory, `${outputStem}.%(ext)s`);
    const args = [
      '--no-playlist',
      '--newline',
      '--no-warnings',
      '--no-mtime',
      '--socket-timeout',
      '30',
      '--retries',
      '3',
      '--fragment-retries',
      '3',
      '--merge-output-format',
      'mp4/mkv',
      '--format',
      'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b',
      '--output',
      outputTemplate,
    ];

    if (capabilities.supportsJsRuntime) {
      args.push('--js-runtimes', 'node');
    }

    if (ffmpegPath) {
      args.push('--ffmpeg-location', ffmpegPath);
    }

    if (userAgent) {
      args.push('--user-agent', sanitizeHeaderValue(userAgent));
    }

    if (isHttpUrl(pageUrl)) {
      args.push('--referer', pageUrl);
    }

    args.push('--', url);

    /** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
    let child = null;

    try {
      child = spawn(capabilities.path, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      });
    } catch (error) {
      return {
        ok: false,
        message: `yt-dlp n’a pas pu démarrer : ${error.message}`,
      };
    }

    const job = {
      id: jobId,
      child,
      outputPath,
      onUpdate: typeof onUpdate === 'function' ? onUpdate : () => {},
      onDone: typeof onDone === 'function' ? onDone : () => {},
      finished: false,
      cancelRequested: false,
      stderr: '',
      killTimer: null,
      startedAt: new Date().toISOString(),
      startedAtMs: Date.now(),
    };

    this.jobs.set(jobId, job);
    this.#wireJob(job);

    return { ok: true, jobId };
  }

  /**
   * Annule une tâche yt-dlp.
   * @param {string} jobId
   * @returns {boolean}
   */
  cancel(jobId) {
    const job = this.jobs.get(String(jobId || ''));

    if (!job) {
      return false;
    }

    job.cancelRequested = true;
    this.#kill(job);
    return true;
  }

  /**
   * Annule toutes les tâches, notamment à la fermeture de l'application.
   */
  cancelAll() {
    for (const jobId of Array.from(this.jobs.keys())) {
      this.cancel(jobId);
    }
  }

  /**
   * Branche les flux de sortie et la fin du processus.
   * @param {object} job
   */
  #wireJob(job) {
    const handleLine = (line, isError = false) => {
      const text = String(line || '').trim();

      if (!text) {
        return;
      }

      if (isError) {
        job.stderr = `${job.stderr}\n${text}`.slice(-MAX_ERROR_OUTPUT);
      }

      if (text.startsWith('[download]')) {
        const percentMatch = text.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
        const sizeMatch = text.match(
          /\bof\s+([\d.]+)\s*([KMGTP]?i?B)\b/i,
        );

        if (percentMatch) {
          const progress = Math.min(
            100,
            Math.max(0, Number(percentMatch[1])),
          );
          const totalBytes = sizeMatch
            ? parseSize(sizeMatch[1], sizeMatch[2])
            : 0;

          job.onUpdate({
            progress,
            receivedBytes: totalBytes
              ? Math.round((totalBytes * progress) / 100)
              : undefined,
            totalBytes: totalBytes || undefined,
            message: `Téléchargement YouTube — ${Math.round(progress)} %`,
          });
        } else if (/Destination/i.test(text)) {
          job.onUpdate({ message: 'Téléchargement YouTube…' });
        }
        return;
      }

      if (text.startsWith('[Merger]')) {
        job.onUpdate({
          progress: 100,
          message: 'Fusion audio/vidéo de YouTube…',
        });
        return;
      }

      if (text.startsWith('[ExtractAudio]')) {
        job.onUpdate({ message: 'Extraction de l’audio YouTube…' });
        return;
      }

      if (text.startsWith('[youtube]') || text.startsWith('[info]')) {
        job.onUpdate({ message: 'Analyse de la vidéo YouTube…' });
      }
    };

    let stdoutBuffer = '';
    let stderrBuffer = '';

    job.child.stdout?.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        handleLine(line);
      }
    });

    job.child.stderr?.on('data', (chunk) => {
      stderrBuffer += chunk.toString('utf8');
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() || '';
      for (const line of lines) {
        handleLine(line, true);
      }
    });

    job.child.on('error', (error) => {
      void this.#finish(job, {
        ok: false,
        message: `yt-dlp n’a pas pu démarrer : ${error.message}`,
      });
    });

    job.child.on('close', (code, signal) => {
      if (stdoutBuffer.trim()) {
        handleLine(stdoutBuffer);
      }
      if (stderrBuffer.trim()) {
        handleLine(stderrBuffer, true);
      }

      if (job.cancelRequested) {
        void this.#finish(job, {
          ok: false,
          cancelled: true,
          message: 'Téléchargement YouTube annulé.',
        });
        return;
      }

      if (signal) {
        void this.#finish(job, {
          ok: false,
          cancelled: true,
          message: 'Téléchargement YouTube interrompu.',
        });
        return;
      }

      if (code !== 0) {
        const detail = job.stderr
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(-3)
          .join(' ');
        void this.#finish(job, {
          ok: false,
          message:
            `yt-dlp a échoué (code ${code}).` +
            (detail ? ` ${detail}` : ''),
        });
        return;
      }

      void this.#complete(job);
    });
  }

  /**
   * Recherche le fichier produit par yt-dlp, y compris si l'extension réelle
   * diffère du `.mp4` demandé.
   * @param {object} job
   * @returns {Promise<{path: string, size: number} | null>}
   */
  async #findOutput(job) {
    const directory = path.dirname(job.outputPath);
    const extension = path.extname(job.outputPath);
    const stem = path.basename(job.outputPath, extension);
    const candidates = [job.outputPath];

    try {
      const entries = await fs.promises.readdir(directory);

      for (const name of entries) {
        if (!name.startsWith(`${stem}.`)) {
          continue;
        }

        const candidateExtension = path
          .extname(name)
          .slice(1)
          .toLowerCase();

        if (
          VIDEO_OUTPUT_EXTENSIONS.has(candidateExtension) &&
          !name.includes('.part')
        ) {
          candidates.push(path.join(directory, name));
        }
      }
    } catch {
      // Le dossier peut avoir disparu ; le candidat principal suffit.
    }

    for (const candidate of candidates) {
      try {
        const stat = await fs.promises.stat(candidate);

        // Évite de réutiliser un ancien fichier portant le même préfixe si
        // yt-dlp a échoué avant d'écrire sa propre sortie.
        if (
          stat.isFile() &&
          stat.size > 0 &&
          stat.mtimeMs >= job.startedAtMs - 2000
        ) {
          return { path: candidate, size: stat.size };
        }
      } catch {
        // Candidat absent.
      }
    }

    return null;
  }

  /**
   * Finalise une tâche réussie.
   * @param {object} job
   */
  async #complete(job) {
    const output = await this.#findOutput(job);

    if (!output) {
      await this.#finish(job, {
        ok: false,
        message:
          'yt-dlp s’est terminé sans produire de fichier vidéo exploitable.',
      });
      return;
    }

    await this.#finish(job, {
      ok: true,
      outputPath: output.path,
      receivedBytes: output.size,
      message: 'Téléchargement YouTube terminé.',
    });
  }

  /**
   * Termine une tâche une seule fois et nettoie les fichiers partiels en cas
   * d'échec.
   * @param {object} job
   * @param {object} result
   */
  async #finish(job, result) {
    if (job.finished) {
      return;
    }

    job.finished = true;
    this.jobs.delete(job.id);

    if (job.killTimer) {
      clearTimeout(job.killTimer);
      job.killTimer = null;
    }

    if (!result.ok) {
      await this.#cleanup(job);
    }

    try {
      job.onDone({
        ...result,
        endedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('[yt-dlp] Notification de fin impossible :', error.message);
    }
  }

  /**
   * Supprime les fichiers partiels associés à une tâche.
   * @param {object} job
   */
  async #cleanup(job) {
    const directory = path.dirname(job.outputPath);
    const extension = path.extname(job.outputPath);
    const stem = path.basename(job.outputPath, extension);
    const base = path.basename(job.outputPath);

    try {
      const entries = await fs.promises.readdir(directory);

      await Promise.all(
        entries
          .filter(
            (name) =>
              name === base ||
              name.startsWith(`${base}.`) ||
              name.startsWith(`${stem}.`),
          )
          .map(async (name) => {
            const target = path.join(directory, name);

            try {
              const stat = await fs.promises.stat(target);

              // Ne supprime pas un ancien fichier homonyme qui n'appartient
              // pas à cette tâche.
              if (stat.mtimeMs < job.startedAtMs - 2000) {
                return;
              }
            } catch {
              return;
            }

            await fs.promises.rm(target, { force: true }).catch(() => {});
          }),
      );
    } catch {
      // Nettoyage best-effort.
    }
  }

  /**
   * Envoie un signal d'arrêt, puis force la terminaison après un délai.
   * @param {object} job
   */
  #kill(job) {
    const child = job.child;

    try {
      if (process.platform !== 'win32' && child.pid) {
        process.kill(-child.pid, 'SIGTERM');
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {
        // Le processus est déjà terminé.
      }
    }

    job.killTimer = setTimeout(() => {
      try {
        if (process.platform !== 'win32' && child.pid) {
          process.kill(-child.pid, 'SIGKILL');
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        // Le processus est déjà terminé.
      }
    }, KILL_GRACE_MS);

    job.killTimer.unref?.();
  }
}

module.exports = {
  YtDlpDownloader,
  getCandidatePaths,
  parseSize,
};
