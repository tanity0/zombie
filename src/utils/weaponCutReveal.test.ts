import { describe, it, expect } from 'vitest';
import {
  weaponCutEaseMs, weaponVisibleAtCut,
  WEAPON_CUT_EASE_MAX_MS, WEAPON_CUT_EASE_MIN_MS,
} from './weaponCutReveal';

describe('weaponVisibleAtCut（溜めの間は武器を出さない・社長指示2026-09-23）', () => {
  it('溜めの間は出さない', () => {
    expect(weaponVisibleAtCut(0, 1083)).toBe(false);
    expect(weaponVisibleAtCut(1082, 1083)).toBe(false);
  });

  it('切る瞬間から出す（境目ちょうどで出る）', () => {
    expect(weaponVisibleAtCut(1083, 1083)).toBe(true);
    expect(weaponVisibleAtCut(2000, 1083)).toBe(true);
  });

  it('溜めが無い技は最初から出す', () => {
    expect(weaponVisibleAtCut(0, 0)).toBe(true);
    expect(weaponVisibleAtCut(0, -5)).toBe(true);
  });
});

describe('weaponCutEaseMs（出のイージングは振りの尺に合わせる）', () => {
  it('★短い振りでも振り切る前に出切る（伐採人の薙ぎ=実効183ms）', () => {
    const ms = weaponCutEaseMs(183);
    expect(ms).toBeLessThan(183);
    expect(ms).toBeLessThanOrEqual(183 * 0.5);
  });

  it('長い振りでは既定の上限で止まる（薄いまま長引かせない）', () => {
    expect(weaponCutEaseMs(2000)).toBe(WEAPON_CUT_EASE_MAX_MS);
  });

  it('★下限を下回らない（パッと出るのを禁じる=慣性MUST）', () => {
    expect(weaponCutEaseMs(1)).toBe(WEAPON_CUT_EASE_MIN_MS);
    expect(weaponCutEaseMs(0)).toBe(WEAPON_CUT_EASE_MIN_MS);
    expect(weaponCutEaseMs(-100)).toBe(WEAPON_CUT_EASE_MIN_MS);
  });
});
