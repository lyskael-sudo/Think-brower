# Think-Browser

Navigateur de bureau sombre construit avec **Electron**, **Node.js** et
**JavaScript CommonJS**. Le projet repose sur une architecture modulaire : le
processus principal, le renderer et le code partagé ont chacun des
responsabilités explicites, sans dépendance circulaire.

Le socle fonctionnel (**Lot 1**) et la refonte de l'interface sont terminés :
navigation multi-onglets, session restaurée au redémarrage, fenêtres privées,
favoris avec dossiers, historique, permissions par site, recherche dans la page,
zoom, menus contextuels, AdBlock, page d'accueil locale et paramètres étendus.

Le **Lot 2** ajoute le téléchargement des vidéos : fichiers directs via Chromium,
et assemblages HLS/DASH via **ffmpeg**, avec sonde **ffprobe**, progression,
annulation, relance et persistance dans le panneau Téléchargements.

Le **Lot 3** ajoute la **médiathèque** et le **lecteur intégré** : les fichiers
téléchargés ou importés sont référencés sans copie, enrichis par ffprobe,
dotés de miniatures ffmpeg et lus dans une modale avec reprise de la position.

Le **Lot 4** ajoute la distribution de bureau : icônes, configuration
**electron-builder**, cibles Linux (AppImage, deb) et Windows (NSIS, portable),
extraction des binaires ffmpeg/ffprobe hors de l'archive asar et réduction des
binaires selon la plateforme ciblée.

Le **Lot 5** renforce le téléchargement et la sécurité : sélection des pistes
audio et des sous-titres, détection et arrêt propre des directs HLS, file
d'attente limitée à deux assemblages ffmpeg, reprise des téléchargements
directs partiels, extraction des médias présents dans la page, tests unitaires
et d'intégration, et renderer isolé par un preload `contextBridge`.

Le **Lot 6** ajoute un socle d'extensions internes avec deux extensions
embarquées : **Thèmes** (sombre, clair, minuit) et **Langues** (français,
anglais). Les extensions sont déclaratives, validées dans le processus
principal et ne chargent aucun code distant.

Le **Lot 7** ajoute le téléchargement par lien direct et les pages internes
`about:config` et `about:security` : inspection d'une URL, cookies et en-têtes
de la page source, file d'attente des flux, réglages avancés, diagnostic des
cookies, permissions, connexions HTTP et nettoyage de session.

Le **Lot 8** ajoute `about:dev`, un atelier de type IDE : arborescence confinée
à un dossier choisi nativement, éditeur, onglets, aperçu HTML/CSS/JavaScript,
exécution Python/PHP/Go lorsque les interpréteurs sont présents, et terminal
restreint sans shell. Le terminal et l'exécution locale ne sont **pas** des
sandbox de sécurité.

Le **Lot 9** fournit un audit concret et reproductible : contrôles statiques,
tests d'intrusion des routes internes, chemins, symlinks, terminal et
téléchargements, puis test d'intégration Electron. Le rapport est dans
[`SECURITY-AUDIT.md`](SECURITY-AUDIT.md).

Le **Lot 10** expose les avis de sécurité locaux, les limites résiduelles et la
politique de mise à jour dans `about:security`, sans télémétrie ni flux distant.
La feuille de route et les limites sont détaillées dans
[`ROADMAP.md`](ROADMAP.md).

Le support **YouTube** complète ces lots via un pont optionnel vers l'exécutable
externe **yt-dlp**, jamais embarqué ni installé automatiquement. L'application
détecte l'outil, l'utilise uniquement pour les URL de vidéos YouTube et délègue
la fusion audio/vidéo à son ffmpeg. Aucun DRM n'est traité et aucun secret ni
contournement n'est fourni par Think-Browser.

## Fonctionnalités

- **Onglets** : création, fermeture, réouverture des onglets fermés, changement
  d'onglet sans rechargement de la page masquée, favicons et indicateur de
  lecture audio.
- **Fenêtres et session** : fenêtres indépendantes, restauration des fenêtres,
  de leurs onglets actifs, de leur géométrie et de leur état maximisé au
  redémarrage.
- **Navigation privée** : fenêtres éphémères avec partition dédiée, historique
  et favoris désactivés, session exclue de la restauration, permissions
  éphémères, téléchargements et médias isolés des fenêtres normales.
- **Page d'accueil locale** : page `think-home://start/` avec horloge, moteur de
  recherche, raccourcis et mise en page adaptée à la fenêtre. Elle peut être
  remplacée par une adresse HTTP(S) personnalisée.
- **Barre d'adresse** : URL HTTP(S), domaine sans protocole ou recherche
  textuelle avec Google, DuckDuckGo ou Bing. Le bouton **Aller** et `Alt+Home`
  restent accessibles en permanence.
- **Recherche dans la page** : barre dédiée, compteur de résultats, navigation
  précédent/suivant, surlignage et fermeture avec `Échap`.
- **Zoom** : de 50 % à 300 % par pas de 10 %, appliqué à l'onglet actif, avec
  réinitialisation à 100 %.
- **Favoris** : ajout/retrait par étoile, dossiers, déplacement, import et
  export JSON, persistance immédiate et partage entre les fenêtres normales.
- **Historique** : 600 entrées maximum, fusion des visites consécutives vers la
  même URL, panneau de consultation et effacement avec confirmation.
- **Téléchargements** : interception `will-download` pour les fichiers directs,
  progression, destination sans écrasement (`fichier (1).ext`), annulation,
  relance d'un téléchargement interrompu, reprise partielle tant que Chromium
  conserve le `DownloadItem`, et persistance dans `downloads.json`.
- **Vidéos HLS et DASH** : analyse du manifeste et des pistes par ffprobe,
  sélection de la piste audio et d'un sous-titre avant l'assemblage, détection
  des directs, arrêt propre avec conservation du fichier déjà reçu, et file
  d'attente limitée à deux assemblages simultanés. Les cookies, le User-Agent
  et le Referer de la page sont transmis.
- **Extraction de page** : le panneau Médias peut analyser le DOM, les attributs
  `src`/`href` et les scripts publics de la page active pour proposer des
  fichiers ou manifestes qui n'ont pas encore été demandés. Quelques sites
  exposant leurs métadonnées publiques (Vimeo, Dailymotion) sont reconnus, sans
  contournement de DRM ni d'anti-bot.
- **Médiathèque** : les téléchargements terminés (hors navigation privée) sont
  ajoutés automatiquement. Un sélecteur natif permet d'importer des fichiers
  locaux. Recherche instantanée, filtre vidéo/audio, tri par date, nom ou durée,
  miniature, durée `HH:MM:SS`, résolution, taille, progression de lecture,
  renommage du fichier, suppression avec confirmation et ouverture du dossier
  sont disponibles. Les fiches sont conservées dans `library.json`.
- **Lecteur intégré** : lecture des formats pris en charge par Chromium depuis
  un protocole local `think-media://` avec support des requêtes `Range`.
  Contrôles lecture/pause, avance et recul, progression, volume, vitesse,
  plein écran de la fenêtre (les contrôles restent visibles) et reprise de la
  position. Le fichier n'est jamais exposé par son chemin disque au renderer.
- **Médias** : détection des flux `.mp4`, `.webm`, `.mkv`, `.mov`, `.m3u8`,
  `.mpd`, `.mp3`, `.m4a`, `.aac`, `.ogg`, `.wav` et `.flac`, après vérification
  des en-têtes de réponse. Les sons d'interface, les fichiers minuscules et les
  URL qui renvoient du HTML sont ignorés ; les manifestes et segments de
  streaming restent acceptés. Indicateur, panneau de consultation, bouton
  **Analyser la page** et boutons **Ouvrir** / **Télécharger**. Les flux
  HLS/DASH affichent leur type et la disponibilité de ffmpeg.
- **AdBlock** : filtrage réseau avec `@cliqz/adblocker-electron`,
  activation/désactivation à chaud et cache local. Le nombre de publicités et
  traqueurs bloqués est affiché en temps réel pour l'onglet actif et remis à
  zéro à chaque nouveau document principal. Les scriptlets cosmétiques sont
  désactivés, car leur injection casse les pages qui imposent Trusted Types
  (YouTube, Google) ; les partitions privées reçoivent le même filtrage réseau.
- **Permissions par site** : caméra, microphone, géolocalisation (précise ou
  approximative), notifications, MIDI, presse-papiers, stockage entre sites,
  polices locales, détection d'inactivité, gestion des fenêtres, choix du
  haut-parleur, accès à des fichiers, synchronisation en arrière-plan,
  capteurs, impression et verrouillage clavier sont demandés à l'utilisateur
  puis mémorisés pour l'origine. Le stockage persistant est accordé sans
  dialogue aux applications HTTP(S) : il protège leurs données de l'éviction
  sans donner accès à un autre site. La capture d'écran, l'USB, le Bluetooth,
  le HID et le port série restent refusés. Les décisions prises en navigation
  privée ne sont jamais écrites sur disque.
- **Menu contextuel** : ouvrir un lien dans un nouvel onglet, copier une adresse,
  télécharger une image ou un média, actions d'édition, navigation et
  inspection de la page.
- **Paramètres** : moteur de recherche, page d'accueil locale ou personnalisée,
  restauration de session, enregistrement de l'historique, zoom par défaut,
  AdBlock, dossier de téléchargement, effacement des données de navigation et
  réinitialisation des permissions.
- **Extensions internes** : panneau accessible depuis le menu `⋮`, catalogue
  déclaratif embarqué, activation/désactivation et persistance. L'extension
  **Thèmes Think** propose les thèmes sombre, clair et minuit ; l'extension
  **Langues Think** bascule le chrome, les menus et les panneaux principaux
  entre le français et l'anglais. Aucun code distant ni extension arbitraire
  n'est chargé.
- **Téléchargement par lien** : champ d'inspection et de démarrage depuis
  `about:config` ou le menu de la fenêtre, détection des fichiers et manifestes,
  cookies/User-Agent/Referer de la page source, refus des URL avec identifiants
  intégrés et des noms de fichiers dangereux. Les flux restent soumis à la file
  d'attente et aux limites DRM/anti-bot.
- **Pages internes** : `about:config` (recherche, apparence, langue, zoom,
  téléchargements, Referer, concurrence des flux, extensions, confidentialité,
  maintenance), `about:security` (posture, cookies, permissions, HTTP, cache,
  nettoyage, avis et limites) et `about:dev` (atelier). Elles utilisent le
  protocole fermé `think-page://`, sans preload ni accès Node.js.
