# Think-Browser — audit de sécurité

**Version auditée :** 2.0.0  
**Date de l’audit :** 27 octobre 2026  
**Périmètre :** code applicatif Electron, pages internes `about:config`,
`about:security` et `about:dev`, pont preload, webviews, protocole
`think-page`, téléchargements par lien et atelier de développement local.

Cet audit est **reproductible et local**. Il ne prétend pas remplacer un audit
indépendant, un flux de vulnérabilités Chromium/Electron ou une analyse
antivirus des fichiers téléchargés.

## 1. Commandes de vérification

```bash
npm run check
npm run audit:security
npm run audit:dependencies
npm test
npm run test:integration
```

Pour tester un paquet déjà construit :

```bash
THINK_ELECTRON_BIN=dist/linux-unpacked/think-browser \
  npm run test:integration
```

L’audit statique et les tests d’intrusion unitaires ne nécessitent pas
d’affichage. Le test d’intégration lance Electron et nécessite un serveur X
(Linux) ou un bureau Windows.

### Résultat de référence

```text
npm run check
Vérification réussie : 77 module(s) JS, 10 feuille(s) CSS,
renderer isolé, tests présents, distribution Windows/Linux configurée.

npm run audit:security
18 contrôle(s) réussi(s), 3 avertissement(s), 0 échec(s).

npm run audit:dependencies
0 vulnérabilité signalée par npm audit (production et développement).

npm test
80 tests réussis, 0 échec.

npm run test:integration
Test d’intégration réussi : 127.0.0.1-video.mp4, 1 média(s) extrait(s),
pistes audio 1.

THINK_ELECTRON_BIN=dist/linux-unpacked/think-browser npm run test:integration
Test d’intégration réussi sur le paquet Linux décompressé.

THINK_ELECTRON_BIN=dist/Think-Browser-2.0.0-linux-x86_64.AppImage \
  APPIMAGE_EXTRACT_AND_RUN=1 npm run test:integration
Test d’intégration réussi sur l’AppImage.
```

Les paquets Linux 2.0.0 (AppImage, deb et `linux-unpacked`) ont été
reconstruits après les derniers durcissements. L’AppImage et le paquet
décompressé ont tous deux été rejoués avec le scénario d’intégration.

La base `npm audit` dépend du registre et de la date ; elle doit être rejouée
avant chaque distribution. Les binaires ffmpeg/ffprobe sont fournis par les
dépendances épinglées et dépaquetés depuis `app.asar.unpacked`.

Les trois avertissements sont des risques résiduels acceptés et documentés :
sandbox du renderer hôte désactivée, terminal `about:dev` non sandboxé et
absence de canal de mise à jour signé.

## 2. Modèle de menace

### Pris en compte

- une page web distante hostile chargée dans une webview ;
- une page interne qui tenterait de contourner ses propres contrôles ou de
  déclencher une action destructive par requête intersite ;
- un lien de téléchargement forgé (identifiants intégrés, redirection vers un
  schéma interdit, nom de fichier piégé, en-tête CRLF) ;
- un chemin ou un lien symbolique qui tenterait de sortir de l’espace
  `about:dev` ;
- une ressource d’aperçu (HTML, SVG, CSS, JavaScript) qui tenterait d’hériter
  de l’origine `think-page://dev` ou d’appeler les API locales ;
- une extension ou un fichier local malveillant dans l’atelier ;
- une navigation de la fenêtre hôte vers un document distant qui exposerait
  le preload de l’interface ;
- une fuite de données de la session normale dans `about:security` lorsque la
  page est ouverte en navigation privée.

### Hors périmètre

- un attaquant qui contrôle déjà le compte système ou le processus principal ;
- une vulnérabilité inconnue de Chromium, d’Electron ou du système ;
- le contournement de DRM, de CAPTCHA, de paywalls ou de flux MSE/`blob:` ;
- l’analyse antivirus du contenu téléchargé ;
- les paquets Windows non exécutés sur Windows ;
- les dialogues natifs et l’interface complète sous Xvfb headless.

## 3. Contrôles vérifiés

