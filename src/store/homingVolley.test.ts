// ホーミング弾の「赤サークル=タン、タン」と「当たった敵を浮かせる」(社長指示2026-11-22)の store 配線。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { HOMING_SECOND_SHOT_DELAY_MS } from '../utils/homingVolley';
import type { Enemy } from '../types/game';

const installStorage = () => {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
};

const enemyAt = (id: string, x: number, y: number, over: Partial<Enemy> = {}): Enemy => ({
  id, x, y, width: 24, height: 24, health: 100, maxHealth: 100, speed: 60,
  damage: 5, type: 'zombie', lastAttack: 0, experienceValue: 1, lastHit: 0, lastShot: 0,
  ...over,
} as unknown as Enemy);

const homingShots = () => useGameStore.getState().projectiles.filter(p => p.weaponType === 'homing-missile');

const setup = (locks: string[], enemies: Enemy[]) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(s => ({
    player: { ...s.player, subWeapons: [...s.player.subWeapons, 'homing'], subWeaponCooldowns: {} },
    enemies,
    homingLocks: locks,
    projectiles: [],
  }));
};

beforeEach(() => { installStorage(); });

describe('赤サークル(同じ敵に2ロック)の発射=タン、タン', () => {
  it('1発目はその場、2発目は間を空けてから撃つ(重ねない)', () => {
    const p = useGameStore.getState().player;
    setup(['e1', 'e1'], [enemyAt('e1', p.x + 60, p.y)]);
    const gt = useGameStore.getState().gameTime;
    useGameStore.getState().fireHoming();
    expect(homingShots()).toHaveLength(1);
    expect(useGameStore.getState().homingPendingShots).toHaveLength(1);
    expect(useGameStore.getState().homingLocks).toEqual([]);
    // まだ時刻前=撃たない
    useGameStore.setState({ gameTime: gt + HOMING_SECOND_SHOT_DELAY_MS - 1 });
    expect(useGameStore.getState().drainHomingPendingShots()).toHaveLength(0);
    expect(homingShots()).toHaveLength(1);
    // 時刻=2発目を撃つ(同じ威力・同じ敵を追う)
    useGameStore.setState({ gameTime: gt + HOMING_SECOND_SHOT_DELAY_MS });
    const fired = useGameStore.getState().drainHomingPendingShots();
    expect(fired).toHaveLength(1);
    expect(fired[0].ghostId).toBeUndefined();
    const shots = homingShots();
    expect(shots).toHaveLength(2);
    expect(shots[1].damage).toBe(shots[0].damage);
    expect(shots[1].targetEnemyId).toBe('e1');
    expect(shots[1].id).not.toBe(shots[0].id);
    expect(useGameStore.getState().homingPendingShots).toHaveLength(0);
  });

  it('1ロックの敵だけなら今どおり全部その場で撃つ', () => {
    const p = useGameStore.getState().player;
    setup(['e1', 'e2'], [enemyAt('e1', p.x + 60, p.y), enemyAt('e2', p.x - 60, p.y)]);
    useGameStore.getState().fireHoming();
    expect(homingShots()).toHaveLength(2);
    expect(useGameStore.getState().homingPendingShots).toHaveLength(0);
  });

  it('2発目の時に狙う敵が消えていても撃つ(指を離した時の向きへ直進)', () => {
    const p = useGameStore.getState().player;
    setup(['e1', 'e1'], [enemyAt('e1', p.x + 60, p.y)]);
    const gt = useGameStore.getState().gameTime;
    useGameStore.getState().fireHoming();
    useGameStore.setState({ enemies: [], gameTime: gt + HOMING_SECOND_SHOT_DELAY_MS });
    expect(useGameStore.getState().drainHomingPendingShots()).toHaveLength(1);
    const shots = homingShots();
    expect(shots).toHaveLength(2);
    expect(shots[1].targetEnemyId).toBeUndefined();
    expect(shots[1].direction.x).toBeGreaterThan(0.9);
  });

  it('リセットで待ち行列は空になる', () => {
    const p = useGameStore.getState().player;
    setup(['e1', 'e1'], [enemyAt('e1', p.x + 60, p.y)]);
    useGameStore.getState().fireHoming();
    expect(useGameStore.getState().homingPendingShots).toHaveLength(1);
    useGameStore.getState().resetGame('warrior');
    expect(useGameStore.getState().homingPendingShots).toHaveLength(0);
  });
});

describe('ホーミング弾が当たった敵を浮かせる', () => {
  it('雑魚は浮く', () => {
    setup([], [enemyAt('e1', 300, 300)]);
    useGameStore.getState().liftEnemyByHoming('e1');
    const e = useGameStore.getState().enemies[0];
    expect(e.brLiftUntil ?? 0).toBeGreaterThan(Date.now());
  });
  it('ボス級は浮かない', () => {
    setup([], [enemyAt('b1', 300, 300, { type: 'giantbat' } as Partial<Enemy>)]);
    useGameStore.getState().liftEnemyByHoming('b1');
    const e = useGameStore.getState().enemies[0];
    expect(e.brLiftUntil).toBeUndefined();
  });
});
