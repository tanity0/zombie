import { describe, it, expect } from 'vitest';
import { computeWireHopLanding, targetHalfDiagonal, WIRE_HOP_COLLAPSE_DIST } from './wireHop';

describe('wireHop — targetHalfDiagonal', () => {
  it('computes the half-diagonal of an AABB', () => {
    expect(targetHalfDiagonal(60, 80)).toBeCloseTo(Math.hypot(30, 40), 6); // 3-4-5 triangle → 50
    expect(targetHalfDiagonal(0, 0)).toBe(0);
  });
});

describe('wireHop — computeWireHopLanding', () => {
  const base = {
    targetCenterX: 500,
    targetCenterY: 400,
    targetHalfDiag: 50,
    playerHalfWidth: 16,
    margin: 24,
  };

  it('lands away from the target, in the direction back toward the slam origin', () => {
    // 起点(fromX/Y)がtargetの真右にある → 着地点も真右(+x方向)。
    const landing = computeWireHopLanding({ ...base, fromX: base.targetCenterX + 300, fromY: base.targetCenterY });
    const hopDist = base.targetHalfDiag + base.playerHalfWidth + base.margin; // 90
    expect(landing.x).toBeCloseTo(base.targetCenterX + hopDist, 6);
    expect(landing.y).toBeCloseTo(base.targetCenterY, 6);
  });

  it('scales landing distance as targetHalfDiag + playerHalfWidth + margin (not raw target size)', () => {
    const landing = computeWireHopLanding({ ...base, fromX: base.targetCenterX, fromY: base.targetCenterY - 300 });
    const hopDist = base.targetHalfDiag + base.playerHalfWidth + base.margin;
    expect(Math.hypot(landing.x - base.targetCenterX, landing.y - base.targetCenterY)).toBeCloseTo(hopDist, 6);
  });

  it('works for an arbitrary diagonal direction (normalizes correctly)', () => {
    // origin 3-4-5 away: dx=-300(fromXがtargetの左), dy=-400 → 単位ベクトル(-0.6,-0.8)
    const landing = computeWireHopLanding({ ...base, fromX: base.targetCenterX - 300, fromY: base.targetCenterY - 400 });
    const hopDist = base.targetHalfDiag + base.playerHalfWidth + base.margin;
    expect(landing.x).toBeCloseTo(base.targetCenterX - 0.6 * hopDist, 6);
    expect(landing.y).toBeCloseTo(base.targetCenterY - 0.8 * hopDist, 6);
  });

  it('falls back to straight down (+y) when the slam origin collapses onto the target center', () => {
    const landing = computeWireHopLanding({ ...base, fromX: base.targetCenterX, fromY: base.targetCenterY });
    const hopDist = base.targetHalfDiag + base.playerHalfWidth + base.margin;
    expect(landing.x).toBeCloseTo(base.targetCenterX, 6);
    expect(landing.y).toBeCloseTo(base.targetCenterY + hopDist, 6);
  });

  it('falls back to +y for any near-collapse distance strictly under the threshold', () => {
    const almostZero = WIRE_HOP_COLLAPSE_DIST - 0.01;
    const landing = computeWireHopLanding({ ...base, fromX: base.targetCenterX + almostZero, fromY: base.targetCenterY });
    const hopDist = base.targetHalfDiag + base.playerHalfWidth + base.margin;
    expect(landing.x).toBeCloseTo(base.targetCenterX, 6);
    expect(landing.y).toBeCloseTo(base.targetCenterY + hopDist, 6);
  });

  it('uses the real direction once distance reaches the collapse threshold (boundary is inclusive of normal path)', () => {
    const landing = computeWireHopLanding({ ...base, fromX: base.targetCenterX + WIRE_HOP_COLLAPSE_DIST, fromY: base.targetCenterY });
    const hopDist = base.targetHalfDiag + base.playerHalfWidth + base.margin;
    expect(landing.x).toBeCloseTo(base.targetCenterX + hopDist, 6);
    expect(landing.y).toBeCloseTo(base.targetCenterY, 6);
  });
});
