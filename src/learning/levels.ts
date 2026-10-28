import type { LocalizedText } from '../i18n/locale';
import { naturalNotesBetween, parseMidi } from '../music/pitch';
import type { OctaveMode } from '../music/validation';

/**
 * Parcours pédagogique, décrit uniquement par des données.
 * Les composants React ne contiennent aucune règle propre à un niveau.
 */

export type LevelClef = 'treble' | 'bass' | 'grand';
export type LevelExercise = 'single' | 'sequence';

/**
 * Critères de maîtrise. Un niveau n'est jamais validé sur un score ponctuel :
 * il faut du volume, de la précision, de la vitesse et de la régularité
 * sur plusieurs séances et plusieurs jours.
 */
export interface MasteryCriteria {
  /** Nombre minimal de notes jouées dans le niveau. */
  readonly minAttempts: number;
  /** Taille de la fenêtre des dernières notes sur laquelle on mesure précision et vitesse. */
  readonly window: number;
  /** Taux de réussite du premier coup exigé sur la fenêtre (0–1). */
  readonly minFirstTryAccuracy: number;
  /** Temps de reconnaissance médian maximal sur la fenêtre (ms). */
  readonly maxMedianMs: number;
  /** Nombre de dernières séances qui doivent toutes être réussies. */
  readonly minSessions: number;
  /** Nombre minimal de notes pour qu'une séance compte. */
  readonly minSessionAttempts: number;
  /** Réussite du premier coup exigée dans chacune de ces séances (0–1). */
  readonly minSessionAccuracy: number;
  /** Ces séances doivent couvrir au moins ce nombre de jours différents. */
  readonly minDays: number;
  /**
   * Voie express : une performance exceptionnelle sur la fenêtre récente dispense
   * du critère de régularité (élève qui sait déjà lire). Le volume reste exigé.
   */
  readonly fastTrack: {
    /** Réussite du premier coup exigée (0–1). */
    readonly minFirstTryAccuracy: number;
    /** Temps médian maximal, en fraction de `maxMedianMs`. */
    readonly maxMedianRatio: number;
  };
}

export interface LevelDefinition {
  readonly id: string;
  readonly number: number;
  readonly title: LocalizedText;
  readonly description: LocalizedText;
  readonly clef: LevelClef;
  /** Notes autorisées, en numéros MIDI. */
  readonly notes: readonly number[];
  readonly exercise: LevelExercise;
  /** Octave exigée par défaut ; l'utilisateur peut la modifier. */
  readonly defaultOctaveMode: OctaveMode;
  /** En dessous de ce temps, une bonne réponse est considérée comme rapide (adaptation). */
  readonly fastResponseMs: number;
  readonly mastery: MasteryCriteria;
  /** `false` : niveau prévu mais pas encore jouable. */
  readonly available: boolean;
}

const BASE_MASTERY: MasteryCriteria = {
  minAttempts: 40,
  window: 40,
  minFirstTryAccuracy: 0.9,
  maxMedianMs: 2500,
  minSessions: 2,
  minSessionAttempts: 10,
  minSessionAccuracy: 0.85,
  minDays: 2,
  fastTrack: { minFirstTryAccuracy: 0.98, maxMedianRatio: 1 / 3 },
};

function notes(...names: string[]): number[] {
  return names.map(parseMidi);
}

