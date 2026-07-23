import { describe, it, expect } from 'vitest';
import {
  mansionPropsInRegion, MANSION_PILLAR_X, MANSION_PILLAR_SPACING_Y, MANSION_CANDLE_OFFSET_Y,
} from './mansionDecor';

describe('mansionPropsInRegion', () => {
  it('places pillar pairs every spacing and candles at the midpoint offset', () => {
    const props = mansionPropsInRegion(0, MANSION_PILLAR_SPACING_Y * 2);
    const pillars = props.filter((p) => p.kind === 'pillar');
    const candles = props.filter((p) => p.kind === 'candle');
    // 行0/1/2の柱(左右ペア)=6本、燭台は行0/1(offset260)=4本。
    expect(pillars.length).toBe(6);
    expect(candles.length).toBe(4);
    for (const p of pillars) {
      expect(Math.abs(p.footX)).toBe(MANSION_PILLAR_X);
      expect(p.footY % MANSION_PILLAR_SPACING_Y).toBe(0);
    }
    for (const c of candles) {
      expect(Math.abs(c.footX)).toBe(MANSION_PILLAR_X);
      expect((c.footY - MANSION_CANDLE_OFFSET_Y) % MANSION_PILLAR_SPACING_Y).toBe(0);
    }
  });

  it('is deterministic and covers negative Y (northward infinite corridor)', () => {
    const a = mansionPropsInRegion(-5000, -3000);
    const b = mansionPropsInRegion(-5000, -3000);
    expect(b).toEqual(a);
    expect(a.length).toBeGreaterThan(0);
    for (const p of a) {
      expect(p.footY).toBeGreaterThanOrEqual(-5000);
      expect(p.footY).toBeLessThanOrEqual(-3000);
    }
  });

  it('emits unique ids', () => {
    const props = mansionPropsInRegion(-2000, 2000);
    expect(new Set(props.map((p) => p.id)).size).toBe(props.length);
  });
});
