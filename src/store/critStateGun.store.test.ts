// クリティカル中(気絶)の敵へのプレイヤーの銃弾 ×1.2(社長指示2026-11-02「クリティカル中の銃のダメージがもし設定されてなければ1.2倍」)。
import { describe, it, expect } from 'vitest';
import { useGameStore, CRIT_STATE_GUN_DAMAGE_MULT } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';

const dealt = (stunned: boolean, channel: 'gun' | 'other') => {
  useGameStore.getState().resetGame('warrior');
  const st = useGameStore.getState();
  const e = { ...spawnEnemyAt('zombie', st.player.x + 300, st.player.y, st.gameTime), health: 10000, maxHealth: 10000, ...(stunned ? { stunUntil: st.gameTime + 5000 } : {}) };
  useGameStore.setState({ enemies: [e] });
  useGameStore.getState().damageEnemy(e.id, 100, false, false, false, channel, 'player');
  return 10000 - useGameStore.getState().enemies.find(x => x.id === e.id)!.health;
};

describe('クリティカル中の銃弾 ×1.2', () => {
  it('気絶中の敵への銃弾だけ ×1.2。気絶していない・銃以外は等倍', () => {
    expect(dealt(false, 'gun')).toBe(100);
    expect(dealt(true, 'gun')).toBeCloseTo(100 * CRIT_STATE_GUN_DAMAGE_MULT);
    expect(dealt(true, 'other')).toBe(100);
  });
});
