import { describe, expect, it } from 'vitest';
import { SWORD_VISIBILITY_FADE_MS, swordFadeInAlpha, swordFadeOutAlpha, swordSwingPose } from './swordSwingMotion';

describe('swordSwingPose', () => {
  it('makes horizontal and overhead attacks visibly sweep through large arcs', () => {
    const wide = swordSwingPose('wide', 1).angleOffset - swordSwingPose('wide', 0).angleOffset;
    const overhead = swordSwingPose('overhead', 1).angleOffset - swordSwingPose('overhead', 0).angleOffset;
    expect(wide * 180 / Math.PI).toBeCloseTo(200);
    expect(overhead * 180 / Math.PI).toBeCloseTo(160);
  });

  it('keeps thrust aligned while moving the grip forward', () => {
    expect(swordSwingPose('thrust', 0).angleOffset).toBe(0);
    expect(swordSwingPose('thrust', 1).angleOffset).toBe(0);
    expect(swordSwingPose('thrust', 1).pushPx - swordSwingPose('thrust', 0).pushPx).toBe(50);
  });

  it('settles exactly into the requested start and end poses', () => {
    expect(swordSwingPose('wide', -1)).toEqual(swordSwingPose('wide', 0));
    expect(swordSwingPose('wide', 2)).toEqual(swordSwingPose('wide', 1));
  });

  it('fades the weapon in and out over a short 90ms edge', () => {
    expect(swordFadeInAlpha(0)).toBe(0);
    expect(swordFadeInAlpha(SWORD_VISIBILITY_FADE_MS)).toBe(1);
    expect(swordFadeOutAlpha(SWORD_VISIBILITY_FADE_MS)).toBe(1);
    expect(swordFadeOutAlpha(0)).toBe(0);
  });
});
