import { describe, it, expect } from 'vitest';
import {
  sectorIndexForAngle, poiSectorIndex, bossLairPos, bossSectorIndex, getRunPois, isPoiRevealed, POI_SECTORS,
} from './pois';
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
  it('jormungand lair is east (sector 0), mimir is west (sector 2), thor is south (sector 1)', () => {
    const j = bossLairPos('jormungand')!;
    const m = bossLairPos('mimir')!;
    const t = bossLairPos('thor')!;
    expect(poiSectorIndex(j)).toBe(0);
    expect(poiSectorIndex(m)).toBe(2);
    expect(poiSectorIndex(t)).toBe(1);
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

describe('bossSectorIndex(§6.24 M48: 寄り道POIの配置が避けるセクター)', () => {
  it('裏ボスが居るステージはそのセクターを返す', () => {
    expect(bossSectorIndex('jormungand')).toBe(0);
    expect(bossSectorIndex('mimir')).toBe(2);
    expect(bossSectorIndex('thor')).toBe(1);
    expect(bossSectorIndex('skadi')).toBe(3);
  });
  it('裏ボスの居ないステージは null', () => {
    expect(bossSectorIndex(null)).toBeNull();
  });
});

describe('getRunPois(detours引数・§6.24 M48: 寄り道POI3種)', () => {
  it('armory/police/hospitalのdetoursを渡すと、それぞれkind別のPOIが増える(座標はそのまま反映)', () => {
    const pois = getRunPois('mimir', [
      { kind: 'armory', pos: { x: 111, y: 222 } },
      { kind: 'police', pos: { x: 333, y: 444 } },
      { kind: 'hospital', pos: { x: 555, y: 666 } },
    ]);
    expect(pois.find(p => p.kind === 'armory')).toEqual({ id: 'armory', x: 111, y: 222, kind: 'armory' });
    expect(pois.find(p => p.kind === 'police')).toEqual({ id: 'police', x: 333, y: 444, kind: 'police' });
    expect(pois.find(p => p.kind === 'hospital')).toEqual({ id: 'hospital', x: 555, y: 666, kind: 'hospital' });
    expect(pois.filter(p => p.kind === 'boss')).toHaveLength(1); // 裏ボスの巣は据え置き
  });

  it('pos=nullのdetourは出ない(入手/攻略済みを表す)', () => {
    const pois = getRunPois('mimir', [{ kind: 'armory', pos: null }]);
    expect(pois.some(p => p.kind === 'armory')).toBe(false);
  });
});
