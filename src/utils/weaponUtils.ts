import { Weapon, CharacterClass, WeaponType, Projectile, Player, Enemy, AmmoType } from '../types/game';
import { useGameStore } from '../store/gameStore';
import { PLAYER_PROFILES } from '../data/playerProfiles';

// ---------------------------------------------------------------------------
// Weapon catalog
// ---------------------------------------------------------------------------
// Three gun families (handgun / shotgun / rifle) × three tiers, plus three
// melee tiers. Guns auto-fire at the nearest enemy and burn ammo from their
// category pool; melee weapons are swung via the finger-release counter and
// cost no ammo. Tier raises power within a family.

interface WeaponDef {
  key: string;
  name: string;
  type: WeaponType;
  category?: AmmoType;
  tier: number;
  isMelee?: boolean;
  damage: number;
  cooldown: number;
  projectileSpeed?: number;
  projectileSize?: number;
  count?: number;        // bullets/pellets per shot
  passthrough?: boolean;
}

const CATALOG: Record<string, WeaponDef> = {
  // A — Handgun family (9mm). Fast, low damage, cheap to feed.
  'handgun-t1':       { key: 'handgun-t1', name: '拳銃',           type: 'handgun', category: 'handgun', tier: 1, damage: 9,  cooldown: 420, projectileSpeed: 520, projectileSize: 8, count: 1 },
  'handgun-t2':       { key: 'handgun-t2', name: '二丁拳銃',       type: 'handgun', category: 'handgun', tier: 2, damage: 9,  cooldown: 300, projectileSpeed: 520, projectileSize: 8, count: 2 },
  'handgun-t3':       { key: 'handgun-t3', name: 'マシンピストル', type: 'handgun', category: 'handgun', tier: 3, damage: 7,  cooldown: 130, projectileSpeed: 560, projectileSize: 7, count: 1 },

  // B — Shotgun family (12g). Slow, short-range cone of pellets.
  'shotgun-t1':       { key: 'shotgun-t1', name: 'ソードオフ',     type: 'shotgun', category: 'shotgun', tier: 1, damage: 6,  cooldown: 950, projectileSpeed: 440, projectileSize: 7, count: 5 },
  'shotgun-t2':       { key: 'shotgun-t2', name: 'ポンプ式',       type: 'shotgun', category: 'shotgun', tier: 2, damage: 7,  cooldown: 780, projectileSpeed: 470, projectileSize: 7, count: 6 },
  'shotgun-t3':       { key: 'shotgun-t3', name: 'オートショット', type: 'shotgun', category: 'shotgun', tier: 3, damage: 6,  cooldown: 430, projectileSpeed: 480, projectileSize: 7, count: 7 },

  // C — Rifle/Magnum family (.44). Heavy single rounds, piercing at higher tiers.
  'rifle-t1':         { key: 'rifle-t1',   name: 'マグナム',       type: 'rifle',   category: 'rifle',   tier: 1, damage: 30, cooldown: 800,  projectileSpeed: 700,  projectileSize: 9,  count: 1 },
  'rifle-t2':         { key: 'rifle-t2',   name: 'スナイパー',     type: 'rifle',   category: 'rifle',   tier: 2, damage: 55, cooldown: 1100, projectileSpeed: 1000, projectileSize: 8,  count: 1, passthrough: true },
  'rifle-t3':         { key: 'rifle-t3',   name: 'グレネードランチャー', type: 'rifle', category: 'rifle', tier: 3, damage: 75, cooldown: 1400, projectileSpeed: 420, projectileSize: 14, count: 1, passthrough: true },

  // Melee (no ammo). Lower DPS than guns by design so bullets stay valuable.
  'knife-t1':         { key: 'knife-t1',   name: 'ナイフ',         type: 'knife',   tier: 1, isMelee: true, damage: 8,  cooldown: 0 },
  'hatchet-t2':       { key: 'hatchet-t2', name: '鉈',             type: 'hatchet', tier: 2, isMelee: true, damage: 14, cooldown: 0 },
  'machete-t3':       { key: 'machete-t3', name: 'マチェーテ',     type: 'machete', tier: 3, isMelee: true, damage: 20, cooldown: 0 }
};

export const GUN_KEYS_BY_CATEGORY: Record<AmmoType, string[]> = {
  handgun: ['handgun-t1', 'handgun-t2', 'handgun-t3'],
  shotgun: ['shotgun-t1', 'shotgun-t2', 'shotgun-t3'],
  rifle:   ['rifle-t1', 'rifle-t2', 'rifle-t3']
};
export const MELEE_KEYS = ['knife-t1', 'hatchet-t2', 'machete-t3'];

// Player-state field name that holds the pool for a given ammo type.
export const AMMO_FIELD: Record<AmmoType, 'ammoHandgun' | 'ammoShotgun' | 'ammoRifle'> = {
  handgun: 'ammoHandgun',
  shotgun: 'ammoShotgun',
  rifle: 'ammoRifle'
};

