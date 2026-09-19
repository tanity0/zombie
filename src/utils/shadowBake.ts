// 影のシルエットを焼く時の「素材の空白を切り詰める」計算(純関数)。
// research/LIGHT_REWORK.md §3-9-C ★D-2「素材の下側の空白を、焼く時に切り詰める」+
// ★D-2b「影の起点を絵の足元の中央にする(縦横両方)」。
// PixiJS非依存=ヘッドレスでテストできる(CLAUDE.md 実装精度の規律4「配線ロジックは純関数に切り出す」)。
//
// ★なぜ要るか: `bakeSilhouette` は元テクスチャを**そのまま**焼き、メッシュは焼いたテクスチャ"全体"を
// 台形に貼る。よって**テクスチャの透明な空白がそのまま影の形/起点に来る**=株元と影の間に隙間が空いたり
// (縦)、絵の実体の中心と影の起点が横にズレたりする(横=★D-2b)。
// 実測(`public/sprites` 614枚の全走査・v0.25.2817時点)で**下側**に空白を持つのは4枚だけ:
//   jormungand.png(192px/20.0%・※後日ドット版へ差し替え済み)/ flower-5(57px)/ flower-6(55px)/ flower-7(54px)。
// ★**残り610枚は `top=0` かつ `bottom=1`** なので、下の `needsContentTrim` が false になり
// **1pxも変わらない**(=受け入れ条件「空白を持たない素材の影が1pxも変わらないことをコードで示せる」)。
// **横(left/right)も同じ関数群を使う**——`needsContentTrim(left, right)` / `contentTrimFrameX` /
// `contentCenterFrac(left, right)`。縦横で式を共有しているので、左右に余白の無い素材は
// `contentCenterFrac` が**ちょうど0.5**(=無補正)になり、610枚と同じ理屈で1pxも動かない。

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
 * 汎用の1軸切り詰め(★D-2b: 縦横で全く同じ式を使うための内部実装)。`contentTrimFrameY`/
 * `contentTrimFrameX` はこれのラッパ。返り値は整数px・長さ1px以上・必ず元の frame の内側に収まる。
 */
const contentTrimFrame1D = (
  frameStart: number, frameLen: number, lo: number, hi: number,
): { start: number; length: number } => {
  const len = Math.max(1, Math.round(frameLen));
  const a = Math.min(1, Math.max(0, lo));
  const b = Math.min(1, Math.max(0, hi));
  let s0 = Math.floor(a * len);
  let s1 = Math.ceil(b * len);
  s0 = Math.min(Math.max(0, s0), len - 1);
  s1 = Math.min(Math.max(s0 + 1, s1), len);
  return { start: Math.round(frameStart) + s0, length: s1 - s0 };
};

/**
 * 元テクスチャの frame(source内のpx矩形)を、絵のある範囲へ**縦**に切り詰めた矩形にする。
 * 返り値は整数px・高さ1px以上・必ず元の frame の内側に収まる。
 */
export const contentTrimFrameY = (
  frameY: number, frameH: number, top: number, bottom: number,
): { y: number; height: number } => {
  const r = contentTrimFrame1D(frameY, frameH, top, bottom);
  return { y: r.start, height: r.length };
};

/**
 * ★D-2b: `contentTrimFrameY` の**横**版。元テクスチャの frame を、絵のある範囲へ横に切り詰める。
 * 式は縦と完全に同じ(`contentTrimFrame1D`)なので、左右に余白の無い素材(left=0/right=1)は
 * `needsContentTrim(left, right)` が false のまま=**呼ばれても1pxも変わらない**。
 */
export const contentTrimFrameX = (
  frameX: number, frameW: number, left: number, right: number,
): { x: number; width: number } => {
  const r = contentTrimFrame1D(frameX, frameW, left, right);
  return { x: r.start, width: r.length };
};

/**
 * ★D-2b: 絵の実体が横(または縦)に占める**中心**位置(0=frame左端/上端・1=frame右端/下端)。
 * 影の起点(`footX`)を「絵の足元の中央」へ寄せるのに使う——`(centerFrac - 0.5) * rawW` が
 * ワールド単位のオフセットになる(スケールに追従する。§D-2b「やること3」)。
 * 余白の無い素材(left=0/right=1)は **ちょうど 0.5**(=中央のまま・オフセット0)。
 */
export const contentCenterFrac = (lo: number, hi: number): number => {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return 0.5;
  const a = Math.min(1, Math.max(0, lo));
  const b = Math.min(1, Math.max(0, hi));
  return Math.min(1, Math.max(0, (a + b) / 2));
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
