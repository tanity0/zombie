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

export const PLAYER_PROFILES: Record<CharacterClass, PlayerProfile> = {
  warrior:     { gunKey: 'shotgun-t1', meleeKey: 'hatchet-t2', maxHp: 130 },
  rogue:       { gunKey: 'handgun-t1', meleeKey: 'machete-t3', maxHp: 105 },
  mage:        { gunKey: 'rifle-t1',   meleeKey: 'knife-t1',   maxHp: 100 },
  necromancer: { gunKey: 'handgun-t1', meleeKey: 'knife-t1',   maxHp: 120 }
};
