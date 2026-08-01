import { describe, it, expect } from 'vitest';
import { windAt, isGusting, GUST_PERIOD_MS, GUST_MS, BREEZE_AMP } from './windGust';

const sample = (n: number, step: number, seed = 0): number[] =>
  Array.from({ length: n }, (_, i) => windAt(i * step, seed));

describe('風(社長要望「たまに風で揺らめかせられる？」)', () => {
  it('同じ時刻なら必ず同じ値(状態を持たない=描画側が毎フレーム引くだけでよい)', () => {
    expect(windAt(12345, 7)).toBe(windAt(12345, 7));
    expect(windAt(12345, 7)).not.toBe(windAt(12345, 8)); // 微風は種でずれる
  });

  it('★「たまに」であること: ほとんどの時間は微風だけ(吹きっぱなしにしない)', () => {
    const xs = sample(4000, 25);                       // 100秒ぶんを25ms刻み
    const strong = xs.filter(v => Math.abs(v) > 0.4).length / xs.length;
    expect(strong).toBeGreaterThan(0.01);              // まったく吹かないのも困る
    expect(strong).toBeLessThan(0.25);                 // 4分の1を超えたら「たまに」ではない
  });

  it('突風が無い間は微風の振れ幅に収まっている', () => {
    // 突風の窓に当たらない時刻だけを見る。
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
      const max = xs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
      peaks.push(max);
    }
    expect(peaks.some(v => v > 0.3)).toBe(true);
    expect(peaks.some(v => v < -0.3)).toBe(true);
  });

  it('急に飛ばない(隣り合うフレームで値が跳ねると炎がガタつく)', () => {
    const xs = sample(6000, 16);                       // 60fps 相当
    for (let i = 1; i < xs.length; i++) {
      expect(Math.abs(xs[i] - xs[i - 1])).toBeLessThan(0.06);
    }
  });

  it('強さは有界(炎が寝てしまうほど倒れない)', () => {
    const xs = sample(8000, 13);
    for (const v of xs) expect(Math.abs(v)).toBeLessThan(1.2);
  });
});
