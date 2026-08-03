// 影のシルエットを焼く時の「素材の空白を切り詰める」計算(純関数)。
// research/LIGHT_REWORK.md §3-9-C ★D-2「素材の下側の空白を、焼く時に切り詰める」。
// PixiJS非依存=ヘッドレスでテストできる(CLAUDE.md 実装精度の規律4「配線ロジックは純関数に切り出す」)。
//
// ★なぜ要るか: `bakeSilhouette` は元テクスチャを**そのまま**焼き、メッシュは焼いたテクスチャ"全体"を
// 台形に貼る。よって**テクスチャ下側の透明な空白がそのまま影の足元側に来る**=株元と影の間に隙間が空く。
// 実測(`public/sprites` 614枚の全走査)で下側に空白を持つのは4枚だけ:
//   jormungand.png(192px/20.0%)/ flower-5(57px)/ flower-6(55px)/ flower-7(54px)。
// ★**残り610枚は `top=0` かつ `bottom=1`** なので、下の `needsContentTrim` が false になり
// **1pxも変わらない**(=受け入れ条件「空白を持たない素材の影が1pxも変わらないことをコードで示せる」)。

/** 切り詰め後の縦の割合の下限。ほぼ空のテクスチャで長さが0になるのを防ぐ。 */
export const SHADOW_CONTENT_FRAC_MIN = 0.05;

/**
 * 絵の実体が縦に占める割合(0..1)。影の長さは「**見えている絵**の高さ×比率」なので、
 * `rawH` にこれを掛けたものが本来の高さ(§3-9-C ★D-2 直し2)。
 * 空白の無い素材は `top=0 / bottom=1` ⇒ **ちょうど 1**(掛けても値が変わらない)。
 */
export const contentSpanFrac = (top: number, bottom: number): number => {
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return 1;
  const t = Math.min(1, Math.max(0, top));
  const b = Math.min(1, Math.max(0, bottom));
  return Math.min(1, Math.max(SHADOW_CONTENT_FRAC_MIN, b - t));
};

/**
 * 切り詰めが要るか。**空白が1pxも無いなら false**(=元テクスチャをそのまま焼く既存経路に落ちる)。
 * ★ここが「610枚は1pxも変わらない」の根拠。判定を1箇所に閉じ込めてテストで固定する。
 */
export const needsContentTrim = (top: number, bottom: number): boolean => {
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return false;
  if (!(bottom > top)) return false; // 中身が測れていない/壊れている ⇒ 触らない
  return top > 0 || bottom < 1;
};

/**
 * 元テクスチャの frame(source内のpx矩形)を、絵のある範囲へ**縦だけ**切り詰めた矩形にする。
 * 横は触らない(§3-9-C の今回の範囲は縦の空白だけ。横寄せは ★D-2b の別段)。
 * 返り値は整数px・高さ1px以上・必ず元の frame の内側に収まる。
 */
export const contentTrimFrameY = (
  frameY: number, frameH: number, top: number, bottom: number,
): { y: number; height: number } => {
  const h = Math.max(1, Math.round(frameH));
  const t = Math.min(1, Math.max(0, top));
  const b = Math.min(1, Math.max(0, bottom));
  let y0 = Math.floor(t * h);
  let y1 = Math.ceil(b * h);
  y0 = Math.min(Math.max(0, y0), h - 1);
  y1 = Math.min(Math.max(y0 + 1, y1), h);
  return { y: Math.round(frameY) + y0, height: y1 - y0 };
};

/**
 * 半影(ペナンブラ)の幅 k(t)。t=0 が足元・t=1 が先端。§3-9-C ★A の確定式:
 * `k(t) = K0 + (K1 - K0) × t^POW`。**シェーダ(GLSL)側と同じ式**をここにも置き、
 * 端点(足元は硬い/先端は広い)と単調増加をテストで固定する(式を変えたらテストが落ちる)。
 */
export const penumbraWidth = (t: number, k0: number, k1: number, pow: number): number => {
  const tt = Math.min(1, Math.max(0, t));
  return k0 + (k1 - k0) * Math.pow(tt, pow);
};
