# MIDI Sight Reading Trainer

Application web locale pour apprendre à lire les notes sur une portée en jouant sur un clavier MIDI. Interface en français et en anglais.

Le cahier des charges complet et le journal des décisions sont dans [docs/cahier-des-charges.md](docs/cahier-des-charges.md).

## État actuel

- **Reconnaissance de notes isolées (mode A).** Une bonne réponse passe la note en vert et fait avancer l'exercice. Une mauvaise réponse fait clignoter la note en rouge, sans avancer.
- **Parcours en 10 niveaux.** Les niveaux 1 à 6 et 8 sont jouables : clé de sol, clé de fa, lignes supplémentaires, grand système. Les niveaux 7 (séquences), 9 (accords et altérations) et 10 (rythme) sont annoncés « à venir ».
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

Pas encore implémentés : adaptation de la fréquence des notes, réglages de séance (nombre de notes, chronomètre…), statistiques, séquences.

## Démarrage

Prérequis : Node.js 22 ou plus récent (requis par Vite 8), et **Chrome ou Edge** (Firefox et Safari ne prennent pas en charge Web MIDI de façon fiable).

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests unitaires (Vitest)
npm run lint     # oxlint
npm run build    # vérification TypeScript + build de production
```

Au premier lancement, le navigateur demande l'autorisation d'accéder aux périphériques MIDI. Web MIDI ne fonctionne que dans un contexte sécurisé, ce qui inclut `localhost`.

Sous WSL2, lancez `npm run dev` dans WSL et ouvrez `http://localhost:5173` dans Chrome ou Edge côté Windows. Le clavier MIDI est vu par le navigateur Windows, donc aucune configuration USB n'est nécessaire dans WSL.

## Utilisation au clavier

| Touche | Action |
|---|---|
| Entrée | Démarrer / recommencer, ou passer au niveau conseillé quand il est proposé |
| Espace | Pause / reprendre |
| Échap | Rester sur le niveau maîtrisé (refuser le conseil) |

**Sans clavier MIDI**, la simulation au clavier de l'ordinateur s'active par une case à cocher. Elle utilise la position physique des touches, donc la même disposition en AZERTY et en QWERTY. L'aide affichée indique les lettres de votre clavier.

- rangée du milieu (`Q S D F G H J K` en AZERTY, `A S D F G H J K` en QWERTY) : touches blanches à partir du do central ;
- rangée du haut : touches noires ;
- `W` / `X` en AZERTY (`Z` / `X` en QWERTY) : octave inférieure / supérieure.

## Choix techniques

- **Numéros MIDI comme référence interne.** Aucune dépendance à la numérotation d'octave d'un constructeur (Yamaha, Roland…). L'affichage utilise la notation scientifique dans les deux langues : Do4 / C4 = do central = MIDI 60.
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

  **Voie express** : un élève qui sait déjà lire n'a pas à attendre un deuxième jour. Si le volume est atteint et que, sur les dernières notes, la réussite du premier coup est d'au moins 98 % avec un temps médian d'au plus un tiers de l'objectif, la régularité n'est pas exigée. Ces seuils sont réglables par niveau.

  Une séance ratée remet la régularité à zéro. Si un niveau exige l'octave exacte, les notes jouées en octave libre ne comptent pas. Les niveaux ne sont pas verrouillés : le cahier des charges demande un choix manuel, donc l'application conseille au lieu d'imposer.
- **Élèves** : profils locaux, sans authentification (pas de backend). Chaque séance et chaque tentative porte l'identifiant de l'élève, et la base indexe par élève. Supprimer un élève efface son historique dans la même transaction. Les réglages sont rangés par élève dans `localStorage`. La langue et le clavier MIDI sont communs à l'appareil.
- **Évolution des données** : voir la section « Faire évoluer le format des données ».
- **Historique en IndexedDB**, sans bibliothèque intermédiaire. Les données sont disponibles immédiatement en mémoire et écrites en arrière-plan, dans l'ordre des appels. Une écriture n'est considérée comme faite qu'une fois la transaction validée. Si le stockage échoue ou est indisponible, l'application continue en mémoire et affiche l'erreur. Les enregistrements portent un numéro de schéma et sont validés à la relecture : un enregistrement corrompu est ignoré et signalé, sans bloquer le reste. Une séance n'est créée qu'à la première note réussie, ce qui évite les séances vides.
- **Internationalisation sans dépendance** (`i18n/`). Un dictionnaire par langue, typé : le dictionnaire anglais a le type du français, donc une clé ou un paramètre manquant ne compile pas. Les textes paramétrés sont des fonctions, ce qui gère le pluriel. Les données de configuration (titres des niveaux) portent leurs textes dans les deux langues. Les modules non graphiques (MIDI, historique) renvoient des codes d'erreur, traduits par l'interface. La langue par défaut est celle du navigateur, le français à défaut ; le choix est mémorisé.
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
  midi/        events.ts (décodage des messages), MidiInputManager.ts (accès, périphériques, branchement à chaud),
               computerKeyboard.ts (simulation)
  music/       pitch.ts (conversions MIDI ↔ hauteur, noms de notes, clés VexFlow), validation.ts (octave exacte/indifférente)
  exercises/   singleNote.ts (exercice note isolée : validation, chronomètre, pauses)
  learning/    levels.ts (parcours en 10 niveaux), mastery.ts (critères de maîtrise, niveau conseillé)
  statistics/  basic.ts (médiane, moyenne)
  storage/     records.ts (format et validation des enregistrements), historyStore.ts (IndexedDB / mémoire),
               HistoryService.ts (élèves, cache, file d'écriture, erreurs), preferences.ts (réglages par élève),
               backup.ts (sauvegarde JSON), upgrades.ts (mise à niveau des enregistrements)
  i18n/        locale.ts, messages.ts (dictionnaires fr / en), context.ts, I18nProvider.tsx
  hooks/       useMidi.ts, useHistory.ts, useKeyLabels.ts (ponts entre les services et React)
  components/  Trainer, LevelPicker, ProfilePicker, StaffView (VexFlow), MidiStatus, PianoKeys
  App.tsx      en-tête (élève, état MIDI, langue), écran « Qui joue ? » ou écran d'entraînement
```
