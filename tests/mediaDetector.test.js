'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MediaDetector,
  isLikelyUiSoundUrl,
  isStreamingSegmentUrl,
  isTinyMedia,
} = require('../src/main/mediaDetector');

/**
 * Construit des en-têtes de réponse proches de ceux fournis par Electron.
 * @param {object} values
 * @returns {Record<string, string[]>}
 */
function headers(values) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, [String(value)]]),
  );
}

test('les sons d’interface sont écartés sans masquer les vrais médias audio', () => {
  assert.equal(
    isLikelyUiSoundUrl('https://example.test/assets/ui/click.mp3', 'mp3'),
    true,
  );
  assert.equal(
    isLikelyUiSoundUrl('https://example.test/sounds/notification.wav', 'wav'),
    true,
  );
  assert.equal(
    isLikelyUiSoundUrl('https://example.test/assets/audio/beep.mp3', 'mp3'),
    true,
  );
  assert.equal(
    isLikelyUiSoundUrl('https://example.test/audio/open.mp3', 'mp3'),
    true,
  );
  assert.equal(
    isLikelyUiSoundUrl('https://example.test/audio/failure.mp3', 'mp3'),
    true,
  );
  assert.equal(
    isLikelyUiSoundUrl('https://example.test/audio/no_input.mp3', 'mp3'),
    true,
  );
  assert.equal(
    isLikelyUiSoundUrl('https://example.test/audio/episode-12.mp3', 'mp3'),
    false,
  );
  assert.equal(
    isLikelyUiSoundUrl('https://example.test/audio/seg-001.m4a', 'm4a'),
    false,
  );
  assert.equal(
    isLikelyUiSoundUrl('https://example.test/podcasts/episode-12.mp3', 'mp3'),
    false,
  );
  assert.equal(
    isLikelyUiSoundUrl('https://example.test/video/click-demo.mp4', 'mp4'),
    false,
  );
});

test('les segments de streaming restent acceptés malgré leur petite taille', () => {
  assert.equal(
    isStreamingSegmentUrl('https://cdn.test/video/seg-001.mp4'),
    true,
  );
  assert.equal(
    isTinyMedia(12_000, 'mp4', 'https://cdn.test/video/seg-001.mp4'),
    false,
  );
  assert.equal(
    isTinyMedia(12_000, 'mp3', 'https://cdn.test/audio/theme.mp3'),
    true,
  );
  assert.equal(
    isTinyMedia(900, 'm3u8', 'https://cdn.test/live/index.m3u8'),
    false,
  );
});

test('un média direct est publié après réception des en-têtes', () => {
  const detector = new MediaDetector();

  detector.inspect({
    url: 'https://cdn.test/media/movie.mp4',
    resourceType: 'media',
    webContentsId: 42,
    referrer: 'https://site.test/watch',
  });

  assert.equal(detector.size, 0);

  const record = detector.inspectResponse({
    url: 'https://cdn.test/media/movie.mp4',
    statusCode: 200,
    responseHeaders: headers({
      'Content-Type': 'video/mp4',
      'Content-Length': 4_194_304,
    }),
  });

  assert.equal(record.extension, 'mp4');
  assert.equal(record.webContentsId, 42);
  assert.equal(record.referrer, 'https://site.test/watch');
  assert.equal(record.contentType, 'video/mp4');
  assert.equal(record.size, 4_194_304);
  assert.equal(detector.size, 1);
});

test('les fichiers minuscules, les pages HTML et les erreurs sont refusés', () => {
  const detector = new MediaDetector();

  detector.inspect({
    url: 'https://cdn.test/audio/theme.mp3',
    resourceType: 'media',
    webContentsId: 1,
  });
  assert.equal(
    detector.inspectResponse({
      url: 'https://cdn.test/audio/theme.mp3',
      statusCode: 200,
      responseHeaders: headers({
        'Content-Type': 'audio/mpeg',
        'Content-Length': 20_000,
      }),
    }),
    null,
  );

  detector.inspect({
    url: 'https://cdn.test/media/movie.mp4',
    resourceType: 'media',
    webContentsId: 1,
  });
  assert.equal(
    detector.inspectResponse({
      url: 'https://cdn.test/media/movie.mp4',
      statusCode: 200,
      responseHeaders: headers({
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': 2_000_000,
      }),
    }),
    null,
  );

  detector.inspect({
    url: 'https://cdn.test/media/error.mp4',
    resourceType: 'media',
    webContentsId: 1,
  });
  assert.equal(
    detector.inspectResponse({
      url: 'https://cdn.test/media/error.mp4',
      statusCode: 404,
      responseHeaders: headers({ 'Content-Type': 'text/html' }),
    }),
    null,
  );
});

