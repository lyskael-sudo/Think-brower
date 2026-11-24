'use strict';

/**
 * Think-Browser — logique de la page `about:security`.
 *
 * Les cookies sont affichés localement, masqués par défaut, et ne quittent
 * jamais le processus principal. Les actions destructives demandent une
 * confirmation et sont exécutées dans la session courante.
 */

const el = (id) => document.getElementById(id);

const elements = {
  pills: el('security-pills'),
  status: el('security-status'),
  generated: el('security-generated'),
  refresh: el('refresh-security'),
  statCookies: el('stat-cookies'),
  statPermissions: el('stat-permissions'),
  statCache: el('stat-cache'),
  statDownloads: el('stat-downloads'),
  posture: el('posture-list'),
  cookieIssues: el('cookie-issues'),
  cookieIssueCount: el('cookie-issue-count'),
  permissionRisks: el('permission-risks'),
  permissionRiskCount: el('permission-risk-count'),
  httpRisks: el('http-risks'),
  httpRiskCount: el('http-risk-count'),
  clearCookies: el('clear-cookies'),
  clearData: el('clear-data'),
  resetPermissions: el('reset-permissions'),
  clearHistory: el('clear-history'),
  actionStatus: el('action-status'),
  version: el('security-version'),
  electron: el('security-electron'),
  chrome: el('security-chrome'),
  node: el('security-node'),
  cookiesCount: el('cookies-count'),
  cookieFilter: el('cookie-filter'),
  revealCookies: el('reveal-cookies'),
  cookiesBody: el('cookies-body'),
  cookiesEmpty: el('cookies-empty'),
  downloads: el('security-downloads'),
  notices: el('security-notices'),
  noticesVersion: el('notices-version'),
  limitations: el('security-limitations'),
  updatePolicy: el('security-update-policy'),
  reportPolicy: el('security-report-policy'),
  telemetryPolicy: el('security-telemetry-policy'),
};

/** @type {object | null} */
let summary = null;

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
 * Affiche un message.
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
    return '0 o';
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
 * Formate une date.
 * @param {string | number | null} value
 * @returns {string}
 */
function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date =
    typeof value === 'number' ? new Date(value * 1000) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
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
 * Construit un message de signal.
 * @param {string} title
 * @param {string} detail
 * @param {boolean} [danger]
 * @returns {HTMLLIElement}
 */
function createSignal(title, detail, danger = false) {
  const item = document.createElement('li');
  item.className = `signal${danger ? ' signal--danger' : ''}`;
  const strong = document.createElement('strong');
  strong.textContent = title;
  const text = document.createElement('p');
  text.textContent = detail;
  item.append(strong, text);
  return item;
}

/**
 * Affiche les contrôles de posture.
 */
function renderPosture() {
  elements.posture.replaceChildren();

  for (const check of summary?.posture?.checks || []) {
    const item = document.createElement('li');
    item.className = `check-item check-item--${check.status || 'info'}`;
    const dot = document.createElement('span');
    dot.className = 'check-item__dot';
    dot.setAttribute('aria-hidden', 'true');

    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = check.label;
    const detail = document.createElement('p');
    detail.textContent = check.detail;
    content.append(title, detail);
    item.append(dot, content);
    elements.posture.append(item);
  }
}

/**
 * Affiche les signaux d'insécurité.
 */
