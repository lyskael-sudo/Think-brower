'use strict';

/**
 * Think-Browser — permissions par site.
 *
 * Les permissions non sensibles restent accordées automatiquement. Les
 * permissions sensibles (caméra, micro, géolocalisation, notifications, etc.)
 * sont demandées à l'utilisateur puis mémorisées pour l'origine concernée.
 *
 * @module main/permissions
 */

const { BrowserWindow, dialog } = require('electron');
const {
  ALLOWED_PAGE_PERMISSIONS,
  PROMPTABLE_PAGE_PERMISSIONS,
} = require('../shared/constants');
const { getHostname, isHttpUrl } = require('../shared/utils');

const PERMISSION_LABELS = Object.freeze({
  media: 'la caméra et le microphone',
  geolocation: 'la géolocalisation',
  'geolocation-approximate': 'la géolocalisation approximative',
  notifications: 'les notifications',
  mediaKeySystem: 'la lecture de contenus protégés (DRM)',
  midi: 'les périphériques MIDI',
  midiSysex: 'les périphériques MIDI',
  'clipboard-read': 'la lecture du presse-papiers',
  'idle-detection': 'la détection d’inactivité',
  'local-fonts': 'les polices installées',
  'window-management': 'la gestion des fenêtres',
  'speaker-selection': 'le choix du haut-parleur',
  'storage-access': 'l’accès au stockage entre sites',
  'top-level-storage-access': 'l’accès au stockage entre sites',
  fileSystem: 'l’accès à des fichiers locaux',
  'persistent-storage': 'le stockage persistant',
  'background-sync': 'la synchronisation en arrière-plan',
  'periodic-background-sync':
    'la synchronisation périodique en arrière-plan',
  sensors: 'les capteurs',
  vr: 'la réalité virtuelle',
  nfc: 'le NFC',
  'web-printing': 'l’impression',
  keyboardLock: 'le verrouillage du clavier',
  'system-wake-lock': 'le maintien de l’appareil éveillé',
  'local-network-access': 'l’accès au réseau local',
});

/**
 * Origines de lecture vidéo reconnues. Elles reçoivent automatiquement la
 * permission `mediaKeySystem`, nécessaire aux contenus DRM, sans pour autant
 * accorder les notifications sans consentement. Les autres permissions
 * sensibles suivent le circuit de demande habituel.
 */
const RECOGNIZED_MEDIA_HOSTS = Object.freeze([
  'youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
  'music.youtube.com',
]);

/**
 * Indique si une origine appartient à un service média de confiance.
 * @param {string} origin
 * @returns {boolean}
 */
function isRecognizedMediaOrigin(origin) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase().replace(/\.$/, '');
    return RECOGNIZED_MEDIA_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

/**
 * Indique si une permission est accordée sans dialogue. Le stockage persistant
 * est toujours autorisé pour HTTP(S) ; le DRM l'est uniquement pour les
 * origines média reconnues.
 * @param {string} origin
 * @param {string} permission
 * @returns {boolean}
 */
function isAutomaticallyAllowed(origin, permission) {
  if (ALLOWED_PAGE_PERMISSIONS.has(permission)) {
    return true;
  }

  return permission === 'mediaKeySystem' && isRecognizedMediaOrigin(origin);
}

/**
 * Extrait une origine HTTP(S) valide.
 * @param {unknown} value
 * @returns {string | null}
 */
function getHttpOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const origin = new URL(value).origin;
    return isHttpUrl(origin) ? origin : null;
  } catch {
    return null;
  }
}

/**
 * Retourne un libellé lisible pour une permission.
 * @param {string} permission
 * @param {Electron.PermissionRequestDetails} [details]
 * @returns {string}
 */
function getPermissionLabel(permission, details) {
  if (permission === 'media' && Array.isArray(details?.mediaTypes)) {
    const hasVideo = details.mediaTypes.includes('video');
    const hasAudio = details.mediaTypes.includes('audio');

    if (hasVideo && hasAudio) {
      return 'la caméra et le microphone';
    }

    if (hasVideo) {
      return 'la caméra';
    }

    if (hasAudio) {
      return 'le microphone';
    }
  }

  return PERMISSION_LABELS[permission] || permission;
}

/**
 * Demande une décision à l'utilisateur pour une permission sensible.
 * @param {Electron.WebContents} webContents
 * @param {string} permission
 * @param {string} origin
 * @param {Electron.PermissionRequestDetails} [details]
 * @returns {Promise<boolean>}
 */
