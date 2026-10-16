import { describe, it, expect, beforeEach } from 'vitest';
import { isMapTrackedEnemy, recordMapSightings, resetMapSightings, wasSeenThisRun } from './mapSightings';
import type { EnemyType } from '../types/game';

const foe = (id: string, type: EnemyType, x: number, y: number, extra: { isNamed?: boolean; corpseUntil?: number } = {}) =>
  ({ id, type, x, y, width: 40, height: 40, ...extra });
const cam = { x: 0, y: 0 }, view = { width: 400, height: 800 };

describe('地図に出す敵(THEONE_ROUND2 §2-3)', () => {
  beforeEach(() => resetMapSightings());

  it('強個体(パンプキン/削岩型/伐採人)と研究所の大型は出さない', () => {
    for (const t of ['pumpkin', 'driller', 'logger', 'lab-zombie-3'] as EnemyType[]) {
      expect(isMapTrackedEnemy({ type: t })).toBe(false);
    }
  });

  it('ボス級と宿敵は出す・死体は出さない・雑魚は出さない', () => {
    expect(isMapTrackedEnemy({ type: 'thor' })).toBe(true);
    expect(isMapTrackedEnemy({ type: 'hunter' })).toBe(true);
    expect(isMapTrackedEnemy({ type: 'zombie', isNamed: true })).toBe(true);
    expect(isMapTrackedEnemy({ type: 'zombie' })).toBe(false);
    expect(isMapTrackedEnemy({ type: 'thor', corpseUntil: 1 })).toBe(false);
  });

  it('画面に入った個体だけが「出会った」になり、出た後も記録は残る', () => {
    const near = foe('a', 'hunter', 100, 100);
    const far = foe('b', 'hunter', 5000, 5000);
    expect(recordMapSightings([near, far], cam, view, 1)).toBe(1);
    expect(wasSeenThisRun('a')).toBe(true);
    expect(wasSeenThisRun('b')).toBe(false);
    recordMapSightings([{ ...near, x: 9000 }], cam, view, 1); // 画面外へ出ても
    expect(wasSeenThisRun('a')).toBe(true);
  });

  it('引いた時(ズーム)は見える範囲が広がる', () => {
    const edge = foe('c', 'hunter', 500, 100); // 400幅の外・0.5倍なら見える
    expect(recordMapSightings([edge], cam, view, 1)).toBe(0);
    expect(recordMapSightings([edge], cam, view, 0.5)).toBe(1);
  });

  it('次の出撃で記録は空', () => {
    recordMapSightings([foe('a', 'hunter', 100, 100)], cam, view, 1);
    resetMapSightings();
    expect(wasSeenThisRun('a')).toBe(false);
  });
});
