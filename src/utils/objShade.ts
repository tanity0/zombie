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

// ── クリエイティブ監査(2026-11-22)の是正: 慣性・区分ごとの効き・色温度・背の高い物/空中の物・写しの上限・近い順 ──

/** 明暗の寄せの時定数(ms)。暗くなる側は速く、明るくなる側はゆっくり(影に入る→抜けるに慣性)。 */
export const OBJ_SHADE_TAU_DARK_MS = 100;
export const OBJ_SHADE_TAU_BRIGHT_MS = 200;

/** 指数で寄せる: cur += (target−cur)·(1−exp(−dt/τ))。下がる側=τDark・上がる側=τBright。dt≤0 は動かない。 */
export const approachExp = (
  cur: number, target: number, dtMs: number, tauDark = OBJ_SHADE_TAU_DARK_MS, tauBright = OBJ_SHADE_TAU_BRIGHT_MS,
): number => {
  if (!(dtMs > 0)) return cur;
  const tau = target < cur ? tauDark : tauBright;
  return cur + (target - cur) * (1 - Math.exp(-dtMs / Math.max(1, tau)));
};

/** RGB の倍率をチャンネルごとに寄せる(cur を書き換えて返す)。 */
export const approachRgb = (cur: Rgb, target: Rgb, dtMs: number): Rgb => {
  cur.r = approachExp(cur.r, target.r, dtMs);
  cur.g = approachExp(cur.g, target.g, dtMs);
  cur.b = approachExp(cur.b, target.b, dtMs);
  return cur;
};

/** 物の区分。主人公は読めるように浅く、敵と置物は地面と同じ、木は少し浅く。 */
export type ObjShadeClass = 'player' | 'enemy' | 'prop' | 'tree';
export const OBJ_SHADE_CLASS_K: Readonly<Record<ObjShadeClass, number>> = { player: 0.62, enemy: 1, prop: 1, tree: 0.85 };
/** 絵の高さが主人公の体のこの倍を超える物は、足元の明るさを頭まで一色にしない(効きを下げる)。 */
export const OBJ_SHADE_TALL_RATIO = 2;
export const OBJ_SHADE_TALL_K = 0.55;
/** 地面から浮いている物(ヘリ・コウモリ・乗っている主人公)は地面の光と影の受け方を半分。 */
export const OBJ_SHADE_AIR_K = 0.5;

/** 区分・絵の高さ(画面 px)・主人公の体の高さ(画面 px)・空中か から効き具合 k を出す。 */
export const objShadeStrength = (cls: ObjShadeClass, heightPx: number, bodyPx: number, airborne: boolean): number => {
  let k = OBJ_SHADE_CLASS_K[cls];
  if (bodyPx > 0 && heightPx > bodyPx * OBJ_SHADE_TALL_RATIO) k *= OBJ_SHADE_TALL_K;
  if (airborne) k *= OBJ_SHADE_AIR_K;
  return k;
};

/** 影の色温度: 暗くなった量 d に対し、青の減りを 0.7d に抑える(冷える)。cool=false(夜のステージ1)は無変化。 */
export const OBJ_SHADE_COOL_BLUE = 0.7;
export const coolShade = (s: Rgb, cool: boolean): Rgb => (cool
  ? { r: s.r, g: s.g, b: Math.min(1, 1 - (1 - s.b) * OBJ_SHADE_COOL_BLUE) }
  : { r: s.r, g: s.g, b: s.b });

/** 月明りの写し(加算)のαの上限(全身が発光して見えないように)。 */
export const OBJ_SHADE_LIGHT_ALPHA_MAX = 0.5;
/** 写しを上へずらす量(画面 px)=上の縁が明るい「縁の光」に寄せる。 */
export const OBJ_SHADE_LIGHT_LIFT_PX = 3;
/** 写しのα(地面の光の強さ × 強さ → 上限で切る)。 */
export const objShadeLightAlpha = (light: number, gain: number): number => Math.max(0, Math.min(OBJ_SHADE_LIGHT_ALPHA_MAX, light * gain));

/** 上限は画面の中心から近い順に当てる: d2(中心からの距離²)の小さい順に max 件。元の配列は変えない。 */
export const nearestFirst = <T extends { d2: number }>(items: readonly T[], max: number): T[] =>
  items.length <= max ? [...items].sort((a, b) => a.d2 - b.d2) : [...items].sort((a, b) => a.d2 - b.d2).slice(0, Math.max(0, max));