function renderSignals() {
  const analysis = summary?.cookieAnalysis || {};
  const issues = Array.isArray(analysis.issues) ? analysis.issues : [];
  const permissionRisks = Array.isArray(summary?.permissionRisks)
    ? summary.permissionRisks
    : [];
  const httpHistory = Array.isArray(summary?.httpHistory)
    ? summary.httpHistory
    : [];

  elements.cookieIssueCount.textContent = String(issues.length);
  elements.cookieIssueCount.className = `pill${
    issues.length > 0 ? ' pill--warn' : ' pill--ok'
  }`;
  elements.cookieIssues.replaceChildren();

  if (issues.length === 0) {
    elements.cookieIssues.append(
      createSignal(
        'Aucun signal cookie évident',
        'Aucun cookie sans Secure, SameSite=None incohérent ou nom ' +
          'd’authentification accessible au JavaScript n’a été détecté.',
      ),
    );
  } else {
    for (const issue of issues) {
      elements.cookieIssues.append(
        createSignal(
          `${issue.domain} · ${issue.name || '(sans nom)'}`,
          issue.reasons.join(' · '),
          true,
        ),
      );
    }
  }

  elements.permissionRiskCount.textContent = String(permissionRisks.length);
  elements.permissionRiskCount.className = `pill${
    permissionRisks.length > 0 ? ' pill--warn' : ' pill--ok'
  }`;
  elements.permissionRisks.replaceChildren();

  if (permissionRisks.length === 0) {
    elements.permissionRisks.append(
      createSignal(
        'Aucune permission sensible accordée',
        'Les demandes de caméra, microphone, géolocalisation et autres ' +
          'permissions sensibles n’ont pas été mémorisées comme acceptées.',
      ),
    );
  } else {
    for (const risk of permissionRisks) {
      elements.permissionRisks.append(
        createSignal(
          `${risk.origin}`,
          `${risk.label} (${risk.permission})`,
          true,
        ),
      );
    }
  }

  elements.httpRiskCount.textContent = String(httpHistory.length);
  elements.httpRiskCount.className = `pill${
    httpHistory.length > 0 ? ' pill--warn' : ' pill--ok'
  }`;
  elements.httpRisks.replaceChildren();

  if (httpHistory.length === 0) {
    elements.httpRisks.append(
      createSignal(
        'Aucune connexion HTTP récente',
        'L’historique récent ne contient pas de page HTTP non locale.',
      ),
    );
  } else {
    for (const entry of httpHistory) {
      elements.httpRisks.append(
        createSignal(entry.host, entry.url, true),
      );
    }
  }
}

/**
 * Construit une cellule de tableau.
 * @param {string} text
 * @returns {HTMLTableCellElement}
 */
function cell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

/**
 * Affiche les cookies filtrés.
 */
function renderCookies() {
  if (!summary) {
    return;
  }

  const filter = elements.cookieFilter.value.trim().toLowerCase();
  const reveal = elements.revealCookies.checked;
  const cookies = (summary.cookies || []).filter((cookie) => {
    if (!filter) {
      return true;
    }

    return `${cookie.domain} ${cookie.name}`.toLowerCase().includes(filter);
  });

  elements.cookiesBody.replaceChildren();
  elements.cookiesCount.textContent = `${summary.counts.cookies} cookie(s)`;
  elements.cookiesEmpty.hidden = cookies.length > 0;

  for (const cookie of cookies) {
    const row = document.createElement('tr');

    const domain = document.createElement('td');
    const domainName = document.createElement('strong');
    domainName.textContent = cookie.domain || '—';
    domain.append(domainName);

    const name = cell(cookie.name || '(sans nom)');
    const value = document.createElement('td');
    value.className = `cookie-value${reveal ? ' is-revealed' : ''}`;
    value.textContent = reveal
      ? `${cookie.value || ''}${cookie.valueTruncated ? '…' : ''}`
      : '••••••••';
    value.title = reveal ? '' : 'Valeur masquée';

    const secure = document.createElement('td');
    const secureTag = document.createElement('span');
    secureTag.className = `tag${cookie.secure ? ' tag--ok' : ' tag--warn'}`;
    secureTag.textContent = cookie.secure ? 'oui' : 'non';
    secure.append(secureTag);

    const httpOnly = document.createElement('td');
    const httpOnlyTag = document.createElement('span');
    httpOnlyTag.className = `tag${cookie.httpOnly ? ' tag--ok' : ''}`;
    httpOnlyTag.textContent = cookie.httpOnly ? 'oui' : 'non';
    httpOnly.append(httpOnlyTag);

    const sameSite = cell(cookie.sameSite || 'unspecified');
    const expiration = cell(
      cookie.session ? 'Session' : formatDate(cookie.expirationDate),
    );

    const action = document.createElement('td');
    const remove = document.createElement('button');
    remove.className = 'btn btn--small btn--danger';
    remove.type = 'button';
    remove.textContent = 'Supprimer';
    remove.addEventListener('click', () =>
      void deleteCookie(cookie, remove),
    );
    action.append(remove);

    row.append(
      domain,
      name,
      value,
      secure,
      httpOnly,
      sameSite,
      expiration,
      action,
    );
    elements.cookiesBody.append(row);
  }
}

