import { describe, it, expect } from 'vitest';
import {
  parseWeather, weatherWetActive, ripplePose, RIPPLE_MS, RIPPLE_FRAMES, RIPPLE_SCALE_FROM, RIPPLE_SCALE_TO,
  dripHeight, DRIP_FALL_MS, DRIP_FALL_H, glintPose, GLINT_MS,
  rainDropSpec, rainPose, rainNextGapMs, RAIN_FALL_MS_MIN, RAIN_FALL_MS_MAX, RAIN_DROPS_PER_MPX_S, RAIN_MAX,
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

describe('ポツポツ雨(小雨の決めごと)', () => {
  const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

  it('粒の個性: 尺・長さ・濃さ・斜めが範囲に収まり、乱数でばらつく', () => {
    const lo = rainDropSpec(() => 0), hi = rainDropSpec(() => 0.999);
    expect(lo.fallMs).toBeCloseTo(RAIN_FALL_MS_MIN);
    expect(hi.fallMs).toBeLessThanOrEqual(RAIN_FALL_MS_MAX);
    expect(hi.len).toBeGreaterThan(lo.len * 2);
    expect(hi.alpha).toBeGreaterThan(lo.alpha);
    expect(hi.alpha).toBeLessThanOrEqual(0.8);
    expect(lo.slant).toBeGreaterThan(0);
    // 長い粒は少ない(中央値は短い側)
    const mid = rainDropSpec(() => 0.5);
    expect(mid.len - lo.len).toBeLessThan((hi.len - lo.len) / 2);
  });

  it('落下: 少し加速して落ち(初速は0でない)、着いたら null', () => {
    const s = rainDropSpec(seq(0.5));
    const p0 = rainPose(0, s)!;
    expect(p0.h).toBeCloseTo(s.height);
    expect(p0.alpha).toBe(0); // パッと出ない
    const q = s.fallMs / 4;
    const d1 = s.height - rainPose(q, s)!.h;
    const d4 = rainPose(q * 3, s)!.h - rainPose(s.fallMs - 1e-6, s)!.h;
    expect(d1).toBeGreaterThan(0);          // 出だしから動いている(画面外から落ちて来ている)
    expect(d4).toBeGreaterThan(d1 * 1.3);   // 後半ほど速い(加速)
    expect(rainPose(s.fallMs * 0.5, s)!.alpha).toBeCloseTo(1);
    expect(rainPose(s.fallMs - 1, s)!.len).toBeGreaterThan(p0.len); // 速くなるほど尾が伸びる
    expect(rainPose(s.fallMs, s)).toBeNull();
    expect(rainPose(-1, s)).toBeNull();
  });

  it('間隔: 可視域が広いほど詰まり、ばらつく。可視域0なら降らない', () => {
    const area = 1e6;
    const meanGap = 1000 / RAIN_DROPS_PER_MPX_S;
    let sum = 0; const n = 2000;
    for (let i = 0; i < n; i++) sum += rainNextGapMs(area, () => (i + 0.5) / n);
    expect(sum / n).toBeGreaterThan(meanGap * 0.85);
    expect(sum / n).toBeLessThan(meanGap * 1.15);
    expect(rainNextGapMs(area * 6.25, () => 0.5)).toBeCloseTo(rainNextGapMs(area, () => 0.5) / 6.25);
    expect(rainNextGapMs(area, () => 0.1)).toBeLessThan(rainNextGapMs(area, () => 0.9));
    expect(rainNextGapMs(0, () => 0.5)).toBe(Infinity);
  });

  it('小雨の量: 標準の可視域で同時に見える粒は数本・最大引きでも上限で止まる', () => {
    const avgFall = (RAIN_FALL_MS_MIN + RAIN_FALL_MS_MAX) / 2;
    const onScreen = (area: number) => (RAIN_DROPS_PER_MPX_S * area / 1e6) * (avgFall / 1000);
    expect(onScreen(1.1e6)).toBeGreaterThan(3);
    expect(onScreen(1.1e6)).toBeLessThan(12);
    expect(RAIN_MAX).toBeLessThanOrEqual(40);
  });
});
