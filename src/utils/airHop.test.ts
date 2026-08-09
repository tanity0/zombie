import { describe, it, expect } from 'vitest';
import {
  airHopEase01, airHopEaseD01, airHopHeight01, AIR_HOP_RISE_END, AIR_HOP_FALL_START,
} from './airHop';

describe('airHopHeight01 — 「フワッ……ダン!」の高さ曲線(社長指示v0.25.3077)', () => {
  it('★不変条件: 出発と着地はぴったり接地(浮いたまま着地しない)', () => {
    expect(airHopHeight01(0)).toBe(0);
    expect(airHopHeight01(1)).toBe(0);
    expect(airHopHeight01(1.4)).toBe(0);
  });

  it('飛び上がりは早い: 全体の1/4で頂点まで上がる(旧sin(t·π)は半分かかっていた)', () => {
    expect(airHopHeight01(AIR_HOP_RISE_END)).toBeCloseTo(1, 6);
    expect(airHopHeight01(0.13)).toBeGreaterThan(0.6); // 序盤で既に高い
    expect(Math.sin(0.13 * Math.PI)).toBeLessThan(0.45); // 旧曲線との差(この時点ではまだ低かった)
  });

  it('滞空(フワッ)がある: 上りきってから落ち始めるまで、高さが頂点付近に留まる', () => {
    for (let x = AIR_HOP_RISE_END; x <= AIR_HOP_FALL_START; x += 0.02) {
      expect(airHopHeight01(x)).toBeGreaterThan(0.9);
    }
    expect(AIR_HOP_FALL_START - AIR_HOP_RISE_END).toBeGreaterThan(0.3); // 滞空が全体の3割以上
  });

  it('落下は加速する(ダン!): 後半ほど1コマあたりの落ち幅が大きい', () => {
    const d1 = airHopHeight01(0.72) - airHopHeight01(0.76);
    const d2 = airHopHeight01(0.94) - airHopHeight01(0.98);
    expect(d2).toBeGreaterThan(d1 * 2);
  });
});

describe('airHopEase01 — 空中移動の補間(カクつき対策)', () => {
  it('★不変条件: 始点と終点は1pxも動かさない(着地点がズレたら判定と絵が食い違う)', () => {
    expect(airHopEase01(0)).toBe(0);
    expect(airHopEase01(1)).toBe(1);
    // 範囲外は端で止める(dtの揺れでオーバーシュートさせない)。
    expect(airHopEase01(-0.5)).toBe(0);
    expect(airHopEase01(1.5)).toBe(1);
  });

  it('★不変条件: 両端で速度が0=飛び出しと着地の角が消える(これがカクつきの正体)', () => {
    expect(airHopEaseD01(0)).toBe(0);
    expect(airHopEaseD01(1)).toBe(0);
    expect(airHopEaseD01(0.5)).toBeGreaterThan(1); // 中盤が一番速い
  });

  it('後戻りしない(単調増加)=飛行中に一瞬引き返して見えることがない', () => {
    let prev = -1;
    for (let i = 0; i <= 40; i++) {
      const v = airHopEase01(i / 40);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('中間で半分だけ進む(前後対称)=着地に向けて偏らない', () => {
    expect(airHopEase01(0.5)).toBeCloseTo(0.5, 6);
    expect(airHopEase01(0.25) + airHopEase01(0.75)).toBeCloseTo(1, 6);
  });
});
