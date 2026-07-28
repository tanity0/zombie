// 到達譜(地質断面図)の表示計算。「地層は実距離スケール」「時間は左→右」を不変条件で固定する。
import { describe, it, expect } from 'vitest';
import {
  strata, depthFrac, zoneIdxOf, buildCores, rankRungs, nextGoal, digProgress, CUTAWAY_MAX, ABYSS_SPAN,
} from './resultReach';
import { AREA_THRESHOLDS, AREA_ZONE_NAMES } from './enemyUtils';
import { RANK_COUNT, WALL_RANK_NAMES } from './wallProgress';
import type { RunCore } from '../data/progress';

const core = (dist: number, at: number, end: RunCore['end'] = 'death', rank = 3): RunCore => ({ dist, rank, at, end });

describe('strata(地層は実距離スケール)', () => {
  const S = strata();

  it('区域数ぶんあり、上から下へ浅い順', () => {
    expect(S).toHaveLength(AREA_ZONE_NAMES.length);
    expect(S.map(s => s.name)).toEqual(AREA_ZONE_NAMES);
    for (let i = 1; i < S.length; i++) expect(S[i].topFrac).toBeGreaterThan(S[i - 1].topFrac);
  });

  it('境目は AREA_THRESHOLDS そのもの(表示のために閾値を作り直さない)', () => {
    expect(S.map(s => s.to)).toEqual([...AREA_THRESHOLDS, null]);
  });

  it('厚みの比 = 実距離の比(等分割ではない)', () => {
    // 軍備配置区域=1500m / 未確認汚染エリア=2500m → 厚みも 1500:2500
    const gunbi = S[0], mikakunin = S[3];
    expect(gunbi.heightFrac * CUTAWAY_MAX).toBeCloseTo(1500, 6);
    expect(mikakunin.heightFrac * CUTAWAY_MAX).toBeCloseTo(2500, 6);
    expect(mikakunin.heightFrac / gunbi.heightFrac).toBeCloseTo(2500 / 1500, 6);
  });

  it('全部足すと断面図いっぱいになる(隙間も重なりも無い)', () => {
    expect(S.reduce((a, s) => a + s.heightFrac, 0)).toBeCloseTo(1, 10);
    for (let i = 1; i < S.length; i++) {
      expect(S[i].topFrac).toBeCloseTo(S[i - 1].topFrac + S[i - 1].heightFrac, 10);
    }
  });

  it('最深段は底なしで ABYSS_SPAN ぶん伸びる=裏ボスの巣(9000m)が断面に収まる', () => {
    expect(CUTAWAY_MAX).toBe(AREA_THRESHOLDS[AREA_THRESHOLDS.length - 1] + ABYSS_SPAN);
    expect(depthFrac(9000)).toBeLessThan(1);
    expect(depthFrac(9000)).toBeGreaterThan(S[S.length - 1].topFrac);
  });
});

describe('depthFrac', () => {
  it('0mが地表、断面の底で1、範囲外はクランプ', () => {
    expect(depthFrac(0)).toBe(0);
    expect(depthFrac(CUTAWAY_MAX)).toBe(1);
    expect(depthFrac(CUTAWAY_MAX * 5)).toBe(1);
    expect(depthFrac(-9999)).toBe(0);
  });

  it('深いほど下(単調増加)', () => {
    expect(depthFrac(3000)).toBeGreaterThan(depthFrac(1500));
  });
});

