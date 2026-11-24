'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  DownloadManager,
  MEDIA_PAGE_MESSAGE,
  hasUrlCredentials,
  isMediaPageUrl,
  isSafeDownloadUrl,
} = require('../src/main/downloadManager');
const { getFilenameFromUrl, sanitizeFilename } = require('../src/shared/utils');
const { sanitizeHeaderValue } = require('../src/main/videoTools');

function makeTempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'think-download-test-'));
}

function makeStore(initialRecords = []) {
  return {
    records: initialRecords,
    async load() {
      return initialRecords.map((record) => ({ ...record }));
    },
    save(records) {
      this.records = records.map((record) => ({ ...record }));
    },
    async flush() {},
  };
}

class FakeVideoDownloader {
  constructor({ probeResult = null } = {}) {
    this.jobs = new Map();
    this.stopped = [];
    this.cancelled = [];
    this.probeResult = probeResult;
    this.nextJob = 1;
    this.tools = {
      ffmpegPath: '/fake/ffmpeg',
      getCapabilities: async () => ({
        ffmpeg: true,
        ffprobe: true,
        ffmpegVersion: 'test',
        ffprobeVersion: 'test',
      }),
      getCookieHeader: async () => '',
      probe: async () => this.probeResult,
    };
  }

  get activeCount() {
    return this.jobs.size;
  }

  async start(options) {
    const jobId = `job-${this.nextJob}`;
    this.nextJob += 1;
    this.jobs.set(jobId, options);
    return { ok: true, jobId };
  }

  stop(jobId) {
    if (!this.jobs.has(jobId)) {
      return false;
    }

    this.stopped.push(jobId);
    return true;
  }

  cancel(jobId) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return false;
    }

    this.cancelled.push(jobId);
    this.jobs.delete(jobId);
    job.onDone({ ok: false, cancelled: true, message: 'Annulé.' });
    return true;
  }

  cancelAll() {
    this.jobs.clear();
  }

  finish(jobId, result) {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error(`Tâche inconnue : ${jobId}`);
    }

    this.jobs.delete(jobId);
    job.onDone({
      ok: true,
      outputPath: job.outputPath,
      receivedBytes: 123,
      ...result,
    });
  }
}

class FakeYtDlpDownloader {
  constructor() {
    this.jobs = new Map();
    this.cancelled = [];
    this.nextJob = 1;
  }

  get activeCount() {
    return this.jobs.size;
  }

  async getCapabilities() {
    return {
      available: true,
      path: '/fake/yt-dlp',
      version: 'test',
      message: '',
    };
  }

  async start(options) {
    const jobId = `ytdlp-job-${this.nextJob}`;
    this.nextJob += 1;
    this.jobs.set(jobId, options);
    return { ok: true, jobId };
  }

  cancel(jobId) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return false;
    }

    this.cancelled.push(jobId);
    this.jobs.delete(jobId);
    job.onDone({ ok: false, cancelled: true, message: 'Annulé.' });
    return true;
  }

  cancelAll() {
    this.jobs.clear();
  }

  finish(jobId, result) {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error(`Tâche yt-dlp inconnue : ${jobId}`);
    }

    this.jobs.delete(jobId);
    job.onDone({
      ok: true,
      outputPath: job.outputPath,
      receivedBytes: 456,
      ...result,
    });
  }
}

function makeManager({
  downloader,
  ytDlpDownloader = null,
  store = makeStore(),
  directory = makeTempDirectory(),
} = {}) {
  const events = [];
  const session = {
    willDownload: null,
    on(event, listener) {
      if (event === 'will-download') {
        this.willDownload = listener;
      }
    },
    getUserAgent: () => 'Think-Test',
  };
  const manager = new DownloadManager({
    session,
    getDownloadDir: () => directory,
    fallbackDownloadDir: directory,
    onEvent: (channel, record) => events.push({ channel, record }),
    downloadStore: store,
    videoDownloader: downloader,
    ytDlpDownloader,
    onMediaCompleted: () => {},
  });

  return { manager, events, directory, session };
}