| Contrôle | Résultat | Preuve |
|---|---|---|
| Renderer hôte : `nodeIntegration:false`, `contextIsolation:true`, preload dédié | PASS | `HOST-01`, `tests/security.test.js` |
| Preload : pont `thinkBridge` et listes d’autorisation fermées | PASS | `HOST-02`, `tests/security.test.js` |
| Renderer : aucun module Node/Electron, aucun `eval`/`Function` | PASS | `HOST-03` |
| Fenêtre hôte : navigation confinée au document local | PASS | `HOST-05`, `tests/security.test.js` |
| Webviews : sandbox explicite, preload supprimé, navigation HTTP(S) | PASS | `GUEST-01`, `tests/security.test.js` |
| Navigation, menus contextuels et popups sans identifiants intégrés | PASS | `GUEST-02`, `tests/utils.test.js`, `tests/security.test.js` |
| TLS : aucune exception de certificat | PASS | `TLS-01`, `tests/security.test.js` |
| Pages internes : CSP `default-src 'none'`, origine API contrôlée | PASS | `PAGE-01`, `tests/pageProtocol.test.js` |
| Pages internes : mutations avec preuve interne et cookies confinés | PASS | `PAGE-02`, `tests/pageProtocol.test.js` |
| `about:dev` : espace choisi nativement, chemins confinés, symlinks refusés | PASS | `DEV-01`, `tests/devWorkspace.test.js` |
| `about:dev` : pas de shell, limites de taille et de durée | PASS | `DEV-02`, `tests/devWorkspace.test.js` |
| `about:dev` : aperçus et ressources en CSP sandbox | PASS | `DEV-03`, test d’intégration |
| Téléchargements : URL sans identifiants, noms de fichiers sûrs, en-têtes nettoyés | PASS | `DL-01`, `tests/downloadManager.test.js` |
| Redirections : URL finale validée, cookies non suivis, schémas refusés | PASS | `DL-02`, `tests/downloadManager.test.js` |
| Avis locaux et limites affichés dans `about:security` | PASS | `SEC-01`, test d’intégration |
| Données privées : synthèse isolée de la session normale | PASS | `SEC-02`, `tests/pageProtocol.test.js` |
| Distribution : asar et binaires ffmpeg/ffprobe dépaquetés | PASS | `BUILD-01` |
| Tests d’intrusion dynamiques des routes, fichiers, terminal et téléchargements | PASS | `DYN-01`, `npm test` |

## 4. Constats et corrections

### F-01 — Sandbox du renderer hôte désactivée — risque accepté

- **Gravité :** moyenne.
- **Fichier :** `src/main/windowManager.js` (`sandbox: false`).
- **Raison :** le preload lit des fragments HTML locaux avec `fs`.
- **Portée :** une faille dans le renderer local aurait plus de portée qu’avec
  une sandbox active.
- **Atténuation :** aucun contenu distant dans le renderer hôte,
  `nodeIntegration:false`, `contextIsolation:true`, pont preload à listes
  fermées, webviews sandboxées et navigation hôte confinée au fichier local.
- **Statut :** limite acceptée, affichée par `about:security` (`TB-SEC-001`).

### F-02 — Terminal `about:dev` non sandboxé — risque accepté

- **Gravité :** élevée si le code exécuté n’est pas fiable.
- **Fichier :** `src/main/devWorkspace.js`.
- **Détail :** les commandes et fichiers exécutés héritent des droits du compte
  utilisateur ; `npm`, `npx` et `git` peuvent exécuter du code tiers. Le
  terminal n’est pas une frontière de sécurité.
- **Atténuation :** liste fermée de commandes, exécution `execFile` sans shell,
  refus des opérateurs shell, limites de sortie (512 Ko) et de durée (30 s),
  avertissement explicite dans l’interface.
- **Statut :** limite acceptée et signalée (`TB-SEC-002`).

### F-03 — Nom de fichier de téléchargement `..` — corrigé

- **Gravité :** élevée (écriture hors du dossier de téléchargement).
- **Fichier :** `src/shared/utils.js`, `src/main/downloadManager.js`.
- **Correction :** `sanitizeFilename()` retire les points/espaces finaux, refuse
  `.` et `..`, préfixe les noms réservés Windows et borne la longueur à 180
  caractères. `#getUniquePath()` applique `path.basename()` et vérifie que le
  dossier parent reste le dossier de téléchargement.
- **Preuve :** `tests/utils.test.js`, `tests/downloadManager.test.js`.
- **Régression couverte :** `..`, `...`, `CON`, `LPT9.txt`, nom de 500
  caractères.

### F-04 — URL de téléchargement avec identifiants intégrés — corrigé

- **Gravité :** moyenne (fuite de secret dans les journaux/en-têtes, hôte
  masqué).
