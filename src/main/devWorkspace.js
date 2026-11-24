'use strict';

/**
 * Think-Browser — atelier de développement local (`about:dev`).
 *
 * Le module reste dans le processus principal. Il confine les opérations
 * disque à un dossier choisi par l'utilisateur, refuse les traversées de
 * chemin et les liens symboliques, borne la taille des fichiers et des sorties,
 * puis exécute uniquement des commandes explicitement autorisées.
 *
 * Le terminal n'est PAS une sandbox de sécurité : le code exécuté hérite des
 * droits du compte utilisateur. L'interface l'indique clairement.
 *
 * @module main/devWorkspace
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { app, BrowserWindow, dialog } = require('electron');
const {
  PAGE_HOSTS,
  PAGE_SCHEME,
} = require('../shared/constants');

const MAX_FILE_BYTES = 1_000_000;
const MAX_OUTPUT_BYTES = 512 * 1024;
const MAX_TREE_ENTRIES = 400;
const MAX_TREE_DEPTH = 6;
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
const PREVIEW_TTL = 10 * 60 * 1000;
const MAX_PREVIEWS = 24;
const RUN_TIMEOUT = 30_000;
const COMMAND_TIMEOUT = 30_000;

const IGNORED_NAMES = new Set([
  '.git',
  'node_modules',
  '.cache',
  '.npm',
  '.pnpm-store',
  '.yarn',
]);

const LANGUAGE_BY_EXTENSION = Object.freeze({
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.json': 'json',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.py': 'python',
  '.php': 'php',
  '.go': 'go',
  '.txt': 'text',
  '.xml': 'xml',
  '.svg': 'xml',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.ini': 'text',
  '.env': 'text',
});

const TEXT_EXTENSIONS = new Set(Object.keys(LANGUAGE_BY_EXTENSION));

const PREVIEW_MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
});

const MAX_PREVIEW_ASSET_BYTES = 12 * 1024 * 1024;

const RUNTIME_DEFINITIONS = Object.freeze([
  {
    id: 'node',
    label: 'Node.js',
    commands: ['node'],
    versionArgs: ['--version'],
    languages: ['javascript', 'typescript'],
  },
  {
    id: 'python',
    label: 'Python',
    commands:
      process.platform === 'win32'
        ? ['python', 'py', 'python3']
        : ['python3', 'python'],
    versionArgs: ['--version'],
    languages: ['python'],
  },
  {
    id: 'php',
    label: 'PHP',
    commands: ['php'],
    versionArgs: ['--version'],
    languages: ['php'],
  },
  {
    id: 'go',
    label: 'Go',
    commands: ['go'],
    versionArgs: ['version'],
    languages: ['go'],
  },
]);

const TERMINAL_COMMANDS = Object.freeze([
  'cat',
  'echo',
  'git',
  'go',
  'help',
  'ls',
  'node',
  'npm',
  'npx',
  'php',
  'pwd',
  'py',
  'python',
  'python3',
]);

const SPAWNABLE_COMMANDS = new Set([
  'git',
  'go',
  'node',
  'npm',
  'npx',
  'php',
  'py',
  'python',
  'python3',
]);

/**
 * Construit un environnement minimal pour les processus enfants.
 * @returns {Record<string, string>}
 */
function buildChildEnvironment() {
  const keys = [
    'PATH',
    'HOME',
    'USERPROFILE',
    'TMPDIR',
    'TEMP',
    'TMP',
    'LANG',
    'LC_ALL',
    'SystemRoot',
    'ComSpec',
    'PATHEXT',
    'APPDATA',
    'LOCALAPPDATA',
    'PROGRAMDATA',
    'PROGRAMFILES',
    'PROGRAMFILES(X86)',
  ];
  const environment = {};

  for (const key of keys) {
    if (typeof process.env[key] === 'string') {
      environment[key] = process.env[key];
    }
  }

  environment.THINK_DEV = '1';
  return environment;
}

/**
 * Exécute une commande sans shell.
 * @param {string} command
 * @param {string[]} args
 * @param {{cwd: string, timeout?: number}} options
 * @returns {Promise<{ok: boolean, code: number | null, stdout: string, stderr: string, timedOut: boolean, durationMs: number, error?: string}>}
 */
function execute(command, args, { cwd, timeout = COMMAND_TIMEOUT }) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd,
        env: buildChildEnvironment(),
        timeout,
        maxBuffer: MAX_OUTPUT_BYTES * 2,
        windowsHide: true,
        encoding: 'utf8',
      },
      (error, stdout = '', stderr = '') => {
        const timedOut = Boolean(error?.killed);
        const normalizedOut = String(stdout).slice(0, MAX_OUTPUT_BYTES);
        const normalizedErr = String(stderr).slice(0, MAX_OUTPUT_BYTES);
        let message = '';

        if (error && !timedOut) {
          message =
            error.code === 'ENOENT'
              ? `Commande introuvable : ${command}`
              : String(error.message || '').slice(0, 500);
        }

        if (timedOut) {
          message = `Commande interrompue après ${Math.round(
            timeout / 1000,
          )} secondes.`;
        }

        resolve({
          ok: !error,
          code: Number.isInteger(error?.code) ? error.code : error ? 1 : 0,
          stdout: normalizedOut,
          stderr: normalizedErr,
          timedOut,
          durationMs: Date.now() - startedAt,
          error: message,
        });
      },
    );
  });
}

