// ★救難信号の1撃で敵を浮かせる(社長指示2026-11-16「救難信号も敵を浮かせる様にして」)。
// 浮き方は赤カウンターの浮き(COUNTER_LIFT_MOVE・counterLiftApplies)と同じ入れ方・同じ条件。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, RESCUE_ALLY_FLYIN_MS, RESCUE_ALLY_ARRIVE_HOLD_MS } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { brawlerAirborne } from '../utils/brawlerCombo';

let now = 9_000_000;
const mk = (type: EnemyType, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, id, health: 99999, maxHealth: 99999, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id);
/** 援護アライを1体積んで、着弾の瞬間まで時計を進めて tick する。 */
const strike = (id: string, damage = 10) => {
  const e = en(id)!;
  useGameStore.getState().spawnRescueAlly('warrior', e.x - 100, e.y, { id, x: e.x, y: e.y, footY: e.y + e.height }, damage);
  useGameStore.getState().setGameTime(useGameStore.getState().gameTime + RESCUE_ALLY_FLYIN_MS + RESCUE_ALLY_ARRIVE_HOLD_MS);
  useGameStore.getState().tickRescueAllies();
};

beforeEach(() => {
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // 連鎖を出さない
  useGameStore.getState().resetGame('warrior');
});
afterEach(() => { vi.restoreAllMocks(); });

describe('救難信号の1撃: 敵を浮かせる', () => {
  it('雑魚は浮く(空中扱い=brLiftUntil)', () => {
    useGameStore.setState({ enemies: [mk('zombie', 'z')] });
    strike('z');
    const z = en('z')!;
    expect(z.health).toBeLessThan(99999);
    expect(z.brawlerLiftAt).toBeDefined();
    expect(z.liftUntil).toBe(z.brLiftUntil);
    expect(brawlerAirborne(z, now)).toBe(true);
  });
  it('浮かない区分(終端の死神)は浮かない', () => {
    useGameStore.setState({ enemies: [mk('reaper', 'rp', { reaperChaser: true })] });
    strike('rp');
    expect(en('rp')!.brawlerLiftAt).toBeUndefined();
  });
  it('倒した一撃は浮かせない・技の最中の敵は浮かせない', () => {
    const g = useGameStore.getState().gameTime;
    useGameStore.setState({ enemies: [
      mk('zombie', 'w', { health: 1, maxHealth: 1 }),
      mk('zombie', 'b', { aiPhase: 'windup', aiPhaseUntil: g + 99999 } as Partial<Enemy>),
    ] });
    strike('w');
    expect(en('w')?.brawlerLiftAt).toBeUndefined();
    strike('b');
    expect(en('b')!.brawlerLiftAt).toBeUndefined();
  });
});
