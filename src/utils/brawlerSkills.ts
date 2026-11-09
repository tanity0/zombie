// ★格闘×スキルの組み合わせ(research/BRAWLER.md §15・社長承認2026-11-09「はい」)。判定は純関数だけ(store が読んで書く)。
// 格闘以外(銃・ナイフ・刀・鞭・分身)の経路は、ここの関数を「格闘ではない」として通る=今までと1つも変わらない(テストで固定)。
import { brawlerEnemyClass, brawlerLiftClass, isBrawlerTechBusy, type BrawlerMoveKey } from './brawlerCombo';
import type { Enemy } from '../types/game';
import type { BrawlerState, BrawlerTechKind } from './brawlerTypes';
import { BRAWLER_TECHS, BRAWLER_JUST_MS, BRAWLER_FLOW_GRACE_MS } from './brawler';

// ---- 1. 処刑系(紫の致命の一撃・気絶中のボス5倍・強個体3倍) ----
/**
 * 気絶中の敵への近接の最終ダメージ。finishPart=5倍(強個体は3倍)の部分・reward=紫の報酬予算(最大HPの25%の残り・紫でなければ0)。
 * 格闘の段・技: 段の倍率 mult は5倍の部分だけに掛け、報酬には rewardMult(=1)を掛ける=どの段で決めても報酬は満額・締めで決めると少し多い。
 * 格闘以外: rewardMult=mult(被弾反撃の×2 も報酬ごと=今までどおり)。
 */
export const stunnedFinishDamage = (
  finishPart: number, reward: number, mult: number, rewardMult: number, scanMult = 1,
): number => (finishPart * mult + Math.max(0, reward) * rewardMult) * scanMult;

// ---- 2. カウンターマスターの吹き飛ばし ----
/** 格闘の締めの当たり(5段目・蹴りの3発目・大踏み潰し・秘奥義の締め)。秘奥義の9連撃の中の技は 'secret' で、締めに数えない。 */
export const BRAWLER_FINISHER_MOVES: readonly BrawlerMoveKey[] = ['s5', 'kick3', 'stomp', 'secret-land'];
/** カウンターマスターの吹き飛ばしを出すか。格闘以外の近接は今どおり毎回・格闘は締めの当たりだけ。 */
export const counterMasterBlowFires = (brawlerStrike: boolean, move: BrawlerMoveKey | undefined): boolean =>
  !brawlerStrike || (move !== undefined && BRAWLER_FINISHER_MOVES.includes(move));

// ---- 3. 当たるたびの回復(吸血Lv3・英雄) ----
export const isBrawlerSecretMove = (move: BrawlerMoveKey | undefined): boolean => move === 'secret' || move === 'secret-land';
/** 当たった時の回復を出すか。秘奥義(9連撃と締め)の中は1回にまとめる=もう回復した秘奥義では出さない。通常の段・技・格闘以外は今どおり毎回。 */
export const brawlerHitHealAllowed = (move: BrawlerMoveKey | undefined, secretHealed: boolean): boolean =>
  !(isBrawlerSecretMove(move) && secretHealed);

// ---- 5. タイムキーパー / オーバークロック(格闘では技ポイントへ読み替え) ----
/**
 * タイムキーパー=技の値段の割引。Lv の数だけ、値段の高い技から順に1ポイント安くする(値段は1未満にしない)。
 *  Lv1: 大踏み潰し 5→4 / Lv2: +構え 3→2 / Lv3: +気功 2→1(飛び蹴りは1のまま)。4つの技の値段の合計 11→10→9→8=約−9%/−18%/−27%
 *  (サブウェポンのクールダウン −10%/−20%/−30% と同じ刻み)。
 */
