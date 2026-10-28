# MIDI Sight Reading Trainer

Application web locale pour apprendre à lire les notes sur une portée en jouant sur un clavier MIDI. Interface en français et en anglais.

Le cahier des charges complet et le journal des décisions sont dans [docs/cahier-des-charges.md](docs/cahier-des-charges.md).

## État actuel

- **Reconnaissance de notes isolées (mode A).** Une bonne réponse passe la note en vert et fait avancer l'exercice. Une mauvaise réponse fait clignoter la note en rouge, sans avancer.
- **Parcours en 10 niveaux.** Les niveaux 1 à 8 sont jouables : clé de sol, clé de fa, lignes supplémentaires, suites de notes (niveau 7 : lignes de 3 à 8 notes à jouer dans l'ordre), grand système. Les niveaux 9 (accords et altérations) et 10 (rythme) sont annoncés « à venir ».
- **Choix libre du niveau**, avec un niveau conseillé : le premier niveau jouable non maîtrisé. Les critères de maîtrise du niveau et leur état sont toujours affichés.
- **Conseil de passage au niveau suivant** dès qu'un niveau est maîtrisé : Entrée pour avancer, Échap pour rester. Le changement n'est jamais automatique.
- **Plusieurs élèves** : chacun retrouve son historique, sa progression et ses réglages. Un écran « Qui joue ? » s'affiche au lancement s'il y a plusieurs élèves ; on y crée, renomme et supprime les élèves.
- **Octave** : indifférente ou exacte. Par défaut, c'est le niveau qui décide : octave exacte dès qu'il y a des lignes supplémentaires.
- **Temps mesurés** : temps de première réponse et temps jusqu'à la bonne réponse, sur une horloge monotone, pauses exclues.
- **Pause automatique** si le clavier MIDI est débranché ou si l'onglet est masqué.
- **Historique local** (IndexedDB), conservé après rechargement, séparé par élève.
- **Sauvegarde** : export de la progression d'un élève ou de tous dans un fichier JSON, et import par fusion (réimporter le même fichier ne crée pas de doublon). Les boutons sont sur l'écran des élèves (bouton de l'élève dans l'en-tête).
- **Interface bilingue** français / anglais. Les noms de notes suivent la langue (Do Ré Mi / C D E).
- **Indicateur des touches enfoncées**, journal de la séance, simulation au clavier d'ordinateur.

- **Choix adaptatif des notes** : les notes ratées reviennent plus souvent, les notes reconnues rapidement moins souvent.
- **Séances** de 10, 20, 30 ou 50 notes, ou libres. Un bilan s'affiche à la fin : réussite du premier coup, erreurs, notes à revoir et, en mode chronométré, temps médian.
- **Examen de validation** de chaque niveau, proposé une fois les critères de maîtrise remplis :
  - des lignes de notes à jouer dans l'ordre, chaque ligne générée quand la précédente est terminée ;
  - de plus en plus de notes avec le niveau (niveau 1 : 5 lignes de 4 à 6 notes) ;
  - réussi avec au moins 90 % de notes trouvées du premier coup ; le niveau est alors validé et le niveau suivant proposé ;
  - en cas d'échec, nouvel essai immédiat possible.
- **Réglages par élève**, sur un écran dédié (bouton ⚙ à côté du nom de l'élève) :
  - mode entraînement (aucun temps affiché) ou chronométré (chronomètre en direct) ;
  - passage automatique à la note suivante et son délai, ou Entrée ;
  - mode assisté (nom des notes affiché ; ces notes ne comptent ni pour la maîtrise ni pour l'adaptation) ;
  - octave, simulation au clavier d'ordinateur.
- **Clavier affiché jouable** à la souris ou au doigt. Sa forme est un réglage par élève, pour ressembler à son clavier : « piano » (touches blanches égales, touches noires décalées dans chaque groupe, par défaut) ou « demi-tons égaux » (touches noires centrées sur leur demi-ton, Do–Ré–Mi un peu plus étroites, comme sur certains claviers numériques).
- **Son de piano** pour le clavier affiché et le clavier de l'ordinateur (réglage par élève, activé par défaut ; jamais pour un clavier MIDI, qui a son propre son). Les 88 touches à 4 vélocités (20, 40, 80, 115) ; un clic près du bord avant de la touche joue plus fort qu'un clic près du fond, comme sur un vrai piano. Chaque note joue son enregistrement en entier. Les sons du niveau sont préparés à l'avance, les autres chargés au premier usage. **Les sons ne sont pas fournis** : voir [Sons de piano](#sons-de-piano). Sans eux, le clavier est simplement silencieux.

- **Statistiques** par élève, filtrables par niveau :
  - notes jouées et séances ;
  - réussite du premier coup, distinguée des notes trouvées après erreur ;
  - temps de reconnaissance médian et moyen ;
  - évolution par séance (graphiques avec infobulles, et tableau des données) ;
  - notes les plus difficiles, détail par note, progression par niveau ;
  - effacement de l'historique avec confirmation.

  Les notes en mode assisté sont exclues et comptées à part.

Pas encore implémentés : accords et altérations (niveau 9), rythme (niveau 10).

## Démarrage

Prérequis : Node.js 22 ou plus récent (requis par Vite 8).

Navigateurs : **Chrome, Edge ou Firefox** sur ordinateur. Firefox donne l'accès MIDI par un « module d'autorisation de site » à accepter au premier chargement. Safari ne prend pas en charge Web MIDI ; l'application l'indique et reste utilisable avec le clavier de l'ordinateur.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests unitaires (Vitest)
npm run lint     # oxlint
npm run build    # vérification TypeScript + build de production
```

Au premier lancement, le navigateur demande l'autorisation d'accéder aux périphériques MIDI. Web MIDI ne fonctionne que dans un contexte sécurisé, ce qui inclut `localhost`.

Sous WSL2, lancez `npm run dev` dans WSL et ouvrez `http://localhost:5173` dans Chrome ou Edge côté Windows. Le clavier MIDI est vu par le navigateur Windows, donc aucune configuration USB n'est nécessaire dans WSL.

## Sons de piano

Les sons ne font pas partie du dépôt : chacun produit les siens, avec le piano de son choix (instrument logiciel ou clavier réel). Le dépôt fournit les deux outils qui encadrent l'enregistrement : un fichier MIDI à faire jouer, puis le découpage du résultat. L'enregistrement lui-même se fait avec vos propres logiciels.

**Prérequis**, en plus de Node.js :

- **Python 3** avec **numpy** ;
- **ffmpeg** avec l'encodeur **libopus** (inclus dans les paquets courants).

Sous Debian ou Ubuntu : `sudo apt install python3-numpy ffmpeg`. Pour vérifier : `ffmpeg -hide_banner -encoders | grep libopus` doit afficher une ligne. Le script de découpage vérifie aussi ces prérequis au démarrage et indique ce qui manque.

**1. Créer le fichier MIDI** (en dehors du dépôt, par exemple dans `~/piano-samples/`) :

```bash
python3 scripts/sampling/make_sampling_midi.py ~/piano-samples/sampling.mid
```

Il écrit `sampling.mid` et `sampling.json` (le moment de chaque note, utilisé au découpage ; ne pas le modifier). Le fichier MIDI joue les 88 touches (La0 à Do8), de la plus grave à la plus aiguë, quatre fois : vélocités 20, 40, 80, puis 115. Chaque note est tenue 0,25 s, puis 4 s séparent deux notes. Durée totale : environ 23 min 30 s, dont 2 s de silence au début.

**2. Enregistrer le piano** jouant ce fichier MIDI, dans un seul fichier WAV :

- **Format** : WAV PCM 16, 24 ou 32 bits, ou flottant 32 bits ; mono ou stéréo ; 44,1 ou 48 kHz (48 kHz conseillé).
- **Tout le fichier MIDI, d'une traite**, sans rien couper ni réordonner. Un rendu hors ligne (export audio direct du fichier MIDI, si votre logiciel le propose) est le plus sûr. Un enregistrement en temps réel convient aussi : le début n'a pas besoin d'être aligné, le décalage est retrouvé automatiquement à partir de la première note.
- **Son sec** : pas de réverbération, ou très peu (elle serait coupée par les fondus).
- **Pas de limiteur, de compresseur ni de normalisation**, et pas de saturation : les notes fortes doivent rester sous 0 dBFS (−1 dBFS conseillé). La différence de volume entre vélocités fait partie du son.
- **Pédale forte relevée** (le fichier MIDI la relève au début ; vérifiez qu'aucun réglage de l'instrument ne la force).

**3. Vérifier l'enregistrement**, sans rien écrire :

```bash
python3 scripts/sampling/slice_samples.py ~/piano-samples/sampling.wav ~/piano-samples/sampling.json --report
```

Le rapport indique le décalage trouvé, le niveau des notes et, s'il y en a, les problèmes note par note : attaque au mauvais endroit (décrochage pendant un enregistrement en temps réel), note encore audible quand la suivante commence, saturation. « Aucun problème détecté » : passez à l'étape suivante. Sinon, corrigez l'enregistrement et recommencez.

**4. Découper et encoder** dans le dossier lu par l'application :

```bash
python3 scripts/sampling/slice_samples.py ~/piano-samples/sampling.wav ~/piano-samples/sampling.json public/samples/piano
```

Chaque note devient un fichier `public/samples/piano/<vélocité>/<note MIDI>.ogg` (Opus 96 kbit/s, environ 25 Ko), coupé à l'attaque, raccourci dès qu'il devient inaudible (entre 1 et 4 s) et terminé par un fondu de 0,5 s. Soit 352 fichiers, environ 9 Mo. Le dossier `public/samples/` est ignoré par git : les sons restent sur votre machine, sont servis par `npm run dev` et inclus par `npm run build` (donc publiés par `npm run deploy`).

Pour vérifier : `npm run dev`, puis cliquez sur le clavier affiché. Le réglage « Son de piano » est dans l'écran des réglages (⚙).

## Utilisation au clavier

| Touche | Action |
|---|---|
| Entrée | Démarrer une séance ; note suivante quand le passage automatique est désactivé ; niveau conseillé quand il est proposé. Une séance en cours n'est jamais relancée par Entrée. |
| Espace | Pause / reprendre |
| Échap | Rester sur le niveau maîtrisé (refuser le conseil) |

**Sans clavier MIDI**, la simulation au clavier de l'ordinateur s'active par une case à cocher. Elle utilise la position physique des touches, donc la même disposition en AZERTY et en QWERTY. L'aide affichée indique les lettres de votre clavier.

- rangée du milieu (`Q S D F G H J K` en AZERTY, `A S D F G H J K` en QWERTY) : touches blanches à partir du do central ;
- rangée du haut : touches noires ;
- `W` / `X` en AZERTY (`Z` / `X` en QWERTY) : octave inférieure / supérieure.

## Choix techniques

- **Numéros MIDI comme référence interne.** Aucune dépendance à la numérotation d'octave propre à chaque constructeur. L'affichage utilise la notation scientifique dans les deux langues : Do4 / C4 = do central = MIDI 60.
- **Un seul périphérique écouté à la fois.** `MidiInputManager` détache toujours l'entrée précédente avant d'attacher la suivante, avec un gestionnaire d'événement de référence stable. Un double `addEventListener` reste donc sans effet. Le branchement à chaud est géré : si le clavier choisi revient, y compris sous un autre identifiant ou comme nouvel objet, l'écoute reprend. Ces cas sont couverts par des tests avec un faux Web MIDI.
- **Tous les canaux MIDI** sont acceptés. Un Note On de vélocité 0 est un Note Off. Les autres messages (pédale, horloge, active sensing…) sont ignorés.
- **Horloge monotone.** Les temps sont calculés à partir de l'horodatage `MIDIMessageEvent.timeStamp`, sur la même base que `performance.now()`, et non à l'instant de traitement par React. Une touche horodatée avant l'affichage de la note est ignorée.
- **Logique d'exercice pure.** `exercises/singleNote.ts` est une machine à états sans horloge cachée (l'instant est passé en paramètre) : elle est déterministe et testée sans navigateur.
- **Niveaux décrits par des données** (`learning/levels.ts`) : notes autorisées, clé, type d'exercice, octave par défaut, seuil de réponse rapide, critères de maîtrise. Les composants React ne contiennent aucune règle propre à un niveau. Les tests vérifient la cohérence de la configuration, dont l'octave exacte obligatoire en présence de lignes supplémentaires.
- **Maîtrise d'un niveau** (`learning/mastery.ts`) : jamais sur un score ponctuel. Les quatre critères suivants doivent être remplis ensemble.
  - **Volume** : un nombre minimal de notes jouées.
  - **Précision** : un taux de réussite du premier coup sur les dernières notes.
  - **Vitesse** : un temps de reconnaissance médian, pris sur les notes trouvées du premier coup.
  - **Régularité** : les dernières séances réussies d'affilée, réparties sur plusieurs jours.

  **Voie express** : un élève qui sait déjà lire n'a pas à attendre un deuxième jour. Si le volume est atteint et que, sur les 40 dernières notes, il y a au plus 1 note ratée au premier essai avec un temps médian d'au plus un tiers de l'objectif, la régularité n'est pas exigée. Ces seuils sont réglables par niveau.

  Une séance ratée remet la régularité à zéro. Si un niveau exige l'octave exacte, les notes jouées en octave libre ne comptent pas. Les niveaux ne sont pas verrouillés : le cahier des charges demande un choix manuel, donc l'application conseille au lieu d'imposer.
- **Élèves** : profils locaux, sans authentification (pas de backend). Chaque séance et chaque tentative porte l'identifiant de l'élève, et la base indexe par élève. Supprimer un élève efface son historique dans la même transaction. Les réglages sont rangés par élève dans `localStorage`. La langue et le clavier MIDI sont communs à l'appareil.
- **Évolution des données** : voir la section « Faire évoluer le format des données ».
- **Historique en IndexedDB**, sans bibliothèque intermédiaire. Les données sont disponibles immédiatement en mémoire et écrites en arrière-plan, dans l'ordre des appels. Une écriture n'est considérée comme faite qu'une fois la transaction validée. Si le stockage échoue ou est indisponible, l'application continue en mémoire et affiche l'erreur. Les enregistrements portent un numéro de schéma et sont validés à la relecture : un enregistrement corrompu est ignoré et signalé, sans bloquer le reste. Une séance n'est créée qu'à la première note réussie, ce qui évite les séances vides.
- **Internationalisation sans dépendance** (`i18n/`). Un dictionnaire par langue, typé : le dictionnaire anglais a le type du français, donc une clé ou un paramètre manquant ne compile pas. Les textes paramétrés sont des fonctions, ce qui gère le pluriel. Les données de configuration (titres des niveaux) portent leurs textes dans les deux langues. Les modules non graphiques (MIDI, historique) renvoient des codes d'erreur, traduits par l'interface. La langue par défaut est celle du navigateur, le français à défaut ; le choix est mémorisé.
- **Choix adaptatif des notes** (`learning/adaptive.ts`) : règle simple et déterministe. Chaque note part d'un poids de 1, et ses 5 dernières tentatives le modifient : ratée au premier essai ×1,8, réussie lentement ×1, réussie rapidement (sous le seuil `fastResponseMs` du niveau) ×0,7. Une note jamais jouée vaut 1,5 pour être découverte vite. Les poids restent entre 0,25 et 4, et la même note ne sort jamais deux fois de suite. Toutes les tentatives de l'élève sur une note comptent, quel que soit le niveau. L'historique est relu à chaque tirage, donc l'adaptation joue dès la note suivante.
- **Simulation clavier** par le même type d'événement (`NoteEvent`) que le vrai MIDI : le reste de l'application ne fait pas la différence.
- **VexFlow 5** (entrée `vexflow/bravura`, police Bravura uniquement). Le rendu attend le chargement de la police et s'adapte à la largeur disponible. Le grand système relie les deux portées par une accolade, et la note s'affiche en clé de sol à partir du do central.
- **Dépendances** limitées à React et VexFlow, plus Vitest et `fake-indexeddb` (IndexedDB en mémoire pour les tests) en développement. Toutes sont des versions publiées depuis au moins 15 jours.

## Faire évoluer le format des données

La progression des élèves ne doit jamais être perdue lors d'une mise à jour. Deux mécanismes, selon le type de changement :

- **Format d'un enregistrement** (champ ajouté, renommé…) : incrémenter `RECORD_SCHEMA` dans [src/storage/records.ts](src/storage/records.ts), puis ajouter une étape dans `RECORD_UPGRADES` ([src/storage/upgrades.ts](src/storage/upgrades.ts)). Les étapes s'appliquent à la lecture de la base *et* à l'import d'une sauvegarde : les anciennes données et les anciens fichiers de sauvegarde restent lisibles.
- **Structure de la base** (magasin, index) : ajouter une fonction à la fin de `DB_MIGRATIONS` ([src/storage/historyStore.ts](src/storage/historyStore.ts)). La version de la base augmente d'autant. Les migrations s'exécutent dans la transaction de mise à niveau : si l'une échoue, la base reste intacte dans son ancienne version.

Ne jamais modifier une étape ou une migration déjà publiée : en ajouter une nouvelle. La version 2 de la base (`BASELINE_DB_VERSION`) est la référence de la première publication. Une base plus ancienne vient du développement et est recréée vide. Les tests couvrent la mise à niveau, une migration qui échoue, l'import de fichiers invalides ou plus récents que l'application, et l'aller-retour d'une sauvegarde d'un ordinateur à l'autre.

Le build de production (`dist/`) ne contient ni les tests ni les dépendances de développement.

## Architecture

```
src/
  audio/       sampleLayers.ts (choix de la couche de vélocité, volume, vélocité d'un clic), pianoSampler.ts (lecture Web Audio)
  midi/        events.ts (décodage des messages), MidiInputManager.ts (accès, périphériques, branchement à chaud),
               computerKeyboard.ts (simulation)
  music/       pitch.ts (conversions MIDI ↔ hauteur, noms de notes, clés VexFlow), validation.ts (octave exacte/indifférente)
  exercises/   singleNote.ts (exercice note isolée : validation, chronomètre, pauses),
               sequence.ts (suite de notes dans l'ordre, mode B), lineGenerator.ts (lignes de l'examen)
  learning/    levels.ts (parcours en 10 niveaux), mastery.ts (critères de maîtrise, niveau conseillé),
               adaptive.ts (fréquence des notes)
  statistics/  basic.ts (médiane, moyenne), session.ts (bilan de séance), stats.ts (tableau de bord), ticks.ts
  storage/     records.ts (format et validation des enregistrements), historyStore.ts (IndexedDB / mémoire),
               HistoryService.ts (élèves, cache, file d'écriture, erreurs), preferences.ts (réglages par élève),
               backup.ts (sauvegarde JSON), upgrades.ts (mise à niveau des enregistrements)
  i18n/        locale.ts, messages.ts (dictionnaires fr / en), context.ts, I18nProvider.tsx
  hooks/       useMidi.ts, useHistory.ts, useExam.ts, useBackupImport.tsx, useKeyLabels.ts
  components/  Trainer, StatsView, SettingsView, LineChart, LevelPicker, ProfilePicker, WelcomeName, StaffView (VexFlow),
               MidiStatus, PianoKeys, LiveTimer
  App.tsx      en-tête (élève, état MIDI, langue), écran « Qui joue ? » ou écran d'entraînement
public/samples/piano/<vélocité>/<note MIDI>.ogg   sons de piano (Opus), non fournis : voir « Sons de piano »
scripts/sampling/
  make_sampling_midi.py   fichier MIDI à faire jouer par un piano, enregistré en un seul .wav
  slice_samples.py        vérifie le .wav (--report), puis le découpe en une note par fichier (fondus, encodage Opus)
```
