import { describe, expect, it } from 'vitest';
import {
  alphaMaskDims, anyPointOnOpaque, buildAlphaMask, invertAffine, localAffine, maskOpaqueAt, multiplyAffine,
  seeThroughBodyPoints, worldToFramePixel, SEE_THROUGH_MASK_MAX_LONG_CELLS, type SpriteFrameGeom,
} from './seeThroughMask';

/** w×h の RGBA。opaque(x,y) が真の画素だけアルファ255。 */
function rgba(w: number, h: number, opaque: (x: number, y: number) => boolean): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (opaque(x, y)) d[(y * w + x) * 4 + 3] = 255;
  return d;
}

// 40×40 の「木」: 下の幹(x 18..21, y 20..39)と、上の葉の塊(x 4..15 と 24..35, y 0..15)。真ん中上(x 16..23, y 0..19)は枝の隙間=透明。
const W = 40, H = 40;
const treeOpaque = (x: number, y: number) =>
  (x >= 18 && x <= 21 && y >= 20) || (y <= 15 && ((x >= 4 && x <= 15) || (x >= 24 && x <= 35)));
const { cols, rows } = alphaMaskDims(W, H);
const treeMask = buildAlphaMask(rgba(W, H, treeOpaque), W, H, cols, rows, W, H);
const geom = (ax: number, ay: number): SpriteFrameGeom => ({ anchorX: ax, anchorY: ay, origW: W, origH: H, trimX: 0, trimY: 0 });

describe('alphaMaskDims', () => {
  it('小さな絵は原寸のマス、大きな絵は1/4、巨大な絵は上限', () => {
    expect(alphaMaskDims(96, 128)).toEqual({ cols: 96, rows: 128 });
    expect(alphaMaskDims(1024, 512)).toEqual({ cols: 256, rows: 128 });
    const huge = alphaMaskDims(8192, 1024);
    expect(Math.max(huge.cols, huge.rows)).toBeLessThanOrEqual(SEE_THROUGH_MASK_MAX_LONG_CELLS);
  });
});

describe('buildAlphaMask / maskOpaqueAt', () => {
  it('透明の所は不透明にならない・不透明の所は不透明', () => {
    expect(maskOpaqueAt(treeMask, 19.5, 30)).toBe(true);  // 幹
    expect(maskOpaqueAt(treeMask, 10, 8)).toBe(true);     // 左の葉
    expect(maskOpaqueAt(treeMask, 20, 8)).toBe(false);    // 枝の隙間
    expect(maskOpaqueAt(treeMask, 5, 30)).toBe(false);    // 幹の脇
  });
  it('絵の外は false', () => {
    expect(maskOpaqueAt(treeMask, -1, 30)).toBe(false);
    expect(maskOpaqueAt(treeMask, 19, 40)).toBe(false);
  });
  it('縮めた途中の画から作っても、マスの平均アルファで決まる', () => {
    // 8×8 の左半分だけ不透明 → 2×2 マス: 左列が不透明
    const m = buildAlphaMask(rgba(8, 8, (x) => x < 4), 8, 8, 2, 2, 32, 32);
    expect(maskOpaqueAt(m, 5, 5)).toBe(true);
    expect(maskOpaqueAt(m, 25, 5)).toBe(false);
    // マスの1/4しか塗られていない=平均が閾値未満 → 透明扱い
    const sparse = buildAlphaMask(rgba(4, 4, (x, y) => x < 1 && y < 4), 4, 4, 1, 1, 4, 4);
    expect(maskOpaqueAt(sparse, 0.5, 0.5)).toBe(false);
  });
});

