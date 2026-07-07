import { describe, it, expect } from 'vitest';
import { shouldTriggerViciousHunter, pickViciousSpawnPoint, isOutsideCamera } from './viciousHunter';

const baseTrigger = {
  gameTime: 180000,
  hunterStartMs: 180000,
  spawnBlocked: false,
  hunterIdle: true,
  playerAreaIdx: 2,
  capturedBaseCount: 0,
  viciousRearmAt: 0,
};

describe('shouldTriggerViciousHunter', () => {
  it('fires once all conditions are satisfied (danger zone, zero captures, idle)', () => {
    expect(shouldTriggerViciousHunter(baseTrigger)).toBe(true);
  });

  it('does not fire before the 3-minute floor', () => {
    expect(shouldTriggerViciousHunter({ ...baseTrigger, gameTime: baseTrigger.hunterStartMs - 1 })).toBe(false);
  });

  it('does not fire before the danger zone (areaIdx < 2)', () => {
    expect(shouldTriggerViciousHunter({ ...baseTrigger, playerAreaIdx: 1 })).toBe(false);
  });

  it('fires in deeper zones too (未確認/深層も対象=境界以深すべて)', () => {
    expect(shouldTriggerViciousHunter({ ...baseTrigger, playerAreaIdx: 4 })).toBe(true);
  });

  it('does not fire once at least one base is captured', () => {
    expect(shouldTriggerViciousHunter({ ...baseTrigger, capturedBaseCount: 1 })).toBe(false);
  });

  it('does not fire while another hunter event is already active', () => {
    expect(shouldTriggerViciousHunter({ ...baseTrigger, hunterIdle: false })).toBe(false);
  });

  it('does not fire while spawn is blocked (boss/cinematic/activeEvent)', () => {
    expect(shouldTriggerViciousHunter({ ...baseTrigger, spawnBlocked: true })).toBe(false);
  });

  it('respects the short rearm buffer after a previous vicious hunter ended', () => {
    expect(shouldTriggerViciousHunter({ ...baseTrigger, viciousRearmAt: baseTrigger.gameTime + 1 })).toBe(false);
  });
});

describe('pickViciousSpawnPoint', () => {
  it('places the point exactly detectRange away from the player', () => {
    const p = pickViciousSpawnPoint(1000, 2000, 500, () => 0.25); // angle = 0.5*PI (straight down in +y)
    const dist = Math.hypot(p.x - 1000, p.y - 2000);
    expect(dist).toBeCloseTo(500, 5);
  });

  it('varies with the rand seed (different angles give different points)', () => {
    const a = pickViciousSpawnPoint(0, 0, 500, () => 0);
    const b = pickViciousSpawnPoint(0, 0, 500, () => 0.5);
    expect(a.x === b.x && a.y === b.y).toBe(false);
  });
});

describe('isOutsideCamera', () => {
  it('reports false for a point inside the camera rect', () => {
    expect(isOutsideCamera(100, 100, 0, 0, 800, 600)).toBe(false);
  });

  it('reports true for a point outside each edge', () => {
    expect(isOutsideCamera(-10, 100, 0, 0, 800, 600)).toBe(true);
    expect(isOutsideCamera(900, 100, 0, 0, 800, 600)).toBe(true);
    expect(isOutsideCamera(100, -10, 0, 0, 800, 600)).toBe(true);
    expect(isOutsideCamera(100, 700, 0, 0, 800, 600)).toBe(true);
  });
});