/**
 * Vérifie qu'un chemin reste sous la racine.
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean}
 */
function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

/**
 * Échappe un texte pour insertion HTML.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Neutralise une fermeture de balise script dans du code utilisateur.
 * @param {string} value
 * @returns {string}
 */
function escapeScript(value) {
  return String(value).replace(/<\/script/gi, '<\\/script');
}

/**
 * Construit le pont de console injecté dans l'aperçu.
 * @returns {string}
 */
function buildPreviewBridge() {
  return `<script>
(function () {
  const send = (type, payload) => {
    try {
      parent.postMessage(
        { source: 'think-dev-preview', type, payload },
        'think-page://dev',
      );
    } catch (error) {
      // La fenêtre parente peut avoir été fermée.
    }
  };
  const format = (value) => {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (error) { return String(value); }
  };
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[level];
    console[level] = (...args) => {
      send('console', { level, text: args.map(format).join(' ') });
      if (typeof original === 'function') original.apply(console, args);
    };
  }
  window.addEventListener('error', (event) => {
    send('console', {
      level: 'error',
      text: (event.message || 'Erreur') + ' @ ' + (event.lineno || 0) + ':' + (event.colno || 0),
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    send('console', {
      level: 'error',
      text: 'Promesse rejetée : ' + format(event.reason),
    });
  });
})();
</script>`;
}

/**
 * Injecte le pont de console dans un document HTML.
 * @param {string} html
 * @returns {string}
 */
function injectPreviewBridge(html) {
  const bridge = buildPreviewBridge();

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${bridge}`);
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${bridge}</head>`);
  }

  return `${bridge}${html}`;
}

/**
 * Construit une URL de base pour les ressources relatives de l'aperçu.
 * @param {string} relative
 * @returns {string}
 */
function buildPreviewBaseUrl(relative) {
  const directory = path.posix.dirname(relative.replaceAll('\\', '/'));
  const encoded = directory
    .split('/')
    .filter((part) => part && part !== '.')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const suffix = encoded ? `${encoded}/` : '';
  return `${PAGE_SCHEME}://${PAGE_HOSTS.DEV}/file/${suffix}`;
}

/**
 * Injecte une balise base dans un document HTML.
 * @param {string} html
 * @param {string} baseUrl
 * @returns {string}
 */
function injectPreviewBase(html, baseUrl) {
  const base = `<base href="${baseUrl}">`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${base}`);
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${base}</head>`);
  }

  return `${base}${html}`;
}

/**
 * Détecte un interpréteur installé.
 * @param {object} definition
 * @returns {Promise<object>}
 */
async function detectRuntime(definition) {
  for (const command of definition.commands) {
    const result = await execute(command, definition.versionArgs, {
      cwd: app.getPath('home'),
      timeout: 4_000,
    });

    if (result.ok || (!result.timedOut && (result.stdout || result.stderr))) {
      const version = `${result.stdout || result.stderr}`
        .split(/\r?\n/)[0]
        .trim()
        .slice(0, 120);

      return {
        id: definition.id,
        label: definition.label,
        available: true,
        command,
        version,
        languages: definition.languages,
      };
    }
  }

  return {
    id: definition.id,
    label: definition.label,
    available: false,
    command: '',
    version: '',
    languages: definition.languages,
  };
}

/**
 * Gère l'espace de développement, ses fichiers et son terminal.
 */
class DevWorkspace {
  /**
   * @param {object} options
   * @param {import('./store').Store} options.store
   */
  constructor({ store }) {
    this.store = store;

    /** @type {string} */
    this.root = '';

    /** @type {object[] | null} */
    this.runtimes = null;

    /** @type {Map<string, {html: string, expiresAt: number}>} */
    this.previews = new Map();
  }

