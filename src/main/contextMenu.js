'use strict';

/**
 * Think-Browser — menu contextuel des pages web.
 *
 * Le menu est construit dans le processus principal à partir des informations
 * fournies par Electron. Les actions qui concernent l'interface (ouvrir un
 * onglet) repassent par IPC ; les téléchargements de médias sont confiés au
 * gestionnaire central afin de conserver les cookies et le Referer.
 *
 * @module main/contextMenu
 */

const { clipboard, Menu } = require('electron');
const { IPC, MEDIA_EXTENSIONS } = require('../shared/constants');
const {
  getStreamType,
  getUrlExtension,
  isSafeHttpUrl,
} = require('../shared/utils');
const { isYouTubeVideoUrl } = require('./youtube');

/**
 * Indique si la webview peut revenir en arrière.
 * @param {Electron.WebContents} guest
 * @returns {boolean}
 */
function canGoBack(guest) {
  try {
    return guest.navigationHistory
      ? guest.navigationHistory.canGoBack()
      : guest.canGoBack();
  } catch {
    return false;
  }
}

/**
 * Indique si la webview peut avancer.
 * @param {Electron.WebContents} guest
 * @returns {boolean}
 */
function canGoForward(guest) {
  try {
    return guest.navigationHistory
      ? guest.navigationHistory.canGoForward()
      : guest.canGoForward();
  } catch {
    return false;
  }
}

/**
 * Indique si une URL de lien ressemble à un média téléchargeable.
 * @param {unknown} value
 * @returns {boolean}
 */
function isMediaLinkUrl(value) {
  if (!isSafeHttpUrl(value)) {
    return false;
  }

  const extension = getUrlExtension(value);
  return MEDIA_EXTENSIONS.has(extension) || Boolean(getStreamType(extension));
}

/**
 * Affiche une notification dans la fenêtre qui a ouvert le menu.
 * @param {(browserWindow: Electron.BrowserWindow, channel: string, payload?: unknown) => void} sendToWindow
 * @param {Electron.BrowserWindow} browserWindow
 * @param {string} message
 * @param {'info' | 'success' | 'error'} [variant]
 */
function notify(sendToWindow, browserWindow, message, variant = 'info') {
  sendToWindow(browserWindow, IPC.APP_NOTIFICATION, {
    message,
    variant,
  });
}

/**
 * Construit et affiche le menu contextuel d'une page.
 * @param {object} options
 * @param {Electron.BrowserWindow} options.browserWindow
 * @param {Electron.WebContents} options.guest
 * @param {Electron.ContextMenuParams} options.params
 * @param {(browserWindow: Electron.BrowserWindow, channel: string, payload?: unknown) => void} options.sendToWindow
 * @param {(payload: object) => Promise<object> | object} [options.onDownloadMedia]
 * @param {(guest: Electron.WebContents, params: Electron.ContextMenuParams) => string | null} [options.resolveMediaUrl]
 * @param {(guest: Electron.WebContents, params: Electron.ContextMenuParams) => object | null} [options.resolveMediaPair]
 */
