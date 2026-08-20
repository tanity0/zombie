// 実機報告「対戦の守護霊がカウンターしない」(v0.25.3661)の診断で書いた回帰テスト。
// 既存の phantomTick.test はスケボー・damageEnemy直呼びの経路しか通しておらず、
// **実機の主経路=triggerCounter(通常斬りの掃引・gameStore 6440)を誰も踏んでいなかった**。
// 機構が生きていることの証明と、この経路の取りこぼし再発防止として恒久で残す。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const START_GT = 10_000_000;
const ORIGIN = 50_000;

beforeEach(() => {
  setTreesDisabled(true);
  setTorchesDisabled(true);
  useGameStore.getState().resetGame('assault');
});
afterEach(() => { vi.restoreAllMocks(); });

describe('診断: 通常斬り(triggerCounter)で幻影のパリィが発火するか', () => {
  it('抽選が必ず当たる条件で、掃引がパリィ(gpParriedAt)になる', () => {
    const e = spawnEnemyAt('guardian-phantom', ORIGIN, ORIGIN, START_GT);
    useGameStore.setState(s => ({
      enemies: [e],
      gameTime: START_GT,
      player: {
        ...s.player,
        x: e.x + e.width / 2 + 40, y: e.y + e.height / 2 - s.player.height / 2,
        health: 9999, maxHealth: 9999,
      },
    }));
    vi.spyOn(Math, 'random').mockReturnValue(0); // counterChance 0.82 に必ず当たる
    const hp0 = e.health;
    useGameStore.getState().triggerCounter();
    const after = useGameStore.getState().enemies.find(x => x.id === e.id)!;
    // パリィなら: HP不変・gpParriedAt が立つ・被弾演出は積まれない
    expect(after.health).toBe(hp0);
    expect(after.gpParriedAt).toBe(START_GT);
  });
});
