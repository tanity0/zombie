// Game state types
export type GameState = 'menu' | 'playing' | 'paused' | 'gameOver';

// Character class types
export type CharacterClass = 'warrior' | 'mage' | 'rogue' | 'necromancer';

// Player types
export interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  health: number;
  maxHealth: number;
  experience: number;
  level: number;
  experienceToNextLevel: number;
  weapons: Weapon[];
  characterClass: CharacterClass;
  direction: Direction;
  isMoving: boolean;
  invulnerable: boolean;
  invulnerableTime: number;
  lastDirection: { x: number; y: number } | null;
  // Counter-on-release state. Releasing the touch opens a brief window
  // during which any incoming hostile projectile is reflected.
  counterWindowEnd: number;     // ms timestamp; window is open while now <= this
  counterCooldownEnd: number;   // ms timestamp; cannot open another window until this
  lastCounterSuccessTime: number; // for the success flash effect
  // RE-style resources. Guns draw from a category-specific ammo pool;
  // running a pool dry stops that gun firing (melee always works).
  ammoHandgun: number;
  ammoShotgun: number;
  ammoRifle: number;
  // Chance [0,1] that a gun hit crits — crits deal extra damage and stun
  // the target so it can be finished with the melee counter.
  critChance: number;
  // Shot "hitstop": movement is frozen until this ms timestamp, set briefly
  // each time a gun fires so shooting has weight. 0 = not frozen.
  moveFrozenUntil: number;
}

// Movement direction
export type Direction = 'up' | 'down' | 'left' | 'right' | 'idle';

// Enemy types
export interface Enemy {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  health: number;
  maxHealth: number;
  damage: number;
  type: EnemyType;
  experienceValue: number;
  lastHit: number;
  lastShot: number;
  // Knockback state. While knockbackUntil is in the future the enemy is
  // pushed by (knockbackVx, knockbackVy) instead of chasing the player.
  // All three are absent on most enemies most of the time.
  knockbackUntil?: number;
  knockbackVx?: number;
  knockbackVy?: number;
  // Stun state (gameTime-based so it survives pauses). While
  // gameTime < stunUntil the enemy stops moving and can be finished with
  // a melee counter for an instant kill.
  stunUntil?: number;
  // Spawn bookkeeping for the enemy-cap culler. Scripted-wave enemies get
  // a short grace period before they become eligible for culling so big
  // set-piece hordes aren't deleted the instant they appear.
  spawnedAt?: number; // gameTime ms when spawned
  isWave?: boolean;
}

export type EnemyType =
  | 'bat'        // ubiquitous low-HP swarmer
  | 'skeleton'   // standard melee chaser
  | 'zombie'     // slow tank
  | 'plant'     // near-stationary ranged seed-spitter
  | 'ghost'     // fast translucent melee
  | 'werewolf'  // mid-game fast bruiser
  | 'pumpkin'   // elite (wave events)
  | 'giantbat'  // mini-boss every ~10 minutes
  | 'reaper';   // terminal entity at 30:00

// Weapon types
export interface Weapon {
  id: string;
  name: string;
  type: WeaponType;
  damage: number;
  cooldown: number;
  lastFired: number;
  level: number;
  projectileSpeed?: number;
  projectileSize?: number;
  area?: number;
  duration?: number;
  passthrough?: boolean;
  count?: number;
  // RE-style classification. Guns belong to a category that shares an ammo
  // pool; tier (1-3) controls power within the category. Melee weapons set
  // isMelee and don't consume ammo (they're triggered by the counter).
  category?: WeaponCategory;
  tier?: number;
  isMelee?: boolean;
  ammoType?: AmmoType;
  // Catalog key (e.g. 'handgun-t1') so drops/crates can re-create the weapon.
  key?: string;
}

// Gun families. Each shares an ammo pool with the matching AmmoType.
export type WeaponCategory = 'handgun' | 'shotgun' | 'rifle';
export type AmmoType = WeaponCategory;

// Projectile/weapon kinds. Guns use their category as the projectile type;
// melee weapons never spawn projectiles (handled by the counter). enemy_bolt
// is the hostile seed/bolt enemies spit.
export type WeaponType = WeaponCategory | 'knife' | 'hatchet' | 'machete' | 'enemy_bolt';

// Projectile types
export interface Projectile {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  damage: number;
  direction: { x: number; y: number };
  weaponType: WeaponType;
  duration: number;
  createdAt: number;
  passthrough: boolean;
  hitEnemies: string[];
  hostile: boolean;
  reflected: boolean;
  // Gun crit flag — set when the shot rolled a critical. Crits hit harder
  // and stun whatever they connect with.
  crit?: boolean;
  // Optional motion modifiers. Axes set `gravity` so they arc upward then
  // fall. Bibles use the orbit fields to circle the player continuously.
  // `followsPlayer` snaps the projectile to the player every frame (garlic).
  gravity?: number;
  orbitRadius?: number;
  orbitAngle?: number;
  orbitSpeed?: number;
  followsPlayer?: boolean;
}

// Pickup types
export interface Pickup {
  id: string;
  x: number;
  y: number;
  type: PickupType;
  value: number;
  // For 'weapon-drop': the catalog key of the dropped weapon. For
  // 'weapon-crate' this is left undefined (the weapon is rolled on open).
  weaponKey?: string;
  // True for supplies air-dropped onto the map at a random off-screen spot
  // (as opposed to dropping where an enemy died). These get a VS-style edge
  // arrow pointing the player toward them while they're off-screen.
  worldDrop?: boolean;
}

export type PickupType =
  | 'experience' | 'health' | 'magnet' | 'bomb' | 'chest'
  | 'ammo-handgun' | 'ammo-shotgun' | 'ammo-rifle'
  | 'weapon-drop' | 'weapon-crate';

// Upgrade options
export interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  type: 'weapon' | 'passive';
  weaponType?: WeaponType;
  passiveType?: PassiveType;
  level: number;
}

export type PassiveType = 'maxHealth' | 'speed' | 'might' | 'area' | 'cooldown' | 'duration' | 'amount' | 'critChance';

// Game statistics
export interface GameStats {
  timeAlive: number;
  enemiesKilled: number;
  damageDealt: number;
  experienceCollected: number;
  maxLevel: number;
}

// Input state — keyboard fallback only. Touch is handled directly by the
// VirtualJoystick component via swipeDirection.
export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

// Game area bounds
export interface GameBounds {
  width: number;
  height: number;
}

// Visual-only effects. The game loop spawns these and never reads them back;
// only the renderer consumes them. They have no gameplay impact.
export type VisualEffect =
  | {
      kind: 'particle';
      id: string;
      x: number; y: number;
      vx: number; vy: number;
      color: string;
      size: number;
      createdAt: number;
      duration: number;
      drag?: number;
    }
  | {
      kind: 'damageNumber';
      id: string;
      x: number; y: number;
      value: number;
      color: string;
      createdAt: number;
      duration: number;
      crit?: boolean;
    }
  | {
      kind: 'ring';
      id: string;
      x: number; y: number;
      startRadius: number;
      endRadius: number;
      color: string;
      width: number;
      createdAt: number;
      duration: number;
    }
  | {
      kind: 'flash';
      id: string;
      color: string;          // e.g. 'rgba(255,255,255,0.8)' — overlays whole screen
      createdAt: number;
      duration: number;
    }
  | {
      kind: 'trail';
      id: string;
      // Animated line from (fromX,fromY) toward player; rendered as a fading
      // streak that moves with the magnet pull.
      fromX: number; fromY: number;
      toX: number; toY: number;
      color: string;
      createdAt: number;
      duration: number;
    };