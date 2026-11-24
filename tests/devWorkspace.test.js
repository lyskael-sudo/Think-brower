'use strict';

/**
 * Tests d'intrusion de l'atelier `about:dev`.
 *
 * Le module `electron` est remplacé par un double : le dossier de travail est
 * un répertoire temporaire réel. Les tests vérifient les refus de traversée,
 * de liens symboliques, de fichiers binaires ou trop gros, l'absence de shell,
 * le choix natif obligatoire et les CSP des aperçus.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

let dialogResult = { canceled: true, filePaths: [] };
let baseDirectory = '';

const electronMock = {
  app: {
    getPath: (name) => {
      if (name === 'home') {
        return process.env.HOME || baseDirectory;
      }

      return path.join(baseDirectory, name || 'userData');
    },
  },
  BrowserWindow: {
    getFocusedWindow: () => null,
  },
  dialog: {
    showOpenDialog: async () => dialogResult,
  },
};

const originalLoad = Module._load;
Module._load = function loadWithElectronMock(request, parent, isMain) {
  if (request === 'electron') {
    return electronMock;
  }

  return originalLoad.call(this, request, parent, isMain);
};

const { DevWorkspace } = require('../src/main/devWorkspace');

/**
 * Crée un espace de travail temporaire et son objet de dépendances.
 * @param {object} [settings]
 * @returns {Promise<{root: string, workspace: DevWorkspace, store: object}>}
 */
async function createWorkspace(settings = {}) {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'think-dev-test-'),
  );
  const state = {
    devWorkspace: root,
    ...settings,
  };
  const store = {
    getSettings: () => ({ ...state }),
    updateSettings: async (patch) => {
      Object.assign(state, patch);
      return { ...state };
    },
  };
  const workspace = new DevWorkspace({ store });
  // Évite de lancer quatre détections d'interpréteurs à chaque getState().
  workspace.runtimes = [
    {
      id: 'node',
      label: 'Node.js',
      available: false,
      command: '',
      version: '',
      languages: ['javascript', 'typescript'],
    },
    {
      id: 'python',
      label: 'Python',
      available: false,
      command: '',
      version: '',
      languages: ['python'],
    },
    {
      id: 'php',
      label: 'PHP',
      available: false,
      command: '',
      version: '',
      languages: ['php'],
    },
    {
      id: 'go',
      label: 'Go',
      available: false,
      command: '',
      version: '',
      languages: ['go'],
    },
  ];
  await workspace.setWorkspace(root);

  return { root, workspace, store };
}

/**
 * Supprime un espace temporaire.
 * @param {string} root
 */
async function cleanup(root) {
  await fs.promises.rm(root, { recursive: true, force: true });
}

/**
 * Construit une requête compatible avec les routes de l'atelier.
 * @param {string} url
 * @param {{method?: string, body?: string, headers?: Record<string, string>}} [options]
 * @returns {object}
 */
function makeRequest(url, { method = 'GET', body = '', headers = {} } = {}) {
  return {
    url,
    method,
    headers: new Headers(headers),
    text: async () => body,
  };
}

test('resolvePath refuse les traversées, les chemins absolus et la racine', async (t) => {
  const { root, workspace } = await createWorkspace();
  t.after(() => cleanup(root));

  const rejected = [
    '../secret.txt',
    '..\\secret.txt',
    '/etc/passwd',
    'C:\\Windows\\win.ini',
    'a/../../secret.txt',
    'a\0b',
  ];

  for (const relative of rejected) {
    await assert.rejects(
      () => workspace.resolvePath(relative),
      /hors de l’espace|invalide/i,
      relative,
    );
  }

  await assert.rejects(
    () => workspace.resolvePath('', { allowRoot: false }),
    /racine/i,
  );
  assert.equal(await workspace.resolvePath(''), root);
  assert.equal(await workspace.resolvePath('.'), root);
});

test('les opérations fichiers restent dans l’espace et refusent les fichiers sensibles', async (t) => {
  const { root, workspace } = await createWorkspace();
  t.after(() => cleanup(root));

  await workspace.writeFile('index.html', '<h1>ok</h1>');
  assert.equal((await workspace.readFile('index.html')).content, '<h1>ok</h1>');

  await workspace.createEntry('sub', 'directory');
  await workspace.createEntry('sub/app.js', 'file');
  await workspace.writeFile('sub/app.js', 'console.log("ok");');
  await workspace.renameEntry('sub/app.js', 'sub/main.js');
  assert.equal(
    (await workspace.readFile('sub/main.js')).content,
    'console.log("ok");',
  );

  await assert.rejects(
    () => workspace.writeFile('sub/binaire.bin', 'x'),
    /éditable|Extension/,
  );
  await assert.rejects(
    () => workspace.writeFile('sub/image.png', 'x'),
    /pas éditable|Extension/,
  );
  await assert.rejects(
    () => workspace.writeFile('sub/big.js', 'x'.repeat(1_000_001)),
    /limite de 1 Mo/,
  );
  await assert.rejects(
    () => workspace.writeFile('sub/nul.js', 'a\0b'),
    /binaire/i,
  );

  await workspace.deleteEntry('sub/main.js');
  await assert.rejects(
    () => workspace.readFile('sub/main.js'),
    /ENOENT|introuvable/i,
  );
  await assert.rejects(
    () => workspace.deleteEntry(''),
    /racine/i,
  );
  await assert.rejects(
    () => workspace.renameEntry('', 'renamed'),
    /racine/i,
  );
});

