import { describe, it, expect } from 'vitest';
import { flinchStrengthOf, enemyFlinchStrength, FLINCH_MIN_STRENGTH } from './hitFlinch';

describe('flinchStrengthOf — ダメージでのけぞりの強さが決まる', () => {
  it('最大HPの15%以上なら満額', () => {
    expect(flinchStrengthOf(30, 200)).toBe(1);
    expect(flinchStrengthOf(100, 200)).toBe(1);
  });

  it('延焼の1tickのような極小ダメージは下限まで落ちる', () => {
    // 燃焼 dps=2 / ゾンビ実効HP 200 → 1% = 下限
    expect(flinchStrengthOf(2, 200)).toBe(FLINCH_MIN_STRENGTH);
  });

  it('bat(実効HP40)の燃焼1tickも満額にはならない', () => {
    // 2/40 = 5% → 5/15 = 0.33。満額(1)より明確に弱い、が無反応でもない。
    const s = flinchStrengthOf(2, 40);
    expect(s).toBeGreaterThan(FLINCH_MIN_STRENGTH);
    expect(s).toBeLessThan(0.4);
  });

  it('下限を下回らない / 1を超えない', () => {
    expect(flinchStrengthOf(0, 200)).toBe(FLINCH_MIN_STRENGTH);
    expect(flinchStrengthOf(-5, 200)).toBe(FLINCH_MIN_STRENGTH);
    expect(flinchStrengthOf(9999, 200)).toBe(1);
  });

  it('記録が無い被弾は従来どおり満額(弱める賭けをしない)', () => {
    expect(flinchStrengthOf(undefined, 200)).toBe(1);
  });

  it('maxHealth=0 でも 0除算しない', () => {
    expect(Number.isFinite(flinchStrengthOf(5, 0))).toBe(true);
  });
});

describe('enemyFlinchStrength — ボス・強個体は満額のまま', () => {
  it('雑魚(zombie)は量で弱まる', () => {
    expect(enemyFlinchStrength({ type: 'zombie', lastHitDmg: 2, maxHealth: 200 })).toBe(FLINCH_MIN_STRENGTH);
  });

  it('強個体(pumpkin)は掛けない', () => {
    expect(enemyFlinchStrength({ type: 'pumpkin', lastHitDmg: 2, maxHealth: 750 })).toBe(1);
  });

  it('ボス(giantbat)は掛けない', () => {
    expect(enemyFlinchStrength({ type: 'giantbat', lastHitDmg: 30, maxHealth: 2500 })).toBe(1);
  });
});
