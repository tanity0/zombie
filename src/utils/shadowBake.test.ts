import { describe, it, expect } from 'vitest';
import {
  SHADOW_CONTENT_FRAC_MIN, contentSpanFrac, needsContentTrim, contentTrimFrameY, contentTrimFrameX,
  contentCenterFrac, penumbraWidth,
} from './shadowBake';

// research/LIGHT_REWORK.md §3-9-C ★D-2 の受け入れ条件を機械化する。
// 実測値の出どころ: `public/sprites` 614枚の全走査(§D-2 の表)。

describe('needsContentTrim / contentSpanFrac — 空白の無い素材は1pxも変えない', () => {
  it('top=0 bottom=1(610枚)は切り詰めない・割合はちょうど1', () => {
    expect(needsContentTrim(0, 1)).toBe(false);
    expect(contentSpanFrac(0, 1)).toBe(1);
  });

  it('下側に空白のある4枚は切り詰める', () => {
    // jormungand.png: 高さ960 / 下の空白192px ⇒ bottom = 768/960 = 0.8
    expect(needsContentTrim(0, 768 / 960)).toBe(true);
    expect(contentSpanFrac(0, 768 / 960)).toBeCloseTo(0.8, 6);
    // flower-5.png: 高さ343 / 下の空白57px
    expect(needsContentTrim(0, (343 - 57) / 343)).toBe(true);
    // flower-7.png(社長報告の「ラベンダーっぽいやつ」): 高さ342 / 下の空白54px
    expect(needsContentTrim(0, (342 - 54) / 342)).toBe(true);
  });

  it('上側だけに空白がある素材も切り詰める(長さ=見えている絵の高さ)', () => {
    expect(needsContentTrim(0.1, 1)).toBe(true);
    expect(contentSpanFrac(0.1, 1)).toBeCloseTo(0.9, 6);
  });

  it('中身が測れなかった時(bottom<=top / NaN)は触らない', () => {
    expect(needsContentTrim(1, 1)).toBe(false);
    expect(needsContentTrim(0.8, 0.2)).toBe(false);
    expect(needsContentTrim(NaN, 1)).toBe(false);
    expect(contentSpanFrac(NaN, 1)).toBe(1);
  });

  it('ほぼ空のテクスチャでも割合は下限で止まる(長さ0にしない)', () => {
    expect(contentSpanFrac(0.5, 0.5001)).toBe(SHADOW_CONTENT_FRAC_MIN);
  });
});

describe('contentTrimFrameY — 焼く時に使う frame 矩形', () => {
  it('空白が無ければ元の frame と同じ', () => {
    expect(contentTrimFrameY(0, 512, 0, 1)).toEqual({ y: 0, height: 512 });
  });

  it('jormungand: 960 のうち下192pxを落とす', () => {
    expect(contentTrimFrameY(0, 960, 0, 768 / 960)).toEqual({ y: 0, height: 768 });
  });

  it('アトラス内(frameY オフセットあり)でも元の frame の内側に収まる', () => {
    const r = contentTrimFrameY(100, 342, 0, (342 - 54) / 342);
    expect(r.y).toBe(100);
    expect(r.height).toBe(288);
    expect(r.y + r.height).toBeLessThanOrEqual(100 + 342);
  });

  it('どんな入力でも高さ1px以上・frame の外へ出ない', () => {
    for (const [top, bottom] of [[0, 0], [1, 1], [-5, 5], [0.9999, 1], [0.5, 0.5]] as const) {
      const r = contentTrimFrameY(7, 100, top, bottom);
      expect(r.height).toBeGreaterThanOrEqual(1);
      expect(r.y).toBeGreaterThanOrEqual(7);
      expect(r.y + r.height).toBeLessThanOrEqual(107);
    }
  });
});

