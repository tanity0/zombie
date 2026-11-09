import { describe, it, expect, beforeEach } from 'vitest';
import { isMapTrackedEnemy, recordMapSightings, resetMapSightings, wasSeenThisRun, mapThreatPositions } from './mapSightings';
import type { EnemyType } from '../types/game';

const foe = (id: string, type: EnemyType, x: number, y: number, extra: { isNamed?: boolean; corpseUntil?: number } = {}) =>
  ({ id, type, x, y, width: 40, height: 40, ...extra });
const cam = { x: 0, y: 0 }, view = { width: 400, height: 800 };

describe('地図に出す敵(THEONE_ROUND2 §2-3)', () => {
  beforeEach(() => resetMapSightings());

  it('強個体(パンプキン/削岩型/伐採人)・研究所の大型・ハンター・死神は出さない', () => {
    for (const t of ['pumpkin', 'driller', 'logger', 'lab-zombie-3', 'hunter', 'reaper'] as EnemyType[]) {
      expect(isMapTrackedEnemy({ type: t })).toBe(false);
    }
  });

  it('ボス級と宿敵は出す・死体は出さない・雑魚は出さない', () => {
    expect(isMapTrackedEnemy({ type: 'thor' })).toBe(true);
    expect(isMapTrackedEnemy({ type: 'giantbat' })).toBe(true);
    expect(isMapTrackedEnemy({ type: 'zombie', isNamed: true })).toBe(true);
    expect(isMapTrackedEnemy({ type: 'zombie' })).toBe(false);
    expect(isMapTrackedEnemy({ type: 'thor', corpseUntil: 1 })).toBe(false);
  });

  it('画面に入った個体だけが「出会った」になり、出た後も記録は残る', () => {
    const near = foe('a', 'giantbat', 100, 100);
    const far = foe('b', 'giantbat', 5000, 5000);
    expect(recordMapSightings([near, far], cam, view, 1)).toBe(1);
    expect(wasSeenThisRun({ id: 'a', type: 'giantbat' })).toBe(true);
    expect(wasSeenThisRun({ id: 'b', type: 'giantbat' })).toBe(false);
    recordMapSightings([{ ...near, x: 9000 }], cam, view, 1); // 画面外へ出ても
    expect(wasSeenThisRun({ id: 'a', type: 'giantbat' })).toBe(true);
  });

  it('引いた時(ズーム)は見える範囲が広がる', () => {
    const edge = foe('c', 'giantbat', 500, 100); // 400幅の外・0.5倍なら見える
    expect(recordMapSightings([edge], cam, view, 1)).toBe(0);
    expect(recordMapSightings([edge], cam, view, 0.5)).toBe(1);
  });

  it('裏ボスは巣へ帰って別IDで出直しても出会ったまま', () => {
    recordMapSightings([foe('t1', 'thor', 100, 100)], cam, view, 1);
    expect(wasSeenThisRun({ id: 't2', type: 'thor' })).toBe(true);
  });

  it('次の出撃で記録は空', () => {
    recordMapSightings([foe('a', 'giantbat', 100, 100)], cam, view, 1);
    resetMapSightings();
    expect(wasSeenThisRun({ id: 'a', type: 'giantbat' })).toBe(false);
  });
});

describe('出会ったボスは一覧から消えても地図に出し続ける(社長指示2026-11-09)', () => {
  beforeEach(() => resetMapSightings());
  it('一覧に居れば今の位置・消えたら最後に見えていた位置', () => {
    const b = foe('a', 'giantbat', 100, 100);
    recordMapSightings([b], cam, view, 1);
    recordMapSightings([{ ...b, x: 3000 }], cam, view, 1); // 画面外へ動いた(位置は書き留める)
    expect(mapThreatPositions([{ ...b, x: 3200 }])).toEqual([{ x: 3220, y: 120 }]); // 居る=今の位置
    expect(mapThreatPositions([])).toEqual([{ x: 3020, y: 120 }]); // 消えた=最後の位置
  });
  it('出会っていない物は出さない', () => {
    recordMapSightings([foe('b', 'giantbat', 5000, 5000)], cam, view, 1);
    expect(mapThreatPositions([])).toEqual([]);
  });
  it('倒した物(最後に見た体力が0以下)は出さない', () => {
    const b = { ...foe('a', 'thor', 100, 100), health: 50 };
    recordMapSightings([b], cam, view, 1);
    recordMapSightings([{ ...b, health: 0 }], cam, view, 1);
    expect(mapThreatPositions([])).toEqual([]);
  });
  it('城ボスの急降下の溜め(場外へ退避)の間は最後の位置', () => {
    const b = { ...foe('a', 'thor', 100, 100), health: 50 };
    recordMapSightings([b], cam, view, 1);
    const away = { ...b, x: -99999, aiPhase: 'g-dive-windup' as const };
    recordMapSightings([away], cam, view, 1);
    expect(mapThreatPositions([away])).toEqual([{ x: 120, y: 120 }]);
  });
  it('出撃をやり直すと消える', () => {
    recordMapSightings([foe('a', 'giantbat', 100, 100)], cam, view, 1);
    resetMapSightings();
    expect(mapThreatPositions([])).toEqual([]);
  });
});
