import { describe, it, expect, vi } from 'vitest';
import { useGameStore, CRIT_SHAKE_MAG, CRIT_LIGHT_GAP_MS } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { GLOW_R_L } from '../utils/glowTiers';

// 社長指示2026-09-13「クリティカルダメージの時は大きく画面を揺らしながら、発生源に光源(爆発と同じ原理だが、爆発ではなく光)」。
const setup = () => {
  useGameStore.getState().resetGame('warrior');
  const st = useGameStore.getState();
  return { px: st.player.x + st.player.width / 2, py: st.player.y + st.player.height / 2, gt: st.gameTime };
};
const glows = () => useGameStore.getState().effects.filter(e => e.kind === 'glow');

describe('クリティカルの揺れ+光源(spawnCritImpact)', () => {
  it('銃のクリ(damageEnemy crit=true)で大きな揺れと強glow(半径≥GLOW_R_L・投影影つき)が出る。非クリでは出ない', () => {
    const { px, py, gt } = setup();
    const id = put(px + 200, py, gt);
    useGameStore.setState({ shakeUntil: 0, shakeMag: 0 });
    useGameStore.getState().damageEnemy(id, 5, false, false, false, 'gun', 'player');
    expect(glows().length).toBe(0);
    useGameStore.getState().damageEnemy(id, 5, false, true, false, 'gun', 'player');
    const s = useGameStore.getState();
    expect(s.shakeMag).toBe(CRIT_SHAKE_MAG);
    expect(s.shakeUntil).toBeGreaterThan(Date.now() - 5);
    const g = glows();
    expect(g.length).toBe(1);
    if (g[0].kind === 'glow') { expect(g[0].radius).toBe(GLOW_R_L); expect(g[0].noShadow).toBeUndefined(); }
  });
  it('連続クリは CRIT_LIGHT_GAP_MS 以内なら光を1つに畳む(揺れは毎回)', () => {
    const { px, py, gt } = setup();
    const id = put(px + 200, py, gt);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 10_000); // 前のテストの畳み込み窓を抜ける
    try {
      useGameStore.getState().spawnCritImpact(px + 200, py);
      useGameStore.getState().spawnCritImpact(px + 210, py);
      expect(glows().length).toBe(1);
    } finally { vi.useRealTimers(); }
    expect(CRIT_LIGHT_GAP_MS).toBeGreaterThan(0);
    void id;
  });
  it('護衛の弾(channel null)や守護霊(ghost)のクリでは出ない', () => {
    const { px, py, gt } = setup();
    const id = put(px + 200, py, gt);
    useGameStore.getState().damageEnemy(id, 5, false, true, false, null, 'player');
    useGameStore.getState().damageEnemy(id, 5, false, true, false, 'gun', 'ghost');
    expect(glows().length).toBe(0);
  });
});

function put(x: number, y: number, gt: number): string {
  const e = { ...spawnEnemyAt('zombie', x, y, gt), health: 100000, maxHealth: 100000 };
  useGameStore.setState(s => ({ enemies: [...s.enemies, e] }));
  return e.id;
}
