# MIDI Sight Reading Trainer

Application web locale pour apprendre à lire les notes sur une portée en jouant sur un clavier MIDI.

Le cahier des charges complet et le journal des décisions sont dans [docs/cahier-des-charges.md](docs/cahier-des-charges.md).

## État actuel : prototype vertical (phase 0)

Le prototype couvre le chemin critique de bout en bout : **afficher une note → recevoir une touche MIDI → valider la réponse**.

- Note aléatoire en clé de sol parmi Mi, Fa, Sol, La, Si, Do, Ré (Mi4 → Ré5), sans répétition immédiate.
- Une bonne réponse passe la note en vert, puis l'exercice avance automatiquement. Une mauvaise réponse fait clignoter la note en rouge, sans avancer.
- Octave indifférente (par défaut) ou exacte.
- Temps de première réponse et temps jusqu'à la bonne réponse, mesurés sur une horloge monotone, pauses exclues.
- Pause automatique si le clavier MIDI est débranché ou si l'onglet est masqué.
- Indicateur des touches enfoncées et journal de la séance.
- **Historique local** : chaque note réussie est enregistrée dans IndexedDB et conservée après rechargement. L'enregistrement contient la note attendue, les notes jouées, la réussite du premier coup, les deux temps, la date, le niveau et le mode.

Pas encore implémentés : niveaux et progression, adaptation, statistiques, séquences.

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
| Entrée | Démarrer / recommencer |
| Espace | Pause / reprendre |

**Sans clavier MIDI**, la simulation au clavier de l'ordinateur s'active par une case à cocher. Elle utilise la position physique des touches, donc la même disposition en AZERTY et en QWERTY :

- rangée du milieu `Q S D F G H J K L M ù` (AZERTY) : touches blanches à partir du do central ;
- rangée du haut `Z E _ T Y U _ O P` : touches noires ;
- `W` / `X` : octave inférieure / supérieure.

## Choix techniques

- **Numéros MIDI comme référence interne.** Aucune dépendance à la numérotation d'octave d'un constructeur (Yamaha, Roland…). L'affichage utilise la notation scientifique : Do4 = do central = MIDI 60.
- **Un seul périphérique écouté à la fois.** `MidiInputManager` détache toujours l'entrée précédente avant d'attacher la suivante, avec un gestionnaire d'événement de référence stable. Un double `addEventListener` reste donc sans effet. Le branchement à chaud est géré : si le clavier choisi revient, y compris sous un autre identifiant ou comme nouvel objet, l'écoute reprend. Ces cas sont couverts par des tests avec un faux Web MIDI.
- **Tous les canaux MIDI** sont acceptés. Un Note On de vélocité 0 est un Note Off. Les autres messages (pédale, horloge, active sensing…) sont ignorés.
- **Horloge monotone.** Les temps sont calculés à partir de l'horodatage `MIDIMessageEvent.timeStamp`, sur la même base que `performance.now()`, et non à l'instant de traitement par React. Une touche horodatée avant l'affichage de la note est ignorée.
- **Logique d'exercice pure.** `exercises/singleNote.ts` est une machine à états sans horloge cachée (l'instant est passé en paramètre) : elle est déterministe et testée sans navigateur.
- **Simulation clavier** par le même type d'événement (`NoteEvent`) que le vrai MIDI : le reste de l'application ne fait pas la différence.
- **VexFlow 5** (entrée `vexflow/bravura`, police Bravura uniquement). Le rendu attend le chargement de la police et s'adapte à la largeur disponible.
- **Historique en IndexedDB**, sans bibliothèque intermédiaire. Les données sont disponibles immédiatement en mémoire et écrites en arrière-plan, dans l'ordre des appels. Une écriture n'est considérée comme faite qu'une fois la transaction validée. Si le stockage échoue ou est indisponible, l'application continue en mémoire et affiche l'erreur. Les enregistrements portent un numéro de schéma et sont validés à la relecture : un enregistrement corrompu est ignoré et signalé, sans bloquer le reste. Une séance n'est créée qu'à la première note réussie, ce qui évite les séances vides.
- **Dépendances** limitées à React et VexFlow, plus Vitest et `fake-indexeddb` (IndexedDB en mémoire pour les tests) en développement. Toutes sont des versions publiées depuis au moins 15 jours.

## Architecture

```
src/
  midi/        events.ts (décodage des messages), MidiInputManager.ts (accès, périphériques, branchement à chaud),
               computerKeyboard.ts (simulation)
  music/       pitch.ts (conversions MIDI ↔ hauteur, noms français, clés VexFlow), validation.ts (octave exacte/indifférente)
  exercises/   singleNote.ts (exercice note isolée : validation, chronomètre, pauses)
  storage/     records.ts (format et validation des enregistrements), historyStore.ts (IndexedDB / mémoire),
               HistoryService.ts (cache, file d'écriture, erreurs)
  hooks/       useMidi.ts, useHistory.ts (ponts entre les services et React)
  components/  StaffView (VexFlow), MidiStatus, PianoKeys
  App.tsx      écran du prototype
```

Les dossiers `learning/` et `statistics/` prévus par le cahier des charges seront ajoutés avec les fonctionnalités correspondantes.
