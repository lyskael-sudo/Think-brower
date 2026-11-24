'use strict';

/**
 * Think-Browser — vérification statique légère.
 *
 * Vérifie la syntaxe de tous les modules JavaScript, l'équilibre des blocs
 * CSS et la présence des fichiers requis. Ce script ne remplace pas les tests
 * d'intégration, mais il attrape les erreurs les plus fréquentes avant le
 * lancement d'Electron.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

const REQUIRED_FILES = [
  'package.json',
  'README.md',
  'SECURITY-AUDIT.md',
  'scripts/afterPack.js',
  'src/main/index.js',
  'src/main/adblocker.js',
  'src/main/appIcon.js',
  'src/main/browsingData.js',
  'src/main/contextMenu.js',
  'src/main/devWorkspace.js',
  'src/main/downloadManager.js',
  'src/main/downloadStore.js',
  'src/main/extensionManager.js',
  'src/main/favoritesIO.js',
  'src/main/guestController.js',
  'src/main/homeProtocol.js',
  'src/main/ipcHandlers.js',
  'src/main/libraryStore.js',
  'src/main/mediaDetector.js',
  'src/main/mediaLibrary.js',
  'src/main/mediaProtocol.js',
  'src/main/networkMonitor.js',
  'src/main/pageProtocol.js',
  'src/main/permissions.js',
  'src/main/security.js',
  'src/main/securityPosture.js',
  'src/main/shortcuts.js',
  'src/main/siteExtractor.js',
  'src/main/store.js',
  'src/main/userAgent.js',
  'src/main/videoDownloader.js',
  'src/main/videoTools.js',
  'src/main/windowManager.js',
  'src/preload/rendererPreload.js',
  'src/renderer/index.html',
  'src/renderer/js/api.js',
  'src/renderer/js/bootstrap.js',
  'src/renderer/js/bootstrap.bundle.js',
  'src/renderer/js/eventEmitter.js',
  'src/renderer/js/i18n.js',
  'src/renderer/js/mediaSniffer.js',
  'src/renderer/js/partials.js',
  'src/renderer/js/theme.js',
  'src/renderer/js/ui/downloads.js',
  'src/renderer/js/ui/extensions.js',
  'src/renderer/js/ui/mediaOptions.js',
  'src/renderer/partials/dialogs/media-options.html',
  'src/renderer/partials/dialogs/extensions.html',
  'src/renderer/partials/tabbar.html',
  'src/renderer/partials/toolbar.html',
  'src/renderer/partials/browser.html',
  'src/renderer/partials/dialogs/favorites.html',
  'src/renderer/partials/dialogs/history.html',
  'src/renderer/partials/dialogs/downloads.html',
  'src/renderer/partials/dialogs/link-download.html',
  'src/renderer/partials/dialogs/library.html',
  'src/renderer/partials/dialogs/settings.html',
  'src/renderer/partials/dialogs/about.html',
  'src/renderer/partials/dialogs/confirm.html',
  'src/renderer/home/index.html',
  'src/renderer/home/home.css',
  'src/renderer/home/home.js',
  'src/renderer/home/logo.svg',
  'src/renderer/home/favicon.svg',
  'src/renderer/pages/config.html',
  'src/renderer/pages/config.js',
  'src/renderer/pages/dev.css',
  'src/renderer/pages/dev.html',
  'src/renderer/pages/dev.js',
  'src/renderer/pages/pages.css',
  'src/renderer/pages/security.html',
  'src/renderer/pages/security.js',
  'src/renderer/styles/main.css',
  'src/renderer/styles/tabs.css',
  'src/renderer/styles/navbar.css',
  'src/renderer/styles/menu.css',
  'src/renderer/styles/library.css',
  'src/renderer/styles/extensions.css',
  'src/renderer/styles/themes.css',
  'src/renderer/js/ui/library.js',
  'src/renderer/js/ui/player.js',
  'src/shared/constants.js',
  'src/shared/extensions.js',
  'src/shared/securityNotices.js',
  'src/shared/utils.js',
  'tests/adblocker.test.js',
  'tests/devWorkspace.test.js',
  'tests/downloadManager.test.js',
  'tests/extensions.test.js',
  'tests/guestController.test.js',
  'tests/library.test.js',
  'tests/mediaDetector.test.js',
  'tests/pageProtocol.test.js',
  'tests/permissions.test.js',
  'tests/rendererEventEmitter.test.js',
  'tests/security.test.js',
  'tests/siteExtractor.test.js',
  'tests/utils.test.js',
  'tests/videoTools.test.js',
  'scripts/buildRenderer.js',
  'scripts/integrationSmoke.js',
  'scripts/securityAudit.js',
  'assets/icons/app.png',
  'assets/icons/app.svg',
  'build/icon.png',
  'build/icon.ico',
  'assets/icons/favicon.svg',
];

/**
 * Parcourt récursivement un dossier.
 * @param {string} directory
 * @param {string[]} output
 * @returns {string[]}
 */
