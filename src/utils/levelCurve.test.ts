import { describe, it, expect } from 'vitest';
import { nextLevelThreshold, expNeededForLevels } from './levelCurve';

describe('levelCurve', () => {
  it('しきい値の式は gameStore.levelUp の旧インライン実装と一致する(移設で挙動を変えていない)', () => {
    // 旧: floor(prev * (newLevel < 10 ? 1.1 : 1.18) + (newLevel < 10 ? 2 : 0))
    expect(nextLevelThreshold(2, 100)).toBe(Math.floor(100 * 1.1 + 2));
    expect(nextLevelThreshold(9, 250)).toBe(Math.floor(250 * 1.1 + 2));
    expect(nextLevelThreshold(10, 250)).toBe(Math.floor(250 * 1.18));
    expect(nextLevelThreshold(30, 1000)).toBe(Math.floor(1000 * 1.18));
  });

  it('足した経験値で**ちょうどN回**レベルアップする(1回も多くならない)', () => {
    for (const levels of [1, 2, 3, 5]) {
      let exp = 7, thr = 100, lv = 1;
      exp += expNeededForLevels(exp, thr, lv, levels);
      // ゲーム側の処理を再現: しきい値以上なら1回上げて余剰を繰り越す。
      let ups = 0;
      while (exp >= thr) { exp -= thr; lv += 1; thr = nextLevelThreshold(lv, thr); ups += 1; }
      expect(ups).toBe(levels);
    }
  });

  it('既に溜まっている経験値は無駄にしない(必要量が減る)', () => {
    const empty = expNeededForLevels(0, 100, 1, 3);
    const half = expNeededForLevels(50, 100, 1, 3);
    expect(half).toBe(empty - 50);
  });

  it('levels<=0 は0(何も足さない)', () => {
    expect(expNeededForLevels(0, 100, 1, 0)).toBe(0);
    expect(expNeededForLevels(0, 100, 1, -3)).toBe(0);
  });
});