- **Atelier `about:dev`** : espace choisi nativement, arborescence et opérations
  fichiers confinées, refus des traversées et des liens symboliques, limite de
  1 Mo par fichier, éditeur avec onglets, aperçu HTML/CSS/JS sandboxé, exécution
  Node/Python/PHP/Go selon les interpréteurs détectés et terminal restreint
  (commandes autorisées, sans shell).
- **Audit de sécurité** : `npm run audit:security` combine contrôles statiques
  et tests d'intrusion dynamiques ; `SECURITY-AUDIT.md` documente les constats,
  corrections, risques acceptés et commandes de reproduction.
- **Compatibilité** : User-Agent Chrome standard aligné sur le moteur Chromium
  embarqué, visualiseur PDF activé, plugins et codecs H.264/AAC/WebM/MSE
  disponibles. Les API de page ne sont pas falsifiées et aucun système
  anti-bot n'est contourné.
- **Sécurité** : pages distantes isolées, Node.js désactivé dans les webviews,
  navigation limitée à HTTP(S), fenêtres `window.open` filles et sécurisées,
  permissions sensibles filtrées par session. L'interface hôte elle-même est
  chargée avec `nodeIntegration: false`, `contextIsolation: true` et un preload
  `contextBridge` à canaux et fragments HTML explicitement autorisés.
- **Interface** : thème sombre, fragments HTML statiques, barre d'outils
  compacte, menus accessibles au clavier et animations respectant
  `prefers-reduced-motion`.

## Structure

```text
Think-Browser/
├── package.json
├── README.md
├── ROADMAP.md                   # Lots 6 à 10 et état
├── SECURITY-AUDIT.md            # Audit reproductible, constats et limites
├── build/
│   ├── icon.png                 # Icône Linux (512 × 512)
│   └── icon.ico                 # Icône Windows multi-résolution
├── assets/
│   └── icons/
│       ├── app.svg              # Logo de l'interface
│       └── favicon.svg
├── scripts/
│   ├── afterPack.js             # Réduction des binaires par plateforme
│   ├── buildRenderer.js         # Bundle esbuild du renderer
│   ├── check.js                 # Vérification statique et sécurité
│   ├── securityAudit.js         # Audit statique + tests d'intrusion
│   └── integrationSmoke.js      # Test d'intégration Electron local
├── tests/
│   ├── devWorkspace.test.js     # Confinement, symlinks, terminal, CSP
│   ├── downloadManager.test.js  # File d'attente, reprise, arrêt, URL
│   ├── mediaPair.test.js        # Association audio/vidéo et noms de fusion
│   ├── youtube.test.js          # URL de vidéos YouTube et identifiants
│   ├── ytDlpDownloader.test.js  # Détection et progression du pont yt-dlp
│   ├── extensions.test.js       # Catalogue, validation, thèmes, langues
│   ├── guestController.test.js  # Suivi d'historique des webviews
│   ├── pageProtocol.test.js     # Preuve interne, traversées, corps borné
│   ├── rendererEventEmitter.test.js # Auditeurs et fermeture d'onglet
│   ├── security.test.js         # Preload, isolation, sandbox, TLS, avis
│   ├── siteExtractor.test.js    # Extraction DOM et scripts
│   ├── utils.test.js            # Helpers partagés, noms de fichiers
│   └── videoTools.test.js       # Pistes ffprobe et manifestes HLS/DASH
└── src/
    ├── main/                    # Processus principal Electron
    │   ├── index.js             # Bootstrap, sessions et cycle de vie
    │   ├── windowManager.js     # Fenêtres, webviews, session, diffusion IPC
    │   ├── store.js             # Persistance JSON atomique
    │   ├── extensionManager.js  # Catalogue, activation et options des extensions
    │   ├── homeProtocol.js      # Protocole local think-home://
    │   ├── pageProtocol.js      # think-page://, API same-origin et CSP
    │   ├── securityPosture.js   # Cookies, permissions, posture, avis
    │   ├── devWorkspace.js      # Atelier confiné, aperçus, terminal
    │   ├── downloadManager.js   # Fichiers directs, flux, file d'attente
    │   ├── downloadStore.js     # Historique persistant des téléchargements
    │   ├── libraryStore.js      # Persistance atomique de la médiathèque
    │   ├── mediaLibrary.js      # Fiches, import, renommage, miniatures
    │   ├── mediaProtocol.js     # Protocole local think-media:// avec Range
    │   ├── youtube.js           # Reconnaissance des URL de vidéos YouTube
    │   ├── ytDlpDownloader.js   # Pont optionnel vers l'exécutable yt-dlp
    │   ├── videoDownloader.js   # Assemblage HLS/DASH, pistes, arrêt direct
    │   ├── videoTools.js        # ffmpeg/ffprobe, pistes, direct, en-têtes
    │   ├── siteExtractor.js     # DOM, scripts publics, Vimeo, Dailymotion
    │   ├── userAgent.js         # User-Agent Chrome compatible
    │   ├── adblocker.js         # Moteur AdBlock multi-session et cache
    │   ├── networkMonitor.js    # Écouteur réseau unique par session
    │   ├── mediaDetector.js     # Détection des flux média
    │   ├── permissions.js       # Permissions par site et invites
    │   ├── contextMenu.js       # Menu contextuel des pages
    │   ├── favoritesIO.js       # Import/export JSON des favoris
    │   ├── guestController.js   # Comportement des webviews invitées
    │   ├── security.js          # Durcissement des sessions et webviews
    │   ├── shortcuts.js         # Raccourcis avant Chromium
    │   ├── browsingData.js      # Effacement des données de session
    │   └── ipcHandlers.js       # Adaptation IPC → services
    ├── preload/
    │   └── rendererPreload.js   # Pont contextBridge fermé de l'hôte
    ├── renderer/                # Interface utilisateur
    │   ├── index.html           # Hôte minimal, charge le bundle
    │   ├── partials/            # Fragments HTML statiques
    │   │   ├── tabbar.html
    │   │   ├── toolbar.html
    │   │   ├── browser.html
    │   │   └── dialogs/         # Favoris, historique, téléchargements,
    │   │                        # médias, médiathèque, paramètres, etc.
    │   ├── home/                # Page d'accueil locale
    │   │   ├── index.html
    │   │   ├── home.css
    │   │   ├── home.js
    │   │   ├── logo.svg
    │   │   └── favicon.svg
    │   ├── pages/               # Pages internes think-page://
    │   │   ├── config.html/js   # about:config
    │   │   ├── security.html/js # about:security
    │   │   ├── dev.html/js/css  # about:dev
    │   │   └── pages.css        # Styles communs des pages internes
    │   ├── styles/
    │   │   ├── main.css         # Variables, thème, composants communs
    │   │   ├── tabs.css         # Barre d'onglets
    │   │   ├── navbar.css       # Barre d'outils, privée, recherche, adresse
    │   │   ├── menu.css         # Menus, modales, listes
    │   │   ├── library.css      # Médiathèque et lecteur intégré
    │   │   ├── extensions.css   # Panneau des extensions
    │   │   └── themes.css       # Thèmes clair et minuit
    │   └── js/
    │       ├── bootstrap.js     # Démarrage après chargement des fragments
    │       ├── bootstrap.bundle.js # Bundle généré par esbuild
    │       ├── partials.js      # Chargement via le pont preload
    │       ├── app.js           # Assemblage et cycle de vie du renderer
    │       ├── api.js           # Façade IPC typée et limitée
    │       ├── eventEmitter.js  # Émetteur local sans module Node.js
    │       ├── i18n.js          # Traductions embarquées français/anglais
    │       ├── theme.js         # Application des thèmes de l'hôte
    │       ├── tabManager.js    # Classes Tab et TabManager
    │       ├── navBar.js        # Barre d'adresse et navigation
    │       ├── mediaSniffer.js  # Indicateur, panneau et extraction
    │       └── ui/
    │           ├── about.js
    │           ├── dialog.js
    │           ├── downloads.js
    │           ├── extensions.js
    │           ├── favorites.js
    │           ├── findBar.js
    │           ├── history.js
    │           ├── library.js
    │           ├── mediaOptions.js
    │           ├── menu.js
    │           ├── player.js
    │           ├── settings.js
    │           └── toast.js
    └── shared/
        ├── constants.js         # IPC, raccourcis, moteurs, limites
        ├── extensions.js        # Catalogue déclaratif des extensions
        ├── securityNotices.js   # Avis locaux, limites, politique
        └── utils.js             # URL, titres, identifiants, formats
```

## Installation

Prérequis : **Node.js 20 ou supérieur** et un environnement graphique pour
Electron (X11/Wayland, macOS ou Windows).

```bash
npm install
npm start
```

`npm start` lance Electron avec `src/main/index.js` comme point d'entrée.

Les binaires **ffmpeg** et **ffprobe** sont fournis par les dépendances
`ffmpeg-static`, `@ffmpeg-installer/ffmpeg` et `ffprobe-static`. Au démarrage,
Think-Browser vérifie leur version et effectue un court autotest MPEG-TS avec
ffmpeg ; le premier binaire fonctionnel est retenu. Si aucun ffmpeg compatible
n'est disponible, les fichiers directs restent téléchargeables et les flux
HLS/DASH sont signalés comme indisponibles dans le panneau Médias.

Pour imposer une installation locale :

```bash
THINK_FFMPEG_PATH=/chemin/vers/ffmpeg \
THINK_FFPROBE_PATH=/chemin/vers/ffprobe \
npm start
```

Sur une installation fraîche, `npm install` peut demander d'autoriser les
scripts d'installation des paquets ffmpeg. Sans autorisation, le binaire déjà
présent dans le paquet de plateforme `@ffmpeg-installer/*` reste utilisable
lorsque la plateforme correspond.

### Distribution Windows et Linux

La distribution est configurée avec **electron-builder** dans `package.json`.
Les icônes empaquetées se trouvent dans `build/` ; les icônes de l'interface
restent dans `assets/icons/`.

```bash
npm run pack        # application décompressée dans dist/
npm run dist:linux  # AppImage + paquet Debian
npm run dist:win    # installateur NSIS + version portable
npm run dist        # cible de la plateforme courante
```

Les artefacts sont écrits dans `dist/` :

- Linux : `Think-Browser-<version>-linux-x86_64.AppImage` et
  `Think-Browser-<version>-linux-amd64.deb` ;
- Windows : `Think-Browser-<version>-windows-x64-setup.exe` et
  `Think-Browser-<version>-windows-x64-portable.exe`.

