'use strict';

/**
 * Think-Browser — posture de sécurité et signaux d'insécurité.
 *
 * Ce module transforme des données déjà présentes dans le processus principal
 * (cookies, permissions, historique, téléchargements) en indicateurs lisibles.
 * Il ne modifie rien et ne transmet jamais de secret à une page distante : la
 * synthèse est servie uniquement par le protocole interne `think-page`.
 *
 * @module main/securityPosture
 */

const {
  PROMPTABLE_PAGE_PERMISSIONS,
} = require('../shared/constants');
const {
  SECURITY_LIMITATIONS,
  SECURITY_NOTICES,
  SECURITY_NOTICE_VERSION,
  SECURITY_POLICY,
} = require('../shared/securityNotices');
const { getHostname, isHttpUrl } = require('../shared/utils');

const COOKIE_DISPLAY_LIMIT = 500;
const COOKIE_VALUE_LIMIT = 512;
const MIN_ELECTRON_MAJOR = 40;

/** Libellés français des permissions sensibles. */
const PERMISSION_LABELS = Object.freeze({
  media: 'Caméra et microphone',
  geolocation: 'Géolocalisation précise',
  'geolocation-approximate': 'Géolocalisation approximative',
  notifications: 'Notifications',
  mediaKeySystem: 'Contenus protégés (DRM)',
  midi: 'Périphériques MIDI',
  midiSysex: 'MIDI SysEx',
  'clipboard-read': 'Lecture du presse-papiers',
  'idle-detection': 'Détection d’inactivité',
  'local-fonts': 'Polices locales',
  'window-management': 'Gestion des fenêtres',
  'speaker-selection': 'Choix du haut-parleur',
  'storage-access': 'Accès au stockage entre sites',
  'top-level-storage-access': 'Accès au stockage entre sites',
  fileSystem: 'Accès à des fichiers',
  'persistent-storage': 'Stockage persistant',
  'background-sync': 'Synchronisation en arrière-plan',
  'periodic-background-sync': 'Synchronisation périodique',
  sensors: 'Capteurs',
  vr: 'Réalité virtuelle',
  nfc: 'NFC',
  'web-printing': 'Impression',
  keyboardLock: 'Verrouillage clavier',
  'system-wake-lock': 'Maintien de l’appareil éveillé',
  'local-network-access': 'Accès au réseau local',
});

/**
 * Indique si un hôte est local et peut utiliser HTTP sans exposition réseau.
 * @param {string} hostname
 * @returns {boolean}
 */
function isLocalHostname(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  );
}

/**
 * Analyse les cookies et retourne des signaux de risque.
 * @param {Electron.Cookie[]} cookies
 * @returns {{issues: object[], insecureCount: number, sessionCount: number, thirdPartyCount: number}}
 */
function analyzeCookies(cookies) {
  const issues = [];
  let insecureCount = 0;
  let sessionCount = 0;
  let thirdPartyCount = 0;
  const now = Date.now();
  const oneYear = 365 * 24 * 60 * 60 * 1000;

  for (const cookie of cookies) {
    if (!cookie || typeof cookie.domain !== 'string') {
      continue;
    }

    const reasons = [];
    const domain = cookie.domain.replace(/^\./, '');
    const secure = cookie.secure === true;

    if (!secure && !isLocalHostname(domain)) {
      reasons.push('transmis sans Secure');
      insecureCount += 1;
    }

    if (cookie.sameSite === 'no_restriction' && !secure) {
      reasons.push('SameSite=None sans Secure');
    }

    if (
      !cookie.httpOnly &&
      /(?:sess|token|auth|sid|jwt|csrf|login)/i.test(cookie.name || '')
    ) {
      reasons.push('cookie d’authentification accessible au JavaScript');
    }

    if (cookie.session) {
      sessionCount += 1;
    }

    if (
      Number.isFinite(cookie.expirationDate) &&
      cookie.expirationDate * 1000 > now + oneYear
    ) {
      reasons.push('durée de conservation supérieure à un an');
    }

    if (!cookie.hostOnly) {
      thirdPartyCount += 1;
    }

    if (typeof cookie.value === 'string' && cookie.value.length > 4096) {
      reasons.push('valeur anormalement longue');
    }

    if (reasons.length > 0 && issues.length < 100) {
      issues.push({
        domain: cookie.domain,
        name: cookie.name || '',
        reasons,
      });
    }
  }

  return {
    issues,
    insecureCount,
    sessionCount,
    thirdPartyCount,
  };
}

