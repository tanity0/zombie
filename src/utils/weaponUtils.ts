import { Weapon, CharacterClass, WeaponType, Projectile, Player, Enemy, AmmoType } from '../types/game';
import { useGameStore } from '../store/gameStore';
import { PLAYER_PROFILES } from '../data/playerProfiles';

// Global muzzle-velocity multiplier. Bullets leave the barrel faster so shots
// feel snappier and reach their target sooner.
const PROJECTILE_SPEED_MULT = 1.5;
const SHOTGUN_SPREAD_CONE_RAD_BY_TIER: Record<number, number> = {
  1: 1.00,
  2: 0.70,
  3: 0.36,
};
const TIER_CRIT_STEP = 0.03;
const BASE_CRIT_BY_CATEGORY: Record<AmmoType, number> = {
  handgun: 0.10,
  shotgun: 0.05,
  rifle: 0.20,
};

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
  magSize?: number;      // magazine capacity (rounds loaded); omit for melee
  reloadMs?: number;     // reload duration; heavier guns reload slower
  critChance?: number;   // fixed crit chance (melee weapons)
  pierce?: number;       // enemies the round passes through (piercing guns)
}

const CATALOG: Record<string, WeaponDef> = {
  // A — Handgun family (9mm). Fast, low damage, cheap to feed.
  'handgun-t1':       { key: 'handgun-t1', name: 'ハンドガン',     type: 'handgun', category: 'handgun', tier: 1, damage: 9,  cooldown: 420, projectileSpeed: 520, projectileSize: 8, count: 1, magSize: 12, reloadMs: 900 },
  'handgun-t2':       { key: 'handgun-t2', name: '二丁ハンドガン', type: 'handgun', category: 'handgun', tier: 2, damage: 9,  cooldown: 300, projectileSpeed: 520, projectileSize: 8, count: 2, magSize: 10, reloadMs: 1100 },
  'handgun-t3':       { key: 'handgun-t3', name: 'マシンピストル', type: 'handgun', category: 'handgun', tier: 3, damage: 7,  cooldown: 130, projectileSpeed: 560, projectileSize: 7, count: 1, magSize: 30, reloadMs: 1300 },

  // B — Shotgun family (12g). One trigger pull = one shell (the spread is free),
  // so the magazine is sized in SHOTS, not pellets (3 shots per mag).
  'shotgun-t1':       { key: 'shotgun-t1', name: 'ソードオフ',     type: 'shotgun', category: 'shotgun', tier: 1, damage: 6,  cooldown: 950, projectileSpeed: 440, projectileSize: 7, count: 5, magSize: 3, reloadMs: 1100 },
  'shotgun-t2':       { key: 'shotgun-t2', name: 'ポンプ式',       type: 'shotgun', category: 'shotgun', tier: 2, damage: 7,  cooldown: 780, projectileSpeed: 470, projectileSize: 7, count: 6, magSize: 3, reloadMs: 1800 },
  'shotgun-t3':       { key: 'shotgun-t3', name: 'オートショット', type: 'shotgun', category: 'shotgun', tier: 3, damage: 6,  cooldown: 430, projectileSpeed: 480, projectileSize: 7, count: 7, magSize: 3, reloadMs: 1700 },

  // C — Rifle/Magnum family (.44). Heavy single rounds. The revolver pierces
  // one enemy; higher tiers pierce freely.
  'rifle-t1':         { key: 'rifle-t1',   name: 'マグナム',       type: 'rifle',   category: 'rifle',   tier: 1, damage: 30, cooldown: 800,  projectileSpeed: 700,  projectileSize: 9,  count: 1, magSize: 6, reloadMs: 1500, passthrough: true, pierce: 1 },
  'rifle-t2':         { key: 'rifle-t2',   name: 'スナイパー',     type: 'rifle',   category: 'rifle',   tier: 2, damage: 55, cooldown: 1100, projectileSpeed: 1000, projectileSize: 8,  count: 1, passthrough: true, magSize: 5, reloadMs: 2000 },
  'rifle-t3':         { key: 'rifle-t3',   name: 'グレネードランチャー', type: 'rifle', category: 'rifle', tier: 3, damage: 95, cooldown: 1400, projectileSpeed: 420, projectileSize: 14, count: 1, passthrough: true, magSize: 1, reloadMs: 2200 },

  // Melee (no ammo). Lower DPS than guns by design so bullets stay valuable.
  // Each carries a fixed crit chance that rises with tier.
  'knife-t1':         { key: 'knife-t1',   name: 'ナイフ',         type: 'knife',   tier: 1, isMelee: true, damage: 8,  cooldown: 0, critChance: 0.05 },
  'hatchet-t2':       { key: 'hatchet-t2', name: 'ダガー',         type: 'hatchet', tier: 2, isMelee: true, damage: 14, cooldown: 0, critChance: 0.08 },
  'machete-t3':       { key: 'machete-t3', name: 'ファイティングナイフ', type: 'machete', tier: 3, isMelee: true, damage: 20, cooldown: 0, critChance: 0.12 }
};

