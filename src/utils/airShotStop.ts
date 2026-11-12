// ★空中の敵に弾が当たった時の、その敵だけのヒットストップ(社長指示2026-11-12「空中にいる敵に弾が当たったら、一瞬だけHITストップして。
// 銃の弾速に比例して止まる時間を変える。早いほど短い」)。
// 止まっている間は、その敵の浮きの時計(弧の始まり・浮きの終わり・爆発で浮かない窓)と押しの時計を壁時計の経過ぶん後ろへずらす
// (弧の形 brLiftMs は変えない=止めた分だけ着地が遅れる)。位置・AI は store の updateEnemies が止める。
// ここは store にも描画にも依存しない純関数だけを置く。時計は全部 Date.now(浮き・押しと同じ)。
import { brawlerAirborne, type BrawlerJuggleFields } from './brawlerCombo';

/** 基準の弾速(拳銃=520・CATALOG の projectileSpeed の物差し)で止める長さ(ms)。 */
export const AIR_SHOT_STOP_BASE_MS = 140;
export const AIR_SHOT_STOP_REF_SPEED = 520;
export const AIR_SHOT_STOP_MIN_MS = 60;
export const AIR_SHOT_STOP_MAX_MS = 220;
/** 次の止めまでの間 = 前の止めの長さ × これ(2=延びは元の浮きの約半分まで)。 */
export const AIR_SHOT_STOP_GAP_MULT = 2;

/** 止める長さ = clamp(140 × 520 / 弾速, 60, 220)。弾速が無い(0以下)なら止めない(0)。 */
export const airShotStopMs = (speed: number): number => {
  if (!(speed > 0)) return 0;
  const ms = Math.round(AIR_SHOT_STOP_BASE_MS * AIR_SHOT_STOP_REF_SPEED / speed);
  return Math.max(AIR_SHOT_STOP_MIN_MS, Math.min(AIR_SHOT_STOP_MAX_MS, ms));
};

export interface AirShotStopFields extends BrawlerJuggleFields {
  /** 止めの始まり・終わり(Date.now)。 */
  airShotStopAt?: number;
  airShotStopUntil?: number;
  /** この止めで既に後ろへずらした長さ(ms)。 */
  airShotStopShifted?: number;
  liftUntil?: number;
  knockbackUntil?: number;
  knockbackStopFor?: number;
  brawlerShakeUntil?: number;
  brawlerShakeDx?: number;
  brawlerShakeDy?: number;
}

/** いま止まっているか。 */
export const airShotStopped = (e: Pick<AirShotStopFields, 'airShotStopUntil'>, now: number): boolean =>
  e.airShotStopUntil !== undefined && now < e.airShotStopUntil;

/**
 * 弾が当たった瞬間の止め。null=止めない。
 *  - 浮いている敵だけ(地上は止めない)。
 *  - 重ならない: 止めの最中は延ばさない・張り直さない。
 *  - 間を空ける: 前の止めが明けてから、前の止めの長さ×AIR_SHOT_STOP_GAP_MULT(2)が過ぎるまでは止めない
 *    (止まっている時間は空中の全体の約1/3まで=連射しても浮きの延びは元の浮きの約半分まで)。
 *  - 震え: 格闘の止めの震えと同じ欄(brawlerShakeUntil・当てた方向)。絵だけ。
 */
export const airShotStopPatch = (
  e: AirShotStopFields, speed: number, now: number, dirX: number, dirY: number,
): Partial<AirShotStopFields> | null => {
  if (!brawlerAirborne(e, now)) return null;
  const ms = airShotStopMs(speed);
  if (ms <= 0) return null;
  if (e.airShotStopAt !== undefined && e.airShotStopUntil !== undefined) {
    if (now < e.airShotStopUntil) return null;
    if (now < e.airShotStopUntil + AIR_SHOT_STOP_GAP_MULT * (e.airShotStopUntil - e.airShotStopAt)) return null;
  }
  const dl = Math.hypot(dirX, dirY) || 1;
  return {
    airShotStopAt: now, airShotStopUntil: now + ms, airShotStopShifted: 0,
    brawlerShakeUntil: Math.max(e.brawlerShakeUntil ?? 0, now + ms), brawlerShakeDx: dirX / dl, brawlerShakeDy: dirY / dl,
  };
};

/**
 * 毎フレーム(updateEnemies の前処理): 止めの間に過ぎた壁時計の長さだけ、浮き・押しの時計を後ろへずらす。null=何もしない。
 * 止めの終わりを越えた分はずらさない(ずらす合計は止めの長さちょうど)。
 */
export const airShotStopTick = (e: AirShotStopFields, now: number): Partial<AirShotStopFields> | null => {
  if (e.airShotStopAt === undefined || e.airShotStopUntil === undefined) return null;
  const target = Math.max(0, Math.min(now, e.airShotStopUntil) - e.airShotStopAt);
  const d = target - (e.airShotStopShifted ?? 0);
  if (d <= 0) return null;
  const sh = (t: number | undefined): number | undefined => (t === undefined ? undefined : t + d);
  const out: Partial<AirShotStopFields> = { airShotStopShifted: target };
  if (e.brawlerLiftAt !== undefined) out.brawlerLiftAt = sh(e.brawlerLiftAt);
  if (e.brLiftUntil !== undefined) out.brLiftUntil = sh(e.brLiftUntil);
  if (e.liftUntil !== undefined && e.liftUntil > e.airShotStopAt) out.liftUntil = sh(e.liftUntil);
  if (e.brBlastNoLiftUntil !== undefined && e.brBlastNoLiftUntil > e.airShotStopAt) out.brBlastNoLiftUntil = sh(e.brBlastNoLiftUntil);
  if (e.brBlastAirSince !== undefined) out.brBlastAirSince = sh(e.brBlastAirSince);
  if (e.knockbackUntil !== undefined && e.knockbackUntil > e.airShotStopAt) {
    out.knockbackUntil = sh(e.knockbackUntil);
    if (e.knockbackStopFor === e.knockbackUntil) out.knockbackStopFor = out.knockbackUntil;
  }
  return out;
};