async function askPermission(webContents, permission, origin, details) {
  const hostname = getHostname(origin);
  const recognizedMediaOrigin = isRecognizedMediaOrigin(origin);
  const options = {
    type: 'question',
    title: 'Autorisation demandée',
    message: `Autoriser ${getPermissionLabel(permission, details)} ?`,
    detail:
      `${hostname} demande cette autorisation.\n\n` +
      (recognizedMediaOrigin && permission === 'notifications'
        ? 'Cette autorisation permet au site de vous prévenir des nouvelles ' +
          'vidéos, messages ou événements. Elle reste facultative.\n\n'
        : '') +
      'Votre choix sera mémorisé pour ce site. Vous pouvez le réinitialiser ' +
      'dans les paramètres.',
    buttons: ['Bloquer', 'Autoriser'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };

  let result;

  try {
    const parentWindow = BrowserWindow.fromWebContents(webContents);
    result = parentWindow
      ? await dialog.showMessageBox(parentWindow, options)
      : await dialog.showMessageBox(options);
  } catch (error) {
    console.warn('[Permissions] Dialogue impossible :', error.message);
    return false;
  }

  return result.response === 1;
}

/**
 * Installe les gestionnaires de permissions sur une session.
 * @param {Electron.Session} appSession
 * @param {object} options
 * @param {import('./store').Store} options.store
 * @param {boolean} [options.persistDecisions] `false` pour une session privée :
 * les choix restent en mémoire et disparaissent avec la partition.
 */
function configurePermissions(appSession, { store, persistDecisions = true }) {
  /** @type {Map<string, boolean>} */
  const pendingPrompts = new Map();

  /** @type {Map<string, 'allow' | 'deny'>} */
  const ephemeralDecisions = new Map();

  /**
   * @param {string} origin
   * @param {string} permission
   * @returns {'allow' | 'deny' | null}
   */
  const getDecision = (origin, permission) => {
    if (persistDecisions) {
      return store.getSitePermission(origin, permission);
    }

    return ephemeralDecisions.get(`${origin}:${permission}`) || null;
  };

  /**
   * @param {string} origin
   * @param {string} permission
   * @param {'allow' | 'deny'} decision
   * @returns {Promise<void>}
   */
  const setDecision = async (origin, permission, decision) => {
    if (persistDecisions) {
      await store.setSitePermission(origin, permission, decision);
      return;
    }

    ephemeralDecisions.set(`${origin}:${permission}`, decision);
  };

  appSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) => {
      const origin =
        getHttpOrigin(requestingOrigin) ||
        getHttpOrigin(webContents?.getURL());

      if (!origin) {
        return false;
      }

      if (isAutomaticallyAllowed(origin, permission)) {
        return true;
      }

      return getDecision(origin, permission) === 'allow';
    },
  );

  appSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const origin =
        getHttpOrigin(details?.requestingUrl) ||
        getHttpOrigin(webContents.getURL());

      if (!origin) {
        callback(false);
        return;
      }

      if (isAutomaticallyAllowed(origin, permission)) {
        callback(true);
        return;
      }

      const savedDecision = getDecision(origin, permission);

      if (savedDecision === 'allow') {
        callback(true);
        return;
      }

      if (savedDecision === 'deny') {
        callback(false);
        return;
      }

      if (!PROMPTABLE_PAGE_PERMISSIONS.has(permission)) {
        callback(false);
        return;
      }

      const promptKey = `${origin}:${permission}`;

      if (pendingPrompts.has(promptKey)) {
        callback(false);
        return;
      }

      pendingPrompts.set(promptKey, true);

      void (async () => {
        try {
          const allowed = await askPermission(
            webContents,
            permission,
            origin,
            details,
          );

          try {
            await setDecision(
              origin,
              permission,
              allowed ? 'allow' : 'deny',
            );
          } catch (error) {
            console.warn(
              '[Permissions] Mémorisation impossible :',
              error.message,
            );
          }

          callback(allowed);
        } catch (error) {
          console.warn('[Permissions] Demande impossible :', error.message);
          callback(false);
        } finally {
          pendingPrompts.delete(promptKey);
        }
      })();
    },
  );

  // USB, HID, port série, etc. : aucun accès direct aux périphériques.
  appSession.setDevicePermissionHandler(() => false);

  // Capture d'écran et de fenêtre : refusée par défaut.
  appSession.setDisplayMediaRequestHandler((_request, callback) => {
    callback(null);
  });
}

module.exports = { configurePermissions };
