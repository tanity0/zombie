// research/TELEGRAPH_FIXES.md §3「予告と判定の寸法の食い違い」(E11・E12・§6-3 2・E05b):
// 予告(赤い帯・紫の円)を**描く**側が読む寸法の出どころを1か所に並べる。
// 判定(angelBossTick / useGameLoop)が読む表の欄と**同じ欄**を返すこと。描く側が別の表
// (例: ウリの振り下ろしの予告がトールの突き HB_TH.tsuki を読んでいた=幅15で描いて40で当たる)を
// 読む事故を、構造で起こらなくするための台帳。テストは telegraphDrawSources.test.ts。
// ボスメーカーで表の値を動かした時も、描く側がそのまま追従するよう**関数で**引く(値を焼かない)。
import {
  ANGEL_RAFI_TUNING as RF_T, ANGEL_URI_TUNING as UR_T, ANGEL_SURIEL_TUNING as SR_T,
  ANGEL_JIBRIL_TUNING as JB_T,
} from './angelScript';
import { HIDDEN_JORMUNGAND_TUNING as HB_JO } from './hiddenBossScript';

export const TELEGRAPH_DRAW_SOURCES = {
  /** E11 ウリの振り下ろし(溜めの帯・実行の斬撃・完了ラッチの剣の振り)= 判定 aBT の UR_T.downslash.halfWidth。 */
  uriDownslashHalfWidth: (): number => UR_T.downslash.halfWidth,
  /** E12 ウリの踏み込み突き(斬撃・完了ラッチの剣の振り・斬り抜けの帯)= 判定 UR_T.thrust.halfWidth。 */
  uriThrustHalfWidth: (): number => UR_T.thrust.halfWidth,
  /** E10 ウリの大薙ぎ = 判定 UR_T.sweep.halfWidth。 */
  uriSweepHalfWidth: (): number => UR_T.sweep.halfWidth,
  /** E09 ラフィの薙ぎ = 判定 RF_T.sweep.halfWidth。 */
  rafiSweepHalfWidth: (): number => RF_T.sweep.halfWidth,
  /** E15 スリィエルの薙ぎ = 判定 SR_T.sweep.halfWidth。 */
  surielSweepHalfWidth: (): number => SR_T.sweep.halfWidth,
  /** C05 ヨルムンガンドのうねり = 判定 HB_JO.coil.halfWidth。 */
  jormCoilHalfWidth: (): number => HB_JO.coil.halfWidth,
  /** E05/E05b ジブリルのランタン火の円 = 判定 JB_T.fire.radius。 */
  jibrilFireRadius: (): number => JB_T.fire.radius,
} as const;
