import { describe, expect, it } from 'vitest';
import { CASTLE_BOSS_MIN_TIME_MS } from './castleBoss';

describe('castle boss timing', () => {
  it('spawns at five minutes', () => {
    expect(CASTLE_BOSS_MIN_TIME_MS).toBe(300_000);
  });
});