/**
 * Repère les entrées d'historique en HTTP non local.
 * @param {object[]} history
 * @returns {object[]}
 */
function analyzeHttpHistory(history) {
  const entries = [];

  for (const entry of Array.isArray(history) ? history : []) {
    if (!entry || !isHttpUrl(entry.url) || !entry.url.startsWith('http://')) {
      continue;
    }

    try {
      const hostname = new URL(entry.url).hostname;

      if (isLocalHostname(hostname)) {
        continue;
      }

      entries.push({
        url: entry.url,
        title: entry.title || getHostname(entry.url),
        host: hostname,
        visitedAt: entry.visitedAt || '',
      });
    } catch {
      // Une entrée invalide ne doit pas interrompre la synthèse.
    }

    if (entries.length >= 30) {
      break;
    }
  }

  return entries;
}

/**
 * Liste les permissions sensibles accordées à des sites.
 * @param {Record<string, Record<string, 'allow' | 'deny'>>} permissions
 * @returns {object[]}
 */
function analyzePermissions(permissions) {
  const risks = [];

  for (const [origin, decisions] of Object.entries(permissions || {})) {
    for (const [permission, decision] of Object.entries(decisions || {})) {
      if (decision !== 'allow') {
        continue;
      }

      if (
        !PROMPTABLE_PAGE_PERMISSIONS.has(permission) &&
        permission !== 'fullscreen' &&
        permission !== 'pointerLock'
      ) {
        continue;
      }

      risks.push({
        origin,
        permission,
        label: PERMISSION_LABELS[permission] || permission,
      });
    }
  }

  return risks.sort((a, b) => a.origin.localeCompare(b.origin));
}

/**
 * Construit les contrôles de posture affichés dans `about:security`.
 * Les valeurs reflètent la configuration effective de l'application et non
 * une simple déclaration marketing.
 * @param {object} options
 * @param {boolean} options.isPrivateSession
 * @param {boolean} options.adBlockActive
 * @param {number} options.cookieCount
 * @param {number} options.permissionRiskCount
 * @param {number} options.httpHistoryCount
 * @returns {object[]}
 */
