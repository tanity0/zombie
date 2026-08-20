// 永続育成「強化」の台帳(research/GROWTH.md v4)。**4系統×5段・価格は全系統共通**。
//
// ★このファイルが持つのは**値の定義だけ**(dataの葉=localStorage/store/PixiJSのどれにも依存しない)。
//   ・段数→効果値の純関数と保存の読み書き = src/utils/playerUpgrades.ts
//   ・出撃時の焼き込みと各適用点 = src/store/gameStore.ts(resetGame)
//   育成は「数値の加減算」だけで、新しい判定・文法は作らない(全メーター0=育成機能が無かった時と
//   完全に一致する、が最重要の不変条件)。

/** 育成の系統id。 */
export type PlayerUpgradeId = 'health' | 'attack' | 'ammo' | 'gold';

/** 各系統の上限段数。 */
export const PLAYER_UPGRADE_MAX_LEVEL = 5;

/**
 * 段ごとの購入価格(全系統共通)。index = **これから買う段の1つ前**(0段目→1段目が index 0)。
 * 単調増加であることは不変条件テストで固定する。
 */
export const PLAYER_UPGRADE_COSTS: readonly number[] = [60, 140, 300, 620, 1200];

export interface PlayerUpgradeDef {
  id: PlayerUpgradeId;
  /** 強化画面の行名。 */
  label: string;
  /**
   * 1段あたりの効果量。体力=**加算HP**、それ以外=**倍率へ足す割合**(攻撃0.04=+4%)。
   * 効果値へ変換するのは utils/playerUpgrades.ts の純関数(ここでは掛け方を決めない)。
   */
  perLevel: number;
  /** UI表記(1段あたり)。数字の意味は perLevel と同じものを人間向けに書いたもの。 */
  perLevelLabel: string;
  /** 強化画面の説明(1行)。 */
  desc: string;
}

export const PLAYER_UPGRADES: readonly PlayerUpgradeDef[] = [
  { id: 'health', label: '体力',       perLevel: 20,   perLevelLabel: '+20',  desc: '最大体力が増える' },
  { id: 'attack', label: '攻撃力',     perLevel: 0.04, perLevelLabel: '+4%',  desc: '与えるダメージが上がる' },
  { id: 'ammo',   label: '弾数',       perLevel: 0.05, perLevelLabel: '+5%',  desc: '持てる弾薬の上限が増える' },
  { id: 'gold',   label: 'ゴールド獲得', perLevel: 0.10, perLevelLabel: '+10%', desc: '手に入るゴールドが増える' },
];

/** 系統idの一覧(表示順=台帳順)。 */
export const PLAYER_UPGRADE_IDS: readonly PlayerUpgradeId[] = PLAYER_UPGRADES.map(u => u.id);

/** 台帳の1行を引く(未定義のidは呼べない=型で塞いである)。 */
export const playerUpgradeDef = (id: PlayerUpgradeId): PlayerUpgradeDef =>
  PLAYER_UPGRADES.find(u => u.id === id) as PlayerUpgradeDef;