  /**
   * Retourne ou crée l'espace par défaut.
   * @returns {Promise<string>}
   */
  async ensureWorkspace() {
    const configured = this.store.getSettings().devWorkspace;

    if (configured) {
      try {
        const real = await fs.promises.realpath(configured);
        const stat = await fs.promises.stat(real);

        if (stat.isDirectory()) {
          this.root = real;
          return real;
        }
      } catch {
        // Le dossier configuré a été déplacé : on recrée l'espace par défaut.
      }
    }

    let root = path.join(app.getPath('documents'), 'Think-Browser Dev');
    let existed = false;

    try {
      existed = (await fs.promises.stat(root)).isDirectory();
    } catch {
      existed = false;
    }

    try {
      await fs.promises.mkdir(root, { recursive: true });
      root = await fs.promises.realpath(root);
    } catch {
      root = path.join(app.getPath('userData'), 'dev-workspace');
      await fs.promises.mkdir(root, { recursive: true });
      root = await fs.promises.realpath(root);
    }

    if (!existed) {
      const readme = path.join(root, 'README.md');

      try {
        await fs.promises.writeFile(
          readme,
          '# Think-Browser Dev\n\n' +
            'Cet espace est géré par `about:dev`. Créez un fichier HTML, ' +
            'CSS, JavaScript, Python, PHP ou Go depuis le panneau de gauche.\n\n' +
            'Le terminal exécute uniquement des commandes autorisées et ne ' +
            'constitue pas une sandbox de sécurité.\n',
          { encoding: 'utf8', flag: 'wx' },
        );
      } catch {
        // Un README existant n'est jamais écrasé.
      }
    }

    if (this.store.getSettings().devWorkspace !== root) {
      await this.store.updateSettings({ devWorkspace: root });
    }

    this.root = root;
    return root;
  }

  /**
   * Change l'espace de travail après validation.
   * @param {string} requested
   * @returns {Promise<string>}
   */
  async setWorkspace(requested) {
    if (typeof requested !== 'string' || !requested.trim()) {
      throw new Error('Dossier de travail invalide.');
    }

    const real = await fs.promises.realpath(path.resolve(requested));
    const stat = await fs.promises.stat(real);

    if (!stat.isDirectory()) {
      throw new Error('Le chemin choisi n’est pas un dossier.');
    }

    if (this.store.getSettings().devWorkspace !== real) {
      await this.store.updateSettings({ devWorkspace: real });
    }

    this.root = real;
    this.previews.clear();
    return real;
  }

  /**
   * Ouvre le sélecteur natif de dossier.
   * @returns {Promise<{canceled: boolean, path?: string}>}
   */
  async chooseWorkspace() {
    const current = await this.ensureWorkspace();
    const options = {
      title: 'Choisir l’espace de développement',
      defaultPath: current,
      properties: ['openDirectory', 'createDirectory'],
    };
    const parent = BrowserWindow.getFocusedWindow();
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    return { canceled: false, path: await this.setWorkspace(result.filePaths[0]) };
  }

  /**
   * Résout un chemin relatif sous la racine.
   * @param {string} relative
   * @param {{mustExist?: boolean, allowRoot?: boolean}} [options]
   * @returns {Promise<string>}
   */
  async resolvePath(relative, { mustExist = false, allowRoot = true } = {}) {
    const root = await this.ensureWorkspace();

    if (typeof relative !== 'string' || relative.includes('\0')) {
      throw new Error('Chemin invalide.');
    }

    const normalized = relative.replaceAll('\\', '/').trim();

    if (
      normalized.startsWith('/') ||
      /^[a-z]:/i.test(normalized) ||
      normalized.split('/').includes('..')
    ) {
      throw new Error('Chemin hors de l’espace de travail.');
    }

    const candidate = path.resolve(root, normalized || '.');

    if (!isInside(root, candidate)) {
      throw new Error('Chemin hors de l’espace de travail.');
    }

    if (candidate === root && !allowRoot) {
      throw new Error('Cette opération n’est pas autorisée sur la racine.');
    }

    try {
      const entry = await fs.promises.lstat(candidate);

      if (entry.isSymbolicLink()) {
        throw new Error('Les liens symboliques sont refusés par l’atelier.');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (candidate === root) {
      return root;
    }

    if (mustExist) {
      const real = await fs.promises.realpath(candidate);

      if (!isInside(root, real)) {
        throw new Error('Lien symbolique hors de l’espace de travail.');
      }

      return real;
    }

    const parent = path.dirname(candidate);
    const realParent = await fs.promises.realpath(parent);

    if (!isInside(root, realParent)) {
      throw new Error('Dossier parent hors de l’espace de travail.');
    }

    return path.join(realParent, path.basename(candidate));
  }

  /**
   * Indique si une extension est éditable comme texte.
   * @param {string} filePath
   * @returns {boolean}
   */
  isTextFile(filePath) {
    return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  /**
   * Retourne le langage d'un fichier.
   * @param {string} filePath
   * @returns {string}
   */
  getLanguage(filePath) {
    return (
      LANGUAGE_BY_EXTENSION[path.extname(filePath).toLowerCase()] || 'text'
    );
  }

  /**
   * Construit l'arborescence.
   * @param {string} root
   * @returns {Promise<object[]>}
   */
  async buildTree(root) {
    let count = 0;

    /**
     * @param {string} directory
     * @param {number} depth
     * @returns {Promise<object[]>}
     */
    const walk = async (directory, depth) => {
      if (depth > MAX_TREE_DEPTH || count >= MAX_TREE_ENTRIES) {
        return [];
      }

      let entries;

      try {
        entries = await fs.promises.readdir(directory, {
          withFileTypes: true,
        });
      } catch {
        return [];
      }

      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }

        return a.name.localeCompare(b.name, 'fr');
      });

      const nodes = [];

      for (const entry of entries) {
        if (count >= MAX_TREE_ENTRIES) {
          break;
        }

        if (IGNORED_NAMES.has(entry.name)) {
          continue;
        }

        const full = path.join(directory, entry.name);
        const relative = path
          .relative(root, full)
          .split(path.sep)
          .join('/');

        if (entry.isSymbolicLink()) {
          nodes.push({
            name: entry.name,
            path: relative,
            type: 'symlink',
            children: [],
          });
          continue;
        }

        if (entry.isDirectory()) {
          count += 1;
          nodes.push({
            name: entry.name,
            path: relative,
            type: 'directory',
            children: await walk(full, depth + 1),
          });
          continue;
        }

        if (entry.isFile()) {
          count += 1;
          let size = 0;

          try {
            size = Number((await fs.promises.stat(full)).size) || 0;
          } catch {
            // Le fichier a pu disparaître entre readdir et stat.
          }

          nodes.push({
            name: entry.name,
            path: relative,
            type: 'file',
            language: this.getLanguage(full),
            size,
            children: [],
          });
        }
      }

      return nodes;
    };

    return walk(root, 0);
  }

