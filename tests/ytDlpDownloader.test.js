'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  YtDlpDownloader,
  parseSize,
} = require('../src/main/ytDlpDownloader');

const FAKE_YTDLP = `#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

if (process.argv.includes('--version')) {
  console.log('2026.10.31');
  process.exit(0);
}

const outputIndex = process.argv.indexOf('--output');
const outputTemplate =
  outputIndex >= 0 ? process.argv[outputIndex + 1] : '';
const outputPath = outputTemplate.replace('%(ext)s', 'mp4');

if (!outputPath) {
  console.error('destination absente');
  process.exit(2);
}

console.log('[youtube] Extracting URL: test');
console.log('[download]   0.0% of 1.00MiB at 1.00MiB/s ETA 00:01');
setTimeout(() => {
  console.log('[download]  50.0% of 1.00MiB at 1.00MiB/s ETA 00:00');
  setTimeout(() => {
    fs.writeFileSync(outputPath, Buffer.from('fake-video-data'));
    console.log('[download] 100% of 1.00MiB in 00:00');
    console.log('[Merger] Merging formats into "' + outputPath + '"');
    process.exit(0);
  }, 30);
}, 30);
`;

const FAKE_YTDLP_WEBM = `#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

if (process.argv.includes('--version')) {
  console.log('2026.10.31');
  process.exit(0);
}

const outputIndex = process.argv.indexOf('--output');
const outputTemplate =
  outputIndex >= 0 ? process.argv[outputIndex + 1] : '';
const outputPath = outputTemplate.replace('%(ext)s', 'webm');

if (!outputPath) {
  console.error('destination absente');
  process.exit(2);
}

fs.writeFileSync(outputPath, Buffer.from('fake-webm-data'));
console.log('[download] 100% of 1.00MiB in 00:00');
console.log('[Merger] Merging formats into "' + outputPath + '"');
process.exit(0);
`;

const FAKE_YTDLP_SLOW = `#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

if (process.argv.includes('--version')) {
  console.log('2026.10.31');
  process.exit(0);
}

const outputIndex = process.argv.indexOf('--output');
const outputTemplate =
  outputIndex >= 0 ? process.argv[outputIndex + 1] : '';
const outputPath = outputTemplate.replace('%(ext)s', 'mp4');

if (!outputPath) {
  console.error('destination absente');
  process.exit(2);
}

fs.writeFileSync(outputPath, Buffer.from('partial-data'));
console.log('[download]  10.0% of 10.00MiB at 1.00MiB/s ETA 00:09');
setInterval(() => {}, 1000);
process.on('SIGTERM', () => process.exit(143));
`;

test('parseSize convertit les unités affichées par yt-dlp', () => {
  assert.equal(parseSize('1.5', 'MiB'), 1572864);
  assert.equal(parseSize('2', 'KB'), 2000);
  assert.equal(parseSize('inconnu', 'MiB'), 0);
});

test(
  'détecte un faux yt-dlp et suit son téléchargement',
  { skip: process.platform === 'win32' },
  async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'think-ytdlp-test-'),
    );
    const executable = path.join(directory, 'yt-dlp');
    const outputPath = path.join(directory, 'youtube-test.mp4');
    const previous = process.env.THINK_YTDLP_PATH;

    fs.writeFileSync(executable, FAKE_YTDLP, { mode: 0o755 });
    process.env.THINK_YTDLP_PATH = executable;

    try {
      const downloader = new YtDlpDownloader();
      const capabilities = await downloader.getCapabilities(true);

      assert.equal(capabilities.available, true);
      assert.equal(capabilities.path, executable);
      assert.equal(capabilities.version, '2026.10.31');

      const updates = [];
      const done = new Promise((resolve) => {
        void downloader
          .start({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            outputPath,
            pageUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            ffmpegPath: '/usr/bin/ffmpeg',
            onUpdate: (patch) => updates.push(patch),
            onDone: resolve,
          })
          .then((started) => {
            assert.equal(started.ok, true);
            assert.match(started.jobId, /^ytdlp-/);
          });
      });

      const result = await done;

      assert.equal(result.ok, true);
      assert.equal(result.outputPath, outputPath);
      assert.ok(result.receivedBytes > 0);
      assert.equal(downloader.activeCount, 0);
      assert.ok(
        updates.some((patch) => patch.progress === 50),
        'La progression intermédiaire n’a pas été transmise.',
      );
      assert.ok(
        updates.some((patch) => patch.message?.includes('Fusion')),
        'La fusion n’a pas été signalée.',
      );
      assert.equal(fs.readFileSync(outputPath, 'utf8'), 'fake-video-data');
    } finally {
      if (previous === undefined) {
        delete process.env.THINK_YTDLP_PATH;
      } else {
        process.env.THINK_YTDLP_PATH = previous;
      }

      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);

test(
  'annule une tâche yt-dlp et supprime le fichier partiel',
  { skip: process.platform === 'win32' },
  async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'think-ytdlp-cancel-test-'),
    );
    const executable = path.join(directory, 'yt-dlp');
    const outputPath = path.join(directory, 'youtube-cancel.mp4');
    const previous = process.env.THINK_YTDLP_PATH;

    fs.writeFileSync(executable, FAKE_YTDLP_SLOW, { mode: 0o755 });
    process.env.THINK_YTDLP_PATH = executable;

    try {
      const downloader = new YtDlpDownloader();
      const done = new Promise((resolve) => {
        void downloader
          .start({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            outputPath,
            onDone: resolve,
          })
          .then((started) => {
            assert.equal(started.ok, true);
            assert.equal(downloader.cancel(started.jobId), true);
          });
      });

      const result = await done;

      assert.equal(result.ok, false);
      assert.equal(result.cancelled, true);
      assert.equal(downloader.activeCount, 0);
      assert.equal(fs.existsSync(outputPath), false);
    } finally {
      if (previous === undefined) {
        delete process.env.THINK_YTDLP_PATH;
      } else {
        process.env.THINK_YTDLP_PATH = previous;
      }

      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);

test(
  'retrouve la sortie réelle lorsque yt-dlp produit une autre extension',
  { skip: process.platform === 'win32' },
  async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'think-ytdlp-webm-test-'),
    );
    const executable = path.join(directory, 'yt-dlp');
    const outputPath = path.join(directory, 'youtube-webm.mp4');
    const previous = process.env.THINK_YTDLP_PATH;

    fs.writeFileSync(executable, FAKE_YTDLP_WEBM, { mode: 0o755 });
    process.env.THINK_YTDLP_PATH = executable;

    try {
      const downloader = new YtDlpDownloader();
      const done = new Promise((resolve) => {
        void downloader
          .start({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            outputPath,
            onDone: resolve,
          })
          .then((started) => {
            assert.equal(started.ok, true);
          });
      });

      const result = await done;

      assert.equal(result.ok, true);
      assert.match(result.outputPath, /\.webm$/);
      assert.equal(
        fs.readFileSync(result.outputPath, 'utf8'),
        'fake-webm-data',
      );
      assert.equal(fs.existsSync(outputPath), false);
    } finally {
      if (previous === undefined) {
        delete process.env.THINK_YTDLP_PATH;
      } else {
        process.env.THINK_YTDLP_PATH = previous;
      }

      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);