test('les liens symboliques sont refusés pour lire, écrire, supprimer et prévisualiser', async (t) => {
  const { root, workspace } = await createWorkspace();
  const outside = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'think-dev-outside-'),
  );
  t.after(() => cleanup(root));
  t.after(() => cleanup(outside));

  const secret = path.join(outside, 'secret.txt');
  await fs.promises.writeFile(secret, 'SECRET');

  try {
    await fs.promises.symlink(secret, path.join(root, 'lien.txt'));
    await fs.promises.symlink(outside, path.join(root, 'dossier-lien'));
  } catch (error) {
    t.skip(`Liens symboliques indisponibles : ${error.code || error.message}`);
    return;
  }

  await assert.rejects(
    () => workspace.readFile('lien.txt'),
    /symbolique/i,
  );
  await assert.rejects(
    () => workspace.writeFile('lien.txt', 'x'),
    /symbolique/i,
  );
  await assert.rejects(
    () => workspace.deleteEntry('lien.txt'),
    /symbolique/i,
  );
  await assert.rejects(
    () => workspace.renameEntry('lien.txt', 'copie.txt'),
    /symbolique/i,
  );
  await assert.rejects(
    () => workspace.readFile('dossier-lien/secret.txt'),
    /hors de l’espace|symbolique/i,
  );
  const linkedFile = await workspace.handleFile(
    makeRequest('think-page://dev/file/lien.txt'),
    'lien.txt',
  );
  assert.equal(linkedFile.status, 403);

  await assert.rejects(
    () => workspace.createPreview('lien.txt', 'x'),
    /symbolique/i,
  );

  const response = await workspace.handleFile(
    makeRequest('think-page://dev/file/../secret.txt'),
    '../secret.txt',
  );
  assert.equal(response.status, 403);
});

test('les aperçus HTML sont sandboxés, temporaires et à base relative', async (t) => {
  const { root, workspace } = await createWorkspace();
  t.after(() => cleanup(root));

  await workspace.createEntry('sub', 'directory');
  await workspace.writeFile(
    'sub/index.html',
    '<!doctype html><html><head><title>x</title></head><body><h1>Test</h1></body></html>',
  );

  const preview = await workspace.createPreview('sub/index.html');
  assert.equal(preview.language, 'html');
  assert.match(preview.token, /^[a-f0-9]{36}$/);
  assert.match(preview.url, /^think-page:\/\/dev\/preview\//);

  const stored = workspace.previews.get(preview.token);
  assert.match(stored.html, /<base href="think-page:\/\/dev\/file\/sub\/">/);
  assert.match(stored.html, /think-dev-preview/);
  assert.match(stored.html, /<h1>Test<\/h1>/);

  const response = workspace.handlePreview(
    makeRequest(preview.url),
    preview.token,
  );
  assert.equal(response.status, 200);
  const csp = response.headers.get('content-security-policy') || '';
  assert.match(csp, /^sandbox allow-scripts allow-forms allow-modals/);
  assert.match(csp, /base-uri think-page:\/\/dev/);
  assert.match(csp, /frame-ancestors think-page:\/\/dev/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');

  stored.expiresAt = 0;
  const expired = workspace.handlePreview(
    makeRequest(preview.url),
    preview.token,
  );
  assert.equal(expired.status, 404);
  assert.equal(
    workspace.handlePreview(makeRequest(preview.url), 'b'.repeat(36)).status,
    404,
  );
});

test('les fichiers servis pour l’aperçu portent une CSP sandbox, même en SVG', async (t) => {
  const { root, workspace } = await createWorkspace();
  t.after(() => cleanup(root));

  await workspace.writeFile(
    'page.html',
    '<!doctype html><html><body><script>console.log("ok")</script></body></html>',
  );
  await workspace.writeFile(
    'image.svg',
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );
  await workspace.writeFile('style.css', 'body{color:rgb(1,2,3)}');

  const html = await workspace.handleFile(
    makeRequest('think-page://dev/file/page.html'),
    'page.html',
  );
  assert.equal(html.status, 200);
  assert.match(
    html.headers.get('content-security-policy') || '',
    /sandbox allow-scripts/,
  );
  assert.match(
    html.headers.get('content-security-policy') || '',
    /form-action 'none'/,
  );

  const svg = await workspace.handleFile(
    makeRequest('think-page://dev/file/image.svg'),
    'image.svg',
  );
  assert.equal(svg.status, 200);
  assert.match(svg.headers.get('content-security-policy') || '', /^sandbox;/);
  assert.match(
    svg.headers.get('content-security-policy') || '',
    /default-src 'none'/,
  );

  const css = await workspace.handleFile(
    makeRequest('think-page://dev/file/style.css'),
    'style.css',
  );
  assert.equal(css.status, 200);
  assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8');
  assert.match(css.headers.get('content-security-policy') || '', /^sandbox;/);

  const missing = await workspace.handleFile(
    makeRequest('think-page://dev/file/absent.css'),
    'absent.css',
  );
  assert.equal(missing.status, 404);
});

test('le changement d’espace exige le sélecteur natif, jamais un chemin fourni', async (t) => {
  const { root, workspace } = await createWorkspace();
  const outside = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'think-dev-other-'),
  );
  t.after(() => cleanup(root));
  t.after(() => cleanup(outside));

  const forced = await workspace.handleApi(
    makeRequest('think-page://dev/api/dev/workspace', {
      method: 'POST',
      headers: { origin: 'think-page://dev' },
      body: JSON.stringify({ path: outside }),
    }),
    '/api/dev/workspace',
    {},
  );
  assert.equal(forced.status, 400);
  assert.match((await forced.json()).message, /sélecteur natif/);
  assert.equal(workspace.root, root);

  dialogResult = { canceled: true, filePaths: [] };
  const canceled = await workspace.handleApi(
    makeRequest('think-page://dev/api/dev/workspace', {
      method: 'POST',
      body: JSON.stringify({ action: 'choose' }),
    }),
    '/api/dev/workspace',
    {},
  );
  assert.equal(canceled.status, 200);
  assert.equal((await canceled.json()).canceled, true);
});

