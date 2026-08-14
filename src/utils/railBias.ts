// PACING_PUZZLE.md §7-11c(3): 手動レール指定(実機テスト用ツマミ・(5)レール確定用)。
// `?rail=judge|elite|dps` + `?railmult=<倍率・既定1.5>`。既存の抽選プール/ドロップ確率へ
// **乗算するだけ**(検出器§7-7はまだ作らない・新しい抽選機構は作らない)。未指定=完全に現行どおり。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(実装精度の規律4)。
import type { SkillKey } from '../types/game';

export type RailKind = 'judge' | 'elite' | 'dps';
export const RAIL_KINDS: readonly RailKind[] = ['judge', 'elite', 'dps'];
export const DEFAULT_RAIL_MULT = 1.5;

/** 純関数: `?rail=`の生値→RailKind(未知の値/未指定はnull=レール無し)。 */
export const parseRailKind = (raw: string | null | undefined): RailKind | null =>
  raw === 'judge' || raw === 'elite' || raw === 'dps' ? raw : null;

/** 純関数: `?railmult=`の生値→倍率(空/NaN/0以下は既定DEFAULT_RAIL_MULTへフォールバック)。 */
export const parseRailMult = (raw: string | null | undefined): number => {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_RAIL_MULT;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_RAIL_MULT;
};

// ---- スキル分類表(§7-11c(3): 既存のスキル定義タグ/名前から素直に分類。迷うものは対象外=undefined) ----
// judge = 処刑/近接系スキル / elite = 体勢/クリ系スキル / dps = 火力系スキル。
// 分類根拠は各スキルの説明文(src/data/campaign.ts SKILLS)から機械的に読める効果を基準にした。
// 複数の効果が混ざっている、または効果が経済/utility寄りで判定が付かないものは対象外(null)に落とす
// (社長方針「無理に割り当てない」)。
const RAIL_SKILL_CLASS: Partial<Record<SkillKey, RailKind>> = {
  // judge(処刑/近接系): 近接フィニッシュ・近接コンボ・カウンター周りが主効果のスキル。
  'reaper': 'judge',           // 近接フィニッシュ時、範囲内の敵を全員フィニッシュ
  'execution-shock': 'judge',  // 「処刑」= 近接フィニッシュ時に爆発
  'combo-master': 'judge',     // 近接フィニッシュのコンボ窓延長
  'knife-master': 'judge',     // 近接コンボダメージ増加(主効果は近接)
  'slasher': 'judge',          // 近接攻撃を連続で振れる
  'rescue-signal': 'judge',    // 近接ヒット時トリガーの援護攻撃
  'counter-master': 'judge',   // カウンター成立のCD払い戻し+ノックバック

  // elite(体勢/クリ系): クリティカル・体勢削りが主効果のスキル。
  'crit-up': 'elite',          // クリティカルダメージ上昇(覚醒でクリが体勢も削る)
  'echo-shot': 'elite',        // クリティカル時に弾を複製
  'benkei': 'elite',           // 武器切り替えでクリティカル率上昇
  'barrage-king': 'elite',     // カウンター反射弾の体勢削りを強化

  // dps(火力系): ダメージ量そのものを底上げするスキル。
  'berserker': 'dps',          // 失ったHP%だけ全攻撃増加
  'attack-shooter': 'dps',     // 銃ダメージ+10〜30%
  'last-magazine': 'dps',      // 弾倉最後の1発ダメージ×2〜3
  'sniper': 'dps',             // 銃ダメージが停止中/遠距離ほど増加
  'fire-shooter': 'dps',       // 発射の一部が爆発弾に(追加ダメージ)
  'exploder': 'dps',           // 全ての爆発の範囲とダメージ+20〜50%
  'bomber': 'dps',             // 爆発時にミニ手榴弾(追加ダメージ)
  'incendiary-round': 'dps',   // 被弾させた敵を燃焼(継続ダメージ)
  'gravity-shot': 'dps',       // キル時に爆縮(追加ダメージ)
};

/** 純関数: スキル→レール分類(対象外=null)。 */
export const railSkillClassOf = (key: SkillKey): RailKind | null => RAIL_SKILL_CLASS[key] ?? null;

/**
 * 純関数: スキル抽選の重み。railが指定されていて、そのスキルが該当クラスならrailmult、
 * それ以外(rail無し/未分類スキル/他クラス)は1(=既存の均等抽選のまま)。
 * §22裁定で新規/Lv+1側の抽選は完全均等(重み表なし)なので、「基準の重み=1」に対する乗算として扱う。
 */
export const railSkillWeight = (key: SkillKey, rail: RailKind | null, railMult: number): number =>
  (rail !== null && railSkillClassOf(key) === rail) ? Math.max(0, railMult) : 1;

/**
 * 純関数: 重み付き抽選(pickUniformの代わりに使う。rail=nullまたは全員同重みなら結果分布は均等=不変)。
 * poolが空ならundefinedを返す(呼び出し側は既存どおり空プールを事前に弾く前提)。
 */
export const pickWeighted = <T,>(pool: readonly T[], weightOf: (item: T) => number, rng: () => number): T => {
  const weights = pool.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pool[Math.floor(rng() * pool.length)];
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
};

// ---- ドロップバイアス(§7-11c(3): judge/dps=弾・elite=トレジャー) ----------------------------

/** 純関数: 弾薬ドロップ率(基礎率)への乗算係数。judge/dpsレール中はrailmult・それ以外は1。 */
export const railAmmoDropMult = (rail: RailKind | null, railMult: number): number =>
  (rail === 'judge' || rail === 'dps') ? Math.max(0, railMult) : 1;

/** 純関数: トレジャードロップ確率への乗算係数。eliteレール中はrailmult・それ以外は1。 */
export const railTreasureDropMult = (rail: RailKind | null, railMult: number): number =>
  rail === 'elite' ? Math.max(0, railMult) : 1;
