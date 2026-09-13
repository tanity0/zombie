// SKILL_BUILD_REDESIGN.md §23(消費カード裁定と発注文・社長裁定2026-08-13「案B・30%60秒・
// あとは推薦で」): 消費カード5種の台帳。ノーマル枠を1つ占有し、取得で即発動・60秒で自動失効
// (温存不可)。全プレイヤー共通(ガチャ外・デッキ所持に依存しない=SKILLS/ownedSkillsとは無関係)。
// 名前・数値は全て叩き台(実機調整前提・§23-1「名前は仮。数値は全て叩き台」)。
// 抽選(カテゴリロール40:40:20・新規枯渇時70:30)・枠会計は src/utils/runSkillDraft.ts、
// 倍率フックは src/store/gameStore.ts(consumableScrapMult等)を参照。
import type { ConsumableKey } from '../types/game';

export const CONSUMABLE_DURATION_MS = 60_000;

export interface ConsumableDef {
  key: ConsumableKey;
  name: string;
  /** 効果だけの説明(共通文言「60秒・使い切り」は付けない=表示側で付与する)。 */
  effect: string;
}

export const CONSUMABLES: Record<ConsumableKey, ConsumableDef> = {
  'scrap-boost':   { key: 'scrap-boost',   name: 'スクラップブースト', effect: 'スクラップ入手 +50%' },
  'attack-doping': { key: 'attack-doping', name: 'アタックドーピング', effect: '攻撃力 +20%' },
  'speed-boost':   { key: 'speed-boost',   name: 'スピードブースト',   effect: '移動速度 +15%' },
  'xp-boost':      { key: 'xp-boost',      name: '経験値ブースト',     effect: '経験値 ×1.5' },
  'protection':    { key: 'protection',    name: 'プロテクション',     effect: '被ダメージ -30%' },
};

export const CONSUMABLE_KEYS: ConsumableKey[] = Object.keys(CONSUMABLES) as ConsumableKey[];

/** カード面/取得トーストの文言(§23-2条件5:「60秒・使い切り」が必ず伝わること)。 */
export const consumableCardDescription = (key: ConsumableKey): string =>
  `${CONSUMABLES[key].effect}(60秒・使い切り)`;
