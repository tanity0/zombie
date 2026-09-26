// ★溜めの間だけ狙いを追う(社長指摘2026-09-17「敵の攻撃精度が気になる。
// エルデンリングはもっと正確にくらう気がする」)。
//
// 旧は**溜めの頭で向きを焼いていた**ので、溜め中にプレイヤーが少し動くだけで外れていた。
// エルデンリングの敵は**溜めの間は追い、振り始めた瞬間に向きが固まる**。
// ★社長裁定「再生したら位置調整はせずに最後まで再生」は**実行の側**の話なので矛盾しない。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { biteSpecFor, bitePhaseOf } from '../utils/enemyBite';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const ORIGIN = 50_000;
const START_GT = 10_000_000;

const setup = (biteAt: number) => {
  setTreesDisabled(true); setTorchesDisabled(true);
  const e = spawnEnemyAt('zombie', 0, 0, START_GT);
  e.x = ORIGIN + 40 - e.width / 2; e.y = ORIGIN - e.height / 2;
  e.health = 9e8; e.maxHealth = 9e8;
  e.aiPhase = 'zrush'; e.biteAt = biteAt; e.biteDirX = 1; e.biteDirY = 0;
  useGameStore.setState(s => ({
    enemies: [e], gameTime: START_GT,
    player: {
      ...s.player, x: ORIGIN - s.player.width / 2, y: ORIGIN - s.player.height / 2,
      health: 9e9, maxHealth: 9e9, invulnerable: false, invulnerableTime: 0,
    },
  }));
  return e;
};

describe('噛みつきの狙い — 溜めは追う / 実行は焼く', () => {
  beforeEach(() => { useGameStore.getState().resetGame('assault'); });

  it('溜め(windup)の間は、プレイヤーが動くと向きが追従する', () => {
    setup(START_GT);                                // 立ち上げた直後=溜め
    expect(bitePhaseOf(useGameStore.getState().enemies[0], START_GT)).toBe('windup');
    // プレイヤーを真上へずらす
    useGameStore.setState(s => ({ player: { ...s.player, y: ORIGIN - 120 - s.player.height / 2 } }));
    useGameStore.getState().setGameTime(START_GT + 16);
    useGameStore.getState().updateEnemies(1 / 60);
    const after = useGameStore.getState().enemies[0];
    expect(Math.abs(after.biteDirY ?? 0)).toBeGreaterThan(0.5);   // 上を向き直した
  });

  it('★実行(bite)に入ったら、プレイヤーが動いても向きは焼かれたまま', () => {
    const spec = biteSpecFor('zombie');
    setup(START_GT - spec.windupMs - 10);             // 溜めを過ぎている=実行
    expect(bitePhaseOf(useGameStore.getState().enemies[0], START_GT)).toBe('bite');
    const before = useGameStore.getState().enemies[0].biteDirY ?? 0;
    useGameStore.setState(s => ({ player: { ...s.player, y: ORIGIN - 200 - s.player.height / 2 } }));
    useGameStore.getState().setGameTime(START_GT + 16);
    useGameStore.getState().updateEnemies(1 / 60);
    expect(useGameStore.getState().enemies[0].biteDirY ?? 0).toBe(before);  // 1bitも動かない
  });
});
