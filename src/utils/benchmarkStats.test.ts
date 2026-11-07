import { describe, it, expect } from 'vitest';
import {
  canaryDriftMs,
  driftAdjustedDeltaMs,
  frameCostMs,
  frameIntervals,
  isSignificantDelta,
  slidingMinFps,
  slowFrameRatio,
  stageDeltaMs,
  summarizeFrames,
} from './benchmarkStats';

/** 一定fpsのフレーム時刻列を作る(from ms から seconds 秒ぶん)。 */
const stream = (fps: number, seconds: number, from = 0): number[] => {
  const dt = 1000 / fps;
  const out: number[] = [];
  for (let t = from; t <= from + seconds * 1000 + 1e-6; t += dt) out.push(t);
  return out;
};

describe('frameIntervals', () => {
  it('間隔だけを返し、0以下(同時刻/巻き戻り)は捨てる', () => {
    expect(frameIntervals([0, 10, 10, 30, 25, 45])).toEqual([10, 20, 20]);
  });
  it('1フレーム以下では空', () => {
    expect(frameIntervals([5])).toEqual([]);
  });
});

describe('summarizeFrames', () => {
  it('一定60fpsを60fpsと読む(ばらつき0)', () => {
    const s = summarizeFrames(stream(60, 3));
    expect(s.avgFps).toBeCloseTo(60, 5);
    expect(s.sdMs).toBeCloseTo(0, 6);
    expect(s.p95Ms).toBeCloseTo(1000 / 60, 5);
    expect(s.frames).toBeGreaterThan(170);
    expect(s.spanMs).toBeCloseTo(3000, 5);
  });

  it('★旧実装との差: 2.4秒の計測でも100超の観測が取れる(旧は2〜3個)', () => {
    expect(summarizeFrames(stream(45, 2.4)).frames).toBeGreaterThan(100);
  });

  it('落ち込みは minFps に出る(平均には埋もれる)', () => {
    // 2秒 60fps → 1秒 20fps。平均は落ち込みで薄まるが、最悪1秒窓は20付近を指す。
    const fast = stream(60, 2);
    const slow = stream(20, 1, fast[fast.length - 1] + 50);
    const s = summarizeFrames([...fast, ...slow]);
    expect(s.minFps).toBeLessThanOrEqual(22);
    expect(s.avgFps).toBeGreaterThan(s.minFps);
    expect(s.p95Ms).toBeGreaterThan(40); // 50ms付近のフレームがp95に出る
  });

  it('空/1フレームは0を返す(NaNを出さない)', () => {
    expect(summarizeFrames([]).avgFps).toBe(0);
    expect(summarizeFrames([12]).frames).toBe(0);
  });
});

describe('slidingMinFps', () => {
  it('一定60fpsならほぼ60', () => {
    const v = slidingMinFps(stream(60, 3));
    expect(v).toBeGreaterThanOrEqual(59);
    expect(v).toBeLessThanOrEqual(61);
  });

  it('計測窓が1秒未満なら全体レートで代用する', () => {
    // 0.5秒ぶんの30fps=15フレーム → 約30fps と読む。
    expect(slidingMinFps(stream(30, 0.5))).toBeCloseTo(30, 0);
  });

  it('★窓をずらすので、境界をまたぐ落ち込みも拾える', () => {
    // 前半0.6秒60fps → 後半0.6秒15fps。1秒の固定窓(旧実装)だと両者が混ざって薄まるが、
    // スライド窓なら「遅い側に寄った窓」が最悪値を捉える。
    const fast = stream(60, 0.6);
    const slow = stream(15, 1.2, fast[fast.length - 1] + 66);
    expect(slidingMinFps([...fast, ...slow])).toBeLessThan(30);
  });
});

describe('slowFrameRatio', () => {
  it('60fps一定なら遅いフレームは0割', () => {
    expect(slowFrameRatio(stream(60, 2))).toBe(0);
  });
  it('30fps一定なら全部が40fps未満', () => {
    expect(slowFrameRatio(stream(30, 2))).toBe(1);
  });
  it('半分だけ遅いなら約5割', () => {
    const fast = stream(60, 1);
    const slow = stream(30, 2, fast[fast.length - 1] + 33);
    // 60fpsで1秒=60間隔・30fpsで2秒=60間隔 → 約半分
    expect(slowFrameRatio([...fast, ...slow])).toBeGreaterThan(0.45);
    expect(slowFrameRatio([...fast, ...slow])).toBeLessThan(0.55);
  });
  it('空なら0(NaNを出さない)', () => {
    expect(slowFrameRatio([])).toBe(0);
  });
});