La configuration extrait `@ffmpeg-installer` et `ffprobe-static` de l'archive
asar, car un exécutable ne peut pas être lancé depuis `app.asar`. Le hook
`scripts/afterPack.js` supprime ensuite les binaires des autres plateformes et
architectures. Le paquet `ffmpeg-static`, qui échoue à l'autotest MPEG-TS sur
certaines installations, n'est pas embarqué : `@ffmpeg-installer` fournit le
binaire fonctionnel.

La construction Linux a été validée avec Electron 44. Les paquets 2.0.0
(AppImage, deb et `linux-unpacked`) ont été reconstruits après les derniers
durcissements ; le scénario d'intégration a été rejoué sur le paquet
décompressé et sur l'AppImage. Pour Windows, construire de préférence sur une
machine Windows : npm y installe automatiquement le binaire
`@ffmpeg-installer/win32-x64`. Une compilation croisée depuis Linux peut
nécessiter Wine et l'installation explicite de ce paquet de plateforme. Les
paquets ne sont pas signés ; Windows SmartScreen peut donc afficher un
avertissement. L'URL `homepage` et le mainteneur utilisent le domaine réservé
`.example` comme valeurs de substitution à remplacer avant une publication.

Sous Linux, l'AppImage nécessite FUSE 2. Si FUSE n'est pas disponible :

```bash
./dist/Think-Browser-<version>-linux-x86_64.AppImage --appimage-extract-and-run
```

## Utilisation

### Page d'accueil

- Chaque nouvel onglet ouvre la page locale `think-home://start/`. Elle affiche
  l'heure, un champ de recherche, le moteur actif et des raccourcis.
- Le bouton d'accueil de la barre d'outils et `Alt+Home` ouvrent la page
  d'accueil dans l'onglet actif.
- **Paramètres → Page d'accueil** permet de conserver la page locale ou de
  choisir une URL HTTP(S) personnalisée. L'adresse personnalisée est validée et
  enregistrée avec le bouton **Enregistrer**.
- En navigation privée, la page locale reste disponible sans écriture sur
  disque.

### Navigation

- Saisissez une URL puis appuyez sur **Entrée**. Un domaine sans protocole
  reçoit `https://` ; un texte qui n'est pas une URL devient une recherche.
- **◄**, **►** et **↻** reculent, avancent ou rechargent la page. Le bouton
  **Aller** valide l'adresse saisie.
- `Ctrl+L` sélectionne le contenu de la barre d'adresse.
- Les liens `target="_blank"` sont transformés en nouveaux onglets contrôlés.
- Les appels `window.open` avec options, une fenêtre nommée ou une cible vide
  (OAuth, paiement, impression) ouvrent une fenêtre fille sécurisée dans la
  même partition, avec `window.opener` et `postMessage`. Les domaines de
  connexion connus (Google, Microsoft, Apple, GitHub, etc.) sont reconnus même
  lorsque Chromium annonce une ouverture dans l'onglet courant. Les popups
  imbriquées ne sont autorisées que pour ces domaines de connexion.

### Onglets et fenêtres

- `+`, `Ctrl+T` ou le menu `⋮` ouvre un onglet.
- `Ctrl+W` ferme l'onglet actif ; fermer le dernier onglet en crée un nouveau.
- `Ctrl+Shift+T` rouvre le dernier onglet fermé (les 25 derniers sont
  conservés).
- Un clic sur un onglet l'active sans recharger sa page.
- Le menu `⋮` → **Nouvelle fenêtre** ouvre une fenêtre indépendante.
- Les fenêtres normales et leur état sont restaurés au lancement suivant.
  Les fenêtres privées ne sont jamais restaurées.

### Navigation privée

- `Ctrl+Shift+P` ou le menu `⋮` → **Nouvelle fenêtre privée** ouvre une fenêtre
  isolée avec une partition éphémère.
- L'historique n'est pas enregistré, les favoris sont désactivés et les
  permissions accordées disparaissent à la fermeture de la fenêtre.
- Les téléchargements et médias privés sont visibles uniquement dans leur
  fenêtre d'origine et ne sont pas persistés.
- La partition privée est vidée (stockage, cache) à la fermeture.

### Recherche et zoom

- `Ctrl+F` ouvre la barre de recherche dans la page. `Entrée` ou `Ctrl+G`
  avance, `Maj+Entrée`, `Ctrl+Shift+G` ou `F3` recule.
- `Ctrl++` agrandit, `Ctrl+-` réduit et `Ctrl+0` réinitialise le zoom.
- `Échap` ferme la recherche, le menu, le panneau média ou une modale.

### Favoris

- Cliquez sur l'étoile de la barre d'outils pour ajouter ou retirer la page
  active. L'étoile est pleine lorsque l'URL est enregistrée.
- Le menu `⋮` → **Favoris** affiche les favoris, les dossiers, et les actions
  **Importer** / **Exporter** au format JSON.
- Un favori peut être déplacé vers un dossier depuis sa liste. Supprimer un
  dossier conserve ses favoris sans dossier.
- Les favoris sont enregistrés immédiatement et partagés entre les fenêtres
  normales. Ils sont en lecture seule en navigation privée.

### Historique, téléchargements et médias

- **Historique** : les visites sont enregistrées automatiquement. Un clic sur
  une entrée l'ouvre dans l'onglet actif. Le bouton d'effacement demande une
  confirmation.
- **Téléchargements** : la progression est visible dans le panneau dédié. Le
  dossier de destination est configurable ; le nom est rendu unique si un
  fichier identique existe déjà. Un téléchargement direct interrompu peut être
  repris avec **Reprendre** tant que Chromium conserve son `DownloadItem` ;
  après redémarrage, utilisez **Relancer**. Les téléchargements actifs peuvent
  être annulés depuis le panneau.
- **Médias** : l'indicateur vert apparaît lorsqu'un flux audio/vidéo est
  détecté. Le panneau affiche le type, la source, l'heure et les actions
  **Ouvrir** et **Télécharger**. **Analyser la page** complète la détection
  réseau par une lecture du DOM et des scripts publics.
- **Fusion audio/vidéo** : lorsqu'une page expose une piste vidéo et une piste
  audio HTTP(S) séparées, le menu contextuel de la vidéo propose
  **Télécharger la vidéo complète (audio + vidéo)**. Les deux pistes sont
  copiées sans réencodage dans un MP4 lorsque les codecs sont compatibles, ou
  dans un MKV sinon. Les en-têtes, le Referer et les cookies de la session sont
  appliqués aux deux requêtes. Cette action ne s'applique ni aux manifestes
  HLS/DASH, ni aux flux MSE `blob:`.
- **YouTube (optionnel)** : sur une page de vidéo YouTube, le menu contextuel
  propose **Télécharger la vidéo YouTube (yt-dlp)**. Think-Browser ne fournit
  pas yt-dlp : l'outil doit être installé séparément et être visible dans le
  `PATH`, ou indiqué par `THINK_YTDLP_PATH`. La vidéo et l'audio sont fusionnés
  par ffmpeg en MP4 lorsque les codecs le permettent. Sans yt-dlp, l'action
  affiche un message d'installation et n'effectue aucune requête spéciale.
- **Flux HLS/DASH** : un clic sur **Télécharger le flux** analyse d'abord le
  manifeste avec ffprobe. Si plusieurs pistes audio ou des sous-titres sont
  disponibles, une boîte de dialogue permet de les choisir. Les segments sont
  récupérés avec les cookies et en-têtes de la page, puis les pistes choisies
  sont copiées dans un fichier MP4 ; les sous-titres sont convertis en
  `mov_text`. La progression et la durée apparaissent dans
  **Téléchargements**. Deux flux au maximum sont assemblés en parallèle ; les
  demandes suivantes sont mises en file d'attente et démarrent
  automatiquement.
- **Directs HLS** : un flux sans `#EXT-X-ENDLIST` (ou déclaré `EVENT`) est
  signalé **DIRECT**. L'action **Arrêter et conserver** envoie `q` à ffmpeg
  pour finaliser le MP4, puis force l'arrêt après dix secondes si nécessaire.
  La même action est disponible pour un flux ordinaire afin de conserver une
  partie déjà reçue.
- **Sans ffmpeg** : le panneau Médias indique que seuls les fichiers directs
  sont disponibles. Les boutons de téléchargement des flux sont désactivés et
  aucune tâche ffmpeg n'est lancée.

### Médiathèque et lecteur

- Un téléchargement terminé dans une fenêtre normale est ajouté
  automatiquement à la médiathèque. Les fichiers déjà présents sur le disque
  peuvent être importés depuis le menu `⋮` → **Médiathèque**.
- La recherche filtre par titre, nom de fichier, type de flux ou origine. Le
  sélecteur **Tous / Vidéos / Audio** restreint l'affichage.
- Une carte indique la miniature, la durée, la résolution, la taille et la date
  d'ajout. Les boutons **Lire**, **Dossier**, **Renommer** et **Supprimer**
  agissent sur le fichier réel ; la suppression demande une confirmation.
- Le lecteur reprend la position enregistrée, propose lecture/pause, avance et
  recul de 10 secondes, volume, vitesse de 0,5× à 2×, plein écran de la fenêtre
  et les raccourcis `Espace`, `←`, `→`, `↑`, `↓`, `M` et `F`. `Échap` ou la
  fermeture du lecteur quitte le plein écran et restaure la fenêtre.
- Les formats dépendent du moteur Chromium (MP4/H.264, WebM, MP3, AAC, Ogg,
  WAV, FLAC, etc.). Un conteneur reconnu par ffprobe mais non décodable par
  Chromium peut apparaître dans la médiathèque sans être lisible.
- La médiathèque est désactivée en navigation privée : les téléchargements
  privés restent visibles uniquement dans le panneau Téléchargements de leur
  fenêtre et ne sont jamais ajoutés à `library.json`.

### Permissions

- Une demande native s'affiche lorsqu'une page sollicite une permission
  sensible. Le choix est mémorisé pour l'origine et peut être révoqué avec
  **Paramètres → Réinitialiser les autorisations**.
- Les permissions courantes des applications web sont couvertes : caméra,
  microphone, géolocalisation, notifications, MIDI, presse-papiers, stockage
  entre sites, polices locales, détection d'inactivité, gestion multi-écrans,
  choix du haut-parleur, accès à des fichiers, synchronisation en arrière-plan,
  capteurs, impression et verrouillage clavier.
- Le stockage persistant (`persistent-storage`) est accordé sans dialogue aux
  origines HTTP(S) : il empêche Chromium d'évincer leurs données hors ligne sans
  élargir l'accès aux données d'autres sites.
- La capture d'écran, l'USB, le Bluetooth, le HID et le port série restent
  refusés. La lecture DRM (`mediaKeySystem`) n'est pas accordée.
