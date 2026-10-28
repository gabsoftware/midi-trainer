import type { LevelClef } from '../learning/levels';
import type { BackupError } from '../storage/backup';
import type { Locale } from './locale';

/**
 * Textes de l'interface. Le dictionnaire anglais a le même type que le
 * français : une clé manquante ou un paramètre différent ne compile pas.
 * Les textes paramétrés sont des fonctions.
 */
const fr = {
  appTitle: 'Lecture de notes',
  language: 'Langue',

  clef: { treble: 'Clé de sol', bass: 'Clé de fa', grand: 'Grand système' } satisfies Record<LevelClef, string>,
  levelNumber: (n: number) => `Niveau ${n}`,

  // Séance
  sessionNotes: (count: number) => `${count} note${count > 1 ? 's' : ''}`,
  sessionFirstTry: (percent: string) => `${percent} du premier coup`,
  sessionMedian: (time: string) => `médiane ${time}`,
  historyLoading: 'Chargement de l’historique…',
  historySummary: (notes: number, sessions: number) =>
    `Historique : ${notes} note${notes > 1 ? 's' : ''} sur ${sessions} séance${sessions > 1 ? 's' : ''}`,
  historyNoStorage: 'Stockage local indisponible : l’historique ne sera pas conservé.',
  historyLoadFailed: (detail: string) => `Historique illisible (${detail}).`,
  historyWriteFailed: (detail: string) => `L’historique n’a pas pu être enregistré (${detail}).`,
  historySkipped: (count: number) => `${count} enregistrement${count > 1 ? 's' : ''} illisible${count > 1 ? 's' : ''} ignoré${count > 1 ? 's' : ''}.`,

  startPrompt: 'Jouez la note affichée sur votre clavier.',
  start: 'Commencer',
  orPressEnter: 'ou appuyez sur Entrée',
  levelUnavailable: 'Ce niveau n’est pas encore disponible.',
  pausedTitle: 'Pause',
  pressSpaceToResume: 'Appuyez sur Espace pour reprendre.',
  midiDisconnectedTitle: 'Clavier MIDI déconnecté',
  midiReconnected: 'Clavier reconnecté. Appuyez sur Espace pour reprendre.',
  midiReplug: 'Rebranchez le clavier, puis appuyez sur Espace pour reprendre.',
  errorCount: (count: number) => `${count} erreur${count > 1 ? 's' : ''}`,
  youPlayed: (note: string) => `Vous avez joué ${note} — essayez encore`,

  pause: 'Pause',
  resume: 'Reprendre',
  restart: 'Recommencer',
  keySpace: 'Espace',
  keyEnter: 'Entrée',

  // Écran des réglages
  settingsButton: (student: string) => `Réglages de ${student}`,
  settingsTitle: (student: string) => `Réglages de ${student}`,
  settingsSession: 'Séance',
  settingsReading: 'Lecture',
  settingsInput: 'Clavier',
  settingsSaved: 'Les réglages sont enregistrés automatiquement pour cet élève.',

  // Réglages de la séance
  sessionSettings: 'Réglages',
  notesPerSession: 'Notes par séance',
  sessionUnlimited: 'libre (sans fin)',
  trainingMode: 'Mode',
  modeTraining: 'entraînement (sans chronomètre)',
  modeTimed: 'chronométré',
  autoAdvance: 'Passer automatiquement à la note suivante',
  advanceDelay: 'après',
  showNoteNames: 'Afficher le nom des notes (mode assisté)',
  assistedHint: 'En mode assisté, les notes jouées ne comptent pas pour la maîtrise du niveau.',
  assistedBadge: 'mode assisté',

  // Déroulement et bilan
  noteProgress: (n: number, total: number) => (total > 0 ? `Note ${n} / ${total}` : `Note ${n}`),
  nextNote: 'Note suivante',
  sessionFinished: 'Séance terminée',
  summaryFirstTry: (count: number, total: number, percent: string) =>
    `${count} / ${total} du premier coup (${percent})`,
  summaryErrors: (count: number) => (count === 0 ? 'aucune erreur' : `${count} erreur${count > 1 ? 's' : ''} au total`),
  summaryMedian: (time: string) => `temps médian de reconnaissance : ${time}`,
  summaryToReview: 'À revoir :',
  summaryPerfect: 'Aucune note ratée, bravo !',
  newSession: 'Nouvelle séance',

  // Statistiques
  navTraining: 'Entraînement',
  navStats: 'Statistiques',
  statsTitle: (student: string) => `Statistiques de ${student}`,
  statsAllLevels: 'Tous les niveaux',
  statsEmpty: 'Pas encore de données pour ce choix : jouez une séance, les statistiques apparaîtront ici.',
  statsNotes: 'Notes jouées',
  statsSessions: 'Séances',
  statsFirstTry: 'Réussite du premier coup',
  statsCorrectedAfterError: (count: number) => `${count} trouvée${count > 1 ? 's' : ''} après erreur`,
  statsErrors: (count: number) => `${count} mauvaise${count > 1 ? 's' : ''} touche${count > 1 ? 's' : ''} au total`,
  statsRecognition: 'Temps de reconnaissance médian',
  statsRecognitionMean: (time: string) => `moyenne ${time}`,
  statsAssistedExcluded: (count: number) =>
    `${count} note${count > 1 ? 's' : ''} jouée${count > 1 ? 's' : ''} en mode assisté, non comptée${count > 1 ? 's' : ''}.`,
  statsEvolution: 'Évolution',
  chartFirstTry: 'Réussite du premier coup, par séance',
  chartRecognition: 'Temps de reconnaissance médian, par séance',
  statsShowData: 'Voir les données',
  statsDate: 'Séance',
  statsLevel: 'Niveau',
  statsHardest: 'Notes les plus difficiles',
  statsHardestEmpty: 'Pas encore assez de notes jouées pour les classer.',
  statsPerNote: 'Détail par note',
  statsNote: 'Note',
  statsAttempts: 'Fois',
  statsMedian: 'Médiane',
  statsMean: 'Moyenne',
  statsLevels: 'Progression par niveau',
  statsLevelStatus: 'État',
  statsDanger: 'Effacer l’historique',
  statsClearHint: (student: string) =>
    `Supprime toutes les notes et séances de ${student}. L’élève et ses réglages sont conservés. Pensez à exporter une sauvegarde avant.`,
  statsClear: 'Effacer l’historique',
  statsClearConfirm: (student: string) => `Effacer définitivement tout l’historique de ${student} ?`,

  // Options
  octave: 'Octave',
  octaveLevel: (mode: string) => `selon le niveau (${mode})`,
  octaveByLevel: 'selon le niveau (exacte dès les lignes supplémentaires)',
  octaveAny: 'n’importe laquelle',
  octaveExact: 'exacte',
  computerKeyboard: 'Simuler avec le clavier de l’ordinateur',
  computerKeyboardHint: (whiteKeys: string, octaveDown: string, octaveUp: string, firstKey: string, note: string) =>
    `Touches ${whiteKeys} = touches blanches · ${octaveDown} / ${octaveUp} : octave · ${firstKey} = ${note}`,

  // Journal
  journal: 'Journal de la séance',
  journalNote: 'Note',
  journalPlayed: 'Jouées',
  journalFirstResponse: '1re réponse',
  journalCorrect: 'Bonne réponse',

  // Niveaux et progression
  level: 'Niveau',
  statusMastered: 'maîtrisé',
  statusLearning: 'en cours',
  statusNew: 'nouveau',
  statusReady: 'prêt pour l’examen',
  statusUnavailable: 'à venir',
  recommended: 'conseillé',
  progressTitle: 'Vers la maîtrise du niveau',
  criterionVolume: (current: number, target: number) => `Volume : ${current} / ${target} notes`,
  criterionAccuracy: (current: string, target: string) => `Réussite du premier coup : ${current} (objectif ${target})`,
  criterionSpeed: (current: string, target: string) => `Temps médian : ${current} (objectif ≤ ${target})`,
  criterionRegularity: (sessions: number, targetSessions: number, days: number, targetDays: number) =>
    `Régularité : ${sessions} / ${targetSessions} séances réussies d’affilée, sur ${days} / ${targetDays} jours`,
  criterionFastTrack: (accuracy: string, time: string) =>
    `Voie express : ${accuracy} du premier coup et temps médian ≤ ${time} (dispense de la régularité)`,
  onlyRegularityMissing:
    'Très bien ! Il ne manque que la régularité : rejouez ce niveau un autre jour pour le valider, ou visez la voie express.',
  criterionExam: (percent: string) => `Examen de validation : au moins ${percent} du premier coup`,

  // Examen de validation
  examReadyTitle: (n: number) => `Niveau ${n} : critères remplis !`,
  examReadyText: 'Passez l’examen de validation pour valider ce niveau : des lignes de notes à jouer dans l’ordre.',
  takeExam: 'Passer l’examen',
  examTitle: 'Examen de validation',
  examLine: (index: number, total: number) => `Ligne ${index} / ${total}`,
  examPassed: (n: number) => `Examen réussi : niveau ${n} validé !`,
  examFailed: 'Examen non réussi',
  examNeeded: (percent: string) => `Il faut au moins ${percent} de notes trouvées du premier coup.`,
  retryExam: 'Repasser l’examen',
  backToTraining: 'Revenir à l’entraînement',
  abandonExam: 'Abandonner l’examen',

  notMeasured: '—',
  levelJustMastered: (n: number) => `Bravo ! Niveau ${n} maîtrisé.`,
  levelAlreadyMastered: (n: number) => `Le niveau ${n} est déjà maîtrisé.`,
  nextLevelSuggestion: (n: number, title: string) => `Vous êtes prêt pour le niveau ${n} : ${title}.`,
  allLevelsMastered: 'Tous les niveaux disponibles sont maîtrisés.',
  goToLevel: (n: number) => `Passer au niveau ${n}`,
  stayOnLevel: 'Rester sur ce niveau',
  keyEscape: 'Échap',

  // Élèves
  student: 'Élève',
  unnamedStudent: (n: number) => `Élève ${n}`,
  switchStudent: 'Changer d’élève',
  whoIsPlaying: 'Qui joue ?',
  newStudent: 'Nouvel élève',
  studentNamePlaceholder: 'Prénom',
  add: 'Ajouter',
  rename: 'Renommer',
  save: 'Enregistrer',
  cancel: 'Annuler',
  delete: 'Supprimer',
  deleteStudentConfirm: (name: string) => `Supprimer ${name} et toute sa progression ?`,
  back: 'Retour',
  loading: 'Chargement…',
  welcomeTitle: 'Bienvenue !',
  welcomeQuestion: 'Quel est le prénom de l’élève ?',
  welcomeHint: 'Chaque élève retrouve sa propre progression. Vous pourrez en ajouter d’autres plus tard.',
  continue: 'Continuer',
  later: 'Plus tard',
  welcomeHasBackup: 'Vous avez déjà une sauvegarde de votre progression ?',

  // Sauvegarde
  backupTitle: 'Sauvegarde',
  backupHint:
    'La progression est enregistrée uniquement dans ce navigateur. Exportez-la régulièrement pour ne pas la perdre, ou pour la transférer sur un autre ordinateur.',
  exportStudent: 'Exporter',
  exportAll: 'Exporter tous les élèves',
  importBackup: 'Importer une sauvegarde',
  importDone: (students: number, notes: number) =>
    `Sauvegarde importée : ${students} élève${students > 1 ? 's' : ''}, ${notes} note${notes > 1 ? 's' : ''}.`,
  importError: {
    'too-large': 'Ce fichier est trop volumineux pour être une sauvegarde.',
    'not-json': 'Ce fichier n’est pas une sauvegarde valide.',
    'not-backup': 'Ce fichier n’est pas une sauvegarde de cette application.',
    'newer-version': 'Cette sauvegarde vient d’une version plus récente de l’application. Mettez la page à jour puis réessayez.',
    empty: 'Cette sauvegarde ne contient aucun élève lisible.',
  } satisfies Record<BackupError, string>,
  importFailed: (detail: string) => `L’import a échoué (${detail}).`,
  exportFailed: (detail: string) => `L’export a échoué (${detail}).`,

  // MIDI
  midiUnsupported: 'Web MIDI non disponible dans ce navigateur',
  midiDenied: 'Accès MIDI refusé',
  midiConnecting: 'Connexion MIDI…',
  midiConnected: (name: string) => `Connecté : ${name}`,
  midiUnplugged: (name: string) => `Clavier débranché : ${name}`,
  midiNone: 'Aucun clavier MIDI',
  midiDevice: 'Périphérique MIDI',
  midiNoDevice: '— Aucun —',
  midiUnpluggedSuffix: '(débranché)',
  midiUnnamedDevice: 'Périphérique sans nom',
  midiOpenFailed: (device: string) => `Impossible d’ouvrir « ${device} ».`,
  browserUnsupportedTitle: 'Ce navigateur ne permet pas d’utiliser un clavier MIDI.',
  browserUnsupportedText:
    'Ouvrez cette page dans Google Chrome, Microsoft Edge ou Firefox sur ordinateur. En attendant, vous pouvez vous entraîner avec le clavier de l’ordinateur.',
  midiDeniedTitle: 'L’accès au clavier MIDI a été refusé.',
  midiDeniedText:
    'Pour l’autoriser, cliquez sur l’icône à gauche de l’adresse du site et autorisez les périphériques MIDI, puis rechargez la page. Dans Firefox, acceptez le module d’autorisation proposé au chargement de la page.',

  staffLabel: 'Portée musicale',
  keyOutOfRange: 'Touche hors de l’affichage',
};

