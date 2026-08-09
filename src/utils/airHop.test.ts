import { describe, it, expect } from 'vitest';
import { airHopEase01, airHopEaseD01 } from './airHop';

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
