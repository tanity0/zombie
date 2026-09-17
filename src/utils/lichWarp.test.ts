import { describe, it, expect } from 'vitest';
import type { Enemy } from '../types/game';
import {
  LICH_KEEP_RADIUS_PX, LICH_WARP_VANISH_MS, LICH_WARP_APPEAR_MS,
  lichWarpLanding, lichIsVanishing, lichWarpDue, lichWarpPose,
  lichVanishProgress, lichAppearProgress,
} from './lichWarp';

const mk = (p: Partial<Enemy>): Enemy => ({ id: 'l1', type: 'lich', spawnedAt: 100, ...p } as Enemy);

describe('§16-B B-5 リッチの転移', () => {
  it('着地は的から所定の距離ちょうど', () => {
    const l = lichWarpLanding(500, 400, 620, 400, 'l1', 100);
    expect(Math.hypot(l.x - 500, l.y - 400)).toBeCloseTo(LICH_KEEP_RADIUS_PX, 6);
  });

  it('★今いる方角を保ったまま外へ退く(的を挟んで反対側へ飛ばない)', () => {
    // リッチは的の**右**に居る。着地も右半面に留まること(真後ろへ回り込まない)。
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const l = lichWarpLanding(500, 400, 620, 400, id, 100);
      expect(l.x).toBeGreaterThan(500);
    }
  });

  it('着地の角度は個体ごとに散る(複数体が同じ点に重ならない)', () => {
    const xs = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => Math.round(lichWarpLanding(500, 400, 620, 400, id, 100).y));
    expect(new Set(xs).size).toBeGreaterThan(3);
  });

  it('★消えている間 → 転移の時刻、の順に進む(硬直を飛ばさない)', () => {
    const e = mk({ lichWarpAt: 1000 });
    expect(lichIsVanishing(e, 1000)).toBe(true);
    expect(lichWarpDue(e, 1000)).toBe(false);
    expect(lichIsVanishing(e, 1000 + LICH_WARP_VANISH_MS)).toBe(false);
    expect(lichWarpDue(e, 1000 + LICH_WARP_VANISH_MS)).toBe(true);
  });

  it('予約が無ければ消えも転移もしない', () => {
    const e = mk({});
    expect(lichIsVanishing(e, 9999)).toBe(false);
    expect(lichWarpDue(e, 9999)).toBe(false);
  });

  it('★消滅は加速しながら潰れる(等速で消えない=慣性MUST)', () => {
    const e = mk({ lichWarpAt: 0 });
    const q1 = lichWarpPose(e, LICH_WARP_VANISH_MS * 0.25);
    const q3 = lichWarpPose(e, LICH_WARP_VANISH_MS * 0.75);
    // 前半より後半の方が速く進む=前四分の一ではほとんど変わっていない
    expect(1 - q1.alpha).toBeLessThan(0.05);
    expect(q3.sqY).toBeLessThan(q1.sqY);      // 縦に潰れる
    expect(q3.sqX).toBeGreaterThan(q1.sqX);   // 横に広がる
  });

  it('★出現は行き過ぎて収まる(途中で等身を超える)', () => {
    const e = mk({ lichWarpDoneAt: 0 });
    const peak = Math.max(...[0.5, 0.6, 0.7, 0.8].map(u => lichWarpPose(e, LICH_WARP_APPEAR_MS * u).sqY));
    expect(peak).toBeGreaterThan(1);                                  // 行き過ぎる
    expect(lichWarpPose(e, LICH_WARP_APPEAR_MS * 0.999).sqY).toBeCloseTo(1, 1); // 収まる
  });

  it('演出が終われば等身・不透明に戻る(残らない)', () => {
    const e = mk({ lichWarpDoneAt: 0 });
    expect(lichAppearProgress(e, LICH_WARP_APPEAR_MS)).toBeNull();
    const p = lichWarpPose(e, LICH_WARP_APPEAR_MS + 1);
    expect(p).toEqual({ sqX: 1, sqY: 1, alpha: 1 });
  });

  it('進みは0..1に収まり、窓の外ではnull', () => {
    const e = mk({ lichWarpAt: 500 });
    expect(lichVanishProgress(e, 499)).toBeNull();
    expect(lichVanishProgress(e, 500)).toBe(0);
    expect(lichVanishProgress(e, 500 + LICH_WARP_VANISH_MS)).toBeNull();
  });
});
