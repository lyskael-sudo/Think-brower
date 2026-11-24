'use strict';

/**
 * Think-Browser — audit de sécurité reproductible.
 *
 * Ce script combine :
 * 1. des contrôles statiques sur les frontières de sécurité (renderer, preload,
 *    webviews, protocoles internes, atelier et téléchargements) ;
 * 2. les tests d'intrusion unitaires qui exécutent réellement les routes et les
 *    opérations fichiers avec des charges hostiles ;
 * 3. un rappel des vérifications Electron qui nécessitent un affichage.
 *
 * Il ne remplace ni `npm audit` (dépendances) ni l'analyse d'une version
 * Electron précise : il vérifie les décisions de sécurité du code applicatif.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const failures = [];
const warnings = [];
const passes = [];

/**
 * Lit un fichier du projet.
 * @param {string} relative
 * @returns {string}
 */
function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/**
 * Enregistre un contrôle.
 * @param {string} id
 * @param {string} label
 * @param {() => void} run
 */
function check(id, label, run) {
  try {
    run();
    passes.push({ id, label });
  } catch (error) {
    failures.push({ id, label, message: error.message });
  }
}

/**
 * Enregistre un avertissement non bloquant.
 * @param {string} id
 * @param {string} label
 * @param {string} message
 */
function warn(id, label, message) {
  warnings.push({ id, label, message });
}

/**
 * Vérifie qu'une expression est présente.
 * @param {string} source
 * @param {RegExp} pattern
 * @param {string} message
 */
