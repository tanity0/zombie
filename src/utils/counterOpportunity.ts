// ★守護霊の記録(playerTraits の counterChance=機会/成立)の「機会」判定(計測専用・挙動不変)。
// v0.25.5043(社長質問「カウンターできる全てを記録で合ってる? 他のボス技も大丈夫か確認した?」):
// 旧は語尾(-windup/-recover)の概算1本で、**実際にカウンターが通る州**と食い違っていた
// (裏ボスの走り'thor-dash-move'/'dash'・idolの休符・ラフィの薙ぎ'sweep'・アクラシエルの'warp-in'・
// ジブリールの'lantern'/'volley'/'warp-out'は機会に数えず、紫(狙撃・車輪の溜め等)は数えていた)。
// ここでは**カウンター成立域の宣言表(counterReach.COUNTER_REACH_DECL)**を正とする:
// 表に載っていて 'none'(紫)でない州=カウンターが通る州。表を持つ系統(裏ボス4体/idol/賞金首)は表だけで決め、
// 州名が6体で衝突する天使と城ボス・フィルは語尾の概算+角のリストで補う(angelBossTick の注記と同じ差分)。
import type { Enemy, EnemyType } from '../types/game';
import { COUNTER_REACH_DECL } from './counterReachDecl'; // 葉(寸法表へ繋がる counterReach.ts は読まない=循環回避)
import { isBossCounterableNowApprox } from './bossScript';

/** 宣言表を持つ系統(表の接頭辞)。ここに無い型は語尾の概算へ落ちる。 */
const DECL_FAMILY: Partial<Record<EnemyType, 'hidden' | 'idol' | 'bounty'>> = {
  mimir: 'hidden', jormungand: 'hidden', skadi: 'hidden', thor: 'hidden',
  idol: 'idol',
  'bounty-ranged': 'bounty', 'bounty-melee': 'bounty', 'bounty-balance': 'bounty', 'bounty-maiko': 'bounty',
};

/** 天使: 語尾に載らないがプレイヤーがカウンターできる州(宣言表の 'rafi:'/'acrasiel:' と angelBossTick の注記)。 */
const ANGEL_EXTRA_STATES: Partial<Record<EnemyType, readonly string[]>> = {
  rafi: ['sweep'],
  acrasiel: ['warp-in'],
  jibril: ['lantern', 'volley', 'warp-out'],
};
/** 天使: 語尾は硬直だがカウンター分岐が無い州(angelBossTick の注記「jibril 'warp-recover' はプレイヤー不可」)。 */
const ANGEL_EXCLUDED_STATES: Partial<Record<EnemyType, readonly string[]>> = {
  jibril: ['warp-recover'],
};

/** いまこのボスにカウンターが通る州か(=記録の「機会」)。純関数・store を読まない。
 * ★カウンター憲法(社長裁定2026-08-26・v0.25.3947「攻撃判定と窓が重なった時だけがカウンター成立」): 裏ボス4体/idol/賞金首の
 * 硬直(-recover)の接触成立は撤去済み(useGameLoop は HIDDEN_COUNTER_ACTIVE_STATES しか見ない。宣言表の 'hidden:*-recover' 等は
 * 完全性のために残っている州)。機会にも数えない=1技1機会(溜め→実行)。
 * ※天使6体とフィルは硬直中も bodyOverlapNow+angelCounterHit の分岐が生きている(angelBossTick 'tate-recover' 等)ので、
 *   そちらは語尾の硬直も機会のまま。 */
export const isBossCounterOpportunity = (e: Pick<Enemy, 'type' | 'aiPhase' | 'bossState'>): boolean => {
  const fam = DECL_FAMILY[e.type];
  const bs = e.bossState ?? '';
  if (fam !== undefined) {
    if (bs.endsWith('-recover')) return false;
    const kind = COUNTER_REACH_DECL[`${fam}:${bs}`];
    return kind !== undefined && kind !== 'none';
  }
  if (ANGEL_EXCLUDED_STATES[e.type]?.includes(bs)) return false;
  if (ANGEL_EXTRA_STATES[e.type]?.includes(bs)) return true;
  return isBossCounterableNowApprox(e.aiPhase, e.bossState, e.type);
};