// research/LIGHT_REWORK.md ★D-2b「影の起点を絵の足元の中央にする(縦横両方)」の受け入れ条件。
// 横(left/right)は縦(top/bottom)と全く同じ式を共有しているので、既存の縦のテスト(上)が
// そのまま横の正しさの根拠にもなる——ここでは横専用の関数(contentTrimFrameX/contentCenterFrac)
// と、jormungand/flower等の実測値を横方向の入力として流した時の形だけ追加で固定する。
describe('contentTrimFrameX — contentTrimFrameY の横版(式は共通)', () => {
  it('左右に余白が無ければ元の frame と同じ', () => {
    expect(contentTrimFrameX(0, 512, 0, 1)).toEqual({ x: 0, width: 512 });
  });

  it('縦(contentTrimFrameY)と入力が同じなら結果の形も同じ(x/width ⇔ y/height)', () => {
    const y = contentTrimFrameY(100, 342, 0, (342 - 54) / 342);
    const x = contentTrimFrameX(100, 342, 0, (342 - 54) / 342);
    expect(x).toEqual({ x: y.y, width: y.height });
  });

  it('どんな入力でも幅1px以上・frame の外へ出ない', () => {
    for (const [left, right] of [[0, 0], [1, 1], [-5, 5], [0.9999, 1], [0.5, 0.5]] as const) {
      const r = contentTrimFrameX(7, 100, left, right);
      expect(r.width).toBeGreaterThanOrEqual(1);
      expect(r.x).toBeGreaterThanOrEqual(7);
      expect(r.x + r.width).toBeLessThanOrEqual(107);
    }
  });
});

describe('contentCenterFrac — 影の起点(footX/footY)を絵の実体の中心へ寄せる量', () => {
  it('左右(上下)に余白が無ければ、ちょうど中央=0.5(★オフセット0=1pxも変わらない)', () => {
    expect(contentCenterFrac(0, 1)).toBe(0.5);
  });

  it('片側だけ余白がある素材は中心が0.5からズレる(オフセットが生まれる)', () => {
    // 右に30%の余白 ⇒ 実体は [0, 0.7] ⇒ 中心=0.35(左へ寄る)
    expect(contentCenterFrac(0, 0.7)).toBeCloseTo(0.35, 6);
    // 左に30%の余白 ⇒ 実体は [0.3, 1] ⇒ 中心=0.65(右へ寄る)
    expect(contentCenterFrac(0.3, 1)).toBeCloseTo(0.65, 6);
  });

  it('中身が測れなかった時(NaN)は無補正(0.5)へフォールバックする', () => {
    expect(contentCenterFrac(NaN, 1)).toBe(0.5);
  });

  it('範囲外の入力はクランプされる(0..1の外へは出ない)', () => {
    expect(contentCenterFrac(-5, 5)).toBe(0.5); // クランプ後 [0,1] ⇒ 中心0.5
    expect(contentCenterFrac(2, 3)).toBe(1);    // クランプ後 [1,1] ⇒ 中心1
  });
});

describe('penumbraWidth — 半影は足元で硬く先端で広い(§3-9-C ★A の確定式)', () => {
  const K0 = 0.06, K1 = 0.86, POW = 1.15;
  it('端点が確定値どおり', () => {
    expect(penumbraWidth(0, K0, K1, POW)).toBeCloseTo(K0, 6);
    expect(penumbraWidth(1, K0, K1, POW)).toBeCloseTo(K1, 6);
  });
  it('足元→先端で単調に広がる', () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const k = penumbraWidth(i / 20, K0, K1, POW);
      expect(k).toBeGreaterThan(prev);
      prev = k;
    }
  });
  it('★先端でも本影が残る(k<1 ⇒ smoothstep の上限に届く画素が必ずある)', () => {
    // k=1 だと a_soft=1 の中心でも smoothstep が 1 に届かず、先端中央の本影が消える。
    expect(penumbraWidth(1, K0, K1, POW)).toBeLessThan(1);
  });
  it('範囲外の t はクランプされる', () => {
    expect(penumbraWidth(-1, K0, K1, POW)).toBeCloseTo(K0, 6);
    expect(penumbraWidth(2, K0, K1, POW)).toBeCloseTo(K1, 6);
  });
});
