// 社長実機2026-11-11「プラントが殴ってても止まらない」: 格闘の止め(固まり)の間、プラントは弾を撃たない。発砲の時計も止まる。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { applyEnemyFire } from './combatTick';
import { spawnEnemyAt } from './enemyUtils';
import { PLANT_CLOSE_MS } from './plantShot';
import { tickEnemyClockFreeze } from './enemyClocks';
import type { Enemy } from '../types/game';

let now = 9_000_000;
const plantNear = (patch: Partial<Enemy> = {}): Enemy => {
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt('plant', 0, 0, useGameStore.getState().gameTime);
  // 閉じ切った直後=次の applyEnemyFire で撃つ状態(前に撃ってから十分経ち、閉じ始めてから PLANT_CLOSE_MS を過ぎた)。
  return { ...e, id: 'pl', x: p.x + 120, y: p.y, health: 9999, maxHealth: 9999, dormant: false, lastShot: now - 99999, shotWindupAt: now - PLANT_CLOSE_MS - 5, ...patch } as Enemy;
};
const shots = () => useGameStore.getState().projectiles.filter(p => p.hostile).length;

beforeEach(() => { now = 9_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now); useGameStore.getState().resetGame('warrior'); });
afterEach(() => { vi.restoreAllMocks(); });

describe('格闘の止めの間、プラントは弾を撃たない', () => {
  it('止まっていなければ撃つ(比べる元)', () => {
    useGameStore.setState({ enemies: [plantNear()], projectiles: [] });
    applyEnemyFire(now);
    expect(shots()).toBe(1);
  });
  it('確定の固まりの間は撃たない', () => {
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState({ enemies: [plantNear({ brLockUntil: gt + 1000 })], projectiles: [] });
    applyEnemyFire(now);
    expect(shots()).toBe(0);
  });
  it('格闘の浮きの間も撃たない', () => {
    useGameStore.setState({ enemies: [plantNear({ brLiftUntil: now + 500, liftUntil: now + 500 })], projectiles: [] });
    applyEnemyFire(now);
    expect(shots()).toBe(0);
  });
  it('止まっている間は発砲の時計が進まない(明けたら続きから)', () => {
    const gt = useGameStore.getState().gameTime;
    let e = plantNear({ brLockUntil: gt + 1000, lastShot: now - 500, shotWindupAt: undefined });
    e = { ...e, ...(tickEnemyClockFreeze(e, gt, now) ?? {}) };
    const e2 = { ...e, ...(tickEnemyClockFreeze(e, gt + 400, now + 400) ?? {}) };
    expect(e2.lastShot).toBe(now - 500 + 400); // 止まっていた 400ms ぶん後ろへずれる=「前に撃ってからの時間」は増えていない
  });
});
