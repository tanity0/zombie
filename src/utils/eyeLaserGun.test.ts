import { describe, it, expect } from 'vitest';
import {
  eyeLaserCycleDps, eyeLaserEffectiveReloadMs, EYE_LASER_PULSES_PER_FIRE, EYE_LASER_PULSE_DAMAGE, EYE_LASER_HALFWIDTH,
  stepEyeLaserAim, shortestAngleDiff, EYE_LASER_AIM_MAX_RATE_RAD_PER_SEC, type EyeLaserAim,
} from './eyeLaserGun';
import { createWeapon } from './weaponUtils';

describe('eyeLaserGun(アイレーザー・UNIQUE_WEAPONS.md §5-2/§16-1)', () => {
  it('EYE_LASER_PULSES_PER_FIRE = 30(3000ms÷100ms)', () => {
    expect(EYE_LASER_PULSES_PER_FIRE).toBe(30);
  });

  it('実効リロード(raw2500ms)は既存武器と同じ×2規則(effectiveReloadMs)で5000msになる', () => {
    expect(eyeLaserEffectiveReloadMs(2500)).toBe(5000);
  });

  // ★社長裁定2026-11-12「慣性を持たせて速度を落とす」「その分ダメージ量はあげてください」:
  // 1パルス14→20。照射が遅れて外れるパルスが出る前提なので、旧来の「既定rifle-t3(45.83)の±10%帯」
  // からは外れる(+50.5%)。ここで固定するのは「全パルスが当たった時の上限」。
  it('1パルス20ダメージ(CATALOGと同値)・全弾当たった時の1サイクル実効DPSの上限は68.97', () => {
    expect(EYE_LASER_PULSE_DAMAGE).toBe(20);
    expect(createWeapon('rifle-t3-eyelaser').damage).toBe(EYE_LASER_PULSE_DAMAGE);
    expect(eyeLaserCycleDps(EYE_LASER_PULSE_DAMAGE)).toBeCloseTo(68.97, 1); // 600 / 8.7秒
  });

  it('旧「1tick8」は帯を大きく割っていた(§16-1の記録どおり)', () => {
    const dps = eyeLaserCycleDps(8);
    const ratio = dps / 45.83;
    expect(ratio).toBeLessThan(0.90); // 枠外(-39.8%相当)
  });
});

