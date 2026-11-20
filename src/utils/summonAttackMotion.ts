// 錬金術の変異体(召喚の通常個体)が攻撃する時の「攻撃モーション」の時計(社長指示2026-11-20
// 「錬金術の変異体も、攻撃時は攻撃モーション流して、攻撃してるっぽくしてほしい」)。
//
// ★何を決める葉か: **いつ・どのコマを出すか**だけ。攻撃の判定(間隔・間合い・ダメージ)は1msも触らない。
// 当たる時刻は store が `Summon.lastContactAt` に打刻する(=実際にダメージが入った瞬間)。
// 通常個体は間合いに敵が居る限り `ALCHEMY_ATTACK_INTERVAL_MS` ごとに当てるので、
// **次の命中は「前の命中+間隔」**と読める。溜めのコマはその時刻へ向けて流し、**当たるコマ=命中の瞬間**に揃える。
// 1発目だけは前の命中が無いので溜めが出ない(当たった瞬間から振り抜きのコマ)。
//
// 尺とコマの割り方は敵の攻撃シートと同じ関数(`enemyAttackFrame`)を通す=二重の台帳を作らない。
// PixiJS非依存の純関数。
import { enemyAttackFrame, attackFrameSpans } from './enemyAttackSheet';

/** 命中の前に溜め+振りへ使う長さ(この間に構え→振り上げ→振り下ろしが流れる)。 */
export const SUMMON_ATTACK_WINDUP_MS = 230;
export const SUMMON_ATTACK_SWING_MS = 100;
export const SUMMON_ATTACK_LEAD_MS = SUMMON_ATTACK_WINDUP_MS + SUMMON_ATTACK_SWING_MS;
/** 命中の後の振り抜き(余韻)。 */
export const SUMMON_ATTACK_FOLLOW_MS = 220;
/** 構えで止まる長さ(溜めのうち、0コマ目を持つ時間)。 */
export const SUMMON_ATTACK_STILL_MS = 40;

/**
 * 前の命中からの経過 → **命中の時刻に対する相対時刻**(負=次の命中の手前 / 正=直前の命中の後)。
 * - `rel`: 攻撃モーションを流す区間なら数値、そうでなければ null。
 * - `engaged`: 攻撃の合間(振り抜きと次の溜めの間)=構えを保つ区間か。
 * 次の命中が来なかった時(敵が倒れた/離れた)は、予定の時刻で振り抜いてそのまま余韻を出して終わる。
 */
export const summonAttackRel = (
  sinceHitMs: number, intervalMs: number,
  leadMs: number = SUMMON_ATTACK_LEAD_MS, followMs: number = SUMMON_ATTACK_FOLLOW_MS,
): { rel: number | null; engaged: boolean } => {
  if (!(sinceHitMs >= 0)) return { rel: null, engaged: false };
  if (sinceHitMs < followMs) return { rel: sinceHitMs, engaged: true };
  const windupStart = intervalMs - leadMs;
  if (sinceHitMs >= windupStart && sinceHitMs < intervalMs + followMs) return { rel: sinceHitMs - intervalMs, engaged: true };
  if (sinceHitMs < windupStart) return { rel: null, engaged: true };
  return { rel: null, engaged: false };
};

/** シートのコマ割り(攻撃シート=当たるコマ / 跳びシート=着地の1コマ目を当たるコマに読む)。 */
export interface SummonAttackSheet {
  frames: number;
  impact: number;
  /** 跳ぶ型(蜘蛛): 滞空のコマの範囲 [airFrom, airTo)。この区間だけ体が浮く。 */
  airFrom?: number;
  airTo?: number;
}

/**
 * 出すコマと浮き(0..1)。null=攻撃モーションを出さない(歩き/立ち絵のまま)。
 * 合間(engaged かつ rel=null)は0コマ目=構えを保つ(歩きへ1フレームだけ落ちない)。
 */
export const summonAttackPose = (
  sinceHitMs: number, intervalMs: number, sheet: SummonAttackSheet,
): { frame: number; lift01: number } | null => {
  const { frames } = sheet;
  if (frames <= 1) return null;
  const impact = Math.max(1, Math.min(frames - 1, sheet.impact));
  const { rel, engaged } = summonAttackRel(sinceHitMs, intervalMs);
  if (rel === null) return engaged ? { frame: 0, lift01: 0 } : null;
  const t = rel + SUMMON_ATTACK_LEAD_MS; // 溜めの始まりからの経過(=命中が LEAD_MS)
  const f = enemyAttackFrame(frames, t, SUMMON_ATTACK_WINDUP_MS, SUMMON_ATTACK_SWING_MS,
    SUMMON_ATTACK_FOLLOW_MS, impact, SUMMON_ATTACK_STILL_MS);
  if (f === null) return engaged ? { frame: 0, lift01: 0 } : null;
  let lift01 = 0;
  if (sheet.airFrom !== undefined && sheet.airTo !== undefined && sheet.airTo > sheet.airFrom) {
    // 浮きは滞空のコマが出ている時間に放物線(sin)で乗せる=踏み切りは速く・頂点で減速・落ちて加速(慣性)。
    const spans = attackFrameSpans(frames, impact, SUMMON_ATTACK_WINDUP_MS, SUMMON_ATTACK_SWING_MS,
      SUMMON_ATTACK_FOLLOW_MS, SUMMON_ATTACK_STILL_MS);
    let a = -1, b = -1, prev = 0;
    for (const s of spans) {
      if (s.frame === sheet.airFrom && a < 0) a = prev;
      if (s.frame === sheet.airTo - 1) b = s.untilMs;
      prev = s.untilMs;
    }
    if (a >= 0 && b > a && t >= a && t < b) lift01 = Math.sin(Math.PI * ((t - a) / (b - a)));
  }
  return { frame: f, lift01 };
};

/**
 * 手描きの攻撃コマを持たない型(自転車)の踏み込み: 敵の接触攻撃と同じ「しゃがみ→食いつき」の位置の動き
 * (`contactLungePose`)の経過 0..1。**食いつきの山=命中の瞬間**になるよう前へずらす。null=出さない。
 * @param lungeMs 踏み込みの全長 / @param peakFrac その中で山が来る位置(0..1)
 */
export const summonLungeT = (
  sinceHitMs: number, intervalMs: number, lungeMs: number, peakFrac: number,
): number | null => {
  const lead = lungeMs * peakFrac;
  const { rel } = summonAttackRel(sinceHitMs, intervalMs, lead, lungeMs - lead);
  if (rel === null) return null;
  const t = (rel + lead) / lungeMs;
  return t >= 0 && t < 1 ? t : null;
};

/**
 * レア召喚(ハンター)が棺桶を回してハリケーンを立てている間の体の絵(社長指摘2026-11-20
 * 「ハンターの攻撃時の絵になってない。立ち絵になってる」)。フィールドのハンターの攻撃の絵=跳びのシートの
 * **溜めの区間(棺桶を担ぎ上げる→頭上に構える)**を使う。
 * 返り値=溜めの区間の進み 0..1(1=頭上に構え切った姿で保つ)。出る時は担ぎ上げ、寿命の終わりは同じ速さで下ろす
 * (瞬間に構え/下ろしへ飛ばない=慣性)。
 * @param bornMs 出てからの経過 / @param leftMs 寿命の残り / @param raiseMs 担ぎ上げに使う長さ(フィールドの溜めと同じ)
 */
export const rareSummonRaise01 = (bornMs: number, leftMs: number, raiseMs: number): number => {
  if (!(raiseMs > 0)) return 1;
  return Math.max(0, Math.min(1, bornMs / raiseMs, leftMs / raiseMs));
};
