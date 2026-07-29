import { describe, it, expect } from 'vitest';
import {
  contextZoomTarget, isLargeForZoom,
  CONTEXT_ZOOM_MIN, BOSS_ZOOM_MIN, ZOOM_MIN_ABS, CONTEXT_ZOOM_COUNT_FLOOR, CONTEXT_ZOOM_COUNT_CEIL,
} from './cameraZoom';

describe('cameraZoom — context zoom target', () => {
  it('does not zoom out up to the floor count', () => {
    expect(contextZoomTarget(0, false)).toBe(1);
    expect(contextZoomTarget(CONTEXT_ZOOM_COUNT_FLOOR, false)).toBe(1);
  });

  it('zooms out linearly above the floor, reaching the min at the ceiling', () => {
    expect(contextZoomTarget(CONTEXT_ZOOM_COUNT_CEIL, false)).toBeCloseTo(CONTEXT_ZOOM_MIN, 6);
    const mid = contextZoomTarget(Math.round((CONTEXT_ZOOM_COUNT_FLOOR + CONTEXT_ZOOM_COUNT_CEIL) / 2), false);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(CONTEXT_ZOOM_MIN);
    // monotonic in count
    expect(contextZoomTarget(15, false)).toBeLessThan(contextZoomTarget(10, false));
    // never below the min even past the ceiling
    expect(contextZoomTarget(40, false)).toBe(CONTEXT_ZOOM_MIN);
  });

  // v0.25.2413(社長指示「ボス戦はもう少し引けます?」): ボス戦だけ BOSS_ZOOM_MIN まで深く引く。
  // 体数ドリブンの引き(CONTEXT_ZOOM_MIN)は据え置きなので、両者が別の値であることも固定しておく
  // (同じ値に戻ると「ボス戦だけ深く」という意図が黙って消える)。
  it('a large enemy forces the boss zoom-out regardless of count', () => {
    expect(contextZoomTarget(1, true)).toBe(BOSS_ZOOM_MIN);
    expect(contextZoomTarget(0, true)).toBe(BOSS_ZOOM_MIN);
    expect(BOSS_ZOOM_MIN).toBeLessThan(CONTEXT_ZOOM_MIN);
    // 安全マージンの基準は「一番引いた時」でなければならない(背景の隙間/敵の消失を防ぐ)。
    expect(ZOOM_MIN_ABS).toBe(Math.min(CONTEXT_ZOOM_MIN, BOSS_ZOOM_MIN));
  });

  it('large-type set = reaper/giantbat/hidden bosses/hunter (not pumpkin/screamer)', () => {
    for (const t of ['reaper', 'giantbat', 'mimir', 'jormungand', 'skadi', 'hunter']) expect(isLargeForZoom(t)).toBe(true);
    for (const t of ['pumpkin', 'screamer', 'zombie', 'bat', 'plant']) expect(isLargeForZoom(t)).toBe(false);
  });
});