const weaponBaseCritChance = (def: WeaponDef): number | undefined => {
  if (def.critChance !== undefined) return def.critChance;
  if (!def.category) return undefined;
  return BASE_CRIT_BY_CATEGORY[def.category] + Math.max(0, def.tier - 1) * TIER_CRIT_STEP;
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
    magSize: def.magSize,
    magazine: def.magSize, // a fresh gun starts fully loaded
    reloadMs: def.reloadMs,
    critChance: weaponBaseCritChance(def),
    pierce: def.pierce,
    category: def.category,
    tier: def.tier,
    isMelee: def.isMelee,
    ammoType: def.category,
    key: def.key
  };
};

export const getWeaponDef = (key: string): WeaponDef | undefined => CATALOG[key];

// All guns the player owns (excludes the melee weapon).
export const getGuns = (player: Player): Weapon[] =>
  player.weapons.filter(w => !w.isMelee);

// The active gun: the one matching activeWeaponId, falling back to the first
// gun owned (or undefined if the player somehow has none).
export const getActiveGun = (player: Player): Weapon | undefined => {
  const guns = getGuns(player);
  return guns.find(w => w.id === player.activeWeaponId) ?? guns[0];
};

// Player-state RESERVE pool value for an ammo type.
export const ammoPoolFor = (player: Player, type: AmmoType): number =>
  player[AMMO_FIELD[type]];

// Magazine capacity including the player's global 装填数アップ bonus.
export const effectiveMagSize = (w: Weapon, p: Player): number =>
  (w.magSize ?? 0) + (w.magSize != null ? p.magBonus : 0);

// Global reload-time multiplier — reloads take this much longer at baseline so
// being caught empty is a real commitment.
const RELOAD_TIME_MULT = 2;

// Reload duration including the global multiplier and the player's リロード時間
// 短縮 upgrade.
export const effectiveReloadMs = (w: Weapon, p: Player): number =>
  Math.max(250, (w.reloadMs ?? 0) * RELOAD_TIME_MULT * p.reloadMult);

// Is this specific gun currently mid-reload?
export const isReloading = (p: Player, weaponId: string): boolean =>
  p.reloadingWeaponId === weaponId && Date.now() < p.reloadEndsAt;

// Starting loadout: one gun + one melee weapon from the class profile.
export const getStartingWeapons = (characterClass: CharacterClass): Weapon[] => {
  const profile = PLAYER_PROFILES[characterClass] ?? PLAYER_PROFILES.warrior;
  return [createWeapon(profile.gunKey), createWeapon(profile.meleeKey)];
};

// Effective firing range per gun family (px). A gun only fires when an enemy
// is within this reach, so the player doesn't burn rounds into empty space.
// RE-flavored: shotgun is close-quarters, rifle reaches far, handgun is mid.
export const RANGE_BY_CATEGORY: Record<AmmoType, number> = {
  handgun: 176,
  shotgun: 120,
  rifle: 312
};

// A stunned enemy is a low-priority target — the player should be putting
// rounds into the threats that are still moving, not the one already frozen
// for a melee finish.
const isStunned = (e: Enemy, gameTime: number): boolean =>
  e.stunUntil !== undefined && gameTime < e.stunUntil;

