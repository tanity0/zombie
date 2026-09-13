import { CharacterClass } from '../types/game';

// RE+WWZ starting loadouts. Every survivor carries exactly one gun and one
// melee weapon. Keys map into the weapon catalog in `weaponUtils.ts`.
//
// We keep the existing four character-class ids (warrior/mage/rogue/
// necromancer) from the menu but re-skin their loadouts toward the survival-
// horror fantasy:
//   warrior     — close-quarters bruiser: sawn-off shotgun + hatchet
//   rogue       — agile striker: handgun + machete
//   mage        — marksman: magnum + knife
//   necromancer — scavenger: handgun + knife
export interface PlayerProfile {
  gunKey: string;
  meleeKey: string;
  maxHp: number;
}

// 全キャラの性能差は撤廃: maxHp は全員同一(普通)。速度は PLAYER_BASE_SPEED で共通、攻撃力は
// 装備武器依存。差は「初期装備(gun/melee)」と「専用スキル」のみ。
// research/GROWTH.md v4(永続育成「強化」と同時に入れる前提変更): 110 → 130。
// ※store初期プレースホルダの PLAYER_BASE_HP=120(守護霊台帳の記録基準)は据え置き。
const STANDARD_MAX_HP = 130;
export const PLAYER_PROFILES: Record<CharacterClass, PlayerProfile> = {
  warrior:     { gunKey: 'shotgun-t1', meleeKey: 'hatchet-t2', maxHp: STANDARD_MAX_HP },
  rogue:       { gunKey: 'handgun-t1', meleeKey: 'machete-t3', maxHp: STANDARD_MAX_HP },
  mage:        { gunKey: 'rifle-t1',   meleeKey: 'knife-t1',   maxHp: STANDARD_MAX_HP },
  necromancer: { gunKey: 'handgun-t1', meleeKey: 'hatchet-t2', maxHp: STANDARD_MAX_HP }
};
