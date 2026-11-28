import { describe, it, expect, vi } from 'vitest';
vi.mock('../audio/audioManager', () => ({ playSfx: vi.fn() }));
import { locoSpeedScale, STICK_WALK_MIN_FACTOR, PC_WALK_STRENGTH, MELEE_RUN_SPEED_FRAC } from './gameStore';

describe('PC: Shift で歩く(社長指示2026-10-05)', () => {
  it('キーボードは Shift の間だけ遅くなり、離せば全速', () => {
    expect(locoSpeedScale(false, 1, false, true)).toBe(1);
    const walk = locoSpeedScale(false, 1, true, true);
    expect(walk).toBeCloseTo(STICK_WALK_MIN_FACTOR + (1 - STICK_WALK_MIN_FACTOR) * PC_WALK_STRENGTH);
    expect(walk).toBeLessThan(MELEE_RUN_SPEED_FRAC); // 歩き=走りの踏み込みにならない(スティックの浅い傾きと同じ扱い)
  });
  it('スマホのスティックは今まで通り(Shift の状態を見ない)', () => {
    expect(locoSpeedScale(true, 0.5, true, true)).toBe(locoSpeedScale(true, 0.5, false, true));
    expect(locoSpeedScale(true, 1, false, true)).toBe(1);
  });
  it('ダッシュ等の特殊な移動は歩きで遅くならない', () => {
    expect(locoSpeedScale(false, 1, true, false)).toBe(1);
  });
});
