import { AmmoType } from '../types/game';
import { GUN_KEYS_BY_CATEGORY, MELEE_KEYS } from './weaponUtils';

// WWZ-style loot: enemies rarely drop a weapon outright, and mid-bosses always
// drop a weapon crate that rolls one. Higher tiers become more likely as the
// run goes on so early drops are mostly T1 and late drops skew T2/T3.

const CATEGORIES: AmmoType[] = ['handgun', 'shotgun', 'rifle'];

// Tier weights shift over time. Before 3 min it's almost all T1; by ~12 min
// T2/T3 dominate.
const tierWeights = (gameTime: number): [number, number, number] => {
  const min = gameTime / 60000;
  if (min < 3) return [80, 18, 2];
  if (min < 7) return [50, 35, 15];
  if (min < 12) return [30, 40, 30];
  return [15, 40, 45];
};

const pickTier = (gameTime: number): number => {
  const w = tierWeights(gameTime);
  const total = w[0] + w[1] + w[2];
  let r = Math.random() * total;
  for (let i = 0; i < 3; i++) {
    r -= w[i];
    if (r <= 0) return i + 1;
  }
  return 1;
};

// Roll a random gun key (used for both world drops and crates). Melee weapons
// are rarer so the player mostly upgrades their firearm.
export const rollWeaponKey = (gameTime: number): string => {
  const tier = pickTier(gameTime);

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
// drops) so opening one feels like a firepower reward.
export const openCrate = (gameTime: number): string => {
  const tier = pickTier(gameTime);
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const keys = GUN_KEYS_BY_CATEGORY[category];
  const idx = Math.min(keys.length - 1, tier - 1);
  return keys[idx];
};