export const brawlerTimeKeeperDiscount = (kind: BrawlerTechKind, timeKeeperLv: number): number => {
  const lv = Math.max(0, Math.min(3, Math.floor(timeKeeperLv)));
  if (lv <= 0) return 0;
  const order = (Object.keys(BRAWLER_TECHS) as BrawlerTechKind[]).sort((a, b) => BRAWLER_TECHS[b].cost - BRAWLER_TECHS[a].cost);
  const rank = order.indexOf(kind);
  return rank >= 0 && rank < lv && BRAWLER_TECHS[kind].cost > 1 ? 1 : 0;
};
/** オーバークロック=技を出した時、確率で払った技ポイントを全部返す(Lv1 20% / Lv2 25% / Lv3 30%=サブウェポンのクールダウンがすぐ終わる確率と同じ)。 */
export const BRAWLER_OVERCLOCK_REFUND_CHANCE: readonly number[] = [0, 0.2, 0.25, 0.3];
export const brawlerOverclockRefunds = (paid: number, overclockLv: number, rng: () => number = Math.random): boolean => {
  const lv = Math.max(0, Math.min(3, Math.floor(overclockLv)));
  return paid > 0 && lv > 0 && rng() < BRAWLER_OVERCLOCK_REFUND_CHANCE[lv];
};

// ---- 8. 強化「カウンター受付」 ----
/** ジャスト構えの窓(ms)。強化のカウンター受付はほかの経路(カウンター窓 COUNTER_ACCEPT_MS + 焼き値)と同じく足し算で延ばす。 */
export const brawlerJustWindowMs = (counterAcceptBonusMs: number): number => BRAWLER_JUST_MS + Math.max(0, counterAcceptBonusMs || 0);

// ---- C. ハンティング(striker-hunting)の溜まりを格闘の範囲へ(research/BRAWLER.md §16) ----
/** 段・技を始める時の印。溜まっていれば連撃の間ずっと立てる(すでに立っていれば保つ)。立たない時は何も足さない。 */
export const brawlerHuntingComboStart = (s: Pick<BrawlerState, 'huntingCombo'>, huntingCharged: boolean): { huntingCombo?: true } =>
  s.huntingCombo || huntingCharged ? { huntingCombo: true } : {};
/** 連撃が途切れたか(待機に戻り、通常攻撃のつながり・蹴りの連続・秘奥義の後の猶予のどれも過ぎた)。当てたかは問わない=空振りでも途切れる。 */
export const brawlerComboEnded = (s: BrawlerState, t: number): boolean => {
  if (s.phase !== 'idle' || s.secret) return false;
  const until = Math.max(s.chainUntil, s.kickChainUntil, (s.secretLastEndAt ?? 0) > 0 ? (s.secretLastEndAt ?? 0) + BRAWLER_FLOW_GRACE_MS : 0);
  return t > until;
};

// ---- D. 移動速度に比例して格闘の攻撃力が上がる(research/BRAWLER.md §16) ----
/** 足の速さの能力値の倍率をそのまま格闘のダメージに掛ける。遅くする効果で下がる場合も 1.0 を下限にして下げない。 */
export const brawlerSpeedDamageMult = (moveStatMult: number): number => (Number.isFinite(moveStatMult) ? Math.max(1, moveStatMult) : 1);

// ---- 秘奥義の間は画面内の敵を止める(社長指示2026-11-09「秘奥義の間は止める」・research/BRAWLER.md §17) ----
/** 止めの書き足しの長さ(ms)。毎フレーム書き直さず、残りが REFRESH_BELOW を切ったら書き足す。秘奥義が終わる・中断すると解く。 */
export const SECRET_FREEZE_HOLD_MS = 250;
export const SECRET_FREEZE_REFRESH_BELOW_MS = 150;
/**
 * 秘奥義の間に止める敵の id(inView=画面内かどうか。ズーム込みの可視域は呼び手が渡す)。
 * 雑魚・強個体は全員 / ボス級は技の最中(溜め含む=isBrawlerTechBusy)でなければ / 終端の死神(浮かない側 brawlerLiftClass=null)は止めない / 画面の外は止めない。
 */
export const secretFreezeIds = (
  enemies: readonly Enemy[], gameTime: number, inView: (e: Enemy) => boolean,
): string[] => {
  const out: string[] = [];
  for (const e of enemies) {
    if (e.health <= 0 || brawlerLiftClass(e) === null || !inView(e)) continue;
    if (brawlerEnemyClass(e) === 'boss' && isBrawlerTechBusy(e, gameTime)) continue;
    out.push(e.id);
  }
  return out;
};
