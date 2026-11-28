// research/STAGE_DIFFICULTY.md: ステージ係数を**1本に集約する**ヘルパ(ボス用・雑魚用・スコア用)。
//
// 掛け忘れ/掛けすぎの分岐を各スポーン地点へ散らさないための唯一の入口。
//  ・stageId の出どころは1本=`getSelectedStageId()`(城ボス/ストーリーボス/天使/裏ボス/賞金首の
//    どのスポーン経路も選択ステージのボスしか出さない。練習ラン中は枠の stageId が返る)。
//  ・**ボスメーカー/ガントレット(計測路)では 1.0** ——育成(GROWTH.md)と同じ
//    「計測の基準を動かさない」原則。過去のTTKログと比較可能に保つ。
//  ・research/MASTERY.md v2 §6: 体力・攻撃の係数は**練習ラン(isPracticeRun・幻影の練習を含む)でも 1.0**。
//    ボスだけの上乗せ(STAGE_BOSS_EXTRA_HP_MULT)はボス用にだけ掛け、雑魚用には入れない(関数を分ける)。
//  ・スコアの倍率は別の表(STAGE_SCORE_MULT)。練習ランの扱いは従来どおり(計測路だけ1.0)。
//
// import は config/stageDifficulty(依存ゼロの葉)・bossTest・gauntletMode・bossPractice・data/progress のみ。
import { stageHpMult, stageDmgMult, stageBossExtraHpMult, stageScoreMultFor } from '../config/stageDifficulty';
import { isBossMakerRun } from './bossTest';
import { isGauntletRun } from './gauntletMode';
import { isPracticeRun } from './bossPractice';
import { getSelectedStageId } from '../data/progress';

const isMeasurementRun = (): boolean => isBossMakerRun() || isGauntletRun();

/** ボスのスポーン時に掛ける係数(体力はボスだけの上乗せ込み)。計測路・練習ランでは {hp:1, dmg:1}。 */
export const stageBossDiffMults = (): { hp: number; dmg: number } => {
  if (isMeasurementRun() || isPracticeRun()) return { hp: 1, dmg: 1 };
  const stageId = getSelectedStageId();
  return { hp: stageHpMult(stageId) * stageBossExtraHpMult(stageId), dmg: stageDmgMult(stageId) };
};

/** 雑魚に配る係数(resetGame の setStageDifficultyMults)。ボスだけの上乗せは入れない。計測路・練習ランでは {hp:1, dmg:1}。 */
export const stageMobDiffMults = (): { hp: number; dmg: number } => {
  if (isMeasurementRun() || isPracticeRun()) return { hp: 1, dmg: 1 };
  const stageId = getSelectedStageId();
  return { hp: stageHpMult(stageId), dmg: stageDmgMult(stageId) };
};

/** スコア・換金のステージ倍率(resetGame の bakedStageScoreMult)。計測路では 1。 */
export const stageScoreMult = (): number => {
  if (isMeasurementRun()) return 1;
  return stageScoreMultFor(getSelectedStageId());
};
