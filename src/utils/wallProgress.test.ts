import { describe, it, expect } from 'vitest';
import {
  createDefaultWallMeta, distanceToNextWall, isApproachingWall, detectWallBreach,
  isFirstWallBreach, isFirstRankReach, markWallBreached, markRankReached,
  markSelfDeepest, markSelfHighestRank, metersToNextWall, isOneRankAwayFromNext,
  nextRankName, wallAchievementHeadline, zoneIdxForDist, deepestReachedBadge,
  sortWallEventsByPriority, WALL_COUNT, RANK_COUNT,
} from './wallProgress';

describe('distanceToNextWall / isApproachingWall (境界判定)', () => {
  it('区域0(0-1500)にいれば次の壁まで1500-distance', () => {
    expect(distanceToNextWall(0)).toBe(1500);
    expect(distanceToNextWall(1400)).toBe(100);
  });
  it('深層域(7500以上)はnull(その先に壁はない)', () => {
    expect(distanceToNextWall(7500)).toBe(null);
    expect(distanceToNextWall(50000)).toBe(null);
  });
  it('境界ちょうどは次の壁扱い(4本目=7500ちょうどはnull側)', () => {
    expect(distanceToNextWall(3000)).toBe(2000); // 3000ちょうどは次(5000)まで2000
  });
  it('isApproachingWall: warnPx以内はtrue、それより遠いor深層域はfalse', () => {
    expect(isApproachingWall(1400, 150)).toBe(true);  // 残り100<=150
    expect(isApproachingWall(1300, 150)).toBe(false); // 残り200>150
    expect(isApproachingWall(9000, 150)).toBe(false); // 深層域=null
  });
});

describe('detectWallBreach (踏破検知)', () => {
  it('ゾーンindexが増えた時だけ壁番号を返す', () => {
    expect(detectWallBreach(0, 1)).toBe(1);
    expect(detectWallBreach(1, 3)).toBe(3);
  });
  it('浅くなる/同値/範囲外はnull', () => {
    expect(detectWallBreach(2, 1)).toBe(null);
    expect(detectWallBreach(1, 1)).toBe(null);
    expect(detectWallBreach(0, 0)).toBe(null);
  });
});

describe('メタの初到達判定・不変更新', () => {
  it('createDefaultWallMetaは全フラグfalse・自己最深0・自己最高ランク1', () => {
    const m = createDefaultWallMeta();
    expect(m.zoneReached).toEqual(new Array(WALL_COUNT).fill(false));
    expect(m.rankReached).toEqual(new Array(RANK_COUNT).fill(false));
    expect(m.selfDeepestDist).toBe(0);
    expect(m.selfHighestRank).toBe(1);
  });

  it('isFirstWallBreach/isFirstRankReachは未到達ならtrue', () => {
    const m = createDefaultWallMeta();
    expect(isFirstWallBreach(m, 1)).toBe(true);
    expect(isFirstRankReach(m, 5)).toBe(true);
  });

  it('markWallBreachedは該当indexだけtrueにし元オブジェクトは変えない(不変更新)', () => {
    const m = createDefaultWallMeta();
    const next = markWallBreached(m, 2);
    expect(next.zoneReached).toEqual([false, true, false, false]);
    expect(m.zoneReached).toEqual([false, false, false, false]); // 元は不変
    expect(isFirstWallBreach(next, 2)).toBe(false);
  });

  it('markRankReachedは該当ランクだけtrueにする', () => {
    const m = createDefaultWallMeta();
    const next = markRankReached(m, 7);
    expect(next.rankReached[6]).toBe(true);
    expect(m.rankReached[6]).toBe(false);
  });

  it('markSelfDeepestは更新時のみ値を変える(降順は無視)', () => {
    const m = { ...createDefaultWallMeta(), selfDeepestDist: 1000 };
    expect(markSelfDeepest(m, 2000).selfDeepestDist).toBe(2000);
    expect(markSelfDeepest(m, 500).selfDeepestDist).toBe(1000); // 更新なし
  });

  it('markSelfHighestRankは更新時のみ値を変える(降順は無視)', () => {
    const m = { ...createDefaultWallMeta(), selfHighestRank: 4 as const };
    expect(markSelfHighestRank(m, 6).selfHighestRank).toBe(6);
    expect(markSelfHighestRank(m, 2).selfHighestRank).toBe(4); // 更新なし
  });
});

describe('惜しさ計算(死亡リザルト)', () => {
  it('metersToNextWallは次の壁までの距離を丸めて返す', () => {
    expect(metersToNextWall(1450)).toBe(50);
    expect(metersToNextWall(9000)).toBe(null); // 深層域
  });
  it('isOneRankAwayFromNext/nextRankNameはR7未満で該当', () => {
    expect(isOneRankAwayFromNext(6)).toBe(true);
    expect(isOneRankAwayFromNext(7)).toBe(false);
    expect(nextRankName(6)).toBe('傲慢'); // R7=傲慢
    expect(nextRankName(7)).toBe(null);
  });
});

describe('掛け合わせ表示', () => {
  it('wallAchievementHeadlineは区域名×ランク名を合成する', () => {
    expect(wallAchievementHeadline(4, 7)).toBe('深層域の傲慢 に到達');
  });
  it('zoneIdxForDist/deepestReachedBadgeは距離から区域を逆引きする', () => {
    expect(zoneIdxForDist(0)).toBe(0);
    expect(zoneIdxForDist(1500)).toBe(1);
    expect(zoneIdxForDist(8000)).toBe(4);
    expect(deepestReachedBadge(8000, 7)).toBe('最深到達: 深層域の傲慢');
  });
});

describe('sortWallEventsByPriority (同時発火時の優先順)', () => {
  it('深さ > ランク > REVENGE の順に並び替える', () => {
    const events = [{ kind: 'revenge' as const, id: 1 }, { kind: 'depth' as const, id: 2 }, { kind: 'rank' as const, id: 3 }];
    expect(sortWallEventsByPriority(events).map(e => e.id)).toEqual([2, 3, 1]);
  });
  it('同種は元の順序を保つ(安定ソート)', () => {
    const events = [{ kind: 'depth' as const, id: 1 }, { kind: 'depth' as const, id: 2 }];
    expect(sortWallEventsByPriority(events).map(e => e.id)).toEqual([1, 2]);
  });
  it('元の配列は変更しない', () => {
    const events = [{ kind: 'rank' as const, id: 1 }, { kind: 'depth' as const, id: 2 }];
    const sorted = sortWallEventsByPriority(events);
    expect(sorted).not.toBe(events);
    expect(events.map(e => e.id)).toEqual([1, 2]); // 元は未変更
  });
});
