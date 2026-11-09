// ★格闘以外からも使える「浮き」(research/BRAWLER.md §14・社長「浮き入れよう。落ちてくるのを爆発のは少しゆっくりに」)。
// 浮きの中身(浮いている間は動けない・重さの区分・拾える回数の予算・空中の合図の絵)は格闘(§12〜§13・utils/brawlerCombo)と同じものを使う。
// ここは格闘以外の入口(爆発・スラッシャー)が「どれだけ浮かせるか」を決める純関数だけを置く(store にも描画にも依存しない)。
import {
  brawlerAirborne, brawlerJuggleHeightRel, isBrawlerTechBusy,
  BRAWLER_JUGGLE_BUDGET, BRAWLER_JUGGLE_WEIGHT, BRAWLER_JUGGLE_PUSH, BRAWLER_JUGGLE_MIN_F, BRAWLER_JUGGLE_MIN_MS,
  type BrawlerJuggleFields, type BrawlerMoveKey,
} from './brawlerCombo';
import { BRAWLER_LIFT_MS } from './brawler';

export type AirLiftClass = 'mob' | 'strong' | 'boss';

/** 爆心での高さ = 格闘の3段目の打ち上げ × これ(重さの前)。 */
export const BLAST_LIFT_HEIGHT_OF_S3 = 0.6;
/** 爆心での浮きの長さ = 格闘の浮きの基準(BRAWLER_LIFT_MS・テンポ係数込み)× これ × 重さ。大きめに作って実機で絞る前提。 */
export const BLAST_LIFT_MS_MULT = 1.3;
/** 爆発の浮きが使う拾える回数の予算(格闘と共有の予算から)。 */
export const BLAST_LIFT_COST = 2;

/** 爆心からの近さ(1=爆心・0=爆風の縁)。dist=爆発のダメージと同じ物差し(爆心から敵の点=blastAnchorOf まで)。 */
export const blastLiftCloseness = (dist: number, radius: number): number =>
  radius > 0 ? Math.max(0, Math.min(1, 1 - Math.max(0, dist) / radius)) : 0;

/** 爆発の浮きの高さ(重さ×近さ・格闘の浮きの高さの倍率)。 */
export const blastLiftPeak = (cls: AirLiftClass, closeness: number): number =>
  BRAWLER_JUGGLE_PUSH.s3 * BLAST_LIFT_HEIGHT_OF_S3 * BRAWLER_JUGGLE_WEIGHT[cls] * Math.max(0, Math.min(1, closeness));

/**
 * 爆発の浮きの長さ(ms)。爆心で 基準×1.3×重さ(格闘と同じく重い敵ほど短い)。爆風の縁=高さが下限(MIN_F)に近いほど0へ寄せる
 * (高さ−下限 に比例。ほとんど浮かないのに長く止まらない)。短すぎる跳ねの下限は格闘と同じ。
 */
export const blastLiftMs = (cls: AirLiftClass, closeness: number): number => {
  const w = BRAWLER_JUGGLE_WEIGHT[cls];
  const fMax = blastLiftPeak(cls, 1), f = blastLiftPeak(cls, closeness);
  const edge = fMax > BRAWLER_JUGGLE_MIN_F ? Math.max(0, Math.min(1, (f - BRAWLER_JUGGLE_MIN_F) / (fMax - BRAWLER_JUGGLE_MIN_F))) : 0;
  return Math.max(BRAWLER_JUGGLE_MIN_MS, Math.round(BRAWLER_LIFT_MS * BLAST_LIFT_MS_MULT * w * edge));
};

/**
 * 爆発の浮き(§14)。null=浮かない(今のノックバックだけ)。closeness=近さ(0..1・その爆発のダメージと同じ物差し)。
 *  - ボス級・浮かない区分(終端の死神=呼び手が brawlerLiftClass で null)は浮かない。技を出している最中の敵も浮かない(格闘と同じ)。
 *  - 高さ = 3段目の打ち上げ×0.6×重さ×近さ。下限 MIN_F 未満は浮かない。長さは blastLiftMs。弧は爆発の形(上り20%・漂い15%・落ち65%)。
 *  - 予算は格闘と共有で2を使う。地上からは区分の予算−2・空中からは残りから2(足りなければ浮かない)。叩き落とし中は浮かない。跳ね返らない。
 *  - ★止めっぱなしにしない: 爆発の浮きで着地した敵は、浮いていた時間(空中が始まってから着地まで)と同じ長さだけ、爆発では浮かない。
 */
export const blastLiftPatch = (
  e: BrawlerJuggleFields & Parameters<typeof isBrawlerTechBusy>[0],
  cls: AirLiftClass | null, closeness: number, now: number, gameTime: number,
): (Partial<BrawlerJuggleFields> & { liftUntil: number }) | null => {
  if (cls === null || cls === 'boss') return null;
  if (isBrawlerTechBusy(e, gameTime)) return null;
  const f = blastLiftPeak(cls, closeness);
  if (f < BRAWLER_JUGGLE_MIN_F) return null;
  const airborne = brawlerAirborne(e, now);
  if (airborne && e.brLiftDown) return null;
  if (!airborne && now < (e.brBlastNoLiftUntil ?? 0)) return null;
  const budget = (airborne ? (e.brLiftBudget ?? BRAWLER_JUGGLE_BUDGET[cls]) : BRAWLER_JUGGLE_BUDGET[cls]) - BLAST_LIFT_COST;
  if (budget < 0) return null;
  const ms = blastLiftMs(cls, closeness);
  const from = airborne ? brawlerJuggleHeightRel(e, now) : 0;
  const airSince = airborne ? (e.brBlastAirSince ?? e.brawlerLiftAt ?? now) : now;
  const end = now + ms;
  return {
    brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: f, brLiftFrom: from, brLiftN: airborne ? (e.brLiftN ?? 0) + 1 : 0,
    brLiftUntil: end, liftUntil: end, brLiftLand: true,
    brLiftBudget: budget, brLiftDown: false, brLiftDropMs: 0, brLiftShape: 'blast',
    brBlastAirSince: airSince, brBlastNoLiftUntil: end + (end - airSince),
  };
};

/**
 * スラッシャーの追撃の当たりを、格闘のどの段として浮きに通すか(§14・格闘の浮き brawlerJugglePush へ渡す)。null=浮きに触れない。
 *  - 1回目の追撃(step 0)= 3段目(アッパー)=地上から打ち上げる/空中なら押し上げ直す。
 *  - 2回目以降: 空中の敵にだけ当たりとして数える= 2段目(小さく拾う)。Lv3 の最後の大きな押し(finalBig)は 5段目(空中から叩き落とす)。
 */
export const slasherLiftMove = (step: number, finalBig: boolean, airborne: boolean): BrawlerMoveKey | null => {
  if (step <= 0) return 's3';
  if (!airborne) return null;
  return finalBig ? 's5' : 's2';
};

/** ★スラッシャーの1回目の打ち上げの長さの下限の余裕(ms)。 */
export const SLASHER_LIFT_MARGIN_MS = 150;
/**
 * スラッシャーの1回目の打ち上げの長さの下限(§14)= 追撃の窓(チェーンの CD + 前隙 + 余裕)。
 * 強個体・ボス級(重さ・ボスの止めの減衰で短くなる)でも、2回目の追撃が空中に間に合う。
 */
export const slasherLaunchMinMs = (chainCdMs: number, windupMs: number): number => chainCdMs + windupMs + SLASHER_LIFT_MARGIN_MS;
