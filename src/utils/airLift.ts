// ★格闘以外からも使える「浮き」(research/BRAWLER.md §14・社長「浮き入れよう。落ちてくるのを爆発のは少しゆっくりに」)。
// 浮きの中身(浮いている間は動けない・重さの区分・拾える回数の予算・空中の合図の絵)は格闘(§12〜§13・utils/brawlerCombo)と同じものを使う。
// ここは格闘以外の入口(爆発・スラッシャー)が「どれだけ浮かせるか」を決める純関数だけを置く(store にも描画にも依存しない)。
import {
  brawlerAirborne, brawlerJuggleHeightRel, isBrawlerTechBusy, brawlerComboEndNoHoldNow, brawlerFallK, brawlerFallStretchMs,
  BRAWLER_JUGGLE_BUDGET, BRAWLER_JUGGLE_WEIGHT, BRAWLER_JUGGLE_PUSH, BRAWLER_JUGGLE_MIN_F, BRAWLER_JUGGLE_MIN_MS,
  type BrawlerJuggleFields, type BrawlerMoveKey,
} from './brawlerCombo';
import { BRAWLER_LIFT_MS, BLAST_LIFT_SHAPE } from './brawler';

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
 *  - 高さ = 3段目の打ち上げ×0.6×重さ×近さ。下限 MIN_F 未満は浮かない。長さは blastLiftMs。弧は爆発の形(上り15%・漂い20%・落ち65%)。
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
  // ★落ちる速さ(社長裁定2026-11-13): 空中で拾い直した爆発の浮きは、格闘と同じく拾った回数ごとに落ちる部分が速くなる。
  // 地上からの爆発の浮きは、弧の形(落ち65%)がもう「少しゆっくり」なので1回目の遅さ(×1.25)は重ねない。
  const n = airborne ? (e.brLiftN ?? 0) + 1 : 0;
  const fk = airborne ? brawlerFallK(n) : 1;
  const ms = brawlerFallStretchMs(blastLiftMs(cls, closeness), fk, BLAST_LIFT_SHAPE);
  const from = airborne ? brawlerJuggleHeightRel(e, now) : 0;
  const airSince = airborne ? (e.brBlastAirSince ?? e.brawlerLiftAt ?? now) : now;
  const end = now + ms;
  return {
    brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: f, brLiftFrom: from, brLiftN: n, brLiftFallK: fk,
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

/**
 * ★赤カウンターの浮き(社長指示2026-11-11「赤カウンター、敵を浮かせる」)。カウンターが成立した敵を、格闘の4段目(小ジャンプの叩き潰し)と
 * 同じ打ち上げで浮かせる(高さ・重さの区分・拾える回数の予算・ボス級の止めの減衰は格闘の浮きと同じ1本=store の brawlerJugglePatch)。
 * 武器は問わない(ナイフ・刀・格闘の構え・突進や跳びのパリィ・守護霊のカウンター)。弾の打ち返しは敵に触れていないので対象外。
 * 浮かない相手: 倒した敵・終端の死神(区分で浮かない)・技の最中のまま残っているボス級(技を取り消さない決まり=格闘と同じ)。
 */
export const COUNTER_LIFT_MOVE: BrawlerMoveKey = 's4';
export const counterLiftApplies = (
  e: Parameters<typeof isBrawlerTechBusy>[0], newHealth: number, gameTime: number,
): boolean => newHealth > 0 && !isBrawlerTechBusy(e, gameTime);

/**
 * ★ナイフの当たりの固まりと浮き(社長指示2026-11-12「あと近接でも敵の攻撃が止まる&浮くようにして」)。
 * 中身は格闘と同じもの(固まり=brawlerLockOnHit・浮き=store の brawlerJugglePatch=区分の重さ・予算・ボスの止めの減衰)。
 *  - 固まり=格闘の1段目と同じ長さ(止め=ナイフの今の止めの長さ+1段目の固まり)。溜め(予告中)は時計ごと止めて続きから(格闘と同じ道)。
 *  - 浮き=地上は3段目の打ち上げ・空中は2段目の拾い(スラッシャーの追撃と同じ割り当て)。
 *  - 社長裁定(同日「近接は止めるだけ」): 技の最中(溜めを含む)の敵は浮かせない・技は取り消さない。
 */
export const KNIFE_HOLD_MOVE: BrawlerMoveKey = 's1';
export const knifeLiftMove = (airborne: boolean): BrawlerMoveKey => (airborne ? 's2' : 's3');
/**
 * ナイフの当たりで浮かせてよいか。呼び手は区分(終端の死神は brawlerJugglePatch が null)とレバーガードを別に見る。
 *  - 技の最中(溜め・攻撃の振り)は浮かせない(isBrawlerTechBusy=格闘・カウンターの浮きと同じ述語)。
 *  - コンボの後の固まらない時間の間は地上から浮かせない(格闘と同じ・空中の拾いは今どおり)。
 *  - ★止めっぱなしにしない: 着地の後、浮いていた時間と同じ長さは地上から浮かない(爆発の浮きと同じ窓 brBlastNoLiftUntil を共有)。
 *  - この振りで既にカウンターの浮きが掛かった敵(lastCounteredAt が振りの押下以降)は浮かせ直さない=予算を2回使わない。
 * swingAt=この振りを押した時刻(Date.now)。
 * slasher=スラッシャーを持っている振り(社長指示2026-11-12「スラッシャーは1撃目から浮かせてほしい。空中コンボできるように」):
 *   振りの1撃目は毎回浮かせる=止めっぱなしにしない窓(brBlastNoLiftUntil)を見ない(追撃が空中を拾えるように)。ほかの条件は同じ。
 */
export const knifeLiftApplies = (
  e: Parameters<typeof isBrawlerTechBusy>[0] & BrawlerJuggleFields & { lastCounteredAt?: number; brLockNoHoldUntil?: number },
  now: number, gameTime: number, swingAt: number, slasher = false,
): boolean => {
  if (isBrawlerTechBusy(e, gameTime)) return false;
  if (e.lastCounteredAt !== undefined && e.lastCounteredAt >= swingAt) return false;
  if (brawlerAirborne(e, now)) return true;
  if (brawlerComboEndNoHoldNow(e, gameTime)) return false;
  if (slasher) return true;
  return now >= (e.brBlastNoLiftUntil ?? 0);
};
/**
 * ナイフで浮かせた後の「地上から浮かない窓」の終わり(爆発と同じ式: 浮きの終わり+空中が始まってからの長さ)。
 * prev=当たる前の敵・liftUntil=この当たりで書いた浮きの終わり。
 */
export const knifeNoLiftUntil = (prev: BrawlerJuggleFields, liftUntil: number, now: number): number => {
  const airSince = brawlerAirborne(prev, now) ? (prev.brBlastAirSince ?? prev.brawlerLiftAt ?? now) : now;
  return Math.max(prev.brBlastNoLiftUntil ?? 0, liftUntil + (liftUntil - airSince));
};
