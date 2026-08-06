import { describe, expect, it } from 'vitest';
import {
  SWORD_VISIBILITY_FADE_MS, swordAttackAngle, swordCompletionFrame, swordFadeInAlpha, swordFadeOutAlpha,
  swordSwingPose,
} from './swordSwingMotion';

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

  it('finishes ready, swing and fade phases after the owning AI state is cancelled', () => {
    expect(swordCompletionFrame(50, 100, 200).phase).toBe('ready');
    expect(swordCompletionFrame(100, 100, 200)).toMatchObject({ phase: 'swing', progress: 0, alpha: 1 });
    expect(swordCompletionFrame(200, 100, 200)).toMatchObject({ phase: 'swing', progress: 0.5, alpha: 1 });
    expect(swordCompletionFrame(300, 100, 200)).toMatchObject({ phase: 'fade', progress: 1, alpha: 1 });
    expect(swordCompletionFrame(390, 100, 200)).toMatchObject({ phase: 'done', progress: 1, alpha: 0 });
  });

  it('keeps the sword aligned to the locked attack line regardless of hand position', () => {
    const lockedAngle = swordAttackAngle(120, 80, 220, 180);
    expect(lockedAngle).toBeCloseTo(Math.PI / 4);
    expect(lockedAngle).toBe(swordAttackAngle(-500, 300, -400, 400));
    expect(swordAttackAngle(10, 10, 10, 10, 1.25)).toBe(1.25);
  });
});
