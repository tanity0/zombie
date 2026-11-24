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

describe('computeViewport (横長=PC・research/PC_SUPPORT.md・縦540=社長裁定2026-11-24)', () => {
  it('横長の定数は縦持ちの定数と切り離した 540×960(縦持ちの 720 ではない)', () => {
    expect(VIEW_PC_H).toBe(540);
    expect(VIEW_PC_MAX_W).toBe(960);
    expect(VIEW_CORE_W).toBe(405);
    expect(VIEW_CORE_H).toBe(720);
    expect(VIEW_MAX_W).toBe(540);
    expect(VIEW_MAX_H).toBe(960);
  });
  it('16:9 は 960×540', () => {
    for (const [w, h] of [[1920, 1080], [1280, 720], [2560, 1440], [1366, 768]]) {
      const v = computeViewport(w, h);
      expect(v.logicalH).toBeCloseTo(VIEW_PC_H, 0);
      expect(v.logicalW).toBeCloseTo(VIEW_PC_MAX_W, 0);
      expect(v.logicalW * v.scale).toBeCloseTo(w, 3);
      expect(v.logicalH * v.scale).toBeCloseTo(h, 3);
    }
  });
  it('16:10・4:3 は縦540のまま横が狭くなる', () => {
    expect(computeViewport(1920, 1200).logicalW).toBeCloseTo(864, 0);
    expect(computeViewport(1440, 900).logicalW).toBeCloseTo(864, 0);
    expect(computeViewport(1024, 768).logicalW).toBeCloseTo(720, 0);
    expect(computeViewport(1024, 768).logicalH).toBeCloseTo(540, 0);
  });
  it('枠が絞られていないウルトラワイドでも横は960で頭打ち(見せ過ぎない)', () => {
    const v = computeViewport(3440, 1440);
    expect(v.logicalW).toBeLessThanOrEqual(VIEW_PC_MAX_W + 1e-6);
  });
  it('縦持ちの結果は変わらない(スマホ全機種・iPad の縦持ちは旧の式と同じ値)', () => {
    // 旧の縦持ちの式をそのまま写した参照(縦持ちの値を1pxも動かさないことの固定)
    const portraitRef = (w: number, h: number) => {
      const scale = Math.max(Math.min(w / 405, h / 720), Math.max(w / 540, h / 960));
      return { scale, logicalW: w / scale, logicalH: h / scale };
    };
    const phones = [[430, 932], [375, 667], [375, 812], [390, 844], [393, 852], [402, 874], [414, 896], [440, 956],
      [360, 800], [360, 640], [384, 854], [393, 851], [412, 915], [320, 568], [375, 553], [1080, 1920], [1080, 2340], [1080, 2640]];
    const ipads = [[768, 1024], [810, 1080], [820, 1180], [834, 1194], [1024, 1366], [744, 1133], [1620, 2160]];
    for (const [w, h] of [...phones, ...ipads]) {
      const v = computeViewport(w, h); const r = portraitRef(w, h);
      expect(v.scale).toBeCloseTo(r.scale, 9);
      expect(v.logicalW).toBeCloseTo(r.logicalW, 6);
      expect(v.logicalH).toBeCloseTo(r.logicalH, 6);
    }
    const v = computeViewport(430, 932);
    expect(v.logicalW).toBeCloseTo(VIEW_CORE_W, 3);
    expect(v.scale).toBeCloseTo(430 / VIEW_CORE_W, 6);
    // iPad 縦持ち(3:4)は 540×720 のまま
    expect(computeViewport(1536, 2048).logicalW).toBeCloseTo(540, 3);
    expect(computeViewport(1536, 2048).logicalH).toBeCloseTo(720, 3);
  });
  it('幅/高さ 3:4〜1:1 の窓は縦持ちの式(横540・縦=540÷比率)に入る', () => {
    const v = computeViewport(900, 1000);
    expect(v.logicalW).toBeCloseTo(540, 3);
    expect(v.logicalH).toBeCloseTo(600, 3);
  });
  it('縦持ち⇔横長の境目(正方形)で両方の式が 540×540 で一致=視野が跳ばない', () => {
    const sq = computeViewport(1000, 1000);
    expect(sq.logicalW).toBeCloseTo(540, 3);
    expect(sq.logicalH).toBeCloseTo(540, 3);
    const a = computeViewport(1000, 1000 + 1e-6); // ほぼ正方形(縦持ち側)
    const b = computeViewport(1000, 1000 - 1e-6); // ほぼ正方形(横長側)
    expect(a.logicalW).toBeCloseTo(b.logicalW, 3);
    expect(a.logicalH).toBeCloseTo(b.logicalH, 3);
    expect(a.scale).toBeCloseTo(b.scale, 6);
    // 窓の比率を細かく刻んでも、隣どうしの視野の差は小さいまま(どこにも段差が無い)
    let prev = computeViewport(1000, 2000);
    for (let h = 1999; h >= 500; h--) {
      const cur = computeViewport(1000, h);
      expect(Math.abs(cur.logicalW - prev.logicalW)).toBeLessThan(2);
      expect(Math.abs(cur.logicalH - prev.logicalH)).toBeLessThan(2);
      prev = cur;
    }
  });
});

describe('hudScaleFor(PC の HUD の倍率)', () => {
  it('縦持ちは常に1(スマホの HUD は変えない)', () => {
    expect(hudScaleFor(430, 932)).toBe(1);
    expect(hudScaleFor(1080, 2340)).toBe(1);
  });
  it('横長は枠の高さ/720 を 1 / 1.25 / 1.5 / 2 の段に丸める(ドット絵のアイコンを不揃いにしない)', () => {
    expect(hudScaleFor(1280, 720)).toBe(1);
    expect(hudScaleFor(1366, 768)).toBe(1.25);
    expect(hudScaleFor(1536, 864)).toBe(1.25);
    expect(hudScaleFor(1600, 900)).toBe(1.25);
    expect(hudScaleFor(1920, 1080)).toBe(1.5);
    expect(hudScaleFor(2560, 1440)).toBe(2);
    expect(hudScaleFor(3840, 2160)).toBe(2);
  });
});
