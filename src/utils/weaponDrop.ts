import { AmmoType } from '../types/game';
import { GUN_KEYS_BY_CATEGORY, MELEE_KEYS } from './weaponUtils';

// WWZ-style loot: enemies rarely drop a weapon outright, and mid-bosses always
// drop a weapon crate that rolls one. Tier率はエリア(距離)で決まる(社長指定): 奥ほど高Tier。

const CATEGORIES: AmmoType[] = ['handgun', 'shotgun', 'rifle'];

// エリア別 武器箱Tier率(社長指定)。添字=エリア(0 軍備 / 1 研究 / 2 デンジャー / 3 未確認 / 4 深層)。
const TIER_WEIGHTS_BY_AREA: [number, number, number][] = [
  [85, 15, 0],   // 軍備配置
  [55, 40, 5],   // 研究対象
  [30, 55, 15],  // デンジャー
  [10, 55, 35],  // 未確認汚染
  [0,  35, 65],  // 深層域
];

const pickTier = (area: number): number => {
  const w = TIER_WEIGHTS_BY_AREA[area] ?? TIER_WEIGHTS_BY_AREA[0];
  const total = w[0] + w[1] + w[2];
  let r = Math.random() * total;
  for (let i = 0; i < 3; i++) {
    r -= w[i];
    if (r <= 0) return i + 1;
  }
  return 1;
};

// Roll a random gun key (used for both world drops and crates). Melee weapons
// are rarer so the player mostly upgrades their firearm. `area` = 0..4。
export const rollWeaponKey = (area: number): string => {
  const tier = pickTier(area);

  // ~15% of rolls produce a melee weapon instead of a gun.
  if (Math.random() < 0.15) {
    // Melee tier index lines up with the gun tier roll (clamped to range).
    const idx = Math.min(MELEE_KEYS.length - 1, tier - 1);
    return MELEE_KEYS[idx];
  }

  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const keys = GUN_KEYS_BY_CATEGORY[category];
  const idx = Math.min(keys.length - 1, tier - 1);
  return keys[idx];
};

// A crate always yields a gun (the melee path is reserved for rarer world
// drops) so opening one feels like a firepower reward. `area` = 0..4。
export const openCrate = (area: number): string => {
  const tier = pickTier(area);
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const keys = GUN_KEYS_BY_CATEGORY[category];
  const idx = Math.min(keys.length - 1, tier - 1);
  return keys[idx];
};
