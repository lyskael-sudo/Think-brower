'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('../src/renderer/js/eventEmitter');

test('removeAllListeners supprime les auditeurs d’un événement', () => {
  const emitter = new EventEmitter();
  let calls = 0;

  emitter.on('close-request', () => {
    calls += 1;
  });
  emitter.on('other', () => {
    calls += 1;
  });

  emitter.removeAllListeners('close-request');
  emitter.emit('close-request');
  emitter.emit('other');

  assert.equal(calls, 1);
});

test('removeAllListeners sans argument vide tous les événements', () => {
  const emitter = new EventEmitter();
  let calls = 0;

  emitter.on('a', () => {
    calls += 1;
  });
  emitter.on('b', () => {
    calls += 1;
  });

  emitter.removeAllListeners();
  emitter.emit('a');
  emitter.emit('b');

  assert.equal(calls, 0);
});

test('destroy d’un onglet peut retirer tous ses auditeurs', () => {
  const emitter = new EventEmitter();
  let closed = 0;

  emitter.on('close-request', () => {
    closed += 1;
  });
  emitter.removeAllListeners();
  emitter.emit('close-request');

  assert.equal(closed, 0);
});
