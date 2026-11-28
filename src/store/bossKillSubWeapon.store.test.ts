// ボスを倒した一撃がサブウェポンなら、死体の印 bySubWeapon が立つ(描画の放射状の流れを出さない・research/BLUR.md §2-5)。
import { describe, it, expect } from 'vitest';
import { useGameStore } from './gameStore';
import { withMastery } from '../utils/masteryRun';
import { spawnEnemyAt } from '../utils/enemyUtils';

const kill = (source: 'heavy-grenade' | 'katana' | null): boolean | undefined => {
  useGameStore.getState().resetGame('assault');
  const s0 = useGameStore.getState();
  const e = { ...spawnEnemyAt('thor', 0, 0, s0.gameTime), x: s0.player.x + 200, y: s0.player.y, id: 'boss', health: 1, maxHealth: 10, dormant: false };
  useGameStore.setState({ enemies: [e], bossCorpse: null });
  const hit = () => useGameStore.getState().damageEnemy('boss', 1e9, false, false, true);
  if (source) withMastery(source, hit); else hit();
  return useGameStore.getState().bossCorpse?.bySubWeapon;
};

describe('store: ボス撃破の死体の印 bySubWeapon', () => {
  it('サブウェポンの出どころの中で倒すと true', () => {
    expect(kill('heavy-grenade')).toBe(true);
  }, 60000);
  it('刀(自分で振る近接)・出どころ無しで倒すと false', () => {
    expect(kill('katana')).toBe(false);
    expect(kill(null)).toBe(false);
  }, 60000);
});
