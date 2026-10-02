import { describe, it, expect } from 'vitest';
import {
  mimirWheelOmega, mimirWheelAngle, mimirWheelTheta0, mimirWheelSpokeAngle, mimirWheelGapPx, steerDirToward, mimirWheelShotOffsetMs,
} from './mimirWheel';
import { HIDDEN_MIMIR_TUNING } from './hiddenBossScript';

const spec = { windupMs: 1500, fireMs: 5000, spokes: 6, omegaWindup: 0.1, omegaMax: 0.42, rampMs: 900, decelMs: 600 };

describe('紫の車輪: 回転(慣性)', () => {
  it('t=0で0・単調増加・発射の終わりで止まる', () => {
    expect(mimirWheelAngle(0, spec)).toBe(0);
    let prev = -1;
    for (let t = 0; t <= 7000; t += 10) {
      const a = mimirWheelAngle(t, spec);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
    expect(mimirWheelOmega(6500, spec)).toBeCloseTo(0, 9);
    expect(mimirWheelOmega(6600, spec)).toBe(0);
    expect(mimirWheelAngle(7000, spec)).toBeCloseTo(mimirWheelAngle(6500, spec));
  });
  it('角速度は継ぎ目で連続(溜め→発射/加速→一定→減速)', () => {
    for (const t of [1500, 2400, 5900, 6500]) {
      expect(Math.abs(mimirWheelOmega(t - 1, spec) - mimirWheelOmega(t + 1, spec))).toBeLessThan(0.01);
    }
  });
  it('角は角速度の積分(数値積分と一致)', () => {
    let acc = 0;
    for (let t = 0; t < 6500; t += 1) acc += mimirWheelOmega(t + 0.5, spec) / 1000;
    expect(mimirWheelAngle(6500, spec)).toBeCloseTo(acc, 3);
  });
  it('相手は隙間の真ん中から始まる', () => {
    const aim = 0.7;
    const t0 = mimirWheelTheta0(aim, 6);
    const ds = [0, 1, 2, 3, 4, 5].map(k => {
      const d = mimirWheelSpokeAngle(t0, 1, k, 0, spec) - aim;
      return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    });
    expect(Math.min(...ds)).toBeCloseTo(Math.PI / 6);
  });
  it('逆回りは角が逆へ進む', () => {
    expect(mimirWheelSpokeAngle(0, -1, 0, 3000, spec)).toBeCloseTo(-mimirWheelAngle(3000, spec));
  });
});

describe('紫の車輪: 既定値で「中で動けば避けられる」', () => {
  const W = HIDDEN_MIMIR_TUNING.wheel;
  it('体の縁(112px)より外は隙間を自機が通れる', () => {
    expect(mimirWheelGapPx(112, W.spokes, W.halfWidth, 28)).toBeGreaterThan(0);
  });
  it('歩速で隙間に追いつける半径が体の縁より十分外(≥200px)', () => {
    expect(104.4 / W.omegaMax).toBeGreaterThanOrEqual(200);
  });
});

describe('追跡弾の旋回', () => {
  it('1回で回る角は上限まで', () => {
    const d = steerDirToward(1, 0, 0, 0, 0, 100, 0.1);
    expect(Math.atan2(d.y, d.x)).toBeCloseTo(0.1);
    const d2 = steerDirToward(1, 0, 0, 0, 100, 1, 0.5);
    expect(Math.atan2(d2.y, d2.x)).toBeCloseTo(Math.atan2(1, 100));
  });
  it('真後ろでも上限以上は回らない', () => {
    const d = steerDirToward(1, 0, 0, 0, -100, 0, 0.2);
    expect(Math.abs(Math.atan2(d.y, d.x))).toBeCloseTo(0.2);
  });
});

describe('変化の追跡弾(既定値で「外せる・返せる」)', () => {
  const H = HIDDEN_MIMIR_TUNING.wheel.homing;
  it('2連→休みの組', () => {
    expect(mimirWheelShotOffsetMs(0, H)).toBe(H.startMs);
    expect(mimirWheelShotOffsetMs(1, H)).toBe(H.startMs + H.pairGapMs);
    expect(mimirWheelShotOffsetMs(2, H)).toBe(H.startMs + H.pairGapMs + H.restMs);
  });
  it('2連は1回のカウンター窓(400ms)に両方入る間合い=弾の間隔が窓で進む距離より短い', () => {
    expect(H.speed * H.pairGapMs / 1000).toBeLessThan(H.speed * 400 / 1000);
  });
  it('組と組の間はカウンターの1周期(820ms)より長い=返した後に次の組を返せる', () => {
    expect(H.restMs).toBeGreaterThan(820);
  });
  it('歩き(104.4px/s)で横へ切れば外せる: 追い切れなくなる距離 v/ω が当たり半径の数倍(≥130px)', () => {
    expect(104.4 / H.turnRadS).toBeGreaterThanOrEqual(130);
  });
  it('威力はレーザーと同じ(弾を受けて無敵の間にレーザーを横切る、を得にしない)', () => {
    expect(H.damage).toBeGreaterThanOrEqual(HIDDEN_MIMIR_TUNING.wheel.damage);
  });
});
