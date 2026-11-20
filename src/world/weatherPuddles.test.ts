import { describe, it, expect, afterEach } from 'vitest';
import {
  puddlesInRegion, isInPuddle, puddleAt, PUDDLE_SAFE_RADIUS, PUDDLE_TREE_CLEAR, PUDDLE_TORCH_CLEAR, PUDDLE_BASE_PAD,
  PUDDLE_ART_SIZE, PUDDLE_VARIANTS, PUDDLE_ART_SCALE,
} from './weatherPuddles';
import { treesInRegion } from './trees';
import { torchesInRegion } from './torches';
import { setPoiClearings, isInPoiClearing } from './poiClearings';

const R = [-3000, -3000, 3000, 3000] as const;

describe('weatherPuddles(雨上がりの水たまり配置)', () => {
  afterEach(() => setPoiClearings([]));

  it('決まった乱数: 同じ範囲は毎回同じ配置', () => {
    const a = puddlesInRegion(...R);
    const b = puddlesInRegion(...R);
    expect(a.length).toBeGreaterThan(20);
    expect(b).toEqual(a);
  });

  it('範囲を変えても同じ場所の水たまりは同じ(区画で決まる)', () => {
    const big = new Map(puddlesInRegion(...R).map(p => [p.id, p]));
    for (const p of puddlesInRegion(-600, -600, 600, 600)) {
      const q = big.get(p.id);
      if (q) expect(q).toEqual(p);
    }
  });

  it('出撃地点の周りは空いている', () => {
    for (const p of puddlesInRegion(...R)) expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(PUDDLE_SAFE_RADIUS);
  });

  it('木と松明の足元を避ける', () => {
    for (const p of puddlesInRegion(...R)) {
      for (const t of treesInRegion(p.x - 300, p.y - 300, p.x + 300, p.y + 300)) {
        expect(Math.hypot(t.footX - p.x, (t.footY - p.y) * 1.6)).toBeGreaterThanOrEqual(p.rx + PUDDLE_TREE_CLEAR * t.scale);
      }
      for (const t of torchesInRegion(p.x - 300, p.y - 300, p.x + 300, p.y + 300)) {
        expect(Math.hypot(t.footX - p.x, (t.footY - p.y) * 1.6)).toBeGreaterThanOrEqual(p.rx + PUDDLE_TORCH_CLEAR);
      }
    }
  });

  it('拠点の円とPOIの空き地を避ける', () => {
    const bases = [{ x: 900, y: 400, r: 130 }, { x: -1200, y: -800, r: 130 }];
    const poi = { x: 1500, y: -1400 };
    setPoiClearings([poi]);
    const list = puddlesInRegion(...R, { bases });
    for (const p of list) {
      for (const b of bases) expect(Math.hypot(b.x - p.x, b.y - p.y)).toBeGreaterThanOrEqual(b.r + PUDDLE_BASE_PAD + p.rx);
      expect(isInPoiClearing(p.x, p.y)).toBe(false);
    }
    // 拠点を渡さない時より減っている(避けている証拠)
    setPoiClearings([]);
    expect(list.length).toBeLessThan(puddlesInRegion(...R).length);
  });

  it('楕円の大きさは絵の寸法×倍率から出る', () => {
    for (const p of puddlesInRegion(...R)) {
      expect(PUDDLE_VARIANTS).toContain(p.variant);
      const art = PUDDLE_ART_SIZE[p.variant];
      expect(p.rx).toBeCloseTo((art.w / 2) * PUDDLE_ART_SCALE * p.scale, 6);
      expect(p.ry).toBeCloseTo((art.h / 2) * PUDDLE_ART_SCALE * p.scale, 6);
      expect(p.debris.length).toBeLessThanOrEqual(2);
    }
  });

  it('踏んだ判定: 中心は中、楕円の外は外', () => {
    const p = { x: 100, y: 50, rx: 40, ry: 20 };
    expect(isInPuddle(p, 100, 50)).toBe(true);
    expect(isInPuddle(p, 100 + 30, 50)).toBe(true);
    expect(isInPuddle(p, 100 + 35, 50)).toBe(false);
    expect(isInPuddle(p, 100, 50 + 17)).toBe(false);
    expect(puddleAt([p], 100, 50)).toBe(p);
    expect(puddleAt([p], 0, 0)).toBeNull();
  });
});