function buildPostureChecks({
  isPrivateSession,
  adBlockActive,
  cookieCount,
  permissionRiskCount,
  httpHistoryCount,
  electronMajor = 0,
  noticeCount = SECURITY_NOTICES.length,
}) {
  const electronStatus =
    electronMajor === 0 ? 'info' : electronMajor >= MIN_ELECTRON_MAJOR ? 'pass' : 'warn';

  return [
    {
      id: 'context-isolation',
      label: 'Isolation de contexte du renderer hôte',
      status: 'pass',
      detail:
        'Le renderer local ne peut pas accéder directement à Node.js ; ' +
        'les appels passent par un pont contextBridge à listes d’autorisation.',
    },
    {
      id: 'node-integration',
      label: 'Intégration Node.js désactivée',
      status: 'pass',
      detail:
        'Les fenêtres hôtes et les webviews invitées utilisent ' +
        'nodeIntegration: false.',
    },
    {
      id: 'guest-hardening',
      label: 'Webviews invitées durcies',
      status: 'pass',
      detail:
        'Préload supprimé, isolation de contexte active, webviewTag imbriqué ' +
        'interdit et navigation limitée aux protocoles internes/HTTP(S).',
    },
    {
      id: 'preload-allowlist',
      label: 'Pont preload fermé',
      status: 'pass',
      detail:
        'Les canaux invoke/send/on et les fragments HTML sont limités par ' +
        'des listes explicites.',
    },
    {
      id: 'sandbox',
      label: 'Sandbox du renderer hôte',
      status: 'warn',
      detail:
        'Le preload local a besoin du système de fichiers pour assembler les ' +
        'fragments HTML ; la sandbox Electron est donc désactivée. ' +
        'L’isolation de contexte et le pont fermé limitent la portée.',
    },
    {
      id: 'certificate-validation',
      label: 'Validation des certificats TLS',
      status: 'pass',
      detail:
        'Aucune exception de certificat n’est accordée : les erreurs de ' +
        'chaîne, de nom d’hôte ou de date sont refusées par le processus ' +
        'principal et par Chromium.',
    },
    {
      id: 'electron-version',
      label: 'Version du moteur Electron',
      status: electronStatus,
      detail:
        electronMajor === 0
          ? 'La version du moteur n’a pas pu être déterminée.'
          : `Electron ${electronMajor} détecté. La politique locale demande ` +
            `au moins la branche ${MIN_ELECTRON_MAJOR} ; les avis de sécurité ` +
            'Electron/Chromium restent à surveiller manuellement.',
    },
    {
      id: 'updates',
      label: 'Canal de mise à jour',
      status: 'warn',
      detail: SECURITY_POLICY.update,
    },
    {
      id: 'security-notices',
      label: 'Avis et limites connues',
      status: noticeCount > 0 ? 'info' : 'warn',
      detail:
        noticeCount > 0
          ? `${noticeCount} avis local(aux) sont documentés dans cette page. ` +
            'Ils ne remplacent pas un flux de vulnérabilités externe.'
          : 'Aucun avis local n’est disponible.',
    },
    {
      id: 'dev-terminal',
      label: 'Exécution locale de about:dev',
      status: 'warn',
      detail:
        'Le terminal et les fichiers exécutés ne sont pas sandboxés ; ils ' +
        'héritent des droits du compte utilisateur. N’exécutez que du code de ' +
        'confiance.',
    },
    {
      id: 'adblock',
      label: 'Filtrage réseau AdBlock',
      status: adBlockActive ? 'pass' : 'warn',
      detail: adBlockActive
        ? 'Le filtrage réseau est actif sur la session normale et les ' +
          'partitions privées connues.'
        : 'Le filtrage est désactivé ou ses filtres n’ont pas pu être chargés.',
    },
    {
      id: 'cookies',
      label: 'Cookies',
      status: cookieCount > 0 ? 'info' : 'pass',
      detail:
        cookieCount > 0
          ? `${cookieCount} cookie(s) enregistré(s). Les cookies sans Secure, ` +
            'SameSite=None incohérent ou accessibles au JavaScript sont signalés.'
          : 'Aucun cookie enregistré dans cette session.',
    },
    {
      id: 'permissions',
      label: 'Permissions sensibles',
      status: permissionRiskCount > 0 ? 'warn' : 'pass',
      detail:
        permissionRiskCount > 0
          ? `${permissionRiskCount} autorisation(s) sensible(s) accordée(s) à ` +
            'des sites. Vérifiez-les et révoquez celles qui ne sont plus utiles.'
          : 'Aucune permission sensible accordée à un site.',
    },
    {
      id: 'http',
      label: 'Connexions HTTP non chiffrées',
      status: httpHistoryCount > 0 ? 'warn' : 'pass',
      detail:
        httpHistoryCount > 0
          ? `${httpHistoryCount} entrée(s) d’historique utilisent HTTP sans TLS. ` +
            'Évitez d’y saisir des identifiants.'
          : 'Aucune connexion HTTP non locale dans l’historique récent.',
    },
    {
      id: 'private-mode',
      label: 'Navigation privée',
      status: 'info',
      detail: isPrivateSession
        ? 'Cette page est ouverte dans une partition éphémère : les cookies ' +
          'affichés disparaîtront à la fermeture de la fenêtre.'
        : 'La navigation privée utilise une partition éphémère séparée.',
    },
  ];
}

/**
 * Rassemble la synthèse servie à `about:security`.
 * @param {object} options
 * @param {Electron.Session} options.session
 * @param {import('./store').Store} options.store
 * @param {import('./downloadManager').DownloadManager} [options.downloadManager]
 * @param {import('./adblocker').AdBlocker} [options.adBlocker]
 * @param {boolean} [options.isPrivateSession]
 * @param {object} [options.appInfo]
 * @returns {Promise<object>}
 */
