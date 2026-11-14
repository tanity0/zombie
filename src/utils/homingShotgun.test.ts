import { describe, it, expect } from 'vitest';
import {
  assignHomingShotgunTargetsByAzimuth, homingPelletTurnRateRadPerSec, HOMING_PELLET_TURN_RADIUS_PX,
  HOMING_PELLET_LAUNCH_SPREAD_RAD, HOMING_PELLET_LAUNCH_JITTER_RAD, HOMING_PELLET_STRAIGHT_MS, HOMING_PELLET_TURN_RAMP_MS,
  homingPelletLaunchJitterRad, homingPelletTurnRampFactor, stepHomingPelletAngle,
} from './homingShotgun';

describe('homingPelletTurnRateRadPerSec(旋回半径40px相当を弾速から導く)', () => {
  it('弾速705px/s(=470×1.5)なら 705/40 = 17.625rad/s', () => {
    expect(homingPelletTurnRateRadPerSec(705)).toBeCloseTo(705 / 40, 6);
    expect(homingPelletTurnRateRadPerSec(705)).toBeCloseTo(17.625, 3);
  });

  it('誘導ロケット相当(弾速200px/s・旋回5rad/s)と同じ半径になる', () => {
    // radius = speed / turnRate。ロケット: 200/5=40。ペレットの式も同じ半径40pxを再現する。
    const rocketRadius = 200 / 5;
    expect(rocketRadius).toBe(HOMING_PELLET_TURN_RADIUS_PX);
    const pelletTurnRate = homingPelletTurnRateRadPerSec(705);
    expect(705 / pelletTurnRate).toBeCloseTo(HOMING_PELLET_TURN_RADIUS_PX, 6);
  });

  it('弾速0以下は0(旋回しようがない)', () => {
    expect(homingPelletTurnRateRadPerSec(0)).toBe(0);
    expect(homingPelletTurnRateRadPerSec(-10)).toBe(0);
  });
});

describe('assignHomingShotgunTargetsByAzimuth(方位で組む対象割り振り)', () => {
  it('対象なし(0体)なら全弾undefined', () => {
    const result = assignHomingShotgunTargetsByAzimuth([-0.6, -0.3, 0, 0.3, 0.6], []);
    expect(result).toHaveLength(5);
    expect(result.every(id => id === undefined)).toBe(true);
  });

  it('1体だけなら全弾が同じ1体に集中する(UNIQUE_WEAPONS.md §16-2「1体なら全弾集中」)', () => {
    const result = assignHomingShotgunTargetsByAzimuth([-0.6, -0.3, 0, 0.3, 0.6], [{ id: 'e1', azimuthRad: 0.2 }]);
    expect(result).toHaveLength(5);
    expect(result.every(id => id === 'e1')).toBe(true);
  });

  it('複数体なら方位角の順に、拡散角の順のペレットを対応させる(左のペレット→左の敵)', () => {
    // ペレット拡散角3発と対象3体で1:1対応させ、対応の向きを見る(対象は方位角バラバラな順で渡す)。
    const result = assignHomingShotgunTargetsByAzimuth(
      [-0.6, 0, 0.6],
      [
        { id: 'right', azimuthRad: 1.5 },  // 真右寄り(最大)
        { id: 'left', azimuthRad: -1.5 },  // 真左寄り(最小)
        { id: 'center', azimuthRad: 0 },
      ],
    );
    expect(result[0]).toBe('left');   // 一番左のペレット → 一番左寄りの敵
    expect(result[1]).toBe('center');
    expect(result[2]).toBe('right');  // 一番右のペレット → 一番右寄りの敵
  });

  it('真横の敵にも端ではないペレットが対応しうる(方位で組むことで曲がり切れる範囲に収まる)', () => {
    // 3体を方位角で並べ、5発を均等に近い方位へ対応させる=round-robinは維持。
    const result = assignHomingShotgunTargetsByAzimuth(
      [-0.6, -0.3, 0, 0.3, 0.6],
      [{ id: 'a', azimuthRad: -0.5 }, { id: 'b', azimuthRad: 0 }, { id: 'c', azimuthRad: 0.5 }],
    );
    expect(result).toEqual(['a', 'b', 'c', 'a', 'b']);
  });

  it('count=0(空のペレット配列)なら空配列', () => {
    expect(assignHomingShotgunTargetsByAzimuth([], [{ id: 'a', azimuthRad: 0 }])).toEqual([]);
  });
});

