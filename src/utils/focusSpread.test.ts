import { describe, it, expect } from 'vitest';
import {
  resolveFocusSpreadRad, narrowFocusSpreadRad,
  FOCUS_SPREAD_INITIAL_RAD, FOCUS_SPREAD_FLOOR_RAD, FOCUS_SPREAD_STEP_RAD, FOCUS_SPREAD_RESET_MS,
} from './focusSpread';

describe('resolveFocusSpreadRad', () => {
  it('未命中(currentRad/lastHitAt未設定)は初期値', () => {
    expect(resolveFocusSpreadRad(undefined, undefined, 1000)).toBe(FOCUS_SPREAD_INITIAL_RAD);
  });

  it('直近の命中からリセット時間未満なら現在値を維持', () => {
    expect(resolveFocusSpreadRad(0.94, 1000, 1000 + FOCUS_SPREAD_RESET_MS - 1)).toBe(0.94);
  });

  it('リセット時間ちょうどでは維持(> のみリセット)', () => {
    expect(resolveFocusSpreadRad(0.94, 1000, 1000 + FOCUS_SPREAD_RESET_MS)).toBe(0.94);
  });

  it('リセット時間を超えたら初期値へ戻る', () => {
    expect(resolveFocusSpreadRad(0.36, 1000, 1000 + FOCUS_SPREAD_RESET_MS + 1)).toBe(FOCUS_SPREAD_INITIAL_RAD);
  });
});

describe('narrowFocusSpreadRad', () => {
  it('1命中ごとに-0.18', () => {
    expect(narrowFocusSpreadRad(1.30)).toBeCloseTo(1.12, 5);
  });

  it('下限0.36でクランプされる', () => {
    expect(narrowFocusSpreadRad(FOCUS_SPREAD_FLOOR_RAD)).toBe(FOCUS_SPREAD_FLOOR_RAD);
    expect(narrowFocusSpreadRad(0.40)).toBeCloseTo(FOCUS_SPREAD_FLOOR_RAD, 5);
  });

  it('初期値1.30から命中を重ねると1.30→1.12→0.94→0.76→0.58→0.40→0.36(下限)', () => {
    let rad = FOCUS_SPREAD_INITIAL_RAD;
    const seq = [rad];
    for (let i = 0; i < 6; i++) {
      rad = narrowFocusSpreadRad(rad);
      seq.push(rad);
    }
    expect(seq[1]).toBeCloseTo(1.12, 5);
    expect(seq[5]).toBeCloseTo(0.40, 5);
    expect(seq[6]).toBeCloseTo(FOCUS_SPREAD_FLOOR_RAD, 5);
    expect(FOCUS_SPREAD_STEP_RAD).toBeCloseTo(0.18, 5);
  });
});
