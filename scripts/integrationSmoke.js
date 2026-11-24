'use strict';

/**
 * Think-Browser — test d'intégration Electron.
 *
 * Lance l'application dans un profil temporaire, assemble une page HLS locale,
 * puis vérifie le pont sécurisé, l'extraction de page, l'analyse des pistes et
 * un téléchargement ffmpeg complet. Le script nécessite un serveur X (ou
 * `xvfb-run`) sous Linux.
 */

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const electronPath = require('electron');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitFor(check, timeoutMs = 15_000, intervalMs = 200) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const poll = async () => {
      try {
        const result = await new Promise((resolveCheck, rejectCheck) => {
          const timer = setTimeout(
            () => rejectCheck(new Error('Délai d’attente dépassé.')),
            timeoutMs,
          );

          Promise.resolve(check()).then(
            (value) => {
              clearTimeout(timer);
              resolveCheck(value);
            },
            (error) => {
              clearTimeout(timer);
              rejectCheck(error);
            },
          );
        });

        if (result) {
          resolve(result);
          return;
        }
      } catch {
        // L'application peut encore démarrer.
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Délai d’attente dépassé.'));
        return;
      }

      setTimeout(poll, intervalMs);
    };

    void poll();
  });
}

function makeFixture(directory) {
  const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
  const result = spawnSync(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x180:rate=25',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=44100',
      '-t',
      '3',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-f',
      'hls',
      '-hls_time',
      '1',
      '-hls_playlist_type',
      'vod',
      '-hls_segment_filename',
      path.join(directory, 'seg%03d.ts'),
      path.join(directory, 'index.m3u8'),
    ],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    throw new Error(
      `Génération du flux HLS impossible : ${result.stderr || result.error}`,
    );
  }

  const playlist = fs.readFileSync(path.join(directory, 'index.m3u8'), 'utf8');
  fs.writeFileSync(
    path.join(directory, 'live.m3u8'),
    playlist
      .replace(/#EXT-X-ENDLIST\s*/g, '')
      .replace(/#EXT-X-PLAYLIST-TYPE:VOD\s*/g, '#EXT-X-PLAYLIST-TYPE:EVENT\n'),
  );
  fs.writeFileSync(
    path.join(directory, 'page.html'),
    [
      '<!doctype html>',
      '<html><head><meta charset="utf-8"><title>Think test</title></head>',
      '<body>',
      '<video controls src="index.m3u8"></video>',
      '<video controls src="live.m3u8"></video>',
      '<a href="document.mp4">document</a>',
      '</body></html>',
    ].join('\n'),
  );
  fs.copyFileSync(
    path.join(directory, 'index.m3u8'),
    path.join(directory, 'document.mp4'),
  );
  fs.writeFileSync(
    path.join(directory, 'direct.txt'),
    'think-direct-download',
    'utf8',
  );
  fs.writeFileSync(
    path.join(directory, 'direct2.txt'),
    'think-config-download',
    'utf8',
  );
}

function serveFixture(directory) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.ts': 'video/mp2t',
    '.mp4': 'video/mp4',
    '.txt': 'text/plain; charset=utf-8',
  };

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filePath = path.join(directory, relativePath);

    if (!filePath.startsWith(directory) || !fs.existsSync(filePath)) {
      response.writeHead(404);
      response.end('Introuvable');
      return;
    }

    response.writeHead(200, {
      'Content-Type':
        types[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(response);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        port: server.address().port,
      });
    });
  });
}

async function createCdpClient(port) {
  const target = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);

    if (!response.ok) {
      return null;
    }

    const pages = await response.json();
    return pages.find((page) => page.type === 'page') || null;
  });

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let sequence = 0;
  const pending = new Map();

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };

  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('Connexion CDP impossible.'));
  });

  const command = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++sequence;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });

  return {
    socket,
    async evaluate(expression) {
      const response = await command('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });

      if (response.exceptionDetails) {
        throw new Error(
          response.exceptionDetails.exception?.description ||
            response.exceptionDetails.text ||
            'Erreur JavaScript dans le renderer.',
        );
      }

      return response.result?.result?.value;
    },
  };
}

/**
 * Navigue la webview active et attend la fin du chargement.
 * @param {object} cdp
 * @param {string} url
 */
