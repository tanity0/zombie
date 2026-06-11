// Game state types
export type GameState = 'menu' | 'loading' | 'playing' | 'paused' | 'gameOver' | 'victory';

// Character class types
export type CharacterClass = 'warrior' | 'mage' | 'rogue' | 'necromancer';

// Player types
export interface Player {
  x: number;
  y: number;
  // Velocity (px/s). Movement is smoothed toward the input target so the player
  // has ~0.3s of inertia on starting, stopping, and turning.
  vx: number;
  vy: number;
  width: number;
  height: number;
  speed: number;
  health: number;
  maxHealth: number;
  experience: number;
  level: number;
  experienceToNextLevel: number;
  weapons: Weapon[];
  // Id of the currently-active gun (the one that auto-fires). The player can
  // hold up to one gun per category plus a melee weapon, and switch between
  // guns via the HUD; an empty pool auto-switches to a gun that still has ammo.
  activeWeaponId: string;
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
  // RE-style resources. Each gun family has a category-specific RESERVE pool
  // (these fields). A gun fires from its own loaded magazine and reloads from
  // this reserve; an empty reserve means no more reloads for that family.
  ammoHandgun: number;
  ammoShotgun: number;
  ammoRifle: number;
  // Level-up crit bonus [0, 0.30]. Gun shots add this to the weapon's base
  // crit chance; melee uses its weapon crit chance directly.
  critChance: number;
  // Temporary quick-magazine reload buff. While gameTime is below this value,
  // gun shots gain a small extra crit chance.
  quickMagCritUntil: number;
  // Reload state. While reloadEndsAt is in the future the named gun is being
  // reloaded: it can't fire, while movement can be tuned by the reload
  // movement multiplier in the store. 0 / '' when not reloading.
  reloadEndsAt: number;
  reloadingWeaponId: string;
  // Level-up modifiers applied to ALL owned guns: magBonus adds to every gun's
  // magazine capacity; reloadMult scales reload time (<1 = faster).
  magBonus: number;
  reloadMult: number;
  // Temporary sub-weapon skill test bed. Keys are unlocked by level-up cards;
  // cooldowns are gameTime timestamps, so they pause with the game.
  subWeapons: SubWeaponKey[];
  subWeaponLevels: Partial<Record<SubWeaponKey, number>>;
  subWeaponCooldowns: Partial<Record<SubWeaponKey, number>>;
  huntingChargeStartedAt: number;
  huntingCharged: boolean;
  // Katana (刀) sub-weapon dash state. While katanaDashUntil is in the future
  // the player ignores input and travels along the dash direction while
  // invulnerable. The cooldown gates only the next dash — normal movement and
  // the katana auto-slash continue during it.
  katanaDashUntil: number;
  katanaDashDirX: number;
  katanaDashDirY: number;
  katanaDashCooldownEnd: number;
  // 一閃の着地後に動けない硬直(後隙)が切れる時刻。刀・村雨共通。
  // 着地(katanaDashUntil)から KATANA_DASH_RECOVERY_MS の間は移動も次の一閃も不可。
  katanaRecoveryUntil: number;
  // In-run currency. Spent during the current play only.
  straps: number;
  // One-shot revive stock from the in-run vaccine shop item.
  vaccineRevives: number;
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
  // Chase velocity (px/s), smoothed toward the heading so enemies have ~0.3s of
  // inertia and curve into turns instead of snapping.
  vx?: number;
  vy?: number;
  // Knockback state. While knockbackUntil is in the future the enemy is
  // pushed by (knockbackVx, knockbackVy) instead of chasing the player.
  // All three are absent on most enemies most of the time.
  knockbackUntil?: number;
  knockbackVx?: number;
  knockbackVy?: number;
  // Melee-knockback debounce: an enemy shoved by a counter can't be shoved
  // again until this gameless ms timestamp (damage still applies). Prevents
  // infinite knockback-locking.
  knockbackImmuneUntil?: number;
  // Stun state (gameTime-based so it survives pauses). While
  // gameTime < stunUntil the enemy stops moving and can be finished with
  // a melee counter for an instant kill.
  stunUntil?: number;
  // Root state from traps. This only stops movement; it does not make the
  // enemy a critical/finisher target.
  rootUntil?: number;
  // Visual-only lift reaction for boss melee finisher-grade hits.
  liftUntil?: number;
  // Spawn bookkeeping for the enemy-cap culler. Scripted-wave enemies get
  // a short grace period before they become eligible for culling so big
  // set-piece hordes aren't deleted the instant they appear.
  spawnedAt?: number; // gameTime ms when spawned
  isWave?: boolean;
  // Difficulty metadata. Time and distance from the game origin both feed this
  // at spawn time. Renderer uses rank for lightweight ornaments; gameplay uses multiplier.
  distanceZone?: number;
  difficultyRank?: DifficultyRank;
  difficultyMultiplier?: number;
}

export type DifficultyRank = 'normal' | 'strong' | 'elite' | 'danger';

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
  // Magazine state (guns only; undefined for melee). `magazine` is the rounds
  // currently loaded, `magSize` the base capacity, `reloadMs` the base reload
  // time. Firing drains `magazine`; reloads refill it from the reserve pool.
  magazine?: number;
  magSize?: number;
  reloadMs?: number;
  // RE-style classification. Guns belong to a category that shares an ammo
  // pool; tier (1-3) controls power within the category. Melee weapons set
  // isMelee and don't consume ammo (they're triggered by the counter).
  category?: WeaponCategory;
  tier?: number;
  isMelee?: boolean;
  ammoType?: AmmoType;
  // Fixed/base crit chance for this weapon. Guns add the player's level-up
  // crit bonus at fire time; melee weapons use this directly.
  critChance?: number;
  // Enemies a fired round passes through (piercing guns). Undefined = none /
  // unlimited depending on `passthrough`.
  pierce?: number;
  // Catalog key (e.g. 'handgun-t1') so drops/crates can re-create the weapon.
  key?: string;
}