function expect(source, pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

/**
 * Vérifie qu'une expression est absente.
 * @param {string} source
 * @param {RegExp} pattern
 * @param {string} message
 */
function reject(source, pattern, message) {
  if (pattern.test(source)) {
    throw new Error(message);
  }
}

check('HOST-01', 'Renderer hôte : Node désactivé, isolation et preload', () => {
  const source = read('src/main/windowManager.js');
  expect(source, /nodeIntegration:\s*false/, 'nodeIntegration doit être false');
  expect(
    source,
    /contextIsolation:\s*true/,
    'contextIsolation doit être true',
  );
  expect(source, /preload:\s*path\.join/, 'Le preload dédié est absent');
  reject(
    source,
    /nodeIntegration:\s*true|contextIsolation:\s*false|webSecurity:\s*false/,
    'Configuration renderer dangereuse détectée',
  );
});

check('HOST-02', 'Preload : listes d’autorisation fermées', () => {
  const source = read('src/preload/rendererPreload.js');
  expect(
    source,
    /contextBridge\.exposeInMainWorld\('thinkBridge'/,
    'Le pont thinkBridge est absent',
  );
  expect(source, /ACTION_CHANNELS/, 'La liste ACTION_CHANNELS est absente');
  expect(source, /EVENT_CHANNELS/, 'La liste EVENT_CHANNELS est absente');
  expect(source, /SEND_CHANNELS/, 'La liste SEND_CHANNELS est absente');
  expect(source, /readPartial/, 'La lecture des fragments est absente');
  reject(
    source,
    /exposeInMainWorld\('electron'|exposeInMainWorld\('ipcRenderer'/,
    'Le preload expose un objet Electron brut',
  );
});

check('HOST-03', 'Renderer : aucun module Node/Electron', () => {
  const directory = path.join(ROOT, 'src/renderer/js');
  const files = fs
    .readdirSync(directory, { recursive: true })
    .filter((entry) => entry.endsWith('.js'));

  for (const entry of files) {
    const source = fs.readFileSync(path.join(directory, entry), 'utf8');
    reject(
      source,
      /require\(['"]electron['"]\)|require\(['"]node:|require\(['"]fs['"]\)|require\(['"]path['"]\)/,
      `Module Node/Electron interdit dans ${entry}`,
    );
    reject(
      source,
      /(^|[^\w.])eval\s*\(|new\s+Function\s*\(/,
      `eval/Function interdit dans ${entry}`,
    );
  }
});

check('GUEST-01', 'Webviews : sandbox explicite et navigation contrôlée', () => {
  const security = read('src/main/security.js');
  const guest = read('src/main/guestController.js');

  expect(security, /webPreferences\.sandbox\s*=\s*true/, 'sandbox absente');
  expect(security, /delete webPreferences\.preload/, 'preload non supprimé');
  expect(
    security,
    /webPreferences\.nodeIntegration\s*=\s*false/,
    'nodeIntegration invité actif',
  );
  expect(
    security,
    /webPreferences\.contextIsolation\s*=\s*true/,
    'contextIsolation invité absent',
  );
  expect(guest, /function isAllowedPopupUrl/, 'validation popup absente');
  expect(
    guest,
    /isSafeHttpUrl\(value\)/,
    'popup HTTP(S) sans identifiants non contrôlée',
  );
  reject(
    guest,
    /shell\.openExternal/,
    'Ouverture externe non validée détectée',
  );
});

check('GUEST-02', 'Navigation et menus contextuels sans identifiants intégrés', () => {
  const utils = read('src/shared/utils.js');
  const guest = read('src/main/guestController.js');
  const contextMenu = read('src/main/contextMenu.js');

  expect(utils, /function hasUrlCredentials/, 'Contrôle des identifiants absent');
  expect(utils, /function isSafeHttpUrl/, 'Validation HTTP(S) sûre absente');
  expect(
    utils,
    /isSafeHttpUrl\(value\) \|\|/,
    'isTabUrl ne filtre pas les identifiants',
  );
  expect(
    guest,
    /isSafeHttpUrl\(url\)/,
    'Les nouveaux onglets acceptent encore des identifiants',
  );
  expect(
    contextMenu,
    /isSafeHttpUrl\(params\.linkURL\)/,
    'Le menu contextuel accepte un lien avec identifiants',
  );
  expect(
    contextMenu,
    /isSafeHttpUrl\(params\.srcURL\)/,
    'Le menu contextuel accepte un média avec identifiants',
  );
});

check('HOST-05', 'Fenêtre hôte : navigation confinée au document local', () => {
  const source = read('src/main/windowManager.js');

  expect(source, /function isHostInterfaceUrl/, 'Validation d’URL hôte absente');
  expect(
    source,
    /'will-navigate', guardHostNavigation/,
    'Garde de navigation hôte absente',
  );
  expect(
    source,
    /'will-redirect', guardHostNavigation/,
    'Garde de redirection hôte absente',
  );
  expect(source, /fileURLToPath\(parsed\)/, 'Comparaison du fichier local absente');
  reject(
    source,
    /will-navigate['"],\s*\([^)]*\)\s*=>\s*\{\s*\}/,
    'Garde de navigation vide détectée',
  );
});

check('TLS-01', 'Aucune exception de certificat', () => {
  const source = read('src/main/index.js');
  expect(source, /'certificate-error'/, 'Gestionnaire certificate-error absent');
  expect(source, /event\.preventDefault\(\)/, 'preventDefault absent');
  expect(source, /callback\(false\)/, 'Le certificat n’est pas refusé');
  reject(source, /callback\(true\)/, 'Un contournement TLS est présent');
});

check('PAGE-01', 'Pages internes : CSP et origine API contrôlées', () => {
  const source = read('src/main/pageProtocol.js');
  expect(source, /"default-src 'none'"/, 'default-src manquant');
  expect(source, /"script-src 'self'"/, 'script-src manquant');
  expect(source, /"frame-ancestors 'none'"/, 'frame-ancestors manquant');
  expect(source, /function isAllowedApiOrigin/, 'Contrôle d’origine absent');
  expect(source, /Origine refusée/, 'Refus d’origine absent');
  reject(source, /unsafe-eval/, 'unsafe-eval présent');
});

check('PAGE-02', 'Pages internes : mutations same-origin et cookies confinés', () => {
  const source = read('src/main/pageProtocol.js');

  expect(
    source,
    /API_REQUEST_HEADER = 'x-think-request'/,
    'En-tête de requête interne absent',
  );
  expect(
    source,
    /request\.headers\.get\(API_REQUEST_HEADER\) === '1'/,
    'Les mutations sans preuve interne ne sont pas refusées',
  );
  expect(
    source,
    /application\\\/json/,
    'Le corps JSON n’est pas exigé pour les mutations',
  );
  expect(
    source,
    /if \(!origin \|\| origin === 'null'\)/,
    'L’origine opaque du schéma interne n’est pas traitée',
  );
  expect(
    source,
    /!parsed\.username &&\s*!parsed\.password &&\s*!parsed\.port/,
    'Origine interne avec identifiants ou port acceptée',
  );
  expect(source, /function buildCookieUrl/, 'Construction d’URL de cookie absente');
  expect(source, /isIpv4/, 'Validation du domaine de cookie absente');
  expect(
    source,
    /u0000-\\u001f/,
    'Validation du chemin de cookie absente',
  );
});

check('DEV-01', 'Atelier : chemin choisi et confinement des fichiers', () => {
  const source = read('src/main/devWorkspace.js');
  expect(
    source,
    /body\.action !== 'choose'/,
    'Le chemin arbitraire est encore accepté',
  );
  expect(source, /function isInside/, 'Confinement isInside absent');
  expect(source, /entry\.isSymbolicLink\(\)/, 'Refus des symlinks absent');
  expect(source, /normalized\.split\('\/'\)\.includes\('\.\.'\)/, 'Refus .. absent');
  expect(source, /allowRoot: false/, 'Protection de la racine absente');
  reject(source, /setWorkspace\(body\.path\)/, 'Chemin fourni par la page accepté');
});

check('DEV-02', 'Atelier : pas de shell et limites de ressources', () => {
  const source = read('src/main/devWorkspace.js');
  expect(source, /execFile/, 'execFile absent');
  expect(source, /TERMINAL_COMMANDS/, 'Liste de commandes absente');
  expect(source, /\[;&\|<>`\]/, 'Filtre des opérateurs shell absent');
  expect(source, /MAX_FILE_BYTES/, 'Limite de fichier absente');
  expect(source, /MAX_OUTPUT_BYTES/, 'Limite de sortie absente');
  reject(source, /\bexec\s*\(/, 'exec avec shell détecté');
});

check('DEV-03', 'Atelier : aperçus et fichiers sandboxés', () => {
  const source = read('src/main/devWorkspace.js');
  expect(
    source,
    /sandbox allow-scripts allow-forms allow-modals/,
    'CSP sandbox des aperçus absente',
  );
  expect(
    source,
    /frame-ancestors think-page:\/\/dev/,
    'frame-ancestors de l’aperçu absent',
  );
  expect(
    source,
    /sandbox; default-src 'none'/,
    'CSP des ressources non HTML absente',
  );
  expect(
    source,
    /base-uri think-page:\/\/dev/,
    'base-uri de l’aperçu absent',
  );
});

check('DL-01', 'Téléchargements : URL sans identifiants et noms sûrs', () => {
  const source = read('src/main/downloadManager.js');
  const utils = read('src/shared/utils.js');

  expect(source, /hasUrlCredentials/, 'Contrôle des identifiants absent');
  expect(source, /isSafeDownloadUrl/, 'Validation d’URL absente');
  expect(source, /sanitizeHeaderValue/, 'Nettoyage d’en-tête absent');
  expect(utils, /sanitized === '\.\.'/, 'Refus du nom .. absent');
  expect(utils, /Noms réservés Windows/, 'Noms réservés Windows non traités');
  expect(utils, /slice\(0, 180\)/, 'Limite de longueur absente');
});

check('DL-02', 'Redirections : URL finale validée et cookies non suivis', () => {
  const download = read('src/main/downloadManager.js');
  const extractor = read('src/main/siteExtractor.js');

  expect(
    download,
    /isSafeDownloadUrl\(result\.finalUrl\)/,
    'URL finale de redirection non validée',
  );
  expect(download, /unsafe-redirect/, 'Code de redirection dangereuse absent');
  expect(
    extractor,
    /redirect: 'error'/,
    'Les cookies peuvent suivre une redirection inter-hôte',
  );
  expect(extractor, /isSafeHttpUrl/, 'Filtrage des URL extraites absent');
});

check('SEC-01', 'Avis locaux et limites affichés', () => {
  const notices = read('src/shared/securityNotices.js');
  const page = read('src/renderer/pages/security.html');

  expect(notices, /TB-SEC-001/, 'Avis TB-SEC-001 absent');
  expect(notices, /TB-SEC-006/, 'Avis TB-SEC-006 absent');
  expect(notices, /SECURITY_LIMITATIONS/, 'Limites absentes');
  expect(notices, /SECURITY_POLICY/, 'Politique absente');
  expect(page, /security-notices/, 'Section avis absente de la page');
  expect(page, /security-limitations/, 'Section limites absente de la page');
});

check('SEC-02', 'Données privées : synthèse isolée de la session normale', () => {
  const source = read('src/main/securityPosture.js');

  expect(
    source,
    /isPrivateSession \? \[\] : store\.getHistory\(\)/,
    'L’historique normal peut fuiter en privé',
  );
  expect(
    source,
    /isPrivateSession \? \{\} : store\.getSitePermissions\(\)/,
    'Les permissions normales peuvent fuiter en privé',
  );
  expect(
    source,
    /isPrivateSession \? 0 : store\.getFavorites\(\)\.length/,
    'Les favoris normaux peuvent fuiter en privé',
  );
  expect(
    source,
    /recentDownloads = isPrivateSession[\s\S]{0,160}listForWindow/,
    'Les téléchargements normaux peuvent fuiter en privé',
  );
  expect(source, /private: isPrivateSession/, 'Indicateur privé absent');
});

check('BUILD-01', 'Distribution : asar et binaires explicitement dépaquetés', () => {
  const packageJson = JSON.parse(read('package.json'));
  const build = packageJson.build || {};

  if (build.asar !== true) {
    throw new Error('asar doit rester activé');
  }

  const unpacked = JSON.stringify(build.asarUnpack || []);
  expect(unpacked, /ffmpeg-installer/, 'ffmpeg non dépaqueté');
  expect(unpacked, /ffprobe-static/, 'ffprobe non dépaqueté');
});

warn(
  'HOST-04',
  'Sandbox du renderer hôte désactivée',
  'Le preload lit les fragments avec fs ; sandbox:false est une limite acceptée et documentée dans about:security.',
);
warn(
  'DEV-04',
  'Terminal de about:dev non sandboxé',
  'Les commandes et fichiers exécutés héritent des droits utilisateur. Le terminal n’est pas une frontière de sécurité.',
);
warn(
  'UPDATE-01',
  'Pas de canal de mise à jour signé',
  'Aucun auto-updater ni flux CVE distant. Reconstruire et réauditer avant distribution.',
);

const dynamicTests = [
  'tests/security.test.js',
  'tests/pageProtocol.test.js',
  'tests/devWorkspace.test.js',
  'tests/downloadManager.test.js',
  'tests/utils.test.js',
];

const testResult = spawnSync(
  process.execPath,
  ['--test', ...dynamicTests],
  {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env, FORCE_COLOR: '0' },
  },
);

if (testResult.error) {
  failures.push({
    id: 'DYN-01',
    label: 'Tests d’intrusion dynamiques',
    message: testResult.error.message,
  });
} else if (testResult.status !== 0) {
  failures.push({
    id: 'DYN-01',
    label: 'Tests d’intrusion dynamiques',
    message: (testResult.stdout || testResult.stderr || '').slice(-4_000),
  });
} else {
  passes.push({
    id: 'DYN-01',
    label: 'Tests d’intrusion dynamiques (routes, fichiers, terminal, téléchargements)',
  });
}

console.log('Think-Browser — audit de sécurité\n');

for (const entry of passes) {
  console.log(`PASS  ${entry.id}  ${entry.label}`);
}

for (const entry of warnings) {
  console.log(`WARN  ${entry.id}  ${entry.label}`);
  console.log(`      ${entry.message}`);
}

for (const entry of failures) {
  console.log(`FAIL  ${entry.id}  ${entry.label}`);
  console.log(`      ${entry.message}`);
}

console.log(
  `\nRésultat : ${passes.length} contrôle(s) réussi(s), ` +
    `${warnings.length} avertissement(s), ${failures.length} échec(s).`,
);
console.log(
  'Pour la couche Electron réelle : npm run test:integration (nécessite un affichage).',
);

if (failures.length > 0) {
  process.exitCode = 1;
}
