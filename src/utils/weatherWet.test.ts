import { describe, it, expect } from 'vitest';
import {
  parseWeather, weatherWetActive, ripplePose, RIPPLE_MS, RIPPLE_FRAMES, RIPPLE_SCALE_FROM, RIPPLE_SCALE_TO,
  dripHeight, DRIP_FALL_MS, DRIP_FALL_H, glintPose, GLINT_MS,
} from './weatherWet';

describe('weatherWet(雨上がりの決めごと)', () => {
  it('?weather=wet だけで有効・それ以外は null', () => {
    expect(parseWeather('?weather=wet')).toBe('wet');
    expect(parseWeather('?stage=stage-1&weather=wet&smoke=1')).toBe('wet');
    expect(parseWeather('')).toBeNull();
    expect(parseWeather('?weather=rain')).toBeNull();
    expect(parseWeather('?weather=')).toBeNull();
  });

  it('ステージ1の屋外だけで効く', () => {
    const base = { weather: 'wet' as const, stageId: 'stage-1', indoor: false, corridor: false };
    expect(weatherWetActive(base)).toBe(true);
    expect(weatherWetActive({ ...base, weather: null })).toBe(false);
    expect(weatherWetActive({ ...base, stageId: 'stage-3' })).toBe(false);
    expect(weatherWetActive({ ...base, indoor: true })).toBe(false);
    expect(weatherWetActive({ ...base, corridor: true })).toBe(false);
  });

  it('波紋: 広がりは単調に増え、減速する(慣性)・出だしと終わりは薄い', () => {
    const p0 = ripplePose(0)!;
    expect(p0.alpha).toBe(0);
    expect(p0.scale).toBeCloseTo(RIPPLE_SCALE_FROM);
    let prev = -1, prevStep = Infinity;
    for (let t = 0; t < RIPPLE_MS; t += 30) {
      const p = ripplePose(t)!;
      expect(p.frame).toBeGreaterThanOrEqual(0);
      expect(p.frame).toBeLessThan(RIPPLE_FRAMES);
      if (prev >= 0) {
        const step = p.scale - prev;
        expect(step).toBeGreaterThanOrEqual(0);
        expect(step).toBeLessThanOrEqual(prevStep + 1e-9); // 減速
        prevStep = step;
      }
      prev = p.scale;
    }
    expect(prev).toBeLessThanOrEqual(RIPPLE_SCALE_TO);
    expect(ripplePose(RIPPLE_MS - 1)!.alpha).toBeLessThan(0.01);
    expect(ripplePose(RIPPLE_MS)).toBeNull();
    expect(ripplePose(-1)).toBeNull();
    // 3コマを全部通る
    const frames = new Set<number>();
    for (let t = 0; t < RIPPLE_MS; t += 10) frames.add(ripplePose(t)!.frame);
    expect(frames.size).toBe(RIPPLE_FRAMES);
  });

  it('雫: 上から落ち、加速する', () => {
    expect(dripHeight(0)).toBeCloseTo(DRIP_FALL_H);
    const a = DRIP_FALL_H - dripHeight(DRIP_FALL_MS * 0.25)!;
    const b = dripHeight(DRIP_FALL_MS * 0.75)! - dripHeight(DRIP_FALL_MS * 0.999)!;
    expect(b).toBeGreaterThan(a * 0.9); // 後半の4分の1の方が前半の4分の1より大きく落ちる
    expect(dripHeight(DRIP_FALL_MS)).toBeNull();
  });

  it('光の線: 端では消えていて、加速→減速で渡る', () => {
    expect(glintPose(0)!.alpha).toBeCloseTo(0);
    expect(glintPose(0)!.pos).toBeCloseTo(-1);
    expect(glintPose(GLINT_MS / 2)!.alpha).toBeCloseTo(1);
    expect(glintPose(GLINT_MS / 2)!.pos).toBeCloseTo(0);
    const early = glintPose(GLINT_MS * 0.05)!.pos - glintPose(0)!.pos;
    const mid = glintPose(GLINT_MS * 0.55)!.pos - glintPose(GLINT_MS * 0.5)!.pos;
    expect(mid).toBeGreaterThan(early);
    expect(glintPose(GLINT_MS)).toBeNull();
  });
});