export const LEVELS: readonly LevelDefinition[] = [
  {
    id: 'level-1',
    number: 1,
    title: { fr: 'Mi, Sol, Si', en: 'E, G, B' },
    description: {
      fr: 'Trois notes sur les lignes de la clé de sol.',
      en: 'Three notes on the lines of the treble clef.',
    },
    clef: 'treble',
    notes: notes('E4', 'G4', 'B4'),
    exercise: 'single',
    defaultOctaveMode: 'any',
    fastResponseMs: 1500,
    mastery: { ...BASE_MASTERY, minAttempts: 30, window: 30, maxMedianMs: 2000 },
    available: true,
  },
  {
    id: 'level-2',
    number: 2,
    title: { fr: 'Ajout de Fa et La', en: 'Adding F and A' },
    description: {
      fr: 'De Mi à Si en clé de sol : lignes et interlignes du bas de la portée.',
      en: 'E to B in the treble clef: lines and spaces of the lower staff.',
    },
    clef: 'treble',
    notes: naturalNotesBetween('E4', 'B4'),
    exercise: 'single',
    defaultOctaveMode: 'any',
    fastResponseMs: 1500,
    mastery: { ...BASE_MASTERY, maxMedianMs: 2200 },
    available: true,
  },
  {
    id: 'level-3',
    number: 3,
    title: { fr: 'Ajout de Do et Ré', en: 'Adding C and D' },
    description: {
      fr: 'De Mi à Ré en clé de sol : Do et Ré dans la portée.',
      en: 'E to D in the treble clef: C and D inside the staff.',
    },
    clef: 'treble',
    notes: naturalNotesBetween('E4', 'D5'),
    exercise: 'single',
    defaultOctaveMode: 'any',
    fastResponseMs: 1600,
    mastery: BASE_MASTERY,
    available: true,
  },
  {
    id: 'level-4',
    number: 4,
    title: { fr: 'Toute la clé de sol', en: 'The whole treble clef' },
    description: {
      fr: 'Du La sous la portée au Do au-dessus, avec lignes supplémentaires. Octave exacte.',
      en: 'From the A below the staff to the C above, with ledger lines. Exact octave.',
    },
    clef: 'treble',
    notes: naturalNotesBetween('A3', 'C6'),
    exercise: 'single',
    defaultOctaveMode: 'exact',
    fastResponseMs: 1800,
    mastery: { ...BASE_MASTERY, minAttempts: 60, window: 60, maxMedianMs: 3000 },
    available: true,
  },
  {
    id: 'level-5',
    number: 5,
    title: { fr: 'Introduction à la clé de fa', en: 'Introducing the bass clef' },
    description: {
      fr: 'Les cinq lignes de la clé de fa : Sol, Si, Ré, Fa, La.',
      en: 'The five lines of the bass clef: G, B, D, F, A.',
    },
    clef: 'bass',
    notes: notes('G2', 'B2', 'D3', 'F3', 'A3'),
    exercise: 'single',
    defaultOctaveMode: 'any',
    fastResponseMs: 1600,
    mastery: { ...BASE_MASTERY, maxMedianMs: 2500 },
    available: true,
  },
  {
    id: 'level-6',
    number: 6,
    title: { fr: 'Toute la clé de fa', en: 'The whole bass clef' },
    description: {
      fr: 'Du Do grave au Mi au-dessus de la portée, avec lignes supplémentaires. Octave exacte.',
      en: 'From low C to the E above the staff, with ledger lines. Exact octave.',
    },
    clef: 'bass',
    notes: naturalNotesBetween('C2', 'E4'),
    exercise: 'single',
    defaultOctaveMode: 'exact',
    fastResponseMs: 1800,
    mastery: { ...BASE_MASTERY, minAttempts: 60, window: 60, maxMedianMs: 3000 },
    available: true,
  },
  {
    id: 'level-7',
    number: 7,
    title: { fr: 'Intervalles et séquences', en: 'Intervals and sequences' },
    description: {
      fr: 'Suites de 3 à 8 notes à jouer dans l’ordre.',
      en: 'Sequences of 3 to 8 notes to play in order.',
    },
    clef: 'treble',
    notes: naturalNotesBetween('C4', 'A5'),
    exercise: 'sequence',
    defaultOctaveMode: 'exact',
    fastResponseMs: 1500,
    mastery: BASE_MASTERY,
    available: false,
  },
  {
    id: 'level-8',
    number: 8,
    title: { fr: 'Les deux clés', en: 'Both clefs' },
    description: {
      fr: 'Grand système : la note peut apparaître en clé de sol ou en clé de fa. Octave exacte.',
      en: 'Grand staff: the note may appear in the treble or the bass clef. Exact octave.',
    },
    clef: 'grand',
    notes: naturalNotesBetween('E2', 'G5'),
    exercise: 'single',
    defaultOctaveMode: 'exact',
    fastResponseMs: 2000,
    mastery: { ...BASE_MASTERY, minAttempts: 80, window: 60, maxMedianMs: 3000 },
    available: true,
  },
  {
    id: 'level-9',
    number: 9,
    title: { fr: 'Accords et altérations', en: 'Chords and accidentals' },
    description: {
      fr: 'Dièses, bémols et accords de plusieurs notes.',
      en: 'Sharps, flats and multi-note chords.',
    },
    clef: 'grand',
    notes: naturalNotesBetween('C3', 'C5'),
    exercise: 'single',
    defaultOctaveMode: 'exact',
    fastResponseMs: 2500,
    mastery: BASE_MASTERY,
    available: false,
  },
  {
    id: 'level-10',
    number: 10,
    title: { fr: 'Rythme et morceaux simples', en: 'Rhythm and simple pieces' },
    description: {
      fr: 'Lecture rythmique avec métronome.',
      en: 'Rhythm reading with a metronome.',
    },
    clef: 'grand',
    notes: naturalNotesBetween('C3', 'C5'),
    exercise: 'sequence',
    defaultOctaveMode: 'exact',
    fastResponseMs: 2500,
    mastery: BASE_MASTERY,
    available: false,
  },
];

export function findLevel(id: string | null | undefined): LevelDefinition | undefined {
  return LEVELS.find((level) => level.id === id);
}

/** Clé de la portée sur laquelle une note s'affiche dans un niveau donné (grand système : Do4 et au-dessus en clé de sol). */
export function staffForNote(clef: LevelClef, midi: number): 'treble' | 'bass' {
  if (clef === 'grand') {
    return midi >= 60 ? 'treble' : 'bass';
  }
  return clef;
}
