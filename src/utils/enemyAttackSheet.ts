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

/**
 * ★**構えで止まる長さ**。**型ごとに違う**ので、噛み台本の `lungeMs`(踏み込みに使う時間)から出す:
 * **止まる = 溜め − 踏み込み**。踏み込みが溜めをいっぱいまで使う型(`lungeMs` 省略=溜めと同値)だけ
 * コウモリの値(`BAT_WINDUP_STILL_MS`)を使う。
 *
 * ★**なぜ要るか(社長報告2026-09-22「skeleton、攻撃の時、引っ掻きのモーション流れてる?」)**:
 * 骸骨の溜めは **300ms**、コウモリの止まりは **250ms**。一律に250を引くと**振り上げに50msしか残らず**、
 * 5コマが**1コマ10ms=60fpsで0.6フレーム**になって**ほとんど表示されない**(実測: 0→4→6 と飛んでいた)。
 * 骸骨は `lungeMs: 180` なので **止まり120ms + 振り上げ180ms**(1コマ36ms)になり、ちゃんと見える。
 * ★**噛みの時刻(溜め+噛み)は1msも動かない。** 溜めの**内訳の割り方**だけを直している。
 */
export const attackStillMs = (windupMs: number, lungeMs?: number): number =>
  (lungeMs !== undefined && lungeMs < windupMs)
    ? Math.max(1, windupMs - lungeMs)
    : Math.min(windupMs, BAT_WINDUP_STILL_MS);

export const attackFrameSpans = (
  frames: number, impact: number, windupMs: number, biteMs: number, settleMs: number,
  stillMs?: number,
): AttackFrameSpan[] => {
  const still = Math.min(windupMs, stillMs ?? BAT_WINDUP_STILL_MS);   // 0コマ目=構えの持ち
  const rise = Math.max(1, windupMs - still);              // 振り上げに使える残り
  const hit = windupMs + biteMs;                           // ★命中が解決する瞬間
  // 振り(`impact`コマ)は**一番短い**=速い。振りの窓の 3/10 を当てる。
  const slam = Math.max(1, Math.round(biteMs * 0.3));
  const out: AttackFrameSpan[] = [{ frame: 0, untilMs: still }];   // 構え(止まる)
  // 1 .. impact-2 = 振り上げ。溜めの残りを等分する(ここだけは等分でよい=連続した振り上げ)。
  const riseCount = Math.max(0, impact - 2);
  for (let k = 1; k <= riseCount; k++) out.push({ frame: k, untilMs: still + rise * (k / riseCount) });
  // impact-1 = 溜め切り(一番長く持つ=読ませる)。★riseCount=0 の時はこのコマが溜めを全部持つ。
  out.push({ frame: impact - 1, untilMs: hit - slam });
  // impact = 振り。★ここが終わる瞬間に当たる。
  out.push({ frame: impact, untilMs: hit });
  // impact+1 .. 末尾 = 振り抜き(余韻)。等分。
  const tail = frames - 1 - impact;
  for (let k = 1; k <= tail; k++) out.push({ frame: impact + k, untilMs: hit + settleMs * (k / tail) });
  return out;
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
  settleMs: number = ATTACK_SETTLE_MS, impact: number = frames - 2, stillMs?: number,
): number | null => {
  if (frames <= 1 || !(sinceMs >= 0)) return null;
  const spans = attackFrameSpans(frames, Math.max(1, Math.min(frames - 1, impact)), windupMs, biteMs, settleMs, stillMs);
  for (const s of spans) if (sinceMs < s.untilMs) return Math.min(frames - 1, s.frame);
  return null;   // 余韻も過ぎた=技は終わっている
};

/** その個体が「いま攻撃シートを出すべきか」。尺は `biteSpecFor` から引く(手写ししない)。 */
export const enemyAttackFrameFor = (
  e: Pick<Enemy, 'type' | 'biteAt' | 'chaffMove' | 'aiPhase'>, frames: number, gameTime: number,
  impact: number = frames - 2,
): number | null => {
  if (e.biteAt === undefined || e.biteAt <= 0) return null;
  const spec = biteSpecFor(e.type, e.chaffMove, e.aiPhase);
  // ★構えで止まる長さは**型ごと**(溜め − 踏み込み)。一律だと溜めの短い型で振り上げが潰れる。
  return enemyAttackFrame(frames, gameTime - e.biteAt, spec.windupMs, spec.biteMs,
    ATTACK_SETTLE_MS, impact, attackStillMs(spec.windupMs, spec.lungeMs));
};

// ---------------------------------------------------------------------------------------------
// ★振り抜き(余韻)のコマを出す(v0.25.4608・走査で判明)
// ---------------------------------------------------------------------------------------------
/**
 * 支給された攻撃シートには**当たった後の「振り抜き」コマ**がある(リッチは11コマ中6コマ=
 * 「鞭が地を打つ・火花が最大」を含む / ゾンビ3コマ / 骸骨(女)2コマ / 他1コマ)。
 * ところが判定側は**当たったその瞬間に `biteAt` を0へ戻す**ので、`enemyAttackFrameFor` が
 * そこで null を返し、**振り抜きのコマは1度も画面に出ていなかった**。
 *
 * ここは**描く側だけの記憶**で余韻を出し切る(判定には一切触らない=噛みの時刻も硬直も不変)。
 *
 * ★**出すのは「当たった後」だけ**。カウンター・気絶・死亡での中断は**当たる前に**消えるので、
 *   「経過が命中の時刻を過ぎている」ことを条件にすれば中断と混ざらない
 *   (中断の見せ方はカウンターの巻き戻し=`counterRewind.ts` の担当)。
 * ★尺・コマの割り方は**live と同じ関数**(`enemyAttackFrame`)を通す=二重の台帳を作らない。
 */
export interface AttackTailMemo {
  /** 技が始まった時刻(`Enemy.biteAt`・ゲーム内時刻)。 */
  at: number;
  windupMs: number;
  biteMs: number;
  lungeMs?: number;
}

export const attackTailFrame = (
  memo: AttackTailMemo | undefined, frames: number, gameTime: number,
  impact: number, settleMs: number = ATTACK_SETTLE_MS,
): number | null => {
  if (!memo || !(memo.at > 0) || frames <= 1) return null;
  const since = gameTime - memo.at;
  const hit = memo.windupMs + memo.biteMs;
  if (!(since >= hit)) return null;              // ★当たる前に消えた=中断。余韻は出さない
  if (since > hit + settleMs) return null;       // 余韻も過ぎた=技は終わっている
  return enemyAttackFrame(frames, since, memo.windupMs, memo.biteMs, settleMs, impact,
    attackStillMs(memo.windupMs, memo.lungeMs));
};