async function collectSecuritySummary({
  session,
  store,
  downloadManager,
  adBlocker,
  isPrivateSession = false,
  appInfo = {},
}) {
  const cookies = await session.cookies.get({});
  const cookieAnalysis = analyzeCookies(cookies);

  // Une fenêtre privée ne doit jamais exposer l’historique, les favoris,
  // les permissions ou les téléchargements de la session normale. Ces
  // données sont globales dans le store ; elles sont donc volontairement
  // masquées ici, tandis que les cookies proviennent de la partition privée.
  const history = isPrivateSession ? [] : store.getHistory();
  const httpHistory = analyzeHttpHistory(history);
  const permissions = isPrivateSession ? {} : store.getSitePermissions();
  const permissionRisks = analyzePermissions(permissions);
  const favoriteCount = isPrivateSession ? 0 : store.getFavorites().length;
  const recentDownloads = isPrivateSession
    ? []
    : (downloadManager?.listForWindow({ isPrivate: false }) || [])
        .slice(0, 12)
        .map((record) => ({
          id: record.id,
          filename: record.filename,
          state: record.state,
          totalBytes: record.totalBytes,
          receivedBytes: record.receivedBytes,
          endedAt: record.endedAt,
          kind: record.kind,
        }));
  let cacheSize = 0;

  try {
    cacheSize = await session.getCacheSize();
  } catch {
    cacheSize = 0;
  }

  const displayCookies = cookies
    .slice()
    .sort((a, b) => {
      const domain = String(a.domain || '').localeCompare(String(b.domain || ''));
      return domain || String(a.name || '').localeCompare(String(b.name || ''));
    })
    .slice(0, COOKIE_DISPLAY_LIMIT)
    .map((cookie) => ({
      domain: cookie.domain,
      name: cookie.name,
      value:
        typeof cookie.value === 'string'
          ? cookie.value.slice(0, COOKIE_VALUE_LIMIT)
          : '',
      valueTruncated:
        typeof cookie.value === 'string' &&
        cookie.value.length > COOKIE_VALUE_LIMIT,
      path: cookie.path,
      secure: Boolean(cookie.secure),
      httpOnly: Boolean(cookie.httpOnly),
      sameSite: cookie.sameSite || 'unspecified',
      session: Boolean(cookie.session),
      hostOnly: Boolean(cookie.hostOnly),
      expirationDate: Number.isFinite(cookie.expirationDate)
        ? cookie.expirationDate
        : null,
    }));

  const adBlockActive = Boolean(adBlocker?.isActive());

  return {
    generatedAt: new Date().toISOString(),
    private: isPrivateSession,
    app: {
      version: appInfo.version || '',
      electron: appInfo.electron || '',
      chrome: appInfo.chrome || '',
      node: appInfo.node || '',
    },
    counts: {
      cookies: cookies.length,
      displayedCookies: displayCookies.length,
      history: history.length,
      favorites: favoriteCount,
      sitePermissions: Object.keys(permissions).length,
      recentDownloads: recentDownloads.length,
      cacheBytes: cacheSize,
    },
    cookies: displayCookies,
    cookieAnalysis,
    permissions,
    permissionRisks,
    httpHistory,
    recentDownloads,
    posture: {
      adBlockActive,
      checks: buildPostureChecks({
        isPrivateSession,
        adBlockActive,
        cookieCount: cookies.length,
        permissionRiskCount: permissionRisks.length,
        httpHistoryCount: httpHistory.length,
        electronMajor: Number.parseInt(String(appInfo.electron || ''), 10) || 0,
        noticeCount: SECURITY_NOTICES.length,
      }),
    },
    securityNotices: {
      version: SECURITY_NOTICE_VERSION,
      notices: SECURITY_NOTICES,
      limitations: SECURITY_LIMITATIONS,
      policy: SECURITY_POLICY,
    },
  };
}

module.exports = {
  MIN_ELECTRON_MAJOR,
  PERMISSION_LABELS,
  SECURITY_LIMITATIONS,
  SECURITY_NOTICES,
  SECURITY_NOTICE_VERSION,
  SECURITY_POLICY,
  analyzeCookies,
  analyzeHttpHistory,
  analyzePermissions,
  buildPostureChecks,
  collectSecuritySummary,
  isLocalHostname,
};
