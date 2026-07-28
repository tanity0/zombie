// 到達譜(掘り下げ図)の表示計算。上から下へ掘る=「浅い段が先・深い段が後」を不変条件で固定する。
import { describe, it, expect } from 'vitest';
import { depthRungs, rankRungs, nextGoal, digProgress, zoneIdxOf, ABYSS_SPAN } from './resultReach';
import { AREA_THRESHOLDS, AREA_ZONE_NAMES } from './enemyUtils';
import { RANK_COUNT, WALL_RANK_NAMES } from './wallProgress';

describe('depthRungs(距離の縦坑)', () => {
  it('段は区域数ぶん、上から下へ浅い順に並ぶ', () => {
    const rungs = depthRungs(0, 0);
    expect(rungs).toHaveLength(AREA_ZONE_NAMES.length);
    expect(rungs.map(r => r.name)).toEqual(AREA_ZONE_NAMES);
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i].from).toBeGreaterThan(rungs[i - 1].from); // 下ほど深い
    }
  });

  it('段の境目は AREA_THRESHOLDS そのもの(表示のために閾値を作り直さない)', () => {
    const rungs = depthRungs(0, 0);
    expect(rungs.map(r => r.to)).toEqual([...AREA_THRESHOLDS, null]); // 最深段は底なし
  });

  it('未出発(0m)はどの段も掘れていない', () => {
    for (const r of depthRungs(0, 0)) {
      expect(r.fill).toBe(0);
      expect(r.reached).toBe(false);
    }
  });

  it('浅い段は満タン、到達段は途中、深い段は0(掘り進んだ形になる)', () => {
    const d = (AREA_THRESHOLDS[1] + AREA_THRESHOLDS[2]) / 2; // 3段目の真ん中
    const rungs = depthRungs(d, 0);
    expect(rungs[0].fill).toBe(1);
    expect(rungs[1].fill).toBe(1);
    expect(rungs[2].fill).toBeCloseTo(0.5, 6);
    expect(rungs[3].fill).toBe(0);
    expect(rungs[4].fill).toBe(0);
    expect(rungs.filter(r => r.isCurrent).map(r => r.idx)).toEqual([2]); // 到達段は必ず1つ
  });

  it('最深段は底なし(ABYSS_SPAN ぶんだけ伸び、満タンにはなりにくい)', () => {
    const deepStart = AREA_THRESHOLDS[AREA_THRESHOLDS.length - 1];
    const rungs = depthRungs(deepStart + ABYSS_SPAN / 2, 0);
    expect(rungs[rungs.length - 1].to).toBeNull();
    expect(rungs[rungs.length - 1].fill).toBeCloseTo(0.5, 6);
  });

  it('自己最深はちょうど1段だけに立つ(0mなら立たない)', () => {
    expect(depthRungs(100, 0).filter(r => r.isBest)).toHaveLength(0);
    const best = AREA_THRESHOLDS[2] + 10;
    const marked = depthRungs(100, best).filter(r => r.isBest);
    expect(marked).toHaveLength(1);
    expect(marked[0].idx).toBe(zoneIdxOf(best));
  });

  it('負の距離でも壊れない(0扱い)', () => {
    for (const r of depthRungs(-999, -999)) expect(r.fill).toBe(0);
  });
});

describe('rankRungs(七つの大罪の縦坑)', () => {
  it('常に7段すべて出す(社長指示「7つ並べる」)。上=怠惰、下=傲慢', () => {
    const rungs = rankRungs(1, 1);
    expect(rungs).toHaveLength(RANK_COUNT);
    expect(rungs[0].name).toBe(WALL_RANK_NAMES[1]);
    expect(rungs[RANK_COUNT - 1].name).toBe(WALL_RANK_NAMES[7]);
    expect(rungs.map(r => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('到達ランクまでが reached、それより下は未到達', () => {
    const rungs = rankRungs(4, 1);
    expect(rungs.filter(r => r.reached).map(r => r.rank)).toEqual([1, 2, 3, 4]);
    expect(rungs.filter(r => r.isCurrent).map(r => r.rank)).toEqual([4]);
  });

  it('範囲外のランクは1..7へ丸める(壊れた記録でも表示が飛ばない)', () => {
    expect(rankRungs(0, 0).filter(r => r.isCurrent).map(r => r.rank)).toEqual([1]);
    expect(rankRungs(99, 99).filter(r => r.isCurrent).map(r => r.rank)).toEqual([7]);
  });
});

describe('nextGoal(次がやりたくなる1行)', () => {
  it('次の区域名と残りmを返す', () => {
    const g = nextGoal(AREA_THRESHOLDS[0] + 100, 3);
    expect(g.meters).toBe(AREA_THRESHOLDS[1] - AREA_THRESHOLDS[0] - 100);
    expect(g.zoneName).toBe(AREA_ZONE_NAMES[2]);
    expect(g.rankName).toBe(WALL_RANK_NAMES[4]);
    expect(g.maxedOut).toBe(false);
  });

  it('最深段では距離の“次”は出ない(嘘の目標を出さない)', () => {
    const g = nextGoal(AREA_THRESHOLDS[AREA_THRESHOLDS.length - 1] + 500, 3);
    expect(g.meters).toBeNull();
    expect(g.zoneName).toBeNull();
    expect(g.rankName).toBe(WALL_RANK_NAMES[4]);
  });

  it('R7では昇格の“次”は出ない', () => {
    expect(nextGoal(0, 7).rankName).toBeNull();
  });

  it('最深段かつR7なら maxedOut(掘りきった)', () => {
    const g = nextGoal(AREA_THRESHOLDS[AREA_THRESHOLDS.length - 1] + 1, 7);
    expect(g.maxedOut).toBe(true);
  });
});

describe('digProgress(坑道の光量・表示専用)', () => {
  it('0..1に収まり、深く/高くなるほど単調に増える', () => {
    expect(digProgress(0, 1)).toBe(0);
    expect(digProgress(99999, 7)).toBe(1);
    const a = digProgress(1000, 2), b = digProgress(4000, 2), c = digProgress(4000, 5);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});
