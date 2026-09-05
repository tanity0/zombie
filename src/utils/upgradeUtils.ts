import { UpgradeOption, Player, EquipSlot, EquipmentDef, SkillKey, ConsumableKey } from '../types/game';
import {
  EQUIP_SLOTS, EQUIP_LINES_BY_SLOT, EQUIP_TIER_MAX,
  equipmentById, equipmentDef, equipmentDescription
} from '../data/equipment';
import { SKILLS, skillDescForLevel } from '../data/campaign';
import { CONSUMABLES, consumableCardDescription } from '../data/consumables';
import { draftRunSkillCards, draftReplacementSkillCard, type DraftedCard, type RunSkillDraftInput } from './runSkillDraft';
import type { RailKind } from './railBias'; // PACING_PUZZLE.md §7-11c(3): 手動レール(実機テスト用ツマミ)
// v0.25.3212(社長指示「取り急ぎ、ナイフは武器箱に移す」): レベルアップ3枠目のナイフ提示
// (旧: Tier5未満なら25%で次Tierナイフ)は廃止し、ナイフ強化は武器箱(weaponDrop.openCrate)へ移した。
// 3枠目は常設スクラップ+50に戻る。
export const SCRAP_REWARD = 50;
const scrapOption = (): UpgradeOption =>
  ({ id: 'lvl-scrap', name: `スクラップ +${SCRAP_REWARD}`, description: `スクラップを ${SCRAP_REWARD} 獲得`, type: 'scrap', level: SCRAP_REWARD });

// レベルアップ報酬 = 装備の3選択肢(確定版 仕様4章。現在はボスドロップ宝箱専用=下の注記参照)。
//   ①進化  : スロット抽選→次ランク提示(未装備/特殊スロットはランク1=特殊から通常へ戻せる)。
//   ②補完: 空きスロットへランダム1個(通常装備のみ。SKILL_BUILD_REDESIGN.md §16-2/§18-1の3で
//     特殊装備混入=旧・空きあり5%/空きなし10%は撤去済み。特殊装備はPOI専任)。
//   ③スクラップ: 常設 +50(特殊で置換しない)。
//   枯渇で①or②は消滅。①②両方カンスト時のみ「HP30%回復」を追加提示。
//   系統分岐は引き(出たカードから選ぶ)。選択は即時反映・同スロット既存は入れ替え(破棄)。
const randPick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const equipOption = (def: EquipmentDef, tag: string): UpgradeOption => ({
  id: `equip-${tag}-${def.id}`,
  name: def.name,
  description: equipmentDescription(def),
  type: 'equipment',
  equipDefId: def.id,
  level: def.tier, // ランク(特殊=0)
});

export const generateEquipmentChoices = (player: Player): UpgradeOption[] => {
  const loadout = player.equipment;
  const options: UpgradeOption[] = [];

  // 選択肢①: 進化(ランク有りで提示できるスロット=未装備/特殊/通常R<5)。
  const evolvable: EquipSlot[] = EQUIP_SLOTS.filter(slot => {
    const def = equipmentById(loadout[slot]);
    if (!def) return true;            // 未装備 → R1
    if (def.special) return true;     // 特殊 → R1へ戻せる(カンストしない)
    return def.tier < EQUIP_TIER_MAX; // 通常 R<5
  });
  let evoDef: EquipmentDef | null = null;
  if (evolvable.length > 0) {
    const slot = randPick(evolvable);
    const cur = equipmentById(loadout[slot]);
    if (!cur || cur.special) {
      evoDef = equipmentDef(slot, randPick(EQUIP_LINES_BY_SLOT[slot]), 1);
    } else {
      evoDef = equipmentDef(slot, cur.line, cur.tier + 1);
    }
  }
  if (evoDef) options.push(equipOption(evoDef, 'evo'));

  // 選択肢②: 補完(空き埋め)。SKILL_BUILD_REDESIGN.md §16-2/§18-1の3: 特殊装備混入(旧: 空きあり5%/
  // 空きなし10%)はボスドロップ宝箱経路でも撤去(特殊はPOI専任・§12冒頭の裁定を宝箱にも適用)。
  // 空きスロットが無ければ②自体が出ない(旧仕様の「空きなし10%特殊」に代わる提示は無い)。
  const emptySlots = EQUIP_SLOTS.filter(s => !loadout[s]);
  let compDef: EquipmentDef | null = null;
  if (emptySlots.length > 0) {
    const slot = randPick(emptySlots);
    const line = randPick(EQUIP_LINES_BY_SLOT[slot]);
    let d = equipmentDef(slot, line, 1)!;
    // ①と完全重複(同スロット同系統R1)なら別系統へ振り直し。
    if (evoDef && d.id === evoDef.id) {
      const other = EQUIP_LINES_BY_SLOT[slot].find(l => l !== line);
      if (other) d = equipmentDef(slot, other, 1)!;
    }
    compDef = d;
  }
  if (compDef) options.push(equipOption(compDef, 'fill'));

  // 選択肢③: 常設スクラップ +50(v0.25.3212: ナイフ提示は武器箱へ移設)。
  options.push(scrapOption());

  // ①②両方カンスト → HP30%回復を1つ提示。
  if (!evoDef && !compDef) {
    options.push({ id: 'lvl-heal', name: 'HP30%回復', description: '最大HPの 30% を回復', type: 'heal', level: 1 });
  }

  return options;
};