/**
 * Affiche les téléchargements récents.
 */
function renderDownloads() {
  elements.downloads.replaceChildren();
  const downloads = summary?.recentDownloads || [];

  if (summary?.private) {
    elements.downloads.append(
      createSignal(
        'Téléchargements privés non listés',
        'Cette page ne consulte pas les téléchargements de la session ' +
          'normale. Les téléchargements privés restent éphémères et ne sont ' +
          'pas exposés ici.',
      ),
    );
    return;
  }

  if (downloads.length === 0) {
    elements.downloads.append(
      createSignal(
        'Aucun téléchargement récent',
        'Les fichiers et flux enregistrés apparaîtront ici.',
      ),
    );
    return;
  }

  for (const record of downloads) {
    const state =
      record.state === 'completed'
        ? 'terminé'
        : record.state === 'cancelled'
          ? 'annulé'
          : record.state === 'queued'
            ? 'en attente'
            : 'interrompu';
    const detail = [
      state,
      record.kind === 'stream' ? 'flux' : 'fichier',
      formatBytes(record.totalBytes),
      record.endedAt ? formatDate(record.endedAt) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    elements.downloads.append(
      createSignal(record.filename || 'Téléchargement', detail),
    );
  }
}

/**
 * Affiche les avis locaux, les limites et la politique de mise à jour.
 */
function renderNotices() {
  const data = summary?.securityNotices || {};
  elements.notices.replaceChildren();
  elements.limitations.replaceChildren();

  elements.noticesVersion.textContent = data.version
    ? `Avis ${data.version}`
    : 'Avis locaux';

  for (const notice of data.notices || []) {
    const detail = [
      notice.detail,
      notice.mitigation ? `Atténuation : ${notice.mitigation}` : '',
      notice.affected ? `Versions concernées : ${notice.affected}.` : '',
      notice.status ? `Statut : ${notice.status}.` : '',
    ]
      .filter(Boolean)
      .join(' ');

    elements.notices.append(
      createSignal(
        `${notice.id} · ${notice.title} · ${notice.severity}`,
        detail,
        /élevée|critique/i.test(notice.severity || ''),
      ),
    );
  }

  if (!(data.notices || []).length) {
    elements.notices.append(
      createSignal(
        'Aucun avis local',
        'Cette version ne fournit pas de liste d’avis embarquée.',
      ),
    );
  }

  for (const limitation of data.limitations || []) {
    const item = document.createElement('li');
    item.textContent = limitation;
    elements.limitations.append(item);
  }

  elements.updatePolicy.textContent = data.policy?.update || '—';
  elements.reportPolicy.textContent = data.policy?.reporting || '—';
  elements.telemetryPolicy.textContent = data.policy?.telemetry || '—';
}

/**
 * Met à jour toute la page.
 */
function render() {
  if (!summary) {
    return;
  }

  const counts = summary.counts || {};
  elements.generated.textContent = `Généré le ${formatDate(
    summary.generatedAt,
  )}`;
  elements.statCookies.textContent = String(counts.cookies || 0);
  elements.statPermissions.textContent = String(
    summary.permissionRisks?.length || 0,
  );
  elements.statCache.textContent = formatBytes(counts.cacheBytes);
  elements.statDownloads.textContent = String(counts.recentDownloads || 0);

  elements.pills.replaceChildren(
    createPill(summary.private ? 'Fenêtre privée' : 'Session normale'),
    createPill(
      `${counts.cookies || 0} cookie(s)`,
      (counts.cookies || 0) > 0 ? 'warn' : 'ok',
    ),
    createPill(
      summary.posture?.adBlockActive ? 'AdBlock actif' : 'AdBlock inactif',
      summary.posture?.adBlockActive ? 'ok' : 'warn',
    ),
  );

  elements.version.textContent = summary.app?.version || '—';
  elements.electron.textContent = summary.app?.electron || '—';
  elements.chrome.textContent = summary.app?.chrome || '—';
  elements.node.textContent = summary.app?.node || '—';

  renderPosture();
  renderSignals();
  renderCookies();
  renderDownloads();
  renderNotices();
}

/**
 * Charge la synthèse.
 */
async function load() {
  elements.refresh.disabled = true;
  setStatus('Lecture des données de sécurité…');

  try {
    summary = await request('/api/summary');
    render();
    setStatus('Données actualisées.', 'ok');
  } catch (error) {
    setStatus(`Lecture impossible : ${error.message}`, 'error');
  } finally {
    elements.refresh.disabled = false;
  }
}

/**
 * Exécute une action de nettoyage.
 * @param {object} payload
 * @param {string} message
 * @param {string} confirmation
 * @param {HTMLButtonElement} button
 */
async function runAction(payload, message, confirmation, button) {
  if (!window.confirm(confirmation)) {
    return;
  }

  button.disabled = true;
  setStatus('Action en cours…', '', elements.actionStatus);

  try {
    const result = await request('/api/action', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStatus(result.message || message, 'ok', elements.actionStatus);
    await load();
  } catch (error) {
    setStatus(error.message, 'error', elements.actionStatus);
  } finally {
    button.disabled = false;
  }
}

/**
 * Supprime un cookie précis.
 * @param {object} cookie
 * @param {HTMLButtonElement} button
 */
async function deleteCookie(cookie, button) {
  await runAction(
    {
      action: 'delete-cookie',
      domain: cookie.domain,
      name: cookie.name,
      path: cookie.path || '/',
      secure: Boolean(cookie.secure),
    },
    'Cookie supprimé.',
    `Supprimer le cookie « ${cookie.name} » de ${cookie.domain} ?`,
    button,
  );
}

/**
 * Installe les interactions.
 */
function bindEvents() {
  elements.refresh.addEventListener('click', () => void load());
  elements.cookieFilter.addEventListener('input', renderCookies);
  elements.revealCookies.addEventListener('change', renderCookies);

  elements.clearCookies.addEventListener('click', () =>
    void runAction(
      { action: 'clear-cookies' },
      'Cookies supprimés.',
      'Supprimer tous les cookies de cette session ? Les sites vous ' +
        'déconnecteront.',
      elements.clearCookies,
    ),
  );

  elements.clearData.addEventListener('click', () =>
    void runAction(
      { action: 'clear-data' },
      'Données de navigation effacées.',
      'Effacer cookies, cache, stockages locaux et service workers de cette ' +
        'session ? Cette action est irréversible.',
      elements.clearData,
    ),
  );

  elements.resetPermissions.addEventListener('click', () =>
    void runAction(
      { action: 'reset-permissions' },
      'Permissions réinitialisées.',
      'Réinitialiser toutes les autorisations accordées aux sites ?',
      elements.resetPermissions,
    ),
  );

  elements.clearHistory.addEventListener('click', () =>
    void runAction(
      { action: 'clear-history' },
      'Historique effacé.',
      'Effacer tout l’historique de navigation ? Vos favoris sont conservés.',
      elements.clearHistory,
    ),
  );
}

bindEvents();
void load();
