import type { NoteEvent } from '../midi/events';
import { chooseSample, hasSample, SAMPLE_VELOCITIES, type SampleVelocity } from './sampleLayers';

/** Au-delà de ce retard (chargement), une note n'est plus jouée : elle sonnerait à contretemps. */
const MAX_LATE_S = 0.15;
/** Note rejouée alors qu'elle sonne encore : l'ancienne s'éteint vite, pour ne pas se superposer. */
const RESTRIKE_TIME_CONSTANT_S = 0.03;

interface Voice {
  readonly gain: GainNode;
  readonly source: AudioBufferSourceNode;
}

function sampleUrl(note: number, layer: SampleVelocity): string {
  return `${import.meta.env.BASE_URL}samples/piano/${layer}/${note}.ogg`;
}

/**
 * Piano échantillonné (Web Audio). Chaque note joue son enregistrement en entier, quelle que
 * soit la durée de l'appui. Les fichiers sont téléchargés à la demande puis gardés en
 * cache ; chacun n'est décodé qu'une fois. Le contexte audio n'est créé qu'au premier besoin
 * et ne démarre qu'après une action de l'utilisateur (règle des navigateurs).
 *
 * Les sons ne sont pas fournis avec le code (voir README, « Sons de piano ») : s'ils manquent,
 * le clavier reste silencieux, sans autre conséquence.
 */
class PianoSampler {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly voices = new Map<number, Voice>();
  /** Sons absents du site (fichier introuvable) : on cesse de les demander. */
  private missing = false;

  private audio(): AudioContext | null {
    if (!this.context && typeof AudioContext !== 'undefined') {
      this.context = new AudioContext({ latencyHint: 'interactive' });
    }
    return this.context;
  }

  private load(note: number, layer: SampleVelocity): Promise<AudioBuffer | null> {
    const key = `${layer}/${note}`;
    let buffer = this.buffers.get(key);
    if (!buffer) {
      const context = this.audio();
      buffer = context && !this.missing
        ? fetch(sampleUrl(note, layer))
            .then((response) => {
              // En développement, un fichier absent renvoie la page de l'application (200, HTML).
              const audio = response.headers.get('content-type')?.startsWith('audio/') ?? false;
              if (response.status === 404 || (response.ok && !audio)) this.missing = true;
              return response.ok && audio ? response.arrayBuffer() : Promise.reject(new Error(response.statusText));
            })
            .then((data) => context.decodeAudioData(data))
            // Sans son (fichier absent, hors ligne, format non pris en charge) : l'exercice continue.
            .catch(() => null)
        : Promise.resolve(null);
      this.buffers.set(key, buffer);
    }
    return buffer;
  }

  /** Prépare des notes à l'avance (toutes les vélocités), pour qu'elles sonnent sans délai. */
  preload(notes: readonly number[]): void {
    for (const note of notes.filter(hasSample)) {
      for (const layer of SAMPLE_VELOCITIES) void this.load(note, layer);
    }
  }

  /** Joue une note ; si elle sonnait encore, l'ancienne s'éteint. */
  play(note: number, velocity: number): void {
    const context = this.audio();
    if (!context || !hasSample(note)) return;
    // Appelé depuis un appui (clic, touche) : autorise le démarrage du son.
    if (context.state === 'suspended') void context.resume();
    const requestedAt = context.currentTime;
    const { layer, gainDb } = chooseSample(velocity);
    this.fadeOut(note);
    void this.load(note, layer).then((buffer) => {
      if (!buffer || context.currentTime - requestedAt > MAX_LATE_S) return;
      const gain = context.createGain();
      gain.gain.value = 10 ** (gainDb / 20);
      gain.connect(context.destination);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      const voice = { gain, source };
      source.onended = () => {
        gain.disconnect();
        if (this.voices.get(note) === voice) this.voices.delete(note);
      };
      this.voices.set(note, voice);
      source.start();
    });
  }

  private fadeOut(note: number): void {
    const voice = this.voices.get(note);
    if (!voice || !this.context) return;
    this.voices.delete(note);
    const now = this.context.currentTime;
    voice.gain.gain.setTargetAtTime(0, now, RESTRIKE_TIME_CONSTANT_S);
    voice.source.stop(now + RESTRIKE_TIME_CONSTANT_S * 8);
  }
}

export const pianoSampler = new PianoSampler();

/**
 * Son d'un événement de note : seulement pour le clavier affiché et le clavier de l'ordinateur.
 * Un vrai clavier MIDI produit déjà son propre son. Le relâchement ne coupe pas la note.
 */
export function playNoteEvent(event: NoteEvent): void {
  if (event.source !== 'midi' && event.type === 'noteon') pianoSampler.play(event.note, event.velocity);
}
