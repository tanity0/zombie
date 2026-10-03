// research/STAGE_DIFFICULTY.md: ボス個別適用の係数を**1本に集約する**ヘルパ。
//
// 掛け忘れ/掛けすぎの分岐を各スポーン地点へ散らさないための唯一の入口。
//  ・stageId の出どころは1本=`getSelectedStageId()`(城ボス/ストーリーボス/天使/裏ボス/賞金首の
//    どのスポーン経路も選択ステージのボスしか出さない。練習ラン中は枠の stageId が返る)。
//  ・**ボスメーカー/ガントレット(計測路)では 1.0** ——育成(GROWTH.md)と同じ
//    「計測の基準を動かさない」原則。過去のTTKログと比較可能に保つ。
//
// import は config/stageDifficulty(依存ゼロの葉)・bossTest・gauntletMode・data/progress のみ。
import { stageHpMult, stageDmgMult } from '../config/stageDifficulty';
import { isBossMakerRun } from './bossTest';
import { isGauntletRun } from './gauntletMode';
import { getSelectedStageId } from '../data/progress';

/** ボスのスポーン時に掛ける係数。計測路(ボスメーカー/ガントレット)では {hp:1, dmg:1}。 */
export const stageBossDiffMults = (): { hp: number; dmg: number } => {
  if (isBossMakerRun() || isGauntletRun()) return { hp: 1, dmg: 1 };
  const stageId = getSelectedStageId();
  return { hp: stageHpMult(stageId), dmg: stageDmgMult(stageId) };
};
