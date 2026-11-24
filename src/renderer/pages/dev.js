'use strict';

/**
 * Think-Browser Dev — logique de la page `about:dev`.
 *
 * Aucun accès Node.js n'est accordé à cette page. Toutes les opérations de
 * fichiers, d'exécution et de terminal passent par les routes same-origin du
 * protocole `think-page`, qui valident les chemins et les commandes.
 */

const el = (id) => document.getElementById(id);

const elements = {
  workspacePath: el('dev-workspace-path'),
  workspaceState: el('dev-workspace-state'),
  chooseWorkspace: el('dev-choose-workspace'),
  refresh: el('dev-refresh'),
  status: el('dev-status'),
  tree: el('dev-tree'),
  newFile: el('dev-new-file'),
  newFolder: el('dev-new-folder'),
  renameEntry: el('dev-rename-entry'),
  deleteEntry: el('dev-delete-entry'),
  runtimes: el('dev-runtimes'),
  refreshRuntimes: el('dev-refresh-runtimes'),
  tabs: el('dev-tabs'),
  breadcrumb: el('dev-breadcrumb'),
  empty: el('dev-empty'),
  emptyNew: el('dev-empty-new'),
  emptyFolder: el('dev-empty-folder'),
  editorWrap: el('dev-editor-wrap'),
  editor: el('dev-editor'),
  lineNumbers: el('dev-line-numbers'),
  save: el('dev-save'),
  run: el('dev-run'),
  preview: el('dev-preview'),
  statusLanguage: el('dev-status-language'),
  statusPosition: el('dev-status-position'),
  statusSize: el('dev-status-size'),
  statusDirty: el('dev-status-dirty'),
  statusWorkspace: el('dev-status-workspace'),
  panelTabs: Array.from(document.querySelectorAll('[data-panel]')),
  panelTerminal: el('dev-panel-terminal'),
  panelOutput: el('dev-panel-output'),
  panelPreview: el('dev-panel-preview'),
  terminalOutput: el('dev-terminal-output'),
  terminalInput: el('dev-terminal-input'),
  terminalRun: el('dev-terminal-run'),
  terminalCommands: el('dev-terminal-commands'),
  clearTerminal: el('dev-clear-terminal'),
  runOutput: el('dev-run-output'),
  previewFrame: el('dev-preview-frame'),
  previewEmpty: el('dev-preview-empty'),
  promptDialog: el('dev-prompt-dialog'),
  promptTitle: el('dev-prompt-title'),
  promptLabel: el('dev-prompt-label'),
  promptInput: el('dev-prompt-input'),
  promptError: el('dev-prompt-error'),
  promptOk: el('dev-prompt-ok'),
  promptCancel: el('dev-prompt-cancel'),
};

/** @type {object | null} */
let workspaceState = null;

/** @type {{path: string, name: string, content: string, savedContent: string, language: string, size: number}[]} */
let tabs = [];

/** @type {string | null} */
let activePath = null;

/** @type {string | null} */
let selectedPath = null;

/** @type {'file' | 'directory' | null} */
let selectedType = null;

/** @type {Set<string>} */
const expanded = new Set();

/** @type {string[]} */
let terminalHistory = [];

/** @type {number} */
let terminalHistoryIndex = -1;

/** @type {string} */
let previewUrl = '';

/** @type {((value: string | null) => void) | null} */
let promptResolver = null;

/**
 * Appelle une route JSON interne.
 * @param {string} route
 * @param {RequestInit} [options]
 * @returns {Promise<object>}
 */
async function request(route, options = {}) {
  const response = await fetch(route, {
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.body
        ? {
            'content-type': 'application/json',
            'x-think-request': '1',
          }
        : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || `Erreur ${response.status}.`);
  }

  return data;
}

/**
 * Envoie un corps JSON.
 * @param {string} route
 * @param {object} body
 * @returns {Promise<object>}
 */
