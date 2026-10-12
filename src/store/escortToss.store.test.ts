// research/ESCORT_TOSS.md(兵士のトス)の配線テスト: tossEnemyToPlayer → updateEnemies で、プレイヤーの手前へ
// ease-out で飛んで着地し、気絶は既存のまま(=近接はとどめ)、他の押しの飛距離を変えない。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { ESCORT_TOSS_MS, ESCORT_TOSS_STOP_PX, ESCORT_TOSS_CD_MS } from '../utils/escortToss';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const enemy = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
let px = 0, py = 0;
beforeEach(() => {
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.getState().resetGame('warrior');
  const st = useGameStore.getState();
  px = st.player.x + st.player.width / 2;
  py = st.player.y + st.player.height / 2;
  useGameStore.setState(s => ({ enemies: [], player: { ...s.player, lastDirection: { x: 1, y: 0 } } }));
});
const put = (dx: number) => {
  const st = useGameStore.getState();
  const e = { ...spawnEnemyAt('zombie', px + dx - 15, py - 15, st.gameTime), width: 30, height: 30, health: 50, maxHealth: 50, speed: 0 };
  useGameStore.setState(s => ({ enemies: [...s.enemies, e] }));
  useGameStore.getState().stunEnemy(e.id, st.gameTime + 5000);
  return e.id;
};
const step = (ms: number) => {
  const st = useGameStore.getState();
  useGameStore.setState({ gameTime: st.gameTime + ms });
  useGameStore.getState().updateEnemies(ms / 1000);
};

describe('兵士のトス', () => {
  it('プレイヤーの手前まで減速しながら飛んで着地し、気絶はそのまま', () => {
    const id = put(400);
    expect(useGameStore.getState().tossEnemyToPlayer(id)).toBe(true);
    const c = () => { const e = enemy(id); return Math.hypot(e.x + 15 - px, e.y + 15 - py); };
    const d0 = c();
    step(105); const d1 = c();
    step(105); const d2 = c();
    // 前半の方が多く進む(ease-out)
    expect(d0 - d1).toBeGreaterThan(d1 - d2);
    step(ESCORT_TOSS_MS); // 着地
    const e = enemy(id);
    expect(e.escortToss).toBeUndefined();
    expect(e.escortTossLandedAt).toBeDefined();
    expect(c()).toBeCloseTo(ESCORT_TOSS_STOP_PX, 0);
    expect((e.stunUntil ?? 0) > useGameStore.getState().gameTime).toBe(true);
  });
  it('8秒以内の2回目は起きない', () => {
    const a = put(400), b = put(-400);
    expect(useGameStore.getState().tossEnemyToPlayer(a)).toBe(true);
    expect(useGameStore.getState().tossEnemyToPlayer(b)).toBe(false);
    useGameStore.setState(s => ({ gameTime: s.gameTime + ESCORT_TOSS_CD_MS }));
    expect(useGameStore.getState().tossEnemyToPlayer(b)).toBe(true);
  });
  it('トスはノックバックの欄を使わない(着地後の押しは従来どおり)', () => {
    const id = put(400);
    useGameStore.getState().tossEnemyToPlayer(id);
    step(ESCORT_TOSS_MS + 20);
    expect((enemy(id) as { knockbackMs?: number }).knockbackMs).toBeUndefined();
  });
});
