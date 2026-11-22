// 試作(?objshade=1): 地面に落ちている光と影(雲の影・木漏れ日の帯・梢の影・月明りの溜まり)を、
// 物(木・置物・敵・主人公)にも「足元の地面と同じ明るさ」として掛けるための純関数。
// 描画には一切触れない(PixiJS を import しない)。描く側は src/pixi/objShade.ts。
//
// 乗算の層(雲の影など)は、地面の画素 dst に対して
//   dst' = dst × (1 − A × (1 − c))      (A = テクセルのα × 層のα、c = テクセルの色 × 層の tint)
// になる(Pixi の multiply = [DST_COLOR, ONE_MINUS_SRC_ALPHA] の非乗算α表記)。
// この「1 − A(1 − c)」を物の tint に掛ければ、足元の地面と同じだけ暗くなる。

/** URL の値 → 方式。0/無し=何もしない(既定)。1=物の tint(足元の明るさ)。2=光と影の層を物の上へ移す(比較用)。 */
export type ObjShadeMode = 'off' | 'tint' | 'overlay';
export const parseObjShadeMode = (v: string | null | undefined): ObjShadeMode => {
  if (v === '1' || v === 'tint') return 'tint';
  if (v === '2' || v === 'overlay') return 'overlay';
  if (v === '0' || v === 'off') return 'off';
  return 'tint'; // 既定=採用(社長2026-11-22「影は1で採用」)。`?objshade=0` で外す
};

/** 0..1 の RGB の倍率。 */
export interface Rgb { r: number; g: number; b: number }

/** a mod n を 0..n の範囲で返す(負でも)。 */
export const wrapMod = (a: number, n: number): number => {
  const m = a % n;
  return m < 0 ? m + n : m;
};

/**
 * RGBA(非乗算・0..255)の画素列から1画素を引く(最近傍)。wrap=true は繰り返し(タイル)、false は外を透明とする。
 * 返り値は out に 0..1 で書く(r,g,b,a)。
 */
export const sampleRgba = (
  data: ArrayLike<number>, w: number, h: number, x: number, y: number, wrap: boolean, out: [number, number, number, number],
): [number, number, number, number] => {
  let ix: number, iy: number;
  if (wrap) {
    ix = Math.floor(wrapMod(x, w)) % w;
    iy = Math.floor(wrapMod(y, h)) % h;
  } else {
    if (!(x >= 0 && y >= 0 && x < w && y < h)) { out[0] = 1; out[1] = 1; out[2] = 1; out[3] = 0; return out; }
    ix = Math.floor(x); iy = Math.floor(y);
  }
  const o = (iy * w + ix) * 4;
  out[0] = data[o] / 255; out[1] = data[o + 1] / 255; out[2] = data[o + 2] / 255; out[3] = data[o + 3] / 255;
  return out;
};

/** TilingSprite のローカル座標 → テクスチャの画素座標(Pixi v8: uv = (local − tilePosition) / tileScale・回転なし)。 */
export const tilingTexel = (
  lx: number, ly: number, tileX: number, tileY: number, scaleX: number, scaleY: number,
): { x: number; y: number } => ({
  x: (lx - tileX) / (scaleX || 1),
  y: (ly - tileY) / (scaleY || 1),
});

/** 0xRRGGBB → 0..1。 */
export const tintToRgb = (tint: number): Rgb => ({ r: ((tint >> 16) & 255) / 255, g: ((tint >> 8) & 255) / 255, b: (tint & 255) / 255 });

/**
 * 乗算の層1枚が地面に掛ける倍率を acc に掛け込む。texel=(r,g,b,a 0..1)、layerAlpha=層の実効α、tint=層の tint。
 * 返り値は acc(破壊的)。
 */
export const accumulateMultiply = (acc: Rgb, texel: readonly number[], layerAlpha: number, tint = 0xffffff): Rgb => {
  const A = Math.max(0, Math.min(1, texel[3] * layerAlpha));
  if (A <= 0) return acc;
  const t = tint === 0xffffff ? null : tintToRgb(tint);
  const cr = texel[0] * (t ? t.r : 1), cg = texel[1] * (t ? t.g : 1), cb = texel[2] * (t ? t.b : 1);
  acc.r *= 1 - A * (1 - cr);
  acc.g *= 1 - A * (1 - cg);
  acc.b *= 1 - A * (1 - cb);
  return acc;
};

/** 倍率の効き具合 k(0=無変化 1=地面と同じ)で寄せる。 */
export const shadeWithStrength = (s: Rgb, k: number): Rgb => ({
  r: 1 - (1 - s.r) * k,
  g: 1 - (1 - s.g) * k,
  b: 1 - (1 - s.b) * k,
});

/** tint(0xRRGGBB)に倍率を掛けた tint を返す(各チャンネル 0..255 に丸め)。 */
export const mulTintRgb = (base: number, s: Rgb): number => {
  const c = (v: number, f: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (c((base >> 16) & 255, s.r) << 16) | (c((base >> 8) & 255, s.g) << 8) | c(base & 255, s.b);
};

/** 倍率の平均(足元の何点かを均して、物が影の縁をまたぐ時にパチッと切り替わらないようにする)。 */
export const averageRgb = (list: readonly Rgb[]): Rgb => {
  if (!list.length) return { r: 1, g: 1, b: 1 };
  let r = 0, g = 0, b = 0;
  for (const s of list) { r += s.r; g += s.g; b += s.b; }
  return { r: r / list.length, g: g / list.length, b: b / list.length };
};

/** 足元の採り方: 物の幅に対する左右の点(中心と ±この割合)。 */
export const OBJ_SHADE_FOOT_SPREAD = 0.25;
/** 画面の外へどれだけはみ出した物まで掛けるか(画面 px)。 */
export const OBJ_SHADE_SCREEN_MARGIN = 160;
/** 1フレームに掛ける物の上限(負荷の天井)。 */
export const OBJ_SHADE_MAX_TARGETS = 220;
