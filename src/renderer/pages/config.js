'use strict';

/**
 * Think-Browser — logique de la page `about:config`.
 *
 * Cette page n'a ni preload ni accès Node.js. Toutes les opérations passent
 * par les routes same-origin du protocole `think-page`, validées dans le
 * processus principal.
 */

const el = (id) => document.getElementById(id);

const elements = {
  pills: el('config-pills'),
  status: el('config-status'),
  searchEngine: el('search-engine'),
  homeMode: el('home-mode'),
  homeUrlField: el('home-url-field'),
  homeUrl: el('home-url'),
  theme: el('theme'),
  themeHint: el('theme-hint'),
  language: el('language'),
  languageHint: el('language-hint'),
  zoom: el('zoom'),
  zoomValue: el('zoom-value'),
  downloadDir: el('download-dir'),
  chooseDownloadDir: el('choose-download-dir'),
  streamConcurrency: el('stream-concurrency'),
  streamHint: el('stream-hint'),
  linkReferer: el('link-referer'),
  mediaCapabilities: el('media-capabilities'),
  directUrl: el('direct-url'),
  directInspect: el('direct-inspect'),
  directHint: el('direct-hint'),
  directResult: el('direct-result'),
  directActions: el('direct-actions'),
  directDownload: el('direct-download'),
  extensionsList: el('extensions-list'),
  extensionsCount: el('extensions-count'),
  saveHistory: el('save-history'),
  restoreSession: el('restore-session'),
  adblockEnabled: el('adblock-enabled'),
  adblockStatus: el('adblock-status'),
  appVersion: el('app-version'),
  appElectron: el('app-electron'),
  appChrome: el('app-chrome'),
  appNode: el('app-node'),
  appUserAgent: el('app-user-agent'),
  resetSettings: el('reset-settings'),
  refreshConfig: el('refresh-config'),
  maintenanceStatus: el('maintenance-status'),
};

/** @type {object | null} */
let state = null;

/** @type {object | null} */
let inspectedLink = null;

/** @type {HTMLSelectElement | null} */
let directAudioSelect = null;

/** @type {HTMLSelectElement | null} */
let directSubtitleSelect = null;

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

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.message || `Erreur ${response.status}.`);
  }

  return data;
}

/**
 * Affiche un message d'état.
 * @param {string} message
 * @param {string} [variant]
 * @param {HTMLElement} [target]
 */
function setStatus(message, variant = '', target = elements.status) {
  if (!target) {
    return;
  }

  target.textContent = message;
  target.className = `status${variant ? ` status--${variant}` : ''}`;
}

/**
 * Formate un nombre d'octets.
 * @param {number} value
 * @returns {string}
 */
function formatBytes(value) {
  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'taille inconnue';
  }

  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let amount = bytes;
  let unit = 0;

  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }

  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * Remplit un select avec des options.
 * @param {HTMLSelectElement} select
 * @param {object[]} items
 * @param {(item: object) => string} label
 */
function fillSelect(select, items, label) {
  select.replaceChildren();

  for (const item of items) {
    const option = document.createElement('option');
    option.value = String(item.id);
    option.textContent = label(item);
    select.append(option);
  }
}

/**
 * Indique si une extension est active.
 * @param {string} id
 * @returns {boolean}
 */
function isExtensionEnabled(id) {
  return Boolean(
    state?.extensions?.extensions?.find((extension) => extension.id === id)
      ?.enabled,
  );
}

/**
 * Construit une pastille.
 * @param {string} label
 * @param {string} [variant]
 * @returns {HTMLSpanElement}
 */
function createPill(label, variant = '') {
  const pill = document.createElement('span');
  pill.className = `pill${variant ? ` pill--${variant}` : ''}`;
  pill.textContent = label;
  return pill;
}

/**
 * Affiche les capacités ffmpeg/ffprobe.
 */