- **Fichier :** `src/shared/utils.js`, `src/main/downloadManager.js`.
- **Correction :** `hasUrlCredentials()` et `isSafeHttpUrl()` refusent
  `https://user:secret@…` pour l’inspection, le téléchargement direct, les
  flux, les redirections, les popups, les liens du menu contextuel et les
  nouvelles fenêtres. Le `Referer` et le `User-Agent` passent par
  `sanitizeHeaderValue()`.
- **Preuve :** `tests/downloadManager.test.js`, `tests/utils.test.js` et test
  d’intégration `about:config`.

### F-05 — Chemin d’espace de travail `about:dev` fourni par la page — corrigé

- **Gravité :** élevée (lecture/écriture hors du dossier choisi).
- **Fichier :** `src/main/devWorkspace.js`.
- **Correction :** `/api/dev/workspace` n’accepte plus que
  `{ action: 'choose' }`. Un chemin arbitraire est refusé ; le changement passe
  obligatoirement par le sélecteur natif. `about:config` ne peut pas non plus
  imposer un nouvel espace : il peut seulement préserver la valeur courante
  lors d’une réinitialisation.
- **Preuve :** `tests/devWorkspace.test.js`, `tests/pageProtocol.test.js`, test
  d’intégration.

### F-06 — Aperçu ou ressource `/file` sans sandbox au niveau supérieur — corrigé

- **Gravité :** moyenne (un HTML/SVG d’aperçu pouvait hériter de l’origine
  `think-page://dev` et appeler les API locales s’il était ouvert directement).
- **Fichier :** `src/main/devWorkspace.js`.
- **Correction :** toutes les réponses `/preview/` et `/file/` portent
  `Content-Security-Policy: sandbox …` ; les HTML ajoutent
  `frame-ancestors think-page://dev`, `base-uri think-page://dev`,
  `form-action 'none'` et `object-src 'none'`. Les ressources non HTML (SVG,
  CSS, médias) reçoivent `sandbox; default-src 'none'`.
- **Preuve :** `tests/devWorkspace.test.js` (HTML, SVG, CSS), test
  d’intégration (CSP réelle et aperçu CSS chargé dans l’iframe sandboxée).

### F-07 — Sandbox des webviews implicite — durcie

- **Fichier :** `src/main/security.js`.
- **Correction :** `webPreferences.sandbox = true` est désormais explicite pour
  chaque webview invitée, en plus de la suppression du preload et de
  `nodeIntegration:false`.
- **Preuve :** `tests/security.test.js`, test d’intégration de navigation.

### F-08 — Politique TLS implicite — durcie

- **Fichier :** `src/main/index.js`.
- **Correction :** un gestionnaire `certificate-error` appelle
  `event.preventDefault()` puis `callback(false)`. Aucune exception de
  certificat n’est accordée, même en cas d’erreur de chaîne ou de nom d’hôte.
- **Preuve :** `tests/security.test.js` (`TLS-01`).

### F-09 — En-têtes de téléchargement et CRLF — durci

- **Fichier :** `src/main/downloadManager.js`.
- **Correction :** `sanitizeHeaderValue()` supprime tous les caractères de
  contrôle et compacte les espaces avant l’ajout aux en-têtes. Les URL de page
  contenant des identifiants ne sont pas utilisées comme `Referer`.
- **Preuve :** `tests/downloadManager.test.js`.

### F-10 — Pas de mise à jour automatique ni de veille CVE distante — limite acceptée

- **Gravité :** moyenne.
- **Détail :** aucun auto-updater signé ni flux de bulletins distant. Les
  composants Electron/Chromium peuvent vieillir entre deux distributions.
- **Atténuation :** procédure manuelle documentée : reconstruire depuis les
  sources, vérifier les versions Electron/Chromium, exécuter
  `npm run audit:security`, `npm run audit:dependencies` et
  `npm run test:integration`.
- **Statut :** `TB-SEC-003`, affiché dans `about:security`.

### F-11 — Pas de scan antivirus des téléchargements — limite acceptée

- **Gravité :** information.
- **Détail :** les URL, noms et en-têtes sont validés, mais le contenu n’est pas
  analysé.
- **Atténuation :** télécharger depuis des sources de confiance et conserver
  l’antivirus système actif.
- **Statut :** `TB-SEC-004`.

### F-12 — Extensions distantes, DRM et anti-bot — hors périmètre volontaire

- **Détail :** aucune installation d’extension arbitraire, aucun contournement
  de DRM, CAPTCHA, paywall ou flux MSE/`blob:`.
- **Statut :** `TB-SEC-005`, limitation fonctionnelle et non faille à
  contourner.

### F-13 — Surface Chromium/Electron — veille manuelle