// ★社長裁定2026-11-12: 照射中はずっとこの1本の慣性つきの振りで追う(最大≈69°/s・張り付かない)。
// 等速で振らない(慣性MUST)=出だしで加速し、終わりで減速して収まることを固定する。
describe('stepEyeLaserAim(照射中の慣性つきの振り)', () => {
  const DT = 1 / 60;
  const run = (aim: EyeLaserAim, target: (t: number) => number | null, frames: number, cb?: (s: ReturnType<typeof stepEyeLaserAim>, i: number) => void) => {
    let a = aim;
    for (let i = 0; i < frames; i++) {
      const s = stepEyeLaserAim(a, target(i * DT), DT);
      cb?.(s, i);
      a = { angle: s.angle, vel: s.vel };
    }
    return a;
  };

  it('最大の角速度は1.2rad/s(毎秒約69度)', () => {
    expect(EYE_LASER_AIM_MAX_RATE_RAD_PER_SEC).toBeCloseTo(1.2, 6);
  });

  it('出だしは加速する(1フレーム目の角速度は最大値よりずっと小さい)', () => {
    const s = stepEyeLaserAim({ angle: 0, vel: 0 }, Math.PI / 2, DT);
    expect(s.vel).toBeGreaterThan(0);
    expect(s.vel).toBeLessThan(EYE_LASER_AIM_MAX_RATE_RAD_PER_SEC * 0.2);
    expect(s.settled).toBe(false);
  });

  it('角速度は最大値を超えない', () => {
    run({ angle: 0, vel: 0 }, () => Math.PI, 300, (s) => {
      expect(Math.abs(s.vel)).toBeLessThanOrEqual(EYE_LASER_AIM_MAX_RATE_RAD_PER_SEC + 1e-6);
    });
  });

  it('等速ではない: 途中は最大速まで上がり、収まる直前は減速している', () => {
    const vels: number[] = [];
    run({ angle: 0, vel: 0 }, () => Math.PI / 2, 180, (s) => vels.push(s.vel));
    expect(Math.max(...vels)).toBeCloseTo(EYE_LASER_AIM_MAX_RATE_RAD_PER_SEC, 3);
    expect(vels[0]).toBeLessThan(vels[30]); // 加速
    expect(vels[100]).toBeLessThan(EYE_LASER_AIM_MAX_RATE_RAD_PER_SEC * 0.5); // 終わりは減速
  });

  it('止まった状態から90度の振りは約1.8秒(1.6〜2.0秒)で収まり、大きく揺り戻さない', () => {
    let settledAt = -1;
    let overshoot = 0;
    run({ angle: 0, vel: 0 }, () => Math.PI / 2, 360, (s, i) => {
      if (settledAt < 0 && s.settled) settledAt = (i + 1) * DT;
      overshoot = Math.max(overshoot, s.angle - Math.PI / 2);
    });
    expect(settledAt).toBeGreaterThanOrEqual(1.6);
    expect(settledAt).toBeLessThanOrEqual(2.0);
    expect(overshoot).toBeLessThan(0.02); // ≈1度未満
  });

  it('合った後に目標が動いても張り付かず、同じ慣性で追い直す', () => {
    const settled = run({ angle: 0, vel: 0 }, () => 0, 30);
    expect(settled.angle).toBeCloseTo(0, 6);
    // 目標が一瞬で60度ずれる → 1フレーム目はほとんど動かない(直接狙うなら一気に60度)
    const s1 = stepEyeLaserAim(settled, Math.PI / 3, DT);
    expect(s1.angle).toBeLessThan(0.01);
    // 0.5秒後もまだ追いついていない(最大69°/sを超えて動かない)
    const after = run(settled, () => Math.PI / 3, 30);
    expect(after.angle).toBeGreaterThan(0.05);
    expect(after.angle).toBeLessThan(EYE_LASER_AIM_MAX_RATE_RAD_PER_SEC * 0.5 + 1e-6);
  });

  it('標的が居ない(null)時は同じ慣性で減速して止まり、その向きのまま', () => {
    const s1 = stepEyeLaserAim({ angle: 0, vel: EYE_LASER_AIM_MAX_RATE_RAD_PER_SEC }, null, DT);
    expect(s1.vel).toBeGreaterThan(0); // 急停止しない
    expect(s1.vel).toBeLessThan(EYE_LASER_AIM_MAX_RATE_RAD_PER_SEC);
    const end = run({ angle: 0, vel: EYE_LASER_AIM_MAX_RATE_RAD_PER_SEC }, () => null, 120);
    expect(end.vel).toBeCloseTo(0, 6);
    const held = run(end, () => null, 60);
    expect(held.angle).toBeCloseTo(end.angle, 6);
  });

  it('横切る標的には光線が遅れる=当たらないパルスが出る', () => {
    // プレイヤー原点、標的は距離200pxの所を横へ毎秒300pxで横切る(角速度は最大で1.5rad/s>1.2rad/s)。
    // 100msごとのパルスで、光線(線分)と標的中心の距離が半幅+標的の半分(16px)を超えたら外れ。
    const R = 200, SPEED = 300, HALF_TARGET = 16;
    const pos = (t: number) => ({ x: R, y: -300 + SPEED * t });
    let aim: EyeLaserAim = { angle: Math.atan2(pos(0).y, pos(0).x), vel: 0 };
    let hits = 0, misses = 0;
    for (let i = 0; i < 180; i++) {
      const t = i * DT;
      const p = pos(t);
      const s = stepEyeLaserAim(aim, Math.atan2(p.y, p.x), DT);
      aim = { angle: s.angle, vel: s.vel };
      if (i % 6 === 0) {
        const dist = Math.abs(-Math.sin(aim.angle) * p.x + Math.cos(aim.angle) * p.y); // 光線への垂直距離
        if (dist <= EYE_LASER_HALFWIDTH + HALF_TARGET) hits++; else misses++;
      }
    }
    expect(misses).toBeGreaterThan(0);
    expect(hits).toBeGreaterThan(0);
  });

  it('最短回り(-π..π)で振る=350度の差は逆回りの10度として扱う', () => {
    const to = -Math.PI * (350 / 180) + Math.PI * 2; // ≈ +10度側
    expect(Math.abs(shortestAngleDiff(0, to))).toBeLessThan(0.2);
  });
});
