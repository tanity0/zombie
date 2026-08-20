// 永続育成「強化」の台帳(research/GROWTH.md v4)。**4系統×5段・価格は全系統共通**。
//
// ★このファイルが持つのは**値の定義だけ**(dataの葉=localStorage/store/PixiJSのどれにも依存しない)。
//   ・段数→効果値の純関数と保存の読み書き = src/utils/playerUpgrades.ts
//   ・出撃時の焼き込みと各適用点 = src/store/gameStore.ts(resetGame)
//   育成は「数値の加減算」だけで、新しい判定・文法は作らない(全メーター0=育成機能が無かった時と
//   完全に一致する、が最重要の不変条件)。

/** 育成の系統id。 */
export type PlayerUpgradeId = 'health' | 'attack' | 'ammo' | 'xp' | 'gold';

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
  // 経験値効率(社長指示v0.25.3679「強化項目に経験値効率も追加。10%ずつ」)。
  { id: 'xp',     label: '経験値効率',   perLevel: 0.10, perLevelLabel: '+10%', desc: 'プレイ中のレベルアップが速くなる' },
  { id: 'gold',   label: 'ゴールド獲得', perLevel: 0.10, perLevelLabel: '+10%', desc: '手に入るゴールドが増える' },
];

/** 系統idの一覧(表示順=台帳順)。 */
export const PLAYER_UPGRADE_IDS: readonly PlayerUpgradeId[] = PLAYER_UPGRADES.map(u => u.id);

/**
 * スコア補正(社長裁定2026-08-20「強化するとスコア倍率が比例して下がる」):
 * **メーター1本(1系統5段フル)あたりスコア倍率 −0.125**(=1段あたり−0.025)。
 * 対象は下の3系統だけ——**ゴールド獲得はスコア対象外**(社長裁定)。
 * 換金(goldScore→ゴールド)にも掛かる(社長裁定「その他は換金も下げる。下げるメリットが薄まるため」
 * =メーターを下げれば実入りも戻る、が縛りの動機になる)。
 * ★数値改定(社長指示v0.25.3667「0.7で割り切れるならそっちがいい」):
 *   0.1=1段−2%・1本フル−0.1・**3本フルでちょうど×0.7**(経緯: 0.2→0.125→0.1)。
 */
export const PLAYER_UPGRADE_SCORE_PENALTY_PER_METER = 0.1;
// 経験値効率もラン内の強さ(レベル=スキル)に直結するため対象に含める(社長裁定「ゴールド強化は
// スコア対象外。その他は換金も下げる」の一貫・v0.25.3679)。4本フルで×0.6。
export const SCORE_PENALTY_UPGRADE_IDS: readonly PlayerUpgradeId[] = ['health', 'attack', 'ammo', 'xp'];

/** 台帳の1行を引く(未定義のidは呼べない=型で塞いである)。 */
export const playerUpgradeDef = (id: PlayerUpgradeId): PlayerUpgradeDef =>
  PLAYER_UPGRADES.find(u => u.id === id) as PlayerUpgradeDef;
