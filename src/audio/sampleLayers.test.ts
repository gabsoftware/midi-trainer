import { describe, expect, it } from 'vitest';
import { chooseSample, clickVelocity, hasSample, SAMPLE_VELOCITIES } from './sampleLayers';

describe('chooseSample', () => {
  it('joue chaque couche enregistrée telle quelle à sa propre vélocité', () => {
    for (const layer of SAMPLE_VELOCITIES) {
      expect(chooseSample(layer)).toEqual({ layer, gainDb: 0 });
    }
  });

  it('prend la couche la plus proche', () => {
    expect(chooseSample(25).layer).toBe(20);
    expect(chooseSample(35).layer).toBe(40);
    expect(chooseSample(100).layer).toBe(115);
    expect(chooseSample(1).layer).toBe(20);
    expect(chooseSample(127).layer).toBe(115);
  });

  it('fait varier le volume continûment avec la vélocité', () => {
    let previous = -Infinity;
    for (let velocity = 1; velocity <= 127; velocity++) {
      const { layer, gainDb } = chooseSample(velocity);
      const level = { 20: -15.8, 40: -9.8, 80: -4.0, 115: -1.8 }[layer] + gainDb;
      expect(level, `vélocité ${velocity}`).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = level;
    }
  });

  it('prolonge la pente de la couche la plus proche au-delà des vélocités enregistrées', () => {
    // 80 → 115 : +2,2 dB pour 35 de vélocité, donc environ +0,75 dB de 115 à 127.
    expect(chooseSample(127).gainDb).toBeCloseTo((2.2 * 12) / 35);
    // 20 → 40 : +6 dB pour 20 de vélocité, donc −5,7 dB de 20 à 1.
    expect(chooseSample(1).gainDb).toBeCloseTo((-6 * 19) / 20);
  });

  it('ne s’éloigne jamais de plus de 6 dB de l’enregistrement', () => {
    for (let velocity = 1; velocity <= 127; velocity++) {
      expect(Math.abs(chooseSample(velocity).gainDb)).toBeLessThanOrEqual(6);
    }
  });
});

describe('clickVelocity', () => {
  it('joue plus fort près du bord avant de la touche que près du fond', () => {
    expect(clickVelocity(0)).toBe(25);
    expect(clickVelocity(1)).toBe(115);
    expect(clickVelocity(0.5)).toBe(70);
    expect(clickVelocity(-1)).toBe(25);
    expect(clickVelocity(Number.NaN)).toBe(115);
  });
});

describe('hasSample', () => {
  it('couvre les 88 touches du piano', () => {
    expect(hasSample(21)).toBe(true);
    expect(hasSample(108)).toBe(true);
    expect(hasSample(20)).toBe(false);
    expect(hasSample(109)).toBe(false);
  });
});
