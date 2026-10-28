# Cahier des charges — MIDI Sight Reading Trainer

> Document de référence du projet. Les décisions prises en cours de développement sont consignées dans la section 15 « Journal des décisions ».

## 1. Objectif

Développer une application web locale permettant d'apprendre progressivement à lire des partitions de piano grâce à un clavier MIDI.

L'objectif principal est de développer la reconnaissance immédiate des notes sur une portée et leur association aux touches du piano, jusqu'à permettre la lecture à vue de partitions complètes.

L'application doit privilégier la pratique, la répétition espacée et la progression adaptative plutôt que l'apprentissage théorique.

## 2. Stack technique

- React + TypeScript
- Vite
- Web MIDI API pour communiquer avec le clavier
- VexFlow pour afficher les partitions
- Stockage local via IndexedDB ou localStorage selon les besoins
- Aucun backend nécessaire pour la V1
- Interface entièrement en français
- Compatible Chrome et Edge sur ordinateur
- Architecture modulaire, extensible et maintenable

Utiliser les versions stables récentes des dépendances.

## 3. Connexion MIDI

Implémenter un module MIDI dédié.

Fonctionnalités :

- Détecter les périphériques MIDI disponibles.
- Permettre de sélectionner un périphérique d'entrée.
- Détecter les connexions et déconnexions à chaud.
- Recevoir les événements Note On et Note Off.
- Traiter les événements Note On avec vélocité 0 comme des Note Off.
- Convertir les numéros de notes MIDI en hauteurs musicales.
- Gérer les événements MIDI sur tous les canaux.
- Afficher l'état de connexion du clavier.
- Proposer un indicateur visuel lorsqu'une touche est pressée.
- Nettoyer correctement les listeners lors des changements de périphérique.

Prévoir une abstraction permettant de simuler les événements MIDI avec le clavier de l'ordinateur pour tester l'application sans périphérique MIDI.

Ne pas dépendre de la numérotation des octaves propre à un constructeur : utiliser les numéros MIDI comme référence interne.

## 4. Affichage des partitions

Utiliser VexFlow pour afficher des portées musicales.

Prévoir :

- Clé de sol.
- Clé de fa.
- Grand système pour piano.
- Notes avec lignes supplémentaires.
- Altérations (dièses, bémols, bécarres).
- Accords.
- Valeurs rythmiques et silences.
- Mesures et signatures rythmiques.
- Armures.

Pour la V1, implémenter uniquement les éléments nécessaires aux premiers exercices.

La portée doit rester lisible sur différentes tailles d'écran.

## 5. Modes d'apprentissage

### Mode A : reconnaissance de notes isolées

Afficher une note aléatoire sur une portée. L'utilisateur doit jouer la touche correspondante sur son clavier MIDI.

Comportement :

1. Afficher une note.
2. Démarrer le chronomètre.
3. Attendre un événement MIDI Note On.
4. Vérifier la hauteur jouée.
5. Afficher un feedback visuel.
6. Enregistrer le résultat et le temps de réponse.
7. Passer automatiquement à la note suivante après une bonne réponse.

Une mauvaise réponse ne doit pas passer à la note suivante.

Prévoir une option permettant d'accepter une note dans n'importe quelle octave, ainsi qu'un mode exigeant l'octave exacte. Par défaut, le mode débutant accepte toutes les octaves.

### Mode B : séquences mélodiques

Afficher une suite de 3 à 8 notes. L'utilisateur doit les jouer dans l'ordre.

- Mettre visuellement en évidence la note attendue.
- Avancer lorsque la bonne note est jouée.
- Signaler les erreurs.
- Mesurer le temps total.
- Permettre de rejouer la séquence.

Le rythme n'est pas imposé dans ce mode.

### Mode C : lecture rythmique (seconde phase)

- Métronome.
- Tempo réglable.
- Détection du timing des notes MIDI.
- Comparaison avec les durées écrites.
- Tolérance configurable.
- Analyse des notes jouées trop tôt ou trop tard.

