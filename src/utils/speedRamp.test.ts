import { describe, it, expect } from 'vitest';
import {
  stepSpeedRamp,
  createSpeedRampState,
  rampFracOf,
  effectiveRampFrac,
  rampedBonusMult,
  RAMP_FULL_MS,
  RAMP_RESET_ANGLE_DEG,
  type SpeedRampState,
} from './speedRamp';

describe('stepSpeedRamp (MOVEMENT_REWORK.md 仕様1)', () => {
  it('立ち上がり: 同じ方向へ走り続けるとsustainMsが積み上がり、RAMP_FULL_MSでrampFrac=1になる', () => {
    let state = createSpeedRampState();
    // 100msずつ、同方向(1,0)へ15回 = 1500ms = RAMP_FULL_MS ぴったり。
    for (let i = 0; i < 15; i++) {
      state = stepSpeedRamp(state, { dtMs: 100, moving: true, dirX: 1, dirY: 0 });
    }
    expect(state.sustainMs).toBe(RAMP_FULL_MS);
    expect(rampFracOf(state)).toBeCloseTo(1);
    // 途中(半分)では半分にも届いていることを確認(単調増加の裏取り)。
    let mid = createSpeedRampState();
    for (let i = 0; i < 7; i++) {
      mid = stepSpeedRamp(mid, { dtMs: 100, moving: true, dirX: 1, dirY: 0 });
    }
    expect(rampFracOf(mid)).toBeCloseTo(700 / RAMP_FULL_MS);
    expect(rampFracOf(mid)).toBeLessThan(1);
  });

  it('75°リセット: 移動方向が前回から75°以上変わるとsustainMsが0へ戻る', () => {
    let state = createSpeedRampState();
    for (let i = 0; i < 10; i++) {
      state = stepSpeedRamp(state, { dtMs: 100, moving: true, dirX: 1, dirY: 0 }); // 右へ1s
    }
    expect(state.sustainMs).toBeGreaterThan(0);
    // 真上(90°)へ切り返す→ ちょうど75°境界も含めてリセットされることを確認。
    const turnedUp = stepSpeedRamp(state, { dtMs: 100, moving: true, dirX: 0, dirY: -1 });
    expect(turnedUp.sustainMs).toBe(0);
    // 境界値: ちょうどRAMP_RESET_ANGLE_DEG(75°)の方向転換もリセットする(>=なので境界含む)。
    let boundary = createSpeedRampState();
    boundary = stepSpeedRamp(boundary, { dtMs: 100, moving: true, dirX: 1, dirY: 0 });
    const rad = (RAMP_RESET_ANGLE_DEG * Math.PI) / 180;
    boundary = stepSpeedRamp(boundary, { dtMs: 100, moving: true, dirX: Math.cos(rad), dirY: Math.sin(rad) });
    expect(boundary.sustainMs).toBe(0);
  });

  it('緩いカーブ維持: 75°未満の小刻みな方向変化はリセットせず、sustainMsが積み上がり続ける', () => {
    let state = createSpeedRampState();
    let angleDeg = 0;
    // 1ステップあたり10°ずつ緩やかに旋回(75°未満)しながら20ステップ走る。
    for (let i = 0; i < 20; i++) {
      angleDeg += 10;
      const rad = (angleDeg * Math.PI) / 180;
      state = stepSpeedRamp(state, { dtMs: 100, moving: true, dirX: Math.cos(rad), dirY: Math.sin(rad) });
    }
    // 一度もリセットされていなければ 20 * 100ms = 2000ms 積み上がっているはず。
    expect(state.sustainMs).toBe(2000);
    expect(rampFracOf(state)).toBe(1); // RAMP_FULL_MS(1500)を超えているのでクランプされて1。
  });

  it('停止リセット: moving=falseの間はsustainMsが常に0(直前まで積んでいても即0)', () => {
    let state = createSpeedRampState();
    for (let i = 0; i < 10; i++) {
      state = stepSpeedRamp(state, { dtMs: 100, moving: true, dirX: 1, dirY: 0 });
    }
    expect(state.sustainMs).toBeGreaterThan(0);
    const stopped = stepSpeedRamp(state, { dtMs: 100, moving: false, dirX: 0, dirY: 0 });
    expect(stopped.sustainMs).toBe(0);
    // 停止直後に同じ方向へ再度動き出しても「前回方向」の記憶は残らない(0から素直に積む)。
    const resumed = stepSpeedRamp(stopped, { dtMs: 100, moving: true, dirX: 1, dirY: 0 });
    expect(resumed.sustainMs).toBe(100);
  });

  it('動き出しの最初の1フレームは「前回方向」が無いためリセット判定されない', () => {
    const state: SpeedRampState = { sustainMs: 0, lastDirX: 0, lastDirY: 0 };
    const next = stepSpeedRamp(state, { dtMs: 250, moving: true, dirX: 0, dirY: 1 });
    expect(next.sustainMs).toBe(250);
  });
});

describe('effectiveRampFrac (フラグ素通し・?speedramp=0相当)', () => {
  it('enabled=falseなら、sustainMsに関わらず常に1(旧挙動=ボーナス即時全開)を返す', () => {
    const fresh = createSpeedRampState();
    expect(effectiveRampFrac(fresh, false)).toBe(1);
    let ramped = createSpeedRampState();
    ramped = stepSpeedRamp(ramped, { dtMs: 100, moving: true, dirX: 1, dirY: 0 });
    expect(effectiveRampFrac(ramped, false)).toBe(1);
  });

  it('enabled=trueならrampFracOfと同じ値を返す(素通しせず実際のランプを反映)', () => {
    let ramped = createSpeedRampState();
    ramped = stepSpeedRamp(ramped, { dtMs: 300, moving: true, dirX: 1, dirY: 0 });
    expect(effectiveRampFrac(ramped, true)).toBeCloseTo(rampFracOf(ramped));
    expect(effectiveRampFrac(ramped, true)).toBeLessThan(1);
  });
});

describe('rampedBonusMult', () => {
  it('rampFrac=0なら常に1(ボーナス無し=基礎速度のみ)', () => {
    expect(rampedBonusMult(2.5, 0)).toBe(1);
  });
  it('rampFrac=1ならPそのもの(ボーナス満額)', () => {
    expect(rampedBonusMult(2.5, 1)).toBe(2.5);
  });
  it('中間のrampFracでは1とPの間を線形補間する', () => {
    expect(rampedBonusMult(3, 0.5)).toBeCloseTo(2);
  });
});
