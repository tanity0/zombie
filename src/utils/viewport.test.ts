import { describe, it, expect } from 'vitest';
import { computeViewport, VIEW_CORE_W, VIEW_CORE_H, VIEW_MAX_W, VIEW_MAX_H } from './viewport';

// 固定ビューの不変条件:
//  ・論理寸法×scale = 実寸(=画面をちょうど埋める。黒帯が出ない)。
//  ・コアは原則全部見える(logical ≥ コア)。ただし極端アスペクトでクランプが勝つ場合のみ反対軸が僅かに減る。
//  ・伸ばし軸は MAX を超えない。
describe('computeViewport', () => {
  const fills = (w: number, h: number) => {
    const v = computeViewport(w, h);
    // 論理→デバイスがちょうど実寸を埋める(黒帯なし)。
    expect(v.logicalW * v.scale).toBeCloseTo(w, 3);
    expect(v.logicalH * v.scale).toBeCloseTo(h, 3);
    return v;
  };

  it('16:9 はコアちょうど(伸ばし無し)', () => {
    const v = fills(1920, 1080);
    expect(v.logicalW).toBeCloseTo(VIEW_CORE_W, 3);
    expect(v.logicalH).toBeCloseTo(VIEW_CORE_H, 3);
  });

  it('横長スマホ(19.5:9)は横へ伸び、縦はコア維持', () => {
    const v = fills(2340, 1080); // 19.5:9
    expect(v.logicalH).toBeCloseTo(VIEW_CORE_H, 3); // 縦=コア(binding)
    expect(v.logicalW).toBeGreaterThan(VIEW_CORE_W); // 横が伸びる
    expect(v.logicalW).toBeLessThanOrEqual(VIEW_MAX_W + 1e-6); // 上限内
  });

  it('タブレット(4:3)は縦へ伸び、横はコア維持', () => {
    const v = fills(2160, 1620); // 4:3
    expect(v.logicalW).toBeCloseTo(VIEW_CORE_W, 3); // 横=コア(binding)
    expect(v.logicalH).toBeGreaterThan(VIEW_CORE_H); // 縦が伸びる
    expect(v.logicalH).toBeLessThanOrEqual(VIEW_MAX_H + 1e-6); // 上限内
  });

  it('極端横長(21:9)は横を MAX で頭打ち(黒帯なし)', () => {
    const v = fills(2520, 1080); // 21:9
    expect(v.logicalW).toBeLessThanOrEqual(VIEW_MAX_W + 1e-6);
    expect(v.logicalH).toBeLessThan(VIEW_CORE_H); // クランプが勝ち縦が僅かに減る
  });

  it('どのアスペクトでも伸ばし軸は MAX を超えない', () => {
    for (const [w, h] of [[2340, 1080], [2160, 1620], [2520, 1080], [1600, 1000], [3000, 1000]]) {
      const v = computeViewport(w, h);
      expect(v.logicalW).toBeLessThanOrEqual(VIEW_MAX_W + 1e-6);
      expect(v.logicalH).toBeLessThanOrEqual(VIEW_MAX_H + 1e-6);
    }
  });
});
