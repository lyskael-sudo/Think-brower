'use strict';

/**
 * Think-Browser — réduction des binaires média après empaquetage.
 *
 * `ffprobe-static` et `@ffmpeg-installer` contiennent des exécutables pour
 * plusieurs systèmes. Seuls ceux de la plateforme et de l'architecture ciblées
 * sont conservés afin de ne pas livrer inutilement les binaires macOS ou
 * Windows dans un paquet Linux, et inversement.
 *
 * @module scripts/afterPack
 */

const fs = require('node:fs');
const path = require('node:path');

/** Correspondance entre l'énumération Arch d'electron-builder et les dossiers. */
const ARCH_NAMES = Object.freeze({
  0: 'ia32',
  1: 'x64',
  2: 'armv7l',
  3: 'arm64',
  4: 'universal',
});

/**
 * Supprime un dossier s'il existe.
 * @param {string} target
 */
function removeDirectory(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

/**
 * Réduit les binaires ffprobe à la plateforme et à l'architecture ciblées.
 * @param {string} modulesRoot
 * @param {string} platform
 * @param {string} arch
 */
function pruneFfprobe(modulesRoot, platform, arch) {
  const binRoot = path.join(modulesRoot, 'ffprobe-static', 'bin');

  if (!fs.existsSync(binRoot)) {
    return;
  }

  for (const platformEntry of fs.readdirSync(binRoot, {
    withFileTypes: true,
  })) {
    const platformPath = path.join(binRoot, platformEntry.name);

    if (!platformEntry.isDirectory()) {
      continue;
    }

    if (platformEntry.name !== platform) {
      removeDirectory(platformPath);
      continue;
    }

    for (const archEntry of fs.readdirSync(platformPath, {
      withFileTypes: true,
    })) {
      if (archEntry.isDirectory() && archEntry.name !== arch) {
        removeDirectory(path.join(platformPath, archEntry.name));
      }
    }
  }
}

/**
 * Réduit les binaires ffmpeg à la plateforme et à l'architecture ciblées.
 * @param {string} modulesRoot
 * @param {string} platform
 * @param {string} arch
 */
function pruneFfmpeg(modulesRoot, platform, arch) {
  const installerRoot = path.join(modulesRoot, '@ffmpeg-installer');

  if (!fs.existsSync(installerRoot)) {
    return;
  }

  const expected = `${platform}-${arch}`;

  for (const entry of fs.readdirSync(installerRoot, {
    withFileTypes: true,
  })) {
    if (
      entry.isDirectory() &&
      /^(linux|win32|darwin)-/.test(entry.name) &&
      entry.name !== expected
    ) {
      removeDirectory(path.join(installerRoot, entry.name));
    }
  }
}

/**
 * Vérifie que les binaires nécessaires à la plateforme ciblée sont présents.
 * @param {string} modulesRoot
 * @param {string} platform
 * @param {string} arch
 */
function assertMediaTools(modulesRoot, platform, arch) {
  const executable = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const probeExecutable = platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  const ffmpegPath = path.join(
    modulesRoot,
    '@ffmpeg-installer',
    `${platform}-${arch}`,
    executable,
  );
  const ffprobePath = path.join(
    modulesRoot,
    'ffprobe-static',
    'bin',
    platform,
    arch,
    probeExecutable,
  );

  if (!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
    throw new Error(
      `Binaires média absents pour ${platform}-${arch}. ` +
        'Construisez sur la plateforme cible afin que npm installe le paquet ' +
        '`@ffmpeg-installer` correspondant.',
    );
  }
}

/**
 * Point d'entrée du hook electron-builder.
 * @param {object} context
 * @param {string} context.appOutDir
 * @param {string} context.electronPlatformName
 * @param {number|string} [context.arch]
 * @returns {void}
 */
module.exports = function afterPack(context) {
  const platform = context.electronPlatformName;
  const arch =
    typeof context.arch === 'number'
      ? ARCH_NAMES[context.arch]
      : String(context.arch || '');

  if (!platform || !arch) {
    return;
  }

  const modulesRoot = path.join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
  );

  if (!fs.existsSync(modulesRoot)) {
    return;
  }

  pruneFfprobe(modulesRoot, platform, arch);
  pruneFfmpeg(modulesRoot, platform, arch);
  assertMediaTools(modulesRoot, platform, arch);
};
