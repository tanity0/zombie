import { describe, it, expect } from 'vitest';
import { computeViewport, VIEW_CORE_W, VIEW_CORE_H, VIEW_MAX_W, VIEW_MAX_H } from './viewport';

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
