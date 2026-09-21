// ★敵の攻撃モーション(社長支給2026-09-20「武器を振り下ろす絵」・バット女の6コマ)。
//
// ★何を決める葉か: **どのコマを出すか**だけ。判定・ダメージ・射程・尺は1msも触らない
// (CLAUDE.md「Visual vs. hitbox」)。尺は既存の噛みつき台本(`BiteSpec`)から引く=新しい時計を作らない。
//
// ★★**掟③「消え切る時刻 = 当たる時刻」**(CLAUDE.md 赤い予告の4つの掟)に合わせる。
// 武器が**振り下ろし切ったコマ**は、**命中が解決する瞬間(溜め+振りの終わり)にちょうど終わる**。
// 早く下ろすと「下りているのにまだ当たらない」、遅いと「当たったのにまだ振っていない」になる。
//
// ★**コマ尺は等間隔にしない**(クリエイティブ監査2026-09-20 #9「機械的に等間隔」の是正)。
// 構えは長く持ち、振り上げは速く、**振り下ろしは一番短い**(=速い)。現実の振りの形。
import { biteSpecFor, BAT_WINDUP_STILL_MS } from './enemyBite';
import { BAT_LANTERN_SETTLE_MS } from './batLanternSwing';
export { ENEMY_ATTACK_SHEETS, attackSheetName, attackSheetFrames } from './enemySheets';
import type { Enemy } from '../types/game';


/**
 * ★コマの割り付け(6コマ)。**絵の読み**(社長支給の並び)に合わせてある:
 *  0=立ち(武器は下・構え) / 1,2=振り上げ / 3=頭上で溜め切り / 4=振り下ろし(当たる) / 5=振り抜き
 *
 * 区切りは**尺から計算する**(数字を手写ししない)。`BAT_WINDUP_STILL_MS` は §16-E の
 * 「武器を構えて一瞬止まる」の長さで、ここの0コマ目の持ちと同じもの。
 */
export interface AttackFrameSpan { frame: number; untilMs: number }

export const attackFrameSpans = (windupMs: number, biteMs: number, settleMs: number): AttackFrameSpan[] => {
  const still = Math.min(windupMs, BAT_WINDUP_STILL_MS);   // 0コマ目=構えの持ち
  const rise = Math.max(1, windupMs - still);              // 振り上げに使える残り
  const hit = windupMs + biteMs;                           // ★命中が解決する瞬間
  // 振り下ろし(4コマ目)は**一番短い**=速い。振りの窓の 3/10 を当てる。
  const slam = Math.max(1, Math.round(biteMs * 0.3));
  return [
    { frame: 0, untilMs: still },                 // 構え(止まる)
    { frame: 1, untilMs: still + rise * 0.5 },    // 振り上げ前半
    { frame: 2, untilMs: windupMs },              // 振り上げ後半
    { frame: 3, untilMs: hit - slam },            // 頭上で溜め切り(一番長く持つ=読ませる)
    { frame: 4, untilMs: hit },                   // ★振り下ろし: ここが終わる瞬間に当たる
    { frame: 5, untilMs: hit + settleMs },        // 振り抜き(余韻)
  ];
};

/** 余韻の長さ。★ランタンの振り抜き(`BAT_LANTERN_SETTLE_MS`)と**同じ値を引く**
 * ——腕(シート)と武器(別スプライト)で余韻の尺が違うと、振り抜きが二重になる。 */
export const ATTACK_SETTLE_MS = BAT_LANTERN_SETTLE_MS;

/**
 * 出すコマ。**その技を出していなければ null**(=呼び手は歩き/立ち絵へ落ちる)。
 * @param sinceMs `gameTime - biteAt`(台本の経過)。
 */
export const enemyAttackFrame = (
  frames: number, sinceMs: number, windupMs: number, biteMs: number,
  settleMs: number = ATTACK_SETTLE_MS,
): number | null => {
  if (frames <= 1 || !(sinceMs >= 0)) return null;
  const spans = attackFrameSpans(windupMs, biteMs, settleMs);
  for (const s of spans) if (sinceMs < s.untilMs) return Math.min(frames - 1, s.frame);
  return null;   // 余韻も過ぎた=技は終わっている
};

/** その個体が「いま攻撃シートを出すべきか」。尺は `biteSpecFor` から引く(手写ししない)。 */
export const enemyAttackFrameFor = (
  e: Pick<Enemy, 'type' | 'biteAt' | 'chaffMove' | 'aiPhase'>, frames: number, gameTime: number,
): number | null => {
  if (e.biteAt === undefined || e.biteAt <= 0) return null;
  const spec = biteSpecFor(e.type, e.chaffMove, e.aiPhase);
  return enemyAttackFrame(frames, gameTime - e.biteAt, spec.windupMs, spec.biteMs);
};