function post(route, body) {
  return request(route, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Affiche un message d'état.
 * @param {string} message
 * @param {'success' | 'error' | ''} [variant]
 */
function setStatus(message, variant = '') {
  elements.status.textContent = message;
  elements.status.className = `status${variant ? ` status--${variant}` : ''}`;
}

/**
 * Formate un nombre d'octets.
 * @param {number} value
 * @returns {string}
 */
function formatBytes(value) {
  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 o';
  }

  const units = ['o', 'Ko', 'Mo'];
  let amount = bytes;
  let unit = 0;

  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }

  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * Supprime les séquences ANSI d'une sortie de commande.
 * @param {string} value
 * @returns {string}
 */
function stripAnsi(value) {
  return String(value || '').replace(
    // eslint-disable-next-line no-control-regex
    /\u001b\[[0-9;?]*[ -/]*[@-~]/g,
    '',
  );
}

/**
 * Retourne le nom de base d'un chemin relatif.
 * @param {string} value
 * @returns {string}
 */
function basename(value) {
  const parts = String(value || '').split('/');
  return parts[parts.length - 1] || value;
}

/**
 * Retourne le dossier parent d'un chemin relatif.
 * @param {string} value
 * @returns {string}
 */
function dirname(value) {
  const parts = String(value || '').split('/');
  parts.pop();
  return parts.join('/');
}

/**
 * Normalise un chemin relatif saisi par l'utilisateur.
 * @param {string} value
 * @returns {string}
 */
function normalizeRelative(value) {
  return String(value || '')
    .replaceAll('\\', '/')
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/');
}

/**
 * Construit un chemin relatif.
 * @param {string} parent
 * @param {string} name
 * @returns {string}
 */
function joinPath(parent, name) {
  return normalizeRelative([parent, name].filter(Boolean).join('/'));
}

/**
 * Retourne un onglet par son chemin.
 * @param {string} path
 * @returns {object | null}
 */
function findTab(path) {
  return tabs.find((tab) => tab.path === path) || null;
}

/**
 * Retourne l'onglet actif.
 * @returns {object | null}
 */
function activeTab() {
  return activePath ? findTab(activePath) : null;
}

/**
 * Cherche un nœud dans l'arborescence.
 * @param {object[]} nodes
 * @param {string} target
 * @returns {object | null}
 */
function findNode(nodes, target) {
  for (const node of nodes || []) {
    if (node.path === target) {
      return node;
    }

    const found = findNode(node.children, target);

    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Ajoute les dossiers parents à l'ensemble déplié.
 * @param {string} path
 */
function expandParents(path) {
  const parts = String(path || '').split('/');
  parts.pop();
  let current = '';

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    expanded.add(current);
  }
}

/**
 * Retourne l'icône textuelle d'un fichier.
 * @param {object} node
 * @returns {{label: string, className: string}}
 */
function fileIcon(node) {
  if (node.type === 'directory') {
    return { label: '▸', className: 'dev-tree__icon--dir' };
  }

  if (node.type === 'symlink') {
    return { label: '↗', className: 'dev-tree__symlink' };
  }

  const extension = String(node.name || '')
    .split('.')
    .pop()
    .toLowerCase();
  const icons = {
    js: ['JS', 'js'],
    mjs: ['JS', 'js'],
    cjs: ['JS', 'js'],
    jsx: ['JS', 'js'],
    ts: ['TS', 'js'],
    tsx: ['TS', 'js'],
    css: ['CSS', 'css'],
    html: ['<>', 'html'],
    htm: ['<>', 'html'],
    py: ['PY', 'py'],
    php: ['PHP', 'php'],
    go: ['GO', 'go'],
    md: ['MD', 'md'],
    json: ['{}', 'md'],
    txt: ['TXT', 'md'],
  };
  const icon = icons[extension] || ['·', 'md'];
  return {
    label: icon[0],
    className: `dev-tree__icon--${icon[1]}`,
  };
}

/**
 * Affiche l'arborescence.
 * @param {object[]} nodes
 * @param {number} [depth]
 */
function renderTreeNodes(nodes, depth = 0) {
  for (const node of nodes || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dev-tree__node';
    button.classList.add(`depth-${Math.min(depth, 6)}`);
    button.dataset.path = node.path;
    button.setAttribute('role', 'treeitem');

    if (node.type === 'directory') {
      button.classList.add('is-directory');
      button.setAttribute('aria-expanded', String(expanded.has(node.path)));
    }

    if (selectedPath === node.path) {
      button.classList.add('is-selected');
    }

    const chevron = document.createElement('span');
    chevron.className = 'dev-tree__chevron';
    chevron.textContent =
      node.type === 'directory'
        ? expanded.has(node.path)
          ? '▾'
          : '▸'
        : '';

    const icon = document.createElement('span');
    const iconInfo = fileIcon(node);
    icon.className = `dev-tree__icon ${iconInfo.className}`;
    icon.textContent = iconInfo.label;

    const name = document.createElement('span');
    name.className = 'dev-tree__name';
    name.textContent = node.name;

    button.append(chevron, icon, name);

    if (node.type === 'symlink') {
      const badge = document.createElement('span');
      badge.className = 'dev-tree__symlink';
      badge.textContent = 'lien';
      button.append(badge);
    }

    button.addEventListener('click', () => {
      selectedPath = node.path;
      selectedType =
        node.type === 'directory' ? 'directory' : 'file';

      if (node.type === 'directory') {
        if (expanded.has(node.path)) {
          expanded.delete(node.path);
        } else {
          expanded.add(node.path);
        }

        renderTree();
        updateSidebarActions();
        return;
      }

      if (node.type === 'symlink') {
        setStatus(
          'Les liens symboliques ne sont pas ouverts depuis l’explorateur.',
          'error',
        );
        updateSidebarActions();
        return;
      }

      void openFile(node.path);
      updateSidebarActions();
    });

    elements.tree.append(button);

    if (node.type === 'directory' && expanded.has(node.path)) {
      renderTreeNodes(node.children, depth + 1);
    }
  }
}

/**
 * Affiche l'explorateur.
 */
function renderTree() {
  elements.tree.replaceChildren();

  if (!workspaceState) {
    return;
  }

  if (!workspaceState.tree || workspaceState.tree.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dev-tree__empty';
    empty.textContent =
      'Dossier vide. Créez un fichier HTML, CSS, JS, Python, PHP ou Go.';
    elements.tree.append(empty);
    return;
  }

  renderTreeNodes(workspaceState.tree);
}

/**
 * Met à jour les boutons contextuels.
 */
function updateSidebarActions() {
  const hasSelection = Boolean(selectedPath);
  elements.renameEntry.disabled = !hasSelection;
  elements.deleteEntry.disabled = !hasSelection;
}

/**
 * Affiche les interpréteurs.
 */
function renderRuntimes() {
  elements.runtimes.replaceChildren();

  for (const runtime of workspaceState?.runtimes || []) {
    const item = document.createElement('div');
    item.className = `dev-runtime ${
      runtime.available ? 'dev-runtime--ok' : 'dev-runtime--off'
    }`;
    item.title = runtime.available
      ? `${runtime.label} : ${runtime.version}`
      : `${runtime.label} introuvable dans le PATH`;

    const name = document.createElement('span');
    name.className = 'dev-runtime__name';
    const dot = document.createElement('span');
    dot.className = 'dev-runtime__dot';
    name.append(dot, document.createTextNode(runtime.label));

    const version = document.createElement('span');
    version.className = 'dev-runtime__version';
    version.textContent = runtime.available
      ? runtime.version || 'disponible'
      : 'absent';

    item.append(name, version);
    elements.runtimes.append(item);
  }

  elements.terminalCommands.textContent = (
    workspaceState?.terminal?.commands || []
  ).join(', ');
}

/**
 * Affiche l'état de l'espace.
 */
function renderWorkspace() {
  if (!workspaceState) {
    return;
  }

  elements.workspacePath.textContent = workspaceState.workspace.path;
  elements.workspacePath.title = workspaceState.workspace.path;
  elements.workspaceState.textContent = 'Prêt';
  elements.workspaceState.className = 'pill pill--ok';
  elements.statusWorkspace.textContent = workspaceState.workspace.name;
  document.title = `${workspaceState.workspace.name} — about:dev`;
}

/**
 * Affiche les onglets.
 */
function renderTabs() {
  elements.tabs.replaceChildren();

  for (const tab of tabs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `dev-tab${tab.path === activePath ? ' is-active' : ''}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(tab.path === activePath));
    button.title = tab.path;

    const label = document.createElement('span');
    label.textContent = basename(tab.path);
    button.append(label);

    if (tab.content !== tab.savedContent) {
      const dot = document.createElement('span');
      dot.className = 'dev-tab__dot';
      dot.title = 'Modifications non enregistrées';
      button.append(dot);
    }

    const close = document.createElement('span');
    close.className = 'dev-tab__close';
    close.textContent = '×';
    close.title = 'Fermer';
    close.setAttribute('role', 'button');
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(tab.path);
    });
    button.append(close);

    button.addEventListener('click', () => {
      activePath = tab.path;
      selectedPath = tab.path;
      selectedType = 'file';
      renderTabs();
      renderEditor();
      renderTree();
      updateSidebarActions();
    });

    elements.tabs.append(button);
  }
}

/**
 * Met à jour les numéros de ligne.
 */
function renderLineNumbers() {
  const tab = activeTab();
  const count = tab ? tab.content.split('\n').length : 1;
  const numbers = [];

  for (let index = 1; index <= count; index += 1) {
    numbers.push(String(index));
  }

  elements.lineNumbers.textContent = numbers.join('\n');
  elements.lineNumbers.scrollTop = elements.editor.scrollTop;
}

/**
 * Met à jour la barre d'état de l'éditeur.
 */
function renderEditorStatus() {
  const tab = activeTab();
  const languageLabels = {
    html: 'HTML',
    css: 'CSS',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    php: 'PHP',
    go: 'Go',
    markdown: 'Markdown',
    json: 'JSON',
    text: 'Texte',
    xml: 'XML',
    yaml: 'YAML',
    toml: 'TOML',
  };

  if (!tab) {
    elements.statusLanguage.textContent = '—';
    elements.statusPosition.textContent = 'Ln 1, Col 1';
    elements.statusSize.textContent = '—';
    elements.statusDirty.hidden = true;
    return;
  }

  elements.statusLanguage.textContent =
    languageLabels[tab.language] || tab.language || 'Texte';
  elements.statusSize.textContent = formatBytes(
    new Blob([tab.content]).size,
  );
  elements.statusDirty.hidden = tab.content === tab.savedContent;
  updateCursorPosition();
}

/**
 * Met à jour la position du curseur.
 */
function updateCursorPosition() {
  if (!activeTab()) {
    return;
  }

  const before = elements.editor.value.slice(
    0,
    elements.editor.selectionStart,
  );
  const lines = before.split('\n');
  elements.statusPosition.textContent = `Ln ${lines.length}, Col ${
    lines[lines.length - 1].length + 1
  }`;
}

/**
 * Affiche l'éditeur et la barre d'état.
 */
function renderEditor() {
  const tab = activeTab();

  elements.save.disabled = !tab;
  elements.run.disabled = !tab;
  elements.preview.disabled = !tab;

  if (!tab) {
    elements.empty.hidden = false;
    elements.editorWrap.hidden = true;
    elements.breadcrumb.textContent = 'Aucun fichier ouvert';
    elements.editor.value = '';
    renderLineNumbers();
    renderEditorStatus();
    return;
  }

  elements.empty.hidden = true;
  elements.editorWrap.hidden = false;
  elements.editor.value = tab.content;
  elements.editor.scrollTop = 0;
  elements.breadcrumb.textContent = tab.path;
  renderLineNumbers();
  renderEditorStatus();
  renderTabs();
}

/**
 * Ouvre un fichier.
 * @param {string} path
 */
async function openFile(path) {
  const existing = findTab(path);

  if (existing) {
    activePath = path;
    selectedPath = path;
    selectedType = 'file';
    renderTabs();
    renderEditor();
    renderTree();
    updateSidebarActions();
    return;
  }

  setStatus(`Ouverture de ${basename(path)}…`);

  try {
    const result = await post('/api/dev/fs', { action: 'read', path });
    const tab = {
      path,
      name: basename(path),
      content: result.content,
      savedContent: result.content,
      language: result.language,
      size: result.size,
    };

    tabs.push(tab);
    activePath = path;
    selectedPath = path;
    selectedType = 'file';
    expandParents(path);
    renderTabs();
    renderEditor();
    renderTree();
    updateSidebarActions();
    setStatus(`${basename(path)} ouvert.`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

/**
 * Ferme un onglet.
 * @param {string} path
 */
function closeTab(path) {
  const tab = findTab(path);

  if (!tab) {
    return;
  }

  if (
    tab.content !== tab.savedContent &&
    !window.confirm(
      `Fermer ${basename(path)} sans enregistrer les modifications ?`,
    )
  ) {
    return;
  }

  const index = tabs.findIndex((entry) => entry.path === path);
  tabs = tabs.filter((entry) => entry.path !== path);

  if (activePath === path) {
    const next = tabs[Math.max(0, index - 1)] || tabs[0] || null;
    activePath = next?.path || null;
    selectedPath = activePath;
    selectedType = activePath ? 'file' : null;
  }

  renderTabs();
  renderEditor();
  renderTree();
  updateSidebarActions();
}

/**
 * Enregistre l'onglet actif.
 * @param {boolean} [silent]
 * @returns {Promise<boolean>}
 */
async function saveActive(silent = false) {
  const tab = activeTab();

  if (!tab) {
    return false;
  }

  if (tab.content === tab.savedContent) {
    if (!silent) {
      setStatus('Aucune modification à enregistrer.');
    }
    return true;
  }

  const snapshot = tab.content;
  elements.save.disabled = true;
  setStatus(`Enregistrement de ${tab.name}…`);

  try {
    const result = await post('/api/dev/fs', {
      action: 'write',
      path: tab.path,
      content: snapshot,
    });

    tab.savedContent = snapshot;
    tab.size = result.size;
    workspaceState.tree = result.tree;

    if (tab.content !== snapshot) {
      setStatus(
        'Fichier enregistré. De nouvelles modifications restent en attente.',
        'success',
      );
    } else if (!silent) {
      setStatus(`${tab.name} enregistré.`, 'success');
    }

    renderTabs();
    renderEditorStatus();
    renderTree();
    return true;
  } catch (error) {
    setStatus(`Enregistrement impossible : ${error.message}`, 'error');
    return false;
  } finally {
    elements.save.disabled = !activeTab();
  }
}

/**
 * Affiche une sortie d'exécution.
 * @param {object} result
 */
function renderRunResult(result) {
  const chunks = [];

  if (result.runtime) {
    chunks.push(
      `[${result.runtime}] ${result.path || ''} — code ${result.code}, ${result.durationMs} ms`,
    );
  }

  if (result.message) {
    chunks.push(result.message);
  }

  if (result.stdout) {
    chunks.push(result.stdout);
  }

  if (result.stderr) {
    chunks.push(result.stderr);
  }

  if (result.timedOut) {
    chunks.push('Processus interrompu après expiration du délai.');
  }

  if (chunks.length === 0) {
    chunks.push('Aucune sortie.');
  }

  elements.runOutput.textContent = stripAnsi(chunks.join('\n')).slice(
    0,
    512 * 1024,
  );
}

/**
 * Exécute l'onglet actif.
 */
async function runActive() {
  const tab = activeTab();

  if (!tab) {
    return;
  }

  if (tab.content !== tab.savedContent) {
    const saved = await saveActive(true);

    if (!saved) {
      return;
    }
  }

  showPanel('output');
  elements.runOutput.textContent = `Exécution de ${tab.path}…`;
  elements.run.disabled = true;
  setStatus(`Exécution de ${tab.name}…`);

  try {
    const result = await post('/api/dev/run', { path: tab.path });
    renderRunResult(result);
    setStatus(
      result.ok
        ? `Exécution terminée en ${result.durationMs} ms.`
        : result.message || 'L’exécution a échoué.',
      result.ok ? 'success' : 'error',
    );
  } catch (error) {
    elements.runOutput.textContent = `Exécution impossible : ${error.message}`;
    setStatus(`Exécution impossible : ${error.message}`, 'error');
  } finally {
    elements.run.disabled = !activeTab();
  }
}

/**
 * Affiche un message dans l'aperçu.
 * @param {string} message
 */
function showPreviewMessage(message) {
  elements.previewEmpty.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = 'Aperçu indisponible';
  const text = document.createElement('p');
  text.textContent = message;
  elements.previewEmpty.append(title, text);
  elements.previewEmpty.hidden = false;
  elements.previewFrame.hidden = true;
  elements.previewFrame.removeAttribute('src');
}

/**
 * Lance l'aperçu de l'onglet actif.
 */
async function previewActive() {
  const tab = activeTab();

  if (!tab) {
    return;
  }

  showPanel('preview');
  elements.preview.disabled = true;
  setStatus(`Préparation de l’aperçu de ${tab.name}…`);

  try {
    const result = await post('/api/dev/preview', {
      path: tab.path,
      content: tab.content,
    });

    previewUrl = result.url;
    elements.previewFrame.src = previewUrl;
    elements.previewFrame.hidden = false;
    elements.previewEmpty.hidden = true;
    elements.runOutput.textContent = `Aperçu de ${tab.path}\n${previewUrl}`;
    setStatus('Aperçu chargé dans le panneau inférieur.', 'success');
  } catch (error) {
    showPreviewMessage(error.message);
    setStatus(`Aperçu impossible : ${error.message}`, 'error');
  } finally {
    elements.preview.disabled = !activeTab();
  }
}

/**
 * Affiche un panneau inférieur.
 * @param {'terminal' | 'output' | 'preview'} name
 */
function showPanel(name) {
  for (const button of elements.panelTabs) {
    button.setAttribute(
      'aria-selected',
      String(button.dataset.panel === name),
    );
  }

  elements.panelTerminal.hidden = name !== 'terminal';
  elements.panelOutput.hidden = name !== 'output';
  elements.panelPreview.hidden = name !== 'preview';
}

/**
 * Ajoute du texte au terminal.
 * @param {string} text
 */
function appendTerminal(text) {
  const current = elements.terminalOutput.textContent;
  const next = `${current}${text}`;
  elements.terminalOutput.textContent = next.slice(-150_000);
  elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight;
}

/**
 * Exécute une commande de terminal.
 */
async function runTerminal() {
  const command = elements.terminalInput.value.trim();

  if (!command) {
    return;
  }

  terminalHistory.push(command);
  terminalHistoryIndex = terminalHistory.length;
  elements.terminalInput.value = '';
  appendTerminal(`$ ${command}\n`);
  elements.terminalInput.disabled = true;
  elements.terminalRun.disabled = true;

  try {
    const cwd =
      selectedType === 'directory' && selectedPath ? selectedPath : '';
    const result = await post('/api/dev/terminal', { command, cwd });

    if (result.stdout) {
      appendTerminal(`${stripAnsi(result.stdout)}\n`);
    }

    if (result.stderr) {
      appendTerminal(`${stripAnsi(result.stderr)}\n`);
    }

    if (result.message) {
      appendTerminal(`${result.message}\n`);
    }

    if (!result.stdout && !result.stderr && !result.message) {
      appendTerminal('(aucune sortie)\n');
    }

    if (result.durationMs > 0) {
      appendTerminal(
        `[${result.code} · ${result.durationMs} ms${
          result.timedOut ? ' · interrompu' : ''
        }]\n`,
      );
    }

    setStatus(
      result.ok ? 'Commande terminée.' : 'La commande a signalé une erreur.',
      result.ok ? 'success' : 'error',
    );
  } catch (error) {
    appendTerminal(`Erreur : ${error.message}\n`);
    setStatus(error.message, 'error');
  } finally {
    elements.terminalInput.disabled = false;
    elements.terminalRun.disabled = false;
    elements.terminalInput.focus();
  }
}

/**
 * Demande une valeur à l'utilisateur.
 * @param {{title: string, label: string, value?: string, placeholder?: string}} options
 * @returns {Promise<string | null>}
 */
function ask(options) {
  return new Promise((resolve) => {
    promptResolver = resolve;
    elements.promptTitle.textContent = options.title;
    elements.promptLabel.textContent = options.label;
    elements.promptInput.value = options.value || '';
    elements.promptInput.placeholder = options.placeholder || '';
    elements.promptError.textContent = '';
    elements.promptDialog.showModal();
    elements.promptInput.focus();
    elements.promptInput.select();
  });
}

/**
 * Termine la demande en cours.
 * @param {string | null} value
 */
function finishPrompt(value) {
  const resolver = promptResolver;
  promptResolver = null;

  if (elements.promptDialog.open) {
    elements.promptDialog.close();
  }

  if (resolver) {
    resolver(value);
  }
}

/**
 * Valide la demande en cours.
 */
function submitPrompt() {
  const value = elements.promptInput.value.trim();

  if (!value) {
    elements.promptError.textContent = 'Le nom ne peut pas être vide.';
    return;
  }

  if (value.split('/').includes('..') || value.startsWith('/')) {
    elements.promptError.textContent =
      'Le chemin doit rester relatif à l’espace de travail.';
    return;
  }

  finishPrompt(value);
}

/**
 * Retourne le dossier cible pour une création.
 * @returns {string}
 */
function currentParent() {
  if (selectedType === 'directory' && selectedPath) {
    return selectedPath;
  }

  if (selectedPath) {
    return dirname(selectedPath);
  }

  return activePath ? dirname(activePath) : '';
}

/**
 * Crée un fichier.
 */
async function createFile() {
  const name = await ask({
    title: 'Nouveau fichier',
    label: `Dossier : ${currentParent() || 'racine'}`,
    value: 'sans-titre.js',
    placeholder: 'ex: src/app.js',
  });

  if (!name) {
    return;
  }

  const path = joinPath(currentParent(), name);
  setStatus(`Création de ${path}…`);

  try {
    const result = await post('/api/dev/fs', {
      action: 'create',
      path,
      type: 'file',
    });
    workspaceState.tree = result.tree;
    expandParents(path);
    selectedPath = path;
    selectedType = 'file';
    renderTree();
    updateSidebarActions();
    await openFile(path);
    setStatus(`${path} créé.`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

/**
 * Crée un dossier.
 */
async function createFolder() {
  const name = await ask({
    title: 'Nouveau dossier',
    label: `Dossier : ${currentParent() || 'racine'}`,
    value: 'nouveau-dossier',
    placeholder: 'ex: src/components',
  });

  if (!name) {
    return;
  }

  const path = joinPath(currentParent(), name);
  setStatus(`Création de ${path}…`);

  try {
    const result = await post('/api/dev/fs', {
      action: 'create',
      path,
      type: 'directory',
    });
    workspaceState.tree = result.tree;
    expandParents(path);
    expanded.add(path);
    selectedPath = path;
    selectedType = 'directory';
    renderTree();
    updateSidebarActions();
    setStatus(`${path} créé.`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

/**
 * Renomme l'entrée sélectionnée.
 */
async function renameEntry() {
  if (!selectedPath) {
    return;
  }

  const target = selectedPath;
  const newPath = await ask({
    title: 'Renommer ou déplacer',
    label: 'Chemin relatif dans l’espace de travail',
    value: target,
    placeholder: 'ex: src/app.js',
  });

  if (!newPath || newPath === target) {
    return;
  }

  setStatus(`Renommage de ${target}…`);

  try {
    const result = await post('/api/dev/fs', {
      action: 'rename',
      path: target,
      newPath,
    });
    workspaceState.tree = result.tree;

    for (const tab of tabs) {
      if (tab.path === target) {
        tab.path = newPath;
        tab.name = basename(newPath);
      } else if (tab.path.startsWith(`${target}/`)) {
        tab.path = `${newPath}${tab.path.slice(target.length)}`;
        tab.name = basename(tab.path);
      }
    }

    if (activePath === target) {
      activePath = newPath;
    } else if (activePath?.startsWith(`${target}/`)) {
      activePath = `${newPath}${activePath.slice(target.length)}`;
    }

    selectedPath = newPath;
    selectedType = findNode(workspaceState.tree, newPath)?.type || 'file';
    expandParents(newPath);
    renderTabs();
    renderEditor();
    renderTree();
    updateSidebarActions();
    setStatus(`${target} renommé en ${newPath}.`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

/**
 * Supprime l'entrée sélectionnée.
 */
async function deleteEntry() {
  if (!selectedPath) {
    return;
  }

  const target = selectedPath;

  if (
    !window.confirm(
      `Supprimer définitivement ${target} ? Cette action est irréversible.`,
    )
  ) {
    return;
  }

  setStatus(`Suppression de ${target}…`);

  try {
    const result = await post('/api/dev/fs', {
      action: 'delete',
      path: target,
    });
    workspaceState.tree = result.tree;

    tabs = tabs.filter((tab) => {
      const remove =
        tab.path === target || tab.path.startsWith(`${target}/`);
      return !remove;
    });

    if (
      activePath === target ||
      activePath?.startsWith(`${target}/`) ||
      !findTab(activePath)
    ) {
      activePath = tabs[0]?.path || null;
    }

    selectedPath = null;
    selectedType = null;
    renderTabs();
    renderEditor();
    renderTree();
    updateSidebarActions();
    setStatus(`${target} supprimé.`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

/**
 * Recharge l'arborescence et les interpréteurs.
 */
async function refreshState() {
  setStatus('Actualisation…');
  elements.refresh.disabled = true;

  try {
    workspaceState = await request('/api/dev/state');
    renderWorkspace();
    renderTree();
    renderRuntimes();
    setStatus('Espace de travail actualisé.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    elements.refresh.disabled = false;
  }
}

/**
 * Redétecte les interpréteurs.
 */
async function refreshRuntimes() {
  elements.refreshRuntimes.disabled = true;

  try {
    const result = await post('/api/dev/runtimes', {});
    workspaceState.runtimes = result.runtimes;
    renderRuntimes();
    setStatus('Interpréteurs redétectés.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    elements.refreshRuntimes.disabled = false;
  }
}

/**
 * Change d'espace de travail.
 */
async function chooseWorkspace() {
  elements.chooseWorkspace.disabled = true;
  setStatus('Sélection du dossier…');

  try {
    const result = await post('/api/dev/workspace', { action: 'choose' });

    if (result.canceled) {
      setStatus('Sélection annulée.');
      return;
    }

    workspaceState = result.state;
    tabs = [];
    activePath = null;
    selectedPath = null;
    selectedType = null;
    expanded.clear();
    previewUrl = '';
    elements.previewFrame.removeAttribute('src');
    elements.previewFrame.hidden = true;
    elements.previewEmpty.hidden = false;
    renderWorkspace();
    renderTree();
    renderRuntimes();
    renderTabs();
    renderEditor();
    updateSidebarActions();
    setStatus(`Espace de travail : ${workspaceState.workspace.path}`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    elements.chooseWorkspace.disabled = false;
  }
}

/**
 * Installe les interactions.
 */
function bindEvents() {
  elements.chooseWorkspace.addEventListener('click', () =>
    void chooseWorkspace(),
  );
  elements.refresh.addEventListener('click', () => void refreshState());
  elements.refreshRuntimes.addEventListener('click', () =>
    void refreshRuntimes(),
  );
  elements.newFile.addEventListener('click', () => void createFile());
  elements.emptyNew.addEventListener('click', () => void createFile());
  elements.newFolder.addEventListener('click', () => void createFolder());
  elements.emptyFolder.addEventListener('click', () => void createFolder());
  elements.renameEntry.addEventListener('click', () => void renameEntry());
  elements.deleteEntry.addEventListener('click', () => void deleteEntry());
  elements.save.addEventListener('click', () => void saveActive());
  elements.run.addEventListener('click', () => void runActive());
  elements.preview.addEventListener('click', () => void previewActive());

  elements.editor.addEventListener('input', () => {
    const tab = activeTab();

    if (!tab) {
      return;
    }

    tab.content = elements.editor.value;
    renderTabs();
    renderLineNumbers();
    renderEditorStatus();
  });

  elements.editor.addEventListener('scroll', () => {
    elements.lineNumbers.scrollTop = elements.editor.scrollTop;
  });

  elements.editor.addEventListener('keyup', updateCursorPosition);
  elements.editor.addEventListener('click', updateCursorPosition);

  elements.editor.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const start = elements.editor.selectionStart;
      const end = elements.editor.selectionEnd;
      elements.editor.setRangeText('  ', start, end, 'end');
      elements.editor.dispatchEvent(new Event('input'));
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void saveActive();
      return;
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === 'Enter'
    ) {
      event.preventDefault();
      void runActive();
    }
  });

  for (const button of elements.panelTabs) {
    button.addEventListener('click', () => {
      showPanel(button.dataset.panel);
    });
  }

  elements.clearTerminal.addEventListener('click', () => {
    elements.terminalOutput.textContent = '';
  });

  elements.terminalRun.addEventListener('click', () => void runTerminal());

  elements.terminalInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void runTerminal();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();

      if (terminalHistory.length === 0) {
        return;
      }

      terminalHistoryIndex = Math.max(
        0,
        Math.min(terminalHistoryIndex, terminalHistory.length) - 1,
      );
      elements.terminalInput.value =
        terminalHistory[terminalHistoryIndex] || '';
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();

      if (terminalHistory.length === 0) {
        return;
      }

      terminalHistoryIndex = Math.min(
        terminalHistory.length,
        terminalHistoryIndex + 1,
      );
      elements.terminalInput.value =
        terminalHistory[terminalHistoryIndex] || '';
    }
  });

  elements.promptOk.addEventListener('click', submitPrompt);
  elements.promptCancel.addEventListener('click', () =>
    finishPrompt(null),
  );
  elements.promptInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitPrompt();
    }
  });
  elements.promptDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    finishPrompt(null);
  });
  elements.promptDialog.addEventListener('close', () => {
    if (promptResolver) {
      finishPrompt(null);
    }
  });

  window.addEventListener('message', (event) => {
    if (
      event.source !== elements.previewFrame.contentWindow ||
      (event.origin !== 'null' && event.origin !== 'think-page://dev') ||
      !event.data ||
      event.data.source !== 'think-dev-preview'
    ) {
      return;
    }

    const payload = event.data.payload || {};
    const level = payload.level || 'log';
    const text = String(payload.text || '').slice(0, 20_000);
    const current = elements.runOutput.textContent;
    elements.runOutput.textContent = `${current}\n[${level}] ${text}`.slice(
      -150_000,
    );
  });

  window.addEventListener('beforeunload', (event) => {
    if (tabs.some((tab) => tab.content !== tab.savedContent)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

/**
 * Charge l'atelier au démarrage.
 */
async function initialize() {
  bindEvents();
  showPanel('terminal');
  setStatus('Chargement de l’espace de travail…');

  try {
    workspaceState = await request('/api/dev/state');
    renderWorkspace();
    renderTree();
    renderRuntimes();
    renderTabs();
    renderEditor();
    updateSidebarActions();

    const readme = findNode(workspaceState.tree, 'README.md');

    if (readme) {
      await openFile('README.md');
    }

    setStatus('Espace de travail prêt.', 'success');
  } catch (error) {
    setStatus(`Chargement impossible : ${error.message}`, 'error');
    elements.workspaceState.textContent = 'Erreur';
    elements.workspaceState.className = 'pill pill--danger';
  }
}

void initialize();
