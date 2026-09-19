import { describe, it, expect, afterEach } from 'vitest';
import {
  windAt, windGustAt, windSwellAt, isGusting,
  setWorldWindScale, getWorldWindScale, worldWindScaleFor,
  GUST_PERIOD_MS, GUST_MS, SWELL_AMP, WIND_PHASE_SPREAD,
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

  // ★ここが v0.25.2652 で**意図ごと変わった**テスト。
  // 旧: 「たまに吹く(ほとんどの時間は止まっている)」/ 新: **「常に吹いていて強弱がある」**
  // (社長「止まる方が不自然。常に吹いてて大小の緩急があるくらいな感じ」)。
  it('★止まって見える時間が短い(常に吹いている)', () => {
    // 「止まって見える」= |風|<0.08 が **0.25秒以上続く**こと。一瞬の通過は目に留まらない。
    const step = 16;                                   // 60fps 相当
    const xs = sample(40000, step);                    // 約10分ぶん
    let still = 0, run = 0;
    for (const v of xs) {
      if (Math.abs(v) < 0.08) run += 1;
      else { if (run * step >= 250) still += run; run = 0; }
    }
    const frac = still / xs.length;
    // v0.25.2651(そよぎ+たまの突風)では **49%** が止まって見えていた。3波のうねりで 16% まで下げた。
    expect(frac).toBeLessThan(0.25);
  });

  it('★大小の緩急がある(強い時と弱い時の両方が出る)', () => {
    const xs = sample(40000, 16).map(Math.abs);
    expect(xs.filter(v => v > 0.55).length / xs.length).toBeGreaterThan(0.02); // 強い瞬間がある
    expect(xs.filter(v => v < 0.20).length / xs.length).toBeGreaterThan(0.15); // 弱い時間もある
  });

  it('突風が無い間はうねりの振れ幅に収まっている', () => {
    const quiet = Array.from({ length: 4000 }, (_, i) => i * 25).filter(t => !isGusting(t));
    expect(quiet.length).toBeGreaterThan(0);
    for (const t of quiet) expect(Math.abs(windAt(t))).toBeLessThanOrEqual(SWELL_AMP + 1e-9);
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
    // ★M7(2.3倍)がこれに掛かるので、**上限を上げると一番強いステージが破綻する**。
    // 常時のうねりを足した v0.25.2652 でも、突風の強さを下げて合計の天井は据え置いてある。
    const xs = sample(40000, 13);
    for (const v of xs) expect(Math.abs(v)).toBeLessThan(1.15);
  });

  it('突風とうねりを別々に引ける(描画側が突風だけ使いたい時のため)', () => {
    for (const t of [0, 3000, 9000]) {
      expect(windGustAt(t) + windSwellAt(t)).toBeCloseTo(windAt(t), 10);
    }
  });

  it('うねりの周期は互いに割り切れない(揃うと周期的な"呼吸"に見える)', () => {
    const ps = [3400, 1620, 820];
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        expect(ps[i] % ps[j], `${ps[i]} が ${ps[j]} の倍数`).not.toBe(0);
      }
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
    expect(Math.abs(windAt(t))).toBe(0);                // 0=完全な無風(符号付きゼロは同一視)
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

  it('★ステージごとの強さの序列(社長指示: M7 > M4 > M3 > 標準 > 屋内)', () => {
    const s7 = worldWindScaleFor({ indoor: false, farBackdrop: 'stage7' });   // M7 逆探知地点
    const snow = worldWindScaleFor({ indoor: false, farBackdrop: 'snow' });   // M4 封鎖地域
    const city = worldWindScaleFor({ indoor: false, farBackdrop: 'city' });   // M3 廃都
    const plain = worldWindScaleFor({ indoor: false });                       // 森など
    const inside = worldWindScaleFor({ indoor: true });
    // 縛るのは**数字ではなく順序**(=社長指示の意図)。微調整でテストが落ちないようにする。
    expect(inside).toBeLessThan(plain);
    expect(plain).toBe(1);
    expect(city).toBeGreaterThan(plain);
    expect(snow).toBeGreaterThan(city);
    expect(s7).toBeGreaterThan(snow);
  });

  it('どのステージでも上限(3)を超えない=倍率の握り潰しに掛からない', () => {
    for (const fb of ['stage7', 'snow', 'city', 'tutorial', 'stage5', undefined]) {
      const v = worldWindScaleFor({ indoor: false, farBackdrop: fb });
      setWorldWindScale(v);
      expect(getWorldWindScale(), `farBackdrop=${String(fb)}`).toBe(v);
    }
  });
});