let weaponSeq = 0;
// Build a live Weapon instance from a catalog key.
export const createWeapon = (key: string): Weapon => {
  const def = CATALOG[key] ?? CATALOG['handgun-t1'];
  return {
    id: `weapon-${def.key}-${Date.now()}-${weaponSeq++}`,
    name: def.name,
    type: def.type,
    damage: def.damage,
    cooldown: def.cooldown,
    lastFired: 0,
    level: 1,
    projectileSpeed: def.projectileSpeed,
    projectileSize: def.projectileSize,
    count: def.count,
    passthrough: def.passthrough,
    category: def.category,
    tier: def.tier,
    isMelee: def.isMelee,
    ammoType: def.category,
    key: def.key
  };
};

export const getWeaponDef = (key: string): WeaponDef | undefined => CATALOG[key];

// Starting loadout: one gun + one melee weapon from the class profile.
export const getStartingWeapons = (characterClass: CharacterClass): Weapon[] => {
  const profile = PLAYER_PROFILES[characterClass] ?? PLAYER_PROFILES.warrior;
  return [createWeapon(profile.gunKey), createWeapon(profile.meleeKey)];
};

// Aim helper: point at the nearest enemy, falling back to the last movement
// direction (then straight up) when the field is empty.
const aimDirection = (player: Player, enemies: Enemy[]): { x: number; y: number } => {
  let closest: Enemy | null = null;
  let closestD2 = Infinity;
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;
  for (const e of enemies) {
    const dx = e.x + e.width / 2 - pcx;
    const dy = e.y + e.height / 2 - pcy;
    const d2 = dx * dx + dy * dy;
    if (d2 < closestD2) { closestD2 = d2; closest = e; }
  }
  if (closest) {
    const dx = closest.x + closest.width / 2 - pcx;
    const dy = closest.y + closest.height / 2 - pcy;
    const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    return { x: dx / dist, y: dy / dist };
  }
  if (player.lastDirection) return { ...player.lastDirection };
  return { x: 0, y: -1 };
};

const rotate = (v: { x: number; y: number }, angle: number) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

// Fire a single weapon this tick (cooldown- and ammo-aware). Melee weapons
// never fire here — they're handled by the counter. Guns auto-target the
// nearest enemy, roll crits per pellet, and burn one round of their ammo
// pool per shot. Returns the projectiles spawned (empty if blocked).
export const fireWeapon = (weapon: Weapon, player: Player, enemies: Enemy[]): Projectile[] => {
  const now = Date.now();
  if (weapon.isMelee || !weapon.ammoType) return [];
  if (now - weapon.lastFired < weapon.cooldown) return [];

  const field = AMMO_FIELD[weapon.ammoType];
  if (player[field] <= 0) return []; // dry — switch to melee until resupplied

  const baseDir = aimDirection(player, enemies);
  const count = weapon.count ?? 1;
  const spread =
    weapon.category === 'shotgun' ? 0.5 :
    count > 1 ? 0.12 : 0;
  const size = weapon.projectileSize || 8;
  const speed = weapon.projectileSpeed || 520;

  const projectiles: Projectile[] = [];
  for (let i = 0; i < count; i++) {
    let pd = { ...baseDir };
    if (count > 1 && spread > 0) {
      const angle = -spread * (count - 1) / 2 + i * spread;
      pd = rotate(baseDir, angle);
    }
    const crit = Math.random() < (player.critChance || 0);
    projectiles.push({
      id: `proj-${weapon.id}-${now}-${i}`,
      x: player.x + player.width / 2 - size / 2,
      y: player.y + player.height / 2 - size / 2,
      width: size,
      height: size,
      speed,
      damage: weapon.damage * (crit ? 1.5 : 1),
      direction: pd,
      weaponType: weapon.category as WeaponType, // 'handgun' | 'shotgun' | 'rifle'
      duration: 1400,
      createdAt: now,
      passthrough: weapon.passthrough || false,
      hitEnemies: [],
      hostile: false,
      reflected: false,
      crit
    });
  }

  // Burn one round and record the fire time in a single commit.
  useGameStore.setState(state => ({
    player: {
      ...state.player,
      [field]: Math.max(0, state.player[field] - 1),
      weapons: state.player.weapons.map(w =>
        w.id === weapon.id ? { ...w, lastFired: now } : w
      )
    }
  }));

  return projectiles;
};

export const getWeaponDisplayName = (key: string): string =>
  CATALOG[key]?.name ?? '武器';

export const getWeaponShortName = (type: WeaponType): string => {
  switch (type) {
    case 'handgun': return 'ハンドガン';
    case 'shotgun': return 'ショットガン';
    case 'rifle':   return 'ライフル';
    case 'knife':   return 'ナイフ';
    case 'hatchet': return '鉈';
    case 'machete': return 'マチェーテ';
    default:        return '武器';
  }
};
