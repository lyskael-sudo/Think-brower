# Think-Browser — feuille de route

**Version :** 2.0.0  
**État au 27 octobre 2026 :** Lots 6 à 10 terminés sur Linux, avec les écarts
et limites explicitement documentés ci-dessous. La validation Windows reste à
effectuer sur une machine Windows.

Les Lots 1 à 5 sont documentés dans le `README.md`. Ce fichier décrit le
périmètre réellement livré pour les Lots 6 à 10, les choix de sécurité et ce
qui reste volontairement hors périmètre.

## Synthèse

| Lot | État | Périmètre livré | Écart principal |
|---|---|---|---|
| 6 — Extensions internes | Terminé | Catalogue déclaratif Thèmes/Langues, panneau Extensions, persistance, diffusion multi-fenêtres | Aucune installation d’extension arbitraire ni compatibilité Chrome Web Store |
| 7 — Téléchargement par lien et pages internes | Terminé | `about:config`, `about:security`, inspection HTTP(S), cookies/UA/Referer, file de flux | Pas de contournement DRM, anti-bot, paywall ou flux MSE/`blob:` |
| 8 — `about:dev` | Terminé avec écarts | Espace choisi nativement, explorateur, éditeur, aperçus sandboxés, exécution, terminal restreint | Éditeur simple sans coloration syntaxique ni import/export/auto-save ; terminal non sandboxé |
| 9 — Audit concret | Terminé sur Linux | Audit statique, tests d’intrusion, intégration Electron, audit npm, paquets Linux | Tests Windows et signature de code à effectuer sur Windows |
| 10 — Transparence sécurité | Terminé | Avis locaux `TB-SEC-*`, posture, cookies/permissions/HTTP, limites et politique de mise à jour | Pas de flux CVE distant ni canal de signalement hébergé |

## Lot 6 — Extensions internes : thèmes et langues

**Objectif** : fournir un socle d’extensions embarquées sans charger de code
distant ni ouvrir une surface d’attaque supplémentaire.

**Livré :**

- registre déclaratif fermé avec manifeste, identifiant, version, permissions
  documentaires et état activé/désactivé ;
- extension **Thèmes Think** : thèmes `dark`, `light` et `midnight`, appliqués
  uniquement à l’interface hôte ;
- extension **Langues Think** : français et anglais, avec couverture
  progressive du chrome, des menus et des panneaux principaux ;
- panneau **Extensions** accessible depuis le menu principal ;
- validation des identifiants dans le processus principal, persistance des
  choix et diffusion des changements aux fenêtres ouvertes ;
- désactivation d’une extension avec réinitialisation de son option associée.

**Écarts et limites :**

- aucune installation d’extension arbitraire, aucun magasin distant, aucun
  content script tiers et aucune compatibilité Chrome Web Store ;
- la traduction anglaise n’est pas exhaustive : certains messages dynamiques,
  erreurs réseau et textes secondaires peuvent rester en français ;
- le thème ne modifie jamais l’apparence des pages web.

**Preuves :** `tests/extensions.test.js`, test d’intégration du catalogue, du
changement de thème et de langue, `npm run check`.

## Lot 7 — Téléchargement par lien et pages internes

**Objectif** : télécharger un média à partir d’une URL fournie par
l’utilisateur et exposer les réglages avancés dans des pages internes.

**Livré :**

- dialogue **Télécharger un lien** et route d’inspection depuis
  `about:config` ;
- validation HTTP(S), refus des identifiants intégrés, inspection du type, de
  la taille et des capacités ffmpeg ;
- réutilisation des cookies de la session source et ajout contrôlé du
  `Referer`/`User-Agent`, avec nettoyage des valeurs d’en-têtes ;
- téléchargement direct via Chromium ou manifeste HLS/DASH via la file ffmpeg ;
- page `about:config` : recherche, accueil, thème, langue, zoom, dossier de
  téléchargement, Referer, concurrence des flux (1 à 4), extensions,
  confidentialité, maintenance, inspection et démarrage d’un lien ;
- page `about:security` : posture, cookies, permissions, historique HTTP non
  chiffré, cache, téléchargements récents, nettoyage, avis `TB-SEC-*` et
  limites ;
- isolation de la session privée : `about:config` ne démarre pas de lien direct
  dans une fenêtre privée ; le dialogue de la fenêtre est requis ;
- validation de l’URL finale après redirection avant tout téléchargement.

**Écarts et limites :**

- aucun contournement de DRM, de CAPTCHA, de paywall ou de protection
  anti-bot ;
- les flux MSE exposés uniquement via `blob:` et les manifestes chiffrés ne
  sont pas pris en charge ;
- le téléchargement « tous sites » n’est pas promis : les sites qui exigent des
  API de périphériques, une détection spécifique ou des protections actives
  restent hors de portée ;
- en navigation privée, les téléchargements directs depuis `about:config` sont
  volontairement refusés pour ne pas mélanger les partitions.

**Preuves :** `tests/downloadManager.test.js`, `tests/pageProtocol.test.js`,
`tests/utils.test.js`, test d’intégration de `about:config`,
`about:security` et du téléchargement direct.

## Lot 8 — Environnement de développement `about:dev`

**Objectif** : fournir un atelier local dans une page interne, sans exposer
Node.js au code édité.

**Livré :**

