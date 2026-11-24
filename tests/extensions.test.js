'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ExtensionManager } = require('../src/main/extensionManager');
const { Store } = require('../src/main/store');
const {
  DEFAULT_ENABLED_EXTENSIONS,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  EXTENSION_IDS,
  LANGUAGES,
  THEMES,
  normalizeEnabledExtensions,
} = require('../src/shared/extensions');

function makeStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'think-extension-test-'));
  const store = new Store({
    filePath: path.join(directory, 'data.json'),
    saveDelay: 0,
  });

  return { store, directory };
}

test('le catalogue expose deux extensions internes activées par défaut', () => {
  const { store, directory } = makeStore();

  try {
    const manager = new ExtensionManager({ store });
    const state = manager.getState();

    assert.equal(state.extensions.length, 2);
    assert.deepEqual(state.enabledExtensions, [...DEFAULT_ENABLED_EXTENSIONS]);
    assert.equal(state.theme, DEFAULT_THEME);
    assert.equal(state.language, DEFAULT_LANGUAGE);
    assert.ok(state.extensions.every((extension) => extension.enabled));
    assert.deepEqual(
      state.extensions.map((extension) => extension.id),
      [EXTENSION_IDS.THEME, EXTENSION_IDS.LANGUAGE],
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('changer de thème et de langue valide les identifiants', async () => {
  const { store, directory } = makeStore();

  try {
    const manager = new ExtensionManager({ store });

    const themed = await manager.setTheme('light');
    assert.equal(themed.theme, 'light');
    assert.equal(store.getSettings().theme, 'light');

    const translated = await manager.setLanguage('en');
    assert.equal(translated.language, 'en');
    assert.equal(store.getSettings().language, 'en');

    await assert.rejects(() => manager.setTheme('inconnu'), /Thème inconnu/);
    await assert.rejects(
      () => manager.setLanguage('inconnue'),
      /Langue inconnue/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('désactiver une extension réinitialise son option', async () => {
  const { store, directory } = makeStore();

  try {
    const manager = new ExtensionManager({ store });

    await manager.setTheme('midnight');
    await manager.setLanguage('en');

    const withoutTheme = await manager.setEnabled(EXTENSION_IDS.THEME, false);
    assert.equal(withoutTheme.theme, DEFAULT_THEME);
    assert.equal(withoutTheme.language, 'en');

    const withoutLanguage = await manager.setEnabled(
      EXTENSION_IDS.LANGUAGE,
      false,
    );
    assert.equal(withoutLanguage.language, DEFAULT_LANGUAGE);
    assert.deepEqual(withoutLanguage.enabledExtensions, []);

    await assert.rejects(
      () => manager.setTheme('light'),
      /Activez d’abord l’extension Thèmes/,
    );
    await assert.rejects(
      () => manager.setLanguage('en'),
      /Activez d’abord l’extension Langues/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('une extension inconnue ne peut pas être activée', async () => {
  const { store, directory } = makeStore();

  try {
    const manager = new ExtensionManager({ store });

    await assert.rejects(
      () => manager.setEnabled('evil.extension', true),
      /Extension inconnue/,
    );
    await assert.rejects(
      () => manager.setEnabled(EXTENSION_IDS.THEME, 'oui'),
      /État d’extension invalide/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('le Store refuse les thèmes, langues et listes invalides', async () => {
  const { store, directory } = makeStore();

  try {
    await assert.rejects(
      () => store.updateSettings({ theme: 'neon' }),
      /Thème inconnu/,
    );
    await assert.rejects(
      () => store.updateSettings({ language: 'xx' }),
      /Langue inconnue/,
    );
    await assert.rejects(
      () => store.updateSettings({ enabledExtensions: ['evil'] }),
      /Liste d’extensions invalide/,
    );

    const settings = await store.updateSettings({
      enabledExtensions: [EXTENSION_IDS.THEME],
      theme: 'light',
      language: 'en',
    });

    assert.equal(settings.theme, 'light');
    assert.equal(settings.language, DEFAULT_LANGUAGE);
    assert.deepEqual(settings.enabledExtensions, [EXTENSION_IDS.THEME]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('les catalogues de thèmes et de langues restent cohérents', () => {
  assert.ok(THEMES.dark);
  assert.ok(THEMES.light);
  assert.ok(THEMES.midnight);
  assert.equal(THEMES.dark.colorScheme, 'dark');
  assert.equal(THEMES.light.colorScheme, 'light');
  assert.equal(LANGUAGES.fr.locale, 'fr-FR');
  assert.equal(LANGUAGES.en.locale, 'en-US');
  assert.deepEqual(
    normalizeEnabledExtensions(['think.theme', 'think.theme', 'evil']),
    ['think.theme'],
  );
});
