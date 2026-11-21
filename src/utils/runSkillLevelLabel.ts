// 取得済みスキルの「今のLv/この出撃で届く上限」と数字の色の段の、表示用純関数(社長指示2026-11-12)。
// 上限の出どころは runLevelCap(=所持Lv ownedSkillLevels と skillMaxLevel の小さい方)=
// レベルアップのLv+1候補を出す/出さないを決めているのと同じ1本。表示と抽選を食い違わせない。
// PixiJS import 禁止(renderer非依存)。

import type { SkillKey } from '../types/game';
import { runLevelCap } from './runSkillDraft';

/** 表示用の上限。通常は runLevelCap。ボスメーカーの注入等で今のLvが上限を超えている時だけ
 * 今のLvを上限として出す(「(3/1)」のような読めない表示を作らない)。 */
export const runSkillDisplayCap = (
  key: SkillKey, currentLv: number, ownedLevels: Partial<Record<SkillKey, number>>,
): number => Math.max(Math.max(1, Math.floor(currentLv)), runLevelCap(key, ownedLevels));


/** Lv数字の色の段: 'max'=上限に達した(琥珀) / 'low'=Lv1で上限未満(白を一段落とす) / 'normal'=それ以外(白)。 */
export type SkillLevelTone = 'max' | 'low' | 'normal';
export const skillLevelTone = (currentLv: number, cap: number): SkillLevelTone => {
  const lv = Math.max(1, Math.floor(currentLv));
  if (lv >= Math.floor(cap)) return 'max';
  return lv <= 1 ? 'low' : 'normal';
};
