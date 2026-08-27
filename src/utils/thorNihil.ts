// トール「無の境地(紫の円)」と必中一閃の**判定だけ**を持つ純関数(research/THOR_ISSEN_REWORK.md §1)。
//
// なぜ切り出すか(CLAUDE.md 実装精度の規律4): 判定を useGameLoop/gameStore に直書きすると
// ユニットテストから読めない=「配線側の誤りだけがすり抜ける」という、このプロジェクトで
// 繰り返してきた事故の型になる。ここはレンダラ非依存・store非依存の葉(import してよいのは
// 型とチューニング表だけ)。
//
// ★時計の契約(v0.25.3721と同型の事故の再発防止):
//   - `meleeSwingCommitAt` は **`Date.now()` 系**(エポックms)。
//   - ボスの州の残り時間(`bossStateUntil`)は **gameTime 系**(ラン開始からのms)。
//   この2つを**同じ式で引き算してはいけない**。だから引き金は「前フレームの打刻から**進んだか**」の
//   エッジだけを見る(絶対時刻の比較をしない)。
import type { Enemy, Player } from '../types/game';
import { HIDDEN_THOR_TUNING } from './hiddenBossScript';
import type { BotSkillProfile } from './botSkill';

/** 段1「無の境地」の州名。**接尾辞 '-windup' を付けない**(理由は types/game.ts のコメント)。 */
export const THOR_NIHIL_STATE = 'issen-nihil';

/**
 * 紫円の半径。**絵・必中の引き金・ボットの「振らない」範囲の3つがこの1関数から引く**
 * (ボスメーカーで動かすと3つとも同時に動く=複製しない)。
 */
export const thorNihilRadius = (): number => HIDDEN_THOR_TUNING.issen.nihilRadius;

/**
 * 近接スイング確定の打刻を **1箇所だけで**作る純関数。gameStore の `commitMeleeSwing()` から呼ぶ。
 * (「打刻を書く関数を1本にまとめる」= §1-3の規則。呼び出し口の件数はテストが固定する)
 */
export const stampMeleeSwingCommit = <T extends { meleeSwingCommitAt: number }>(p: T, now: number): T =>
  ({ ...p, meleeSwingCommitAt: now });

/** プレイヤー中心が紫円の内側か(**自機半径は足さない**=社長指定「プレイヤーの中心が円の内側」)。 */
export const isInsideNihilCircle = (
  bcx: number, bcy: number, pcx: number, pcy: number, radius: number,
): boolean => Math.hypot(pcx - bcx, pcy - bcy) <= radius;

/** 「このフレームで近接スイングが確定した」= 打刻が前フレームから進んだ(絶対時刻を比較しない)。 */
export const meleeSwingCommitted = (prevCommitAt: number, curCommitAt: number): boolean =>
  curCommitAt > 0 && curCommitAt > prevCommitAt;

/** 「本人の近接が当たった」引き金の受付幅(ms・gameTime系)。打刻フレームと判定フレームの
 * ズレ(0〜1フレーム)を吸収するだけの短い窓=後出しの延命窓ではない。 */
export const NIHIL_MELEE_HIT_ACCEPT_MS = 100;
/** ヒット(meleeHitAt)を「本人の振り」に紐づける上限(ms・Date.now系どうしの比較)。
 * 刀の一閃はスイング確定(triggerKatanaDash)から着弾まで最大~360ms(移動180+判定遅延)なので余裕を
 * 持って700ms。守護霊の刀ヒット(meleeHitAtが守護霊経由でも打たれる既存実装)だけでは発動させない
 * ためのゲート=「本人が直近で振っていて、その帰結として当たった」時だけBを認める。 */
export const NIHIL_MELEE_HIT_SWING_LINK_MS = 700;

export interface GuaranteedIssenInput {
  /** 今のボスの州(`Enemy.bossState`)。 */
  bossState: string | undefined;
  /** ボスの当たり判定矩形の中心。 */
  bcx: number; bcy: number;
  /** プレイヤーの中心。 */
  pcx: number; pcy: number;
  /** 前フレームに観測した `player.meleeSwingCommitAt`。 */
  prevCommitAt: number;
  /** 今フレームの `player.meleeSwingCommitAt`。 */
  curCommitAt: number;
  /** この無の境地で既に1回発動済みか(2重発火の防止)。 */
  alreadyFired: boolean;
  /** 紫円の半径(既定=台帳)。 */
  radius?: number;
  /** ★v0.25.3991: 近接がこのボスに**当たった**打刻(`Enemy.meleeHitAt`=既存の§5.21-追補8スタンプ・gameTime系)。 */
  meleeHitAt?: number;
  /** 今フレームのgameTime(meleeHitAtと同じ時計。Date.now系のcommitAtとは混ぜない)。 */
  nowGameTime?: number;
  /** 今フレームのDate.now(curCommitAtと同じ時計。「本人が直近で振ったか」のリンク判定に使う)。 */
  nowMs?: number;
}

