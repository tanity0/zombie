import { describe, it, expect } from 'vitest';
import { eyeLaserCycleDps, eyeLaserEffectiveReloadMs, EYE_LASER_PULSES_PER_FIRE , stepEyeLaserAim, shortestAngleDiff, EYE_LASER_RETARGET_MAX_RATE_RAD_PER_SEC} from './eyeLaserGun';

describe('eyeLaserGun(アイレーザー・UNIQUE_WEAPONS.md §5-2/§16-1)', () => {
  it('EYE_LASER_PULSES_PER_FIRE = 30(3000ms÷100ms)', () => {
    expect(EYE_LASER_PULSES_PER_FIRE).toBe(30);
  });

  it('実効リロード(raw2500ms)は既存武器と同じ×2規則(effectiveReloadMs)で5000msになる', () => {
    expect(eyeLaserEffectiveReloadMs(2500)).toBe(5000);
  });

  it('1パルス14ダメージのサイクル実効DPSは48.28(既定rifle-t3=45.83比+5.3%)', () => {
    const dps = eyeLaserCycleDps(14);
    expect(dps).toBeCloseTo(48.28, 1);
    const ratio = dps / 45.83;
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  });

  it('旧「1tick8」は帯を大きく割っていた(§16-1の記録どおり)', () => {
    const dps = eyeLaserCycleDps(8);
    const ratio = dps / 45.83;
    expect(ratio).toBeLessThan(0.90); // 枠外(-39.8%相当)
  });
});

// ★社長指示2026-09-07「敵が死んだら時間までは次の標的に少しゆっくり合わせにいく」。
// 等速で振らない(慣性MUST)=出だしで加速し、終わりで減速して収まることを固定する。
describe('stepEyeLaserAim(次の標的へ少しゆっくり振る)', () => {
  const DT = 1 / 60;
  it('出だしは加速する(1フレーム目の角速度は最大値よりずっと小さい)', () => {
    const s = stepEyeLaserAim({ angle: 0, vel: 0 }, Math.PI / 2, DT);
    expect(s.vel).toBeGreaterThan(0);
    expect(s.vel).toBeLessThan(EYE_LASER_RETARGET_MAX_RATE_RAD_PER_SEC * 0.5);
    expect(s.settled).toBe(false);
  });

  it('角速度は最大値を超えない', () => {
    let aim = { angle: 0, vel: 0 };
    for (let i = 0; i < 120; i++) {
      const s = stepEyeLaserAim(aim, Math.PI, DT);
      expect(Math.abs(s.vel)).toBeLessThanOrEqual(EYE_LASER_RETARGET_MAX_RATE_RAD_PER_SEC + 1e-6);
      aim = { angle: s.angle, vel: s.vel };
    }
  });

  it('90度の振りは1秒以内に収まり、収まる直前は減速している', () => {
    let aim = { angle: 0, vel: 0 };
    let settledAt = -1;
    let velBeforeSettle = 0;
    for (let i = 0; i < 60; i++) {
      const s = stepEyeLaserAim(aim, Math.PI / 2, DT);
      if (settledAt < 0 && s.settled) { settledAt = i; velBeforeSettle = Math.abs(s.vel); }
      aim = { angle: s.angle, vel: s.vel };
    }
    expect(settledAt).toBeGreaterThan(0);
    expect(settledAt).toBeLessThan(70); // 約0.97秒=照射3秒の1/3以内
    expect(velBeforeSettle).toBeLessThan(EYE_LASER_RETARGET_MAX_RATE_RAD_PER_SEC); // 最大速のままでは終わらない
  });

  it('最短回り(-π..π)で振る=350度の差は逆回りの10度として扱う', () => {
    const to = -Math.PI * (350 / 180) + Math.PI * 2; // ≈ +10度側
    expect(Math.abs(shortestAngleDiff(0, to))).toBeLessThan(0.2);
  });
});