async function navigateGuest(cdp, url) {
  await cdp.evaluate(
    `(() => {
      const input = document.getElementById('url-input');
      input.value = ${JSON.stringify(url)};
      input.form.requestSubmit();
      return true;
    })()`,
  );
  await waitFor(async () => {
    const current = await cdp.evaluate(
      `document.querySelector('webview')?.getURL() || ''`,
    );
    return current === url || current === url.replace(/\/$/, '');
  });
  await waitFor(async () => {
    const state = await guestEvaluate(
      cdp,
      `document.readyState + '|' + location.href`,
    );
    return typeof state === 'string' && state.startsWith('complete|');
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
}

/**
 * Évalue une expression dans la page invitée active.
 * @param {object} cdp
 * @param {string} expression
 * @returns {Promise<unknown>}
 */
function guestEvaluate(cdp, expression) {
  return cdp.evaluate(
    `document.querySelector('webview').executeJavaScript(${JSON.stringify(
      expression,
    )})`,
  );
}

async function main() {
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    const xvfb = spawnSync('sh', ['-c', 'command -v xvfb-run'], {
      encoding: 'utf8',
    });

    if (xvfb.status !== 0) {
      console.log('Test d’intégration ignoré : xvfb-run est indisponible.');
      return;
    }
  }

  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'think-integration-'),
  );
  const fixtureDirectory = path.join(temporaryRoot, 'fixture');
  const profileDirectory = path.join(temporaryRoot, 'profile');
  const downloadDirectory = path.join(temporaryRoot, 'downloads');
  fs.mkdirSync(fixtureDirectory, { recursive: true });
  fs.mkdirSync(downloadDirectory, { recursive: true });
  makeFixture(fixtureDirectory);

  const { server, port: serverPort } = await serveFixture(fixtureDirectory);
  const debugPort = await findFreePort();
  const pageUrl = `http://127.0.0.1:${serverPort}/page.html`;
  // `THINK_ELECTRON_BIN` permet de rejouer exactement ce scénario contre une
  // application empaquetée (AppImage, binaire décompressé ou exécutable
  // Windows) au lieu du Electron de développement.
  const packagedBinary = process.env.THINK_ELECTRON_BIN
    ? path.resolve(ROOT, process.env.THINK_ELECTRON_BIN)
    : '';
  const appExecutable = packagedBinary || electronPath;
  const appArguments = packagedBinary ? [] : ['.'];
  const headless = process.platform === 'linux' && !process.env.DISPLAY;
  const command = headless ? 'xvfb-run' : appExecutable;
  const args = [
    ...(headless ? ['-a', appExecutable] : []),
    ...appArguments,
    '--no-sandbox',
    // Le binaire de développement peut subir les limites du GPU logiciel de
    // Xvfb ; le paquet distribué conserve son comportement normal.
    ...(packagedBinary ? [] : ['--disable-gpu']),
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDirectory}`,
  ];
  const child = spawn(command, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      THINK_INTEGRATION_TEST: '1',
      // Les AppImage en mode extraction utilisent TMPDIR : le garder dans le
      // dossier temporaire du test permet de tout nettoyer à la fin.
      TMPDIR: temporaryRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Un groupe de processus permet de tuer aussi le lanceur AppImage et ses
    // enfants Electron, pas seulement le wrapper xvfb-run.
    detached: process.platform !== 'win32',
  });

  const terminate = (signal) => {
    if (process.platform === 'win32') {
      try {
        child.kill(signal);
      } catch {
        // Le processus est déjà terminé.
      }
      return;
    }

    try {
      process.kill(-child.pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        // Le groupe est déjà terminé.
      }
    }
  };
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString('utf8');
  });

  let cdp = null;
  let stage = 'connexion au renderer';

  try {
    cdp = await createCdpClient(debugPort);
    const initial = await waitFor(async () => {
      const raw = await cdp.evaluate(`JSON.stringify({
        bridge: Boolean(window.thinkBridge),
        dialogs: document.querySelectorAll('dialog').length,
        bundle: Array.from(document.scripts).some((script) => script.src.includes('bootstrap.bundle.js')),
      })`);
      const state = JSON.parse(raw);
      return state.bridge && state.dialogs >= 10 && state.bundle
        ? state
        : null;
    });

    assert(initial.bridge, 'Le pont preload n’est pas exposé.');
    assert(initial.dialogs >= 10, 'Les fragments HTML ne sont pas assemblés.');
    assert(initial.bundle, 'Le bundle du renderer n’est pas chargé.');

    // Laisser la page d’accueil de la webview initiale finir son chargement
    // avant de détruire l’onglet : retirer une webview encore en cours de
    // navigation peut bloquer le renderer hôte sous Electron.
    await waitFor(async () => {
      const raw = await cdp.evaluate(`JSON.stringify({
        tabs: document.querySelectorAll('.tab').length,
        url: document.querySelector('webview')?.getURL?.() || '',
        ready: document.readyState,
      })`);
      const state = JSON.parse(raw);
      return (
        state.tabs > 0 &&
        state.ready === 'complete' &&
        state.url.startsWith('think-home://')
      );
    }, 20_000);
    await new Promise((resolve) => setTimeout(resolve, 500));

    stage = 'fermeture du dernier onglet';
    await waitFor(async () => {
      const tabCount = await cdp.evaluate(
        `document.querySelectorAll('.tab').length`,
      );
      return tabCount > 0;
    });

    // Fermer le dernier onglet doit créer un onglet de remplacement sans
    // laisser d'auditeur « close-request » orphelin.
    const initialTabIds = await cdp.evaluate(
      `Array.from(document.querySelectorAll('.tab')).map((tab) => tab.dataset.tabId)`,
    );

    for (const tabId of initialTabIds) {
      await cdp.evaluate(
        `document.querySelector('.tab[data-tab-id="${tabId}"] .tab__close')?.click()`,
      );
    }

    await waitFor(async () => {
      const state = await cdp.evaluate(`JSON.stringify({
        tabs: document.querySelectorAll('.tab').length,
        webviews: document.querySelectorAll('webview').length,
      })`);
      const parsed = JSON.parse(state);
      return parsed.tabs === 1 && parsed.webviews === 1;
    });

    stage = 'catalogue des extensions';
    const extensionState = await cdp.evaluate(
      `window.thinkBridge.invoke('extensions:get')`,
    );
    assert(
      extensionState.extensions.length === 2,
      'Le catalogue d’extensions est incomplet.',
    );
    assert(
      extensionState.theme === 'dark' && extensionState.language === 'fr',
      'Les préférences d’extension par défaut sont incorrectes.',
    );

    stage = 'ouverture du panneau des extensions';
    await cdp.evaluate(
      `document.querySelector('[data-action="extensions"]')?.click()`,
    );
    await waitFor(async () => {
      const panel = await cdp.evaluate(`JSON.stringify({
        open: Boolean(document.getElementById('extensions-dialog')?.open),
        cards: document.querySelectorAll('#extensions-list .extension-card').length,
      })`);
      const parsed = JSON.parse(panel);
      return parsed.open && parsed.cards === 2;
    });
    await cdp.evaluate(
      `document.getElementById('extensions-dialog')?.close()`,
    );

    const lightState = await cdp.evaluate(
      `window.thinkBridge.invoke('extensions:set-theme', 'light')`,
    );
    assert(lightState.theme === 'light', 'Le thème clair n’a pas été appliqué.');

    await waitFor(async () => {
      const theme = await cdp.evaluate(
        `document.documentElement.dataset.theme || ''`,
      );
      return theme === 'light';
    });

    const englishState = await cdp.evaluate(
      `window.thinkBridge.invoke('extensions:set-language', 'en')`,
    );
    assert(
      englishState.language === 'en',
      'La langue anglaise n’a pas été appliquée.',
    );

    await waitFor(async () => {
      const translated = await cdp.evaluate(`(() => {
        const menuItem = document.querySelector('[data-action="new-tab"] span');
        return {
          language: document.documentElement.lang,
          text: menuItem?.textContent || '',
        };
      })()`);
      return translated.language === 'en' && translated.text === 'New tab';
    });

    stage = 'traduction du panneau des extensions';
    await cdp.evaluate(
      `document.querySelector('[data-action="extensions"]')?.click()`,
    );
    await waitFor(async () => {
      const panel = await cdp.evaluate(`JSON.stringify({
        open: Boolean(document.getElementById('extensions-dialog')?.open),
        description: document.querySelector('.extensions-intro')?.textContent || '',
        firstTheme: document.querySelector('.extension-card select option')?.textContent || '',
      })`);
      const parsed = JSON.parse(panel);
      return (
        parsed.open &&
        parsed.description.includes('Built-in extensions never load remote code') &&
        parsed.firstTheme === 'Dark'
      );
    });
    await cdp.evaluate(
      `document.getElementById('extensions-dialog')?.close()`,
    );

    const restoredState = await cdp.evaluate(
      `window.thinkBridge.invoke('extensions:set-language', 'fr').then(() => window.thinkBridge.invoke('extensions:set-theme', 'dark'))`,
    );
    assert(
      restoredState.theme === 'dark' && restoredState.language === 'fr',
      'Les préférences d’extension n’ont pas été restaurées.',
    );

    const settings = await cdp.evaluate(
      `window.thinkBridge.invoke('settings:update', ${JSON.stringify({
        downloadDir: downloadDirectory,
      })})`,
    );
    assert(settings && settings.downloadDir === downloadDirectory, 'Dossier de téléchargement non appliqué.');

    const guestId = await waitFor(async () => {
      const value = await cdp.evaluate(
        `(() => { const webview = document.querySelector('webview'); return webview ? webview.getWebContentsId() : null; })()`,
      );
      return Number.isInteger(value) ? value : null;
    });
    assert(Number.isInteger(guestId), 'Aucune webview active.');

    // La webview vient d'être créée : on laisse son premier chargement se
    // terminer avant de demander une navigation explicite.
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await cdp.evaluate(
      `(async () => {
        const webview = document.querySelector('webview');
        await webview.loadURL(${JSON.stringify(pageUrl)});
      })()`,
    );
    await waitFor(async () => {
      const currentUrl = await cdp.evaluate(
        `document.querySelector('webview')?.getURL() || ''`,
      );
      return currentUrl === pageUrl;
    });
    await new Promise((resolve) => setTimeout(resolve, 800));

    stage = 'dialogue de téléchargement par lien';
    await cdp.evaluate(
      `document.querySelector('[data-action="download-link"]')?.click()`,
    );
    await waitFor(async () => {
      return cdp.evaluate(
        `Boolean(document.getElementById('link-download-dialog')?.open)`,
      );
    });
    await cdp.evaluate(
      `(() => {
        const input = document.getElementById('link-download-url');
        input.value = ${JSON.stringify(
          `http://127.0.0.1:${serverPort}/direct.txt`,
        )};
        document.getElementById('link-download-analyze').click();
      })()`,
    );
    // Un fichier direct part immédiatement vers Chromium : la boîte se ferme
    // sans afficher de résultat intermédiaire ni demander un second clic.
    await waitFor(async () => {
      return cdp.evaluate(
        `!document.getElementById('link-download-dialog')?.open`,
      );
    });
    const linkCompleted = await waitFor(async () => {
      const records = await cdp.evaluate(
        `window.thinkBridge.invoke('downloads:list')`,
      );
      return records.find(
        (record) =>
          record.filename === 'direct.txt' && record.state === 'completed',
      );
    }, 20_000);
    assert(linkCompleted.savePath, 'Le téléchargement par lien n’a pas de chemin.');
    assert(
      fs.readFileSync(linkCompleted.savePath, 'utf8').trim() ===
        'think-direct-download',
      'Le contenu du téléchargement par lien est incorrect.',
    );

    const extraction = await cdp.evaluate(
      `window.thinkBridge.invoke('media:extract', ${guestId})`,
    );
    assert(extraction.ok, `Extraction impossible : ${extraction.message || ''}`);
    assert(
      extraction.found >= 3,
      `Les médias de la page n’ont pas été extraits : ${JSON.stringify(extraction)}`,
    );

    const prepared = await cdp.evaluate(
      `window.thinkBridge.invoke('media:prepare', ${JSON.stringify({
        url: `http://127.0.0.1:${serverPort}/index.m3u8`,
        pageUrl,
      })})`,
    );
    assert(prepared.ok, 'Préparation du flux impossible.');
    assert(prepared.metadata.audioTracks.length >= 1, 'Aucune piste audio détectée.');
    assert(prepared.isLive === false, 'Le flux VOD a été classé comme direct.');

    const livePrepared = await cdp.evaluate(
      `window.thinkBridge.invoke('media:prepare', ${JSON.stringify({
        url: `http://127.0.0.1:${serverPort}/live.m3u8`,
        pageUrl,
      })})`,
    );
    assert(livePrepared.ok && livePrepared.isLive, 'Le direct HLS n’a pas été détecté.');

    const download = await cdp.evaluate(
      `window.thinkBridge.invoke('media:download', ${JSON.stringify({
        url: `http://127.0.0.1:${serverPort}/index.m3u8`,
        pageUrl,
        audioStreamIndex: prepared.metadata.audioTracks[0].index,
      })})`,
    );
    assert(download.ok && download.mode === 'stream', 'Téléchargement du flux non lancé.');

    const completed = await waitFor(async () => {
      const records = await cdp.evaluate(
        `window.thinkBridge.invoke('downloads:list')`,
      );
      return records.find((record) => record.id === download.downloadId && record.state === 'completed');
    }, 20_000);

    assert(completed.savePath, 'Aucun fichier final annoncé.');
    assert(fs.existsSync(completed.savePath), 'Le fichier téléchargé est absent.');
    assert(fs.statSync(completed.savePath).size > 0, 'Le fichier téléchargé est vide.');

    stage = 'pages internes';
    const workspaceDirectory = path.join(temporaryRoot, 'dev-workspace');
    fs.mkdirSync(workspaceDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDirectory, 'README.md'),
      '# Integration workspace\n\nFichier de test.\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(workspaceDirectory, 'style.css'),
      'body { color: rgb(1, 2, 3); }\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(workspaceDirectory, 'image.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      'utf8',
    );
    fs.writeFileSync(
      path.join(workspaceDirectory, 'index.html'),
      '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head>' +
        '<body><h1 id="title">Integration</h1><script>' +
        'console.log("preview-ok");' +
        'window.addEventListener("load", () => {' +
        '  console.log("preview-color-" + getComputedStyle(document.body).color);' +
        '});' +
        '</script></body></html>',
      'utf8',
    );

    await cdp.evaluate(
      `window.thinkBridge.invoke('settings:update', ${JSON.stringify({
        devWorkspace: workspaceDirectory,
      })})`,
    );

    const installGuestHelper = async () => {
      await guestEvaluate(
        cdp,
        `window.__thinkTest = async (route, options = {}) => {
          const response = await fetch(route, {
            cache: 'no-store',
            ...options,
            headers: {
              ...(options.body ? { 'x-think-request': '1' } : {}),
              ...(options.headers || {}),
            },
          });
          const type = response.headers.get('content-type') || '';
          const body = type.includes('application/json')
            ? await response.json()
            : await response.text();
          return { status: response.status, ok: response.ok, body };
        }; true`,
      );
    };

    const guestRequest = (route, options = {}) =>
      guestEvaluate(
        cdp,
        `window.__thinkTest(${JSON.stringify(route)}, ${JSON.stringify(options)})`,
      );

    stage = 'page about:config';
    await navigateGuest(cdp, 'think-page://config/');
    await installGuestHelper();
    await waitFor(async () => {
      const count = await guestEvaluate(
        cdp,
        `document.querySelectorAll('#config-pills .pill').length`,
      );
      return Number(count) >= 3;
    });
    const configPage = await guestRequest('/api/state');
    assert(configPage.status === 200, 'La page about:config ne répond pas.');
    assert(
      configPage.body.settings.downloadDir === downloadDirectory,
      'about:config ne lit pas les paramètres.',
    );
    assert(
      configPage.body.extensions.extensions.length === 2,
      'about:config n’expose pas les extensions.',
    );
    const configUi = JSON.parse(
      await guestEvaluate(
        cdp,
        `JSON.stringify({
          title: document.title,
          h1: document.querySelector('h1')?.textContent || '',
          styles: document.styleSheets.length,
          extensionItems: document.querySelectorAll('#extensions-list .ext-item').length,
        })`,
      ),
    );
    assert(
      configUi.title.includes('about:config') && configUi.h1 === 'about:config',
      'Le titre de about:config est incorrect.',
    );
    assert(configUi.styles >= 1, 'La feuille de style de about:config est absente.');
    assert(configUi.extensionItems === 2, 'La liste des extensions est vide.');
    await waitFor(async () => {
      const address = await cdp.evaluate(
        `document.getElementById('url-input')?.value || ''`,
      );
      return address === 'about:config';
    });

    stage = 'téléchargement direct depuis about:config';
    const configInspection = await guestRequest('/api/inspect-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `http://127.0.0.1:${serverPort}/direct2.txt`,
      }),
    });
    assert(
      configInspection.status === 200 && configInspection.body.ok,
      `Analyse du lien depuis about:config impossible : ${
        configInspection.body?.message || configInspection.status
      }`,
    );
    const credentialInspection = await guestRequest('/api/inspect-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `http://user:secret@127.0.0.1:${serverPort}/direct2.txt`,
      }),
    });
    assert(
      credentialInspection.body.ok === false &&
        credentialInspection.body.message.includes('identifiants intégrés'),
      'Une URL de téléchargement avec identifiants intégrés n’est pas refusée.',
    );
    const configStart = await guestRequest('/api/start-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `http://127.0.0.1:${serverPort}/direct2.txt`,
      }),
    });
    assert(
      configStart.status === 200 && configStart.body.ok,
      `Téléchargement depuis about:config impossible : ${
        configStart.body?.message || configStart.status
      }`,
    );
    const configCompleted = await waitFor(async () => {
      const records = await cdp.evaluate(
        `window.thinkBridge.invoke('downloads:list')`,
      );
      return records.find(
        (record) =>
          record.filename === 'direct2.txt' && record.state === 'completed',
      );
    }, 20_000);
    assert(
      fs.readFileSync(configCompleted.savePath, 'utf8').trim() ===
        'think-config-download',
      'Le téléchargement direct depuis about:config est incorrect.',
    );

    stage = 'page about:security';
    await navigateGuest(cdp, 'think-page://security/');
    await installGuestHelper();
    await waitFor(async () => {
      const count = await guestEvaluate(
        cdp,
        `document.querySelectorAll('#posture-list .check-item').length`,
      );
      return Number(count) > 0;
    });
    const securityPage = await guestRequest('/api/summary');
    assert(securityPage.status === 200, 'La page about:security ne répond pas.');
    assert(
      Array.isArray(securityPage.body.posture?.checks) &&
        securityPage.body.posture.checks.length > 0,
      'about:security ne renvoie pas de contrôles de posture.',
    );
    assert(
      Number.isInteger(securityPage.body.counts?.cookies),
      'about:security ne compte pas les cookies.',
    );
    assert(
      Array.isArray(securityPage.body.securityNotices?.notices) &&
        securityPage.body.securityNotices.notices.length >= 6,
      'about:security n’expose pas les avis de sécurité embarqués.',
    );
    assert(
      securityPage.body.securityNotices.notices.some(
        (notice) => notice.id === 'TB-SEC-001',
      ),
      'L’avis sur la sandbox du renderer hôte est absent.',
    );
    assert(
      securityPage.body.securityNotices.limitations.length >= 5,
      'about:security n’expose pas ses limites résiduelles.',
    );
    const securityUi = JSON.parse(
      await guestEvaluate(
        cdp,
        `JSON.stringify({
          title: document.title,
          h1: document.querySelector('h1')?.textContent || '',
          checks: document.querySelectorAll('#posture-list .check-item').length,
          notices: document.querySelectorAll('#security-notices .signal').length,
          limitations: document.querySelectorAll('#security-limitations li').length,
          policy: document.getElementById('security-update-policy')?.textContent || '',
          styles: document.styleSheets.length,
        })`,
      ),
    );
    assert(
      securityUi.title.includes('about:security') &&
        securityUi.h1 === 'about:security',
      'Le titre de about:security est incorrect.',
    );
    assert(securityUi.checks > 0, 'Les contrôles de about:security ne sont pas affichés.');
    assert(
      securityUi.notices >= 6,
      'Les avis de sécurité ne sont pas affichés dans about:security.',
    );
    assert(
      securityUi.limitations >= 5,
      'Les limites résiduelles ne sont pas affichées dans about:security.',
    );
    assert(
      securityUi.policy.includes('npm run audit:security'),
      'La politique de mise à jour de about:security est absente.',
    );
    assert(securityUi.styles >= 1, 'La feuille de style de about:security est absente.');
    await waitFor(async () => {
      const address = await cdp.evaluate(
        `document.getElementById('url-input')?.value || ''`,
      );
      return address === 'about:security';
    });

    stage = 'page about:dev';
    await navigateGuest(cdp, 'think-page://dev/');
    await installGuestHelper();
    await waitFor(async () => {
      const value = await guestEvaluate(
        cdp,
        `document.getElementById('dev-workspace-path')?.textContent || ''`,
      );
      return value.includes('dev-workspace');
    });
    await waitFor(async () => {
      const count = await guestEvaluate(
        cdp,
        `document.querySelectorAll('#dev-tree .dev-tree__node').length`,
      );
      return Number(count) >= 3;
    });
    const devState = await guestRequest('/api/dev/state');
    assert(devState.status === 200, 'La page about:dev ne répond pas.');
    assert(
      devState.body.workspace.path === fs.realpathSync(workspaceDirectory),
      'L’espace de travail de about:dev est incorrect.',
    );
    assert(
      devState.body.terminal.commands.includes('node'),
      'Le terminal de about:dev n’expose pas ses commandes.',
    );
    assert(
      devState.body.runtimes.some((runtime) => runtime.id === 'node'),
      'Les interpréteurs de about:dev sont absents.',
    );
    const forcedWorkspace = await guestRequest('/api/dev/workspace', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: path.join(temporaryRoot, 'hors-espace') }),
    });
    assert(
      forcedWorkspace.status === 400,
      'about:dev accepte encore un chemin d’espace de travail fourni par la page.',
    );
    assert(
      forcedWorkspace.body.message.includes('sélecteur natif'),
      'Le refus du chemin d’espace de travail n’est pas explicite.',
    );
    await waitFor(async () => {
      const value = await guestEvaluate(
        cdp,
        `document.getElementById('dev-editor')?.value || ''`,
      );
      return value.includes('# Integration workspace');
    });

    const createFile = await guestRequest('/api/dev/fs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        path: 'integration.js',
        type: 'file',
      }),
    });
    assert(createFile.body.ok, 'Création de fichier impossible depuis about:dev.');
    const writeFile = await guestRequest('/api/dev/fs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'write',
        path: 'integration.js',
        content: 'console.log("dev-run-ok");\n',
      }),
    });
    assert(writeFile.body.ok, 'Écriture de fichier impossible depuis about:dev.');
    const readFile = await guestRequest('/api/dev/fs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'read', path: 'integration.js' }),
    });
    assert(
      readFile.body.content.includes('dev-run-ok'),
      'Lecture de fichier incorrecte depuis about:dev.',
    );
    assert(
      fs.readFileSync(path.join(workspaceDirectory, 'integration.js'), 'utf8')
        .includes('dev-run-ok'),
      'Le fichier créé est absent du disque.',
    );

    const devPreview = await guestRequest('/api/dev/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'index.html' }),
    });
    assert(devPreview.body.ok, 'Aperçu HTML impossible depuis about:dev.');
    const previewHtml = await guestEvaluate(
      cdp,
      `fetch(${JSON.stringify(
        devPreview.body.url,
      )}).then((response) => response.text())`,
    );
    assert(
      typeof previewHtml === 'string' &&
        previewHtml.includes('think-page://dev/file/') &&
        previewHtml.includes('think-dev-preview'),
      'L’aperçu HTML ne contient pas sa base ou son pont de console.',
    );
    const previewHeaders = await guestEvaluate(
      cdp,
      `fetch(${JSON.stringify(devPreview.body.url)}).then((response) => ({
        status: response.status,
        csp: response.headers.get('content-security-policy') || '',
      }))`,
    );
    assert(
      previewHeaders.status === 200 &&
        previewHeaders.csp.startsWith('sandbox allow-scripts'),
      'L’aperçu HTML n’est pas protégé par une CSP sandbox.',
    );
    assert(
      previewHeaders.csp.includes('frame-ancestors think-page://dev'),
      'L’aperçu HTML n’a pas de restriction frame-ancestors.',
    );
    const previewCss = await guestEvaluate(
      cdp,
      `fetch('/file/style.css').then((response) => response.text())`,
    );
    assert(
      previewCss.includes('rgb(1, 2, 3)'),
      'Les ressources relatives de l’aperçu ne sont pas servies.',
    );
    await guestEvaluate(
      cdp,
      `(() => {
        const frame = document.getElementById('dev-preview-frame');
        frame.hidden = false;
        frame.src = ${JSON.stringify(devPreview.body.url)};
        document.getElementById('dev-preview-empty').hidden = true;
        return true;
      })()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 800));
    const previewIsolated = await guestEvaluate(
      cdp,
      `document.getElementById('dev-preview-frame').contentDocument === null`,
    );
    assert(
      previewIsolated === true,
      'L’aperçu about:dev n’est pas isolé par la sandbox.',
    );
    await waitFor(async () => {
      const value = await guestEvaluate(
        cdp,
        `document.getElementById('dev-run-output')?.textContent || ''`,
      );
      return value.includes('preview-color-rgb(1, 2, 3)');
    }, 8_000);
    const svgHeaders = await guestEvaluate(
      cdp,
      `fetch('/file/image.svg').then((response) => ({
        status: response.status,
        csp: response.headers.get('content-security-policy') || '',
      }))`,
    );
    assert(
      svgHeaders.status === 200 && svgHeaders.csp.startsWith('sandbox;'),
      'Une ressource SVG de about:dev n’est pas sandboxée.',
    );

    const devRun = await guestRequest('/api/dev/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'integration.js' }),
    });
    assert(devRun.body.ok, `Exécution Node impossible : ${devRun.body.message || ''}`);
    assert(
      devRun.body.stdout.includes('dev-run-ok'),
      'La sortie du script Node est incorrecte.',
    );

    await guestEvaluate(
      cdp,
      `(() => {
        const input = document.getElementById('dev-terminal-input');
        input.value = 'help';
        document.getElementById('dev-terminal-run').click();
        return true;
      })()`,
    );
    await waitFor(async () => {
      const value = await guestEvaluate(
        cdp,
        `document.getElementById('dev-terminal-output')?.textContent || ''`,
      );
      return value.includes('Commandes autorisées');
    });
    const forbiddenTerminal = await guestRequest('/api/dev/terminal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'rm -rf /' }),
    });
    assert(
      forbiddenTerminal.body.ok === false &&
        forbiddenTerminal.body.message.includes('non autorisée'),
      'Une commande de terminal dangereuse n’est pas refusée.',
    );

    const traversal = await guestRequest('/api/dev/fs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'read', path: '../package.json' }),
    });
    assert(
      traversal.status === 400,
      'Une traversée de chemin about:dev n’est pas refusée.',
    );
    const absoluteTraversal = await guestRequest('/api/dev/fs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'read', path: '/etc/passwd' }),
    });
    assert(
      absoluteTraversal.status === 400,
      'Un chemin absolu about:dev n’est pas refusé.',
    );

    if (process.platform !== 'win32') {
      const symlinkPath = path.join(workspaceDirectory, 'escape.js');
      fs.symlinkSync('/etc/passwd', symlinkPath);
      const symlinkRead = await guestRequest('/api/dev/fs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'read', path: 'escape.js' }),
      });
      assert(
        symlinkRead.status === 400,
        'Un lien symbolique about:dev n’est pas refusé.',
      );
    }

    const previewTraversal = await guestRequest(
      '/preview/000000000000000000000000000000000000',
    );
    assert(
      previewTraversal.status === 404,
      'Un jeton d’aperçu inconnu n’est pas refusé.',
    );
    const fileTraversal = await guestRequest('/file/..%2f..%2fetc%2fpasswd');
    assert(
      fileTraversal.status === 403 || fileTraversal.status === 404,
      'Une traversée de ressource about:dev n’est pas refusée.',
    );
    assert(
      !output.includes("'console-message' arguments are deprecated"),
      'L’ancien contrat console-message est encore utilisé.',
    );
    assert(
      !output.includes('removeAllListeners is not a function'),
      'La fermeture du dernier onglet a laissé une erreur d’auditeur.',
    );

    console.log(
      `Test d’intégration réussi : ${completed.filename}, ` +
        `${extraction.added} média(s) extrait(s), pistes audio ${prepared.metadata.audioTracks.length}.`,
    );
  } catch (error) {
    console.error(
      `Échec du test d’intégration (${stage}) :`,
      error.message,
    );
    if (output.trim()) {
      console.error(output.trim().split('\n').slice(-30).join('\n'));
    }
    process.exitCode = 1;
  } finally {
    try {
      cdp?.socket?.close();
    } catch {
      // La socket a déjà pu être fermée.
    }

    terminate('SIGTERM');
    await new Promise((resolve) => {
      let exited = false;
      const timer = setTimeout(() => {
        if (!exited) {
          terminate('SIGKILL');
        }

        resolve();
      }, 3_000);

      child.once('exit', () => {
        exited = true;
        clearTimeout(timer);
        resolve();
      });
    });

    // L'AppImage peut détacher le processus Electron de son lanceur. On cible
    // donc aussi les processus qui utilisent ce profil temporaire unique.
    if (process.platform !== 'win32') {
      spawnSync('pkill', ['-f', profileDirectory], { stdio: 'ignore' });
      await new Promise((resolve) => setTimeout(resolve, 300));
      spawnSync('pkill', ['-9', '-f', profileDirectory], { stdio: 'ignore' });
    }

    server.closeAllConnections?.();
    server.close();

    try {
      fs.rmSync(temporaryRoot, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      });
    } catch (error) {
      console.warn(
        'Nettoyage du profil de test incomplet :',
        error.message,
      );
    }

    // Un wrapper AppImage/Xvfb peut conserver des descripteurs ouverts après
    // la fin du scénario. On termine explicitement pour que npm ne reste pas
    // suspendu, tout en conservant le code de sortie des assertions.
    setTimeout(() => process.exit(process.exitCode || 0), 250);
  }
}

void main();
