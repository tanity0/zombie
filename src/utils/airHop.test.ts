import { describe, it, expect } from 'vitest';
import {
  airHopEase01, airHopEaseD01, airHopHeight01, AIR_HOP_RISE_END, AIR_HOP_FALL_START,
} from './airHop';

describe('airHopHeight01 — 綺麗な放物線(社長指示v0.25.3273。旧「フワッ……ダン!」v0.25.3077を上書き)', () => {
  it('★不変条件: 出発と着地はぴったり接地(浮いたまま着地しない)', () => {
    expect(airHopHeight01(0)).toBe(0);
    expect(airHopHeight01(1)).toBe(0);
    expect(airHopHeight01(1.4)).toBe(0);
  });

  it('頂点は中央(t=0.5)で高さ1=左右対称の弧', () => {
    expect(airHopHeight01(0.5)).toBeCloseTo(1, 6);
    expect(AIR_HOP_RISE_END).toBe(0.5);
    expect(AIR_HOP_FALL_START).toBe(0.5);
    for (let x = 0; x <= 0.5; x += 0.05) {
      expect(airHopHeight01(x)).toBeCloseTo(airHopHeight01(1 - x), 6); // 対称性
    }
  });

  it('放物線(自由落下と同型): 高さは1-(2t-1)^2 に一致', () => {
    for (let x = 0; x <= 1; x += 0.1) {
      const c = 2 * x - 1;
      expect(airHopHeight01(x)).toBeCloseTo(1 - c * c, 6);
    }
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
