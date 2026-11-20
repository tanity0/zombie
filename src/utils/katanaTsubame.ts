// ★刀の燕返し・切り傷・殺陣(research/KATANA_TSUBAME.md)の判定だけを置く純関数(store にも描画にも依存しない)。数値は叩き台。
// 受付の窓と向きの帯は「当てた直後のフリック」の共通部品(utils/flickFollowup)を使う=鞭の追加攻撃と同じ1本。
import { flickBand, isFlickFollowupOpen, type FlickFollowupWindow } from './flickFollowup';

/** 燕返しの受付の窓=共通の窓+一閃を出し始めた位置(元の位置・プレイヤーの中心)。 */
export interface TsubameWindow extends FlickFollowupWindow {
  originX: number;
  originY: number;
}

/** 燕返しが出る向きか(一閃の向きと反対=なす角120°以上・受付の間・未使用)。 */
export const tsubameAccepts = (w: TsubameWindow | null | undefined, flick: { x: number; y: number }, now: number): boolean =>
  !!w && isFlickFollowupOpen(w, now) && flickBand({ x: w.dirX, y: w.dirY }, flick) === 'back';

/** 燕返しが元の位置へ向かう距離が短すぎる時は出さない(px)。 */
export const TSUBAME_MIN_DIST_PX = 4;

/**
 * 燕返しの向きと距離(今の位置→元の位置・一閃の最大距離を超えない)。距離が TSUBAME_MIN_DIST_PX 未満なら null(戻る所が無い)。
 */
export const tsubamePath = (
  cur: { x: number; y: number }, origin: { x: number; y: number }, maxDist: number,
): { ux: number; uy: number; dist: number } | null => {
  const dx = origin.x - cur.x, dy = origin.y - cur.y;
  const d = Math.hypot(dx, dy);
  if (d < TSUBAME_MIN_DIST_PX) return null;
  return { ux: dx / d, uy: dy / d, dist: Math.min(d, maxDist) };
};

/** 距離に合わせた燕返しの所要時間(一閃と同じ速さ=距離/最大距離×一閃の時間)。 */
export const tsubameDashMs = (dist: number, maxDist: number, dashMs: number): number =>
  Math.max(1, Math.round(dashMs * Math.max(0, Math.min(1, dist / Math.max(1e-6, maxDist)))));

// ---- 切り傷と殺陣(§4) ----
/** 1体に刻める切り傷の最大本数。 */
export const KATANA_CUT_MAX = 4;
/** 殺陣の一閃の発数。 */
export const SATSUJIN_HITS = 5;
/** 殺陣の1発の間隔(ms・実時間)。 */
export const SATSUJIN_STRIKE_MS = 90;
/** 殺陣の赤い画面の入り(ms)。 */
export const SATSUJIN_FADE_IN_MS = 60;
/** 最後の1発の止めの後、通常の画面へ戻る長さ(ms)。 */
export const SATSUJIN_FADE_OUT_MS = 180;
/** 殺陣の1発の筋の長さの半分(敵の中心を通り抜ける一閃の始点〜終点の半分・px)。一閃の距離の半分。 */
export const SATSUJIN_HALF_LEN_PX = 77;
/** 最後の1発の止め(ヒットストップ・ms)。一閃の止めより大きく。 */
export const SATSUJIN_FINAL_HITSTOP_MS = 140;

/** 一閃・燕返しが当たった後の切り傷の本数(+1・最大4)。 */
export const nextKatanaCuts = (cuts: number | undefined): number => Math.min(KATANA_CUT_MAX, Math.max(0, cuts ?? 0) + 1);

/** この当たりで殺陣になるか(当たる前に4本入っている敵)。 */
export const triggersSatsujin = (cuts: number | undefined): boolean => (cuts ?? 0) >= KATANA_CUT_MAX;

/**
 * 殺陣の5発の向き(rad)。四方八方=一周を5つに割り、1発ごとに大きく飛ばした順(星形=前の1発の反対寄りから来る)に並べ、
 * 角度を少し散らす(機械的な等間隔にしない)。base=最初の1発の向き・rand=0..1 を返す関数(テストで決め打ちできる)。
 */
export const satsujinAngles = (base: number, rand: () => number, n = SATSUJIN_HITS): number[] => {
  const step = (Math.PI * 2) / n;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const slot = (k * 2) % n; // 0,2,4,1,3=星形の順
    out.push(base + slot * step + (rand() * 2 - 1) * step * 0.22);
  }
  return out;
};

/** 殺陣の赤い画面の濃さ(0..1)。入りは速く(ease-out)、最後の1発の止めの後に慣性つきで戻る(ease-in-out)。 */
export const satsujinCoverAlpha = (startAt: number, lastStrikeEndAt: number, now: number): number => {
  if (now < startAt) return 0;
  const tin = Math.min(1, (now - startAt) / SATSUJIN_FADE_IN_MS);
  const inA = 1 - (1 - tin) ** 2;
  if (now <= lastStrikeEndAt) return inA;
  const tout = Math.min(1, (now - lastStrikeEndAt) / SATSUJIN_FADE_OUT_MS);
  const e = tout < 0.5 ? 2 * tout * tout : 1 - (-2 * tout + 2) ** 2 / 2;
  return inA * (1 - e);
};