  /**
   * Retourne les interpréteurs disponibles.
   * @returns {Promise<object[]>}
   */
  async getRuntimes() {
    if (this.runtimes) {
      return this.runtimes;
    }

    this.runtimes = await Promise.all(
      RUNTIME_DEFINITIONS.map((definition) => detectRuntime(definition)),
    );
    return this.runtimes;
  }

  /**
   * Retourne l'état complet de l'atelier.
   * @returns {Promise<object>}
   */
  async getState() {
    const root = await this.ensureWorkspace();
    const tree = await this.buildTree(root);
    const runtimes = await this.getRuntimes();

    return {
      workspace: {
        path: root,
        name: path.basename(root),
      },
      tree,
      runtimes,
      limits: {
        maxFileBytes: MAX_FILE_BYTES,
        maxOutputBytes: MAX_OUTPUT_BYTES,
        maxTreeEntries: MAX_TREE_ENTRIES,
        runTimeoutMs: RUN_TIMEOUT,
        commandTimeoutMs: COMMAND_TIMEOUT,
      },
      terminal: {
        commands: TERMINAL_COMMANDS,
        warning:
          'Le terminal n’est pas une sandbox : le code exécuté hérite des ' +
          'droits de votre compte utilisateur. N’exécutez que du code de confiance.',
      },
      preview: {
        ttlMs: PREVIEW_TTL,
      },
    };
  }

