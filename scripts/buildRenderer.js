'use strict';

/**
 * Think-Browser — compilation du renderer.
 *
 * Le renderer est empaqueté en un unique script navigateur. Cela permet de
 * conserver les modules CommonJS côté source tout en désactivant
 * `nodeIntegration` dans la fenêtre hôte.
 */

const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const outfile = path.join(
  root,
  'src',
  'renderer',
  'js',
  'bootstrap.bundle.js',
);

esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'renderer', 'js', 'bootstrap.js')],
  outfile,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome152'],
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'info',
});

console.log('[Renderer] Bundle écrit :', path.relative(root, outfile));
