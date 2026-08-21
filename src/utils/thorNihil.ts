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
}

/**
 * 必中一閃(§1-3)の引き金。**紫の州**の間に**紫円の内側で**近接スイングが確定したフレームだけ true。
 * - カウンター成立の演出(`markMeleeSwingFx`)や武器庫サークル(`counterWindowEnd`)では**立たない**
 *   ——ここが読むのは近接スイング専用の打刻だけだから。
 * - 円の**外側**で振っても立たない(300ms満了後に通常の赤予告へ進む)。
 */
export const shouldTriggerGuaranteedIssen = (i: GuaranteedIssenInput): boolean =>
  i.bossState === THOR_NIHIL_STATE
  && !i.alreadyFired
  && meleeSwingCommitted(i.prevCommitAt, i.curCommitAt)
  && isInsideNihilCircle(i.bcx, i.bcy, i.pcx, i.pcy, i.radius ?? thorNihilRadius());

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
