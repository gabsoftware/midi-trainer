/**
 * Échantillons de piano : une note par touche (La0–Do8), enregistrée à quatre vélocités
 * (scripts/sampling). Ce module ne fait que des calculs ; la lecture est dans pianoSampler.ts.
 */

export const SAMPLE_LOW = 21;
export const SAMPLE_HIGH = 108;
export const SAMPLE_VELOCITIES = [20, 40, 80, 115] as const;
export type SampleVelocity = (typeof SAMPLE_VELOCITIES)[number];

/** Crête mesurée de chaque vélocité dans l'enregistrement (dBFS, note la plus forte). */
const LAYER_LEVEL_DB: Readonly<Record<SampleVelocity, number>> = { 20: -15.8, 40: -9.8, 80: -4.0, 115: -1.8 };
/** Correction de volume maximale appliquée à une couche, pour ne pas trop s'éloigner de l'enregistrement. */
const MAX_GAIN_DB = 6;

/** Niveau attendu pour une vélocité, interpolé entre les couches enregistrées (prolongé aux extrémités). */
function levelDb(velocity: number): number {
  const points = SAMPLE_VELOCITIES.map((layer) => [layer, LAYER_LEVEL_DB[layer]] as const);
  const above = points.findIndex(([layer]) => layer >= velocity);
  // Segment encadrant la vélocité ; au-delà des couches extrêmes, le segment le plus proche.
  const index = above === -1 ? points.length - 2 : Math.max(0, above - 1);
  const [[v0, l0], [v1, l1]] = [points[index], points[index + 1]];
  return l0 + ((velocity - v0) * (l1 - l0)) / (v1 - v0);
}

export interface SampleChoice {
  readonly layer: SampleVelocity;
  /** Correction de volume (dB) pour passer du niveau de la couche à celui de la vélocité demandée. */
  readonly gainDb: number;
}

/** Couche enregistrée la plus proche, et correction de volume pour une vélocité MIDI (1–127). */
export function chooseSample(velocity: number): SampleChoice {
  const clamped = Math.min(127, Math.max(1, velocity));
  const layer = SAMPLE_VELOCITIES.reduce((best, candidate) =>
    Math.abs(candidate - clamped) < Math.abs(best - clamped) ? candidate : best,
  );
  const gainDb = Math.min(MAX_GAIN_DB, Math.max(-MAX_GAIN_DB, levelDb(clamped) - levelDb(layer)));
  return { layer, gainDb };
}

export function hasSample(note: number): boolean {
  return Number.isInteger(note) && note >= SAMPLE_LOW && note <= SAMPLE_HIGH;
}

/** Vélocités tirées de la position du clic sur la touche. */
export const CLICK_VELOCITY = { back: 25, front: 115 } as const;

/**
 * Vélocité d'un clic selon sa position sur la touche (0 = fond, 1 = bord avant) :
 * comme sur un vrai piano, une touche enfoncée près du fond, où le levier est plus court,
 * sonne moins fort.
 */
export function clickVelocity(depth: number): number {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(depth) ? depth : 1));
  return Math.round(CLICK_VELOCITY.back + clamped * (CLICK_VELOCITY.front - CLICK_VELOCITY.back));
}
