import type { NoteAttempt } from '../exercises/singleNote';
import { isValidMidiNote } from '../music/pitch';
import type { OctaveMode } from '../music/validation';

/**
 * Enregistrements persistés. Le champ `schema` servira aux migrations après
 * publication ; d'ici là, un changement de format recrée la base vide.
 */
export const RECORD_SCHEMA = 1;

/** Élève. Aucune authentification : un simple profil local. */
export interface ProfileRecord {
  readonly schema: typeof RECORD_SCHEMA;
  readonly id: string;
  /** Nom choisi ; chaîne vide = profil sans nom (affiché « Élève 1 »…). */
  readonly name: string;
  readonly createdAt: string;
}

export const MAX_PROFILE_NAME_LENGTH = 40;

export function normalizeProfileName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_PROFILE_NAME_LENGTH);
}

export function createProfileRecord(id: string, name: string, now: Date): ProfileRecord {
  return { schema: RECORD_SCHEMA, id, name: normalizeProfileName(name), createdAt: now.toISOString() };
}

export type ExerciseMode = 'single' | 'sequence';
export type ClefName = 'treble' | 'bass' | 'grand';

/** Contexte d'exercice commun à une séance et à ses tentatives. */
export interface ExerciseContext {
  readonly levelId: string;
  readonly mode: ExerciseMode;
  readonly clef: ClefName;
}

export interface SessionRecord extends ExerciseContext {
  readonly schema: typeof RECORD_SCHEMA;
  readonly id: string;
  readonly profileId: string;
  /** Date et heure de début (horloge murale, ISO 8601). */
  readonly startedAt: string;
  /** Date et heure de la dernière note réussie. */
  readonly lastActivityAt: string;
  readonly attemptCount: number;
}

export interface AttemptRecord extends ExerciseContext {
  readonly schema: typeof RECORD_SCHEMA;
  readonly id: string;
  readonly profileId: string;
  readonly sessionId: string;
  /** Date et heure de la bonne réponse (horloge murale, ISO 8601). */
  readonly createdAt: string;
  /** Note attendue (numéro MIDI). */
  readonly expected: number;
  /** Notes jouées, dans l'ordre, jusqu'à la bonne (numéros MIDI). */
  readonly played: readonly number[];
  readonly firstTryCorrect: boolean;
  readonly errorCount: number;
  /** Temps actif jusqu'à la première touche, pauses exclues (ms). */
  readonly firstResponseMs: number;
  /** Temps actif jusqu'à la bonne touche, pauses exclues (ms). */
  readonly timeToCorrectMs: number;
  readonly octaveMode: OctaveMode;
}

export function createSessionRecord(id: string, profileId: string, context: ExerciseContext, now: Date): SessionRecord {
  const timestamp = now.toISOString();
  return {
    schema: RECORD_SCHEMA,
    id,
    profileId,
    ...context,
    startedAt: timestamp,
    lastActivityAt: timestamp,
    attemptCount: 0,
  };
}

export function createAttemptRecord(
  id: string,
  session: SessionRecord,
  attempt: NoteAttempt,
  now: Date,
): AttemptRecord {
  return {
    schema: RECORD_SCHEMA,
    id,
    profileId: session.profileId,
    sessionId: session.id,
    levelId: session.levelId,
    mode: session.mode,
    clef: session.clef,
    createdAt: now.toISOString(),
    expected: attempt.expected,
    played: [...attempt.played],
    firstTryCorrect: attempt.firstTryCorrect,
    errorCount: attempt.errorCount,
    firstResponseMs: attempt.firstResponseMs,
    timeToCorrectMs: attempt.timeToCorrectMs,
    octaveMode: attempt.octaveMode,
  };
}

// --- Validation des données relues (stockage local modifiable, versions futures…) ---

type Unknown = Record<string, unknown>;

function isObject(value: unknown): value is Unknown {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function hasContext(value: Unknown): boolean {
  return (
    isNonEmptyString(value.levelId) &&
    (value.mode === 'single' || value.mode === 'sequence') &&
    (value.clef === 'treble' || value.clef === 'bass' || value.clef === 'grand')
  );
}

export function isProfileRecord(value: unknown): value is ProfileRecord {
  return (
    isObject(value) &&
    value.schema === RECORD_SCHEMA &&
    isNonEmptyString(value.id) &&
    typeof value.name === 'string' &&
    value.name.length <= MAX_PROFILE_NAME_LENGTH &&
    isIsoDate(value.createdAt)
  );
}

export function isSessionRecord(value: unknown): value is SessionRecord {
  return (
    isObject(value) &&
    value.schema === RECORD_SCHEMA &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.profileId) &&
    hasContext(value) &&
    isIsoDate(value.startedAt) &&
    isIsoDate(value.lastActivityAt) &&
    Number.isInteger(value.attemptCount) &&
    (value.attemptCount as number) >= 0
  );
}

export function isAttemptRecord(value: unknown): value is AttemptRecord {
  return (
    isObject(value) &&
    value.schema === RECORD_SCHEMA &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.profileId) &&
    isNonEmptyString(value.sessionId) &&
    hasContext(value) &&
    isIsoDate(value.createdAt) &&
    typeof value.expected === 'number' &&
    isValidMidiNote(value.expected) &&
    Array.isArray(value.played) &&
    value.played.length > 0 &&
    value.played.every((note) => typeof note === 'number' && isValidMidiNote(note)) &&
    typeof value.firstTryCorrect === 'boolean' &&
    Number.isInteger(value.errorCount) &&
    value.errorCount === value.played.length - 1 &&
    isDuration(value.firstResponseMs) &&
    isDuration(value.timeToCorrectMs) &&
    value.firstResponseMs <= value.timeToCorrectMs &&
    (value.octaveMode === 'any' || value.octaveMode === 'exact')
  );
}