- En navigation privée, la demande est reposée dans chaque fenêtre privée et
  le choix n'est pas écrit dans les données partagées.

### Paramètres

- **Moteur de recherche** : Google, DuckDuckGo ou Bing. Le choix s'applique aux
  recherches suivantes et à la page d'accueil des nouveaux onglets.
- **Page d'accueil** : page locale ou URL HTTP(S) personnalisée, avec un bouton
  **Ouvrir** pour tester immédiatement le choix.
- **Démarrage et mémoire** : restauration des fenêtres et onglets, et
  enregistrement de l'historique. La désactivation de l'historique n'efface pas
  les visites existantes.
- **Zoom par défaut** : 75 %, 90 %, 100 %, 110 %, 125 % ou 150 %, appliqué aux
  onglets existants et aux nouveaux onglets.
- **AdBlock** : activable ou désactivable à chaud, y compris pour les fenêtres
  privées déjà ouvertes.
- **Dossier de téléchargement** : sélection via le sélecteur natif. Le dossier
  est créé si nécessaire. En cas d'indisponibilité, le dossier
  `Téléchargements` du système est utilisé. Ce dossier sert aussi aux
  assemblages HLS/DASH.
- **Données de navigation** : efface cookies, cache, stockage local, IndexedDB,
  service workers et cache de stockage de la session normale. L'historique et
  les favoris sont conservés ; leur suppression possède des actions dédiées.

### Extensions internes

Le menu `⋮` ouvre **Extensions**. Les paquets sont embarqués dans
l'application, décrits par un manifeste et validés par le processus principal.
Ils ne téléchargent aucun fichier de code et ne peuvent pas accéder à Node.js.

- **Thèmes Think** : thème **Sombre** par défaut, thème **Clair** à contraste
  élevé et variante **Minuit** aux accents violets. Le thème ne s'applique
  qu'à l'interface hôte ; les pages web conservent leur propre apparence.
- **Langues Think** : français ou anglais pour le chrome, les menus et les
  panneaux principaux. La couverture est progressive : les messages dynamiques
  et certains textes secondaires peuvent rester en français.
- Désactiver une extension réinitialise son option (thème sombre ou français)
  et conserve les autres préférences.
- Les choix sont enregistrés dans les paramètres et appliqués aux fenêtres
  ouvertes. Aucune extension arbitraire, aucun magasin distant et aucun
  `eval` ne sont utilisés dans cette version.

### Téléchargement par lien

Le menu `⋮` ouvre **Télécharger un lien** (également accessible depuis
`about:config`). Collez une URL HTTP(S) : le processus principal inspecte le
type, la taille, les capacités ffmpeg et les pistes éventuelles. Un fichier
direct part dans Chromium ; un manifeste HLS/DASH part dans la file ffmpeg avec
les cookies, le User-Agent et, si autorisé, le Referer de la page source.

Les URL contenant `user:secret@` sont refusées. En navigation privée, le
dialogue de la fenêtre est requis pour conserver la partition éphémère ; le
démarrage depuis `about:config` est réservé à la session normale.

### YouTube avec yt-dlp (optionnel)

Think-Browser ne contient pas d'extracteur YouTube et n'installe rien à la
place de l'utilisateur. Pour activer l'action du menu contextuel, installez
**yt-dlp** séparément, par exemple avec `pipx install yt-dlp`, puis vérifiez que
`yt-dlp --version` fonctionne. Si le binaire n'est pas dans le `PATH`, lancez
l'application avec :

```sh
THINK_YTDLP_PATH=/chemin/vers/yt-dlp npm start
```

L'action n'est proposée que sur les URL de vidéos YouTube (`watch`, `shorts`,
`live`, `embed` et `youtu.be`). Elle refuse les playlists, ne transmet aucun
cookie YouTube et ne traite pas les contenus DRM. Une version récente de
yt-dlp et un moteur JavaScript compatible YouTube (Deno, ou Node 22+ activé par
`--js-runtimes node`) sont recommandés. yt-dlp reste un outil externe : ses
mises à jour, son comportement réseau et le respect des conditions d'utilisation
de YouTube relèvent de l'utilisateur.

### Pages internes

Saisissez `about:config`, `about:security` ou `about:dev` dans la barre
d'adresse. Ces alias, y compris avec une barre oblique, des paramètres ou un
fragment, sont résolus vers `think-page://` avant toute recherche web. Les
autres URL `about:` sont refusées et ne deviennent jamais une recherche. La
barre d'adresse réaffiche l'alias lisible une fois la page chargée.

- **about:config** : recherche, thème, langue, zoom par défaut, dossier de
  téléchargement, Referer, concurrence des flux (1 à 4), extensions,
  confidentialité, maintenance, inspection et démarrage d'un lien.
- **about:security** : posture, cookies (valeurs masquées), permissions,
  historique HTTP non chiffré, cache, téléchargements récents, nettoyage,
  avis `TB-SEC-*`, limites et politique de mise à jour.
- **about:dev** : atelier IDE décrit ci-dessous.

### Atelier about:dev

1. Ouvrir `about:dev` et choisir un dossier avec **Choisir un dossier**.
2. Créer ou ouvrir un fichier dans l'arborescence ; les onglets conservent les
   modifications non enregistrées.
3. Utiliser **Aperçu** pour HTML/CSS/JS. L'aperçu est sandboxé et les ressources
   relatives sont servies sous `think-page://dev/file/`.
4. Utiliser **Exécuter** pour un fichier Node/Python/PHP/Go si l'interpréteur
   est détecté.
5. Le terminal accepte `help`, `pwd`, `ls`, `cat`, `echo`, `git`, `go`, `node`,
   `npm`, `npx`, `php`, `python`/`py`/`python3`. Les opérateurs shell sont
   refusés, mais **le terminal n'est pas une sandbox**.

## Raccourcis clavier

| Raccourci | Action |
| --- | --- |
| `Ctrl+T` | Nouvel onglet |
| `Ctrl+Shift+T` | Rouvrir le dernier onglet fermé |
| `Ctrl+W` | Fermer l'onglet actif |
| `Ctrl+Shift+P` | Nouvelle fenêtre privée |
| `Ctrl+R` ou `F5` | Recharger la page |
| `Ctrl+L` | Focus dans la barre d'adresse |
| `Alt+Home` | Ouvrir la page d'accueil |
| `Ctrl+F` | Rechercher dans la page |
| `Ctrl+G` ou `F3` | Résultat suivant |
| `Ctrl+Shift+G` ou `Maj+F3` | Résultat précédent |
| `Ctrl++` | Agrandir le zoom |
| `Ctrl+-` | Réduire le zoom |
| `Ctrl+0` | Réinitialiser le zoom |
| `Ctrl+Shift+I` ou `F12` | DevTools de la page active |
| `Ctrl+Shift+Alt+I` | DevTools de l'interface |
| `Échap` | Fermer le menu, la recherche, le panneau média ou une modale |

Les raccourcis sont interceptés dans le processus principal avant Chromium et
fonctionnent aussi lorsque le contenu d'une page possède le focus.

## Persistance

Le fichier principal est :

```text
app.getPath('userData')/think-browser-data.json
```

Il contient les paramètres, l'historique, les favoris, les dossiers, les
permissions par site et la session :

```json
{
  "settings": {
    "searchEngine": "google",
    "adBlockEnabled": true,
    "homePageMode": "builtin",
    "homePageUrl": "",
    "restoreSession": true,
    "saveHistory": true,
    "defaultZoom": 1,
    "downloadDir": "/home/utilisateur/Téléchargements"
  },
  "history": [],
  "favorites": [],
  "favoriteFolders": [],
  "sitePermissions": {
    "https://example.com": {
      "media": "deny",
      "geolocation": "allow"
    }
  },
  "session": {
    "windows": [
      {
        "tabs": [{ "url": "https://example.com/", "title": "Example" }],
        "activeIndex": 0,
        "bounds": { "x": 60, "y": 100, "width": 1280, "height": 800 },
        "maximized": false
      }
    ]
  }
}
```

Les téléchargements persistants sont dans :

```text
app.getPath('userData')/downloads.json
```

Les entrées de flux conservent leur type et leur progression :

```json
{
  "id": 12,
  "filename": "documentaire.mp4",
  "url": "https://exemple.com/video/index.m3u8",
  "state": "completed",
  "kind": "stream",
  "streamType": "hls",
  "progress": 100,
  "durationSeconds": 1260.5,
  "hasVideo": true,
  "hasAudio": true,
  "savePath": "/home/utilisateur/Téléchargements/documentaire.mp4"
}
```

La médiathèque est décrite dans :

```text
app.getPath('userData')/library.json
```

Chaque fiche contient un identifiant opaque, le chemin disque (jamais exposé au
renderer), le titre, le type, la durée, les dimensions, les codecs, la position
de lecture et le chemin de la miniature. Les miniatures JPEG sont stockées dans
`app.getPath('userData')/library-thumbnails/`.

```json
{
  "version": 1,
  "entries": [
    {
      "id": "library-mvlwsnz5-90a00cba32",
      "title": "Documentaire",
      "filePath": "/home/utilisateur/Téléchargements/documentaire.mp4",
      "fileName": "documentaire.mp4",
      "kind": "video",
      "source": "download",
      "durationSeconds": 1260.5,
      "width": 1920,
      "height": 1080,
      "hasVideo": true,
      "hasAudio": true,
      "thumbnailPath": "/home/utilisateur/.config/Think-Browser/library-thumbnails/library-mvlwsnz5-90a00cba32.jpg",
      "playPosition": 42.5
    }
  ]
}
```

Le cache AdBlock est stocké dans `adblock-engine.bin` à côté du fichier JSON.

- Les écritures sont **sérialisées** et **atomiques** : écriture dans un fichier
  temporaire, puis renommage.
- Les paramètres, les favoris, les dossiers et les permissions sont enregistrés
  immédiatement.
- L'historique et la session utilisent une écriture différée courte ;
  `flush()` force l'écriture à la fermeture.
- La session est sauvegardée à chaque modification pertinente et une dernière
  fois lors de `beforeunload`.
- Les fenêtres privées, leurs permissions éphémères, leurs téléchargements,
  leurs médias et leur éventuelle lecture ne sont jamais écrits dans ces
  fichiers.
- Les métadonnées des téléchargements privés restent en mémoire et sont
  oubliées à la fermeture de leur fenêtre. Les fichiers déjà enregistrés sur
  disque ne sont pas supprimés.
