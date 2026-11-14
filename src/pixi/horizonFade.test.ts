// 地平線フェード帯の幅(社長裁定v0.25.2334=案A → v0.25.2346=案A-2へ改訂)。
// **最重要の不変条件は「縦持ちの見え方を変えないこと」**。ここが崩れると社長が実機で見ている絵が変わる。
// A-2 の要点: **縦持ちは端末を問わず常に120px固定**(初版A-1は iPhone SE だけ100.9pxになっていた)。
// 横持ちを遊ばない以上、使わないモードのために縦持ちの最小端末を変えるのは損しかない、という裁定。
import { describe, it, expect } from 'vitest';
import { horizonActorFadePx, HORIZON_ACTOR_FADE_PX, HORIZON_FADE_MIN_PX } from './renderSpec';

// 実測値(v0.25.2331のテスト・?smoke stage-1 で計測): 論理画面サイズ。論理幅は端末比率のまま。
const PORTRAIT = { w: 405, h: 876 };    // 390×844 の端末(主力)
const SE = { w: 405, h: 720 };          // 375×667 の iPhone SE(いちばん背が低い縦持ち)
const LANDSCAPE = { w: 540, h: 338 };   // 1280×800 のPC

describe('horizonActorFadePx', () => {
  it('縦持ちは従来と完全に同値(120px)=実機の見え方を1pxも変えない', () => {
    expect(horizonActorFadePx(PORTRAIT.h, PORTRAIT.w)).toBe(HORIZON_ACTOR_FADE_PX);
  });

  // A-2 の核心。A-1 ではここが 100.9px になっていた(=SEだけ絵が変わる)。
  it('**背の低い縦持ち端末(iPhone SE)でも120px**=縦持ちは端末で変わらない', () => {
    expect(horizonActorFadePx(SE.h, SE.w)).toBe(HORIZON_ACTOR_FADE_PX);
    expect(SE.h * 0.14).toBeLessThan(HORIZON_ACTOR_FADE_PX); // 比例式なら120未満になる高さであることを明示
  });

  it('あらゆる縦持ち(正方形ぎりぎり〜超縦長)で120pxに張り付く', () => {
    for (const h of [406, 500, SE.h, 800, PORTRAIT.h, 1000, 1400, 2000]) {
      expect(horizonActorFadePx(h, 405)).toBe(HORIZON_ACTOR_FADE_PX);
    }
  });

  it('横持ちでは帯が縮む(全アクターが薄くなる欠陥の是正)', () => {
    const px = horizonActorFadePx(LANDSCAPE.h, LANDSCAPE.w);
    expect(px).toBeLessThan(HORIZON_ACTOR_FADE_PX);
    expect(px).toBeCloseTo(LANDSCAPE.h * 0.14, 6);
  });

  it('横持ちで足元の建物の alpha が実用域まで戻る(実測 0.216 → 0.5超)', () => {
    // 実測: 地平線のworldYは -26、病院の足元は 0(=差 26px)。
    const gap = 26;
    expect(gap / HORIZON_ACTOR_FADE_PX).toBeCloseTo(0.217, 2);                       // 修正前(実測 0.216 と一致)
    expect(gap / horizonActorFadePx(LANDSCAPE.h, LANDSCAPE.w)).toBeGreaterThan(0.5); // 修正後
  });

  it('正方形(h===w)は縦持ち側に倒す(境界で横持ちの縮みを誤発動させない)', () => {
    expect(horizonActorFadePx(500, 500)).toBe(HORIZON_ACTOR_FADE_PX);
    expect(horizonActorFadePx(500, 501)).toBeLessThan(HORIZON_ACTOR_FADE_PX);
  });

  it('帯は決して0にならない(アクターが地平線でパツンと切れない)', () => {
    for (const h of [1, 10, 100, 0.5]) expect(horizonActorFadePx(h, h * 3)).toBeGreaterThanOrEqual(HORIZON_FADE_MIN_PX);
  });

  it('壊れた値(0/負/NaN)でも従来値へ落ちる', () => {
    for (const h of [0, -100, NaN, Infinity]) {
      const px = horizonActorFadePx(h, 540);
      expect(Number.isFinite(px)).toBe(true);
      expect(px).toBeGreaterThanOrEqual(HORIZON_FADE_MIN_PX);
    }
    // 幅が取れていない時は**縦持ち扱い=従来値**へ倒す(誤検出で縦の絵を変えない)。
    for (const w of [0, -1, NaN, Infinity]) {
      expect(horizonActorFadePx(338, w)).toBe(HORIZON_ACTOR_FADE_PX);
    }
  });

  it('横持ちの中では、画面が高いほど帯は広い(単調非減少)', () => {
    let prev = 0;
    for (const h of [50, 150, 338, 500, 700, 850]) {
      const px = horizonActorFadePx(h, 1000); // 常に横持ち(w=1000)
      expect(px).toBeGreaterThanOrEqual(prev);
      prev = px;
    }
  });
});