function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walk(absolutePath, output);
    } else {
      output.push(absolutePath);
    }
  }

  return output;
}

/**
 * Vérifie qu'un fichier existe.
 * @param {string} relativePath
 */
function requireFile(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Fichier requis manquant : ${relativePath}`);
  }
}

/**
 * Vérifie la syntaxe d'un module avec `node --check`.
 * @param {string} filePath
 */
function checkJavaScript(filePath) {
  try {
    execFileSync(process.execPath, ['--check', filePath], {
      stdio: 'pipe',
    });
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    throw new Error(
      `Syntaxe invalide dans ${path.relative(ROOT, filePath)}` +
        (stderr ? `\n${stderr}` : ''),
    );
  }
}

/**
 * Vérifie que les commentaires CSS sont correctement fermés et non imbriqués.
 * Un commentaire non fermé avale silencieusement les règles suivantes.
 * @param {string} source
 * @param {string} filePath
 */
function checkCssComments(source, filePath) {
  let index = 0;

  while (index < source.length) {
    const start = source.indexOf('/*', index);

    if (start === -1) {
      return;
    }

    const end = source.indexOf('*/', start + 2);
    const nested = source.indexOf('/*', start + 2);

    if (end === -1) {
      throw new Error(
        `Commentaire CSS non fermé dans ${path.relative(ROOT, filePath)}.`,
      );
    }

    if (nested !== -1 && nested < end) {
      throw new Error(
        `Commentaire CSS imbriqué dans ${path.relative(
          ROOT,
          filePath,
        )} : chaque bloc doit être fermé avant le suivant.`,
      );
    }

    index = end + 2;
  }
}

/**
 * Vérifie l'équilibre des accolades et parenthèses d'un fichier CSS, en
 * ignorant les commentaires et les chaînes de caractères.
 * @param {string} filePath
 */
function checkCss(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');

  checkCssComments(original, filePath);

  const source = original
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");

  let braces = 0;
  let parentheses = 0;

  for (const character of source) {
    if (character === '{') {
      braces += 1;
    } else if (character === '}') {
      braces -= 1;
    } else if (character === '(') {
      parentheses += 1;
    } else if (character === ')') {
      parentheses -= 1;
    }

    if (braces < 0 || parentheses < 0) {
      break;
    }
  }

  if (braces !== 0 || parentheses !== 0) {
    throw new Error(
      `Structure CSS invalide dans ${path.relative(
        ROOT,
        filePath,
      )} (accolades : ${braces}, parenthèses : ${parentheses}).`,
    );
  }
}

/**
 * Vérifie le durcissement du renderer et du pont preload.
 */
function checkRendererSecurity() {
  const windowManager = fs.readFileSync(
    path.join(ROOT, 'src/main/windowManager.js'),
    'utf8',
  );
  const preload = fs.readFileSync(
    path.join(ROOT, 'src/preload/rendererPreload.js'),
    'utf8',
  );
  const indexHtml = fs.readFileSync(
    path.join(ROOT, 'src/renderer/index.html'),
    'utf8',
  );
  const bundlePath = path.join(
    ROOT,
    'src/renderer/js/bootstrap.bundle.js',
  );

  if (!/nodeIntegration:\s*false/.test(windowManager)) {
    throw new Error('nodeIntegration doit être désactivé dans la fenêtre hôte.');
  }

  if (!/contextIsolation:\s*true/.test(windowManager)) {
    throw new Error('contextIsolation doit être activé dans la fenêtre hôte.');
  }

  if (!/preload:\s*path\.join/.test(windowManager)) {
    throw new Error('Le preload sécurisé doit être déclaré.');
  }

  if (/nodeIntegration:\s*true|contextIsolation:\s*false/.test(windowManager)) {
    throw new Error('Configuration renderer non sécurisée détectée.');
  }

  if (!/contextBridge\.exposeInMainWorld\('thinkBridge'/.test(preload)) {
    throw new Error('Le preload doit exposer uniquement le pont thinkBridge.');
  }

  if (!/ACTION_CHANNELS/.test(preload) || !/EVENT_CHANNELS/.test(preload)) {
    throw new Error('Les listes d’autorisation IPC du preload sont absentes.');
  }

  if (!/readPartial/.test(preload)) {
    throw new Error('Le preload doit exposer la lecture des fragments.');
  }

  if (!/js\/bootstrap\.bundle\.js/.test(indexHtml)) {
    throw new Error('L’interface doit charger le bundle du renderer.');
  }

  if (!fs.existsSync(bundlePath)) {
    throw new Error('Le bundle du renderer est absent : exécutez npm run build:renderer.');
  }

  const rendererDirectory = path.join(ROOT, 'src/renderer/js');
  const forbidden = [
    /require\(['"]electron['"]\)/,
    /require\(['"]node:/,
    /require\(['"]fs['"]\)/,
    /require\(['"]path['"]\)/,
  ];

  for (const file of walk(rendererDirectory)) {
    if (!file.endsWith('.js')) {
      continue;
    }

    const source = fs.readFileSync(file, 'utf8');

    for (const pattern of forbidden) {
      if (pattern.test(source)) {
        throw new Error(
          `Module Node.js/Electron interdit dans ${path.relative(
            ROOT,
            file,
          )}.`,
        );
      }
    }
  }
}

/**
 * Vérifie que les commandes de test sont déclarées.
 */
function checkTestScripts() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  );

  if (!packageJson.scripts?.test) {
    throw new Error('Le script npm test est requis.');
  }

  if (!packageJson.scripts?.['test:integration']) {
    throw new Error('Le script npm run test:integration est requis.');
  }

  const tests = fs
    .readdirSync(path.join(ROOT, 'tests'))
    .filter((entry) => entry.endsWith('.test.js'));

  if (tests.length < 4) {
    throw new Error('Les tests unitaires et de sécurité sont incomplets.');
  }
}

/**
 * Vérifie que la configuration de distribution Windows/Linux est complète.
 */
function checkPackaging() {
  const packagePath = path.join(ROOT, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const build = packageJson.build;

  if (!build || typeof build !== 'object') {
    throw new Error('Configuration « build » absente de package.json.');
  }

  if (!build.appId || !build.productName) {
    throw new Error('appId ou productName manquant dans la configuration build.');
  }

  if (!build.directories || build.directories.output !== 'dist') {
    throw new Error('Le dossier de sortie de distribution doit être « dist ».');
  }

  if (!build.afterPack) {
    throw new Error('Le hook afterPack de réduction des binaires est requis.');
  }

  const targetNames = (targets) =>
    (Array.isArray(targets) ? targets : []).map((target) =>
      typeof target === 'string' ? target : target?.target,
    );

  const linuxTargets = targetNames(build.linux?.target);
  const winTargets = targetNames(build.win?.target);

  if (!linuxTargets.includes('AppImage') || !linuxTargets.includes('deb')) {
    throw new Error('Les cibles Linux AppImage et deb sont requises.');
  }

  if (!winTargets.includes('nsis') || !winTargets.includes('portable')) {
    throw new Error('Les cibles Windows nsis et portable sont requises.');
  }

  if (build.linux?.icon !== 'build/icon.png') {
    throw new Error('L’icône Linux de distribution doit être build/icon.png.');
  }

  if (build.win?.icon !== 'build/icon.ico') {
    throw new Error('L’icône Windows de distribution doit être build/icon.ico.');
  }

  for (const icon of [
    'assets/icons/app.png',
    'build/icon.png',
    'build/icon.ico',
  ]) {
    if (!fs.existsSync(path.join(ROOT, icon))) {
      throw new Error(`Icône de distribution manquante : ${icon}.`);
    }
  }

  const unpacked = Array.isArray(build.asarUnpack) ? build.asarUnpack : [];

  if (!unpacked.some((entry) => entry.includes('@ffmpeg-installer'))) {
    throw new Error('@ffmpeg-installer doit être extrait de l’archive asar.');
  }

  if (!unpacked.some((entry) => entry.includes('ffprobe-static'))) {
    throw new Error('ffprobe-static doit être extrait de l’archive asar.');
  }

  if (!packageJson.scripts?.['dist:linux'] || !packageJson.scripts?.['dist:win']) {
    throw new Error('Les scripts dist:linux et dist:win sont requis.');
  }
}

/**
 * Exécute toutes les vérifications.
 */
function main() {
  for (const relativePath of REQUIRED_FILES) {
    requireFile(relativePath);
  }

  const files = walk(path.join(ROOT, 'src')).concat(
    walk(path.join(ROOT, 'scripts')),
    walk(path.join(ROOT, 'tests')),
  );

  const javascriptFiles = files.filter((file) => file.endsWith('.js'));
  const cssFiles = files.filter((file) => file.endsWith('.css'));

  for (const file of javascriptFiles) {
    checkJavaScript(file);
  }

  for (const file of cssFiles) {
    checkCss(file);
  }

  checkRendererSecurity();
  checkTestScripts();
  checkPackaging();

  console.log(
    `Vérification réussie : ${javascriptFiles.length} module(s) JS, ` +
      `${cssFiles.length} feuille(s) CSS, renderer isolé, tests présents, ` +
      'distribution Windows/Linux configurée.',
  );
}

try {
  main();
} catch (error) {
  console.error(`Échec de la vérification : ${error.message}`);
  process.exitCode = 1;
}