- La médiathèque ne copie jamais les fichiers : elle ne conserve que des
  métadonnées et des miniatures. Renommer ou supprimer depuis la médiathèque
  agit sur le fichier d'origine. Un fichier déplacé hors de l'application
  apparaît comme **introuvable** et peut être retiré de la liste.
- La position de lecture est enregistrée au plus toutes les cinq secondes, à
  la pause et à la fermeture du lecteur. Une lecture terminée repart du début.
- Les assemblages HLS/DASH écrivent d'abord un fichier temporaire
  `nom.part-<tâche>.mp4`, puis le renomment en cas de succès. Le suffixe propre
  à la tâche évite les collisions lors d'une relance immédiate. Le fichier
  temporaire est supprimé en cas d'annulation ou d'échec.
- Une tâche ffmpeg encore active à la fermeture est arrêtée ; son entrée est
  enregistrée comme annulée ou interrompue selon le moment de l'arrêt.

Pour réinitialiser complètement l'application, fermez-la puis supprimez
`think-browser-data.json`, `downloads.json`, `library.json`,
`library-thumbnails/` et `adblock-engine.bin` du dossier utilisateur.

## Architecture et découplage

### Processus principal

| Module | Responsabilité |
| --- | --- |
| `index.js` | Bootstrappe les services, configure chaque session, applique le cycle de vie et branche les événements du store. |
| `windowManager.js` | Crée les fenêtres avec l'icône applicative, charge l'interface locale, durcit les webviews, restaure la session et diffuse les événements IPC. |
| `appIcon.js` | Expose le chemin de l'icône PNG embarquée utilisée par les fenêtres hôtes et les popups. |
| `store.js` | Valide et persiste paramètres, historique, favoris, dossiers, permissions, extensions et session. |
| `extensionManager.js` | Valide le catalogue embarqué, active/désactive les extensions et applique leurs options thème/langue. |
| `homeProtocol.js` | Enregistre et sert la page d'accueil locale sous `think-home://`. |
| `downloadManager.js` | Intercepte `will-download`, route les fichiers directs et les flux, choisit un chemin unique, filtre les accès privés et diffuse la progression. |
| `downloadStore.js` | Écrit `downloads.json` de façon atomique et différée, y compris les métadonnées de flux. |
| `libraryStore.js` | Valide et persiste `library.json` de façon atomique, avec écriture différée et dédoublonnage par chemin. |
| `mediaLibrary.js` | Gère les fiches de la médiathèque, l'import, le renommage, la suppression, les métadonnées, les miniatures et la position de lecture. |
| `mediaProtocol.js` | Sert les médias et miniatures sous `think-media://`, avec validation des identifiants et support de `Range`/`HEAD`. |
| `mediaPair.js` | Associe une piste vidéo et une piste audio détectées, choisit le conteneur MP4/MKV et construit le nom de la fusion. |
| `youtube.js` | Reconnaît les URL de vidéos YouTube et en extrait l'identifiant public sans requête réseau. |
| `ytDlpDownloader.js` | Détecte l'exécutable externe optionnel yt-dlp, suit sa progression, annule ses processus et retrouve le fichier produit. |
| `videoDownloader.js` | Sonde un manifeste ou une paire de pistes, lance ffmpeg, analyse sa progression, annule ou finalise l'assemblage. |
| `videoTools.js` | Sélectionne et autoteste ffmpeg/ffprobe, lit les métadonnées, génère les miniatures et construit les en-têtes HTTP. |
| `userAgent.js` | Construit et applique le User-Agent Chrome correspondant au moteur embarqué. |
| `adblocker.js` | Charge les filtres, couvre la session normale et les partitions privées, active/désactive le blocage, gère le cache et compte les blocages par webview. |
| `networkMonitor.js` | Maintient les écouteurs réseau `onBeforeRequest` et `onResponseStarted`, et délègue les décisions à AdBlock. |
| `mediaDetector.js` | Reconnaît les extensions média, filtre les sons d'interface et les fichiers minuscules, puis déduplique les flux après réception des en-têtes. |
| `permissions.js` | Demande et mémorise les permissions sensibles, avec un mode éphémère pour le privé. |
| `contextMenu.js` | Construit le menu contextuel des pages dans le processus principal. |
| `favoritesIO.js` | Ouvre les dialogues natifs et lit/écrit l'export JSON des favoris. |
| `guestController.js` | Gère popups, navigation HTTP(S), historique et raccourcis des webviews. |
| `security.js` | Configure les permissions et les `webPreferences` des invités. |
| `shortcuts.js` | Traduit les entrées clavier en actions applicatives. |
| `browsingData.js` | Efface les données de session sans toucher aux favoris/historique. |
| `ipcHandlers.js` | Relie les canaux IPC aux services, sans logique métier. |

### Renderer

- `partials.js` charge les fragments HTML statiques avant `app.js` ;
  `bootstrap.js` démarre ensuite l'application.
- `app.js` assemble les composants ; il ne contient ni accès disque ni accès
  réseau.
