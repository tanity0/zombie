// M2(屋外)の道中PHILL弾の配置(社長指示v0.25.2246「ゴールからみて30%地点と60%地点にランダム設置」)。
// gameStore の resetGame 内で組み立てている式と同じ計算を検証する(位置の意味づけを固定するため)。
import { describe, it, expect } from 'vitest';
import { LAB_AMMO_GOAL_FRACS, LAB_CORRIDOR_Y_LIMIT_PX } from './gameStore';

const JITTER_X = 400; // gameStore の LAB_AMMO_JITTER_X と同値

// resetGame と同じ配置式(ランダムは注入して検証可能にする)
const placeAmmo = (goalX: number, side: number, frac: number, r1: number, r2: number) => ({
  x: goalX * (1 - frac) + side * (r1 * 2 - 1) * JITTER_X,
  y: (r2 * 2 - 1) * (LAB_CORRIDOR_Y_LIMIT_PX - 40),
});

describe('M2の道中PHILL弾', () => {
  it('30%と60%の2つを置く', () => {
    expect(LAB_AMMO_GOAL_FRACS).toEqual([0.3, 0.6]);
  });

  it('ゴールから見た割合の位置(=スタートから70%/40%)に来る', () => {
    const goalX = 7000, side = 1;
    const a = placeAmmo(goalX, side, 0.3, 0.5, 0.5); // 散らし0
    const b = placeAmmo(goalX, side, 0.6, 0.5, 0.5);
    expect(a.x).toBeCloseTo(4900); // 7000×0.7
    expect(b.x).toBeCloseTo(2800); // 7000×0.4
    // ゴールとスタートの間にあり、ゴールに近い方が30%側
    expect(Math.abs(a.x)).toBeLessThan(Math.abs(goalX));
    expect(Math.abs(b.x)).toBeLessThan(Math.abs(a.x));
  });

  it('ゴールが左側(側=-1)でも同じ関係になる', () => {
    const goalX = -7000, side = -1;
    const a = placeAmmo(goalX, side, 0.3, 0.5, 0.5);
    expect(a.x).toBeCloseTo(-4900);
    expect(Math.abs(a.x)).toBeLessThan(Math.abs(goalX));
  });

  it('Yは必ず歩ける帯の中(拾いに行ける)', () => {
    for (let i = 0; i <= 10; i++) {
      const p = placeAmmo(7000, 1, 0.3, 0.5, i / 10);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(LAB_CORRIDOR_Y_LIMIT_PX);
    }
  });

  it('散らしを振ると位置が変わる(毎回同じ場所にならない)', () => {
    const xs = new Set([0, 0.25, 0.5, 0.75, 1].map(r => placeAmmo(7000, 1, 0.3, r, 0.5).x));
    expect(xs.size).toBe(5);
  });
});