- espace de travail choisi exclusivement par le sélecteur natif ;
- explorateur de fichiers avec création, lecture, écriture, renommage et
  suppression, racine protégée ;
- éditeur à onglets avec numéros de ligne, suivi des modifications non
  enregistrées et enregistrement explicite (`Ctrl+S`) ;
- aperçu HTML, CSS et JavaScript avec jeton temporaire, base relative vers
  `/file/`, iframe sandboxée et CSP fermée ;
- détection des interpréteurs Node, Python, PHP et Go dans le `PATH` ;
- exécution de fichiers avec sortie bornée et durée limitée ;
- terminal restreint avec liste fermée de commandes, `execFile` sans shell,
  refus des opérateurs shell et limite de sortie ;
- confinement des chemins, refus des traversées, des chemins absolus, des
  liens symboliques et des fichiers sensibles ; limite de 1 Mo par fichier.

**Écarts et limites :**

- l’éditeur est volontairement simple : pas de coloration syntaxique avancée,
  pas d’autocomplétion ni de serveur de langage ;
- l’import/export de projet et la sauvegarde automatique ne sont pas
  implémentés ; l’enregistrement reste explicite ;
- l’exécution et le terminal **ne sont pas des sandbox de sécurité** : le code
  hérite des droits du compte utilisateur, et `npm`, `npx` ou `git` peuvent
  exécuter du code tiers ;
- les hardlinks et les courses TOCTOU restent des risques résiduels ;
- les interpréteurs doivent être installés et détectables dans le `PATH`.

**Preuves :** `tests/devWorkspace.test.js`, test d’intégration des opérations
fichiers, de l’aperçu sandboxé, de l’exécution Node et du terminal.

## Lot 9 — Audit de sécurité concret

**Objectif** : vérifier les surfaces sensibles de manière reproductible avant
distribution.

**Livré :**

- audit statique `scripts/securityAudit.js` avec contrôles `HOST-*`,
  `GUEST-*`, `TLS-*`, `PAGE-*`, `DEV-*`, `DL-*`, `SEC-*`, `BUILD-*` et
  `DYN-*` ;
- tests d’intrusion sur les routes internes, les chemins, les symlinks, le
  terminal, les cookies, les redirections et les téléchargements ;
- tests de non-régression unitaires et test d’intégration Electron avec
  serveur HLS local ;
- audit des dépendances de production et de développement ;
- vérification de la configuration de distribution, de l'asar et des binaires
  ffmpeg/ffprobe dépaquetés ;
- paquets Linux 2.0.0 reconstruits, puis intégration rejouée sur
  `dist/linux-unpacked` et sur l’AppImage ;
- rapport détaillé dans [`SECURITY-AUDIT.md`](SECURITY-AUDIT.md).

**Résultat de référence au 27 octobre 2026 :**

```text
npm run audit:security
18 contrôle(s) réussi(s), 3 avertissement(s), 0 échec(s).

npm run audit:dependencies
0 vulnérabilité signalée (production et développement).

npm test
80 tests réussis.

npm run test:integration
Test d’intégration réussi : 127.0.0.1-video.mp4, 1 média(s) extrait(s),
pistes audio 1.
```

**Écarts et limites :**

- les paquets Windows n’ont pas été construits ni exécutés sur ce poste Linux ;
  ils doivent être validés sur Windows ;
- aucun audit externe, fuzzing Chromium ou analyse mémoire n’a été réalisé ;
- l’audit statique recherche des motifs connus et ne prouve pas l’absence de
  toute faille logique ;
- les dialogues natifs et certaines interactions de bureau ne sont pas
  couverts en mode headless.

## Lot 10 — Transparence et veille sécurité

**Objectif** : informer l’utilisateur sans promettre une protection totale.

**Livré :**

- tableau de bord `about:security` avec posture, contrôles, cookies,
  permissions, historique HTTP, cache, téléchargements et actions de nettoyage ;
- avis locaux `TB-SEC-001` à `TB-SEC-006` avec sévérité, statut, version
  concernée, détail et atténuation ;
- rappel explicite des limites : sandbox hôte, terminal `about:dev`,
  antivirus, mises à jour signées, DRM/anti-bot, extensions distantes ;
- politique de mise à jour manuelle et procédure de signalement locale ;
- isolation de la synthèse en navigation privée : les données de la session
  normale ne sont pas exposées ;
- aucune télémétrie, aucun envoi de cookies ou de diagnostics sans action
  explicite.

**Écarts et limites :**

- pas de flux CVE distant, pas d’auto-updater signé et pas de canal de
  signalement hébergé ; les coordonnées de publication restent à remplacer
  avant une distribution publique ;
- les avis embarqués sont mis à jour avec le code, pas automatiquement depuis
  Internet ;
- la veille Chromium/Electron reste manuelle.

**Preuves :** `src/shared/securityNotices.js`, `tests/pageProtocol.test.js`,
test d’intégration de `about:security`.

## Règles communes conservées

- interface et commentaires en français, architecture modulaire maintenue ;
- aucune falsification des API de détection, aucun contournement de DRM ou de
  protection anti-bot ;
- toute fonctionnalité nouvelle est couverte par des tests et documentée dans
  le `README.md` ;
- les paquets Linux et Windows restent les seules cibles de distribution ;
- les limites de sécurité sont affichées dans l’application et ne sont pas
  présentées comme des fonctionnalités à contourner.
