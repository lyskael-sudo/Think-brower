'use strict';

/**
 * Think-Browser — identité de navigation compatible.
 *
 * Les sites modernes adaptent leurs fonctions au moteur Chromium, mais certains
 * refusent les chaînes contenant « Electron » ou le nom d'un navigateur
 * inconnu. On présente donc le moteur réel avec une chaîne Chrome standard,
 * sans usurper un autre moteur ni modifier les API exposées à la page.
 *
 * @module main/userAgent
 */

/**
 * Version Chrome de repli si Electron ne fournit pas de version exploitable.
 * Elle ne doit jamais contenir « Electron » ou le nom de l'application.
 */
const FALLBACK_CHROME_VERSION = '120.0.0.0';

/**
 * Construit le jeton de plateforme utilisé par Chrome.
 * @returns {string}
 */
function getPlatformToken() {
  switch (process.platform) {
    case 'win32':
      return process.arch === 'ia32'
        ? 'Windows NT 10.0'
        : 'Windows NT 10.0; Win64; x64';
    case 'darwin':
      return 'Macintosh; Intel Mac OS X 10_15_7';
    case 'linux':
      return process.arch === 'arm64'
        ? 'X11; Linux aarch64'
        : 'X11; Linux x86_64';
    default:
      return 'X11; Linux x86_64';
  }
}

/**
 * Retourne la version Chromium sous une forme compatible avec un User-Agent
 * Chrome. Electron peut exposer une version suffixée : on ne garde que les
 * quatre premiers nombres pour éviter toute fuite de build interne.
 * @returns {string}
 */
function getChromeVersion() {
  const rawVersion = String(process.versions.chrome || '');
  const match = rawVersion.match(/\b(\d+\.\d+\.\d+\.\d+)\b/);

  return match ? match[1] : FALLBACK_CHROME_VERSION;
}

/**
 * Retourne une chaîne User-Agent Chrome correspondant au moteur embarqué.
 * Aucun jeton `Electron`, `Think-Browser` ou nom d'application n'est inclus.
 * @returns {string}
 */
function buildChromeUserAgent() {
  return (
    `Mozilla/5.0 (${getPlatformToken()}) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${getChromeVersion()} Safari/537.36`
  );
}

/**
 * Applique l'identité de navigation à une session Electron.
 * @param {Electron.Session} targetSession
 * @returns {void}
 */
function applySessionUserAgent(targetSession) {
  if (!targetSession) {
    return;
  }

  try {
    targetSession.setUserAgent(buildChromeUserAgent());
  } catch (error) {
    console.warn(
      '[Compatibilité] User-Agent non appliqué :',
      error.message,
    );
  }
}

/**
 * Force l'identité Chrome sur un WebContents déjà créé. `session.setUserAgent`
 * ne modifie pas les contenus existants : ce complément couvre les webviews et
 * les fenêtres OAuth créées avant ou en dehors du chemin habituel.
 * @param {Electron.WebContents} webContents
 * @returns {void}
 */
function applyWebContentsUserAgent(webContents) {
  if (!webContents || webContents.isDestroyed?.()) {
    return;
  }

  try {
    webContents.setUserAgent(buildChromeUserAgent());
  } catch (error) {
    console.warn(
      '[Compatibilité] User-Agent du contenu non appliqué :',
      error.message,
    );
  }
}

module.exports = {
  applySessionUserAgent,
  applyWebContentsUserAgent,
  buildChromeUserAgent,
};
