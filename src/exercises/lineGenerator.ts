import { diatonicIndex, midiToPitch } from '../music/pitch';

export interface LineOptions {
  readonly minLength: number;
  readonly maxLength: number;
  /** Écart maximal entre deux notes successives, en degrés. */
  readonly maxLeap: number;
  /** Dernière note jouée (ligne précédente) : jamais répétée en tête de ligne. */
  readonly previous: number | null;
  /** Notes déjà apparues dans l'examen : les autres sont favorisées, pour que tout le niveau soit vérifié. */
  readonly used: ReadonlySet<number>;
  /** Source aléatoire dans [0, 1[ ; déterministe si la source l'est. */
  readonly random: () => number;
}

/** Une note encore jamais apparue est trois fois plus probable. */
const UNUSED_WEIGHT = 3;

function degree(midi: number): number {
  return diatonicIndex(midiToPitch(midi));
}

function pick(candidates: readonly number[], used: ReadonlySet<number>, random: () => number): number {
  const weights = candidates.map((note) => (used.has(note) ? 1 : UNUSED_WEIGHT));
  let threshold = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < candidates.length; index++) {
    threshold -= weights[index];
    if (threshold < 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
}

/**
 * Génère une ligne de notes prises dans `pool` : longueur entre `minLength` et `maxLength`,
 * pas plus de `maxLeap` degrés entre deux notes successives, jamais deux fois la même note de suite.
 */
export function generateLine(pool: readonly number[], options: LineOptions): number[] {
  if (pool.length < 2) {
    throw new Error('A line needs at least two different notes.');
  }
  const { minLength, maxLength, maxLeap, random } = options;
  const length = minLength + Math.min(maxLength - minLength, Math.floor(random() * (maxLength - minLength + 1)));
  const used = new Set(options.used);
  const line: number[] = [];
  let previous = options.previous;

  for (let index = 0; index < length; index++) {
    const notPrevious = pool.filter((note) => note !== previous);
    // Dans la ligne, petits intervalles ; la première note est libre (nouvelle ligne).
    const close =
      index === 0 || previous === null
        ? notPrevious
        : notPrevious.filter((note) => Math.abs(degree(note) - degree(previous!)) <= maxLeap);
    const note = pick(close.length > 0 ? close : notPrevious, used, random);
    line.push(note);
    used.add(note);
    previous = note;
  }
  return line;
}
