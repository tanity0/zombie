import { UpgradeOption, Player, EquipSlot, EquipmentDef } from '../types/game';
import {
  EQUIP_SLOTS, EQUIP_LINES_BY_SLOT, EQUIP_TIER_MAX, SPECIAL_EQUIP_CHANCE,
  equipmentById, equipmentDef, specialEquipmentForSlot, equipmentDescription
} from '../data/equipment';
// v0.25.3212(社長指示「取り急ぎ、ナイフは武器箱に移す」): レベルアップ3枠目のナイフ提示
// (旧: Tier5未満なら25%で次Tierナイフ)は廃止し、ナイフ強化は武器箱(weaponDrop.openCrate)へ移した。
// 3枠目は常設スクラップ+50に戻る。
const SCRAP_REWARD = 50;
const scrapOption = (): UpgradeOption =>
  ({ id: 'lvl-scrap', name: `スクラップ +${SCRAP_REWARD}`, description: `スクラップを ${SCRAP_REWARD} 獲得`, type: 'scrap', level: SCRAP_REWARD });

// レベルアップ報酬 = 装備の3選択肢(確定版 仕様4章)。
//   ①進化  : スロット抽選→次ランク提示(未装備/特殊スロットはランク1=特殊から通常へ戻せる)。
//   ②補完/特殊: 未装備スロットからランダム1個。空きありは95%空き埋め/5%特殊、空き無しは特殊10%。
//   ③スクラップ: 常設 +50(特殊で置換しない)。
//   枯渇で①or②は消滅。①②両方カンスト時のみ「HP30%回復」を追加提示。
//   系統分岐は引き(出たカードから選ぶ)。選択は即時反映・同スロット既存は入れ替え(破棄)。
const SPECIAL_CHANCE_NO_EMPTY = 0.10; // 空きスロット無しでの特殊出現率

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

  // 選択肢②: 補完(空き埋め)/特殊。
  const emptySlots = EQUIP_SLOTS.filter(s => !loadout[s]);
  const unownedSpecials = EQUIP_SLOTS
    .map(specialEquipmentForSlot)
    .filter(sp => loadout[sp.slot] !== sp.id); // まだ装備していない特殊のみ
  let compDef: EquipmentDef | null = null;
  if (emptySlots.length > 0) {
    if (Math.random() < SPECIAL_EQUIP_CHANCE && unownedSpecials.length > 0) {
      compDef = randPick(unownedSpecials);
    } else {
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
  } else if (Math.random() < SPECIAL_CHANCE_NO_EMPTY && unownedSpecials.length > 0) {
    compDef = randPick(unownedSpecials);
  }
  if (compDef) options.push(equipOption(compDef, compDef.special ? 'sp' : 'fill'));

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
// selectUpgrade 側の passive 分岐は型網羅のため残置(この経路は今後生成されない)。
