import { describe, expect, it } from 'vitest';
import { niceTicks } from './ticks';

describe('niceTicks', () => {
  it('produit des graduations rondes qui couvrent le maximum', () => {
    expect(niceTicks(2700)).toEqual([0, 1000, 2000, 3000]);
    expect(niceTicks(1400)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(450)).toEqual([0, 200, 400, 600]);
  });

  it('gère un maximum nul', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});