  /**
   * Lit un fichier texte.
   * @param {string} relative
   * @returns {Promise<object>}
   */
  async readFile(relative) {
    const filePath = await this.resolvePath(relative, { mustExist: true });
    const stat = await fs.promises.stat(filePath);

    if (!stat.isFile()) {
      throw new Error('Ce chemin n’est pas un fichier.');
    }

    if (!this.isTextFile(filePath)) {
      throw new Error('Ce type de fichier n’est pas éditable en texte.');
    }

    if (stat.size > MAX_FILE_BYTES) {
      throw new Error('Fichier trop volumineux pour l’éditeur (1 Mo max).');
    }

    const content = await fs.promises.readFile(filePath, 'utf8');

    if (content.includes('\0')) {
      throw new Error('Fichier binaire refusé.');
    }

    return {
      path: relative.replaceAll('\\', '/'),
      content,
      language: this.getLanguage(filePath),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  /**
   * Écrit un fichier texte.
   * @param {string} relative
   * @param {string} content
   * @returns {Promise<object>}
   */
  async writeFile(relative, content) {
    if (typeof content !== 'string') {
      throw new Error('Contenu invalide.');
    }

    if (content.includes('\0')) {
      throw new Error('Contenu binaire refusé.');
    }

    const byteLength = Buffer.byteLength(content, 'utf8');

    if (byteLength > MAX_FILE_BYTES) {
      throw new Error('Le fichier dépasse la limite de 1 Mo.');
    }

    let filePath;

    try {
      filePath = await this.resolvePath(relative, { mustExist: true });
    } catch {
      filePath = await this.resolvePath(relative, { mustExist: false });
    }

    if (!this.isTextFile(filePath)) {
      throw new Error('Ce type de fichier n’est pas éditable en texte.');
    }

    await fs.promises.writeFile(filePath, content, 'utf8');
    const stat = await fs.promises.stat(filePath);

    return {
      path: relative.replaceAll('\\', '/'),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  /**
   * Crée un fichier ou un dossier.
   * @param {string} relative
   * @param {'file'|'directory'} type
   * @returns {Promise<object>}
   */
  async createEntry(relative, type) {
    const filePath = await this.resolvePath(relative, { mustExist: false });

    if (type === 'directory') {
      await fs.promises.mkdir(filePath, { recursive: false });
    } else {
      if (!this.isTextFile(filePath)) {
        throw new Error(
          'Extension non prise en charge. Utilisez .js, .css, .html, .py, .php, .go, .json ou .md.',
        );
      }

      await fs.promises.writeFile(filePath, '', {
        encoding: 'utf8',
        flag: 'wx',
      });
    }

    return {
      path: relative.replaceAll('\\', '/'),
      type,
    };
  }

  /**
   * Renomme ou déplace une entrée.
   * @param {string} from
   * @param {string} to
   * @returns {Promise<object>}
   */
  async renameEntry(from, to) {
    const source = await this.resolvePath(from, {
      mustExist: true,
      allowRoot: false,
    });
    const target = await this.resolvePath(to, { mustExist: false });

    try {
      await fs.promises.access(target);
      throw new Error('La destination existe déjà.');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    await fs.promises.rename(source, target);

    return {
      from: from.replaceAll('\\', '/'),
      to: to.replaceAll('\\', '/'),
    };
  }

  /**
   * Supprime une entrée.
   * @param {string} relative
   * @returns {Promise<object>}
   */
  async deleteEntry(relative) {
    const target = await this.resolvePath(relative, {
      mustExist: true,
      allowRoot: false,
    });

    await fs.promises.rm(target, { recursive: true, force: false });
    return { path: relative.replaceAll('\\', '/') };
  }

  /**
   * Lance un fichier avec l'interpréteur correspondant.
   * @param {string} relative
   * @returns {Promise<object>}
   */
  async runFile(relative) {
    const filePath = await this.resolvePath(relative, { mustExist: true });
    const language = this.getLanguage(filePath);
    const runtimes = await this.getRuntimes();
    const runtimeId =
      language === 'python'
        ? 'python'
        : language === 'php'
          ? 'php'
          : language === 'go'
            ? 'go'
            : language === 'javascript'
              ? 'node'
              : '';
    const runtime = runtimes.find((entry) => entry.id === runtimeId);

    if (!runtimeId) {
      return {
        ok: false,
        message:
          'Ce langage se prévisualise dans le navigateur. Utilisez l’onglet ' +
          'Aperçu pour HTML, CSS ou JavaScript.',
      };
    }

    if (!runtime?.available) {
      return {
        ok: false,
        message: `${runtime?.label || runtimeId} n’est pas installé ou n’est pas dans le PATH.`,
      };
    }

    const args =
      runtimeId === 'go' ? ['run', filePath] : [filePath];
    const result = await execute(runtime.command, args, {
      cwd: path.dirname(filePath),
      timeout: RUN_TIMEOUT,
    });

    return {
      ...result,
      path: relative.replaceAll('\\', '/'),
      language,
      runtime: runtime.label,
    };
  }

  /**
   * Tokenise une ligne de terminal sans shell.
   * @param {string} input
   * @returns {string[]}
   */
  tokenize(input) {
    if (typeof input !== 'string' || !input.trim()) {
      throw new Error('Commande vide.');
    }

    if (input.length > 2_000 || /[\0\r\n]/.test(input)) {
      throw new Error('Commande invalide.');
    }

    if (/[;&|<>`]/.test(input)) {
      throw new Error(
        'Les opérateurs shell (;, &, |, <, >, `) sont interdits.',
      );
    }

    const tokens = [];
    let current = '';
    let quote = '';

    for (let index = 0; index < input.length; index += 1) {
      const character = input[index];

      if (quote) {
        if (character === quote) {
          quote = '';
        } else if (character === '\\' && index + 1 < input.length) {
          index += 1;
          current += input[index];
        } else {
          current += character;
        }
        continue;
      }

      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }

      if (/\s/.test(character)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }

      current += character;
    }

    if (quote) {
      throw new Error('Guillemet non fermé.');
    }

    if (current) {
      tokens.push(current);
    }

    if (tokens.length === 0 || tokens.length > 64) {
      throw new Error('Commande invalide.');
    }

    return tokens;
  }

  /**
   * Liste un dossier pour la commande `ls`.
   * @param {string} relative
   * @returns {Promise<string>}
   */
  async listDirectory(relative) {
    const directory = await this.resolvePath(relative || '.', {
      mustExist: true,
    });
    const stat = await fs.promises.stat(directory);

    if (!stat.isDirectory()) {
      throw new Error('Ce chemin n’est pas un dossier.');
    }

    const entries = await fs.promises.readdir(directory, {
      withFileTypes: true,
    });

    return entries
      .filter((entry) => !IGNORED_NAMES.has(entry.name))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'fr');
      })
      .map((entry) => `${entry.isDirectory() ? 'd' : '-'} ${entry.name}`)
      .join('\n');
  }

