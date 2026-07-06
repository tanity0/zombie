import { describe, it, expect } from 'vitest';
import { computeTimeSlowScale } from './timeSlowCurve';

describe('computeTimeSlowScale', () => {
  it('returns 1 (normal speed) once past timeSlowUntil', () => {
    expect(computeTimeSlowScale(2000, 1000, 1500, 0.2)).toBe(1);
    expect(computeTimeSlowScale(1500, 1000, 1500, 0.2)).toBe(1); // exactly at the boundary
  });

  it('holdMs=0 (default, all pre-existing callers) matches the original continuous smoothstep ramp', () => {
    const start = 1000, until = 2000, scale = 0.2;
    // At t=0 the smoothstep ease is 0 → scale stays at the minimum.
    expect(computeTimeSlowScale(start, start, until, scale)).toBeCloseTo(scale, 5);
    // At the midpoint, smoothstep(0.5) = 0.5 → halfway between scale and 1.
    const mid = computeTimeSlowScale(start + 500, start, until, scale);
    expect(mid).toBeCloseTo(scale + (1 - scale) * 0.5, 5);
    // Just before the end it should be very close to 1 (but not exactly, smoothstep isn't linear).
    const nearEnd = computeTimeSlowScale(start + 999, start, until, scale);
    expect(nearEnd).toBeGreaterThan(0.99);
  });

  it('holdMs>0 holds at the minimum scale for the full hold window, unlike the no-hold curve', () => {
    const start = 1000, until = 2000, scale = 0.2, holdMs = 600;
    // Throughout the hold window (elapsed < holdMs) the scale must stay pinned at minimum.
    expect(computeTimeSlowScale(start, start, until, scale, holdMs)).toBe(scale);
    expect(computeTimeSlowScale(start + 300, start, until, scale, holdMs)).toBe(scale);
    expect(computeTimeSlowScale(start + 599, start, until, scale, holdMs)).toBe(scale);
    // Right at the hold boundary the return ramp begins (still at minimum, ease=0).
    expect(computeTimeSlowScale(start + 600, start, until, scale, holdMs)).toBeCloseTo(scale, 5);
    // Partway through the (now-compressed) return ramp it should have moved measurably toward 1.
    const midReturn = computeTimeSlowScale(start + 800, start, until, scale, holdMs); // 200/400 through the ramp
    expect(midReturn).toBeCloseTo(scale + (1 - scale) * 0.5, 5);
    // By the end it reaches 1 (well, just under, at 999/1000) and hits exactly 1 at/after `until`.
    expect(computeTimeSlowScale(until, start, until, scale, holdMs)).toBe(1);
  });

  it('a holdMs >= the full span still leaves a sliver of return ramp instead of getting stuck at minimum forever', () => {
    const start = 1000, until = 1100, scale = 0.2; // 100ms span
    const stuckHold = 5000; // way more than the span
    // Even with an absurd hold, by the very end it must still reach 1 (never freezes gameplay forever) —
    // the hold is clamped so at least 1ms of return ramp always remains.
    expect(computeTimeSlowScale(until, start, until, scale, stuckHold)).toBe(1);
    expect(computeTimeSlowScale(until - 1, start, until, scale, stuckHold)).toBe(scale);
  });
});
