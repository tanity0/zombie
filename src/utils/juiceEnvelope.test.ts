import { describe, it, expect } from 'vitest';
import { shouldFireFullJuiceCinematic } from './juiceEnvelope';

describe('shouldFireFullJuiceCinematic', () => {
  it('fires when the CD has fully elapsed since the last full cinematic', () => {
    expect(shouldFireFullJuiceCinematic(10000, 0, 10000)).toBe(true);
    expect(shouldFireFullJuiceCinematic(10001, 0, 10000)).toBe(true);
  });

  it('does not fire while still inside the CD window', () => {
    expect(shouldFireFullJuiceCinematic(9999, 0, 10000)).toBe(false);
    expect(shouldFireFullJuiceCinematic(1, 0, 10000)).toBe(false);
  });

  it('always fires on the very first kill (lastFullAtMs=0, nowMs large)', () => {
    expect(shouldFireFullJuiceCinematic(500, 0, 10000)).toBe(false); // still within a fresh run's first 10s
    expect(shouldFireFullJuiceCinematic(10000, 0, 10000)).toBe(true);
  });
});