/**
 * 必中一閃(§1-3)の引き金。**紫の州**の間に、次の**どちらか**が起きたフレームだけ true:
 *  A) **紫円の内側で**近接スイングが確定した(従来=空振りでも円内なら発動)。
 *  B) ★v0.25.3991(社長報告「無の境地に、近接当てても一閃即発動してこない」): **本人の近接が
 *     トールに当たった**(距離を問わない)。従来はAだけで、リーチの長い近接(刀の一閃154px+/鞭/
 *     オート斬撃)は**当てた瞬間の自機中心が円200pxの外**にあり、当てても発動しなかった。
 * - カウンター成立の演出(`markMeleeSwingFx`)や武器庫サークル(`counterWindowEnd`)では**立たない**。
 * - 円の**外側**での空振りは従来どおり立たない(満了後に通常の赤予告へ進む)。
 */
export const shouldTriggerGuaranteedIssen = (i: GuaranteedIssenInput): boolean =>
  i.bossState === THOR_NIHIL_STATE
  && !i.alreadyFired
  && (
    (meleeSwingCommitted(i.prevCommitAt, i.curCommitAt)
      && isInsideNihilCircle(i.bcx, i.bcy, i.pcx, i.pcy, i.radius ?? thorNihilRadius()))
    || (i.meleeHitAt !== undefined && i.nowGameTime !== undefined
      && i.nowGameTime - i.meleeHitAt <= NIHIL_MELEE_HIT_ACCEPT_MS
      // 「本人が直近で振っている」リンク(Date.now系どうし): 守護霊/分身のヒット打刻だけでは発動しない。
      && i.nowMs !== undefined && i.curCommitAt > 0
      && i.nowMs - i.curCommitAt <= NIHIL_MELEE_HIT_SWING_LINK_MS)
  );

/**
 * 必中一閃が「カウンターされない」か(§1-3・§5-2やること②)。
 * `issen-dash` の被弾解決は帯に触れた時点で `counterWindowEnd` を見る経路を持つので、
 * **立っている間だけその分岐をスキップ**して damagePlayer へ直行する。
 *
 * ★v0.25.3784(検収監査 重大3): **時刻を比較しない**。旧実装は
 * `gameTime < issenGuaranteedUntil` の排他だったが、フラグの値(`newGameTime + dashMs`)が
 * `bossStateUntil` と**同値**なので、**州の最終フレーム**——つまり帯判定がまだ走る最後の1フレーム——
 * だけ false に落ちていた。`COUNTER_WINDOW`(400ms) > `dashMs`(280ms) なので引き金の振りが開けた窓は
 * まだ開いており、**必中で被弾したうえに Counter! も出る**という off-by-one になっていた。
 * よって判定は**フラグが立っているかどうかだけ**。落とすのは `issen-dash` を抜ける所(全経路)。
 * 境界を +1ms でごまかさない。
 */
export const isGuaranteedIssenNow = (
  issenGuaranteedUntil: number | undefined,
): boolean => issenGuaranteedUntil !== undefined && issenGuaranteedUntil > 0;

// -------------------------------------------------------------------------------------------------
// ボット(§8-4・社長裁定「マスターとスキルドは覚える」)
// -------------------------------------------------------------------------------------------------
/**
 * 「今は近接を振らない」= `master`/`skilled` が紫円の内側に居る間だけ true。
 * **止める対象は近接を振ることだけ**で、紫の円は回避脅威に足さない(立っているだけなら安全)。
 * 半径は `thorNihilRadius()` を読む=ボット側に複製しない(ボスメーカーで動かせば一緒に動く)。
 */
export const botHoldsMeleeForNihil = (
  profile: Pick<BotSkillProfile, 'respectsNihilCircle'>,
  pcx: number, pcy: number,
  enemies: readonly Pick<Enemy, 'type' | 'bossState' | 'x' | 'y' | 'width' | 'height'>[],
): boolean => {
  if (!profile.respectsNihilCircle) return false;
  const r = thorNihilRadius();
  return enemies.some(e =>
    e.type === 'thor' && e.bossState === THOR_NIHIL_STATE
    && isInsideNihilCircle(e.x + e.width / 2, e.y + e.height / 2, pcx, pcy, r));
};

/** `Player` 全体を渡す呼び出し口(store 側の型を薄く受ける)。 */
export type PlayerSwingCommit = Pick<Player, 'meleeSwingCommitAt'>;