- **Détail :** une vulnérabilité du moteur peut affecter le navigateur
  indépendamment du code applicatif.
- **Atténuation :** mettre à jour Electron, surveiller les avis Chromium,
  rejouer l’audit et les tests après chaque montée de version.
- **Statut :** `TB-SEC-006`.

### F-14 — Navigation de la fenêtre hôte hors du document local — corrigé

- **Gravité :** élevée (exposition potentielle du preload de l’interface à un
  document distant).
- **Fichier :** `src/main/windowManager.js`.
- **Correction :** `isHostInterfaceUrl()` compare le chemin réel au document
  `src/renderer/index.html` ; les événements `will-navigate` et
  `will-redirect` annulent toute autre destination.
- **Preuve :** `HOST-05`, `tests/security.test.js`.

### F-15 — Mutations des pages internes sans preuve d’origine — corrigé

- **Gravité :** moyenne (CSRF contre les API locales).
- **Fichier :** `src/main/pageProtocol.js`.
- **Contexte :** Chromium sérialise l’origine des fetch `think-page://` en
  `null` et n’envoie ni `Origin` ni `Referer` pour ce schéma personnalisé.
  Une validation fondée uniquement sur `Origin` bloquait les mutations légitimes
  ou laissait croire à une protection inexistante.
- **Correction :** les POST exigent désormais :
  - l’en-tête `x-think-request: 1` ;
  - un `Content-Type: application/json` ;
  - si un `Origin` non nul est présent, une origine `think-page://<hôte>`
    exacte, sans identifiants ni port.
  Un formulaire intersite, un `fetch` `no-cors` ou un document distant ne peut
  pas fournir cet en-tête personnalisé sans un préflight CORS, refusé par
  `corsEnabled: false`. Les GET/HEAD restent en lecture seule.
- **Preuve :** `PAGE-02`, `tests/pageProtocol.test.js` (Origin distant, opaque,
  usurpé, en-tête absent, corps non JSON, preuve valide).

### F-16 — Fuite de données normales dans `about:security` privé — corrigé

- **Gravité :** moyenne (confidentialité inter-sessions).
- **Fichier :** `src/main/securityPosture.js`, `src/main/pageProtocol.js`.
- **Correction :** en navigation privée, la synthèse n’expose ni historique,
  ni favoris, ni permissions, ni téléchargements de la session normale. Seuls
  les cookies/cache de la partition privée sont visibles ; la liste des
  téléchargements privés est explicitement masquée avec un avis.
- **Preuve :** `SEC-02`, `tests/pageProtocol.test.js`.

### F-17 — Redirections de téléchargement non validées — corrigé

- **Gravité :** moyenne (contournement de la politique HTTP(S), fuite de
  cookies ou identifiants vers une destination inattendue).
- **Fichier :** `src/main/downloadManager.js`, `src/main/siteExtractor.js`.
- **Correction :** l’inspection et le démarrage suivent les redirections avec
  validation de l’URL finale ; les redirections vers un schéma non HTTP(S) ou
  des identifiants intégrés sont refusées. L’extraction de page utilise
  `redirect: 'error'` pour ne pas propager les cookies à travers une
  redirection, et filtre les URL extraites avec `isSafeHttpUrl()`.
- **Preuve :** `DL-02`, `tests/downloadManager.test.js`,
  `tests/siteExtractor.test.js`.

### F-18 — Suppression de cookie avec domaine ou chemin forgé — corrigé

- **Gravité :** moyenne (suppression ciblée hors du périmètre attendu).
- **Fichier :** `src/main/pageProtocol.js`.
- **Correction :** `buildCookieUrl()` valide l’hôte/domaine, le chemin et refuse
  les caractères de contrôle, les requêtes et les fragments. Les actions
  destructives restent limitées à la session et à la page interne.
- **Preuve :** `tests/pageProtocol.test.js`.

## 5. Risques résiduels supplémentaires

1. **SSRF/localhost volontaire :** un utilisateur peut saisir une URL vers
   `127.0.0.1` ou le réseau local dans `about:config` ou le dialogue de lien.
   Ce n’est pas déclenché automatiquement par une page distante, mais cela peut
   interroger un service local avec les cookies de la session. À utiliser en
   connaissance de cause.
2. **Hardlinks et TOCTOU :** `DevWorkspace` refuse les liens symboliques et
   revérifie les chemins, mais un hardlink créé manuellement dans l’espace peut
   pointer vers un fichier extérieur ; une course entre la vérification et
   l’ouverture reste théoriquement possible. L’espace est choisi par
   l’utilisateur et n’est pas une sandbox.
