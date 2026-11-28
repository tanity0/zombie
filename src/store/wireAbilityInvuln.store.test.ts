// ★ワイヤーの叩きつけ・ダッシュ・ホップの空中の無敵は「技の無敵」(abilityInvulnUntil)=sourceId 付きの攻撃(噛みつき・掴み)も受けない。
// 無敵の長さは各技の今の無敵と同じ(WIRE_SLAM_MS / WIRE_DASH_MS / WIRE_HOP_MS)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, WIRE_SLAM_MS, WIRE_DASH_MS, WIRE_HOP_MS } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';

let now = 7_000_000;
beforeEach(() => { now = 7_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now); vi.spyOn(Math, 'random').mockReturnValue(0.99); });
afterEach(() => { vi.restoreAllMocks(); });

const setup = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    enemies: [],
    player: { ...st.player, health: 100, maxHealth: 100, invulnerable: false, invulnerableTime: 0, subWeapons: ['wire-anchor'], subWeaponLevels: { 'wire-anchor': 1 }, subWeaponCooldowns: {} },
  }));
};
/** sourceId 付きの噛みつき(被弾の無敵は敵ごとにしか見ない経路)。減ったHPを返す。毎回別の敵=被弾の無敵には弾かれない。 */
let biteN = 0;
const bite = (): number => {
  const p = useGameStore.getState().player;
  const hp = p.health;
  const id = `b${++biteN}`;
  useGameStore.getState().damagePlayer(10, '噛みつき', p.x + p.width / 2 + 20, p.y + p.height / 2, undefined, undefined, undefined, id, id);
  return hp - useGameStore.getState().player.health;
};

describe('ワイヤーの空中の無敵は sourceId 付きの攻撃も受けない', () => {
  it('叩きつけ', () => {
    setup();
    const p = useGameStore.getState().player;
    const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
    e.x = p.x + p.width / 2 + 80 - e.width / 2; e.y = p.y + p.height / 2 - e.height / 2; e.health = 99999; e.maxHealth = 99999; e.id = 'z';
    useGameStore.setState({ enemies: [e] });
    expect(useGameStore.getState().triggerWireAnchor(1, 0)).toBe(true);
    expect(useGameStore.getState().player.abilityInvulnUntil).toBe(now + WIRE_SLAM_MS);
    now += WIRE_SLAM_MS - 10;
    expect(bite()).toBe(0);
    now += 20;
    expect(bite()).toBeGreaterThan(0);
  });
  it('ダッシュ', () => {
    setup();
    const p = useGameStore.getState().player;
    useGameStore.setState(st => ({ player: { ...st.player, wireAnchored: true, wireAnchorX: p.x + 200, wireAnchorY: p.y } }));
    useGameStore.getState().startWireDash();
    expect(useGameStore.getState().player.abilityInvulnUntil).toBe(now + WIRE_DASH_MS);
    now += WIRE_DASH_MS - 10;
    expect(bite()).toBe(0);
    now += 20;
    expect(bite()).toBeGreaterThan(0);
  });
  it('ホップ', () => {
    setup();
    const p = useGameStore.getState().player;
    useGameStore.getState().startWireHop(p.x + 150, p.y);
    expect(useGameStore.getState().player.abilityInvulnUntil).toBe(now + WIRE_HOP_MS);
    now += WIRE_HOP_MS - 10;
    expect(bite()).toBe(0);
    now += 20;
    expect(bite()).toBeGreaterThan(0);
  });
});
