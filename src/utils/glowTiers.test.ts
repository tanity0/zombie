import { describe, it, expect } from 'vitest';
import {
  snapGlowRadius, GLOW_TIERS,
  GLOW_R_XS, GLOW_R_S, GLOW_R_M, GLOW_R_L, GLOW_R_XL, GLOW_R_XXL,
} from './glowTiers';

describe('光の段(6段)', () => {
  it('★基準は手榴弾の 44。段は昇順で6つ', () => {
    expect(GLOW_R_XS).toBe(44);
    expect(GLOW_TIERS).toHaveLength(6);
    expect([...GLOW_TIERS]).toEqual([...GLOW_TIERS].slice().sort((a, b) => a - b));
  });

  it('★実測で見つかった17種類が、意図した段へ寄る', () => {
    const want: [number, number][] = [
      [44, GLOW_R_XS], [46, GLOW_R_XS],
      [50, GLOW_R_S], [54, GLOW_R_S], [56, GLOW_R_S], [58, GLOW_R_S],
      [62, GLOW_R_S], [68, GLOW_R_M], [70, GLOW_R_M], [72, GLOW_R_M],
      [78, GLOW_R_M], [88, GLOW_R_L], [95, GLOW_R_L], [96, GLOW_R_L],
      [130, GLOW_R_XL], [140, GLOW_R_XXL],
      [150, GLOW_R_XXL],
    ];
    for (const [raw, tier] of want) expect(snapGlowRadius(raw)).toBe(tier);
  });

  it('★閾値(44)未満は丸めない=小さな光を引き上げない', () => {
    // 引き上げると「戦闘中ずっと地面が光る」ことになるので、ここは意図的に段の外
    for (const r of [0, 15, 24, 30, 34, 42, 43]) expect(snapGlowRadius(r)).toBe(r);
  });

  it('段より大きい値は一番上の段へ', () => {
    expect(snapGlowRadius(200)).toBe(GLOW_R_XXL);
    expect(snapGlowRadius(1000)).toBe(GLOW_R_XXL);
  });

  it('壊れた値でも呼び側の値を壊さない', () => {
    expect(Number.isNaN(snapGlowRadius(NaN))).toBe(true);
    expect(snapGlowRadius(-5)).toBe(-5);
  });
});