test('les routes API refusent les traversées de l’atelier', async (t) => {
  const { root, workspace } = await createWorkspace();
  t.after(() => cleanup(root));

  const response = await workspace.handleApi(
    makeRequest('think-page://dev/api/dev/fs', {
      method: 'POST',
      body: JSON.stringify({ action: 'read', path: '../../etc/passwd' }),
    }),
    '/api/dev/fs',
    {},
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /hors de l’espace/i);

  const write = await workspace.handleApi(
    makeRequest('think-page://dev/api/dev/fs', {
      method: 'POST',
      body: JSON.stringify({
        action: 'write',
        path: 'index.html',
        content: '<h1>ok</h1>',
      }),
    }),
    '/api/dev/fs',
    {},
  );
  assert.equal(write.status, 200);
  assert.equal(
    (await fs.promises.readFile(path.join(root, 'index.html'), 'utf8')),
    '<h1>ok</h1>',
  );
});

test('le terminal refuse le shell et les commandes hors liste', async (t) => {
  const { root, workspace } = await createWorkspace();
  t.after(() => cleanup(root));
  await workspace.writeFile('README.md', 'bonjour');

  for (const input of [
    'echo a; rm -rf /',
    'echo a && rm -rf /',
    'echo a | cat',
    'echo `id`',
    'echo $((1+1)) > fichier',
    'echo a\nrm -rf /',
  ]) {
    assert.throws(() => workspace.tokenize(input), /interdit|invalide/i, input);
  }

  const forbidden = await workspace.runCommand('rm -rf /');
  assert.equal(forbidden.ok, false);
  assert.match(forbidden.message, /non autorisée/);

  const help = await workspace.runCommand('help');
  assert.equal(help.ok, true);
  assert.match(help.stdout, /Commandes autorisées/);

  const pwd = await workspace.runCommand('pwd');
  assert.equal(pwd.ok, true);
  assert.equal(pwd.stdout, root);

  const cat = await workspace.runCommand('cat README.md');
  assert.equal(cat.ok, true);
  assert.equal(cat.stdout, 'bonjour');

  const escape = await workspace.runCommand('cat ../secret.txt');
  assert.equal(escape.ok, false);
  assert.match(escape.stderr, /hors de l’espace/i);

  const echo = await workspace.runCommand('echo "un deux"');
  assert.equal(echo.ok, true);
  assert.equal(echo.stdout, 'un deux');

  const unavailable = await workspace.runCommand('node --version');
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.code, 127);
});

test('runFile refuse les chemins hors espace et les langages non exécutables', async (t) => {
  const { root, workspace } = await createWorkspace();
  t.after(() => cleanup(root));

  await workspace.writeFile('page.html', '<h1>ok</h1>');

  await assert.rejects(
    () => workspace.runFile('../secret.py'),
    /hors de l’espace/i,
  );

  const html = await workspace.runFile('page.html');
  assert.equal(html.ok, false);
  assert.match(html.message, /prévisualise/);
});

test('l’arbre ignore les dossiers lourds et ne suit pas les liens', async (t) => {
  const { root, workspace } = await createWorkspace();
  t.after(() => cleanup(root));

  await workspace.createEntry('src', 'directory');
  await workspace.writeFile('src/app.js', 'console.log(1);');
  await workspace.createEntry('node_modules', 'directory');
  await workspace.writeFile('node_modules/secret.js', 'x');

  const state = await workspace.getState();
  const names = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      names.push(node.name);
      walk(node.children || []);
    }
  };
  walk(state.tree);

  assert.ok(names.includes('src'));
  assert.ok(names.includes('app.js'));
  assert.ok(!names.includes('node_modules'));
  assert.ok(!names.includes('secret.js'));
});