describe('buildCores(過去ランの竪坑を横に並べる)', () => {
  it('今回は必ず末尾=右端(時間は左→右)', () => {
    const cores = buildCores([core(1000, 1), core(2000, 2)], { dist: 3000, rank: 4, end: 'death', at: 3 });
    expect(cores).toHaveLength(3);
    expect(cores[cores.length - 1].isCurrent).toBe(true);
    expect(cores.filter(c => c.isCurrent)).toHaveLength(1);
    expect(cores.map(c => c.at)).toEqual([1, 2, 3]); // 古い順のまま
  });

  it('過去のラベルは何ラン前か(右ほど新しい)', () => {
    const cores = buildCores([core(1000, 1), core(2000, 2), core(3000, 3)], { dist: 100, rank: 1, end: 'death', at: 4 });
    expect(cores.map(c => c.label)).toEqual(['−3', '−2', '−1', '今回']);
  });

  it('履歴が空でも今回だけで成立する(初回プレイ)', () => {
    const cores = buildCores([], { dist: 500, rank: 2, end: 'death', at: 9 });
    expect(cores).toHaveLength(1);
    expect(cores[0].isCurrent).toBe(true);
    expect(cores[0].isDeepest).toBe(true);
  });

  it('旗はいちばん深い1本にだけ立つ', () => {
    const cores = buildCores([core(8000, 1), core(2000, 2)], { dist: 3000, rank: 4, end: 'death', at: 3 });
    const flagged = cores.filter(c => c.isDeepest);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].dist).toBe(8000);
  });

  it('同じ深さで並んだら新しい方を称える(直近の自分に旗が立つ)', () => {
    const cores = buildCores([core(5000, 1)], { dist: 5000, rank: 4, end: 'death', at: 2 });
    expect(cores.find(c => c.isDeepest)?.isCurrent).toBe(true);
  });

  it('全部0m(まだ何も掘れていない)なら旗は立たない', () => {
    const cores = buildCores([core(0, 1)], { dist: 0, rank: 1, end: 'death', at: 2 });
    expect(cores.filter(c => c.isDeepest)).toHaveLength(0);
  });

  it('壊れた記録(負の距離/範囲外ランク)でも表示が飛ばない', () => {
    const cores = buildCores([core(-500, 1, 'death', 99)], { dist: -1, rank: 0, end: 'death', at: 2 });
    for (const c of cores) {
      expect(c.frac).toBe(0);
      expect(c.rank).toBeGreaterThanOrEqual(1);
      expect(c.rank).toBeLessThanOrEqual(7);
    }
  });

  it('key は全本で一意(Reactの取り違えが起きない)', () => {
    const cores = buildCores([core(1, 100), core(2, 100), core(3, 100)], { dist: 4, rank: 1, end: 'death', at: 100 });
    expect(new Set(cores.map(c => c.key)).size).toBe(cores.length);
  });
});

describe('rankRungs(七つの大罪・断面の外の別軸)', () => {
  it('常に7段すべて。上=怠惰、下=傲慢', () => {
    const r = rankRungs(1, 1);
    expect(r).toHaveLength(RANK_COUNT);
    expect(r[0].name).toBe(WALL_RANK_NAMES[1]);
    expect(r[RANK_COUNT - 1].name).toBe(WALL_RANK_NAMES[7]);
  });

  it('到達ランクまでが reached、現在は1つだけ', () => {
    const r = rankRungs(4, 6);
    expect(r.filter(x => x.reached).map(x => x.rank)).toEqual([1, 2, 3, 4]);
    expect(r.filter(x => x.isCurrent).map(x => x.rank)).toEqual([4]);
    expect(r.filter(x => x.isBest).map(x => x.rank)).toEqual([6]);
  });

  it('範囲外は1..7へ丸める', () => {
    expect(rankRungs(0, 0).filter(x => x.isCurrent).map(x => x.rank)).toEqual([1]);
    expect(rankRungs(99, 99).filter(x => x.isCurrent).map(x => x.rank)).toEqual([7]);
  });
});

describe('nextGoal(次がやりたくなる1行)', () => {
  it('次の区域名と残りmを返す', () => {
    const g = nextGoal(AREA_THRESHOLDS[0] + 100, 3);
    expect(g.meters).toBe(AREA_THRESHOLDS[1] - AREA_THRESHOLDS[0] - 100);
    expect(g.zoneName).toBe(AREA_ZONE_NAMES[2]);
    expect(g.rankName).toBe(WALL_RANK_NAMES[4]);
  });

  it('最深段では距離の“次”を出さない(嘘の目標を出さない)', () => {
    const g = nextGoal(AREA_THRESHOLDS[AREA_THRESHOLDS.length - 1] + 500, 3);
    expect(g.meters).toBeNull();
    expect(g.zoneName).toBeNull();
  });

  it('R7では昇格の“次”を出さない / 両方尽きたら maxedOut', () => {
    expect(nextGoal(0, 7).rankName).toBeNull();
    expect(nextGoal(AREA_THRESHOLDS[AREA_THRESHOLDS.length - 1] + 1, 7).maxedOut).toBe(true);
  });
});

describe('zoneIdxOf / digProgress', () => {
  it('閾値ちょうどは深い方の区域に入る', () => {
    expect(zoneIdxOf(AREA_THRESHOLDS[0] - 1)).toBe(0);
    expect(zoneIdxOf(AREA_THRESHOLDS[0])).toBe(1);
  });

  it('digProgress は0..1で単調', () => {
    expect(digProgress(0, 1)).toBe(0);
    expect(digProgress(CUTAWAY_MAX, 7)).toBe(1);
    expect(digProgress(4000, 5)).toBeGreaterThan(digProgress(4000, 2));
  });
});
