import { describe, it, expect } from 'vitest';
import {
  assignShrineSectors, shrinePosForSector, SHRINE_DIST, SHRINE_SLOTS, shrineRect, touchedShrine, resolveShrineCollision,
} from './warlordShrine';
import { POI_SECTORS } from './pois';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('武将の祠(research/POI_TOUCH_SHRINE.md §2)', () => {
  it('3種が裏ボスのセクターを除く3セクターへ重複なしで1つずつ', () => {
    for (const boss of [0, 1, 2, 3]) {
      for (const r of [[0.1, 0.9], [0.5, 0.2], [0.99, 0.01]]) {
        const a = assignShrineSectors(boss, seq(r));
        const got = SHRINE_SLOTS.map(s => a[s]);
        expect(new Set(got).size).toBe(3);
        expect(got).not.toContain(boss);
        for (const g of got) { expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThan(POI_SECTORS); }
      }
    }
  });
  it('距離は部位ごとに固定(鎧5625/小手6250/兜6875)、方角だけが変わる', () => {
    expect(SHRINE_DIST).toEqual({ body: 5625, arms: 6250, accessory: 6875 });
    for (const slot of SHRINE_SLOTS) {
      const p = shrinePosForSector(slot, 1, 0.3);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(SHRINE_DIST[slot], 6);
    }
  });
  it('下から触れた祠だけを返す。取った祠は触れても返さない・当たり判定も消える', () => {
    const s = { slot: 'body' as const, x: 1000, y: 1000 };
    const r = shrineRect(s);
    const below = { x: s.x - 14, y: r.y + r.height, width: 28, height: 28 };
    expect(touchedShrine(below, [s])?.slot).toBe('body');
    expect(touchedShrine({ ...below, y: below.y + 40 }, [s])).toBeNull();
    expect(touchedShrine(below, [{ ...s, takenAt: 5 }])).toBeNull();
    const inside = { x: s.x - 14, y: r.y + 4, width: 28, height: 28 };
    expect(resolveShrineCollision(inside, [s])).not.toEqual({ x: inside.x, y: inside.y });
    expect(resolveShrineCollision(inside, [{ ...s, takenAt: 5 }])).toEqual({ x: inside.x, y: inside.y });
  });
});
