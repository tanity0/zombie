// research/NEW_GUNS.md §3(衛星弾)の純関数。§7-2「動くと溜まり、回っている間も触れた敵に当たり、止まると近い敵へ散って飛ぶ」。
import { describe, it, expect } from 'vitest';
import { SCAN_FAN_GROUND_Y_SCALE } from './scanSensor';
import {
  SAT_ADD_MS, SAT_MAX, SAT_RELEASE_IDLE_MS, SAT_CONTACT_CD_MS, SAT_ORBIT_RADIUS_PX, SAT_SHOT_RANGE_PX, SAT_SHOT_SPEED_PX_PER_SEC,
  SAT_SHOT_DURATION_MS, emptySatelliteOrbit, stepSatelliteOrbit, satelliteTargetRevPerSec, satelliteBulletPoses,
  satelliteContactReady, assignSatelliteTargets, satelliteTouchesRect, type SatelliteOrbit,
  SAT_ORBIT_Y_SCALE, SAT_BULLET_RADIUS_PX, satelliteOrbitPoint, satelliteReleaseDir,
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
  it('弾は地面の楕円(横64・縦64×0.36)へ出て並ぶ', () => {
    let o = step(emptySatelliteOrbit(), SAT_ADD_MS * 4, MOVE, 0).orbit;
    o = step(o, 1000, MOVE, 2000).orbit;
    const poses = satelliteBulletPoses(o, 0, 0, 3000);
    for (const p of poses) expect(Math.hypot(p.x, p.y / SAT_ORBIT_Y_SCALE)).toBeCloseTo(SAT_ORBIT_RADIUS_PX, 0);
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

// 社長承認2026-10-18: 回る輪を地面に倒した楕円にする(絵と当たり判定は同じ satelliteOrbitPoint で位置を作る)。
describe('地面に倒した楕円の軌道', () => {
  const R = SAT_ORBIT_RADIUS_PX;
  const orbitAt = (angle: number): SatelliteOrbit => ({ slots: [{ phase: 0, bornAt: -1e6 }], angle, angVel: Math.PI * 2, accumMs: 0, idleMs: 0 });
  it('縦の潰し率は扇・印と同じ', () => {
    expect(SAT_ORBIT_Y_SCALE).toBe(SCAN_FAN_GROUND_Y_SCALE);
  });
  it('判定の玉の位置 = 絵の点(satelliteOrbitPoint)と一致(全周)', () => {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const [pose] = satelliteBulletPoses(orbitAt(a), 100, 200, 0);
      const q = satelliteOrbitPoint(100, 200, a, R);
      expect(pose.x).toBeCloseTo(q.x, 9);
      expect(pose.y).toBeCloseTo(q.y, 9);
    }
  });
  // 根元(0,0)=足元。敵は足元(下辺)を根元と同じ高さ付近に置いた小さな矩形で、玉が通る位置に置いて当たる/外して当たらないを見る。
  const rectAt = (x: number, footY: number) => ({ x: x - 4, y: footY - 16, width: 8, height: 16 });
  const touchesAny = (rect: ReturnType<typeof rectAt>): boolean => {
    for (let k = 0; k < 360; k++) {
      const [p] = satelliteBulletPoses(orbitAt((k / 360) * Math.PI * 2), 0, 0, 0);
      if (satelliteTouchesRect(p.x, p.y, rect)) return true;
    }
    return false;
  };
  it('左右は半径64まで届く(64+玉の半径の外は当たらない)', () => {
    for (const s of [-1, 1]) {
      expect(touchesAny(rectAt(s * R, 0))).toBe(true);
      expect(touchesAny(rectAt(s * (R + SAT_BULLET_RADIUS_PX + 4 + 1), 0))).toBe(false);
    }
  });
  it('上下は 64×0.36 まで(真円の64には届かない)', () => {
    const ry = R * SAT_ORBIT_Y_SCALE;
    // 下: 玉が足元の下 ry を通る。矩形の上辺がそこに掛かれば当たる。
    expect(touchesAny({ x: -4, y: ry - 2, width: 8, height: 16 })).toBe(true);
    expect(touchesAny({ x: -4, y: ry + SAT_BULLET_RADIUS_PX + 1, width: 8, height: 16 })).toBe(false);
    // 上: 足元が上 ry にある敵には当たり、真円の64の位置(足元の上64)の敵には当たらない。
    expect(touchesAny(rectAt(0, -ry))).toBe(true);
    expect(touchesAny(rectAt(0, -R))).toBe(false);
  });
  it('放つ向き: 外向き=根元から玉への向き、接線の勢いは楕円の上のその位置の速さ(左右で遅く上下で速い)', () => {
    const [right] = satelliteBulletPoses(orbitAt(0), 0, 0, 0);
    const [bottom] = satelliteBulletPoses(orbitAt(Math.PI / 2), 0, 0, 0);
    expect(right.rx).toBeCloseTo(1, 9); expect(bottom.ry).toBeCloseTo(1, 9);
    expect(right.tk).toBeCloseTo(SAT_ORBIT_Y_SCALE, 9); // 右端では縦に動く=潰れた分だけ遅い
    expect(bottom.tk).toBeCloseTo(1, 9);
    // 速く回っていた時は接線側へ流れて出る(右端=下向きへ、下端=左向きへ。正の回転)。
    const dR = satelliteReleaseDir(right, Math.PI * 2 * 1.6);
    const dB = satelliteReleaseDir(bottom, Math.PI * 2 * 1.6);
    expect(dR.x).toBeGreaterThan(0.9); expect(dR.y).toBeGreaterThan(0);
    expect(dB.y).toBeGreaterThan(0.7); expect(dB.x).toBeLessThan(0);
    expect(Math.abs(dB.x)).toBeGreaterThan(Math.abs(dR.y)); // 上下の位置の方が勢いが強い
  });
});
