/**
 * ★リッチの転移(PACING_PUZZLE.md §16-B B-5・社長指示2026-09-17
 * 「**リッチは、噛みつきを発動したら自分の所定距離までワープする。CD中は例のヒステリシスで**」)。
 *
 * ★**3拍の文法は全型で同じ**——**噛む → 硬直 → 離れる**。スケルトン/ゾンビが走って下がる所を、
 * リッチは**消えて現れる**。違うのは「離れる手段」だけで、**硬直は飛ばさない**
 * (飛ばすとリッチだけ一度も殴り返せない敵になり、読む動機が消える=B-5)。
 *
 * ★**転移そのものに慣性は無い**(瞬間移動に加減速は無い)。慣性MUSTが掛かるのは**演出**の方で、
 * **消滅は加速しながら潰れ、出現は行き過ぎて収まる**。ここはその式だけを持つ(描画はpixiが読む)。
 */
import type { Enemy } from '../types/game';
import { idRespawnUnitHash } from './chaffMoves';

/** 着地距離(§16-B B-3・叩き台)。リッチは自前の間合いを持たないので、ここで新しく置く。 */
export const LICH_KEEP_RADIUS_PX = 200;
/** 消える尺。短い=「逃げられた」と分かる最小。 */
export const LICH_WARP_VANISH_MS = 180;
/** 現れる尺。消えるより長い(**行き過ぎて収まる**ぶんの時間が要る)。 */
export const LICH_WARP_APPEAR_MS = 240;

const SALT_LICH_ANGLE = 0x6c31;

/**
 * 着地点(**中心座標**)。**今いる方角を保ったまま外へ退く**——的を挟んで反対側へ飛ぶと
 * 「どこへ行ったか」が読めず、プレイヤーの正面へ突然現れる事故も起きる。
 * 個体ごとの固定オフセット(±約50度)で、複数体が同じ点に重ならないようにする。
 */
export const lichWarpLanding = (
  tx: number, ty: number, ecx: number, ecy: number,
  id: string, spawnedAt: number | undefined, radiusPx: number = LICH_KEEP_RADIUS_PX,
): { x: number; y: number } => {
  const base = Math.atan2(ecy - ty, ecx - tx);          // 的→リッチ(=今いる方角)
  const off = (idRespawnUnitHash(id, spawnedAt, SALT_LICH_ANGLE) * 2 - 1) * 0.9; // ±約51度
  const a = base + off;
  return { x: tx + Math.cos(a) * radiusPx, y: ty + Math.sin(a) * radiusPx };
};

/** 消えている最中か(この間は動かない・技も出さない)。 */
export const lichIsVanishing = (e: Enemy, gameTime: number): boolean =>
  e.lichWarpAt !== undefined && gameTime < e.lichWarpAt + LICH_WARP_VANISH_MS;

/** 転移の時刻が来たか(このフレームで座標が飛ぶ)。 */
export const lichWarpDue = (e: Enemy, gameTime: number): boolean =>
  e.lichWarpAt !== undefined && gameTime >= e.lichWarpAt + LICH_WARP_VANISH_MS;

/** 0..1(消える進み)。消えていなければ null。 */
export const lichVanishProgress = (e: Enemy, gameTime: number): number | null => {
  if (e.lichWarpAt === undefined) return null;
  const t = (gameTime - e.lichWarpAt) / LICH_WARP_VANISH_MS;
  return t >= 0 && t < 1 ? t : null;
};

/** 0..1(現れる進み)。現れ終わっていれば null。 */
export const lichAppearProgress = (e: Enemy, gameTime: number): number | null => {
  if (e.lichWarpDoneAt === undefined) return null;
  const t = (gameTime - e.lichWarpDoneAt) / LICH_WARP_APPEAR_MS;
  return t >= 0 && t < 1 ? t : null;
};

/** 行き過ぎて収まる(back-out)。u=1で必ず1、途中で1を超える。 */
const backOut = (u: number): number => {
  const p = u - 1;
  return 1 + p * p * (2.7 * p + 1.7);
};

/**
 * 体の変形と透明度(`corpseSquashNow` と同じ作法=純関数を描画が読むだけ)。
 * - **消滅**: 加速しながら縦に潰れて横へ広がる(床の陣に吸われる)。
 * - **出現**: 潰れた状態から**行き過ぎて**伸び、収まる。
 */
export const lichWarpPose = (e: Enemy, gameTime: number): { sqX: number; sqY: number; alpha: number } => {
  const v = lichVanishProgress(e, gameTime);
  if (v !== null) {
    const p = v * v * v;                     // 加速(等速で消えない)
    return { sqX: 1 + 0.55 * p, sqY: 1 - 0.88 * p, alpha: 1 - p };
  }
  const a = lichAppearProgress(e, gameTime);
  if (a !== null) {
    const b = backOut(a);
    return { sqX: 1.45 - 0.45 * b, sqY: 0.42 + 0.58 * b, alpha: Math.min(1, a * 2.6) };
  }
  return { sqX: 1, sqY: 1, alpha: 1 };
};