- `tabManager.js` expose `Tab` (DOM de l'onglet + `<webview>`) et `TabManager`
  (collection, activation, fermeture, pile des onglets fermés, événements).
- `navBar.js` gère uniquement l'URL, l'état des boutons et l'étoile de favori.
- `mediaSniffer.js` affiche les médias reçus du processus principal et déclenche
  les téléchargements directs ou ffmpeg.
- `ui/library.js` affiche les fiches, filtre, importe, renomme et supprime les
  médias ; `ui/player.js` pilote le lecteur intégré et la reprise de position.
- `api.js` est la seule façade autorisée vers `ipcRenderer`. Les composants
  `ui/` ne connaissent pas les canaux IPC.
- `theme.js` applique uniquement un identifiant de thème validé au document
  hôte ; `i18n.js` applique des traductions embarquées aux textes et attributs
  du chrome. Les pages web des webviews ne sont jamais modifiées.
- `ui/extensions.js` affiche le catalogue, les interrupteurs et les sélecteurs
  de thème/langue. Il ne charge ni ne compile de code d'extension.
- `home/` contient la page locale autonome, servie par le protocole
  `think-home://` et sans accès Node.js.
- `pages/` contient les documents internes autonomes `about:config`,
  `about:security` et `about:dev`, servis par `think-page://`. Ils n'ont ni
  preload ni accès Node.js ; leurs données passent par des routes JSON
  same-origin.
- Chaque composant `ui/` est autonome : menu, paramètres, extensions,
  historique, favoris, téléchargements, médiathèque, lecteur, recherche,
  confirmations, notifications et À propos.

### Shared

- `constants.js` centralise **tous** les canaux IPC, les actions de raccourcis,
  les moteurs de recherche, les permissions, les extensions de flux et les
  limites.
- `extensions.js` contient le catalogue déclaratif des extensions embarquées,
  les thèmes, les langues, les identifiants autorisés et les helpers de
  normalisation.
- `securityNotices.js` contient les avis locaux, les limites résiduelles et la
  politique de mise à jour/signalement affichés par `about:security`. Aucun
  contenu distant n'est chargé.
- `utils.js` contient les helpers purs : validation HTTP(S), résolution d'URL,
  extraction d'hôte, normalisation de titre, identifiants, formats de taille et
  de durée, type de flux HLS/DASH, noms de fichiers sûrs.

### Réseau, médias et AdBlock

Electron n'autorise qu'un seul écouteur `onBeforeRequest` par session.
`NetworkMonitor` installe donc un écouteur unique par session qui :

1. mémorise les candidats média dans un `MediaDetector` propre à la session ;
2. délègue la décision à AdBlock s'il est actif ;
3. laisse passer la requête sinon.

Un second écouteur `onResponseStarted` confirme chaque candidat à partir de son
type MIME et de sa taille. Les sons d'interface, les fichiers de moins de
64 Kio et les réponses HTML sont écartés ; les manifestes HLS/DASH et les
segments de streaming restent acceptés.

Toutes les sessions reçoivent le filtrage réseau AdBlock. Les filtres
cosmétiques et leurs scriptlets sont désactivés : sur les pages qui imposent
Trusted Types (YouTube, Google, etc.), leur injection au démarrage peut laisser
le document entièrement blanc. Chaque partition privée possède son propre
`NetworkMonitor` et son propre `MediaDetector` ; les écouteurs et détecteurs
privés sont libérés à la fermeture de la fenêtre. Les compteurs de blocage sont
eux aussi propres à chaque webview et repartent de zéro au document principal.

### Téléchargement des vidéos

Le renderer ne manipule jamais directement le réseau ni le disque. Le flux
complet est le suivant :

1. `MediaDetector` repère une URL `.m3u8`, `.mpd` ou un fichier média pendant
   `onBeforeRequest`, puis la confirme pendant `onResponseStarted` à partir du
   type MIME et de la taille. Elle est associée à la webview qui l'a demandée.
   Le bouton **Analyser la page** complète cette liste avec `siteExtractor`, qui
   lit le DOM, les attributs `src`/`href`, le HTML et les scripts publics, puis
   résout les URL relatives. Les métadonnées publiques de Vimeo et Dailymotion
   peuvent être interrogées avec les cookies de la session ; aucun DRM ni
   anti-bot n'est contourné.
2. Le panneau Médias envoie l'URL au processus principal. `ipcHandlers` vérifie
   que le média appartient bien à la fenêtre et retrouve sa webview d'origine.
3. Un fichier direct est confié à `webContents.downloadURL()` ; Chromium gère
   les cookies, la reprise et la destination. Tant que le `DownloadItem` reste
   vivant, `canResume()`/`resume()` permettent de reprendre un fichier partiel.
4. Pour un manifeste HLS/DASH, `media:prepare` lance ffprobe et inspecte le
   manifeste :
   - `videoTools` sélectionne un ffmpeg/ffprobe fonctionnel ;
   - les pistes vidéo, audio et sous-titres sont normalisées avec leurs index
     absolus ;
   - un HLS sans `#EXT-X-ENDLIST` (ou `EVENT`) et un DASH `dynamic` sont
     marqués comme directs.
5. `VideoDownloader` construit la commande ffmpeg :
   - les cookies de la session, le User-Agent, le Referer et l'Origin sont
     transmis ;
   - `-map 0:v:0?` et la piste audio choisie (ou `0:a:0?`) sont copiées sans
     réencodage ;
   - un sous-titre choisi est mappé et converti en `mov_text` ;
   - `-progress pipe:1` alimente la progression ; le fichier temporaire est
     renommé seulement après une sortie ffmpeg réussie.
6. Deux tâches ffmpeg au maximum sont actives. Les demandes suivantes sont
   conservées dans une file FIFO, passent à l'état `queued` et sont lancées
   automatiquement dès qu'un emplacement se libère. Une annulation tue le
   processus, supprime le fichier temporaire et libère immédiatement l'entrée.
7. Pour un direct, **Arrêter et conserver** écrit `q` sur l'entrée standard de
   ffmpeg afin qu'il finalise l'atome `moov`, puis envoie `SIGKILL` après dix
   secondes si le processus ne répond pas. Le fichier partiel est conservé.
8. Les tâches terminées, annulées ou interrompues sont conservées dans
   `downloads.json` avec leur type, leur durée, leurs pistes et leur état. Au
   redémarrage, les états `progressing` et `queued` deviennent `interrupted`.

Le chemin interne de détection et de téléchargement n'effectue aucun
contournement de DRM, de protection anti-bot ou de flux MSE exposé uniquement
en `blob:`. Le pont YouTube optionnel délègue ces aspects à l'outil externe
yt-dlp ; Think-Browser ne fournit ni clé, ni jeton, ni mécanisme de
contournement, et l'utilisateur doit vérifier les droits et conditions
applicables.

### Médiathèque et protocole local

La médiathèque ne déplace ni ne copie les fichiers. `MediaLibrary` conserve
uniquement des métadonnées et un identifiant opaque ; le renderer ne reçoit
jamais le chemin disque.

1. Un téléchargement direct terminé déclenche `MediaLibrary.addFromDownload()`
   depuis `DownloadManager`. Les enregistrements privés sont ignorés.
2. `libraryStore` valide la fiche, la dédoublonne par chemin et l'écrit dans
   `library.json` avec une écriture atomique différée.
3. `videoTools` lance ffprobe pour la durée, les dimensions et les codecs, puis
   ffmpeg pour une miniature JPEG. Ces enrichissements sont non fatals : une
   fiche reste utilisable si ffprobe ou ffmpeg est absent.
4. Le renderer demande `think-media://media/<id>` ou
   `think-media://thumbnail/<id>`. `mediaProtocol` vérifie l'identifiant,
   résout le chemin côté processus principal et répond avec les types MIME et
   les en-têtes `Accept-Ranges`/`Content-Range` appropriés.
5. Le lecteur enregistre la position au plus toutes les cinq secondes, à la
   pause et à la fermeture. Une position proche de la fin repart de zéro.
6. Renommer met à jour le fichier réel, la fiche et, si elle existe, l'entrée
   `downloads.json` correspondante. Supprimer efface le fichier, la miniature
   et la fiche après confirmation.

Les fichiers absents sont signalés **introuvable** sans supprimer la fiche.
La médiathèque et le protocole sont désactivés pour les fenêtres privées.

### Téléchargement par lien et pages internes

Le dialogue **Télécharger un lien** et `about:config` passent par
`DownloadManager.inspectUrl()` puis `startUrlDownload()` :

1. l'URL doit être HTTP(S), sans identifiants intégrés ;
2. une requête `HEAD`/`GET` avec les cookies de la session vérifie le type, la
   taille et les capacités ffmpeg ; le `Referer` n'est ajouté que si le réglage
   l'autorise et si l'URL source est sûre ;
3. un fichier est confié à Chromium, un manifeste HLS/DASH à la file ffmpeg ;
4. les en-têtes `Referer` et `User-Agent` sont nettoyés, et un nom de fichier
   `Content-Disposition` passe par `sanitizeFilename()`.

`think-page://config/`, `think-page://security/` et `think-page://dev/` sont
déclarés dans `pageProtocol.js`. Chaque document reçoit une CSP
`default-src 'none'`, `script-src 'self'`, `frame-ancestors 'none'`, sans
preload. Chromium sérialise l'origine des `fetch` `think-page://` en `null` :
les mutations POST exigent donc une preuve interne composée de l'en-tête
`x-think-request: 1`, d'un corps `application/json` et, lorsqu'un `Origin` non
nul est présent, d'une origine `think-page://<hôte>` exacte. Un formulaire
intersite ou un `fetch` `no-cors` ne peut pas fournir cet en-tête personnalisé
sans un préflight CORS, refusé par `corsEnabled: false`. Les corps JSON sont
limités à 64 Ko. `about:config` ne démarre un lien direct que dans la session
normale ; une fenêtre privée renvoie vers le menu de la fenêtre pour conserver
la partition et l'isolation du téléchargement.

`about:security` agrège cookies, permissions, historique HTTP, cache,
téléchargements récents, contrôles de posture et avis `TB-SEC-*`. Les valeurs de
cookies sont masquées par défaut et ne quittent jamais le processus principal.

### Atelier `about:dev`

`DevWorkspace` est instancié dans `src/main/index.js` et sert les routes
`/api/dev/*`, `/preview/<jeton>` et `/file/<chemin>` sous `think-page://dev/` :

- l'espace de travail est choisi par le sélecteur natif ; l'API n'accepte plus
  de chemin fourni par la page ;
- les chemins sont résolus sous la racine, les `..`, chemins absolus et liens
  symboliques sont refusés ; la racine ne peut être renommée ou supprimée ;
- les fichiers texte sont limités à 1 Mo, les sorties à 512 Ko, les commandes à
  30 secondes ; les dossiers `node_modules`, `.git`, etc. sont ignorés ;
- les aperçus HTML/CSS/JS sont servis avec un jeton aléatoire de 10 minutes,
  une base relative vers `/file/` et une CSP `sandbox` ; les ressources non HTML
  (SVG, CSS, médias) sont également sandboxées ;
- les interpréteurs Node, Python, PHP et Go sont détectés dans le `PATH` ;
- le terminal utilise une liste fermée de commandes, `execFile` sans shell et
  refuse les opérateurs shell (point-virgule, esperluette, barre verticale,
  redirections, backtick). **Il n'est pas une sandbox** : le code exécuté
  hérite des droits du compte utilisateur.

### Audit et avis

`npm run audit:security` exécute les contrôles statiques (`scripts/securityAudit.js`)
et les tests d'intrusion unitaires. `SECURITY-AUDIT.md` décrit le modèle de
menace, les constats, les corrections, les risques acceptés et les commandes de
reproduction. Les avis embarqués sont visibles dans `about:security` et ne
constituent pas un flux CVE distant.

## Sécurité

L'interface hôte est un fichier local statique chargé dans une fenêtre
`BrowserWindow` avec `nodeIntegration: false`, `contextIsolation: true` et un
preload dédié. La sandbox Electron du renderer hôte est désactivée
(`sandbox: false`) car ce preload lit les fragments HTML avec `fs` ; c'est une
limite acceptée, affichée par `about:security`. Le renderer est compilé par
esbuild en un bundle CommonJS qui ne charge ni `electron` ni module Node.js. Le
preload expose uniquement `window.thinkBridge` avec :

- `invoke` limité aux canaux d'action déclarés dans `shared/constants.js` ;
- `send` limité à la sauvegarde de session et à la création de fenêtres ;
- `on` limité aux événements explicitement autorisés ;
- `readPartial` limité à une liste fermée de fragments HTML internes.

Les extensions internes suivent le même principe : le renderer ne reçoit qu'un
catalogue de métadonnées et des identifiants validés par le processus principal.
Aucun fichier d'extension, `eval`, `Function`, script distant ou module Node.js
n'est chargé. Les canaux `extensions:*` refusent les identifiants inconnus et
réinitialisent le thème ou la langue lorsqu'une extension est désactivée.

Les pages internes `think-page://` n'ont ni preload ni intégration Node.js.
Leurs documents sont statiques et leur CSP interdit les scripts distants,
l'inclusion de cadres et l'usage de `base-uri`. Les routes API combinent
validation d'origine, en-tête interne `x-think-request`, corps JSON, limite de
64 Ko et refus des méthodes inattendues. Cette preuve interne est nécessaire
car Chromium n'envoie pas d'`Origin` exploitable pour le schéma `think-page`.
`about:config` ne démarre un téléchargement direct que dans la session normale ;
en navigation privée, le menu de la fenêtre est requis pour conserver la
partition éphémère. `about:dev` ajoute un confinement de chemins, un refus des
liens symboliques, des limites de taille et une CSP sandbox pour tous ses
aperçus et ressources. Le terminal reste explicitement hors sandbox.

Les pages distantes ne reçoivent jamais ce preload : il est attaché uniquement
à la fenêtre hôte. Les `<webview>` invitées appliquent :

- Node.js et l'intégration Node dans les workers désactivés ;
- sandbox Chromium explicite (`sandbox: true`) ;
- isolation de contexte activée ;
- préchargement personnalisé supprimé ;
- balises `<webview>` imbriquées désactivées ;
- navigation limitée à HTTP(S) ;
- `target="_blank"` transformé en onglet contrôlé ; `window.open` avec options,
  fenêtre nommée ou cible vide transformé en fenêtre fille sécurisée, dans la
  même partition, avec `window.opener` et `postMessage` ; popups imbriquées
  refusées ;
- permissions sensibles filtrées, avec demande explicite pour les permissions
  autorisables.

Chaque session (normale ou privée) possède ses propres gestionnaires de
permissions. Les décisions privées sont conservées en mémoire pour la durée de
la partition uniquement. Les téléchargements privés sont rattachés à leur
fenêtre et ne sont jamais listés dans une autre fenêtre.

Les téléchargements de flux appliquent également :

- validation stricte des URL HTTP(S), refus des identifiants intégrés et des
  extensions de manifeste inconnues ;
- noms de fichiers nettoyés (`.`/`..`, noms réservés Windows, longueur bornée)
  et vérification que la destination reste dans le dossier de téléchargement ;
- valeurs d'en-têtes nettoyées pour empêcher l'injection de lignes CRLF ;
- lancement de ffmpeg par arguments, sans shell ni concaténation de commande ;
- pour YouTube, validation stricte des URL de vidéos et lancement de yt-dlp par
  arguments, avec un chemin d'exécutable détecté ou fourni explicitement ;
- écriture dans un fichier temporaire du dossier de téléchargement, puis
  renommage contrôlé ;
- arrêt forcé des processus ffmpeg et yt-dlp à la fermeture de l'application.

Le protocole `think-media://` applique également :

- résolution exclusive par identifiant opaque, sans chemin disque fourni par le
  renderer ;
- vérification que le fichier est bien une fiche connue de la médiathèque ;
- réponse `404` pour un identifiant inconnu et `416` pour une plage invalide ;
- support de `GET`, `HEAD`, `Range`, `Accept-Ranges`, `Content-Range` et
  `Content-Length`, nécessaire au déplacement dans la vidéo ;
- refus des fiches privées et des accès hors de la session normale.

La CSP de l'interface limite les scripts à `'self'` et les cadres à HTTP(S).
Les erreurs de certificat TLS sont refusées explicitement par un gestionnaire
`certificate-error` qui appelle `callback(false)`. Le bundle et le preload sont
reconstruits par `npm run build:renderer` avant `npm start`, `npm run check` et
les distributions.

`about:security` expose aussi des avis locaux `TB-SEC-*`, les limites
résiduelles (sandbox hôte, terminal `about:dev`, absence d'antivirus, absence
d'auto-update, DRM/anti-bot) et une politique de mise à jour manuelle. Aucune
télémétrie n'est envoyée.

Le rapport complet et les charges hostiles testées sont dans
[`SECURITY-AUDIT.md`](SECURITY-AUDIT.md).

## Vérification

```bash
npm run check
npm run audit:security
npm run audit:dependencies
npm test
npm run test:integration
```

`npm run audit:security` exécute les contrôles statiques de
`scripts/securityAudit.js` puis tous les tests d'intrusion dynamiques
(`security`, `pageProtocol`, `guestController`, `devWorkspace`,
`downloadManager`, `utils`, etc.). Il affiche les avertissements résiduels et
échoue si un contrôle critique régresse. Au 27 octobre 2026, le résultat de
référence est **18 contrôles réussis, 3 avertissements, 0 échec**.

`npm run audit:dependencies` exécute `npm audit` sur les dépendances de
production et de développement. La base du registre change avec le temps : la
commande doit être rejouée avant chaque distribution.

`npm test` exécute les tests unitaires avec le lanceur intégré de Node :
helpers partagés, analyse ffprobe, manifestes HLS/DASH, extraction de page,
file d'attente, reprise, arrêt, catalogue et validation des extensions,
`removeAllListeners` du renderer, suivi d'historique des webviews, durcissement
du preload, origine et traversées des pages internes, confinement et terminal
de `about:dev`, noms de fichiers et identifiants des téléchargements. Aucun
réseau ni fichier utilisateur n'est requis. Au 27 octobre 2026, les 80 tests
passent.

`npm run test:integration` construit le bundle, démarre Electron avec un profil
temporaire et un serveur HLS local, puis vérifie le pont `thinkBridge`, les
boîtes de dialogue, le catalogue d'extensions, le changement de thème et de
langue, l'extraction de page, `media:prepare`, la sélection d'une piste audio,
le téléchargement effectif, les pages `about:config`, `about:security` et
`about:dev`, les avis de sécurité, les téléchargements par lien, les
opérations fichiers, l'aperçu sandboxé, l'exécution Node et le terminal.
Sous Linux sans écran, lancez-la dans une session Xvfb. Pour rejouer le même
scénario contre un paquet déjà construit, définissez `THINK_ELECTRON_BIN` :

```bash
THINK_ELECTRON_BIN=dist/Think-Browser-2.0.0-linux-x86_64.AppImage \
  APPIMAGE_EXTRACT_AND_RUN=1 npm run test:integration
```

Le script `scripts/check.js` :

- vérifie la syntaxe de tous les modules JavaScript (`src`, `scripts`,
  `tests`) avec `node --check` ;
- vérifie la fermeture et l'absence d'imbrication des commentaires CSS ;
- contrôle l'équilibre des accolades et parenthèses des feuilles CSS ;
- vérifie la présence des fichiers requis (HTML, CSS, assets, preload, bundle,
  tests, icônes de distribution, README) ;
- contrôle le durcissement du renderer : `nodeIntegration: false`,
  `contextIsolation: true`, preload déclaré, pont `contextBridge` à listes
  d'autorisation et absence de modules Node.js/Electron dans le bundle ;
- vérifie la présence des commandes `npm test`, `npm run test:integration` et
  `npm run audit:security` ;
- contrôle la configuration electron-builder : cibles Linux et Windows,
  scripts de distribution, extraction asar et hook `afterPack`.

### Vérifications manuelles conseillées

1. Ouvrir plusieurs onglets, naviguer, changer d'onglet et vérifier que la page
   inactive n'est pas rechargée.
2. Tester un lien `target="_blank"` et vérifier l'ouverture dans un nouvel
   onglet, puis un `window.open` avec options et vérifier la fenêtre fille,
   `window.opener` et `postMessage`.
3. Fermer un onglet puis `Ctrl+Shift+T` pour le rouvrir.
4. Tester `Ctrl+F`, les résultats suivants/précédents et `Échap`.
5. Tester `Ctrl++`, `Ctrl+-` et `Ctrl+0`, puis vérifier le zoom de l'onglet.
6. Ajouter une page aux favoris, créer un dossier, y déplacer le favori,
   exporter puis importer le fichier JSON.
7. Consulter l'historique, ouvrir une entrée et effacer l'historique.
8. Télécharger un fichier direct, vérifier le suivi, le nom unique et l'action
   « Afficher dans le dossier » ; interrompre puis reprendre le téléchargement
   tant que l'application reste ouverte, et vérifier qu'après redémarrage
   l'action « Relancer » repart du début.
9. Lire une vidéo et vérifier l'indicateur et le panneau médias.
10. Détecter un flux HLS et un flux DASH, les télécharger, vérifier le fichier
    MP4, la durée, la progression et l'action « Afficher dans le dossier ».
    Pour un flux à plusieurs pistes, choisir une piste audio et un sous-titre
    dans la boîte de dialogue, puis vérifier le fichier obtenu avec ffprobe.
11. Lancer deux flux simultanément, vérifier que le troisième reste en attente
    puis démarre automatiquement, et annuler une tâche pour vérifier la
    disparition du fichier temporaire.
12. Vérifier qu'un flux HLS privé n'apparaît que dans sa fenêtre et disparaît
    du panneau après sa fermeture, sans être ajouté à `downloads.json`.
13. Tester **Paramètres → Page d'accueil** (locale et personnalisée), le zoom
    par défaut, la restauration de session et l'enregistrement de l'historique.
14. Déclencher une permission (micro, géolocalisation), vérifier la demande et
    la mémorisation, puis **Paramètres → Réinitialiser les autorisations**.
15. Ouvrir une fenêtre privée, vérifier le badge, l'absence d'historique et de
    favoris, et l'isolation des téléchargements/médias.
16. Fermer la dernière fenêtre normale alors qu'une fenêtre privée reste
    ouverte, puis quitter : la session normale doit être restaurée au prochain
    lancement, sans la fenêtre privée.
17. Modifier le moteur de recherche et vérifier le nouvel onglet.
18. Activer puis désactiver AdBlock et vérifier les journaux du processus
    principal, y compris avec une fenêtre privée ouverte.
19. Ouvrir le menu contextuel sur un lien, une image et un champ de texte.
20. Redémarrer l'application et vérifier paramètres, historique, favoris,
    permissions et session.
21. Télécharger un MP4 et un MP3, ouvrir **Médiathèque**, vérifier l'ajout
    automatique, les métadonnées, la miniature et la recherche/filtre.
22. Lire une vidéo, déplacer la progression, fermer puis rouvrir : la position
    doit être reprise. Vérifier `Range` en déplaçant la tête de lecture.
23. Renommer le média, vérifier le fichier et `downloads.json`, puis supprimer
    un média et vérifier la suppression du fichier et de la miniature.
24. Importer un fichier local, puis déplacer le fichier hors de l'application :
    la fiche doit afficher **introuvable** sans être supprimée.
25. Vérifier que la médiathèque est refusée en navigation privée et qu'un
    téléchargement privé n'apparaît jamais dans `library.json`.
26. Vérifier `navigator.userAgent` : il doit contenir `Chrome/<version>` sans
    `Electron` ni `Think-Browser`, tout en conservant les API Chromium réelles.
27. Avec AdBlock activé, ouvrir YouTube et une autre page imposant Trusted
    Types : la page doit s'afficher et la vidéo YouTube doit pouvoir démarrer.
28. Dans le lecteur, activer le plein écran : la fenêtre entière doit être
    utilisée et les contrôles doivent rester visibles. Fermer le lecteur ou
    appuyer sur `Échap` doit restaurer la taille précédente.
29. Construire avec `npm run pack`, lancer l'application décompressée et
    vérifier dans le journal que ffmpeg/ffprobe sont sélectionnés depuis
    `app.asar.unpacked`, puis rouvrir la médiathèque et le lecteur.
30. Construire avec `npm run dist:linux`, vérifier la présence de l'AppImage et
    du paquet `.deb`, puis lancer l'AppImage avec un profil de test.
31. Sur une page contenant des médias non encore demandés, cliquer sur
    **Analyser la page** : les URL relatives doivent être résolues et les
    nouveaux médias ajoutés au panneau. Vérifier qu'une page sans média public
    affiche le message d'absence sans erreur.
32. Démarrer un direct HLS, vérifier le badge **DIRECT**, puis cliquer sur
    **Arrêter et conserver**. Le fichier doit être finalisé et l'entrée passer à
    l'état terminé.
33. Dans une fenêtre privée, vérifier que l'extraction de page et les
    téléchargements restent confinés à cette fenêtre, puis qu'ils disparaissent
    à sa fermeture.
34. Lancer l'AppImage avec `--user-data-dir` vers un profil temporaire et
    vérifier que les binaires ffmpeg/ffprobe sont bien résolus depuis
    `app.asar.unpacked` pour un téléchargement HLS.
35. Ouvrir **Menu → Extensions**, activer/désactiver **Thèmes Think** et
    **Langues Think**, puis vérifier que le thème et la langue changent
    immédiatement dans toutes les fenêtres ouvertes.
36. Choisir le thème **Clair**, vérifier la lisibilité de la barre d'adresse,
    des menus, des modales et du panneau Médias, puis revenir au thème sombre.
37. Passer en anglais, vérifier le menu et la barre d'outils, puis revenir au
    français. Redémarrer l'application et vérifier la persistance des choix.
38. Ouvrir `about:config`, rechercher un réglage, changer le thème, la langue,
    le zoom par défaut et la concurrence des flux (1 à 4), puis redémarrer.
39. Inspecter un lien direct valide, un lien sans média et un lien
    `https://user:secret@…` : ce dernier doit être refusé avec un message
    explicite. Vérifier qu'aucun fichier n'est créé.
40. Depuis `about:config`, démarrer un téléchargement direct et vérifier qu'il
    apparaît dans le panneau normal. Ouvrir la même page dans une fenêtre
    privée : le démarrage doit renvoyer vers le menu de la fenêtre.
41. Ouvrir `about:security`, vérifier les contrôles, les avis `TB-SEC-*`, les
    limites et les politiques de mise à jour/signalement, puis tester une
    suppression de cookie et le nettoyage de session.
42. Ouvrir `about:dev`, choisir un dossier vide, créer `index.html`, `style.css`
    et `app.js`, vérifier l'arborescence, les onglets, l'aperçu et la console.
    Vérifier qu'un `../` et un lien symbolique sont refusés.
43. Tester le terminal avec `help`, `pwd`, `ls`, `cat`, `echo`, puis vérifier
    que `rm -rf /`, `;`, `&&`, `|` et les redirections sont refusés.
44. Exécuter un fichier Node/Python/PHP/Go si l'interpréteur est installé ;
    sinon vérifier le message d'indisponibilité. Vérifier que l'interface
    rappelle que le terminal n'est pas une sandbox.
45. Lancer `npm run audit:security`, `npm run audit:dependencies` puis
    `npm run test:integration`, et vérifier que `SECURITY-AUDIT.md` correspond
    aux résultats obtenus.

## Limites connues

- **Téléchargement vidéo universel** : les flux protégés par DRM, les flux MSE
  exposés uniquement via `blob:` et les sites protégés par anti-bot ne peuvent
  pas être téléchargés sans contourner des protections, ce qui n'est pas
  implémenté.
- **HLS/DASH** : les flux accessibles sont assemblés avec ffmpeg, mais les
  variantes exotiques ou les codecs absents du binaire sélectionné peuvent
  échouer. Les manifestes chiffrés, les clés DRM et les flux MSE exposés
  uniquement via `blob:` ne sont pas pris en charge.
- **YouTube / SABR** : YouTube peut servir ses vidéos via des requêtes `POST`
  `videoplayback` dont la réponse est un conteneur binaire
  `application/vnd.yt-ump` (SABR), sans URL MP4/M4A directement adressable.
  La détection réseau et la fusion audio/vidéo ne peuvent alors pas produire de
  fichier. Think-Browser ne décode pas ce protocole et n'intègre pas
  `yt-dlp`/`youtube-dl` ; aucun contournement anti-bot n'est effectué. Pour une
  vidéo YouTube, la solution reste un extracteur externe autorisé, ou le
  téléchargement officiel proposé par la plateforme.
- **Dépendance ffmpeg** : sans binaire fonctionnel, seuls les fichiers directs
  sont téléchargeables. Le panneau Médias et le message d'erreur l'indiquent.
- **Reprise de téléchargement** : un fichier direct peut reprendre tant que
  Chromium conserve son `DownloadItem` et que le serveur accepte les requêtes
  `Range`. Après redémarrage, il est relancé depuis le début. Les assemblages
  HLS/DASH ne reprennent pas les segments déjà récupérés ; **Relancer** refait
  l'assemblage complet.
- **Directs** : l'arrêt envoie `q` à ffmpeg puis `SIGKILL` après dix secondes.
  Un serveur qui ne répond plus ou un conteneur non finalisable peut produire
  un fichier partiel illisible ; le fichier déjà reçu est néanmoins conservé.
- **Extraction de page** : seuls le DOM, les attributs publics et les scripts
  déjà chargés sont lus. Les URL construites uniquement à l'exécution, les flux
  MSE `blob:` et les ressources protégées ne sont pas inventées ni contournées.
  L'analyse Vimeo/Dailymotion dépend des métadonnées publiques disponibles.
- **File d'attente** : deux assemblages ffmpeg au maximum. Une tâche en attente
  ne peut pas être mise en pause ; elle peut être annulée avant son démarrage.
- **Téléchargements privés** : ils ne sont ni persistés ni relançables depuis
  le panneau ; retéléchargez le fichier depuis sa page.
- **Fenêtres privées** : elles sont exclues de la restauration de session.
  Le filtrage réseau AdBlock y est actif, mais les scriptlets cosmétiques sont
  désactivés pour toutes les sessions.
- **Sandbox du renderer hôte** : elle est désactivée car le preload lit les
  fragments avec `fs`. `nodeIntegration:false`, l'isolation de contexte et le
  pont fermé réduisent la portée, mais ce n'est pas équivalent à une sandbox
  active.
- **Terminal `about:dev`** : il n'est pas une sandbox. Les commandes et fichiers
  exécutés héritent des droits du compte utilisateur ; `npm`, `npx` et `git`
  peuvent exécuter du code tiers. N'exécutez que des projets de confiance.
- **Éditeur `about:dev`** : l'éditeur reste volontairement simple (numéros de
  ligne, onglets, enregistrement explicite). La coloration syntaxique avancée,
  l'autocomplétion, l'import/export de projet et la sauvegarde automatique ne
  sont pas implémentés dans cette version.
- **Hardlinks/TOCTOU** : les liens symboliques sont refusés et les chemins sont
  revérifiés, mais un hardlink créé manuellement dans l'espace de travail peut
  référencer un fichier extérieur. L'espace reste choisi par l'utilisateur.
- **Mises à jour et antivirus** : aucun auto-updater signé, flux CVE distant ou
  scan antivirus des téléchargements n'est intégré. Reconstruire et réauditer
  avant distribution ; conserver l'antivirus système actif.
- **Popups** : les fenêtres `window.open` contrôlées conservent `window.opener`
  et `postMessage`. Les popups imbriquées sont limitées aux domaines de
  connexion connus. Les schémas personnalisés (OAuth applicatif, `intent://`,
  etc.) restent bloqués par la politique HTTP(S).
- **Connexion Google** : Google peut refuser la connexion dans un navigateur
  intégré Electron, même avec un User-Agent Chrome standard et une fenêtre
  OAuth de premier niveau. Think-Browser affiche un avertissement lorsqu'il
  détecte la page de refus, mais ne contourne pas ce contrôle de sécurité ;
  pour Gmail, utilisez le navigateur système ou une session Chrome compatible.
- **Médiathèque** : les fichiers sont référencés à leur emplacement d'origine ;
  déplacer un fichier hors de l'application le rend introuvable. Les formats
  non décodables par Chromium ne sont pas lus, même si ffprobe les reconnaît.
  L'import utilise le sélecteur natif du système.
- **Compatibilité** : les sites qui exigent Widevine/DRM, un navigateur
  spécifique, des API d'appareil (USB, Bluetooth, série, capture d'écran) ou un
  contournement anti-bot restent hors de portée. Think-Browser ne falsifie pas
  les API de détection.
