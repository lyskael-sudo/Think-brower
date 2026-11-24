'use strict';

/**
 * Think-Browser — avis de sécurité locaux et limites connues.
 *
 * Ce fichier n'est pas un flux de vulnérabilités distant : il documente les
 * risques résiduels et les décisions d'architecture de la version embarquée.
 * Il est affiché par `about:security` pour éviter une promesse de protection
 * totale. Les avis sont mis à jour avec le code, jamais téléchargés.
 *
 * @module shared/securityNotices
 */

/** Version de référence des avis embarqués. */
const SECURITY_NOTICE_VERSION = '2.0.0';

/**
 * Avis locaux. `severity` décrit l'impact potentiel, `status` précise si le
 * risque est corrigé, accepté ou simplement documenté.
 */
const SECURITY_NOTICES = Object.freeze([
  Object.freeze({
    id: 'TB-SEC-001',
    title: 'Sandbox du renderer hôte désactivée',
    severity: 'moyenne',
    status: 'limite acceptée',
    affected: '2.0.0',
    detail:
      'Le preload de l’interface hôte lit des fragments HTML avec le module ' +
      'fs ; la sandbox Electron est donc désactivée. Une faille dans le ' +
      'renderer local aurait plus de portée qu’avec une sandbox active.',
    mitigation:
      'Le renderer ne charge aucun contenu distant, nodeIntegration reste ' +
      'désactivé, contextIsolation est actif et le pont preload est limité par ' +
      'des listes explicites. Les pages web sont isolées dans des webviews ' +
      'sandboxées.',
  }),
  Object.freeze({
    id: 'TB-SEC-002',
    title: 'Terminal de about:dev non sandboxé',
    severity: 'élevée si le code exécuté n’est pas fiable',
    status: 'limite acceptée et signalée',
    affected: '2.0.0',
    detail:
      'Les commandes autorisées et les fichiers exécutés par about:dev ' +
      'héritent des droits du compte utilisateur. Le terminal n’est pas une ' +
      'sandbox de sécurité et npm/npx peuvent exécuter du code tiers.',
    mitigation:
      'Seules des commandes explicitement autorisées sont lancées, sans shell, ' +
      'avec des limites de sortie et de durée. L’interface affiche un ' +
      'avertissement. N’exécutez que des projets de confiance.',
  }),
  Object.freeze({
    id: 'TB-SEC-003',
    title: 'Aucune mise à jour automatique ni veille CVE distante',
    severity: 'moyenne',
    status: 'limite acceptée',
    affected: '2.0.0',
    detail:
      'Think-Browser n’embarque pas de canal de mise à jour signé ni de flux ' +
      'de bulletins de sécurité distant. Les composants Electron et Chromium ' +
      'peuvent donc vieillir entre deux distributions.',
    mitigation:
      'Reconstruisez l’application depuis les sources avec une version ' +
      'd’Electron à jour, puis exécutez `npm run audit:security` avant toute ' +
      'distribution. Consultez SECURITY-AUDIT.md.',
  }),
  Object.freeze({
    id: 'TB-SEC-004',
    title: 'Les téléchargements ne sont pas analysés comme des malwares',
    severity: 'information',
    status: 'limite acceptée',
    affected: '2.0.0',
    detail:
      'Le navigateur vérifie les URL, les noms de fichiers et les en-têtes, ' +
      'mais ne scanne pas le contenu téléchargé avec un antivirus.',
    mitigation:
      'Téléchargez uniquement depuis des sources de confiance et conservez ' +
      'l’antivirus du système d’exploitation actif.',
  }),
  Object.freeze({
    id: 'TB-SEC-005',
    title: 'Extensions distantes, DRM et anti-bot non pris en charge',
    severity: 'information',
    status: 'limitation fonctionnelle',
    affected: '2.0.0',
    detail:
      'Les extensions arbitraires, le contournement de DRM, des CAPTCHA, des ' +
      'paywalls et des flux MSE/blob ne sont pas implémentés. Ces limites sont ' +
      'volontaires et ne doivent pas être présentées comme des failles à ' +
      'contourner.',
    mitigation:
      'Utilisez les fonctions fournies par le site ou un navigateur adapté. ' +
      'Les extensions internes sont déclaratives et ne chargent aucun code ' +
      'distant.',
  }),
  Object.freeze({
    id: 'TB-SEC-006',
    title: 'Surface héritée de Chromium et d’Electron',
    severity: 'variable selon les versions',
    status: 'veille manuelle',
    affected: '2.0.0',
    detail:
      'Les pages web s’exécutent dans Chromium. Une vulnérabilité du moteur ou ' +
      'd’Electron peut affecter le navigateur indépendamment du code applicatif.',
    mitigation:
      'Surveillez les avis Electron/Chromium, mettez à jour les dépendances et ' +
      'rejouez l’audit et les tests d’intégration après chaque montée de version.',
  }),
]);

/** Limites visibles dans le tableau de bord. */
const SECURITY_LIMITATIONS = Object.freeze([
  'La sandbox du renderer hôte est désactivée (preload avec accès fs).',
  'Le terminal et l’exécution de about:dev ne sont pas une sandbox.',
  'Aucun scan antivirus des fichiers téléchargés.',
  'Aucune mise à jour automatique signée ni flux de sécurité distant.',
  'Extensions distantes, DRM, anti-bot, paywalls et flux MSE/blob non pris en charge.',
  'Les paquets Windows doivent être construits et testés sur Windows.',
]);

/** Politique de mise à jour et de signalement, affichée localement. */
const SECURITY_POLICY = Object.freeze({
  update:
    'Mises à jour manuelles : reconstruire depuis les sources, vérifier les ' +
    'versions Electron/Chromium et exécuter `npm run audit:security` puis ' +
    '`npm run test:integration`.',
  reporting:
    'Les signalements restent locaux dans cette version : consultez ' +
    'SECURITY-AUDIT.md et joignez les journaux minimaux sans cookies ni secrets.',
  telemetry:
    'Aucune télémétrie silencieuse. Les diagnostics de about:security ne ' +
    'quittent pas le processus principal.',
});

module.exports = {
  SECURITY_LIMITATIONS,
  SECURITY_NOTICES,
  SECURITY_NOTICE_VERSION,
  SECURITY_POLICY,
};
