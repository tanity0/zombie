// 舞妓の手毬打ち(mk-boom-out/back)の毬の位置。判定(bountyTick)と絵(pixiScene)が同じ式を読む(絵と判定を一致させる)。
// research/SHIELD_BLOCK.md §1: 往路で味方の盾に触れた毬は、接点で一瞬止まり(80〜120ms)、いったん押し戻されるように
// 減速してから加速して戻る。進み具合 p = 投げた点(0)→最遠点(1)。依存ゼロの葉モジュール。

/** 盾に当たった毬が接点で止まっている時間(ms)。 */
export const MAIKO_BOUNCE_STOP_MS = 100;

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;

/** 止まった後の戻りにかける時間(ms)。接点が遠いほど長い。 */
export const maikoBounceReturnMs = (p0: number, backMs: number): number => Math.max(180, p0 * backMs * 1.25);
/** 接点での停止+戻りの全体(ms)。bossStateUntil はこれだけ先にする。 */
export const maikoBounceTotalMs = (p0: number, backMs: number): number => MAIKO_BOUNCE_STOP_MS + maikoBounceReturnMs(p0, backMs);

/**
 * 盾に当たった後の毬の進み具合。elapsedMs=接点に当たってからの時間。
 * 停止(p0 のまま)→ 戻り: 最初の押し戻しで少しだけ動いて減速(止まりかける)→ そこから加速して戻る。始まりも終わりも滑らか(慣性)。
 */
export const maikoBounceProgress = (p0: number, elapsedMs: number, backMs: number): number => {
  if (elapsedMs <= MAIKO_BOUNCE_STOP_MS) return p0;
  const tau = clamp01((elapsedMs - MAIKO_BOUNCE_STOP_MS) / maikoBounceReturnMs(p0, backMs));
  const w = 0.15 * easeInOutSine(tau / 0.22) + 0.85 * easeInOutSine((tau - 0.22) / 0.78);
  return p0 * (1 - w);
};

/**
 * 毬の進み具合 p(0=投げた点 / 1=最遠点)。
 *   往路: p = 1 - 残り/outMs / 復路: p = 残り/backMs(従来の線形)/ 盾で弾かれた復路(bounceAt あり): maikoBounceProgress。
 * gameTime / bossStateUntil / bounceAt は同じ時計(gameTime)。
 */
export const maikoBoomProgress = (
  out: boolean, gameTime: number, bossStateUntil: number, outMs: number, backMs: number,
  bounceAt?: number, bounceP0?: number,
): number => {
  if (!out && bounceAt !== undefined && bounceP0 !== undefined) return maikoBounceProgress(bounceP0, gameTime - bounceAt, backMs);
  const total = out ? outMs : backMs;
  const t = clamp01(1 - (bossStateUntil - gameTime) / total);
  return out ? t : 1 - t;
};