3. **`npm`/`npx`/`git` :** ces commandes peuvent télécharger et exécuter du code
   distant avec les droits de l’utilisateur. Le terminal les autorise
   explicitement ; n’exécutez que des projets de confiance.
4. **Pas de coffre de secrets :** les cookies sont visibles dans
   `about:security` (valeurs masquées par défaut) et stockés par Chromium dans
   le profil utilisateur. Protégez le compte système.
5. **Pas de signature de code vérifiée par l’application :** la distribution
   Windows/Linux dépend de la chaîne de build et de la signature éventuelle des
   paquets ; elle n’est pas vérifiée au lancement.
6. **Téléchargements non signés :** les fichiers terminés ne sont pas vérifiés
   par somme de contrôle ni par signature.
7. **Validation Windows incomplète :** les paquets NSIS/portable sont
   configurés mais n’ont pas été construits ni exécutés sur Windows dans cet
   audit. Les binaires ffmpeg Windows et les dialogues natifs doivent être
   validés sur cette plateforme.

## 6. Charges hostiles testées

Les tests d’intrusion couvrent notamment :

- `Origin: https://attaquant.example`, `Origin: null`,
  `Origin: think-page://config.attaquant.example` sur les routes API ;
- POST sans en-tête `x-think-request`, avec `Content-Type: text/plain`, ou avec
  un corps non JSON ;
- tentative de navigation de la fenêtre hôte vers une URL distante ;
- chemins `/../../package.json`, `/..%2fpackage.json`,
  `/config%2f..%2f..%2fpackage.json` ;
- corps JSON de plus de 64 Ko ;
- cookies avec domaine ou chemin forgé, caractères de contrôle, requête ou
  fragment ;
- URL `https://user:secret@…` pour l’inspection, le direct, les flux, les
  popups et les liens contextuels ;
- redirections vers `file://`, un schéma inconnu ou des identifiants intégrés ;
- noms de fichiers `..`, `...`, `CON`, `LPT9.txt`, longueur excessive ;
- en-têtes contenant `\r\n` ou des caractères de contrôle ;
- chemins `../secret.txt`, `..\\secret.txt`, `/etc/passwd`,
  `C:\\Windows\\win.ini`, octet NUL ;
- liens symboliques vers un fichier et un dossier extérieurs ;
- fichiers binaires, fichiers de plus de 1 Mo, contenu NUL ;
- commandes `rm -rf /`, `;`, `&&`, `|`, backticks, redirections, saut de ligne ;
- SVG avec script, HTML d’aperçu, CSS d’aperçu, jeton d’aperçu inconnu ;
- tentative de changement d’espace de travail par
  `POST /api/dev/workspace { path: "…" }` ;
- lecture de l’historique, des favoris, des permissions et des téléchargements
  normaux depuis `about:security` en navigation privée.

## 7. Limites de l’audit

- L’audit statique recherche des motifs connus ; il ne prouve pas l’absence de
  toute faille logique.
- Les tests d’intégration utilisent un serveur local et une instance Electron
  de test ; ils ne reproduisent pas tous les sites réels.
- Les paquets Windows doivent être construits et testés sur Windows.
- Les dialogues natifs et certaines interactions de bureau ne sont pas
  couverts en mode headless.
- Aucun test de pénétration externe, de fuzzing Chromium ou d’analyse mémoire
  n’a été réalisé.
- Les résultats ne constituent pas une certification de sécurité.

## 8. Procédure de mise à jour

1. Mettre à jour Electron et les dépendances dans une branche dédiée.
2. Exécuter `npm run check`, `npm run audit:security`,
   `npm run audit:dependencies`, `npm test` et `npm run test:integration`.
3. Vérifier les avis Electron/Chromium et les versions concernées.
4. Reconstruire les paquets Linux et Windows sur leurs plateformes respectives.
5. Mettre à jour les avis `TB-SEC-*` et ce document si une limite ou une
   correction change.
6. Ne jamais publier un paquet dont `npm run audit:security` échoue.

## 9. Signalement

Cette version n’embarque pas de canal de signalement distant. Conservez les
journaux minimaux, sans cookies ni secrets, et documentez :

- la version de Think-Browser, d’Electron et de Chromium ;
- la commande ou l’URL exacte ;
- le résultat attendu et le résultat observé ;
- les étapes de reproduction les plus courtes possible.

Les avis embarqués sont visibles dans `about:security` et définis dans
`src/shared/securityNotices.js`.