function renderCapabilities() {
  elements.mediaCapabilities.replaceChildren();

  const ffmpeg = Boolean(state?.capabilities?.ffmpeg);
  const ffprobe = Boolean(state?.capabilities?.ffprobe);

  elements.mediaCapabilities.append(
    createPill(
      ffmpeg ? 'ffmpeg disponible' : 'ffmpeg indisponible',
      ffmpeg ? 'ok' : 'danger',
    ),
    createPill(
      ffprobe ? 'ffprobe disponible' : 'ffprobe indisponible',
      ffprobe ? 'ok' : 'warn',
    ),
  );
}

/**
 * Affiche la liste des extensions intégrées.
 */
function renderExtensions() {
  elements.extensionsList.replaceChildren();

  const extensions = state?.extensions?.extensions || [];
  const enabledCount = extensions.filter((extension) => extension.enabled).length;

  elements.extensionsCount.textContent = `${enabledCount}/${extensions.length} active(s)`;

  if (extensions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Aucune extension intégrée.';
    elements.extensionsList.append(empty);
    return;
  }

  for (const extension of extensions) {
    const item = document.createElement('div');
    item.className = 'ext-item';

    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${extension.name} · ${extension.version}`;
    const description = document.createElement('p');
    description.textContent = extension.description;
    text.append(title, description);

    const label = document.createElement('label');
    label.className = 'switch';
    label.title = extension.enabled ? 'Désactiver' : 'Activer';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(extension.enabled);
    input.setAttribute(
      'aria-label',
      `${extension.enabled ? 'Désactiver' : 'Activer'} ${extension.name}`,
    );
    input.addEventListener('change', async () => {
      input.disabled = true;

      try {
        const result = await request('/api/extension', {
          method: 'POST',
          body: JSON.stringify({
            id: extension.id,
            enabled: input.checked,
          }),
        });
        state = result.state;
        render();
        setStatus(
          `Extension ${input.checked ? 'activée' : 'désactivée'}.`,
          'ok',
        );
      } catch (error) {
        input.checked = !input.checked;
        setStatus(error.message, 'error');
      } finally {
        input.disabled = false;
      }
    });

    const track = document.createElement('span');
    label.append(input, track);
    item.append(text, label);
    elements.extensionsList.append(item);
  }
}

/**
 * Met à jour l'affichage à partir de l'état du processus principal.
 */
function render() {
  if (!state) {
    return;
  }

  const settings = state.settings;
  const themeEnabled = isExtensionEnabled('think.theme');
  const languageEnabled = isExtensionEnabled('think.language');

  fillSelect(
    elements.searchEngine,
    state.searchEngines || [],
    (engine) => engine.label || engine.id,
  );
  elements.searchEngine.value = settings.searchEngine;

  elements.homeMode.value = settings.homePageMode;
  elements.homeUrl.value = settings.homePageUrl || '';
  elements.homeUrlField.hidden = settings.homePageMode !== 'custom';

  fillSelect(
    elements.theme,
    state.extensions?.themes || [],
    (theme) => theme.label || theme.id,
  );
  elements.theme.value = settings.theme;
  elements.theme.disabled = !themeEnabled;
  elements.themeHint.textContent = themeEnabled
    ? 'Le thème s’applique immédiatement à l’interface hôte.'
    : 'Activez l’extension Thèmes pour choisir un thème.';

  fillSelect(
    elements.language,
    state.extensions?.languages || [],
    (language) => language.label || language.id,
  );
  elements.language.value = settings.language;
  elements.language.disabled = !languageEnabled;
  elements.languageHint.textContent = languageEnabled
    ? 'La couverture de la traduction est progressive.'
    : 'Activez l’extension Langues pour changer la langue.';

  const zoomPercent = Math.round(Number(settings.defaultZoom || 1) * 100);
  elements.zoom.value = String(zoomPercent);
  elements.zoomValue.textContent = `${zoomPercent} %`;

  elements.downloadDir.value = settings.downloadDir || '';
  elements.streamConcurrency.value = String(
    settings.maxStreamDownloads || 2,
  );
  elements.streamConcurrency.min = String(state.limits.minStreamDownloads);
  elements.streamConcurrency.max = String(state.limits.maxStreamDownloads);
  elements.streamHint.textContent =
    `${state.limits.minStreamDownloads} à ${state.limits.maxStreamDownloads} ` +
    'téléchargements ffmpeg simultanés. Les autres flux attendent dans une file.';

  elements.linkReferer.checked = settings.linkDownloadReferer !== false;
  elements.saveHistory.checked = settings.saveHistory !== false;
  elements.restoreSession.checked = settings.restoreSession !== false;
  elements.adblockEnabled.checked = settings.adBlockEnabled !== false;

  elements.adblockStatus.textContent = state.adBlockActive
    ? 'Moteur AdBlock actif sur les sessions configurées.'
    : 'Moteur AdBlock inactif ou filtres non chargés.';
  elements.adblockStatus.className = `field__hint ${
    state.adBlockActive ? 'status--ok' : 'status--error'
  }`;

  renderCapabilities();
  renderExtensions();

  elements.appVersion.textContent = state.app.version || '—';
  elements.appElectron.textContent = state.app.electron || '—';
  elements.appChrome.textContent = state.app.chrome || '—';
  elements.appNode.textContent = state.app.node || '—';
  elements.appUserAgent.textContent = state.userAgent || '—';

  elements.pills.replaceChildren(
    createPill(state.private ? 'Fenêtre privée' : 'Session normale'),
    createPill(
      state.adBlockActive ? 'AdBlock actif' : 'AdBlock inactif',
      state.adBlockActive ? 'ok' : 'warn',
    ),
    createPill(
      state.capabilities?.ffmpeg ? 'ffmpeg prêt' : 'ffmpeg absent',
      state.capabilities?.ffmpeg ? 'ok' : 'danger',
    ),
  );

  if (state.private) {
    elements.directHint.textContent =
      'Analyse possible depuis cette fenêtre privée. Le téléchargement ' +
      'direct doit être lancé depuis le menu de la fenêtre pour rester ' +
      'confiné à la partition privée.';
  }
}

/**
 * Charge l'état initial.
 */
async function load() {
  try {
    state = await request('/api/state');
    render();
    setStatus('Configuration chargée.', 'ok');
  } catch (error) {
    setStatus(`Chargement impossible : ${error.message}`, 'error');
  }
}

/**
 * Enregistre un patch de paramètres.
 * @param {object} patch
 * @param {string} successMessage
 */
async function updateSettings(patch, successMessage) {
  setStatus('Enregistrement…');

  try {
    const result = await request('/api/update', {
      method: 'POST',
      body: JSON.stringify(patch),
    });
    state = result.state;
    render();
    setStatus(successMessage, 'ok');
  } catch (error) {
    setStatus(error.message, 'error');
    render();
  }
}

/**
 * Construit un champ de sélection de piste.
 * @param {string} label
 * @param {object[]} tracks
 * @param {string} emptyLabel
 * @returns {HTMLSelectElement}
 */
function createTrackSelect(label, tracks, emptyLabel) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';

  const caption = document.createElement('label');
  caption.textContent = label;

  const select = document.createElement('select');
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = emptyLabel;
  select.append(empty);

  for (const track of tracks) {
    const option = document.createElement('option');
    option.value = String(track.index);
    const language = String(track.language || '').toUpperCase();
    const codec = String(track.codec || '').toUpperCase();
    const channels =
      Number(track.channels) === 1
        ? 'mono'
        : Number(track.channels) === 2
          ? 'stéréo'
          : Number(track.channels) > 2
            ? `${track.channels} canaux`
            : '';
    option.textContent = [
      language || track.title || `Piste ${track.index}`,
      track.title && track.title !== language ? track.title : '',
      [codec, channels].filter(Boolean).join(' · '),
    ]
      .filter(Boolean)
      .join(' — ');
    select.append(option);
  }

  const id = `track-${Math.random().toString(16).slice(2)}`;
  caption.htmlFor = id;
  select.id = id;
  wrapper.append(caption, select);
  elements.directResult.append(wrapper);
  return select;
}

/**
 * Affiche le résultat d'analyse d'un lien.
 * @param {object} result
 */
function renderLinkResult(result) {
  inspectedLink = result;
  elements.directResult.replaceChildren();
  elements.directActions.hidden = true;
  directAudioSelect = null;
  directSubtitleSelect = null;

  if (!result?.ok) {
    elements.directResult.hidden = false;
    const message = document.createElement('p');
    message.textContent = result?.message || 'Analyse impossible.';
    elements.directResult.append(message);
    return;
  }

  elements.directResult.hidden = false;

  const title = document.createElement('strong');
  title.textContent = result.filename || 'Lien média';
  const meta = document.createElement('p');
  const type = result.streamType
    ? result.streamType.toUpperCase()
    : result.isMedia
      ? 'Fichier média'
      : 'Fichier';
  meta.textContent = [
    type,
    result.contentType || 'type inconnu',
    formatBytes(result.contentLength),
    result.isLive ? 'flux en direct' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  elements.directResult.append(title, meta);

  if (result.message) {
    const warning = document.createElement('p');
    warning.className = 'muted';
    warning.textContent = result.message;
    elements.directResult.append(warning);
  }

  const metadata = result.metadata || {};
  const audioTracks = Array.isArray(metadata.audioTracks)
    ? metadata.audioTracks
    : [];
  const subtitleTracks = Array.isArray(metadata.subtitleTracks)
    ? metadata.subtitleTracks
    : [];

  if (result.streamType && audioTracks.length > 1) {
    directAudioSelect = createTrackSelect(
      'Piste audio',
      audioTracks,
      'Piste audio par défaut',
    );
  }

  if (result.streamType && subtitleTracks.length > 0) {
    directSubtitleSelect = createTrackSelect(
      'Sous-titres',
      subtitleTracks,
      'Aucun sous-titre',
    );
  }

  elements.directDownload.textContent = result.streamType
    ? 'Télécharger ce flux'
    : 'Télécharger ce fichier';
  elements.directActions.hidden = false;
}

/**
 * Analyse le lien saisi.
 */
async function inspectLink() {
  const url = elements.directUrl.value.trim();

  if (!url) {
    setStatus('Saisissez un lien HTTP(S).', 'error');
    return;
  }

  elements.directInspect.disabled = true;
  elements.directResult.hidden = true;
  elements.directActions.hidden = true;
  setStatus('Analyse du lien…');

  try {
    const result = await request('/api/inspect-link', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
    renderLinkResult(result);
    setStatus(
      result.isMedia
        ? 'Lien analysé. Vérifiez le nom et les pistes avant de télécharger.'
        : 'Lien accessible, mais il ne ressemble pas à un média.',
      result.isMedia ? 'ok' : '',
    );
  } catch (error) {
    renderLinkResult({ ok: false, message: error.message });
    setStatus(error.message, 'error');
  } finally {
    elements.directInspect.disabled = false;
  }
}

/**
 * Démarre le téléchargement du lien analysé.
 */
async function startLinkDownload() {
  if (!inspectedLink?.ok) {
    return;
  }

  elements.directDownload.disabled = true;
  setStatus('Démarrage du téléchargement…');

  try {
    const result = await request('/api/start-link', {
      method: 'POST',
      body: JSON.stringify({
        url: inspectedLink.url,
        audioStreamIndex: directAudioSelect?.value
          ? Number(directAudioSelect.value)
          : null,
        subtitleStreamIndex: directSubtitleSelect?.value
          ? Number(directSubtitleSelect.value)
          : null,
        isLive: Boolean(inspectedLink.isLive),
      }),
    });

    setStatus(
      result.queued
        ? 'Flux ajouté à la file de téléchargement.'
        : 'Téléchargement démarré. Suivez sa progression dans le panneau Téléchargements.',
      'ok',
    );
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    elements.directDownload.disabled = false;
  }
}

/**
 * Installe les interactions.
 */
function bindEvents() {
  elements.searchEngine.addEventListener('change', () =>
    updateSettings(
      { searchEngine: elements.searchEngine.value },
      'Moteur de recherche enregistré.',
    ),
  );

  elements.homeMode.addEventListener('change', async () => {
    await updateSettings(
      { homePageMode: elements.homeMode.value },
      'Mode de page d’accueil enregistré.',
    );

    if (elements.homeMode.value === 'custom') {
      elements.homeUrl.focus();
    }
  });

  elements.homeUrl.addEventListener('change', () =>
    updateSettings(
      { homePageUrl: elements.homeUrl.value.trim() },
      'Page d’accueil enregistrée.',
    ),
  );

  elements.theme.addEventListener('change', () =>
    updateSettings(
      { theme: elements.theme.value },
      'Thème enregistré.',
    ),
  );

  elements.language.addEventListener('change', () =>
    updateSettings(
      { language: elements.language.value },
      'Langue enregistrée.',
    ),
  );

  elements.zoom.addEventListener('input', () => {
    elements.zoomValue.textContent = `${elements.zoom.value} %`;
  });

  elements.zoom.addEventListener('change', () =>
    updateSettings(
      { defaultZoom: Number(elements.zoom.value) / 100 },
      'Zoom par défaut enregistré.',
    ),
  );

  elements.chooseDownloadDir.addEventListener('click', async () => {
    elements.chooseDownloadDir.disabled = true;

    try {
      const result = await request('/api/choose-download-dir', {
        method: 'POST',
        body: '{}',
      });

      if (result.canceled) {
        setStatus('Sélection annulée.');
      } else {
        state = result.state;
        render();
        setStatus('Dossier de téléchargement enregistré.', 'ok');
      }
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      elements.chooseDownloadDir.disabled = false;
    }
  });

  elements.streamConcurrency.addEventListener('change', () => {
    const value = Number(elements.streamConcurrency.value);

    updateSettings(
      { maxStreamDownloads: value },
      'Limite de flux simultanés enregistrée.',
    );
  });

  elements.linkReferer.addEventListener('change', () =>
    updateSettings(
      { linkDownloadReferer: elements.linkReferer.checked },
      'Réglage du Referer enregistré.',
    ),
  );

  elements.saveHistory.addEventListener('change', () =>
    updateSettings(
      { saveHistory: elements.saveHistory.checked },
      'Réglage de l’historique enregistré.',
    ),
  );

  elements.restoreSession.addEventListener('change', () =>
    updateSettings(
      { restoreSession: elements.restoreSession.checked },
      'Restauration de session enregistrée.',
    ),
  );

  elements.adblockEnabled.addEventListener('change', () =>
    updateSettings(
      { adBlockEnabled: elements.adblockEnabled.checked },
      'Réglage AdBlock enregistré.',
    ),
  );

  elements.refreshConfig.addEventListener('click', () => void load());

  elements.resetSettings.addEventListener('click', async () => {
    const confirmed = window.confirm(
      'Réinitialiser toutes les préférences ? Le dossier de téléchargement ' +
        'et l’espace de développement sont conservés.',
    );

    if (!confirmed) {
      return;
    }

    elements.resetSettings.disabled = true;
    setStatus('Réinitialisation…', '', elements.maintenanceStatus);

    try {
      const result = await request('/api/reset-settings', {
        method: 'POST',
        body: '{}',
      });
      state = result.state;
      render();
      setStatus('Préférences réinitialisées.', 'ok', elements.maintenanceStatus);
      setStatus('Préférences réinitialisées.', 'ok');
    } catch (error) {
      setStatus(error.message, 'error', elements.maintenanceStatus);
    } finally {
      elements.resetSettings.disabled = false;
    }
  });

  elements.directInspect.addEventListener('click', () => void inspectLink());
  elements.directDownload.addEventListener('click', () =>
    void startLinkDownload(),
  );

  elements.directUrl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void inspectLink();
    }
  });
}

bindEvents();
void load();
