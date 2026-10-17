import { describe, it, expect } from 'vitest';
import { resolveRescueSpawnDirection, rescueSpawnCandidates } from './rescueQuestSpawn';

describe('resolveRescueSpawnDirection', () => {
  it('uses lastDirection when present (EVENT_QUEST_DESIGN.md §2-3)', () => {
    const d = resolveRescueSpawnDirection({ x: 0.6, y: 0.8 }, 0);
    expect(d).toEqual({ x: 0.6, y: 0.8 });
  });

  it('falls back to the random angle only when lastDirection is null', () => {
    const angle = Math.PI / 3;
    const d = resolveRescueSpawnDirection(null, angle);
    expect(d.x).toBeCloseTo(Math.cos(angle));
    expect(d.y).toBeCloseTo(Math.sin(angle));
  });
});

describe('rescueSpawnCandidates', () => {
  const baseArgs = {
    playerX: 0, playerY: 0,
    dirX: 1, dirY: 0, // 東向き
    forwardDist: 700,
    perpSign: 1 as const,
    perpOffset: 200,
    ringStep: 290,
  };

  it('first candidate sits on the center line at forwardDist, offset by perpOffset', () => {
    const [first] = rescueSpawnCandidates(baseArgs);
    // dir=(1,0)の直交=(0,1)。perpSign=1なので+200はy方向。
    expect(first.x).toBeCloseTo(700);
    expect(first.y).toBeCloseTo(200);
  });

  it('flips to the other side when perpSign is -1', () => {
    const [first] = rescueSpawnCandidates({ ...baseArgs, perpSign: -1 });
    expect(first.x).toBeCloseTo(700);
    expect(first.y).toBeCloseTo(-200);
  });

  it('returns 1 (base) + rings*stepsPerRing candidates by default (5x8=40)', () => {
    const list = rescueSpawnCandidates(baseArgs);
    expect(list.length).toBe(1 + 5 * 8);
  });

  it('respects a custom rings/stepsPerRing count', () => {
    const list = rescueSpawnCandidates({ ...baseArgs, rings: 2, stepsPerRing: 3 });
    expect(list.length).toBe(1 + 2 * 3);
  });

  it('ring candidates are centered on the player and grow in distance per ring (beginReturnPhaseと同じ形)', () => {
    const list = rescueSpawnCandidates(baseArgs);
    const d0 = Math.hypot(list[0].x - baseArgs.playerX, list[0].y - baseArgs.playerY);
    // ring0の8点(index 1..8)はd0と同じ距離。
    for (let i = 1; i <= 8; i++) {
      const d = Math.hypot(list[i].x - baseArgs.playerX, list[i].y - baseArgs.playerY);
      expect(d).toBeCloseTo(d0);
    }
    // ring1の8点(index 9..16)はd0+ringStep。
    for (let i = 9; i <= 16; i++) {
      const d = Math.hypot(list[i].x - baseArgs.playerX, list[i].y - baseArgs.playerY);
      expect(d).toBeCloseTo(d0 + baseArgs.ringStep);
    }
  });

  it('is deterministic (no internal randomness) given the same inputs', () => {
    const a = rescueSpawnCandidates(baseArgs);
    const b = rescueSpawnCandidates(baseArgs);
    expect(a).toEqual(b);
  });
});
