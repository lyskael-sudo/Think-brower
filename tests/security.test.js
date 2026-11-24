'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('la fenêtre hôte utilise le preload et l’isolation de contexte', () => {
  const source = read('src/main/windowManager.js');

  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /preload:\s*path\.join/);
  assert.doesNotMatch(source, /nodeIntegration:\s*true/);
  assert.doesNotMatch(source, /contextIsolation:\s*false/);
});

test('la fenêtre hôte ne peut pas naviguer hors de son document local', () => {
  const source = read('src/main/windowManager.js');
  const interfacePath = path.join(root, 'src/renderer/index.html');

  assert.match(source, /function isHostInterfaceUrl/);
  assert.match(source, /'will-navigate', guardHostNavigation/);
  assert.match(source, /'will-redirect', guardHostNavigation/);

  const { isHostInterfaceUrl } = require('../src/main/windowManager');

  assert.equal(
    isHostInterfaceUrl(pathToFileURL(interfacePath).href, interfacePath),
    true,
  );
  assert.equal(
    isHostInterfaceUrl(
      `${pathToFileURL(interfacePath).href}?mode=private`,
      interfacePath,
    ),
    true,
  );
  assert.equal(
    isHostInterfaceUrl('https://attaquant.example/', interfacePath),
    false,
  );
  assert.equal(
    isHostInterfaceUrl(
      pathToFileURL(path.join(root, 'README.md')).href,
      interfacePath,
    ),
    false,
  );
  assert.equal(isHostInterfaceUrl('file:///tmp/index.html', interfacePath), false);
});

test('le renderer ne charge plus de module Electron ou Node.js', () => {
  const rendererDirectory = path.join(root, 'src/renderer/js');
  const files = fs
    .readdirSync(rendererDirectory, { recursive: true })
    .filter((entry) => entry.endsWith('.js'))
    .map((entry) => path.join(rendererDirectory, entry));

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');

    assert.doesNotMatch(source, /require\(['"]electron['"]\)/, file);
    assert.doesNotMatch(source, /require\(['"]node:/, file);
    assert.doesNotMatch(source, /require\(['"]fs['"]\)/, file);
    assert.doesNotMatch(source, /require\(['"]path['"]\)/, file);
  }
});

test('le preload expose un pont fermé et des listes d’autorisation', () => {
  const source = read('src/preload/rendererPreload.js');

  assert.match(source, /contextBridge\.exposeInMainWorld\('thinkBridge'/);
  assert.match(source, /EVENT_CHANNELS/);
  assert.match(source, /ACTION_CHANNELS/);
  assert.match(source, /SEND_CHANNELS/);
  assert.match(source, /readPartial/);
  assert.doesNotMatch(source, /exposeInMainWorld\('electron'/);
});

test('l’interface charge le bundle et utilise le pont', () => {
  assert.match(read('src/renderer/index.html'), /js\/bootstrap\.bundle\.js/);
  assert.match(read('src/renderer/js/api.js'), /window\.thinkBridge/);
  assert.match(read('src/renderer/js/partials.js'), /readPartial/);
  assert.match(
    read('src/renderer/js/tabManager.js'),
    /require\('\.\/eventEmitter'\)/,
  );
});

test('les webviews invitées activent explicitement la sandbox Chromium', () => {
  const source = read('src/main/security.js');

  assert.match(source, /webPreferences\.javascript\s*=\s*true/);
  assert.match(source, /webPreferences\.sandbox\s*=\s*true/);
  assert.match(source, /delete webPreferences\.preload/);
  assert.match(source, /webPreferences\.nodeIntegration\s*=\s*false/);
  assert.match(source, /webPreferences\.contextIsolation\s*=\s*true/);
  assert.match(source, /webPreferences\.webSecurity\s*=\s*true/);
  assert.match(source, /webPreferences\.allowRunningInsecureContent\s*=\s*false/);
});

test('les erreurs de certificat sont refusées explicitement', () => {
  const source = read('src/main/index.js');

  assert.match(source, /'certificate-error'/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /callback\(false\)/);
  assert.doesNotMatch(source, /callback\(true\)/);
});

test('about:dev n’accepte pas de chemin d’espace de travail arbitraire', () => {
  const source = read('src/main/devWorkspace.js');

  assert.match(source, /body\.action !== 'choose'/);
  assert.match(source, /sélecteur natif/);
  assert.doesNotMatch(source, /setWorkspace\(body\.path\)/);
});

test('les aperçus et fichiers de about:dev forcent une CSP sandbox', () => {
  const source = read('src/main/devWorkspace.js');

  assert.match(source, /sandbox allow-scripts allow-forms allow-modals/);
  assert.match(source, /frame-ancestors think-page:\/\/dev/);
  assert.match(source, /sandbox; default-src 'none'/);
  assert.match(source, /base-uri think-page:\/\/dev/);
  assert.doesNotMatch(source, /script-src 'self'/);
});

test('les téléchargements refusent les identifiants et les noms dangereux', () => {
  const downloadSource = read('src/main/downloadManager.js');
  const utilsSource = read('src/shared/utils.js');

  assert.match(downloadSource, /hasUrlCredentials/);
  assert.match(downloadSource, /isSafeDownloadUrl/);
  assert.match(downloadSource, /sanitizeHeaderValue/);
  assert.match(utilsSource, /sanitized === '\.\.'/);
  assert.match(utilsSource, /Noms réservés Windows/);
  assert.match(utilsSource, /slice\(0, 180\)/);
});

test('les pages internes gardent une CSP fermée et une origine contrôlée', () => {
  const source = read('src/main/pageProtocol.js');

  assert.match(source, /"default-src 'none'"/);
  assert.match(source, /"script-src 'self'"/);
  assert.match(source, /"frame-ancestors 'none'"/);
  assert.match(source, /function isAllowedApiOrigin/);
  assert.match(source, /Origine refusée/);
  assert.doesNotMatch(source, /script-src[^;]*unsafe-eval/);
});

test('about:security expose des avis locaux et les limites résiduelles', () => {
  const source = read('src/shared/securityNotices.js');
  const page = read('src/renderer/pages/security.html');

  assert.match(source, /TB-SEC-001/);
  assert.match(source, /TB-SEC-006/);
  assert.match(source, /SECURITY_LIMITATIONS/);
  assert.match(source, /SECURITY_POLICY/);
  assert.match(page, /security-notices/);
  assert.match(page, /security-limitations/);
  assert.match(page, /Avis de sécurité et limites connues/);
});

test('les pages internes n’ouvrent pas de lien externe arbitraire', () => {
  for (const file of [
    'src/main/pageProtocol.js',
    'src/main/devWorkspace.js',
    'src/main/securityPosture.js',
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /shell\.openExternal/, file);
  }
});