- **Pièces jointes** : la navigation directe vers une URL de pièce jointe peut
  produire un avertissement `ERR_FAILED` dans Chromium ; le téléchargement
  continue et l'interface reste utilisable.
- **Dialogues natifs** : les sélecteurs de dossier/fichier et certaines boîtes
  de dialogue ne peuvent pas être validés dans un environnement headless ; ils
  doivent être vérifiés sur un bureau réel.
- **AdBlock hors ligne** : si le téléchargement des filtres échoue, la
  navigation reste disponible sans filtrage. Réactiver l'option relance le
  chargement.
- **Menu natif** : il est désactivé pour éviter les conflits avec les raccourcis
  multi-onglets ; toutes les actions passent par le menu `⋮`.
- **Distribution** : les paquets Linux (AppImage, deb) sont construits et
  vérifiés ; la configuration Windows (NSIS, portable) est présente, mais la
  construction Windows doit être effectuée sur Windows pour embarquer le bon
  binaire ffmpeg. Les paquets ne sont pas signés et les métadonnées
  `homepage`/`maintainer` utilisent des valeurs de substitution `.example`.
- **AdBlock** : seuls les filtres réseau sont appliqués. Les publicités
  injectées côté page ou les éléments cosmétiques non bloqués peuvent rester
  visibles ; ce compromis préserve les sites utilisant Trusted Types.
