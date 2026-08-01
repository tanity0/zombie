import { describe, it, expect, afterEach } from 'vitest';
import {
  windAt, windGustAt, windBreezeAt, isGusting,
  setWorldWindScale, getWorldWindScale, worldWindScaleFor,
  GUST_PERIOD_MS, GUST_MS, BREEZE_AMP, WIND_PHASE_SPREAD,
} from './windGust';

const sample = (n: number, step: number, seed = 0): number[] =>
  Array.from({ length: n }, (_, i) => windAt(i * step, seed));

afterEach(() => setWorldWindScale(1));

describe('風(社長要望「たまに風で揺らめかせられる？」)', () => {
  it('同じ時刻なら必ず同じ値(状態を持たない=描画側が毎フレーム引くだけでよい)', () => {
    expect(windAt(12345)).toBe(windAt(12345));
  });

  it('★世界で揃う: 種が違っても同じ値(社長指示v0.25.2648)', () => {
    // 炎・花・木がそれぞれ別の種を渡しても、風は1本=同じ向きへ倒れる。
    expect(WIND_PHASE_SPREAD).toBe(0);
    for (const t of [0, 1234, 5678, 20000]) {
      expect(windAt(t, 0)).toBe(windAt(t, 999));
      expect(windAt(t, -37.5)).toBe(windAt(t, 12.25));
    }
  });

  it('★「たまに」であること: ほとんどの時間は微風だけ(吹きっぱなしにしない)', () => {
    const xs = sample(4000, 25);                       // 100秒ぶんを25ms刻み
    const strong = xs.filter(v => Math.abs(v) > 0.4).length / xs.length;
    expect(strong).toBeGreaterThan(0.01);              // まったく吹かないのも困る
    expect(strong).toBeLessThan(0.25);                 // 4分の1を超えたら「たまに」ではない
  });

  it('突風が無い間は微風の振れ幅に収まっている', () => {
    const quiet = Array.from({ length: 4000 }, (_, i) => i * 25).filter(t => !isGusting(t));
    expect(quiet.length).toBeGreaterThan(0);
    for (const t of quiet) expect(Math.abs(windAt(t))).toBeLessThanOrEqual(BREEZE_AMP + 1e-9);
  });

  it('突風は1周期に1回、決められた長さだけ起きる', () => {
    for (let p = 0; p < 20; p++) {
      const base = p * GUST_PERIOD_MS;
      const on = Array.from({ length: GUST_PERIOD_MS / 10 }, (_, i) => base + i * 10)
        .filter(t => isGusting(t)).length * 10;
      expect(Math.abs(on - GUST_MS)).toBeLessThanOrEqual(20); // 刻みぶんの誤差だけ
    }
  });

  it('左右どちらへも吹く(いつも同じ方向に倒れない)', () => {
    const peaks: number[] = [];
    for (let p = 0; p < 40; p++) {
      const xs = Array.from({ length: 400 }, (_, i) => windAt(p * GUST_PERIOD_MS + i * 20));
      peaks.push(xs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0));
    }
    expect(peaks.some(v => v > 0.3)).toBe(true);
    expect(peaks.some(v => v < -0.3)).toBe(true);
  });

  it('急に飛ばない(隣り合うフレームで値が跳ねると炎や草木がガタつく)', () => {
    const xs = sample(6000, 16);                       // 60fps 相当
    for (let i = 1; i < xs.length; i++) {
      expect(Math.abs(xs[i] - xs[i - 1])).toBeLessThan(0.06);
    }
  });

  it('強さは有界(炎が寝てしまうほど倒れない)', () => {
    const xs = sample(8000, 13);
    for (const v of xs) expect(Math.abs(v)).toBeLessThan(1.2);
  });

  it('突風と微風を別々に引ける(描画側が突風だけ使いたい時のため)', () => {
    for (const t of [0, 3000, 9000]) {
      expect(windGustAt(t) + windBreezeAt(t)).toBeCloseTo(windAt(t), 10);
    }
  });
});

describe('世界の風の強さ(「変数か何かで」)', () => {
  it('倍率1つで世界中の風がまとめて変わる', () => {
    const t = 3500;
    const base = windAt(t);
    setWorldWindScale(2);
    expect(getWorldWindScale()).toBe(2);
    expect(windAt(t)).toBeCloseTo(base * 2, 10);
    setWorldWindScale(0);
    expect(windAt(t)).toBe(0);                          // 0=完全な無風
  });

  it('異常値は握り潰す(NaNで世界の揺れが全部壊れない)', () => {
    setWorldWindScale(NaN);
    expect(getWorldWindScale()).toBe(1);
    setWorldWindScale(-5);
    expect(getWorldWindScale()).toBe(0);
    setWorldWindScale(99);
    expect(getWorldWindScale()).toBe(3);                // 上限で頭打ち
  });

  it('★屋内は無風(好みではなく正しさ: 屋内で炎が風になびいたら嘘)', () => {
    expect(worldWindScaleFor({ indoor: true })).toBe(0);
    expect(worldWindScaleFor({ indoor: true, farBackdrop: 'snow' })).toBe(0);
  });

  it('雪原は強め / それ以外は標準(叩き台)', () => {
    expect(worldWindScaleFor({ indoor: false, farBackdrop: 'snow' })).toBeGreaterThan(1);
    expect(worldWindScaleFor({ indoor: false })).toBe(1);
    expect(worldWindScaleFor({ indoor: false, farBackdrop: 'city' })).toBe(1);
  });
});
