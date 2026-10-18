// research/NEW_GUNS.md §3(衛星弾)の純関数。§7-2「動くと溜まり、回っている間も触れた敵に当たり、止まると近い敵へ散って飛ぶ」。
import { describe, it, expect } from 'vitest';
import {
  SAT_ADD_MS, SAT_MAX, SAT_RELEASE_IDLE_MS, SAT_CONTACT_CD_MS, SAT_ORBIT_RADIUS_PX, SAT_SHOT_RANGE_PX, SAT_SHOT_SPEED_PX_PER_SEC,
  SAT_SHOT_DURATION_MS, emptySatelliteOrbit, stepSatelliteOrbit, satelliteTargetRevPerSec, satelliteBulletPoses,
  satelliteContactReady, assignSatelliteTargets, satelliteTouchesRect, type SatelliteOrbit,
} from './satelliteOrbit';

const MOVE = { moving: true, held: false, locked: false };
const STOP = { moving: false, held: false, locked: false };
const step = (o: SatelliteOrbit, ms: number, input = MOVE, gt = 0) => stepSatelliteOrbit(o, ms, input, gt, 0, 0);

describe('溜まり方', () => {
  it('動いている間、350msごとに1つ増え、最大8個', () => {
    let o = emptySatelliteOrbit();
    o = step(o, SAT_ADD_MS - 1).orbit;
    expect(o.slots.length).toBe(0);
    o = step(o, 1).orbit;
    expect(o.slots.length).toBe(1);
    o = step(o, SAT_ADD_MS * 3).orbit;
    expect(o.slots.length).toBe(4);
    o = step(o, SAT_ADD_MS * 20).orbit;
    expect(o.slots.length).toBe(SAT_MAX);
  });
  it('押されて動いている/振っている間(held)は増えず、放ちもしない', () => {
    let o = step(emptySatelliteOrbit(), SAT_ADD_MS * 2).orbit;
    const r = step(o, 1000, { moving: false, held: true, locked: false });
    expect(r.release).toBeNull();
    expect(r.orbit.slots.length).toBe(2);
    o = r.orbit;
    expect(o.idleMs).toBe(0);
  });
  it('撃てない状態(locked)は溜めも放出もしない', () => {
    const o = step(emptySatelliteOrbit(), SAT_ADD_MS * 2).orbit;
    const r = step(o, 1000, { moving: false, held: false, locked: true });
    expect(r.release).toBeNull();
    expect(r.orbit.slots.length).toBe(2);
  });
});

describe('回る速さ', () => {
  it('1個=毎秒1周、8個=毎秒1.6周(溜まるほど速い)', () => {
    expect(satelliteTargetRevPerSec(1)).toBeCloseTo(1);
    expect(satelliteTargetRevPerSec(SAT_MAX)).toBeCloseTo(1.6);
    expect(satelliteTargetRevPerSec(4)).toBeGreaterThan(1);
    expect(satelliteTargetRevPerSec(4)).toBeLessThan(1.6);
  });
  it('回り始めは加速して目標へ寄る(瞬間に最高速にならない=慣性)', () => {
    const o = step(emptySatelliteOrbit(), SAT_ADD_MS).orbit;
    const r1 = step(o, 16).orbit;
    expect(r1.angVel).toBeGreaterThan(0);
    expect(r1.angVel).toBeLessThan(Math.PI * 2);
    let r = r1;
    for (let i = 0; i < 200; i++) r = step(r, 16).orbit;
    expect(r.angVel).toBeCloseTo(Math.PI * 2 * satelliteTargetRevPerSec(r.slots.length), 1);
  });
  it('弾は半径64へ出て並ぶ', () => {
    let o = step(emptySatelliteOrbit(), SAT_ADD_MS * 4, MOVE, 0).orbit;
    o = step(o, 1000, MOVE, 2000).orbit;
    const poses = satelliteBulletPoses(o, 0, 0, 3000);
    for (const p of poses) expect(Math.hypot(p.x, p.y)).toBeCloseTo(SAT_ORBIT_RADIUS_PX, 0);
  });
});

describe('止まって放つ', () => {
  it('移動の入力が無くなって0.15秒で全部を放ち、軌道は空になる', () => {
    let o = step(emptySatelliteOrbit(), SAT_ADD_MS * 5).orbit;
    let r = step(o, SAT_RELEASE_IDLE_MS - 1, STOP);
    expect(r.release).toBeNull();
    o = r.orbit;
    r = step(o, 1, STOP);
    expect(r.release).not.toBeNull();
    expect(r.release!.length).toBe(5);
    expect(r.orbit.slots.length).toBe(0);
  });
  it('放った弾は射程200(秒速380×寿命)', () => {
    expect(SAT_SHOT_SPEED_PX_PER_SEC * SAT_SHOT_DURATION_MS / 1000).toBeCloseTo(SAT_SHOT_RANGE_PX, -1);
  });
  it('近い敵へ散る: 敵が複数なら1体に寄らない', () => {
    const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const ids = assignSatelliteTargets(angles, [{ id: 'a', azimuthRad: 0 }, { id: 'b', azimuthRad: Math.PI }]);
    expect(ids.filter(x => x === 'a').length).toBe(2);
    expect(ids.filter(x => x === 'b').length).toBe(2);
    expect(ids[0]).toBe('a'); // 向きの近い方へ
    expect(ids[2]).toBe('b');
  });
  it('敵が居なければ誘導なし', () => {
    expect(assignSatelliteTargets([0, 1], [])).toEqual([undefined, undefined]);
  });
});

describe('回っている弾も当たる(敵ごとに400ms)', () => {
  it('触れているかは弾の円と敵の矩形で決まる', () => {
    expect(satelliteTouchesRect(64, 0, { x: 60, y: -10, width: 20, height: 20 })).toBe(true);
    expect(satelliteTouchesRect(64, 0, { x: 90, y: -10, width: 20, height: 20 })).toBe(false);
  });
  it('同じ敵へは400msに1回', () => {
    expect(satelliteContactReady(undefined, 0)).toBe(true);
    expect(satelliteContactReady(1000, 1000 + SAT_CONTACT_CD_MS - 1)).toBe(false);
    expect(satelliteContactReady(1000, 1000 + SAT_CONTACT_CD_MS)).toBe(true);
  });
});
