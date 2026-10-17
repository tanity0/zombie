import { describe, it, expect } from 'vitest';
import { pickHunterWanderWaypoint, hunterWanderStep } from './hunterWander';

describe('pickHunterWanderWaypoint', () => {
  it('always yields a unit-ish direction blended toward the player (deterministic rand)', () => {
    // rand() = 0 => randomAngle = 0 (dx=1,dy=0), fully deterministic blend with toward-player dir.
    const wp = pickHunterWanderWaypoint(0, 0, 1000, 0, 0, () => 0);
    // player is straight along +x; random dir is also +x (angle=0) here, so blended stays +x.
    expect(wp.wanderTargetX).toBeGreaterThan(0);
    expect(Math.abs(wp.wanderTargetY)).toBeLessThan(1e-6);
    expect(wp.wanderNextAt).toBeGreaterThan(0);
  });

  it('never points exactly opposite the player when random dir agrees (bias keeps net progress)', () => {
    // Player far to the +x side; random angle picked pointing -x (angle=PI, rand()=0.5 -> angle=PI).
    const wp = pickHunterWanderWaypoint(0, 0, 5000, 0, 0, () => 0.5);
    // Even with a fully opposing random direction, the 30% player-ward bias should pull the
    // blended target away from pure -x (i.e. not equal to -1,0 scaled).
    expect(wp.wanderTargetX).toBeGreaterThan(-260); // not the full -260 that a pure opposite dir would give
  });
});

describe('hunterWanderStep', () => {
  it('picks a fresh waypoint when none exists yet', () => {
    const r = hunterWanderStep(0, 0, 100, 500, 0, 0, null, () => 0);
    expect(r.wander.wanderTargetX).not.toBe(0);
    expect(r.vx).toBeGreaterThan(0); // heading roughly toward +x (player side)
  });

  it('keeps the same waypoint until it goes stale (retarget timer)', () => {
    const first = hunterWanderStep(0, 0, 100, 500, 0, 0, null, () => 0.9);
    const second = hunterWanderStep(10, 0, 100, 500, 0, 100, first.wander, () => 0.9);
    expect(second.wander.wanderTargetX).toBe(first.wander.wanderTargetX);
    expect(second.wander.wanderTargetY).toBe(first.wander.wanderTargetY);
  });

  it('re-picks once the retarget time has elapsed', () => {
    const first = hunterWanderStep(0, 0, 100, 500, 0, 0, null, () => 0.9);
    const farFuture = first.wander.wanderNextAt + 1;
    const second = hunterWanderStep(0, 0, 100, 500, 0, farFuture, first.wander, () => 0.1);
    expect(second.wander.wanderNextAt).not.toBe(first.wander.wanderNextAt);
  });

  it('re-picks once the waypoint has been reached (arrival epsilon)', () => {
    const first = hunterWanderStep(0, 0, 100, 500, 0, 0, null, () => 0.9);
    const atTarget = hunterWanderStep(
      first.wander.wanderTargetX, first.wander.wanderTargetY, 100, 500, 0, 50, first.wander, () => 0.1,
    );
    expect(atTarget.wander.wanderTargetX).not.toBe(first.wander.wanderTargetX);
  });

  it('moves at 0.35x the base speed (magnitude of the velocity vector)', () => {
    const r = hunterWanderStep(0, 0, 100, 500, 0, 0, null, () => 0);
    const mag = Math.hypot(r.vx, r.vy);
    expect(mag).toBeCloseTo(35, 0); // 100 * 0.35
  });
});