### Mode D : lecture à vue (ultérieurement)

- Affichage de plusieurs mesures.
- Lecture continue.
- Défilement ou suivi de partition.
- Exercices à deux mains.
- Évaluation des erreurs de hauteur et de rythme.

## 6. Progression pédagogique

L'application doit proposer un parcours structuré.

| Niveau | Contenu |
|---|---|
| 1 | Mi, Sol, Si en clé de sol |
| 2 | Ajout de Fa et La |
| 3 | Ajout de Do et Ré dans la portée |
| 4 | Toutes les notes de la clé de sol, avec lignes supplémentaires |
| 5 | Introduction à la clé de fa |
| 6 | Toutes les notes en clé de fa |
| 7 | Lecture des intervalles et des séquences |
| 8 | Lecture simultanée des deux clés |
| 9 | Accords et altérations |
| 10 | Lecture rythmique et morceaux simples |

- La progression doit être configurable et non codée en dur dans les composants React.
- Prévoir une structure de données décrivant chaque niveau : notes autorisées, clé, type d'exercice, critères de réussite et paramètres de difficulté.
- Ne pas débloquer automatiquement un niveau sur la seule base d'un score ponctuel. Prendre également en compte les temps de réponse et la régularité des résultats.
- L'utilisateur doit pouvoir revenir à un niveau précédent ou sélectionner manuellement un niveau.

## 7. Algorithme d'apprentissage adaptatif

L'application doit suivre les performances par note.

Données à conserver :

- Note attendue.
- Note jouée.
- Exactitude.
- Temps de première réponse.
- Temps jusqu'à la bonne réponse.
- Nombre d'erreurs.
- Date et heure de l'exercice.
- Niveau et mode d'exercice.

Les notes difficiles doivent apparaître plus fréquemment. Par exemple :

- Note correctement reconnue rapidement : fréquence réduite.
- Note correctement reconnue mais lentement : fréquence maintenue.
- Note incorrecte : fréquence augmentée.

Éviter de répéter systématiquement la même note plusieurs fois consécutives.

Prévoir un algorithme simple, déterministe et testable pour la V1. L'apprentissage adaptatif avancé pourra être ajouté ultérieurement.

## 8. Statistiques

Créer un tableau de bord indiquant :

- Taux de bonnes réponses.
- Temps moyen et médian de reconnaissance.
- Temps de reconnaissance par note.
- Notes les plus difficiles.
- Évolution des performances.
- Nombre de séances.
- Progression par niveau.

Distinguer les erreurs de première tentative des réponses finalement correctes.

Ne pas inclure les temps d'attente liés à une perte de connexion MIDI dans les statistiques de reconnaissance.

## 9. Interface utilisateur

Interface sobre, moderne et adaptée à un usage quotidien.

Écran principal :

- Portée musicale clairement visible.
- État de connexion MIDI.
- Niveau actuel.
- Compteur de progression.
- Feedback discret sur les réponses.
- Temps de reconnaissance.
- Boutons pause, reprendre et recommencer.

Prévoir un mode entraînement sans pression temporelle et un mode chronométré.

L'interface doit éviter toute distraction inutile.

Ne jamais afficher le nom de la note attendue avant la réponse, sauf dans un mode d'apprentissage assisté.

## 10. Paramètres

- Périphérique MIDI.
- Mode d'exercice.
- Clé musicale.
- Niveau.
- Nombre de notes par séance.
- Octave exacte ou indifférente.
- Passage automatique à la note suivante.
- Délai avant passage à la note suivante.
- Affichage ou masquage des noms des notes.
- Activation ou désactivation du chronomètre.

Conserver les préférences localement.

## 11. Architecture

Séparer clairement :