// Choose the gun's target: the nearest NON-stunned enemy, only falling back to
// a stunned one when every enemy on the field is stunned. Returns null if the
// field is empty.
const pickTarget = (player: Player, enemies: Enemy[]): Enemy | null => {
  const gameTime = useGameStore.getState().gameTime;
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;
  let best: Enemy | null = null;
  let bestD2 = Infinity;
  let bestStunned: Enemy | null = null;
  let bestStunnedD2 = Infinity;
  for (const e of enemies) {
    const dx = e.x + e.width / 2 - pcx;
    const dy = e.y + e.height / 2 - pcy;
    const d2 = dx * dx + dy * dy;
    if (isStunned(e, gameTime)) {
      if (d2 < bestStunnedD2) { bestStunnedD2 = d2; bestStunned = e; }
    } else if (d2 < bestD2) {
      bestD2 = d2; best = e;
    }
  }
  return best ?? bestStunned;
};

// Distance from the player center to the gun's chosen target, or Infinity when
// the field is empty (used by the range gate).
const nearestEnemyDistance = (player: Player, enemies: Enemy[]): number => {
  const target = pickTarget(player, enemies);
  if (!target) return Infinity;
  const dx = target.x + target.width / 2 - (player.x + player.width / 2);
  const dy = target.y + target.height / 2 - (player.y + player.height / 2);
  return Math.sqrt(dx * dx + dy * dy);
};

// Aim helper: point at the chosen target, falling back to the last movement
// direction (then straight up) when the field is empty.
const aimDirection = (player: Player, enemies: Enemy[]): { x: number; y: number } => {
  const closest = pickTarget(player, enemies);
  if (closest) {
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
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

  // Can't fire while reloading, or with an empty magazine. Reloads are kicked
  // off by autoSwitchIfDry/startReload, not here — firing just stops.
  if (isReloading(player, weapon.id)) return [];
  if ((weapon.magazine ?? 0) <= 0) return [];

  // Range gate: hold fire (and ammo) unless an enemy is within reach. Don't
  // advance lastFired here so the gun fires the instant a target enters range.
  if (nearestEnemyDistance(player, enemies) > RANGE_BY_CATEGORY[weapon.ammoType]) {
    return [];
  }

  const baseDir = aimDirection(player, enemies);
  const count = weapon.count ?? 1;
  const shotgunSpread = SHOTGUN_SPREAD_CONE_RAD_BY_TIER[weapon.tier ?? 1] ?? SHOTGUN_SPREAD_CONE_RAD_BY_TIER[1];
  const spreadStep = weapon.category === 'shotgun'
    ? (count > 1 ? shotgunSpread / (count - 1) : 0)
    : count > 1 ? 0.12 : 0;
  const size = weapon.projectileSize || 8;
  const speed = (weapon.projectileSpeed || 520) * PROJECTILE_SPEED_MULT;

  const projectiles: Projectile[] = [];
  for (let i = 0; i < count; i++) {
    let pd = { ...baseDir };
    if (count > 1 && spreadStep > 0) {
      const angle = -spreadStep * (count - 1) / 2 + i * spreadStep;
      pd = rotate(baseDir, angle);
    }
    const critChance = Math.min(1, (weapon.critChance ?? 0) + (player.critChance || 0));
    const crit = Math.random() < critChance;
    projectiles.push({
      id: `proj-${weapon.id}-${now}-${i}`,
      x: player.x + player.width / 2 - size / 2,
      y: player.y + player.height / 2 - size / 2,
      width: size,
      height: size,
      speed,
      // Base damage only — the crit multiplier is applied at hit time so it can
      // scale differently against bosses (×5) vs normal enemies (×1.5).
      damage: weapon.damage,
      direction: pd,
      weaponType: weapon.category as WeaponType, // 'handgun' | 'shotgun' | 'rifle'
      weaponKey: weapon.key,
      duration: 1400,
      createdAt: now,
      passthrough: weapon.passthrough || false,
      hitEnemies: [],
      pierce: weapon.pierce,
      hostile: false,
      reflected: false,
      crit
    });
  }

  // Drain the magazine and record the fire time. One trigger pull = one round
  // for EVERY family, including the shotgun (a shell fires the whole pellet
  // spread for a single round).
  const consume = 1;
  useGameStore.setState(state => ({
    player: {
      ...state.player,
      weapons: state.player.weapons.map(w =>
        w.id === weapon.id
          ? { ...w, lastFired: now, magazine: Math.max(0, (w.magazine ?? 0) - consume) }
          : w
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
    case 'hatchet': return 'ダガー';
    case 'machete': return 'ファイティングナイフ';
    default:        return '武器';
  }
};
