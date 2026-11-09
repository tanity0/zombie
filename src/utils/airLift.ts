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
/** 爆心での浮きの長さ = 格闘の浮きの基準(BRAWLER_LIFT_MS・テンポ係数込み)× これ。大きめに作って実機で絞る前提。 */
export const BLAST_LIFT_MS_MULT = 1.3;
/** 爆風の縁ほど短く: 長さ = 爆心の長さ × (BASE + (1−BASE)×近さ)。 */
export const BLAST_LIFT_MS_EDGE_BASE = 0.35;
/** 爆発の浮きが使う拾える回数の予算(格闘と共有の予算から)。 */
export const BLAST_LIFT_COST = 2;

/** 爆心からの近さ(1=爆心・0=爆風の縁)。dist=爆心から敵の当たり判定の箱までの距離。 */
export const blastLiftCloseness = (dist: number, radius: number): number =>
  radius > 0 ? Math.max(0, Math.min(1, 1 - Math.max(0, dist) / radius)) : 0;

/**
 * 爆発の浮き(§14)。null=浮かない(今のノックバックだけ)。
 *  - ボス級は浮かない(今の反応のまま)。技を出している最中の敵も浮かない(格闘の浮きと同じ区分の扱い)。
 *  - 高さ = 3段目の打ち上げ×0.6×重さ×近さ。縁ではほぼ浮かない(格闘の浮きの下限 MIN_F 未満は浮かない)。
 *  - 長さ = 格闘の浮きの基準×1.3×(0.35+0.65×近さ)。弧は爆発の形(上り20%・漂い15%・落ち65%)。
 *  - 予算は格闘と共有で2を使う。地上からは区分の予算−2で始まり、空中からは残りから2(足りなければ浮かない)。叩き落とし中は浮かない。
 *  - 地面で跳ね返らない(バウンドは格闘の大踏み潰しだけ)。
 */
export const blastLiftPatch = (
  e: BrawlerJuggleFields & Parameters<typeof isBrawlerTechBusy>[0],
  cls: AirLiftClass, dist: number, radius: number, now: number, gameTime: number,
): (Partial<BrawlerJuggleFields> & { liftUntil: number }) | null => {
  if (cls === 'boss') return null;
  if (isBrawlerTechBusy(e, gameTime)) return null;
  const k = blastLiftCloseness(dist, radius);
  const w = BRAWLER_JUGGLE_WEIGHT[cls];
  const f = BRAWLER_JUGGLE_PUSH.s3 * BLAST_LIFT_HEIGHT_OF_S3 * w * k;
  if (f < BRAWLER_JUGGLE_MIN_F) return null;
  const airborne = brawlerAirborne(e, now);
  if (airborne && e.brLiftDown) return null;
  const budget = (airborne ? (e.brLiftBudget ?? BRAWLER_JUGGLE_BUDGET[cls]) : BRAWLER_JUGGLE_BUDGET[cls]) - BLAST_LIFT_COST;
  if (budget < 0) return null;
  const ms = Math.max(BRAWLER_JUGGLE_MIN_MS, Math.round(BRAWLER_LIFT_MS * BLAST_LIFT_MS_MULT * (BLAST_LIFT_MS_EDGE_BASE + (1 - BLAST_LIFT_MS_EDGE_BASE) * k)));
  const from = airborne ? brawlerJuggleHeightRel(e, now) : 0;
  return {
    brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: f, brLiftFrom: from, brLiftN: airborne ? (e.brLiftN ?? 0) + 1 : 0,
    brLiftUntil: now + ms, liftUntil: now + ms, brLiftLand: true,
    brLiftBudget: budget, brLiftDown: false, brLiftDropMs: 0, brLiftShape: 'blast',
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