  /**
   * Exécute une commande de terminal limitée.
   * @param {string} input
   * @param {string} [cwd]
   * @returns {Promise<object>}
   */
  async runCommand(input, cwd = '') {
    const tokens = this.tokenize(input);
    const command = tokens[0].toLowerCase();
    const args = tokens.slice(1);

    if (!TERMINAL_COMMANDS.includes(command)) {
      return {
        ok: false,
        message:
          `Commande non autorisée : ${command}. Commandes disponibles : ` +
          TERMINAL_COMMANDS.join(', '),
        stdout: '',
        stderr: '',
        code: 1,
        timedOut: false,
        durationMs: 0,
      };
    }

    if (command === 'help') {
      return {
        ok: true,
        stdout:
          'Commandes autorisées : ' +
          TERMINAL_COMMANDS.join(', ') +
          '\nLe terminal est sans état : chaque commande part du dossier courant ' +
          'du projet. Utilisez le sélecteur de dossier pour changer de contexte.',
        stderr: '',
        code: 0,
        timedOut: false,
        durationMs: 0,
      };
    }

    if (command === 'pwd') {
      return {
        ok: true,
        stdout: await this.ensureWorkspace(),
        stderr: '',
        code: 0,
        timedOut: false,
        durationMs: 0,
      };
    }

    if (command === 'ls') {
      try {
        const target = args.find((arg) => !arg.startsWith('-')) || cwd || '.';
        return {
          ok: true,
          stdout: await this.listDirectory(target),
          stderr: '',
          code: 0,
          timedOut: false,
          durationMs: 0,
        };
      } catch (error) {
        return {
          ok: false,
          stdout: '',
          stderr: error.message,
          code: 1,
          timedOut: false,
          durationMs: 0,
        };
      }
    }

    if (command === 'cat') {
      try {
        const target = args.find((arg) => !arg.startsWith('-'));

        if (!target) {
          throw new Error('Usage : cat <fichier>');
        }

        const result = await this.readFile(target);
        return {
          ok: true,
          stdout: result.content,
          stderr: '',
          code: 0,
          timedOut: false,
          durationMs: 0,
        };
      } catch (error) {
        return {
          ok: false,
          stdout: '',
          stderr: error.message,
          code: 1,
          timedOut: false,
          durationMs: 0,
        };
      }
    }

    if (command === 'echo') {
      return {
        ok: true,
        stdout: args.join(' '),
        stderr: '',
        code: 0,
        timedOut: false,
        durationMs: 0,
      };
    }

    if (!SPAWNABLE_COMMANDS.has(command)) {
      return {
        ok: false,
        stdout: '',
        stderr: 'Cette commande intégrée n’est pas exécutable.',
        code: 1,
        timedOut: false,
        durationMs: 0,
      };
    }

    const runtimeCommands = new Set([
      'node',
      'php',
      'go',
      'py',
      'python',
      'python3',
    ]);
    let spawnCommand = command;

    if (runtimeCommands.has(command)) {
      const runtimes = await this.getRuntimes();
      const runtime = runtimes.find(
        (entry) =>
          entry.available &&
          ((command === 'node' && entry.id === 'node') ||
            (command === 'php' && entry.id === 'php') ||
            (command === 'go' && entry.id === 'go') ||
            (['py', 'python', 'python3'].includes(command) &&
              entry.id === 'python')),
      );

      if (!runtime) {
        return {
          ok: false,
          stdout: '',
          stderr: `${command} n’est pas installé ou n’est pas dans le PATH.`,
          code: 127,
          timedOut: false,
          durationMs: 0,
        };
      }

      spawnCommand = runtime.command;
    }

    let workingDirectory;

    try {
      workingDirectory = cwd
        ? await this.resolvePath(cwd, { mustExist: true })
        : await this.ensureWorkspace();
    } catch (error) {
      return {
        ok: false,
        stdout: '',
        stderr: error.message,
        code: 1,
        timedOut: false,
        durationMs: 0,
      };
    }

    return execute(spawnCommand, args, {
      cwd: workingDirectory,
      timeout: COMMAND_TIMEOUT,
    });
  }

