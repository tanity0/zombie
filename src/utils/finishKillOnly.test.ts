import { describe, it, expect } from 'vitest';
import { clampFinishKillOnlyHealth } from './finishKillOnly';

describe('clampFinishKillOnlyHealth', () => {
  it('floors a finishKillOnly enemy at 1 HP when the lethal hit is not a melee finish', () => {
    expect(clampFinishKillOnlyHealth(true, 0, false)).toBe(1);
    expect(clampFinishKillOnlyHealth(true, -4, false)).toBe(1);
  });

  it('allows death when the hit is delivered via a melee finish', () => {
    expect(clampFinishKillOnlyHealth(true, 0, true)).toBe(0);
  });

  it('does not touch non-lethal damage (whittling is allowed either way)', () => {
    expect(clampFinishKillOnlyHealth(true, 5, false)).toBe(5);
    expect(clampFinishKillOnlyHealth(true, 1, false)).toBe(1);
  });

  it('is a no-op for enemies without the flag, regardless of viaMeleeFinish', () => {
    expect(clampFinishKillOnlyHealth(false, 0, false)).toBe(0);
    expect(clampFinishKillOnlyHealth(undefined, 0, false)).toBe(0);
    expect(clampFinishKillOnlyHealth(undefined, 0, true)).toBe(0);
  });
});
