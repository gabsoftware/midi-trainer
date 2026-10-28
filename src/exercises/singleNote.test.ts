import { describe, expect, it } from 'vitest';
import { elapsed, pause, playNote, resumeNote, startNote } from './singleNote';

const E4 = 64;
const F4 = 65;
const E5 = 76;

describe('exercice note isolée', () => {
  it('valide une bonne réponse du premier coup', () => {
    const state = playNote(startNote(E4, 'exact', 1000), E4, 1800);
    expect(state.phase).toBe('answered');
    expect(state.attempt).toEqual({
      expected: E4,
      played: [E4],
      firstTryCorrect: true,
      errorCount: 0,
      firstResponseMs: 800,
      timeToCorrectMs: 800,
      octaveMode: 'exact',
    });
  });

  it('une mauvaise réponse ne fait pas avancer l’exercice', () => {
    const state = playNote(startNote(E4, 'exact', 0), F4, 500);
    expect(state.phase).toBe('waiting');
    expect(state.attempt).toBeNull();
    expect(state.lastAnswer).toEqual({ played: F4, correct: false, at: 500 });
  });

  it('distingue le temps de première réponse et le temps jusqu’à la bonne réponse', () => {
    let state = startNote(E4, 'exact', 0);
    state = playNote(state, F4, 400);
    state = playNote(state, E5, 900);
    state = playNote(state, E4, 1500);
    expect(state.attempt).toMatchObject({
      played: [F4, E5, E4],
      firstTryCorrect: false,
      errorCount: 2,
      firstResponseMs: 400,
      timeToCorrectMs: 1500,
    });
  });

  it('accepte une autre octave en mode « any »', () => {
    const state = playNote(startNote(E4, 'any', 0), E5, 300);
    expect(state.attempt?.firstTryCorrect).toBe(true);
  });

  it('ignore une touche horodatée avant l’affichage de la note', () => {
    const state = startNote(E4, 'exact', 1000);
    expect(playNote(state, E4, 990)).toBe(state);
  });

  it('ignore les notes après la bonne réponse', () => {
    const answered = playNote(startNote(E4, 'any', 0), E4, 300);
    expect(playNote(answered, F4, 400)).toBe(answered);
  });

  it('exclut les pauses (dont les déconnexions MIDI) du temps de réponse', () => {
    let state = startNote(E4, 'exact', 0);
    state = pause(state, 'midi-disconnected', 1000);
    expect(state.phase).toBe('paused');
    expect(playNote(state, E4, 5000)).toBe(state); // entrées ignorées en pause
    state = resumeNote(state, 30_000);
    state = playNote(state, E4, 30_500);
    expect(state.attempt?.timeToCorrectMs).toBe(1500);
  });

  it('cumule plusieurs pauses', () => {
    let state = startNote(E4, 'exact', 0);
    state = pause(state, 'user', 100);
    state = resumeNote(state, 1100);
    state = pause(state, 'user', 1200);
    state = resumeNote(state, 9200);
    expect(elapsed(state.stopwatch, 9300)).toBe(300);
  });

  it('retrouve la phase « answered » après une pause pendant le feedback', () => {
    let state = playNote(startNote(E4, 'exact', 0), E4, 200);
    state = pause(state, 'user', 300);
    state = resumeNote(state, 800);
    expect(state.phase).toBe('answered');
    expect(state.attempt?.timeToCorrectMs).toBe(200);
  });

  it('une déconnexion pendant une pause manuelle reste signalée', () => {
    let state = pause(startNote(E4, 'exact', 0), 'user', 100);
    state = pause(state, 'midi-disconnected', 200);
    expect(state.pauseReason).toBe('midi-disconnected');
  });
});
