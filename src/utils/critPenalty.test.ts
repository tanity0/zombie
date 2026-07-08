import { describe, it, expect } from 'vitest';
import { CRIT_RATE_FLOOR, enemyCritPenalty, applyEnemyCritPenalty } from './critPenalty';

describe('enemyCritPenalty (社長決定: レア敵ほどクリが乗りにくい)', () => {
  it('色階層ごとのペナルティ: blue=-0.03 / purple=-0.06 / red=-0.09', () => {
    expect(enemyCritPenalty({ colorTier: 'blue' })).toBeCloseTo(0.03, 10);
    expect(enemyCritPenalty({ colorTier: 'purple' })).toBeCloseTo(0.06, 10);
    expect(enemyCritPenalty({ colorTier: 'red' })).toBeCloseTo(0.09, 10);
  });

  it('共通敵(colorTier無し)は0', () => {
    expect(enemyCritPenalty({})).toBe(0);
  });

  it('ネームドは色階層を無視して一律-0.10(社長決定・旧「対象外」から変更): colorTierがredでも0.10', () => {
    expect(enemyCritPenalty({ colorTier: 'red', isNamed: true })).toBe(0.10);
  });

  it('ボス系(isBossType)も色階層を無視して一律-0.10: giantbat(color無し)で0.10', () => {
    expect(enemyCritPenalty({ type: 'giantbat' })).toBe(0.10);
  });

  it('ボス系はcolorTierが付いていても-0.10のまま(色階層より優先)', () => {
    expect(enemyCritPenalty({ type: 'giantbat', colorTier: 'red' })).toBe(0.10);
  });

  it('ボス系でないtypeは通常どおり色階層ペナルティを使う', () => {
    expect(enemyCritPenalty({ type: 'zombie', colorTier: 'blue' })).toBeCloseTo(0.03, 10);
  });
});

describe('applyEnemyCritPenalty (下限floor・base超えの加算禁止)', () => {
  it('floor: base 0.20 に red(-0.09) を適用すると 0.11 まで下がる', () => {
    expect(applyEnemyCritPenalty(0.20, { colorTier: 'red' })).toBeCloseTo(0.11, 10);
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

  it('ネームド+red: 一律-0.10が適用される(色階層のredは無視)', () => {
    expect(applyEnemyCritPenalty(0.30, { colorTier: 'red', isNamed: true })).toBeCloseTo(0.20, 10);
  });

  it('ボス系+base 0.20: -0.10が適用され0.10まで下がる(floor未到達)', () => {
    expect(applyEnemyCritPenalty(0.20, { type: 'giantbat' })).toBeCloseTo(0.10, 10);
  });

  it('ボス系+base 0.12: floorで0.05に止まる', () => {
    expect(applyEnemyCritPenalty(0.12, { type: 'giantbat' })).toBeCloseTo(CRIT_RATE_FLOOR, 10);
  });
});
