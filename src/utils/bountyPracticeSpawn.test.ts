// 変異体対策室(練習ラン)の賞金首の湧き位置(社長指摘2026-11-15「スタート地点から遠すぎる敵が気になる。賞金首とか」)。
// ①練習は開始地点の近く(ほかの枠と同じ帯)に出る ②本編の湧き位置は1bitも変わらない ③体力の区域は本編の湧き位置のまま。
import { describe, it, expect } from 'vitest';
import {
  bountyEncounterSpawn, bountySpawnCenter, PRACTICE_BOUNTY_SPAWN_DIST_PX, BOUNTY_AGGRO_RANGE_DEFAULT,
} from './bountyTick';
import { areaIndexForPos } from './enemyUtils';
import { PHANTOM_BRAWLER_DIST_MIN_PX, PHANTOM_BRAWLER_DIST_MAX_PX } from './phantomBrawlerSpawn';

const PLAYER_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [0, 12], [0, -12], [300, -800], [-2500, 1400], [5000, -5000], [1983, 3375], [-40, 9000],
];

describe('bountyEncounterSpawn — 対策室の賞金首は開始地点の近くに出る', () => {
  it('練習: プレイヤーの真上へ PRACTICE_BOUNTY_SPAWN_DIST_PX(どの位置から始めても同じ距離)', () => {
    for (const [px, py] of PLAYER_POINTS) {
      const { center } = bountyEncounterSpawn(px, py, true);
      expect(center.x).toBe(px);
      expect(center.y).toBe(py - PRACTICE_BOUNTY_SPAWN_DIST_PX);
      expect(Math.hypot(center.x - px, center.y - py)).toBe(PRACTICE_BOUNTY_SPAWN_DIST_PX);
    }
  });

  it('練習の距離はほかの枠の出現距離の帯(幻影=380〜500)に入り、起床範囲より外(出た瞬間は休眠のまま)', () => {
    expect(PRACTICE_BOUNTY_SPAWN_DIST_PX).toBeGreaterThanOrEqual(PHANTOM_BRAWLER_DIST_MIN_PX);
    expect(PRACTICE_BOUNTY_SPAWN_DIST_PX).toBeLessThanOrEqual(PHANTOM_BRAWLER_DIST_MAX_PX);
    expect(PRACTICE_BOUNTY_SPAWN_DIST_PX).toBeGreaterThan(BOUNTY_AGGRO_RANGE_DEFAULT);
  });

  it('開始地点(原点)から: 本編は約3375px先、練習は480px(遠さの是正が効いている)', () => {
    const normal = bountyEncounterSpawn(0, 0, false).center;
    const practice = bountyEncounterSpawn(0, 0, true).center;
    expect(Math.hypot(normal.x, normal.y)).toBeGreaterThan(3000);
    expect(Math.hypot(practice.x, practice.y)).toBeLessThanOrEqual(PRACTICE_BOUNTY_SPAWN_DIST_PX);
  });

  it('本編: 出す位置も体力の区域も bountySpawnCenter そのもの(不変)', () => {
    for (const [px, py] of PLAYER_POINTS) {
      const plan = bountyEncounterSpawn(px, py, false);
      expect(plan.center).toEqual(bountySpawnCenter(px, py));
      expect(plan.hpCenter).toEqual(bountySpawnCenter(px, py));
    }
  });

  it('練習でも体力の区域は本編の湧き位置(研究領域=区域1)のまま=寄せたせいで強さが変わらない', () => {
    for (const [px, py] of PLAYER_POINTS) {
      const plan = bountyEncounterSpawn(px, py, true);
      expect(plan.hpCenter).toEqual(bountySpawnCenter(px, py));
      expect(areaIndexForPos(plan.hpCenter.x, plan.hpCenter.y)).toBe(1);
    }
  });
});