export type Messages = typeof fr;

const en: Messages = {
  appTitle: 'Note Reading',
  language: 'Language',

  clef: { treble: 'Treble clef', bass: 'Bass clef', grand: 'Grand staff' },
  levelNumber: (n) => `Level ${n}`,

  sessionNotes: (count) => `${count} note${count > 1 ? 's' : ''}`,
  sessionFirstTry: (percent) => `${percent} on first try`,
  sessionMedian: (time) => `median ${time}`,
  historyLoading: 'Loading history…',
  historySummary: (notes, sessions) =>
    `History: ${notes} note${notes > 1 ? 's' : ''} over ${sessions} session${sessions > 1 ? 's' : ''}`,
  historyNoStorage: 'Local storage unavailable: history will not be kept.',
  historyLoadFailed: (detail) => `History could not be read (${detail}).`,
  historyWriteFailed: (detail) => `History could not be saved (${detail}).`,
  historySkipped: (count) => `${count} unreadable record${count > 1 ? 's' : ''} skipped.`,

  startPrompt: 'Play the note shown on your keyboard.',
  start: 'Start',
  orPressEnter: 'or press Enter',
  levelUnavailable: 'This level is not available yet.',
  pausedTitle: 'Paused',
  pressSpaceToResume: 'Press Space to resume.',
  midiDisconnectedTitle: 'MIDI keyboard disconnected',
  midiReconnected: 'Keyboard reconnected. Press Space to resume.',
  midiReplug: 'Plug the keyboard back in, then press Space to resume.',
  errorCount: (count) => `${count} error${count > 1 ? 's' : ''}`,
  youPlayed: (note) => `You played ${note} — try again`,

  pause: 'Pause',
  resume: 'Resume',
  restart: 'Restart',
  keySpace: 'Space',
  keyEnter: 'Enter',

  settingsButton: (student) => `${student}'s settings`,
  settingsTitle: (student) => `${student}'s settings`,
  settingsSession: 'Session',
  settingsReading: 'Reading',
  settingsInput: 'Keyboard',
  settingsSaved: 'Settings are saved automatically for this student.',

  sessionSettings: 'Settings',
  notesPerSession: 'Notes per session',
  sessionUnlimited: 'free (no end)',
  trainingMode: 'Mode',
  modeTraining: 'practice (no timer)',
  modeTimed: 'timed',
  autoAdvance: 'Move to the next note automatically',
  advanceDelay: 'after',
  showNoteNames: 'Show note names (assisted mode)',
  assistedHint: 'In assisted mode, notes played do not count towards mastering the level.',
  assistedBadge: 'assisted mode',

  noteProgress: (n, total) => (total > 0 ? `Note ${n} / ${total}` : `Note ${n}`),
  nextNote: 'Next note',
  sessionFinished: 'Session complete',
  summaryFirstTry: (count, total, percent) => `${count} / ${total} on first try (${percent})`,
  summaryErrors: (count) => (count === 0 ? 'no errors' : `${count} error${count > 1 ? 's' : ''} in total`),
  summaryMedian: (time) => `median recognition time: ${time}`,
  summaryToReview: 'To review:',
  summaryPerfect: 'No note missed, well done!',
  newSession: 'New session',

  navTraining: 'Practice',
  navStats: 'Statistics',
  statsTitle: (student) => `${student}'s statistics`,
  statsAllLevels: 'All levels',
  statsEmpty: 'No data yet for this selection: play a session and statistics will appear here.',
  statsNotes: 'Notes played',
  statsSessions: 'Sessions',
  statsFirstTry: 'First-try accuracy',
  statsCorrectedAfterError: (count) => `${count} found after an error`,
  statsErrors: (count) => `${count} wrong key${count > 1 ? 's' : ''} in total`,
  statsRecognition: 'Median recognition time',
  statsRecognitionMean: (time) => `mean ${time}`,
  statsAssistedExcluded: (count) => `${count} note${count > 1 ? 's' : ''} played in assisted mode, not counted.`,
  statsEvolution: 'Progress over time',
  chartFirstTry: 'First-try accuracy, per session',
  chartRecognition: 'Median recognition time, per session',
  statsShowData: 'Show data',
  statsDate: 'Session',
  statsLevel: 'Level',
  statsHardest: 'Hardest notes',
  statsHardestEmpty: 'Not enough notes played yet to rank them.',
  statsPerNote: 'Per note',
  statsNote: 'Note',
  statsAttempts: 'Times',
  statsMedian: 'Median',
  statsMean: 'Mean',
  statsLevels: 'Progress per level',
  statsLevelStatus: 'Status',
  statsDanger: 'Clear history',
  statsClearHint: (student) =>
    `Deletes all of ${student}'s notes and sessions. The student and their settings are kept. Consider exporting a backup first.`,
  statsClear: 'Clear history',
  statsClearConfirm: (student) => `Permanently clear all of ${student}'s history?`,

  octave: 'Octave',
  octaveLevel: (mode) => `level default (${mode})`,
  octaveByLevel: 'level default (exact once ledger lines appear)',
  octaveAny: 'any',
  octaveExact: 'exact',
  computerKeyboard: 'Simulate with the computer keyboard',
  computerKeyboardHint: (whiteKeys, octaveDown, octaveUp, firstKey, note) =>
    `Keys ${whiteKeys} = white keys · ${octaveDown} / ${octaveUp}: octave · ${firstKey} = ${note}`,

  journal: 'Session log',
  journalNote: 'Note',
  journalPlayed: 'Played',
  journalFirstResponse: 'First response',
  journalCorrect: 'Correct answer',

  level: 'Level',
  statusMastered: 'mastered',
  statusLearning: 'in progress',
  statusNew: 'new',
  statusReady: 'ready for the exam',
  statusUnavailable: 'coming soon',
  recommended: 'recommended',
  progressTitle: 'Towards mastering this level',
  criterionVolume: (current, target) => `Volume: ${current} / ${target} notes`,
  criterionAccuracy: (current, target) => `First-try accuracy: ${current} (target ${target})`,
  criterionSpeed: (current, target) => `Median time: ${current} (target ≤ ${target})`,
  criterionRegularity: (sessions, targetSessions, days, targetDays) =>
    `Consistency: ${sessions} / ${targetSessions} successful sessions in a row, over ${days} / ${targetDays} days`,
  criterionFastTrack: (accuracy, time) =>
    `Fast track: ${accuracy} on first try and median time ≤ ${time} (waives consistency)`,
  onlyRegularityMissing:
    'Very good! Only consistency is missing: play this level again on another day to master it, or aim for the fast track.',
  criterionExam: (percent) => `Validation exam: at least ${percent} on the first try`,

  examReadyTitle: (n) => `Level ${n}: criteria met!`,
  examReadyText: 'Take the validation exam to master this level: lines of notes to play in order.',
  takeExam: 'Take the exam',
  examTitle: 'Validation exam',
  examLine: (index, total) => `Line ${index} / ${total}`,
  examPassed: (n) => `Exam passed: level ${n} mastered!`,
  examFailed: 'Exam not passed',
  examNeeded: (percent) => `At least ${percent} of notes must be found on the first try.`,
  retryExam: 'Retake the exam',
  backToTraining: 'Back to practice',
  abandonExam: 'Abandon the exam',

  notMeasured: '—',
  levelJustMastered: (n) => `Well done! Level ${n} mastered.`,
  levelAlreadyMastered: (n) => `Level ${n} is already mastered.`,
  nextLevelSuggestion: (n, title) => `You are ready for level ${n}: ${title}.`,
  allLevelsMastered: 'All available levels are mastered.',
  goToLevel: (n) => `Go to level ${n}`,
  stayOnLevel: 'Stay on this level',
  keyEscape: 'Esc',

  student: 'Student',
  unnamedStudent: (n) => `Student ${n}`,
  switchStudent: 'Switch student',
  whoIsPlaying: 'Who is playing?',
  newStudent: 'New student',
  studentNamePlaceholder: 'First name',
  add: 'Add',
  rename: 'Rename',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  deleteStudentConfirm: (name) => `Delete ${name} and all their progress?`,
  back: 'Back',
  loading: 'Loading…',
  welcomeTitle: 'Welcome!',
  welcomeQuestion: 'What is the student’s first name?',
  welcomeHint: 'Each student keeps their own progress. You can add more students later.',
  continue: 'Continue',
  later: 'Later',
  welcomeHasBackup: 'Already have a backup of your progress?',

  backupTitle: 'Backup',
  backupHint:
    'Progress is stored in this browser only. Export it regularly so it is not lost, or to move it to another computer.',
  exportStudent: 'Export',
  exportAll: 'Export all students',
  importBackup: 'Import a backup',
  importDone: (students, notes) =>
    `Backup imported: ${students} student${students > 1 ? 's' : ''}, ${notes} note${notes > 1 ? 's' : ''}.`,
  importError: {
    'too-large': 'This file is too large to be a backup.',
    'not-json': 'This file is not a valid backup.',
    'not-backup': 'This file is not a backup from this application.',
    'newer-version': 'This backup comes from a newer version of the application. Reload the page and try again.',
    empty: 'This backup contains no readable student.',
  },
  importFailed: (detail) => `Import failed (${detail}).`,
  exportFailed: (detail) => `Export failed (${detail}).`,

  midiUnsupported: 'Web MIDI unavailable in this browser',
  midiDenied: 'MIDI access denied',
  midiConnecting: 'Connecting to MIDI…',
  midiConnected: (name) => `Connected: ${name}`,
  midiUnplugged: (name) => `Keyboard unplugged: ${name}`,
  midiNone: 'No MIDI keyboard',
  midiDevice: 'MIDI device',
  midiNoDevice: '— None —',
  midiUnpluggedSuffix: '(unplugged)',
  midiUnnamedDevice: 'Unnamed device',
  midiOpenFailed: (device) => `Could not open “${device}”.`,
  browserUnsupportedTitle: 'This browser cannot use a MIDI keyboard.',
  browserUnsupportedText:
    'Open this page in Google Chrome, Microsoft Edge or Firefox on a computer. Meanwhile, you can practise with the computer keyboard.',
  midiDeniedTitle: 'Access to the MIDI keyboard was denied.',
  midiDeniedText:
    'To allow it, click the icon to the left of the site address and allow MIDI devices, then reload the page. In Firefox, accept the site permission add-on offered when the page loads.',

  staffLabel: 'Music staff',
  keyOutOfRange: 'Key outside the display',
};

export const MESSAGES: Readonly<Record<Locale, Messages>> = { fr, en };

export function formatSeconds(ms: number, locale: Locale): string {
  return `${(ms / 1000).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;
}

export function formatPercent(ratio: number, locale: Locale): string {
  return ratio.toLocaleString(locale, { style: 'percent', maximumFractionDigits: 0 });
}
