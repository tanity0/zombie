import { describe, it, expect } from 'vitest';
import { shouldFireBoredomArena, BOREDOM_ARENA_START_MS, BOREDOM_ARENA_CD_MS } from './boredomArena';

const baseInput = {
  enabled: true,
  gameTime: BOREDOM_ARENA_START_MS,
  nextEligibleAt: 0,
  bossChasing: false,
  bossEngaged: false,
  hunterIdle: true,
  redNightActive: false,
  boredomReady: true,
};

describe('shouldFireBoredomArena', () => {
  it('fires once all conditions are satisfied', () => {
    expect(shouldFireBoredomArena(baseInput)).toBe(true);
  });

  it('does not fire before the 1-minute start floor', () => {
    expect(shouldFireBoredomArena({ ...baseInput, gameTime: BOREDOM_ARENA_START_MS - 1 })).toBe(false);
  });

  it('does not fire before the next-eligible cooldown', () => {
    expect(shouldFireBoredomArena({ ...baseInput, nextEligibleAt: baseInput.gameTime + 1 })).toBe(false);
  });

  it('respects the cooldown constant (2 minutes) as the caller would set it', () => {
    const firedAt = 200000;
    const nextEligibleAt = firedAt + BOREDOM_ARENA_CD_MS;
    expect(shouldFireBoredomArena({ ...baseInput, gameTime: firedAt + BOREDOM_ARENA_CD_MS - 1, nextEligibleAt })).toBe(false);
    expect(shouldFireBoredomArena({ ...baseInput, gameTime: nextEligibleAt, nextEligibleAt })).toBe(true);
  });

  it('does not fire when disabled via the recovery flag', () => {
    expect(shouldFireBoredomArena({ ...baseInput, enabled: false })).toBe(false);
  });

  it('does not fire while the boss is chasing or the player is engaged with a boss', () => {
    expect(shouldFireBoredomArena({ ...baseInput, bossChasing: true })).toBe(false);
    expect(shouldFireBoredomArena({ ...baseInput, bossEngaged: true })).toBe(false);
  });

  it('does not fire while the hunter is not idle (exclusive with hunter events)', () => {
    expect(shouldFireBoredomArena({ ...baseInput, hunterIdle: false })).toBe(false);
  });

  it('does not fire during red night', () => {
    expect(shouldFireBoredomArena({ ...baseInput, redNightActive: true })).toBe(false);
  });

  it('does not fire unless the boredom signal is fully ready', () => {
    expect(shouldFireBoredomArena({ ...baseInput, boredomReady: false })).toBe(false);
  });
});