function startStream(manager, suffix = '') {
  return manager.startMediaDownload({
    url: `https://example.test/${suffix || 'index'}.m3u8`,
    extension: 'm3u8',
    pageUrl: 'https://example.test/page',
    access: {},
  });
}

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('les flux au-delà de la limite sont mis en file puis démarrés', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory } = makeManager({ downloader });

  try {
    const first = await startStream(manager, 'un');
    const second = await startStream(manager, 'deux');
    const third = await startStream(manager, 'trois');

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(third.ok, true);
    assert.equal(third.queued, true);
    assert.equal(manager.downloads.get(third.downloadId).state, 'queued');
    assert.equal(downloader.jobs.size, 2);
    assert.equal(manager.streamQueue.length, 1);

    const firstJobId = Array.from(downloader.jobs.keys())[0];
    downloader.finish(firstJobId);
    await nextTick();
    await nextTick();

    assert.equal(manager.downloads.get(first.downloadId).state, 'completed');
    assert.equal(manager.downloads.get(third.downloadId).state, 'progressing');
    assert.equal(downloader.jobs.size, 2);
    assert.equal(manager.streamQueue.length, 0);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('une fusion audio/vidéo est confiée à ffmpeg avec les deux pistes', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory } = makeManager({ downloader });
  const videoUrl =
    'https://rr1---sn.googlevideo.com/videoplayback?mime=video%2Fmp4&itag=137';
  const audioUrl =
    'https://rr1---sn.googlevideo.com/videoplayback?mime=audio%2Fmp4&itag=140';

  try {
    const started = await manager.startMergedDownload({
      videoUrl,
      audioUrl,
      videoExtension: 'mp4',
      audioExtension: 'm4a',
      videoContentType: 'video/mp4',
      audioContentType: 'audio/mp4',
      outputExtension: 'mp4',
      pageUrl: 'https://www.youtube.com/watch?v=yF4e6mZDVYc',
      access: {},
    });

    assert.equal(started.ok, true);
    assert.equal(started.mode, 'merged');
    assert.equal(downloader.jobs.size, 1);

    const job = Array.from(downloader.jobs.values())[0];
    assert.equal(job.secondaryUrl, audioUrl);
    assert.equal(job.merged, true);
    assert.match(job.outputPath, /youtube-yF4e6mZDVYc\.mp4$/);

    const record = manager.downloads.get(started.downloadId);
    assert.equal(record.merged, true);
    assert.equal(record.kind, 'stream');
    assert.equal(record.audioUrl, audioUrl);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('une vidéo YouTube est confiée à yt-dlp avec ffmpeg', async () => {
  const downloader = new FakeVideoDownloader();
  const ytDlpDownloader = new FakeYtDlpDownloader();
  const { manager, directory } = makeManager({ downloader, ytDlpDownloader });
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  try {
    const started = await manager.startYtDlpDownload({
      url,
      pageUrl: url,
      access: {},
    });

    assert.equal(started.ok, true);
    assert.equal(started.mode, 'ytdlp');
    assert.equal(ytDlpDownloader.jobs.size, 1);

    const [jobId, job] = Array.from(ytDlpDownloader.jobs.entries())[0];
    assert.equal(job.url, url);
    assert.equal(job.ffmpegPath, '/fake/ffmpeg');
    assert.match(job.outputPath, /youtube-dQw4w9WgXcQ\.mp4$/);

    const record = manager.downloads.get(started.downloadId);
    assert.equal(record.ytdlp, true);
    assert.equal(record.merged, true);
    assert.equal(record.kind, 'stream');
    assert.equal(record.state, 'progressing');

    ytDlpDownloader.finish(jobId);

    assert.equal(record.state, 'completed');
    assert.equal(record.progress, 100);
    assert.equal(record.savePath, job.outputPath);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('un flux en attente peut être annulé sans toucher aux flux actifs', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory } = makeManager({ downloader });

  try {
    await startStream(manager, 'un');
    await startStream(manager, 'deux');
    const third = await startStream(manager, 'trois');

    const result = manager.cancel(third.downloadId, {});
    assert.equal(result.ok, true);
    assert.equal(manager.downloads.get(third.downloadId).state, 'cancelled');
    assert.equal(manager.streamQueue.length, 0);
    assert.equal(downloader.jobs.size, 2);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('arrêter un direct demande un arrêt propre et conserve la tâche', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory } = makeManager({ downloader });

  try {
    const started = await manager.startMediaDownload({
      url: 'https://example.test/live.m3u8',
      extension: 'm3u8',
      pageUrl: 'https://example.test/live',
      access: {},
      isLive: true,
    });

    const jobId = Array.from(downloader.jobs.keys())[0];
    const result = manager.stop(started.downloadId, {});

    assert.equal(result.ok, true);
    assert.deepEqual(downloader.stopped, [jobId]);
    assert.equal(manager.downloads.get(started.downloadId).state, 'progressing');

    downloader.finish(jobId, { isLive: true });
    await nextTick();
    await nextTick();

    const record = manager.downloads.get(started.downloadId);
    assert.equal(record.state, 'completed');
    assert.equal(record.isLive, true);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('prepareMediaDownload expose les pistes et le caractère direct', async () => {
  const downloader = new FakeVideoDownloader({
    probeResult: {
      durationSeconds: 12,
      isLive: true,
      audioTracks: [{ index: 2, language: 'fr' }],
      subtitleTracks: [{ index: 4, language: 'en' }],
    },
  });
  const { manager, directory } = makeManager({ downloader });

  try {
    const result = await manager.prepareMediaDownload({
      url: 'https://example.test/live.m3u8',
      extension: 'm3u8',
      pageUrl: 'https://example.test/page',
      access: {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.hasTracks, true);
    assert.equal(result.isLive, true);
    assert.equal(result.durationSeconds, 12);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('les tâches actives sont réparées au redémarrage', async () => {
  const store = makeStore([
    {
      id: 7,
      url: 'https://example.test/live.m3u8',
      filename: 'live.mp4',
      state: 'queued',
      kind: 'stream',
      streamType: 'hls',
    },
  ]);
  const downloader = new FakeVideoDownloader();
  const { manager, directory } = makeManager({ downloader, store });

  try {
    await manager.initialize();
    const record = manager.downloads.get(7);
    assert.equal(record.state, 'interrupted');
    assert.match(record.message, /redémarrage/);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('un arrêt pendant la préparation termine la tâche sans message trompeur', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory } = makeManager({ downloader });

  try {
    const started = await startStream(manager, 'probe');
    downloader.stop = (targetJobId) => {
      const job = downloader.jobs.get(targetJobId);

      if (!job) {
        return false;
      }

      downloader.jobs.delete(targetJobId);
      job.onDone({
        ok: false,
        cancelled: true,
        message: 'Téléchargement arrêté avant le début de l’enregistrement.',
      });
      return true;
    };

    const result = manager.stop(started.downloadId, {});
    const record = manager.downloads.get(started.downloadId);

    assert.equal(result.ok, true);
    assert.equal(record.state, 'cancelled');
    assert.match(record.message, /avant le début/);
    assert.equal(downloader.stopped.length, 0);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('l’arrêt de l’application marque les flux actifs interrompus', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory } = makeManager({ downloader });

  try {
    const started = await startStream(manager, 'quit');

    downloader.cancelAll = () => {
      for (const job of downloader.jobs.values()) {
        job.onDone({
          ok: false,
          cancelled: true,
          message: 'Téléchargement annulé.',
        });
      }

      downloader.jobs.clear();
    };

    manager.shutdown();
    const record = manager.downloads.get(started.downloadId);

    assert.equal(record.state, 'interrupted');
    assert.match(record.message, /arrêt de l’application/);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('resume utilise DownloadItem.canResume pour un fichier direct', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory } = makeManager({ downloader });
  let resumed = false;

  try {
    manager.downloads.set(1, {
      id: 1,
      url: 'https://example.test/file.zip',
      kind: 'file',
      state: 'interrupted',
      private: false,
    });
    manager.activeItems.set(1, {
      canResume: () => true,
      resume: () => {
        resumed = true;
      },
    });

    const result = manager.resume(1, {});
    assert.equal(result.ok, true);
    assert.equal(resumed, true);
    assert.equal(manager.downloads.get(1).state, 'progressing');
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('les URL de téléchargement avec identifiants intégrés sont refusées', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory } = makeManager({ downloader });

  try {
    assert.equal(
      hasUrlCredentials('https://user:secret@example.test/video.mp4'),
      true,
    );
    assert.equal(
      hasUrlCredentials('https://user@example.test/video.mp4'),
      true,
    );
    assert.equal(
      hasUrlCredentials('https://example.test/video.mp4'),
      false,
    );
    assert.equal(
      isSafeDownloadUrl('https://user:secret@example.test/video.mp4'),
      false,
    );

    const inspected = await manager.inspectUrl({
      url: 'https://user:secret@example.test/video.mp4',
    });
    assert.equal(inspected.ok, false);
    assert.match(inspected.message, /identifiants intégrés/);

    const started = await manager.startUrlDownload({
      url: 'https://user:secret@example.test/video.mp4',
    });
    assert.equal(started.ok, false);
    assert.match(started.message, /identifiants intégrés/);

    const stream = await manager.startMediaDownload({
      url: 'https://user:secret@example.test/live.m3u8',
      extension: 'm3u8',
      access: {},
    });
    assert.equal(stream.ok, false);
    assert.match(stream.message, /identifiants intégrés/);
    assert.equal(downloader.jobs.size, 0);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('les noms de fichiers de téléchargement ne peuvent pas sortir du dossier', () => {
  assert.equal(sanitizeFilename('..'), 'telechargement');
  assert.equal(sanitizeFilename('../'), 'telechargement');
  assert.equal(sanitizeFilename('...'), 'telechargement');
  assert.equal(sanitizeFilename('CON'), '_CON');
  assert.equal(sanitizeFilename('LPT9.txt'), '_LPT9.txt');
  assert.equal(sanitizeFilename('facture..'), 'facture');
  assert.equal(sanitizeFilename('a'.repeat(500)).length, 180);
  assert.equal(
    getFilenameFromUrl('https://example.test/%2e%2e'),
    'telechargement',
  );
  assert.equal(
    getFilenameFromUrl('https://example.test/%2e%2e%2fsecret.txt'),
    'secret.txt',
  );
});

test('les valeurs d’en-tête de téléchargement neutralisent les retours à la ligne', () => {
  assert.equal(
    sanitizeHeaderValue('https://example.test/\r\nX-Injected: oui'),
    'https://example.test/ X-Injected: oui',
  );
  assert.equal(
    sanitizeHeaderValue('Think-Test\nX-Injected: oui'),
    'Think-Test X-Injected: oui',
  );
  assert.equal(
    sanitizeHeaderValue('Think-Test\0\u0007 injecté'),
    'Think-Test injecté',
  );
  assert.equal(sanitizeHeaderValue(null), '');
});

test('une redirection vers des identifiants ou un protocole interdit est refusée', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory } = makeManager({ downloader });

  try {
    for (const finalUrl of [
      'https://user:secret@example.test/video.mp4',
      'file:///etc/passwd',
    ]) {
      manager.session.fetch = async () => ({
        ok: true,
        status: 200,
        url: finalUrl,
        headers: new Headers({ 'content-type': 'video/mp4' }),
        body: { cancel: async () => {} },
      });

      const result = await manager.inspectUrl({
        url: 'https://example.test/redirect.mp4',
      });

      assert.equal(result.ok, false, finalUrl);
      assert.match(result.message, /redirection/i);
    }
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('une page de lecture YouTube est refusée avec un message explicite', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory, session } = makeManager({ downloader });
  let fetches = 0;

  session.fetch = async () => {
    fetches += 1;
    throw new Error('aucune requête ne doit être faite pour une page');
  };

  try {
    const urls = [
      'https://www.youtube.com/watch?v=yF4e6mZDVYc&list=RDyF4e6mZDVYc',
      'https://youtu.be/yF4e6mZDVYc',
      'https://www.youtube.com/shorts/yF4e6mZDVYc',
    ];

    for (const url of urls) {
      assert.equal(isMediaPageUrl(url), true, url);

      const inspected = await manager.inspectUrl({ url });
      assert.equal(inspected.ok, false, url);
      assert.equal(inspected.code, 'media-page', url);
      assert.equal(inspected.message, MEDIA_PAGE_MESSAGE, url);

      const started = await manager.startUrlDownload({ url });
      assert.equal(started.ok, false, url);
      assert.equal(started.code, 'media-page', url);
      assert.equal(started.message, MEDIA_PAGE_MESSAGE, url);
    }

    assert.equal(
      isMediaPageUrl(
        'https://www.youtube.com/videoplayback?expire=1&itag=18',
      ),
      false,
    );
    assert.equal(fetches, 0);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('les fichiers directs partent immédiatement vers Chromium sans HEAD', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory, session } = makeManager({ downloader });
  const downloaded = [];
  let fetches = 0;

  session.downloadURL = (url) => downloaded.push(url);
  session.fetch = async () => {
    fetches += 1;
    throw new Error('HEAD ne doit pas bloquer le téléchargement');
  };

  try {
    for (const url of [
      'https://example.test/video.mp4',
      'https://example.test/archive.zip',
      'https://example.test/document.pdf',
    ]) {
      const result = await manager.startUrlDownload({ url });
      assert.equal(result.ok, true, url);
      assert.equal(result.mode, 'file', url);
    }

    assert.equal(fetches, 0);
    assert.deepEqual(downloaded, [
      'https://example.test/video.mp4',
      'https://example.test/archive.zip',
      'https://example.test/document.pdf',
    ]);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('un faux .mp4 HTML est annulé dès que Chromium annonce son type MIME', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory, events, session } = makeManager({ downloader });
  const downloaded = [];

  session.downloadURL = (url) => downloaded.push(url);
  session.fetch = async () => ({
    ok: true,
    status: 200,
    url: 'https://example.test/video.mp4',
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    body: { cancel: async () => {} },
  });

  try {
    const inspected = await manager.inspectUrl({
      url: 'https://example.test/video.mp4',
    });

    assert.equal(inspected.ok, false);
    assert.equal(inspected.code, 'invalid-media');
    assert.equal(
      inspected.message,
      'Ce lien ne pointe pas vers un fichier vidéo direct valide',
    );

    const started = await manager.startUrlDownload({
      url: 'https://example.test/video.mp4',
    });

    assert.equal(started.ok, true);
    assert.deepEqual(downloaded, ['https://example.test/video.mp4']);

    let prevented = false;
    let cancelled = false;
    const item = {
      getFilename: () => 'video.mp4',
      getURL: () => 'https://example.test/video.mp4',
      getMimeType: () => 'text/html; charset=utf-8',
      cancel: () => {
        cancelled = true;
      },
    };

    session.willDownload(
      {
        preventDefault: () => {
          prevented = true;
        },
      },
      item,
      undefined,
    );

    assert.equal(prevented, true);
    assert.equal(cancelled, true);
    assert.equal(
      events.at(-1).channel,
      'app:notification',
    );
    assert.equal(
      events.at(-1).record.message,
      'Ce lien ne pointe pas vers un fichier vidéo direct valide',
    );
    assert.equal(events.at(-1).record.variant, 'error');
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('un manifeste .m3u8 est envoyé directement à la file ffmpeg', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory } = makeManager({ downloader });

  manager.session.fetch = async () => {
    throw new Error('aucune requête HEAD ne doit être faite');
  };

  try {
    const result = await manager.startUrlDownload({
      url: 'https://example.test/live.m3u8',
      pageUrl: 'https://example.test/watch',
      access: {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'stream');
    assert.equal(result.streamType, 'hls');
    assert.equal(downloader.jobs.size, 1);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('un média extrait en .mp4 est vérifié avant le téléchargement', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory } = makeManager({ downloader });
  const downloaded = [];

  manager.session.downloadURL = (url) => downloaded.push(url);
  manager.session.fetch = async () => ({
    ok: true,
    status: 200,
    url: 'https://example.test/video.mp4',
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    body: { cancel: async () => {} },
  });

  try {
    const result = await manager.startMediaDownload({
      url: 'https://example.test/video.mp4',
      extension: 'mp4',
      pageUrl: 'https://example.test/page',
      access: {},
    });

    assert.equal(result.ok, false);
    assert.equal(
      result.message,
      'Ce lien ne pointe pas vers un fichier vidéo direct valide',
    );
    assert.deepEqual(downloaded, []);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('un média déjà identifié comme vidéo ne refait pas de requête HEAD', async () => {
  const downloader = new FakeVideoDownloader();
  const { manager, directory } = makeManager({ downloader });
  const downloaded = [];

  manager.session.downloadURL = (url) => downloaded.push(url);
  manager.session.fetch = async () => {
    throw new Error('la vérification ne doit pas être relancée');
  };

  try {
    const result = await manager.startMediaDownload({
      url: 'https://example.test/video.mp4',
      extension: 'mp4',
      pageUrl: 'https://example.test/page',
      access: {},
      contentType: 'video/mp4',
    });

    assert.equal(result.ok, true);
    assert.deepEqual(downloaded, ['https://example.test/video.mp4']);
  } finally {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