describe('Δms(基準段との差)', () => {
  it('frameCostMs は fps の逆数(0以下は0)', () => {
    expect(frameCostMs(60)).toBeCloseTo(16.667, 3);
    expect(frameCostMs(0)).toBe(0);
    expect(frameCostMs(-5)).toBe(0);
  });

  it('30fps の段が 60fps の基準段に対して +16.7ms', () => {
    expect(stageDeltaMs(30, 60)).toBeCloseTo(16.667, 3);
  });

  it('★熱で全体が遅くなってもΔは保たれる(実行順をまたいで比較できる)', () => {
    // 冷えている時: 基準60fps / 段40fps → Δ = 25 - 16.67 = 8.33ms
    const cold = stageDeltaMs(40, 60);
    // 熱い時: 端末全体が1フレーム+8ms遅い(基準 24.67ms=40.5fps / 段 33ms=30.3fps)
    const hot = stageDeltaMs(1000 / 33, 1000 / 24.667);
    expect(cold).toBeCloseTo(8.333, 2);
    expect(hot).toBeCloseTo(8.333, 1);
  });

  it('未計測(0)は0を返す', () => {
    expect(stageDeltaMs(0, 60)).toBe(0);
    expect(stageDeltaMs(40, 0)).toBe(0);
  });
});

describe('driftAdjustedDeltaMs(熱ダレ補正)', () => {
  it('最初の段(経過0)は補正されない', () => {
    expect(driftAdjustedDeltaMs(7.2, 0, 20000, 4.5)).toBeCloseTo(7.2, 5);
  });
  it('検算段の位置(経過=span)では shift をまるごと引く', () => {
    expect(driftAdjustedDeltaMs(11.7, 20000, 20000, 4.5)).toBeCloseTo(7.2, 5);
  });
  it('途中の段は経過時間で按分する', () => {
    // 半分の時点なら shift の半分を引く
    expect(driftAdjustedDeltaMs(6.1, 10000, 20000, 4.5)).toBeCloseTo(6.1 - 2.25, 5);
  });
  it('ドリフトが無ければ生値のまま', () => {
    expect(driftAdjustedDeltaMs(2.2, 8000, 20000, 0)).toBeCloseTo(2.2, 5);
  });
  it('spanが取れない(検算段なし)なら生値のまま', () => {
    expect(driftAdjustedDeltaMs(2.2, 8000, 0, 4.5)).toBe(2.2);
  });
  it('範囲外の経過時間でも按分は0..1に収まる', () => {
    expect(driftAdjustedDeltaMs(5, 30000, 20000, 4)).toBeCloseTo(1, 5);
    expect(driftAdjustedDeltaMs(5, -100, 20000, 4)).toBeCloseTo(5, 5);
  });
});

describe('canaryDriftMs', () => {
  it('基準段が遅くなった分だけ正の値', () => {
    expect(canaryDriftMs([60, 50, 40])).toBeCloseTo(25 - 16.667, 2);
  });
  it('1本以下ではドリフトを主張しない', () => {
    expect(canaryDriftMs([55])).toBe(0);
    expect(canaryDriftMs([])).toBe(0);
  });
});

describe('isSignificantDelta', () => {
  it('同じ計測どうしは有意でない', () => {
    const a = summarizeFrames(stream(45, 2.4));
    expect(isSignificantDelta(a, a)).toBe(false);
  });

  it('35fps と 58fps は有意', () => {
    const a = summarizeFrames(stream(35, 2.4));
    const b = summarizeFrames(stream(58, 2.4));
    expect(isSignificantDelta(a, b)).toBe(true);
  });

  it('観測数が足りなければ有意と言わない(旧実装の解像度では判定不能)', () => {
    const few = summarizeFrames([0, 20, 40]);
    const many = summarizeFrames(stream(58, 2.4));
    expect(isSignificantDelta(few, many)).toBe(false);
  });
});
