'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('le menu principal ne révèle pas les pages about: internes', () => {
  const toolbar = fs.readFileSync(
    path.join(root, 'src/renderer/partials/toolbar.html'),
    'utf8',
  );
  const app = fs.readFileSync(
    path.join(root, 'src/renderer/js/app.js'),
    'utf8',
  );
  const menu = fs.readFileSync(
    path.join(root, 'src/renderer/js/ui/menu.js'),
    'utf8',
  );

  for (const page of ['config', 'security', 'dev']) {
    assert.equal(
      toolbar.includes(`data-action="about-${page}"`),
      false,
      `Le menu contient encore about:${page}.`,
    );
    assert.equal(
      app.includes(`case 'about-${page}'`),
      false,
      `Le renderer contient encore l’action about:${page}.`,
    );
  }

  assert.equal(toolbar.includes('about:config'), false);
  assert.equal(toolbar.includes('about:security'), false);
  assert.equal(toolbar.includes('about:dev'), false);
  assert.equal(menu.includes('about:config'), false);
  assert.equal(menu.includes('about:security'), false);
  assert.equal(menu.includes('about:dev'), false);
});