describe('撃ち出しの扇+慣性つきの誘導(社長指示2026-11-13)', () => {
  it('撃ち出しの扇が広がっている(全幅が約20〜25度・粒が同じ向きにならない)', async () => {
    const { computeShotAngleOffsets, createWeapon } = await import('./weaponUtils');
    const offsets = computeShotAngleOffsets(createWeapon('shotgun-t3-homing'));
    expect(offsets.length).toBe(9);
    const width = offsets[offsets.length - 1] - offsets[0];
    expect(width).toBeCloseTo(HOMING_PELLET_LAUNCH_SPREAD_RAD, 6);
    expect(width * 180 / Math.PI).toBeGreaterThanOrEqual(20);
    expect(width * 180 / Math.PI).toBeLessThanOrEqual(25);
    expect(new Set(offsets.map(o => o.toFixed(4))).size).toBe(9);
  });

  it('粒ごとのばらつきは上限内で、扇の並び順(割り振り)を入れ替えない', () => {
    expect(homingPelletLaunchJitterRad(() => 0)).toBeCloseTo(-HOMING_PELLET_LAUNCH_JITTER_RAD, 9);
    expect(homingPelletLaunchJitterRad(() => 0.5)).toBeCloseTo(0, 9);
    expect(homingPelletLaunchJitterRad(() => 0.999999)).toBeLessThanOrEqual(HOMING_PELLET_LAUNCH_JITTER_RAD);
    const step = HOMING_PELLET_LAUNCH_SPREAD_RAD / 8;
    expect(HOMING_PELLET_LAUNCH_JITTER_RAD * 2).toBeLessThan(step);
  });

  it('撃ち出し直後は曲がらない(真っすぐの間は倍率0)', () => {
    expect(homingPelletTurnRampFactor(0)).toBe(0);
    expect(homingPelletTurnRampFactor(HOMING_PELLET_STRAIGHT_MS)).toBe(0);
    const a = stepHomingPelletAngle(0, Math.PI / 2, 17.6 * homingPelletTurnRampFactor(30), 1 / 60);
    expect(a).toBe(0);
  });

  it('曲がる速さは時間でなめらかに強まり、上がり切ったら全速(単調・0→1)', () => {
    let prev = 0;
    for (let ms = HOMING_PELLET_STRAIGHT_MS; ms <= HOMING_PELLET_STRAIGHT_MS + HOMING_PELLET_TURN_RAMP_MS + 50; ms += 10) {
      const f = homingPelletTurnRampFactor(ms);
      expect(f).toBeGreaterThanOrEqual(prev);
      expect(f).toBeLessThanOrEqual(1);
      prev = f;
    }
    expect(homingPelletTurnRampFactor(HOMING_PELLET_STRAIGHT_MS + HOMING_PELLET_TURN_RAMP_MS)).toBe(1);
    // 上がり始めは小さい(急に折れない)
    expect(homingPelletTurnRampFactor(HOMING_PELLET_STRAIGHT_MS + 20)).toBeLessThan(0.1);
    // 発射時刻を持たない弾は従来どおり全速
    expect(homingPelletTurnRampFactor(undefined)).toBe(1);
  });

  it('1フレームで曲がる角度に上限がある(行き過ぎない)', () => {
    const rate = homingPelletTurnRateRadPerSec(705);
    const dt = 1 / 60;
    const a = stepHomingPelletAngle(0, Math.PI / 2, rate, dt);
    expect(a).toBeCloseTo(rate * dt, 9);
    expect(a).toBeLessThan(Math.PI / 2);
    // 目標が上限より近ければぴったり目標で止まる
    expect(stepHomingPelletAngle(0, 0.01, rate, dt)).toBeCloseTo(0.01, 9);
    // 近い回り方を取る(+170度→-170度は+20度ぶん回る向き)
    const b = stepHomingPelletAngle(170 * Math.PI / 180, -170 * Math.PI / 180, rate, dt);
    expect(b).toBeGreaterThan(170 * Math.PI / 180);
  });

  it('最終的に目標の方へ向く(直角の目標へ、時間を追って追いつく)', () => {
    const rate = homingPelletTurnRateRadPerSec(705);
    const dt = 1 / 60;
    let angle = 0;
    const target = Math.PI / 2;
    for (let ms = 0; ms < 1000; ms += dt * 1000) {
      angle = stepHomingPelletAngle(angle, target, rate * homingPelletTurnRampFactor(ms), dt);
    }
    expect(angle).toBeCloseTo(target, 6);
  });
});
