/**
 * ★ボスが止まっている間は**立ち絵で止める**(社長指示2026-09-29「ボスが止まる時(致命のみ？)技の見た目で止めずに、立ち絵で止めて」)。
 *
 * ボスが「止まる」のは2つ(どちらも全ボス共通の時計):
 *  ①**体勢ブレイク(紫)**= `bossFullStunUntil`(完全気絶・約3秒)
 *  ②**致命の一撃の後の停止**= `stunUntil`(`BOSS_FATAL_DAZE_MS`=2秒)
 * この間、技の州(`bossState`/`aiPhase`)は技の途中のまま止まることがある(賞金首・城ボスは紫で州を戻さない)ので、
 * 技のシートのコマを引くと**技の途中の姿で固まって見える**。⇒ 止まっている間は技/歩き/待機のコマを引かず、立ち絵にする。
 * 対象=ボス格(裏ボス・天使・フィル・城ボス/グレン・賞金首)。雑魚の気絶は対象外(社長の言葉は「ボス」)。
 * 描画だけが読む純関数(止まる長さ・判定・AIには一切触れない)。
 */
import type { Enemy } from '../types/game';

export const isBossLikeForStopArt = (type: string, hiddenBoss: boolean): boolean =>
  hiddenBoss || type === 'giantbat' || type.startsWith('bounty-');

export const bossStoppedForArt = (
  e: Pick<Enemy, 'type' | 'bossFullStunUntil' | 'stunUntil'>, gameTime: number, hiddenBoss: boolean,
): boolean => {
  if (!isBossLikeForStopArt(e.type, hiddenBoss)) return false;
  const fullStun = e.bossFullStunUntil !== undefined && gameTime < e.bossFullStunUntil;
  const fatalDaze = e.stunUntil !== undefined && gameTime < e.stunUntil;
  return fullStun || fatalDaze;
};
