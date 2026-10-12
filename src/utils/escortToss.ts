// ★兵士のトス(research/ESCORT_TOSS.md・社長指示2026-10-12「進軍NPCは稀に(クリティカルで？)こちらに敵を吹き飛ばしてくる。
// 吹き飛んだ敵を近接するとクリティカル中と同じ扱いにする」)。
// 兵士の会心で倒れずに気絶した敵を、プレイヤーの手前(近接が届く所)へ飛ばす。気絶は既存のまま=近接は既存のとどめ。
// ここは判定と幾何の純関数だけ(store が呼ぶ・テストで固定する)。gameStore を import しない。
import type { Enemy, EnemyType } from '../types/game';
import { isBossType, isCorpse, isHangedman, isHordeFollower, resistsChipKnockback } from './enemyUtils';

/** 飛ぶ時間(ms・ゲーム時間)。 */
export const ESCORT_TOSS_MS = 420;
/** 前のトスからこれだけ空ける(ms・ゲーム時間)=「稀に」。 */
export const ESCORT_TOSS_CD_MS = 8000;
/** まだ一度もトスしていない時の「前回の時刻」(出撃の0msからでも間隔に掛からない)。 */
export const ESCORT_TOSS_NEVER = -1e9;
/** 敵の中心からプレイヤーの中心までの距離の範囲(px)。近すぎると飛ばす意味が無い/遠すぎると届かない。 */
export const ESCORT_TOSS_MIN_DIST = 160;
export const ESCORT_TOSS_MAX_DIST = 640;
/** 着地点=プレイヤーの中心から敵の方へこの距離(px・近接が届く所)。 */
export const ESCORT_TOSS_STOP_PX = 72;
/** 着地点を「プレイヤーの向いている側」へ回す最大角(度)。真正面へ一直線だと突進してくる敵に見えるため(クリエイティブ監査 #1)。 */
export const ESCORT_TOSS_SWING_DEG = 35;

export interface EscortTossInput {
  enemy: Pick<Enemy, 'type' | 'health' | 'corpseUntil' | 'dormant' | 'fromEvent' | 'aiPhase' | 'hordeLeaderId' | 'hordeState'>
    & { x: number; y: number; width: number; height: number };
  playerCx: number;
  playerCy: number;
  playerAlive: boolean;
  inputLocked: boolean;      // 会話・一時停止・アテンション
  gameTime: number;
  lastTossAt: number;        // 前のトスの時刻(まだ無い時は ESCORT_TOSS_NEVER)
}

/** 型として飛ばせるか(ボス級・使者・押されにくい型は飛ばさない)。 */
export const escortTossableType = (t: EnemyType): boolean =>
  !isBossType(t) && !isHangedman(t) && !resistsChipKnockback(t);

/** いまトスしてよいか(兵士の会心で倒れずに気絶した瞬間に呼ぶ)。 */
export const escortTossDecision = (i: EscortTossInput): boolean => {
  const e = i.enemy;
  if (!i.playerAlive || i.inputLocked) return false;
  if (i.gameTime - i.lastTossAt < ESCORT_TOSS_CD_MS) return false;
  if (!(e.health > 0) || isCorpse(e) || e.dormant === true || e.fromEvent) return false;
  if (!escortTossableType(e.type) || isHordeFollower(e)) return false;
  if (e.aiPhase === 'jump' || e.aiPhase === 'charge') return false; // 技を完遂するまで位置が動かない(品質監査 A-2)
  const d = Math.hypot(e.x + e.width / 2 - i.playerCx, e.y + e.height / 2 - i.playerCy);
  return d >= ESCORT_TOSS_MIN_DIST && d <= ESCORT_TOSS_MAX_DIST;
};

/**
 * 着地点(敵の中心が来る点)。プレイヤーの中心から敵の方へ STOP_PX の点を、プレイヤーの向き(faceX/faceY)の側へ
 * 最大 SWING_DEG 回す(向きが無い・敵が真後ろ/真正面なら回さない向きも含めて、近い側へ寄せる)。
 */
export const escortTossLanding = (
  enemyCx: number, enemyCy: number, playerCx: number, playerCy: number, faceX: number, faceY: number,
): { x: number; y: number } => {
  let ax = enemyCx - playerCx, ay = enemyCy - playerCy;
  const al = Math.hypot(ax, ay) || 1;
  ax /= al; ay /= al;
  let ang = Math.atan2(ay, ax);
  const fl = Math.hypot(faceX, faceY);
  if (fl > 0.001) {
    const fa = Math.atan2(faceY / fl, faceX / fl);
    let diff = fa - ang;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const max = (ESCORT_TOSS_SWING_DEG * Math.PI) / 180;
    ang += Math.max(-max, Math.min(max, diff));
  }
  return { x: playerCx + Math.cos(ang) * ESCORT_TOSS_STOP_PX, y: playerCy + Math.sin(ang) * ESCORT_TOSS_STOP_PX };
};

/** 飛んでいる途中の位置の割合(ease-out=1-(1-t)^2・初速最大→着地で0)。 */
export const escortTossProgress = (gameTime: number, startAt: number, endAt: number): number => {
  const t = Math.max(0, Math.min(1, (gameTime - startAt) / Math.max(1, endAt - startAt)));
  return 1 - (1 - t) * (1 - t);
};