- **Extensions** : seules les extensions embarquées sont prises en charge.
  Chrome Web Store, les extensions MV2/MV3 tierces, les content scripts
  arbitraires et les mises à jour distantes ne sont pas implémentés. Le thème
  ne modifie jamais le contenu des pages web.
- **Langues** : la traduction française/anglaise couvre le chrome, les menus et
  les panneaux principaux ; certains messages dynamiques, erreurs réseau et
  textes secondaires peuvent rester en français. Les pages web conservent leur
  propre langue.

## Dépannage

- **Écran vide au lancement** : vérifier que `src/main/index.js` et
  `src/renderer/index.html` existent, puis lancer `npm run check`.
- **Erreur de sandbox sous Linux** : lancer dans un environnement graphique
  valide. Pour un test headless uniquement, utiliser Xvfb et les options
  Electron appropriées.
- **AdBlock indisponible** : vérifier la connexion réseau ; les filtres sont
  mis en cache après le premier chargement réussi.
- **ffmpeg ou ffprobe indisponible** : consulter le journal du processus
  principal ; le chemin retenu et l'échec de l'autotest y sont affichés. Vérifier
  les paquets installés ou définir `THINK_FFMPEG_PATH` et
  `THINK_FFPROBE_PATH`. Dans une application empaquetée, le binaire doit se
  trouver sous `resources/app.asar.unpacked` ; le hook `afterPack` ne conserve
  que la plateforme et l'architecture ciblées. Un flux qui échoue malgré ffmpeg
  peut être protégé, expiré ou dépendre de `blob:`/MSE.
- **AppImage ne démarre pas sous Linux** : vérifier la présence de FUSE 2 ou
  lancer l'AppImage avec `--appimage-extract-and-run`.
- **Avertissement Windows SmartScreen** : les paquets ne sont pas signés. Pour
  une distribution publique, configurer un certificat de signature de code
  dans electron-builder.
- **Média introuvable** : le fichier a été déplacé, renommé ou supprimé hors de
  l'application. Utilisez **Supprimer** pour retirer la fiche ou remettez le
  fichier à son emplacement d'origine. Le renommage depuis la médiathèque met
  à jour la fiche et le téléchargement associé.
- **Lecture impossible** : vérifier que le codec est pris en charge par
  Chromium. ffprobe peut reconnaître un conteneur que le moteur ne décode pas ;
  la fiche reste alors consultable mais le lecteur affiche une erreur.
- **Données corrompues** : Think-Browser repart sur les valeurs par défaut si le
  JSON est illisible. Pour repartir de zéro, supprimer les fichiers de données
  utilisateur listés plus haut.
- **Session non restaurée** : vérifier que l'application a bien été fermée
  normalement ; les données sont aussi écrites lors de `beforeunload`, mais un
  arrêt forcé peut perdre les dernières modifications.

## Licence

MIT pour le code de Think-Browser. Les binaires **ffmpeg** et **ffprobe**
embarqués par les dépendances conservent leurs licences respectives ; leur
distribution éventuelle doit respecter les termes du build fourni.