describe('アフィンの逆変換', () => {
  it('invert ∘ forward = 恒等', () => {
    const m = localAffine({ x: 100, y: 50, scaleX: -2.5, scaleY: 1.5, rotation: 0.3, skewX: 0.05 });
    const inv = invertAffine(m)!;
    const id = multiplyAffine(inv, m);
    expect(id.a).toBeCloseTo(1); expect(id.d).toBeCloseTo(1);
    expect(id.b).toBeCloseTo(0); expect(id.c).toBeCloseTo(0);
    expect(id.tx).toBeCloseTo(0); expect(id.ty).toBeCloseTo(0);
  });
  it('scale 0 は null', () => {
    expect(invertAffine(localAffine({ x: 0, y: 0, scaleX: 0, scaleY: 1 }))).toBeNull();
  });
  it('anchor(足元 0.5,1)・拡大: 足元の点は絵の下辺中央へ戻る', () => {
    const m = localAffine({ x: 300, y: 400, scaleX: 3, scaleY: 3 });
    const p = worldToFramePixel(m, geom(0.5, 1), 300, 400)!;
    expect(p.fx).toBeCloseTo(20); expect(p.fy).toBeCloseTo(40);
    const q = worldToFramePixel(m, geom(0.5, 1), 300 - 30, 400 - 60)!; // 世界で左30・上60 = 絵で左10・上20
    expect(q.fx).toBeCloseTo(10); expect(q.fy).toBeCloseTo(20);
  });
  it('左右反転(scaleX<0): 世界の右は絵の左', () => {
    const m = localAffine({ x: 0, y: 0, scaleX: -1, scaleY: 1 });
    const p = worldToFramePixel(m, geom(0.5, 0.5), 10, 0)!;
    expect(p.fx).toBeCloseTo(10); // 中心20から左へ10
  });
  it('trim があれば orig 内のずれを引く', () => {
    const m = localAffine({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const p = worldToFramePixel(m, { anchorX: 0, anchorY: 0, origW: 50, origH: 50, trimX: 5, trimY: 7 }, 10, 10)!;
    expect(p.fx).toBe(5); expect(p.fy).toBe(3);
  });
  it('親子の合成: 親の位置+子の拡大', () => {
    const parent = localAffine({ x: 1000, y: 0, scaleX: 1, scaleY: 1 });
    const child = localAffine({ x: 0, y: 500, scaleX: 2, scaleY: 2 });
    const m = multiplyAffine(parent, child);
    const p = worldToFramePixel(m, geom(0.5, 1), 1000, 500)!;
    expect(p.fx).toBeCloseTo(20); expect(p.fy).toBeCloseTo(40);
  });
});

describe('anyPointOnOpaque(木を足元 0.5,1・3倍で x=300,y=400 に置いた時)', () => {
  const m = localAffine({ x: 300, y: 400, scaleX: 3, scaleY: 3 });
  const g = geom(0.5, 1);
  // 絵の画素 (fx,fy) → 世界 = (300 + (fx-20)*3, 400 + (fy-40)*3)
  const w = (fx: number, fy: number) => ({ x: 300 + (fx - 20) * 3, y: 400 + (fy - 40) * 3 });
  it('幹の裏は透ける', () => {
    expect(anyPointOnOpaque([w(19.5, 30)], m, g, treeMask)).toBe(true);
  });
  it('枝の隙間・木の脇は透けない', () => {
    expect(anyPointOnOpaque([w(20, 8), w(5, 30), w(37, 25)], m, g, treeMask)).toBe(false);
  });
  it('どれか1点でも葉に乗れば透ける', () => {
    expect(anyPointOnOpaque([w(20, 8), w(10, 8)], m, g, treeMask)).toBe(true);
  });
  it('反転して置いた絵は反転した位置で当たる', () => {
    const asym = buildAlphaMask(rgba(W, H, (x) => x < 10), W, H, cols, rows, W, H); // 左端だけ不透明
    const flipped = localAffine({ x: 300, y: 400, scaleX: -3, scaleY: 3 });
    // 反転なら世界の右端(fx=5 を鏡にした位置 = 300 + 15*3)に絵の左端が来る
    expect(anyPointOnOpaque([{ x: 300 + 15 * 3, y: 400 - 30 }], flipped, g, asym)).toBe(true);
    expect(anyPointOnOpaque([{ x: 300 - 15 * 3, y: 400 - 30 }], flipped, g, asym)).toBe(false);
  });
});

describe('seeThroughBodyPoints', () => {
  it('主人公の絵の範囲(足元基準)の中に6点・out を使い回す', () => {
    const out: { x: number; y: number }[] = [];
    const pts = seeThroughBodyPoints(100, 200, 40, 80, out);
    expect(pts).toBe(out);
    expect(pts).toHaveLength(6);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(80); expect(p.x).toBeLessThanOrEqual(120);
      expect(p.y).toBeGreaterThanOrEqual(120); expect(p.y).toBeLessThanOrEqual(200);
    }
    const again = seeThroughBodyPoints(0, 0, 40, 80, out);
    expect(again[0]).toBe(pts[0]);
  });
});
