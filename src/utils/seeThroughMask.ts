// 「裏に回ると手前の物が透ける」をピクセル(不透明な部分)で判定するための純関数(社長指示2026-11-22
// 「木に重なってなくてもその正方形に入ると透けちゃってるのが過剰でやめたい」→「はい、ピクセルで判定して」)。
//
// 見た目だけの処理(renderer が使う)。ゲームの判定(当たり矩形・攻撃範囲)には一切関わらない。
// PixiJS を import しない(テストのため)。テクスチャからピクセルを読む側は src/pixi/seeThroughPixels.ts。
//
// 流れ: ①絵(テクスチャのコマ)ごとに不透明ピクセルの粗い地図(ビットマスク)を1回だけ作る
//       ②毎フレーム、主人公の体の数点を、絵の変換(位置・anchor・scale・反転・遠近・傾き)の逆で絵の画素へ戻し
//       ③どれか1点が不透明なマスに乗っていれば「覆っている」=透ける。

/** 不透明ピクセルの粗い地図。frameW×frameH(コマの画素)を cols×rows のマスに割り、1マス1ビット。 */
export interface AlphaMask {
  cols: number;
  rows: number;
  /** 元のコマの寸法(テクスチャの frame の幅・高さ=絵の座標系の単位)。 */
  frameW: number;
  frameH: number;
  /** 行優先・1マス1ビット(bit i = マス i)。 */
  bits: Uint8Array;
}

/** マス1辺の最大の画素数(=縦横1/4)。 */
export const SEE_THROUGH_MASK_MAX_CELL = 4;
/** 小さな絵(ドット絵の木=96×128 等)は1/4だと1マスが画面で十数pxになり粗すぎる。長辺がこのマス数を下回らない所までマスを細かくする。 */
export const SEE_THROUGH_MASK_MIN_LONG_CELLS = 128;
/** 巨大な絵(城・遠景級)でもマスの長辺はここまで(メモリの上限)。 */
export const SEE_THROUGH_MASK_MAX_LONG_CELLS = 512;
/** マスの平均アルファがこれ以上なら不透明(0..255)。半分以上が塗られているマス=「絵がある」。 */
export const SEE_THROUGH_ALPHA_THRESHOLD = 128;

/** コマの寸法からマスの数を決める。 */
export function alphaMaskDims(frameW: number, frameH: number): { cols: number; rows: number } {
  const w = Math.max(1, Math.round(frameW)), h = Math.max(1, Math.round(frameH));
  const long = Math.max(w, h);
  let cell = Math.min(SEE_THROUGH_MASK_MAX_CELL, Math.max(1, Math.floor(long / SEE_THROUGH_MASK_MIN_LONG_CELLS)));
  if (long / cell > SEE_THROUGH_MASK_MAX_LONG_CELLS) cell = long / SEE_THROUGH_MASK_MAX_LONG_CELLS;
  return { cols: Math.max(1, Math.ceil(w / cell)), rows: Math.max(1, Math.ceil(h / cell)) };
}

/**
 * RGBA の画素列(w×h・getImageData の data)から、cols×rows のマスの平均アルファで地図を作る。
 * w×h は元のコマを縮めた途中の画でもよい(マスへの割り付けは比率で行う)。
 */
export function buildAlphaMask(
  rgba: ArrayLike<number>, w: number, h: number,
  cols: number, rows: number, frameW: number, frameH: number,
  threshold = SEE_THROUGH_ALPHA_THRESHOLD,
): AlphaMask {
  const n = cols * rows;
  const sum = new Float64Array(n), cnt = new Uint32Array(n);
  for (let y = 0; y < h; y++) {
    const r = Math.min(rows - 1, Math.floor((y * rows) / h));
    for (let x = 0; x < w; x++) {
      const c = Math.min(cols - 1, Math.floor((x * cols) / w));
      const i = r * cols + c;
      sum[i] += rgba[(y * w + x) * 4 + 3];
      cnt[i]++;
    }
  }
  const bits = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i++) {
    if (cnt[i] > 0 && sum[i] / cnt[i] >= threshold) bits[i >> 3] |= 1 << (i & 7);
  }
  return { cols, rows, frameW, frameH, bits };
}

/** コマの画素 (fx, fy) が不透明なマスか。絵の外は false。 */
export function maskOpaqueAt(m: AlphaMask, fx: number, fy: number): boolean {
  if (!(fx >= 0 && fy >= 0 && fx < m.frameW && fy < m.frameH)) return false;
  const c = Math.min(m.cols - 1, Math.floor((fx * m.cols) / m.frameW));
  const r = Math.min(m.rows - 1, Math.floor((fy * m.rows) / m.frameH));
  const i = r * m.cols + c;
  return (m.bits[i >> 3] & (1 << (i & 7))) !== 0;
}

/** 2D アフィン(PixiJS の Matrix と同じ並び: x' = a·x + c·y + tx, y' = b·x + d·y + ty)。 */
export interface Affine { a: number; b: number; c: number; d: number; tx: number; ty: number }