function showPageContextMenu({
  browserWindow,
  guest,
  params,
  sendToWindow,
  onDownloadMedia,
  resolveMediaUrl,
  resolveMediaPair,
}) {
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [];
  const linkUrl = isSafeHttpUrl(params.linkURL) ? params.linkURL : null;
  const directMediaUrl = isSafeHttpUrl(params.srcURL) ? params.srcURL : null;
  let resolvedMediaUrl = null;
  let resolvedMediaPair = null;

  // YouTube et les lecteurs MSE exposent souvent une URL `blob:` dans
  // `srcURL`. On retrouve alors le dernier flux HTTP(S) réel observé par le
  // détecteur pour la même webview.
  if (
    !directMediaUrl &&
    (params.mediaType === 'video' || params.mediaType === 'audio') &&
    typeof resolveMediaUrl === 'function'
  ) {
    try {
      const candidate = resolveMediaUrl(guest, params);
      resolvedMediaUrl = isSafeHttpUrl(candidate) ? candidate : null;
    } catch (error) {
      console.warn(
        '[Menu contextuel] Résolution du média impossible :',
        error.message,
      );
    }
  }

  // Une vidéo adaptative peut exposer une piste vidéo et une piste audio
  // séparées. On propose alors une fusion ffmpeg, sans toucher aux tampons MSE
  // ni aux contenus protégés.
  if (
    !directMediaUrl &&
    params.mediaType === 'video' &&
    typeof resolveMediaPair === 'function'
  ) {
    try {
      const candidate = resolveMediaPair(guest, params);

      if (
        candidate &&
        isSafeHttpUrl(candidate.videoUrl) &&
        isSafeHttpUrl(candidate.audioUrl) &&
        candidate.videoUrl !== candidate.audioUrl
      ) {
        resolvedMediaPair = candidate;
      }
    } catch (error) {
      console.warn(
        '[Menu contextuel] Résolution de la paire média impossible :',
        error.message,
      );
    }
  }

  const mediaUrl = directMediaUrl || resolvedMediaUrl;
  const pageUrl = isSafeHttpUrl(params.pageURL)
    ? params.pageURL
    : guest.getURL?.() || '';
  const youtubeUrl = isYouTubeVideoUrl(pageUrl) ? pageUrl : '';
  const selectedText =
    typeof params.selectionText === 'string' ? params.selectionText.trim() : '';

  /**
   * Lance le téléchargement via le gestionnaire central. Le renderer reçoit
   * une notification de succès ou d'échec, y compris pour les flux ffmpeg.
   * @param {string} url
   */
  const downloadMedia = (url) => {
    void (async () => {
      const pageUrl = isSafeHttpUrl(params.pageURL)
        ? params.pageURL
        : guest.getURL?.() || '';

      try {
        if (typeof onDownloadMedia !== 'function') {
          guest.downloadURL(url);
          notify(
            sendToWindow,
            browserWindow,
            'Téléchargement du média lancé.',
            'success',
          );
          return;
        }

        const result = await onDownloadMedia({
          url,
          pageUrl,
          guest,
          mediaType: params.mediaType,
        });

        if (result?.ok) {
          notify(
            sendToWindow,
            browserWindow,
            result.queued
              ? 'Flux mis en file d’attente pour ffmpeg.'
              : result.mode === 'stream'
                ? 'Téléchargement du flux lancé.'
                : 'Téléchargement du média lancé.',
            'success',
          );
          return;
        }

        notify(
          sendToWindow,
          browserWindow,
          result?.message || 'Le téléchargement du média a échoué.',
          'error',
        );
      } catch (error) {
        notify(
          sendToWindow,
          browserWindow,
          `Téléchargement impossible : ${error.message}`,
          'error',
        );
      }
    })();
  };

  /**
   * Lance la fusion d'une piste vidéo et d'une piste audio.
   * @param {object} pair
   */
  const downloadMergedMedia = (pair) => {
    void (async () => {
      const pageUrl = isSafeHttpUrl(params.pageURL)
        ? params.pageURL
        : guest.getURL?.() || '';

      try {
        if (typeof onDownloadMedia !== 'function') {
          notify(
            sendToWindow,
            browserWindow,
            'Le téléchargement fusionné n’est pas disponible.',
            'error',
          );
          return;
        }

        const result = await onDownloadMedia({
          videoUrl: pair.videoUrl,
          audioUrl: pair.audioUrl,
          videoExtension: pair.videoExtension,
          audioExtension: pair.audioExtension,
          videoContentType: pair.videoContentType,
          audioContentType: pair.audioContentType,
          outputExtension: pair.outputExtension,
          pageUrl,
          guest,
          mediaType: 'video',
        });

        if (result?.ok) {
          notify(
            sendToWindow,
            browserWindow,
            result.queued
              ? 'Fusion audio/vidéo mise en file d’attente.'
              : 'Fusion audio/vidéo lancée.',
            'success',
          );
          return;
        }

        notify(
          sendToWindow,
          browserWindow,
          result?.message || 'La fusion audio/vidéo a échoué.',
          'error',
        );
      } catch (error) {
        notify(
          sendToWindow,
          browserWindow,
          `Fusion impossible : ${error.message}`,
          'error',
        );
      }
    })();
  };

  /**
   * Lance le téléchargement YouTube via l'outil externe optionnel yt-dlp.
   * @param {string} url
   */
  const downloadWithYtDlp = (url) => {
    void (async () => {
      try {
        if (typeof onDownloadMedia !== 'function') {
          notify(
            sendToWindow,
            browserWindow,
            'Le téléchargement YouTube n’est pas disponible.',
            'error',
          );
          return;
        }

        const result = await onDownloadMedia({
          url,
          pageUrl: url,
          ytdlp: true,
          mediaType: 'none',
        });

        if (result?.ok) {
          notify(
            sendToWindow,
            browserWindow,
            'Téléchargement YouTube lancé.',
            'success',
          );
          return;
        }

        notify(
          sendToWindow,
          browserWindow,
          result?.message || 'Le téléchargement YouTube a échoué.',
          'error',
        );
      } catch (error) {
        notify(
          sendToWindow,
          browserWindow,
          `Téléchargement YouTube impossible : ${error.message}`,
          'error',
        );
      }
    })();
  };

  /**
   * Copie une URL média et confirme l'action.
   * @param {string} url
   */
  const copyMediaUrl = (url) => {
    clipboard.writeText(url);
    notify(
      sendToWindow,
      browserWindow,
      'Lien du média copié.',
      'success',
    );
  };

  if (youtubeUrl) {
    template.push(
      {
        label: 'Télécharger la vidéo YouTube (yt-dlp)',
        click: () => downloadWithYtDlp(youtubeUrl),
      },
      { type: 'separator' },
    );
  }

  if (linkUrl) {
    const mediaLink = isMediaLinkUrl(linkUrl);

    template.push({
      label: 'Ouvrir le lien dans un nouvel onglet',
      click: () =>
        sendToWindow(browserWindow, IPC.OPEN_URL_IN_NEW_TAB, linkUrl),
    });

    if (mediaLink) {
      template.push(
        {
          label: 'Télécharger le média',
          click: () => downloadMedia(linkUrl),
        },
        {
          label: 'Copier le lien du média',
          click: () => copyMediaUrl(linkUrl),
        },
      );
    } else {
      template.push({
        label: "Copier l'adresse du lien",
        click: () => clipboard.writeText(linkUrl),
      });
    }

    template.push({ type: 'separator' });
  }

  if (resolvedMediaPair) {
    template.push({
      label: 'Télécharger la vidéo complète (audio + vidéo)',
      click: () => downloadMergedMedia(resolvedMediaPair),
    });

    if (!mediaUrl) {
      template.push({ type: 'separator' });
    }
  }

  if (mediaUrl && params.mediaType !== 'none') {
    const isImage = params.mediaType === 'image';
    const isSameAsLink = linkUrl === mediaUrl;

    if (isImage) {
      template.push(
        {
          label: "Copier l'image",
          click: () => guest.copyImageAt(params.x, params.y),
        },
        {
          label: "Copier l'adresse de l'image",
          click: () => clipboard.writeText(mediaUrl),
        },
        {
          label: "Télécharger l'image",
          click: () => downloadMedia(mediaUrl),
        },
      );
    } else if (!isSameAsLink) {
      template.push(
        {
          label: 'Télécharger le média',
          click: () => downloadMedia(mediaUrl),
        },
        {
          label: 'Copier le lien du média',
          click: () => copyMediaUrl(mediaUrl),
        },
      );
    }

    if (isImage || !isSameAsLink) {
      template.push({
        label: 'Ouvrir le média dans un nouvel onglet',
        click: () =>
          sendToWindow(browserWindow, IPC.OPEN_URL_IN_NEW_TAB, mediaUrl),
      });
      template.push({ type: 'separator' });
    }
  }

  if (selectedText) {
    template.push(
      {
        label: 'Copier',
        click: () => clipboard.writeText(selectedText),
      },
      { type: 'separator' },
    );
  }

  if (params.isEditable) {
    const editFlags = params.editFlags || {};

    template.push(
      {
        label: 'Annuler',
        enabled: editFlags.canUndo !== false,
        click: () => guest.undo(),
      },
      {
        label: 'Rétablir',
        enabled: editFlags.canRedo !== false,
        click: () => guest.redo(),
      },
      { type: 'separator' },
      {
        label: 'Couper',
        enabled: editFlags.canCut !== false,
        click: () => guest.cut(),
      },
      {
        label: 'Copier',
        enabled: editFlags.canCopy !== false,
        click: () => guest.copy(),
      },
      {
        label: 'Coller',
        enabled: editFlags.canPaste !== false,
        click: () => guest.paste(),
      },
      {
        label: 'Tout sélectionner',
        enabled: editFlags.canSelectAll !== false,
        click: () => guest.selectAll(),
      },
      { type: 'separator' },
    );
  }

  template.push(
    {
      label: 'Précédent',
      enabled: canGoBack(guest),
      click: () => guest.goBack(),
    },
    {
      label: 'Suivant',
      enabled: canGoForward(guest),
      click: () => guest.goForward(),
    },
    {
      label: 'Actualiser',
      click: () => guest.reload(),
    },
    { type: 'separator' },
    {
      label: 'Inspecter',
      click: () => guest.inspectElement(params.x, params.y),
    },
  );

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: browserWindow });
}

/**
 * Branche le menu contextuel sur une webview invitée.
 * @param {object} options
 * @param {Electron.BrowserWindow} options.browserWindow
 * @param {Electron.WebContents} options.guest
 * @param {(browserWindow: Electron.BrowserWindow, channel: string, payload?: unknown) => void} options.sendToWindow
 * @param {(payload: object) => Promise<object> | object} [options.onDownloadMedia]
 * @param {(guest: Electron.WebContents, params: Electron.ContextMenuParams) => string | null} [options.resolveMediaUrl]
 * @param {(guest: Electron.WebContents, params: Electron.ContextMenuParams) => object | null} [options.resolveMediaPair]
 */
function attachContextMenu({
  browserWindow,
  guest,
  sendToWindow,
  onDownloadMedia,
  resolveMediaUrl,
  resolveMediaPair,
}) {
  guest.on('context-menu', (_event, params) => {
    try {
      showPageContextMenu({
        browserWindow,
        guest,
        params,
        sendToWindow,
        onDownloadMedia,
        resolveMediaUrl,
        resolveMediaPair,
      });
    } catch (error) {
      console.warn('[Menu contextuel] Ouverture impossible :', error.message);
    }
  });
}

module.exports = { attachContextMenu };