- `midi/` : connexion, événements et normalisation MIDI.
- `music/` : théorie musicale, notes, octaves, intervalles et validation.
- `exercises/` : génération et exécution des exercices.
- `learning/` : progression pédagogique et adaptation.
- `components/` : composants React et rendu des partitions.
- `storage/` : persistance.
- `statistics/` : calcul des performances.

Éviter de mélanger les règles musicales et les composants d'interface. Utiliser des types TypeScript stricts.

Prévoir des tests unitaires pour les conversions MIDI, la validation des notes, la génération des exercices et le calcul des statistiques.

## 12. Périmètre de la V1

À implémenter en priorité :

1. Initialisation du projet React/TypeScript/Vite.
2. Connexion à un clavier MIDI via Web MIDI API.
3. Affichage d'une note en clé de sol avec VexFlow.
4. Reconnaissance des notes jouées.
5. Exercices progressifs sur Mi, Fa, Sol, La, Si, Do et Ré.
6. Feedback immédiat.
7. Mesure des temps de réponse.
8. Historique local des résultats.
9. Statistiques simples.
10. Interface française.

Ne pas implémenter immédiatement les fonctionnalités avancées (lecture à deux mains, morceaux complets, métronome, analyse rythmique).

## 13. Critères d'acceptation de la V1

- [ ] L'application fonctionne localement avec `npm run dev`.
- [ ] L'utilisateur peut sélectionner son clavier MIDI.
- [ ] Une note apparaît sur une portée en clé de sol.
- [ ] Une mauvaise touche MIDI est détectée sans faire avancer l'exercice.
- [ ] Une bonne touche valide la note et fait progresser l'exercice.
- [ ] Les temps de réponse sont mesurés avec une horloge monotone.
- [ ] Le changement de périphérique MIDI n'entraîne pas de listeners dupliqués.
- [ ] Une déconnexion du clavier met l'exercice en pause.
- [ ] Les résultats restent disponibles après rechargement de la page.
- [ ] L'utilisateur peut effectuer une séance complète sans utiliser la souris après le démarrage.
- [ ] Les tests unitaires des fonctions musicales et de validation passent.

## 14. Consignes de développement

- Commencer par examiner l'environnement et proposer une architecture légère.
- Implémenter la V1 de manière incrémentale, en privilégiant une application fonctionnelle de bout en bout plutôt qu'une multitude de fonctionnalités incomplètes.
- Ne pas ajouter de backend, d'authentification, de service cloud ou de dépendances inutiles.
- Documenter les choix techniques et les instructions de démarrage dans un README.
- L'objectif prioritaire est la fiabilité de la lecture MIDI et la qualité pédagogique des exercices, pas la complexité de l'interface.

## 15. Journal des décisions

| Date | Décision |
|---|---|
| 2026-10-28 | **Phase 0 — prototype vertical minimal** : afficher une note, recevoir une touche MIDI, valider la réponse. C'est le point critique à fiabiliser avant de développer la progression et les statistiques. |
| 2026-10-28 | Dépendances : uniquement des versions publiées depuis plus de 15 jours (contrainte `min-release-age = 15` dans `~/.npmrc`). |
| 2026-10-28 | Notation interne : numéros MIDI (0–127). Affichage en notation scientifique : Do4 = do central = MIDI 60. |
| 2026-10-28 | Prototype vertical validé par l'utilisateur avec un vrai clavier MIDI. |
| 2026-10-28 | **Interface bilingue français / anglais** (complète la section 2, « interface entièrement en français »). Langue par défaut : celle du navigateur, sinon le français. Noms de notes Do Ré Mi / C D E, octaves en notation scientifique dans les deux langues. |
| 2026-10-28 | Niveaux non verrouillés (section 6 : sélection manuelle) : l'application conseille le premier niveau non maîtrisé. Maîtrise = volume, précision du premier coup, temps médian et régularité sur plusieurs séances et plusieurs jours. Octave exacte par défaut dès qu'un niveau comporte des lignes supplémentaires. |
