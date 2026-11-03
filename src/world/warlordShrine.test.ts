import { describe, it, expect } from 'vitest';
import {
  assignShrineSectors, shrinePosForSector, SHRINE_DIST, SHRINE_SLOTS, shrineRect, resolveShrineCollision,
  shrineCircleAt, shrineCircleCenter, tickShrineDwell, SHRINE_DWELL_MS,
} from './warlordShrine';
import { AREA_THRESHOLDS } from '../utils/enemyUtils';
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
  it('寄り道が使った3セクターを渡すと、その3つへ重複なしで1つずつ(裏ボスがいないステージ)', () => {
    const a = assignShrineSectors(null, seq([0.3, 0.7]), [3, 0, 2]);
    expect(new Set(SHRINE_SLOTS.map(s => a[s]))).toEqual(new Set([3, 0, 2]));
  });
  it('距離は部位ごとに固定=未確認汚染帯(AREA_THRESHOLDS[2]〜[3])の25/50/75%、方角だけが変わる', () => {
    const lo = AREA_THRESHOLDS[2], span = AREA_THRESHOLDS[3] - AREA_THRESHOLDS[2];
    expect(SHRINE_DIST.body).toBeCloseTo(lo + span * 0.25);
    expect(SHRINE_DIST.arms).toBeCloseTo(lo + span * 0.5);
    expect(SHRINE_DIST.accessory).toBeCloseTo(lo + span * 0.75);
    expect(SHRINE_DIST.body).toBeGreaterThan(AREA_THRESHOLDS[2]); // デンジャー帯(寄り道)より外
    for (const slot of SHRINE_SLOTS) {
      const p = shrinePosForSector(slot, 1, 0.3);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(SHRINE_DIST[slot], 6);
    }
  });
  it('円(祠の手前)に入った祠だけを返す。取った祠は返さない・当たり判定も消える', () => {
    const s = { slot: 'body' as const, x: 1000, y: 1000 };
    const c = shrineCircleCenter(s);
    const inCircle = { x: c.x - 14, y: c.y - 14, width: 28, height: 28 };
    expect(shrineCircleAt(inCircle, [s])?.slot).toBe('body');
    expect(shrineCircleAt({ ...inCircle, y: inCircle.y + 200 }, [s])).toBeNull();
    expect(shrineCircleAt(inCircle, [{ ...s, takenAt: 5 }])).toBeNull();
    const r = shrineRect(s);
    const inside = { x: s.x - 14, y: r.y + 4, width: 28, height: 28 };
    expect(resolveShrineCollision(inside, [s])).not.toEqual({ x: inside.x, y: inside.y });
    expect(resolveShrineCollision(inside, [{ ...s, takenAt: 5 }])).toEqual({ x: inside.x, y: inside.y });
  });
  it('3秒で done は1回だけ・円を出ると0へ', () => {
    let d = tickShrineDwell(0, true, SHRINE_DWELL_MS - 10);
    expect(d.done).toBe(false);
    d = tickShrineDwell(d.dwellMs, true, 20);
    expect(d.done).toBe(true);
    expect(tickShrineDwell(d.dwellMs, true, 20).done).toBe(false);
    expect(tickShrineDwell(1500, false, 16).dwellMs).toBe(0);
  });
});
