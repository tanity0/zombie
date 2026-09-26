import { describe, expect, it } from 'vitest';
import { ghostArrivalPoint, ghostDeparturePoint } from './ghostLifecycle';

describe('ghost lifecycle motion', () => {
  it('slides from behind to the existing guardian position with ease-out', () => {
    expect(ghostArrivalPoint(0, 20, 100, 40, 0, 300)).toMatchObject({ x: 0, y: 20, done: false });
    const halfway = ghostArrivalPoint(0, 20, 100, 40, 150, 300);
    expect(halfway.x).toBeCloseTo(75);
    expect(halfway.y).toBeCloseTo(35);
    expect(ghostArrivalPoint(0, 20, 100, 40, 300, 300)).toMatchObject({ x: 100, y: 40, done: true });
  });

  it('holds the crouch, then follows the rescue-signal back-jump arc', () => {
    expect(ghostDeparturePoint(100, 40, -20, 40, 199, 200, 220, 48)).toEqual({
      x: 100, y: 40, done: false, crouching: true,
    });
    const airborne = ghostDeparturePoint(100, 40, -20, 40, 310, 200, 220, 48);
    expect(airborne.x).toBeCloseTo(70);
    expect(airborne.y).toBeCloseTo(-8);
    expect(airborne.crouching).toBe(false);
    expect(ghostDeparturePoint(100, 40, -20, 40, 420, 200, 220, 48)).toMatchObject({
      x: -20, y: 40, done: true,
    });
  });
});
