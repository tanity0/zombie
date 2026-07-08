import { describe, it, expect } from 'vitest';
import { CRIT_RATE_FLOOR, enemyCritPenalty, applyEnemyCritPenalty } from './critPenalty';

describe('enemyCritPenalty (社長決定: レア敵ほどクリが乗りにくい)', () => {
  it('色階層ごとのペナルティ: blue=-0.05 / purple=-0.10 / red=-0.15', () => {
    expect(enemyCritPenalty({ colorTier: 'blue' })).toBe(0.05);
    expect(enemyCritPenalty({ colorTier: 'purple' })).toBe(0.10);
    expect(enemyCritPenalty({ colorTier: 'red' })).toBe(0.15);
  });

  it('共通敵(colorTier無し)は0', () => {
    expect(enemyCritPenalty({})).toBe(0);
  });

  it('ネームドは対象外(社長決定2b): colorTierがredでも0', () => {
    expect(enemyCritPenalty({ colorTier: 'red', isNamed: true })).toBe(0);
  });
});

describe('applyEnemyCritPenalty (下限floor・base超えの加算禁止)', () => {
  it('floor: base 0.20 に red(-0.15) を適用すると 0.05 で止まる', () => {
    expect(applyEnemyCritPenalty(0.20, { colorTier: 'red' })).toBeCloseTo(CRIT_RATE_FLOOR, 10);
  });

  it('base 0.0 の攻撃(銃0%クリ等)にはクリを足さない: red相手でも0のまま', () => {
    expect(applyEnemyCritPenalty(0.0, { colorTier: 'red' })).toBe(0);
  });

  it('base 0.03(floor未満)の攻撃も変わらない: red相手でも0.03のまま', () => {
    expect(applyEnemyCritPenalty(0.03, { colorTier: 'red' })).toBeCloseTo(0.03, 10);
  });

  it('base がちょうど CRIT_RATE_FLOOR(0.05)なら red でも 0.05 のまま', () => {
    expect(applyEnemyCritPenalty(CRIT_RATE_FLOOR, { colorTier: 'red' })).toBeCloseTo(CRIT_RATE_FLOOR, 10);
  });

  it('共通敵(colorTier無し)はペナルティなし: baseそのまま', () => {
    expect(applyEnemyCritPenalty(0.30, {})).toBeCloseTo(0.30, 10);
  });

  it('ネームド+red: ペナルティ無視でbaseそのまま', () => {
    expect(applyEnemyCritPenalty(0.30, { colorTier: 'red', isNamed: true })).toBeCloseTo(0.30, 10);
  });
});