  /**
   * Crée un aperçu HTML isolé.
   * @param {string} relative
   * @param {string} [content]
   * @returns {Promise<object>}
   */
  async createPreview(relative, content) {
    const filePath = await this.resolvePath(relative, { mustExist: true });
    const language = this.getLanguage(filePath);
    let source = content;

    if (typeof source !== 'string') {
      const file = await this.readFile(relative);
      source = file.content;
    }

    if (Buffer.byteLength(source, 'utf8') > MAX_PREVIEW_BYTES) {
      throw new Error('Aperçu trop volumineux (2 Mo max).');
    }

    let html = '';

    const baseUrl = buildPreviewBaseUrl(relative);

    if (language === 'html') {
      html = injectPreviewBase(injectPreviewBridge(source), baseUrl);
    } else if (language === 'css') {
      html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><base href="${baseUrl}">${buildPreviewBridge()}
<style>${source}</style></head>
<body><main class="preview-demo"><h1>Aperçu CSS</h1><p>Ce paragraphe et ce titre utilisent votre feuille de style.</p><button>Bouton de démonstration</button><ul><li>Premier élément</li><li>Deuxième élément</li></ul></main></body></html>`;
    } else if (language === 'javascript') {
      html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><base href="${baseUrl}">${buildPreviewBridge()}
<style>body{font-family:system-ui,sans-serif;margin:24px;background:#0b0f14;color:#e8eef6} #app{padding:16px;border:1px solid #263343;border-radius:10px}</style></head>
<body><div id="app">Sortie JavaScript</div><script>${escapeScript(source)}</script></body></html>`;
    } else if (language === 'markdown' || language === 'text') {
      html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;margin:24px;background:#0b0f14;color:#e8eef6}pre{white-space:pre-wrap;font-family:ui-monospace,monospace}</style></head><body><pre>${escapeHtml(source)}</pre></body></html>`;
    } else if (language === 'json') {
      let formatted = source;

      try {
        formatted = JSON.stringify(JSON.parse(source), null, 2);
      } catch {
        formatted = source;
      }

      html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;margin:24px;background:#0b0f14;color:#e8eef6}pre{white-space:pre-wrap;font-family:ui-monospace,monospace}</style></head><body><pre>${escapeHtml(formatted)}</pre></body></html>`;
    } else {
      throw new Error(
        'Aperçu indisponible pour ce langage. Utilisez Exécuter pour Python, PHP ou Go.',
      );
    }

    const token = crypto.randomBytes(18).toString('hex');
    const now = Date.now();

    for (const [key, preview] of this.previews) {
      if (preview.expiresAt <= now) {
        this.previews.delete(key);
      }
    }

    while (this.previews.size >= MAX_PREVIEWS) {
      const oldest = this.previews.keys().next().value;
      this.previews.delete(oldest);
    }

    this.previews.set(token, {
      html,
      expiresAt: now + PREVIEW_TTL,
    });

    return {
      ok: true,
      token,
      language,
      url: `${PAGE_SCHEME}://${PAGE_HOSTS.DEV}/preview/${token}`,
    };
  }

