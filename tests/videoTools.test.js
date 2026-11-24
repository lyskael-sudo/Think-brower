'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  VideoTools,
  parseProbeOutput,
} = require('../src/main/videoTools');

const PROBE_FIXTURE = JSON.stringify({
  format: {
    duration: '42.5',
    format_name: 'hls,applehttp',
    bit_rate: '1200000',
  },
  streams: [
    {
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      width: 1920,
      height: 1080,
      bit_rate: '1000000',
      disposition: { default: 1 },
    },
    {
      index: 1,
      codec_type: 'audio',
      codec_name: 'aac',
      channels: 2,
      tags: { language: 'fr', title: 'Français' },
      disposition: { default: 1 },
    },
    {
      index: 2,
      codec_type: 'audio',
      codec_name: 'aac',
      channels: 6,
      tags: { language: 'en' },
      disposition: { default: 0 },
    },
    {
      index: 3,
      codec_type: 'subtitle',
      codec_name: 'webvtt',
      tags: { language: 'en', title: 'English' },
      disposition: { default: 0, forced: 1 },
    },
    {
      index: 4,
      codec_type: 'video',
      codec_name: 'mjpeg',
      width: 300,
      height: 300,
      disposition: { attached_pic: 1 },
    },
  ],
});

test('parseProbeOutput expose toutes les pistes avec leurs index absolus', () => {
  const metadata = parseProbeOutput(PROBE_FIXTURE);

  assert.equal(metadata.durationSeconds, 42.5);
  assert.equal(metadata.hasVideo, true);
  assert.equal(metadata.hasAudio, true);
  assert.equal(metadata.videoTracks.length, 1);
  assert.equal(metadata.audioTracks.length, 2);
  assert.equal(metadata.subtitleTracks.length, 1);

  assert.deepEqual(
    metadata.audioTracks.map((track) => track.index),
    [1, 2],
  );
  assert.equal(metadata.audioTracks[0].language, 'fr');
  assert.equal(metadata.audioTracks[0].isDefault, true);
  assert.equal(metadata.audioTracks[1].channels, 6);
  assert.equal(metadata.subtitleTracks[0].index, 3);
  assert.equal(metadata.subtitleTracks[0].isForced, true);
});

test('parseProbeOutput ignore les vignettes attachées', () => {
  const metadata = parseProbeOutput(PROBE_FIXTURE);
  assert.equal(metadata.videoTracks.some((track) => track.codec === 'mjpeg'), false);
});

test('inspectManifest distingue un HLS VOD d’un direct', async (t) => {
  const tools = new VideoTools();
  const originalFetch = global.fetch;
  const responses = new Map([
    [
      'https://example.test/master.m3u8',
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nmedia.m3u8\n',
    ],
    [
      'https://example.test/media.m3u8',
      '#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:2.0,\nseg.ts\n#EXT-X-ENDLIST\n',
    ],
  ]);

  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url) => {
    const body = responses.get(String(url));

    if (!body) {
      return new Response('', { status: 404 });
    }

    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/vnd.apple.mpegurl' },
    });
  };

  const vod = await tools.inspectManifest('https://example.test/master.m3u8');
  assert.equal(vod.isLive, false);
  assert.equal(vod.manifestType, 'hls-media');
  assert.equal(vod.durationSeconds, 2);

  responses.set(
    'https://example.test/live.m3u8',
    '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\nseg.ts\n',
  );

  const live = await tools.inspectManifest('https://example.test/live.m3u8');
  assert.equal(live.isLive, true);
});

test('inspectManifest lit le type dynamique DASH et sa durée', async (t) => {
  const tools = new VideoTools();
  const originalFetch = global.fetch;

  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async () =>
    new Response(
      '<MPD type="dynamic" mediaPresentationDuration="PT1H2M3S"></MPD>',
      { status: 200 },
    );

  const manifest = await tools.inspectManifest('https://example.test/live.mpd');
  assert.equal(manifest.isLive, true);
  assert.equal(manifest.manifestType, 'dash-dynamic');
  assert.equal(manifest.durationSeconds, 3723);
});
