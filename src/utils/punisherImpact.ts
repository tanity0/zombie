// パニッシャー(ノックバック中の敵が別の敵にぶつかって巻き込む)の衝突の瞬間の「止め」と「小さな浮き」。
// 社長指示2026-11-20「パニッシャー発動時(敵が敵にぶつかったとき)敵ストップ&小浮き効果入れて」。
//
// ★ダメージ・飛ぶ勢い・連鎖の数は1つも変えない。足すのは「その場で一瞬止まる」と「小さく浮く」だけ。
//  - 止め: ぶつかった側(飛んで来た敵)は PUNISHER_STOP_MS 止まる(押しの残りは止めの後へずらす=飛ぶ距離は同じ)。
//    ぶつけられた側は、もともとある「ダン!…ダン!」の一拍目(PUNISHER_TWO_BEAT_MS=その場で固まる)がそのまま止め=二重にしない。
//  - 浮き: 止めが明けた瞬間から、格闘の4段目の打ち上げの4割の高さで浮く(格闘・爆発と同じ浮きの仕組み=浮いている間は動けない・
//    拾える回数の予算も共有)。重さで低く短くなる。**ボス級は浮かない**(爆発の浮きと同じ扱い)。
// 純関数だけ(store が呼ぶ)。数値はどれも叩き台。
import {
  brawlerAirborne, isBrawlerTechBusy,
  BRAWLER_JUGGLE_BUDGET, BRAWLER_JUGGLE_WEIGHT, BRAWLER_JUGGLE_PUSH, BRAWLER_JUGGLE_MIN_F, BRAWLER_JUGGLE_MIN_MS,
  type BrawlerJuggleFields,
} from './brawlerCombo';
import { BRAWLER_LIFT_MS } from './brawler';
import type { AirLiftClass } from './airLift';

/** ぶつかった側(飛んで来た敵)の止め(ms・叩き台)。 */
export const PUNISHER_STOP_MS = 120;
/** 浮きの高さ = 格闘の4段目の打ち上げ × これ × 重さ(叩き台)。 */
export const PUNISHER_LIFT_HEIGHT_OF_S4 = 0.4;
/** 拾える回数の予算(格闘・爆発と共有)から使う量。 */
export const PUNISHER_LIFT_COST = 1;

/** 浮きの高さ(格闘の浮きの高さの倍率)。ボス級は0。 */
export const punisherLiftPeak = (cls: AirLiftClass): number =>
  cls === 'boss' ? 0 : BRAWLER_JUGGLE_PUSH.s4 * PUNISHER_LIFT_HEIGHT_OF_S4 * BRAWLER_JUGGLE_WEIGHT[cls];

/** 浮きの長さ(ms)。4段目の浮きの長さ×高さの比×重さ。短すぎる跳ねは格闘と同じ下限。 */
export const punisherLiftMs = (cls: AirLiftClass): number =>
  Math.max(BRAWLER_JUGGLE_MIN_MS, Math.round(BRAWLER_LIFT_MS * PUNISHER_LIFT_HEIGHT_OF_S4 * BRAWLER_JUGGLE_WEIGHT[cls]));

/**
 * 浮きの欄。null=浮かない(ボス級・浮かない区分・技の最中・もう浮いている・予算切れ・高さが下限未満)。
 * startAt=浮き始める時刻(止めが明ける時刻)。それまでは地面の高さのまま(brLiftFrom=0)で、動けない(liftUntil)。
 */
export const punisherLiftPatch = (
  e: BrawlerJuggleFields & Parameters<typeof isBrawlerTechBusy>[0],
  cls: AirLiftClass | null, startAt: number, now: number, gameTime: number,
): (Partial<BrawlerJuggleFields> & { liftUntil: number }) | null => {
  if (cls === null || cls === 'boss') return null;
  if (isBrawlerTechBusy(e, gameTime)) return null;
  if (brawlerAirborne(e, now)) return null; // もう浮いている敵は今の浮きのまま(高さを奪い直さない)
  const f = punisherLiftPeak(cls);
  if (f < BRAWLER_JUGGLE_MIN_F) return null;
  const budget = BRAWLER_JUGGLE_BUDGET[cls] - PUNISHER_LIFT_COST;
  if (budget < 0) return null;
  const ms = punisherLiftMs(cls);
  const end = startAt + ms;
  return {
    brawlerLiftAt: startAt, brLiftMs: ms, brLiftPeak: f, brLiftFrom: 0, brLiftN: 0, brLiftFallK: 1,
    brLiftUntil: end, liftUntil: end, brLiftLand: true,
    brLiftBudget: budget, brLiftDown: false, brLiftDropMs: 0, brLiftShape: 'blast',
  };
};

/** ぶつかった側(飛んで来た敵)の止め: その場で止まり、押しの残りは止めの後へずらす(飛ぶ距離は変えない)。 */
export const punisherFlyerStopPatch = (
  e: { knockbackUntil?: number; knockbackStopFor?: number; hitStunUntil?: number },
  now: number,
): { hitStunUntil: number; knockbackUntil?: number; knockbackStopFor?: number } | null => {
  if (e.hitStunUntil !== undefined && e.hitStunUntil > now) return null; // もう止まっている=重ねない
  const stopEnd = now + PUNISHER_STOP_MS;
  if (e.knockbackUntil === undefined || e.knockbackUntil <= now) return { hitStunUntil: stopEnd };
  const kbUntil = e.knockbackUntil + PUNISHER_STOP_MS;
  // 「止めの長さを覚えている押し」(knockbackStopFor===knockbackUntil)の印も一緒にずらす=止めの後の速さの補正が外れない。
  return e.knockbackStopFor === e.knockbackUntil
    ? { hitStunUntil: stopEnd, knockbackUntil: kbUntil, knockbackStopFor: kbUntil }
    : { hitStunUntil: stopEnd, knockbackUntil: kbUntil };
};
