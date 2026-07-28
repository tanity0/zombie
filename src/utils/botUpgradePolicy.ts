// M26-L(実機オートパイロット・PACING_PUZZLE.md §6.3)/ M26 Step1(ヘッドレス成長ループ)共用:
// ボットのレベルアップ自動選択ポリシー。叩き台=一様ランダム。シード付き決定的乱数(mulberry32)で
// 再現性を確保する(Math.random 直呼びは仕様で禁止=同シード同ランで同じ選択列になること)。
// 純関数(store/React非依存)=ユニットテスト可能(実装精度の規律4)。
import { equipmentById } from '../data/equipment';
import type { Player, UpgradeOption } from '../types/game';

// 標準的な mulberry32 PRNG。同じ seed からは常に同じ数列([0,1))を返す。
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// options から1つ選ぶ(一様ランダム・叩き台)。空配列は呼び出し側でガードする前提
// (showUpgradeMenu && upgradeOptions.length > 0 の時だけ呼ぶ)。境界は防御的にクランプ。
export const pickUpgrade = <T>(options: readonly T[], rand: () => number): T =>
  options[Math.min(options.length - 1, Math.max(0, Math.floor(rand() * options.length)))];

// M49-4(§6.25): 強化選択のポリシー化。「AIの強さ」ではなく計測の信頼性の問題——一様ランダムのまま
// では、実測でLv20なのに最大HP110(Lv10の240より弱い)という事故が起き、段階式ボットの比較が
// 成立しない。'greedy' は装備Tier上げ > ナイフ強化 > 回復(HP<50%のみ) > スクラップ > その他、の
// 優先順で選ぶ。同順位は rand で決める(決定性=同シード同結果)。
export type UpgradePolicy = 'random' | 'greedy';

/** type==='equipment' の候補が「今装備している同スロットより高いTierか」。違えば null。 */
const equipTierUpgrade = (opt: UpgradeOption, player: Pick<Player, 'equipment'>): number | null => {
  if (opt.type !== 'equipment' || !opt.equipDefId) return null;
  const def = equipmentById(opt.equipDefId);
  if (!def) return null;
  const curId = player.equipment[def.slot];
  const curTier = curId ? (equipmentById(curId)?.tier ?? 0) : 0;
  return opt.level > curTier ? opt.level : null;
};

/**
 * 段階(botSkill.upgradePolicy)に応じた強化選択。
 * **`policy==='random'` は `pickUpgrade` と完全に同一の結果を返す**(既存の実測値と比較できるよう)。
 * `policy==='greedy'` は優先度バケツ(小さいほど優先)で最良の1件(複数あれば rand)を選ぶ。
 */
export const pickUpgradeByPolicy = <T extends UpgradeOption>(
  options: readonly T[],
  rand: () => number,
  policy: UpgradePolicy,
  player: Pick<Player, 'equipment' | 'health' | 'maxHealth'>,
): T => {
  if (policy === 'random' || options.length === 0) return pickUpgrade(options, rand);

  const bucket = (opt: T): number => {
    if (equipTierUpgrade(opt, player) !== null) return 0; // ①装備Tier上げ(最も高いTierを優先)
    if (opt.type === 'knife') return 1;                   // ②ナイフを次Tierへ
    if (opt.type === 'heal') {
      // ③回復は現在HPが最大の50%未満の時だけ優先。それ以外は⑤その他と同格へ落とす。
      return player.maxHealth > 0 && player.health / player.maxHealth < 0.5 ? 2 : 4;
    }
    if (opt.type === 'scrap') return 3; // ④スクラップ
    return 4;                           // ⑤上記以外(装備の格下・特殊など)
  };

  let bestBucket = Infinity;
  let candidates: T[] = [];
  for (const opt of options) {
    const b = bucket(opt);
    if (b < bestBucket) { bestBucket = b; candidates = [opt]; }
    else if (b === bestBucket) candidates.push(opt);
  }
  if (bestBucket === 0 && candidates.length > 1) {
    // 装備Tier上げが複数あれば「最も高いTier」を優先。
    const maxTier = Math.max(...candidates.map(o => o.level));
    candidates = candidates.filter(o => o.level === maxTier);
  }
  return candidates.length === 1 ? candidates[0] : pickUpgrade(candidates, rand);
};
