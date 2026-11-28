// 比較用 ?objshade=2(作り直し・社長2026-11-22「2も物の上だけ薄くして作り直して」)の数の側(描画に依存しない純関数)。
// 雲の影(乗算のタイル)を2枚にする: 1枚目=地面の直上(今の位置)、2枚目=同じ模様を物(アクター)の層の上・予告/弾/エフェクト/HPバーの下。
// 2枚目の濃さ=元の濃さ×k。地面にも2枚目が掛かる置き方なら、2枚の乗算の合成が元と同じ濃さになるよう1枚目を薄くする。

/** k の3段(?objshadek2=)。 */
export const OBJ_SHADE_OVERLAY_KS = [0.25, 0.4, 0.55] as const;
export const OBJ_SHADE_OVERLAY_K_DEFAULT = 0.4;

/** ?objshadek2= の値 → 3段のうち一番近い段(読めない値は既定)。 */
export const parseObjShadeOverlayK = (v: string | null | undefined): number => {
  if (v === null || v === undefined || v.trim() === '') return OBJ_SHADE_OVERLAY_K_DEFAULT;
  const n = Number(v);
  if (!Number.isFinite(n)) return OBJ_SHADE_OVERLAY_K_DEFAULT;
  let best: number = OBJ_SHADE_OVERLAY_KS[0];
  for (const k of OBJ_SHADE_OVERLAY_KS) if (Math.abs(k - n) < Math.abs(best - n)) best = k;
  return best;
};

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * 乗算の層1枚(不透明度 a・模様の暗さ x=1−c)が掛ける倍率は 1 − a·x。
 * 2枚の合成 (1 − a1·x)(1 − a2·x) を 1 − a·x に合わせる a1 を、代表の暗さ x で解く:
 *   a1 = (a − a2) / (1 − a2·x)   (a2 ≥ a なら 0)
 * x は模様の場所で変わるので厳密に一致するのは x の1点だけ(残りの差は x の2次=小さい)。
 */
export const solveBaseAlpha = (a: number, a2: number, x: number): number => {
  const A = clamp01(a), A2 = clamp01(a2), X = clamp01(x);
  if (A2 >= A) return 0;
  const den = 1 - A2 * X;
  return den <= 1e-6 ? 0 : clamp01((A - A2) / den);
};

/** 2枚の乗算の合成の倍率(検算用)。 */
export const stackedMultiply = (a1: number, a2: number, x: number): number => (1 - clamp01(a1) * clamp01(x)) * (1 - clamp01(a2) * clamp01(x));

/**
 * 1枚目と2枚目の不透明度。
 * - a2 = 元の濃さ × k(物に乗る影)。
 * - layer2OnGround=false(2枚目が物だけを描く下書きの中にあり、地面へ届かない置き方)なら 1枚目は元のまま=地面の見え方は不変。
 * - layer2OnGround=true(2枚目が地面にも重なる置き方)なら solveBaseAlpha で1枚目を薄くする。
 */
export const overlayAlphas = (a: number, k: number, x: number, layer2OnGround: boolean): { a1: number; a2: number } => {
  const a2 = clamp01(clamp01(a) * Math.max(0, k));
  return { a1: layer2OnGround ? solveBaseAlpha(a, a2, x) : clamp01(a), a2 };
};