/** parent ∘ child(child の局所座標 → parent の座標)。 */
export function multiplyAffine(p: Affine, ch: Affine): Affine {
  return {
    a: p.a * ch.a + p.c * ch.b,
    b: p.b * ch.a + p.d * ch.b,
    c: p.a * ch.c + p.c * ch.d,
    d: p.b * ch.c + p.d * ch.d,
    tx: p.a * ch.tx + p.c * ch.ty + p.tx,
    ty: p.b * ch.tx + p.d * ch.ty + p.ty,
  };
}

/** 逆行列。潰れている(scale 0 等)なら null。 */
export function invertAffine(m: Affine): Affine | null {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const ia = m.d / det, ib = -m.b / det, ic = -m.c / det, id = m.a / det;
  return { a: ia, b: ib, c: ic, d: id, tx: -(ia * m.tx + ic * m.ty), ty: -(ib * m.tx + id * m.ty) };
}

/** PixiJS の Container.updateLocalTransform と同じ式で局所変換を作る(テストと、Pixi を使わない呼び手のため)。 */
export function localAffine(t: {
  x: number; y: number; scaleX: number; scaleY: number;
  rotation?: number; skewX?: number; skewY?: number; pivotX?: number; pivotY?: number;
}): Affine {
  const rot = t.rotation ?? 0, kx = t.skewX ?? 0, ky = t.skewY ?? 0, px = t.pivotX ?? 0, py = t.pivotY ?? 0;
  const a = Math.cos(rot + ky) * t.scaleX, b = Math.sin(rot + ky) * t.scaleX;
  const c = -Math.sin(rot - kx) * t.scaleY, d = Math.cos(rot - kx) * t.scaleY;
  return { a, b, c, d, tx: t.x - (px * a + py * c), ty: t.y - (px * b + py * d) };
}

/** スプライトの絵の置き方(Pixi Sprite: 局所座標の原点=anchor の点。trim があれば orig 内のずれ)。 */
export interface SpriteFrameGeom {
  anchorX: number; anchorY: number;
  /** texture.orig の寸法(anchor の基準)。 */
  origW: number; origH: number;
  /** texture.trim の左上(trim が無ければ 0)。 */
  trimX: number; trimY: number;
}

/**
 * 世界の点 (wx, wy) を、スプライトの「世界←局所」変換 toWorld の逆で戻し、コマの画素座標にする。
 * 変換が潰れていれば null。
 */
export function worldToFramePixel(
  toWorld: Affine, g: SpriteFrameGeom, wx: number, wy: number,
): { fx: number; fy: number } | null {
  const inv = invertAffine(toWorld);
  if (!inv) return null;
  const lx = inv.a * wx + inv.c * wy + inv.tx;
  const ly = inv.b * wx + inv.d * wy + inv.ty;
  return { fx: lx + g.anchorX * g.origW - g.trimX, fy: ly + g.anchorY * g.origH - g.trimY };
}

/** 点のどれか1つでも、絵の不透明な部分に乗っているか。 */
export function anyPointOnOpaque(
  points: ReadonlyArray<{ x: number; y: number }>, toWorld: Affine, g: SpriteFrameGeom, m: AlphaMask,
): boolean {
  const inv = invertAffine(toWorld);
  if (!inv) return false;
  for (const p of points) {
    const lx = inv.a * p.x + inv.c * p.y + inv.tx;
    const ly = inv.b * p.x + inv.d * p.y + inv.ty;
    if (maskOpaqueAt(m, lx + g.anchorX * g.origW - g.trimX, ly + g.anchorY * g.origH - g.trimY)) return true;
  }
  return false;
}

/**
 * 主人公の体の点(世界座標)。足元を下辺中心にした「主人公の絵の範囲」(boxW×boxH)から:
 * 頭・胸(中央と左右)・腰・足元の6点。out を渡せば使い回す(毎フレームの確保をしない)。
 */
export const SEE_THROUGH_BODY_POINTS: ReadonlyArray<{ fx: number; up: number }> = [
  { fx: 0, up: 0.85 },     // 頭
  { fx: 0, up: 0.58 },     // 胸
  { fx: -0.18, up: 0.58 }, // 胸の左
  { fx: 0.18, up: 0.58 },  // 胸の右
  { fx: 0, up: 0.32 },     // 腰
  { fx: 0, up: 0.06 },     // 足元
];
export function seeThroughBodyPoints(
  cx: number, footY: number, boxW: number, boxH: number,
  out: { x: number; y: number }[] = [],
): { x: number; y: number }[] {
  out.length = SEE_THROUGH_BODY_POINTS.length;
  for (let i = 0; i < SEE_THROUGH_BODY_POINTS.length; i++) {
    const q = SEE_THROUGH_BODY_POINTS[i];
    const p = out[i] ?? (out[i] = { x: 0, y: 0 });
    p.x = cx + q.fx * boxW;
    p.y = footY - q.up * boxH;
  }
  return out;
}
