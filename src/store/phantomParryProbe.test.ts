// 実機報告「対戦の守護霊がカウンターしない」(v0.25.3661)の診断で書いた回帰テスト。
// 既存の phantomTick.test はスケボー・damageEnemy直呼びの経路しか通しておらず、
// **実機の主経路=triggerCounter(通常斬りの掃引・gameStore 6440)を誰も踏んでいなかった**。
// 機構が生きていることの証明と、この経路の取りこぼし再発防止として恒久で残す。
//
// ★research/GHOST_BOSS.md v9(パリィの反応速度モデル化)で成立条件が変わった:
// 近接パリィは counterChance の抽選ではなく、**幻影のスイングが開けた窓(COUNTER_WINDOW)**。
// よってこの経路も「窓の中は弾かれる/窓の外は素通り」の2ケースで固定する。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, COUNTER_WINDOW } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';

const START_GT = 10_000_000;
const ORIGIN = 50_000;

/** 幻影1体+射程内のプレイヤーを置く。`gpSwingAt` で「窓が開いてから何ms経ったか」を作る。 */
const setup = (swingAgoMs: number | null): Enemy => {
  const e = spawnEnemyAt('guardian-phantom', ORIGIN, ORIGIN, START_GT);
  if (swingAgoMs !== null) e.gpSwingAt = START_GT - swingAgoMs;
  useGameStore.setState(s => ({
    enemies: [e],
    gameTime: START_GT,
    player: {
      ...s.player,
      x: e.x + e.width / 2 + 40, y: e.y + e.height / 2 - s.player.height / 2,
      health: 9999, maxHealth: 9999,
    },
  }));
  return e;
};

beforeEach(() => {
  setTreesDisabled(true);
  setTorchesDisabled(true);
  useGameStore.getState().resetGame('assault');
});
afterEach(() => { vi.restoreAllMocks(); });

describe('診断: 通常斬り(triggerCounter)で幻影のパリィが発火するか', () => {
  it('窓の中(幻影が振った直後)なら、掃引がパリィ(gpParriedAt)になる', () => {
    const e = setup(COUNTER_WINDOW - 50); // 窓の終わり際でもまだ開いている
    const hp0 = e.health;
    useGameStore.getState().triggerCounter();
    const after = useGameStore.getState().enemies.find(x => x.id === e.id)!;
    // パリィなら: HP不変・gpParriedAt が立つ・被弾演出は積まれない
    expect(after.health).toBe(hp0);
    expect(after.gpParriedAt).toBe(START_GT);
  });

  it('窓の外(スイングの隙/一度も振っていない)なら素通りしてダメージが通る', () => {
    for (const swingAgo of [COUNTER_WINDOW, null]) {
      useGameStore.getState().resetGame('assault');
      const e = setup(swingAgo);
      const hp0 = e.health;
      // 抽選が生きていたら弾かれる乱数を、あえて固定する(近接は乱数を読まない=v9)。
      vi.spyOn(Math, 'random').mockReturnValue(0);
      useGameStore.getState().triggerCounter();
      const after = useGameStore.getState().enemies.find(x => x.id === e.id)!;
      expect(after.health, `swingAgo=${swingAgo}`).toBeLessThan(hp0);
      expect(after.gpParriedAt, `swingAgo=${swingAgo}`).toBeUndefined();
      vi.restoreAllMocks();
    }
  });
});