  /**
   * Sert un aperçu HTML.
   * @param {Request} request
   * @param {string} token
   * @returns {Response}
   */
  handlePreview(request, token) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Méthode non autorisée.', { status: 405 });
    }

    const preview = this.previews.get(token);

    if (!preview || preview.expiresAt <= Date.now()) {
      this.previews.delete(token);
      return new Response('Aperçu expiré.', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    return new Response(request.method === 'HEAD' ? null : preview.html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'content-security-policy':
          "sandbox allow-scripts allow-forms allow-modals; " +
          "default-src 'none'; script-src think-page://dev 'unsafe-inline' https: http:; " +
          "style-src think-page://dev 'unsafe-inline' https: http:; " +
          "img-src think-page://dev data: blob: https: http:; " +
          "media-src think-page://dev data: blob: https: http:; " +
          "font-src think-page://dev data: https: http:; " +
          "connect-src https: http:; frame-src https: http:; " +
          "form-action 'none'; object-src 'none'; " +
          "base-uri think-page://dev; frame-ancestors think-page://dev;",
      },
    });
  }

  /**
   * Sert une ressource de l'espace de travail pour l'aperçu.
   *
   * Le document HTML est forcé dans une sandbox par CSP : même ouvert au
   * niveau supérieur, il ne peut pas appeler les API de l'atelier.
   *
   * @param {Request} request
   * @param {string} relative
   * @returns {Promise<Response>}
   */
  async handleFile(request, relative) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Méthode non autorisée.', { status: 405 });
    }

    try {
      const filePath = await this.resolvePath(relative, { mustExist: true });
      const stat = await fs.promises.stat(filePath);

      if (!stat.isFile()) {
        return new Response('Ressource introuvable.', { status: 404 });
      }

      if (stat.size > MAX_PREVIEW_ASSET_BYTES) {
        return new Response('Ressource trop volumineuse.', { status: 413 });
      }

      const extension = path.extname(filePath).toLowerCase();
      const contentType =
        PREVIEW_MIME_TYPES[extension] || 'application/octet-stream';
      const headers = {
        'content-type': contentType,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      };

      if (extension === '.html' || extension === '.htm') {
        headers['content-security-policy'] =
          "sandbox allow-scripts allow-forms allow-modals; " +
          "default-src 'none'; script-src think-page://dev 'unsafe-inline' https: http:; " +
          "style-src think-page://dev 'unsafe-inline' https: http:; " +
          "img-src think-page://dev data: blob: https: http:; " +
          "media-src think-page://dev data: blob: https: http:; " +
          "font-src think-page://dev data: https: http:; " +
          "connect-src https: http:; " +
          "form-action 'none'; object-src 'none'; " +
          "base-uri think-page://dev; frame-ancestors think-page://dev;";
      } else {
        // Même une ressource SVG ou média ouverte au niveau supérieur ne doit
        // pas hériter de l'origine `think-page://dev` et appeler les API.
        headers['content-security-policy'] =
          "sandbox; default-src 'none'; frame-ancestors think-page://dev;";
      }

      if (request.method === 'HEAD') {
        return new Response(null, { status: 200, headers });
      }

      const content = await fs.promises.readFile(filePath);
      return new Response(content, { status: 200, headers });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return new Response('Ressource introuvable.', { status: 404 });
      }

      return new Response(error.message || 'Ressource refusée.', {
        status: 403,
      });
    }
  }

  /**
   * Lit un corps JSON borné.
   * @param {Request} request
   * @returns {Promise<object>}
   */
  async readJson(request) {
    const length = Number(request.headers.get('content-length') || 0);

    if (length > 4 * 1024 * 1024) {
      throw new Error('Requête trop volumineuse.');
    }

    const text = await request.text();

    if (text.length > 4 * 1024 * 1024) {
      throw new Error('Requête trop volumineuse.');
    }

    let body = {};

    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error('Corps JSON invalide.');
      }
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Corps JSON invalide.');
    }

    return body;
  }

  /**
   * Réponse JSON locale.
   * @param {unknown} payload
   * @param {number} [status]
   * @returns {Response}
   */
  json(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  /**
   * Traite une route API de `about:dev`.
   * @param {Request} request
   * @param {string} pathname
   * @param {object} deps
   * @returns {Promise<Response>}
   */
  async handleApi(request, pathname, deps) {
    try {
      if (pathname === '/api/dev/state' && request.method === 'GET') {
        return this.json(await this.getState());
      }

      if (pathname === '/api/dev/workspace' && request.method === 'POST') {
        const body = await this.readJson(request);

        // Un chemin arbitraire ne doit jamais être accepté par une page : le
        // changement d'espace passe obligatoirement par le sélecteur natif,
        // donc par une action explicite de l'utilisateur.
        if (body.action !== 'choose') {
          throw new Error(
            'Le dossier de travail doit être choisi avec le sélecteur natif.',
          );
        }

        const result = await this.chooseWorkspace();

        return this.json({
          ...result,
          state: await this.getState(),
        });
      }

      if (pathname === '/api/dev/fs' && request.method === 'POST') {
        const body = await this.readJson(request);
        let result;

        switch (body.action) {
          case 'read':
            result = await this.readFile(body.path);
            break;
          case 'write':
            result = await this.writeFile(body.path, body.content);
            break;
          case 'create':
            result = await this.createEntry(
              body.path,
              body.type === 'directory' ? 'directory' : 'file',
            );
            break;
          case 'rename':
            result = await this.renameEntry(body.path, body.newPath);
            break;
          case 'delete':
            result = await this.deleteEntry(body.path);
            break;
          default:
            throw new Error('Action de fichier inconnue.');
        }

        return this.json({
          ok: true,
          ...result,
          tree: (await this.getState()).tree,
        });
      }

      if (pathname === '/api/dev/runtimes' && request.method === 'POST') {
        this.runtimes = null;
        return this.json({
          ok: true,
          runtimes: await this.getRuntimes(),
        });
      }

      if (pathname === '/api/dev/run' && request.method === 'POST') {
        const body = await this.readJson(request);
        return this.json(await this.runFile(body.path));
      }

      if (pathname === '/api/dev/terminal' && request.method === 'POST') {
        const body = await this.readJson(request);
        return this.json(
          await this.runCommand(body.command, body.cwd),
        );
      }

      if (pathname === '/api/dev/preview' && request.method === 'POST') {
        const body = await this.readJson(request);
        return this.json(
          await this.createPreview(body.path, body.content),
        );
      }

      return this.json({ ok: false, message: 'Route inconnue.' }, 404);
    } catch (error) {
      return this.json(
        { ok: false, message: error.message || 'Opération impossible.' },
        400,
      );
    }
  }
}

module.exports = {
  DevWorkspace,
  MAX_FILE_BYTES,
  MAX_OUTPUT_BYTES,
  RUNTIME_DEFINITIONS,
  TERMINAL_COMMANDS,
  buildChildEnvironment,
  detectRuntime,
  escapeHtml,
  isInside,
};
