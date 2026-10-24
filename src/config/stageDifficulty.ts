// research/STAGE_DIFFICULTY.md(ステージ難度の階段): ステージ別の強さ倍率の**正本**。
//
// ★依存ゼロの葉(型importのみ)。雑魚(enemyUtils)・ボス(useGameLoop)・表示(bossPractice)の
// どこから読んでも循環importにならない形に保つ——値の出どころを1箇所にするための台帳なので、
// ここから他モジュールを読まない(計測路の中立化など「判断」が要る側は utils/stageDiffMults.ts)。
//
// 未掲載のステージ(stage-1 / stage-2 / stage-7 / ex系)は 1.0 = 現状不変。
//  ・stage-2(ラボ)と stage-7 は階段に乗せない(固定値・社長裁定2026-08-20「2と7は固定値でいい」)。
//    stage-7 の固定分はラスボスHPの台帳(config/bossHealth.ts の 'stage-7')側で持つ。
//  ・HPはしっかり階段/攻撃は緩やか(=無育成の即死圧・カウンターのリスクを守る)。
import type { EnemyType } from '../types/game';

export const STAGE_HP_MULT: Partial<Record<string, number>> =
  { 'stage-3': 1.2, 'stage-4': 1.4, 'stage-5': 1.6, 'stage-6': 1.8 };

export const STAGE_DMG_MULT: Partial<Record<string, number>> =
  { 'stage-3': 1.1, 'stage-4': 1.2, 'stage-5': 1.3, 'stage-6': 1.4 };

export const stageHpMult = (stageId: string | null | undefined): number => STAGE_HP_MULT[stageId ?? ''] ?? 1;
export const stageDmgMult = (stageId: string | null | undefined): number => STAGE_DMG_MULT[stageId ?? ''] ?? 1;

// 小ボス(賞金首)のステージ固定割当(社長裁定2026-08-20「小ボスは1 3 4 5だけ。6は小ボス無し」)。
// 旧: ラン内の4種重複なしローテ(store.bountyRotation)。**行が無いステージには湧かせない**
// (stage-2=ラボ・stage-6・stage-7 は小ボス無し)。
export const BOUNTY_TYPE_BY_STAGE: Partial<Record<string, EnemyType>> = {
  'stage-1': 'bounty-ranged',  // バス停
  'stage-3': 'bounty-melee',   // 馬乗り
  'stage-4': 'bounty-balance', // 鋏
  'stage-5': 'bounty-maiko',   // 舞妓
};

/** 賞金首→生息ステージの逆引き(上の表から機械導出=二重管理しない)。ボスモードの出撃先が使う。 */
export const BOUNTY_HOME_STAGE: Partial<Record<string, string>> = Object.fromEntries(
  Object.entries(BOUNTY_TYPE_BY_STAGE).map(([stageId, type]) => [type as string, stageId]),
);
