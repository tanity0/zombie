import { describe, it, expect } from 'vitest';
import { sectorIndexForAngle, poiSectorIndex, bossLairPos, getRunPois, isPoiRevealed, POI_SECTORS } from './pois';
import type { BaseSite } from '../types/game';

const mkSites = (capturedIdx: number[]): BaseSite[] =>
  Array.from({ length: POI_SECTORS }, (_, i) => ({
    id: `base-${i}`,
    x: Math.cos((Math.PI * 2 * i) / POI_SECTORS) * 3200,
    y: Math.sin((Math.PI * 2 * i) / POI_SECTORS) * 3200,
    status: capturedIdx.includes(i) ? 'captured' : 'open',
    hp: 100, dwellMs: 0, attackerId: null, attackerRespawnAt: 0,
    soldierFireAt: 0, soldierIndex: -1, soldiers: [],
  } as unknown as BaseSite));

describe('POI sector mapping', () => {
  it('maps origin angle to the nearest of 4 base sectors (東西南北)', () => {
    expect(sectorIndexForAngle(0)).toBe(0);          // 東
    expect(sectorIndexForAngle(Math.PI / 2)).toBe(1); // 南(下)
    expect(sectorIndexForAngle(Math.PI)).toBe(2);     // 西
    expect(sectorIndexForAngle(-Math.PI / 2)).toBe(3); // 北(上)
  });
  it('wraps negatives and >2π into [0,4)', () => {
    expect(sectorIndexForAngle(-0.01)).toBe(0);
    expect(sectorIndexForAngle(Math.PI * 2)).toBe(0);
    for (let a = -10; a < 10; a += 0.3) {
      const s = sectorIndexForAngle(a);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(POI_SECTORS);
    }
  });
});

describe('boss lair + reveal', () => {
  it('jormungand lair is east (sector 0), mimir is west (sector 2)', () => {
    const j = bossLairPos('jormungand')!;
    const m = bossLairPos('mimir')!;
    expect(poiSectorIndex(j)).toBe(0);
    expect(poiSectorIndex(m)).toBe(2);
  });
  it('a POI is revealed only when its sector base is captured', () => {
    const pois = getRunPois('jormungand');
    const lair = pois.find(p => p.kind === 'boss')!;
    expect(isPoiRevealed(lair, mkSites([]))).toBe(false);     // none captured
    expect(isPoiRevealed(lair, mkSites([2]))).toBe(false);    // wrong sector(西) captured
    expect(isPoiRevealed(lair, mkSites([0]))).toBe(true);     // its sector(東) captured
  });
  it('getRunPois returns nothing for a stage with no hidden boss and no caves', () => {
    expect(getRunPois(null)).toEqual([]);
  });
});
