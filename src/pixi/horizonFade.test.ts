// 地平線フェード帯の幅(社長裁定v0.25.2334・案A)。
// **最重要の不変条件は「縦持ちの見え方を変えないこと」**。ここが崩れると社長が実機で見ている絵が変わる。
import { describe, it, expect } from 'vitest';
import { horizonActorFadePx, HORIZON_ACTOR_FADE_PX, HORIZON_FADE_MIN_PX } from './renderSpec';

// 実測値(v0.25.2331のテスト・?smoke stage-1 で計測): 論理画面高。
const PORTRAIT_H = 876;   // 390×844 の端末
const LANDSCAPE_H = 338;  // 1280×800 のPC

describe('horizonActorFadePx', () => {
  it('縦持ちは従来と完全に同値(120px)=実機の見え方を1pxも変えない', () => {
    expect(horizonActorFadePx(PORTRAIT_H)).toBe(HORIZON_ACTOR_FADE_PX);
  });

  it('縦持ちの周辺(もっと縦長の端末含む)でも120pxに張り付く', () => {
    for (const h of [PORTRAIT_H, 900, 1000, 1400, 2000]) {
      expect(horizonActorFadePx(h)).toBe(HORIZON_ACTOR_FADE_PX);
    }
  });

  it('横持ちでは帯が縮む(全アクターが薄くなる欠陥の是正)', () => {
    const px = horizonActorFadePx(LANDSCAPE_H);
    expect(px).toBeLessThan(HORIZON_ACTOR_FADE_PX);
    expect(px).toBeCloseTo(LANDSCAPE_H * 0.14, 6);
  });

  it('横持ちで足元の建物の alpha が実用域まで戻る(実測 0.216 → 0.5超)', () => {
    // 実測: 地平線のworldYは -26、病院の足元は 0(=差 26px)。
    const gap = 26;
    expect(gap / HORIZON_ACTOR_FADE_PX).toBeCloseTo(0.217, 2);      // 修正前(実測 0.216 と一致)
    expect(gap / horizonActorFadePx(LANDSCAPE_H)).toBeGreaterThan(0.5); // 修正後
  });

  it('帯は決して0にならない(アクターが地平線でパツンと切れない)', () => {
    for (const h of [1, 10, 100, 0.5]) expect(horizonActorFadePx(h)).toBeGreaterThanOrEqual(HORIZON_FADE_MIN_PX);
  });

  it('壊れた値(0/負/NaN)でも従来値へ落ちる', () => {
    for (const h of [0, -100, NaN, Infinity]) {
      const px = horizonActorFadePx(h);
      expect(Number.isFinite(px)).toBe(true);
      expect(px).toBeGreaterThanOrEqual(HORIZON_FADE_MIN_PX);
    }
  });

  it('画面が高いほど帯は広い(単調非減少)', () => {
    let prev = 0;
    for (const h of [50, 150, 338, 500, 700, 876, 1200]) {
      const px = horizonActorFadePx(h);
      expect(px).toBeGreaterThanOrEqual(prev);
      prev = px;
    }
  });
});
