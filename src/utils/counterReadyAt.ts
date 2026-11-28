// カウンターが次に使える時刻(近接を振った後の薄い灰色の輪=カウンターのクールダウン中の印が、いつまで出るか)。
// 鞭・ナイフの3連撃では counterCooldownEnd は「段の間隔」だけを持ち、カウンターの本当の待ちは
// whipCounterReadyAt / knifeCounterReadyAt(連撃の終わり+クールダウン・連撃が続く間は振るたびに後ろへずれる)にある
// (utils/whipCombo の whipComboCounterPlan・utils/knifeCombo の knifeComboCounterPlan)。表示だけの純関数(規則は変えない)。
import type { Player } from '../types/game';

/** 近接の型: whip=鞭の3連撃 / knife=ナイフの3連撃 / other=それ以外(格闘など・今まで通り counterCooldownEnd)。 */
export type CounterRingMode = 'whip' | 'knife' | 'other';

/** カウンターが次に使える時刻(同じ時計)。 */
export const counterReadyAt = (
  player: Pick<Player, 'counterCooldownEnd' | 'whipCounterReadyAt' | 'knifeCounterReadyAt'>,
  mode: CounterRingMode,
): number => {
  const cd = player.counterCooldownEnd;
  if (mode === 'whip') return Math.max(cd, player.whipCounterReadyAt ?? 0);
  if (mode === 'knife') return Math.max(cd, player.knifeCounterReadyAt ?? 0);
  return cd;
};

/** 輪が消える前の短いフェード(ms)。readyAt で消え切る(使えるのに輪が残る、は起こさない)。 */
export const COUNTER_RING_FADE_MS = 150;
/** 輪の濃さの倍率(0=出さない・1=いつもの濃さ)。終わりの FADE_MS で加減速つき(smoothstep)に 0 へ。 */
export const counterRingFade = (readyAt: number, now: number, fadeMs = COUNTER_RING_FADE_MS): number => {
  const left = readyAt - now;
  if (!(left > 0)) return 0;
  if (left >= fadeMs) return 1;
  const u = left / fadeMs;
  return u * u * (3 - 2 * u);
};