test('un manifeste HLS minuscule est conservé', () => {
  const detector = new MediaDetector();

  detector.inspect({
    url: 'https://cdn.test/live/master.m3u8',
    resourceType: 'xhr',
    webContentsId: 8,
  });

  const record = detector.inspectResponse({
    url: 'https://cdn.test/live/master.m3u8',
    statusCode: 200,
    responseHeaders: headers({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Content-Length': 640,
    }),
  });

  assert.equal(record.extension, 'm3u8');
  assert.equal(record.size, 640);
});

test('une réponse 206 utilise la taille totale de Content-Range', () => {
  const detector = new MediaDetector();

  detector.inspect({
    url: 'https://cdn.test/media/partial.mp4',
    resourceType: 'media',
    webContentsId: 3,
  });

  const record = detector.inspectResponse({
    url: 'https://cdn.test/media/partial.mp4',
    statusCode: 206,
    responseHeaders: headers({
      'Content-Type': 'video/mp4',
      'Content-Length': 1024,
      'Content-Range': 'bytes 0-1023/5242880',
    }),
  });

  assert.equal(record.size, 5_242_880);
});

test('les flux YouTube sans extension sont reconnus par leur type MIME', () => {
  const detector = new MediaDetector();
  const videoUrl =
    'https://rr1---sn.googlevideo.com/videoplayback?expire=1&mime=video%2Fmp4&itag=137';
  const audioUrl =
    'https://rr1---sn.googlevideo.com/videoplayback?expire=1&mime=audio%2Fwebm&itag=251';

  detector.inspect({
    url: videoUrl,
    resourceType: 'media',
    webContentsId: 77,
    referrer: 'https://www.youtube.com/watch?v=test',
  });
  detector.inspect({
    url: audioUrl,
    resourceType: 'xhr',
    webContentsId: 77,
    referrer: 'https://www.youtube.com/watch?v=test',
  });

  const video = detector.inspectResponse({
    url: videoUrl,
    statusCode: 206,
    responseHeaders: headers({
      'Content-Type': 'video/mp4; codecs="avc1.640028"',
      'Content-Length': 1024,
      'Content-Range': 'bytes 0-1023/104857600',
    }),
  });
  const audio = detector.inspectResponse({
    url: audioUrl,
    statusCode: 206,
    responseHeaders: headers({
      'Content-Type': 'audio/webm; codecs="opus"',
      'Content-Length': 512,
      'Content-Range': 'bytes 0-511/5242880',
    }),
  });

  assert.equal(video.extension, 'mp4');
  assert.equal(video.contentType, 'video/mp4; codecs="avc1.640028"');
  assert.equal(audio.extension, 'webm');
  assert.equal(detector.size, 2);
});

test('une page HTML sans extension déguisée en flux est refusée', () => {
  const detector = new MediaDetector();
  const url = 'https://rr1---sn.googlevideo.com/videoplayback?mime=video%2Fmp4';

  detector.inspect({ url, resourceType: 'media', webContentsId: 1 });

  const record = detector.inspectResponse({
    url,
    statusCode: 200,
    responseHeaders: headers({
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': 5_000_000,
    }),
  });

  assert.equal(record, null);
  assert.equal(detector.size, 0);
});

test('les requêtes XHR banales sans indice média restent ignorées', () => {
  const detector = new MediaDetector();

  detector.inspect({
    url: 'https://api.test/v1/recommendations?video=123',
    resourceType: 'xhr',
    webContentsId: 1,
  });

  assert.equal(detector.pending.size, 0);
});

test('un manifeste sans extension mais avec paramètres est reconnu', () => {
  const detector = new MediaDetector();
  const url = 'https://cdn.test/stream/master?token=abc';

  detector.inspect({ url, resourceType: 'xhr', webContentsId: 2 });

  assert.equal(detector.pending.size, 1);

  const record = detector.inspectResponse({
    url,
    statusCode: 200,
    responseHeaders: headers({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Content-Length': 800,
    }),
  });

  assert.equal(record.extension, 'm3u8');
});

test('une réponse audio/vidéo sans candidat préalable est tout de même capturée', () => {
  const detector = new MediaDetector();

  const record = detector.inspectResponse({
    url: 'https://cdn.test/stream/play?id=42',
    statusCode: 200,
    resourceType: 'xhr',
    webContentsId: 9,
    responseHeaders: headers({
      'Content-Type': 'video/mp4',
      'Content-Length': 2_097_152,
    }),
  });

  assert.equal(record.extension, 'mp4');
  assert.equal(record.webContentsId, 9);
  assert.equal(detector.size, 1);
});

test('un faux média dont le type MIME est une image est refusé', () => {
  const detector = new MediaDetector();

  detector.inspect({
    url: 'https://cdn.test/media/fake.mp4',
    resourceType: 'media',
    webContentsId: 1,
  });

  const record = detector.inspectResponse({
    url: 'https://cdn.test/media/fake.mp4',
    statusCode: 200,
    responseHeaders: headers({
      'Content-Type': 'image/png',
      'Content-Length': 500_000,
    }),
  });

  assert.equal(record, null);
  assert.equal(detector.size, 0);
});
