import { describe, it, expect } from 'vitest';
import { computeViewport, VIEW_CORE_W, VIEW_CORE_H, VIEW_MAX_W, VIEW_MAX_H, VIEW_PC_H, VIEW_PC_MAX_W, hudScaleFor } from './viewport';

// 本作は縦持ち専用。固定ビューの不変条件:
//  ・論理寸法×scale = 実寸(=画面をちょうど埋める。黒帯が出ない)。
//  ・コアは原則全部見える(logical ≥ コア)。ただし極端アスペクトでクランプが勝つ場合のみ反対軸が僅かに減る。
//  ・伸ばし軸は MAX を超えない。
describe('computeViewport (portrait)', () => {
  const fills = (w: number, h: number) => {
    const v = computeViewport(w, h);
    expect(v.logicalW * v.scale).toBeCloseTo(w, 3); // 黒帯なし(横)
    expect(v.logicalH * v.scale).toBeCloseTo(h, 3); // 黒帯なし(縦)
    return v;
  };

  it('9:16 はコアちょうど(伸ばし無し)', () => {
    const v = fills(1080, 1920);
    expect(v.logicalW).toBeCloseTo(VIEW_CORE_W, 3);
    expect(v.logicalH).toBeCloseTo(VIEW_CORE_H, 3);
  });

  it('縦長スマホ(9:19.5)は縦へ伸び、横はコア維持', () => {
    const v = fills(1080, 2340); // 9:19.5
    expect(v.logicalW).toBeCloseTo(VIEW_CORE_W, 3); // 横=コア(binding)
    expect(v.logicalH).toBeGreaterThan(VIEW_CORE_H); // 縦が伸びる
    expect(v.logicalH).toBeLessThanOrEqual(VIEW_MAX_H + 1e-6); // 上限内
  });

  it('タブレット(3:4)は横へ伸び、縦はコア維持', () => {
    const v = fills(1620, 2160); // 3:4 portrait
    expect(v.logicalH).toBeCloseTo(VIEW_CORE_H, 3); // 縦=コア(binding)
    expect(v.logicalW).toBeGreaterThan(VIEW_CORE_W); // 横が伸びる
    expect(v.logicalW).toBeLessThanOrEqual(VIEW_MAX_W + 1e-6); // 上限内
  });

  it('極端縦長(9:22)は縦を MAX で頭打ち(黒帯なし)', () => {
    const v = fills(1080, 2640); // 9:22
    expect(v.logicalH).toBeLessThanOrEqual(VIEW_MAX_H + 1e-6);
    expect(v.logicalW).toBeLessThan(VIEW_CORE_W); // クランプが勝ち横が僅かに減る
  });

  it('どのアスペクトでも伸ばし軸は MAX を超えない', () => {
    for (const [w, h] of [[1080, 1920], [1080, 2340], [1620, 2160], [1080, 2640], [1200, 1920]]) {
      const v = computeViewport(w, h);
      expect(v.logicalW).toBeLessThanOrEqual(VIEW_MAX_W + 1e-6);
      expect(v.logicalH).toBeLessThanOrEqual(VIEW_MAX_H + 1e-6);
    }
  });
});

describe('computeViewport (横長=PC・research/PC_SUPPORT.md)', () => {
  it('16:9 は 1280×720(縦はスマホが必ず見せている高さと同じ)', () => {
    for (const [w, h] of [[1920, 1080], [1280, 720], [2560, 1440], [1366, 768]]) {
      const v = computeViewport(w, h);
      expect(v.logicalH).toBeCloseTo(VIEW_PC_H, 0);
      expect(v.logicalW).toBeCloseTo(VIEW_PC_MAX_W, 0);
    }
    expect(VIEW_PC_H).toBe(VIEW_CORE_H);
  });
  it('16:10・4:3 は縦720のまま横が狭くなる', () => {
    expect(computeViewport(1920, 1200).logicalW).toBeCloseTo(1152, 0);
    expect(computeViewport(1024, 768).logicalW).toBeCloseTo(960, 0);
    expect(computeViewport(1024, 768).logicalH).toBeCloseTo(720, 0);
  });
  it('枠が絞られていないウルトラワイドでも横は1280で頭打ち(見せ過ぎない)', () => {
    const v = computeViewport(3440, 1440);
    expect(v.logicalW).toBeLessThanOrEqual(VIEW_PC_MAX_W + 1e-6);
  });
  it('縦持ちの結果は変わらない(430×932)', () => {
    const v = computeViewport(430, 932);
    expect(v.logicalW).toBeCloseTo(VIEW_CORE_W, 3);
    expect(v.logicalH).toBeCloseTo(932 / (430 / VIEW_CORE_W), 3);
    expect(v.scale).toBeCloseTo(430 / VIEW_CORE_W, 6);
  });
  it('縦持ち⇔横長の境目で視野が跳ばない(3:4で両方の式が540×720に一致・正方形は720×720)', () => {
    const a = computeViewport(1080, 1440 + 1e-6);   // ほぼ3:4(縦持ち側)
    const b = computeViewport(1080, 1440 - 1e-6);   // ほぼ3:4(横長側)
    expect(a.logicalW).toBeCloseTo(b.logicalW, 3);
    expect(a.logicalH).toBeCloseTo(b.logicalH, 3);
    expect(computeViewport(1000, 1000).logicalW).toBeCloseTo(720, 3);
    expect(Math.abs(computeViewport(1000, 1001).logicalW - computeViewport(1000, 999).logicalW)).toBeLessThan(3); // 窓が1px変わっても数px
  });
});

describe('hudScaleFor(PC の HUD の倍率)', () => {
  it('縦持ちは常に1(スマホの HUD は変えない)', () => {
    expect(hudScaleFor(430, 932)).toBe(1);
    expect(hudScaleFor(1080, 2340)).toBe(1);
  });
  it('横長は枠の高さ/720 を 1 / 1.25 / 1.5 / 2 の段に丸める(ドット絵のアイコンを不揃いにしない)', () => {
    expect(hudScaleFor(1280, 720)).toBe(1);
    expect(hudScaleFor(1366, 768)).toBe(1);
    expect(hudScaleFor(1600, 900)).toBe(1.25);
    expect(hudScaleFor(1920, 1080)).toBe(1.5);
    expect(hudScaleFor(2560, 1440)).toBe(2);
    expect(hudScaleFor(3840, 2160)).toBe(2);
  });
});