// 旧「直接パッシブ強化」報酬(generateUpgradeOptions / getPassiveDisplayName など)は確定版で全面廃止し、
// 上の装備3選択肢へ置換した。装填数(magSize/magBonus)は候補から除外(player の magBonus フィールドは残置)。

// ============================================================================================
// SKILL_BUILD_REDESIGN.md §12-1/§17: レベルアップ = スキル専業3択(新規∪Lv+1)+常設4枚目
// 「スクラップ+50」。装備カードはここでは出さない(装備は商人=B2)。generateEquipmentChoicesは
// ボスドロップ宝箱(§16-2「維持」)専用に残る=このファイル内で共存する。
// ============================================================================================

// §23: 消費カード(取得で即発動・60秒・温存不可)のUpgradeOption化。カード面に「60秒・使い切り」を
// 必ず載せる(§23-2条件5)。
const consumableCardToUpgradeOption = (key: ConsumableKey): UpgradeOption => ({
  id: `consumable-${key}`,
  name: CONSUMABLES[key].name,
  description: consumableCardDescription(key),
  type: 'consumable',
  level: 0,
  consumableKey: key,
});

const cardToUpgradeOption = (card: DraftedCard): UpgradeOption => {
  if (card.cardKind === 'consumable') return consumableCardToUpgradeOption(card.key);
  return {
    id: `skill-${card.cardKind}-${card.key}`,
    name: SKILLS[card.key].name,
    description: skillDescForLevel(card.key, card.toLevel),
    type: 'skill',
    level: 0, // §12-2軽微: スキルLvは level を流用しない(専用フィールドskillLvを使う)
    skillKey: card.key,
    skillCardKind: card.cardKind,
    skillRarity: card.rarity,
    skillFromLv: card.fromLevel,
    skillLv: card.toLevel,
  };
};

/** レベルアップのスキル/消費カード3択+常設スクラップ+50を生成する(§16-9点6: 3枚未満の提示を許容し、
 * 埋め合わせの複製スクラップカードは作らない=常設4枚目1枚だけを追加する)。 */
export const generateSkillUpgradeChoices = (
  input: RunSkillDraftInput, count = 3, rng: () => number = Math.random,
  // PACING_PUZZLE.md §7-11c(3): 手動レール(実機テスト用ツマミ)。既定null=完全に現行どおり。
  rail: RailKind | null = null, railMult = 1.5,
): UpgradeOption[] => {
  const cards = draftRunSkillCards(input, count, rng, rail, railMult);
  const options = cards.map(cardToUpgradeOption);
  options.push(scrapOption());
  return options;
};

/** バニッシュ/差し替え: 現在表示中の他カードのキー(スキル/消費カードそれぞれ)を dealtSeed に渡し、
 * 1枚だけ引き直す。差し替えできなければ null(呼び出し側はそのスロットを空表示にする=§16-9点6)。 */
export const generateReplacementSkillOption = (
  input: RunSkillDraftInput,
  dealtSeed: readonly SkillKey[],
  dealtConsumableSeed: readonly ConsumableKey[] = [],
  rng: () => number = Math.random,
  rail: RailKind | null = null, railMult = 1.5,
): UpgradeOption | null => {
  const card = draftReplacementSkillCard(input, dealtSeed, dealtConsumableSeed, rng, rail, railMult);
  return card ? cardToUpgradeOption(card) : null;
};
// selectUpgrade 側の passive 分岐は型網羅のため残置(この経路は今後生成されない)。