// Gun families. Each shares an ammo pool with the matching AmmoType.
export type WeaponCategory = 'handgun' | 'shotgun' | 'rifle';
export type AmmoType = WeaponCategory;

// Projectile/weapon kinds. Guns use their category as the projectile type;
// melee weapons never spawn projectiles (handled by the counter). enemy_bolt
// is the hostile seed/bolt enemies spit.
export type WeaponType = WeaponCategory | 'knife' | 'hatchet' | 'machete' | 'enemy_bolt' | 'grenade' | 'trap';
export type SubWeaponKey = 'heavy-grenade' | 'marksman-trap' | 'striker-quick-mag' | 'striker-hunting' | 'dog' | 'katana' | 'murasame';
export type ShopItemKey =
  | 'ammo-handgun'
  | 'ammo-shotgun'
  | 'ammo-rifle'
  | 'dog'
  | 'class-skill'
  | 'medkit'
  | 'vaccine';

export interface WeaponMerchant {
  x: number;
  y: number;
  radius: number;
}

export type EventQuestStatus = 'available' | 'accepted' | 'completed';

export interface EventQuestNpc {
  x: number;
  y: number;
  radius: number;
  status: EventQuestStatus;
  questIndex: number;
  fadeStartedAt: number;
}

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
  weaponKey?: string;
  duration: number;
  createdAt: number;
  passthrough: boolean;
  hitEnemies: string[];
  // For piercing rounds: how many enemies the shot may pass THROUGH before it
  // despawns (so pierce:1 hits two enemies). Undefined = unlimited (the old
  // passthrough behavior for sniper/grenade).
  pierce?: number;
  hostile: boolean;
  reflected: boolean;
  // Gun crit flag — set when the shot rolled a critical. Crits hit harder
  // and stun whatever they connect with.
  crit?: boolean;
  area?: number;
  count?: number;
  // Optional motion modifiers. Axes set `gravity` so they arc upward then
  // fall. Bibles use the orbit fields to circle the player continuously.
  // `followsPlayer` snaps the projectile to the player every frame (garlic).
  gravity?: number;
  orbitRadius?: number;
  orbitAngle?: number;
  orbitSpeed?: number;
  followsPlayer?: boolean;
  // Visual-only slide after a shoved static projectile (currently traps).
  // Gameplay position jumps to x/y immediately; renderer interpolates from
  // shoveStart* to the new x/y for a short seamless push-out.
  shoveStartX?: number;
  shoveStartY?: number;
  shoveStartAt?: number;
  shoveDuration?: number;
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
  // Optional art variant. Treasure uses 1-6 to select the supplied object art.
  variant?: number;
  // Optional short throw arc for spawned pickups. Used by Striker's magazine
  // so the item visibly pops out from the player before landing.
  throwFromX?: number;
  throwFromY?: number;
  throwStartAt?: number;
  throwDuration?: number;
  scatterRadius?: number;
}

export interface BreakableProp {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  footX: number;
  footY: number;
  scale: number;
  health: number;
  maxHealth: number;
  type: BreakablePropType;
  lastHit: number;
}

export type BreakablePropType = 'torch' | 'mine';

export interface CastleEvent {
  x: number;
  y: number;
  bossSpawned: boolean;
}

export type PickupType =
  | 'experience' | 'health' | 'magnet' | 'bomb' | 'chest'
  | 'strap' | 'treasure'
  | 'ammo-handgun' | 'ammo-shotgun' | 'ammo-rifle'
  | 'weapon-drop' | 'weapon-crate' | 'quick-magazine';

// Upgrade options
export interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  type: 'weapon' | 'passive' | 'subWeapon';
  weaponType?: WeaponType;
  passiveType?: PassiveType;
  subWeaponKey?: SubWeaponKey;
  level: number;
}

export type PassiveType = 'maxHealth' | 'speed' | 'might' | 'area' | 'cooldown' | 'duration' | 'magSize' | 'reloadSpeed' | 'critChance';

// Game statistics
export interface GameStats {
  timeAlive: number;
  enemiesKilled: number;
  damageDealt: number;
  experienceCollected: number;
  maxLevel: number;
  maxCombo: number;
  strapsCollected: number;
  strapsSpent: number;
  treasuresCollected: number;
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
      liquid?: boolean;
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
      // Optional override text (e.g. "+30" for ammo pickups, "Kill!"/"Counter!"
      // callouts). Falls back to the numeric value when absent.
      text?: string;
      // Optional font scale multiplier (callouts use a larger value).
      scale?: number;
      // Optional serif/mincho font (e.g. the katana "斬" callout).
      serif?: boolean;
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
    }
  | {
      kind: 'dogFetch';
      id: string;
      fromX: number; fromY: number;
      targetX: number; targetY: number;
      toX: number; toY: number;
      createdAt: number;
      pickupAt: number;
      duration: number;
    }
  | {
      // Fixed-radius radial light that fades in place (no expansion). Used to
      // flash the counter's reach when it fires.
      kind: 'glow';
      id: string;
      x: number; y: number;
      radius: number;
      color: string;          // base rgb, e.g. 'rgba(251,191,36,'  — alpha appended
      createdAt: number;
      duration: number;
    }
  | {
      // A short slash streak drawn on an enemy struck in melee.
      kind: 'slash';
      id: string;
      x: number; y: number;
      angle: number;          // radians
      length: number;
      color: string;
      createdAt: number;
      duration: number;
    };
