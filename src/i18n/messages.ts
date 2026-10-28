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

  // Options
  octave: 'Octave',
  octaveLevel: (mode: string) => `selon le niveau (${mode})`,
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
  midiUnsupported: 'Web MIDI non disponible (utilisez Chrome ou Edge)',
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

  octave: 'Octave',
  octaveLevel: (mode) => `level default (${mode})`,
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

  midiUnsupported: 'Web MIDI unavailable (use Chrome or Edge)',
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
