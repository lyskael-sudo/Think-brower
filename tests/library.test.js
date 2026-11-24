'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatMediaDuration,
  getPlaybackProgress,
  sortLibraryEntries,
} = require('../src/renderer/js/ui/library');

test('les durées de la médiathèque sont affichées en HH:MM:SS', () => {
  assert.equal(formatMediaDuration(0), '');
  assert.equal(formatMediaDuration(65), '00:01:05');
  assert.equal(formatMediaDuration(3661), '01:01:01');
  assert.equal(formatMediaDuration(86_400), '24:00:00');
});

test('la progression de lecture est bornée et ignorée sans durée', () => {
  assert.deepEqual(getPlaybackProgress({ durationSeconds: 100, playPosition: 25 }), {
    ratio: 0.25,
    position: 25,
    duration: 100,
  });
  assert.equal(
    getPlaybackProgress({ durationSeconds: 100, playPosition: 250 }).ratio,
    1,
  );
  assert.equal(
    getPlaybackProgress({ durationSeconds: 0, playPosition: 25 }).ratio,
    0,
  );
});

test('la médiathèque se trie par date, nom ou durée', () => {
  const entries = [
    {
      title: 'Bêta',
      fileName: 'beta.mp4',
      addedAt: '2026-01-01T10:00:00.000Z',
      durationSeconds: 30,
    },
    {
      title: 'Alpha',
      fileName: 'alpha.mp4',
      addedAt: '2026-02-01T10:00:00.000Z',
      durationSeconds: 300,
    },
    {
      title: 'Gamma',
      fileName: 'gamma.mp4',
      addedAt: '2026-03-01T10:00:00.000Z',
      durationSeconds: 120,
    },
  ];

  assert.deepEqual(
    sortLibraryEntries(entries, 'date-desc').map((entry) => entry.title),
    ['Gamma', 'Alpha', 'Bêta'],
  );
  assert.deepEqual(
    sortLibraryEntries(entries, 'name-asc').map((entry) => entry.title),
    ['Alpha', 'Bêta', 'Gamma'],
  );
  assert.deepEqual(
    sortLibraryEntries(entries, 'duration-desc').map((entry) => entry.title),
    ['Alpha', 'Gamma', 'Bêta'],
  );
  assert.deepEqual(
    sortLibraryEntries(entries, 'inconnu').map((entry) => entry.title),
    ['Gamma', 'Alpha', 'Bêta'],
  );
});
