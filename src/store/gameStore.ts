import { create } from 'zustand';
import { generateUpgradeOptions } from '../utils/upgradeUtils';
import {
  Player, Enemy, Projectile, Pickup, BreakableProp, GameStats,
  InputState, UpgradeOption, GameBounds, CharacterClass,
  VisualEffect, AmmoType, Direction, SubWeaponKey
} from '../types/game';
import { getStartingWeapons, createWeapon, AMMO_FIELD, getActiveGun, getGuns, ammoPoolFor, effectiveMagSize, effectiveReloadMs } from '../utils/weaponUtils';
import { openCrate, rollWeaponKey } from '../utils/weaponDrop';
import { isBossType } from '../utils/enemyUtils';
import { resolveTreeCollision, treesInRegion, trunkRect } from '../world/trees';
import { resolveTorchCollision, torchRect, torchesInRegion } from '../world/torches';
import { mineAmbushAround, mineRect, minesInRegion, pressureMinesNearPlayer } from '../world/mines';
import type { MineAmbushAnchor } from '../world/mines';
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { rectsOverlap } from '../world/obstacles';

// RE-style ammo economy. Guns fire from a per-gun magazine and reload from
// these per-family RESERVE pools. The reserve starts large (you're well
// stocked) but ammo is hard to find, so the run is a slow drain on it.
export const AMMO_INITIAL: Record<AmmoType, number> = { handgun: 60, shotgun: 40, rifle: 24 };
export const AMMO_MAX: Record<AmmoType, number> = { handgun: 240, shotgun: 96, rifle: 60 };
// How much a world/melee ammo pickup grants for each family (enemy drops, air
// drops, and the boxes melee kills now drop). Modest relative to the reserve
// cap — resupply is scarce.
export const AMMO_PICKUP: Record<AmmoType, number> = { handgun: 40, shotgun: 10, rifle: 20 };

// Player-tunable melee ammo-drop rate (percent), set on the start screen and
// persisted across reloads. A melee kill drops ammo at this rate; a melee
// finisher rolls at 1.5× (capped at 100%). Counter (reflect) kills are separate.
const DROP_PCT_KEY = 'zombie:meleeAmmoDropPercent';
const AMMO_PICKUP_KEY = 'zombie:ammoPickupAmounts';
export const DEFAULT_MELEE_DROP_PCT = 50;
// `finish` = a melee finisher executed a normal enemy, or finisher-grade
// damage landed on a stunned boss (drives the kill.mp3 sound).
// `killed` = how many enemies the swing killed (drives the zombie death grunt).
export type CounterTriggerResult = { swung: boolean; hit: boolean; finish: boolean; killed: number };
export const clampDropPct = (n: number): number =>
  Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : DEFAULT_MELEE_DROP_PCT)));
const loadMeleeDropPct = (): number => {
  try {
    const v = localStorage.getItem(DROP_PCT_KEY);
    return v != null ? clampDropPct(parseFloat(v)) : DEFAULT_MELEE_DROP_PCT;
  } catch {
    return DEFAULT_MELEE_DROP_PCT;
  }
};
export const clampAmmoPickupAmount = (n: number): number =>
  Math.max(0, Math.min(999, Math.round(Number.isFinite(n) ? n : 0)));
const loadAmmoPickupAmounts = (): Record<AmmoType, number> => {
  try {
    const raw = localStorage.getItem(AMMO_PICKUP_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<Record<AmmoType, number>> : {};
    return {
      handgun: clampAmmoPickupAmount(parsed.handgun ?? AMMO_PICKUP.handgun),
      shotgun: clampAmmoPickupAmount(parsed.shotgun ?? AMMO_PICKUP.shotgun),
      rifle: clampAmmoPickupAmount(parsed.rifle ?? AMMO_PICKUP.rifle)
    };
  } catch {
    return { ...AMMO_PICKUP };
  }
};

// Light knockback applied to a normal enemy each time a bullet connects.
// Guns shove only half as hard as the melee counter's push.
export const BULLET_KNOCKBACK_SPEED = 64;

// Crit → stun duration (gameTime ms). A stunned enemy is a finisher target.
export const STUN_DURATION_MS = 5000;
export const CRIT_DAMAGE_MULT = 1.5;
// Bosses use a beefier crit ruleset: gun crits hit 5×, and meleeing a stunned
// boss deals 5× melee damage (and shakes off the stun) instead of an instakill.
export const BOSS_CRIT_DAMAGE_MULT = 5;
export const BOSS_MELEE_STUN_MULT = 5;
// Melee reach for the finger-release counter swing.
export const MELEE_RADIUS = 74;

// Counter-on-release tuning. The counter window opens the moment the player
// lifts their finger (or presses Space on PC) and stays open briefly. Any
// hostile projectile that hits the player during the window is reflected.
export const COUNTER_WINDOW = 400; // ms the window stays open after trigger
export const COUNTER_COOLDOWN = 420; // ms between counters (anti-spam)
// Each successful reflect refreshes the window by this much so a chained
// barrage can be turned back in full. No hard cap — the cooldown still
// kicks in once the chain finally lapses.
export const COUNTER_EXTEND_PER_HIT = 200;

// Counter knockback (additional effect on top of the bullet reflect).
// Two radii: HIT_RADIUS is where enemies actually get pushed; RING_RADIUS
// is the visual telegraph (wider). Keeping the telegraph wide lets the
// player read the attack while the actual catch zone stays disciplined.
export const KNOCKBACK_HIT_RADIUS = 55;
export const KNOCKBACK_RING_RADIUS = 180;
export const KNOCKBACK_SPEED = 200; // melee counter shove (halved again)
export const KNOCKBACK_DURATION = 280;
// After being shoved by a melee counter, an enemy is immune to further melee
// knockback for this long (damage still lands) so it can't be locked forever.
export const KNOCKBACK_IMMUNE_MS = 1750;
export const REFLECT_DAMAGE_MULTIPLIER = 60.0; // countered bullets hit 5× harder
export const REFLECT_SPEED_MULTIPLIER = 1.8;

// Hitstop: a melee finisher freezes the whole game briefly for impact.
export const HITSTOP_MS = 300;
// Screen-shake duration when the player takes damage.
export const SHAKE_MS = 280;
// Inertia time constants (s). Velocity eases toward its target over this
// window. The player is now instant (0 = no inertia, snappy control); enemies
// keep 0.3s so they curve into turns instead of snapping.
export const PLAYER_INERTIA_TAU = 0;
export const ENEMY_INERTIA_TAU = 0.3;

// Easing factor for a given time constant. tau <= 0 means instant (alpha = 1).
const inertiaAlpha = (deltaTime: number, tau: number): number =>
  tau <= 0 ? 1 : 1 - Math.exp(-deltaTime / tau);

// Player base stats tuned to feel like Vampire Survivors' Antonio: slower
// than the previous build (so weapons matter more), modest HP, small body.
export const PLAYER_BASE_SPEED = 87;
export const PLAYER_BASE_HP = 120;
export const PLAYER_HITBOX = 28;
export const INVULN_MS = 700;

// World is effectively infinite. We still need a finite number for spawn
// math elsewhere, but we use a very large clamp to remove the wall feel.
export const WORLD_HALF_EXTENT = 200000;

// Magnet pickup pulls every XP gem to the player. Bomb clears every enemy
// currently on screen.
export const MAGNET_DURATION_MS = 1; // we just sweep the field once, no timer needed

const BREAKABLE_PROP_DROP_CHANCE = 0.28;
export const MINE_DAMAGE = 34; // Insect egg acid splash damage.
const MINE_AMBUSH_TIME_MS = 150000;
const MELEE_FINISH_COMBO_WINDOW_MS = 7000;
const GRENADE_BOUNCE_DAMPING = 0.86;
const GRENADE_ROLL_DRAG = 1.45;
const weaponTierLabel = (tier?: number): string => `T${tier ?? 1}`;
const weaponTierColor = (tier?: number): string => {
  switch (tier ?? 1) {
    case 3: return '#facc15';
    case 2: return '#60a5fa';
    default: return '#f8fafc';
  }
};

interface GameState {
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: Pickup[];
  breakableProps: BreakableProp[];
  destroyedBreakableProps: Record<string, true>;
  mineAmbushAnchor: MineAmbushAnchor | null;
  gameTime: number;
  isPaused: boolean;
  showUpgradeMenu: boolean;
  // Flipped true the moment the finale boss (giantbat) dies — the run is won.
  gameWon: boolean;
  // Start-screen setting: melee-kill ammo drop rate (percent).
  meleeAmmoDropPercent: number;
  // Debug setting: ammo granted by one ammo-box pickup per weapon family.
  ammoPickupAmounts: Record<AmmoType, number>;
  meleeFinishComboCount: number;
  meleeFinishComboUntil: number;
  upgradeOptions: UpgradeOption[];
  inputState: InputState;
  swipeDirection: { x: number; y: number } | null;
  gameBounds: GameBounds;
  gameStats: GameStats;
  characterClass: CharacterClass;
  effects: VisualEffect[];
  camera: {
    x: number;
    y: number;
  };
  // Most recent weapon the player acquired (drop/crate). The HUD shows a
  // 5-second "got a weapon" popup off this. null until the first pickup.
  lastWeaponGet: { name: string; at: number; color?: string } | null;
  // Global hitstop: while Date.now() < hitstopUntil the simulation is frozen
  // (melee-finisher impact pause). 0 = running.
  hitstopUntil: number;
  // Screen shake: jitter the canvas while Date.now() < shakeUntil (set on hit).
  shakeUntil: number;

  // Player actions
  movePlayer: (input: InputState, deltaTime: number) => void;
  setSwipeDirection: (direction: { x: number; y: number } | null) => void;
  setLastDirection: (direction: { x: number; y: number } | null) => void;
  damagePlayer: (amount: number) => boolean;
  gainExperience: (amount: number) => void;
  levelUp: () => void;
  triggerCounter: () => CounterTriggerResult;
  
  // Weapon actions
  fireWeapons: (currentTime: number) => void;
  selectUpgrade: (upgrade: UpgradeOption) => void;
  learnSubWeapon: (key: SubWeaponKey) => void;
  setSubWeaponCooldown: (key: SubWeaponKey, readyAt: number) => void;
  
  // Enemy actions
  addEnemy: (enemy: Enemy) => void;
  removeEnemy: (id: string) => void;
  damageEnemy: (id: string, amount: number) => boolean;
  updateEnemies: (deltaTime: number) => void;
  stunEnemy: (id: string, until: number) => void;
  knockbackEnemy: (id: string, dirX: number, dirY: number, multiplier?: number) => void;

  // Ammo
  addAmmo: (type: AmmoType, amount: number) => void;

  // Weapons (drops / crates)
  grantWeapon: (key: string) => void;
  setActiveWeapon: (id: string) => void;
  autoSwitchIfDry: () => void;
  startReload: (weaponId: string) => void;
  tickReload: () => void;

  // Projectile actions
  addProjectile: (projectile: Projectile) => void;
  removeProjectile: (id: string) => void;
  updateProjectiles: (deltaTime: number) => void;
  reflectProjectile: (id: string, multiplier?: number) => void;
  
  // Pickup actions
  addPickup: (pickup: Pickup) => void;
  removePickup: (id: string) => void;
  collectPickup: (id: string) => void;

  // Breakable props
  syncBreakableProps: (camera: { x: number; y: number }, bounds: GameBounds) => void;
  damageBreakableProp: (id: string, amount: number) => BreakableProp | null;
  dropBreakablePropLoot: (prop: BreakableProp) => void;
  
  // Game state actions
  setGameTime: (time: number) => void;
  setPaused: (paused: boolean) => void;
  setMeleeAmmoDropPercent: (pct: number) => void;
  setAmmoPickupAmount: (type: AmmoType, amount: number) => void;
  addMeleeFinishCombo: (amount?: number) => void;
  setGameBounds: (bounds: GameBounds) => void;
  updateGameStats: (stats: Partial<GameStats>) => void;
  resetGame: (characterClass: string) => void;
  setCameraPosition: (x: number, y: number) => void;

  // Visual effects (renderer-only; no gameplay impact)
  spawnEffect: (effect: VisualEffect) => void;
  spawnBurst: (x: number, y: number, color: string, count?: number) => void;
  spawnDamageNumber: (x: number, y: number, value: number, crit?: boolean) => void;
  spawnAmmoNumber: (x: number, y: number, amount: number) => void;
  spawnCallout: (x: number, y: number, text: string, color: string) => void;
  spawnRing: (x: number, y: number, startRadius: number, endRadius: number, color: string, width?: number, duration?: number) => void;
  spawnGlow: (x: number, y: number, radius: number, color: string, duration?: number) => void;
  spawnSlash: (x: number, y: number, color?: string) => void;
  spawnFlash: (color: string, duration?: number) => void;
  updateEffects: (deltaTime: number) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  player: {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    width: PLAYER_HITBOX,
    height: PLAYER_HITBOX,
    speed: PLAYER_BASE_SPEED,
    health: PLAYER_BASE_HP,
    maxHealth: PLAYER_BASE_HP,
    experience: 0,
    level: 1,
    experienceToNextLevel: 5,
    weapons: [],
    activeWeaponId: '',
    characterClass: 'warrior',
    direction: 'idle',
    isMoving: false,
    invulnerable: false,
    invulnerableTime: 0,
    lastDirection: null,
    counterWindowEnd: 0,
    counterCooldownEnd: 0,
    lastCounterSuccessTime: 0,
    ammoHandgun: AMMO_INITIAL.handgun,
    ammoShotgun: AMMO_INITIAL.shotgun,
    ammoRifle: AMMO_INITIAL.rifle,
    critChance: 0,
    reloadEndsAt: 0,
    reloadingWeaponId: '',
    magBonus: 0,
    reloadMult: 1,
    subWeapons: [],
    subWeaponLevels: {},
    subWeaponCooldowns: {}
  },
  enemies: [],
  projectiles: [],
  pickups: [],
  breakableProps: [],
  destroyedBreakableProps: {},
  mineAmbushAnchor: null,
  gameTime: 0,
  isPaused: false,
  showUpgradeMenu: false,
  gameWon: false,
  meleeAmmoDropPercent: loadMeleeDropPct(),
  ammoPickupAmounts: loadAmmoPickupAmounts(),
  meleeFinishComboCount: 0,
  meleeFinishComboUntil: 0,
  upgradeOptions: [],
  inputState: { up: false, down: false, left: false, right: false },
  swipeDirection: null,
  gameBounds: { width: 800, height: 600 },
  gameStats: {
    timeAlive: 0,
    enemiesKilled: 0,
    damageDealt: 0,
    experienceCollected: 0,
    maxLevel: 1
  },
  characterClass: 'warrior',
  effects: [],
  camera: {
    x: 0,
    y: 0
  },
  lastWeaponGet: null,
  hitstopUntil: 0,
  shakeUntil: 0,

  // Player actions
  movePlayer: (input, deltaTime) => {
    set(state => {
      const { player, gameBounds, swipeDirection, breakableProps } = state;
      const solidProps = breakableProps.filter(p => p.type !== 'mine');
      void gameBounds; // World is effectively infinite — no clamp.

      // While reloading, the survivor is fumbling a fresh magazine in — they
      // can still shuffle and melee, but at 2/3 speed.
      const reloading =
        player.reloadingWeaponId !== '' && Date.now() < player.reloadEndsAt;
      const moveSpeed = reloading ? player.speed * (2 / 3) : player.speed;

      // Target direction from swipe (touch) or keys.
      let tx = 0;
      let ty = 0;
      if (swipeDirection) {
        tx = swipeDirection.x;
        ty = swipeDirection.y;
      } else {
        if (input.up) ty -= 1;
        if (input.down) ty += 1;
        if (input.left) tx -= 1;
        if (input.right) tx += 1;
      }
      const tlen = Math.hypot(tx, ty);
      if (tlen > 0) { tx /= tlen; ty /= tlen; }

      // Inertia: ease the velocity toward the target. Player tau is 0 → fully
      // instant, responsive control.
      const alpha = inertiaAlpha(deltaTime, PLAYER_INERTIA_TAU);
      const vx = player.vx + (tx * moveSpeed - player.vx) * alpha;
      const vy = player.vy + (ty * moveSpeed - player.vy) * alpha;

      // Block the player's hitbox out of tree trunks (rectangle AABB only).
      const treeResolved = resolveTreeCollision({
        x: player.x + vx * deltaTime,
        y: player.y + vy * deltaTime,
        width: player.width,
        height: player.height,
      });
      const resolved = resolveTorchCollision({
        x: treeResolved.x,
        y: treeResolved.y,
        width: player.width,
        height: player.height,
      }, solidProps);
      const newX = resolved.x;
      const newY = resolved.y;

      const speedNow = Math.hypot(vx, vy);
      let direction: Direction = 'idle';
      let lastDirection = player.lastDirection;
      if (speedNow > 1) {
        lastDirection = { x: vx / speedNow, y: vy / speedNow };
        direction = Math.abs(vx) > Math.abs(vy)
          ? (vx > 0 ? 'right' : 'left')
          : (vy > 0 ? 'down' : 'up');
      }
      const isMoving = speedNow > moveSpeed * 0.15;

      return {
        player: {
          ...player,
          x: newX,
          y: newY,
          vx,
          vy,
          direction,
          isMoving,
          lastDirection
        }
      };
    });
  },
  
  setSwipeDirection: (direction) => {
    set({ swipeDirection: direction });
  },

  setLastDirection: (direction) => {
    set(state => ({
      player: {
        ...state.player,
        lastDirection: direction
      }
    }));
  },
  
  triggerCounter: () => {
    const now = Date.now();
    const { player, gameTime, enemies, breakableProps } = get();
    // Respect cooldown — no swing, no knockback, no window.
    if (now < player.counterCooldownEnd) return { swung: false, hit: false, finish: false, killed: 0 };

    const melee = player.weapons.find(w => w.isMelee);
    const gun = getActiveGun(player); // finisher refunds into the active gun
    const meleeDamage = melee?.damage ?? 6;
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;

    // Single sweep: every non-reaper enemy in melee range is either finished
    // (if stunned) for an instant kill, or takes light damage + knockback.
    // The counter window for reflecting bullets opens at the same time, so
    // the one finger-release does melee, knockback, and bullet-parry together.
    const killed: { enemy: Enemy; finisher: boolean }[] = [];
    let bossFinishHit = false; // finisher-grade damage landed on a stunned boss
    const survivors: Enemy[] = [];
    const meleeDamageNumbers: { x: number; y: number; value: number; crit: boolean }[] = [];
    const slashAt: { x: number; y: number }[] = [];
    const meleeCritChance = melee?.critChance ?? 0;
    for (const enemy of enemies) {
      if (enemy.type === 'reaper') { survivors.push(enemy); continue; }
      const ecx = enemy.x + enemy.width / 2;
      const ecy = enemy.y + enemy.height / 2;
      const dx = ecx - pcx;
      const dy = ecy - pcy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > MELEE_RADIUS) { survivors.push(enemy); continue; }

      // Anything in reach gets cut — show a slash on it.
      slashAt.push({ x: ecx, y: ecy });
      const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil;
      if (stunned) {
        if (isBossType(enemy.type)) {
          // Bosses can't be instakilled. A melee hit on a stunned boss deals
          // 5× melee damage and shakes off the stun (no finisher).
          bossFinishHit = true;
          const dmg = meleeDamage * BOSS_MELEE_STUN_MULT;
          meleeDamageNumbers.push({ x: ecx, y: enemy.y, value: Math.round(dmg), crit: true });
          const newHealth = Math.max(0, enemy.health - dmg);
          if (newHealth <= 0) {
            killed.push({ enemy, finisher: false });
          } else {
            survivors.push({
              ...enemy,
              health: newHealth,
              stunUntil: undefined,
              lastHit: now,
              liftUntil: now + 420,
            });
          }
          continue;
        }
        killed.push({ enemy, finisher: true }); // normal instant execute
        continue;
      }
      // Melee weapons carry a fixed crit chance (varies by weapon). A crit
      // multiplies the swing's damage and pops a gold number.
      const crit = Math.random() < meleeCritChance;
      const dmg = meleeDamage * (crit ? CRIT_DAMAGE_MULT : 1);
      meleeDamageNumbers.push({ x: ecx, y: enemy.y, value: Math.round(dmg), crit });
      const newHealth = Math.max(0, enemy.health - dmg);
      if (newHealth <= 0) {
        killed.push({ enemy, finisher: false });
        continue;
      }
      // Knockback, unless this enemy was shoved recently (debounce to avoid
      // locking it in an infinite stagger). Damage still landed above.
      if (now >= (enemy.knockbackImmuneUntil ?? 0)) {
        const norm = Math.max(0.001, dist);
        const falloff = 1 - dist / MELEE_RADIUS;
        const speed = KNOCKBACK_SPEED * (0.5 + falloff * 0.5);
        survivors.push({
          ...enemy,
          health: newHealth,
          lastHit: now,
          knockbackVx: (dx / norm) * speed,
          knockbackVy: (dy / norm) * speed,
          knockbackUntil: now + KNOCKBACK_DURATION,
          knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS
        });
      } else {
        // Knockback is on cooldown for this enemy (recently shoved): don't shove
        // again — instead freeze it in place for 0.1s. We reuse the knockback
        // override with zero velocity, so updateEnemies holds it still (no chase)
        // for the duration while the damage above still lands.
        survivors.push({
          ...enemy,
          health: newHealth,
          lastHit: now,
          knockbackVx: 0,
          knockbackVy: 0,
          knockbackUntil: now + 100,
        });
      }
    }

    // A melee finisher (instant execute) triggers a brief full-game hitstop.
    const finisherHit = killed.some(k => k.finisher);
    const comboFinishCount = killed.filter(k => k.finisher).length + (bossFinishHit ? 1 : 0);
    const bossKilled = killed.some(k => k.enemy.type === 'giantbat');
    set(state => ({
      enemies: survivors,
      gameStats: {
        ...state.gameStats,
        enemiesKilled: state.gameStats.enemiesKilled + killed.length
      },
      gameWon: state.gameWon || bossKilled,
      meleeFinishComboCount: comboFinishCount > 0
        ? (state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount + comboFinishCount : comboFinishCount)
        : state.meleeFinishComboCount,
      meleeFinishComboUntil: comboFinishCount > 0
        ? gameTime + MELEE_FINISH_COMBO_WINDOW_MS
        : state.meleeFinishComboUntil,
      hitstopUntil: finisherHit ? now + HITSTOP_MS : state.hitstopUntil,
      player: {
        ...state.player,
        counterWindowEnd: now + COUNTER_WINDOW,
        counterCooldownEnd: now + COUNTER_WINDOW + COUNTER_COOLDOWN
      }
    }));

    // Slash streaks on every enemy that was cut.
    for (const s of slashAt) {
      get().spawnSlash(s.x, s.y);
    }

    // Damage numbers for every non-execute melee hit; crits/boss-stun hits pop gold.
    for (const c of meleeDamageNumbers) {
      get().spawnDamageNumber(c.x, c.y, c.value, c.crit);
    }

    // Per-kill rewards. Finishers grant bonus XP + gold VFX. EVERY melee kill
    // also DROPS an ammo box for the active gun's family — melee is the run's
    // main way to scavenge rounds, but you have to walk over the drop.
    for (const { enemy, finisher } of killed) {
      const ex = enemy.x + enemy.width / 2;
      const ey = enemy.y + enemy.height / 2;
      const xp = finisher
        ? Math.max(1, Math.round(enemy.experienceValue * 1.5))
        : enemy.experienceValue;
      get().addPickup({
        id: `pickup-xp-melee-${enemy.id}`,
        x: ex - 8, y: ey - 8, type: 'experience', value: xp
      });
      // Ammo scavenge: base rate is the start-screen setting; a finisher
      // (executing a stunned enemy) rolls at 1.5× that, capped at 100%.
      // Prefer the active gun's family; if the active pointer is temporarily
      // invalid, fall back to any owned gun so the slider still governs melee.
      const baseRate = get().meleeAmmoDropPercent / 100;
      const ammoChance = finisher ? Math.min(1, baseRate * 1.5) : baseRate;
      const ownedAmmoTypes = getGuns(player)
        .map(w => w.ammoType)
        .filter((t): t is AmmoType => !!t);
      const dropType = gun?.ammoType ?? ownedAmmoTypes[0];
      if (dropType && Math.random() < ammoChance) {
        get().addPickup({
          id: `pickup-ammo-melee-${enemy.id}`,
          x: ex - 8 + 14, y: ey - 8,
          type: `ammo-${dropType}` as 'ammo-handgun' | 'ammo-shotgun' | 'ammo-rifle',
          value: 0
        });
      }
      // Mid-boss killed in melee still drops its weapon crate (the gun-kill
      // path drops one too; bosses are usually finished with the counter).
      if (enemy.type === 'pumpkin' || enemy.type === 'giantbat') {
        get().addPickup({
          id: `pickup-crate-${enemy.id}`,
          x: ex - 8, y: ey - 8 - 18,
          type: 'weapon-crate',
          value: 0
        });
        get().spawnRing(ex, ey, 10, 80, 'rgba(96,165,250,0.7)', 3, 500);
      }
      if (finisher) {
        // Finisher juice: white shockwave + gold ring + sparks + glow + callout.
        get().spawnBurst(ex, ey, '#dc2626', 30);
        get().spawnBurst(ex, ey, '#7f1d1d', 14);
        get().spawnRing(ex, ey, 10, 92, 'rgba(255,255,255,0.95)', 3, 280);
        get().spawnRing(ex, ey, 8, 64, 'rgba(252,211,77,0.95)', 4, 380);
        get().spawnRing(ex, ey, 4, 34, 'rgba(185,28,28,0.72)', 3, 320);
        get().spawnGlow(ex, ey, 46, 'rgba(253,224,71,', 320);
        // "Kill!" callout over the executed enemy's head.
        get().spawnCallout(ex, enemy.y - 6, 'Kill!', '#fb7185');
      } else {
        get().spawnBurst(ex, ey, '#dc2626', 16);
        get().spawnBurst(ex, ey, '#7f1d1d', 7);
        get().spawnRing(ex, ey, 4, 24, 'rgba(185,28,28,0.68)', 3, 280);
      }
    }
    if (killed.some(k => k.finisher)) {
      get().spawnFlash('rgba(253, 224, 71, 0.28)', 200);
    }

    let propHit = false;
    for (const prop of breakableProps) {
      const dx = prop.footX - pcx;
      const dy = prop.footY - pcy;
      if (Math.hypot(dx, dy) > MELEE_RADIUS) continue;
      propHit = true;
      const broken = get().damageBreakableProp(prop.id, meleeDamage * 2.5);
      get().spawnSlash(prop.footX, prop.footY - prop.height * 0.8, 'rgba(255,243,196,0.95)');
      if (broken) {
        if (broken.type === 'mine') {
          get().spawnBurst(broken.footX, broken.footY - 8, '#84cc16', 30);
          get().spawnBurst(broken.footX, broken.footY - 8, '#166534', 16);
          get().spawnRing(broken.footX, broken.footY - 8, 5, 50, 'rgba(132,204,22,0.82)', 4, 320);
          get().spawnGlow(broken.footX, broken.footY - 8, 54, 'rgba(132,204,22,', 320);
        } else {
          get().spawnBurst(broken.footX, broken.footY - 18, '#f97316', 18);
          get().spawnBurst(broken.footX, broken.footY - 18, '#fde68a', 8);
          get().spawnRing(broken.footX, broken.footY - 18, 6, 34, 'rgba(251,146,60,0.8)', 3, 320);
          get().spawnGlow(broken.footX, broken.footY - 18, 44, 'rgba(251,146,60,', 360);
          get().dropBreakablePropLoot(broken);
        }
      }
    }

    return { swung: true, hit: slashAt.length > 0 || propHit, finish: finisherHit || bossFinishHit, killed: killed.length };
  },

  damagePlayer: (amount) => {
    const { player } = get();

    if (player.invulnerable) return false;
    
    set(state => {
      const newHealth = Math.max(0, state.player.health - amount);
      return {
        // Real damage kicks off a screen shake.
        shakeUntil: amount > 0 ? Date.now() + SHAKE_MS : state.shakeUntil,
        player: {
          ...state.player,
          health: newHealth,
          invulnerable: amount > 0,
          invulnerableTime: Date.now()
        }
      };
    });

    // Return whether player is dead
    return get().player.health <= 0;
  },
  
  gainExperience: (amount) => {
    set(state => {
      const { player, gameStats } = state;
      const newExperience = player.experience + amount;
      const newExpCollected = gameStats.experienceCollected + amount;
      return {
        player: {
          ...player,
          experience: newExperience,
        },
        gameStats: {
          ...gameStats,
          experienceCollected: newExpCollected
        }
      };
    });
    
    // Check if player should level up
    const { player } = get();
    if (player.experience >= player.experienceToNextLevel) {
      get().levelUp();
    }
  },
  
  levelUp: () => {
    set(state => {
      const { player } = state;
      const newLevel = player.level + 1;
      // VS-style ramp: cheap levels early so the upgrade menu shows up often,
      // then progressively steeper. +2 per level for levels 1-9, then a
      // smaller multiplier afterward.
      const stepLinear = newLevel < 10 ? 2 : 0;
      const newExpToNextLevel = Math.floor(player.experienceToNextLevel * (newLevel < 10 ? 1.1 : 1.18) + stepLinear);
      
      // Generate upgrade options when leveling up
      const upgradeOptions = generateUpgradeOptions(player);
      
      // Update max level in stats if needed
      const newMaxLevel = Math.max(state.gameStats.maxLevel, newLevel);

      // No automatic ammo resupply on level-up — ammo is managed entirely
      // through reserves/reloads and scarce pickups. Level-ups grant upgrades.
      return {
        player: {
          ...player,
          level: newLevel,
          experienceToNextLevel: newExpToNextLevel,
          experience: 0
        },
        showUpgradeMenu: true,
        upgradeOptions,
        isPaused: true,
        gameStats: {
          ...state.gameStats,
          maxLevel: newMaxLevel
        }
      };
    });
  },
  
  // Weapon actions
  fireWeapons: (currentTime) => {
    const { player } = get();
    player.weapons.forEach(weapon => {
      if (currentTime - weapon.lastFired >= weapon.cooldown) {
        // Logic to create projectiles based on weapon type will go here
        // We'll implement this in weaponUtils.ts
        
        set(state => ({
          player: {
            ...state.player,
            weapons: state.player.weapons.map(w => 
              w.id === weapon.id ? { ...w, lastFired: currentTime } : w
            )
          }
        }));
      }
    });
  },
  
  selectUpgrade: (upgrade) => {
    set(state => {
      const { player } = state;

      if (upgrade.type === 'subWeapon' && upgrade.subWeaponKey) {
        const known = player.subWeapons.includes(upgrade.subWeaponKey);
        const currentLevel = player.subWeaponLevels[upgrade.subWeaponKey] ?? 0;
        const nextLevel = Math.min(3, Math.max(currentLevel + 1, upgrade.level || 1));
        return {
          player: {
            ...player,
            subWeapons: known ? player.subWeapons : [...player.subWeapons, upgrade.subWeaponKey],
            subWeaponLevels: {
              ...player.subWeaponLevels,
              [upgrade.subWeaponKey]: nextLevel
            }
          },
          showUpgradeMenu: false,
          isPaused: false
        };
      }

      // RE rework: level-ups only strengthen the player — new weapons come
      // exclusively from world drops and crates. Every upgrade is a passive.
      if (upgrade.type === 'passive' && upgrade.passiveType) {
        const updatedPlayer = { ...player };
        // Per-level gains are intentionally modest (~half of the earlier,
        // too-steep values) so growth feels gradual.
        switch (upgrade.passiveType) {
          case 'maxHealth':
            updatedPlayer.maxHealth += 30;
            updatedPlayer.health = updatedPlayer.maxHealth;
            break;
          case 'speed':
            updatedPlayer.speed = Math.round(updatedPlayer.speed * 1.05);
            break;
          case 'might':
            // Boost damage on both the gun and the melee weapon.
            updatedPlayer.weapons = updatedPlayer.weapons.map(w => ({
              ...w, damage: w.damage * 1.2
            }));
            break;
          case 'cooldown':
            // Faster fire rate on the gun (melee cooldown is 0, untouched).
            updatedPlayer.weapons = updatedPlayer.weapons.map(w => ({
              ...w, cooldown: w.cooldown > 0 ? Math.max(80, w.cooldown * 0.95) : w.cooldown
            }));
            break;
          case 'magSize': {
            // 装填数アップ — bigger magazines for every gun. Top up the
            // currently-loaded rounds too so the boost is immediately useful.
            updatedPlayer.magBonus += 1;
            const bonus = updatedPlayer.magBonus;
            updatedPlayer.weapons = updatedPlayer.weapons.map(w =>
              w.magSize != null
                ? { ...w, magazine: Math.min((w.magazine ?? 0) + 1, w.magSize + bonus) }
                : w
            );
            break;
          }
          case 'reloadSpeed':
            // リロード時間短縮 — faster reloads for all guns (floor at 0.4×).
            updatedPlayer.reloadMult = Math.max(0.4, updatedPlayer.reloadMult * 0.925);
            break;
          case 'critChance':
            updatedPlayer.critChance = Math.min(0.3, updatedPlayer.critChance + 0.03);
            break;
          // 'area' / 'duration' are no longer offered (no area weapons), but
          // keep harmless no-op cases for type completeness.
          case 'area':
          case 'duration':
            break;
        }
        return {
          player: updatedPlayer,
          showUpgradeMenu: false,
          isPaused: false
        };
      }

      return {
        showUpgradeMenu: false,
        isPaused: false
      };
    });
  },

  learnSubWeapon: (key) => {
    set(state => ({
      player: {
        ...state.player,
        subWeapons: state.player.subWeapons.includes(key)
          ? state.player.subWeapons
          : [...state.player.subWeapons, key],
        subWeaponLevels: {
          ...state.player.subWeaponLevels,
          [key]: Math.max(1, state.player.subWeaponLevels[key] ?? 0)
        }
      }
    }));
  },

  setSubWeaponCooldown: (key, readyAt) => {
    set(state => ({
      player: {
        ...state.player,
        subWeaponCooldowns: {
          ...state.player.subWeaponCooldowns,
          [key]: readyAt
        }
      }
    }));
  },
  
  // Enemy actions
  addEnemy: (enemy) => {
    set(state => ({
      enemies: [...state.enemies, enemy]
    }));
  },
  
  removeEnemy: (id) => {
    set(state => ({
      enemies: state.enemies.filter(enemy => enemy.id !== id)
    }));
  },
  
  damageEnemy: (id, amount) => {
    let killed = false;
    
    set(state => {
      const { enemies, gameStats } = state;
      const enemy = enemies.find(e => e.id === id);
      
      if (!enemy) return { enemies };
      
      const newHealth = Math.max(0, enemy.health - amount);
      const updatedEnemies = enemies.map(e => 
        e.id === id ? { ...e, health: newHealth, lastHit: Date.now() } : e
      );
      
      // Check if enemy was killed
      if (newHealth === 0) {
        killed = true;
        
        // Update game stats
        const newStats = {
          ...gameStats,
          enemiesKilled: gameStats.enemiesKilled + 1,
          damageDealt: gameStats.damageDealt + amount
        };

        return {
          enemies: updatedEnemies.filter(e => e.id !== id),
          gameStats: newStats,
          // The giantbat is the run's finale boss — killing it wins the game.
          gameWon: state.gameWon || enemy.type === 'giantbat'
        };
      }
      
      return { 
        enemies: updatedEnemies,
        gameStats: {
          ...gameStats,
          damageDealt: gameStats.damageDealt + amount
        }
      };
    });
    
    return killed;
  },
  
  updateEnemies: (deltaTime) => {
    set(state => {
      const { enemies, player, gameTime, breakableProps } = state;
      const solidProps = breakableProps.filter(p => p.type !== 'mine');
      const now = Date.now();

      const updatedEnemies = enemies.map(enemy => {
        // Knockback overrides chase AI: while it's active, slide outward
        // with linearly-decaying velocity instead of seeking the player.
        if (enemy.knockbackUntil && now < enemy.knockbackUntil) {
          const remaining = enemy.knockbackUntil - now;
          const decay = Math.max(0, remaining / KNOCKBACK_DURATION); // 1 → 0
          const treeResolved = resolveTreeCollision({
            x: enemy.x + (enemy.knockbackVx ?? 0) * decay * deltaTime,
            y: enemy.y + (enemy.knockbackVy ?? 0) * decay * deltaTime,
            width: enemy.width,
            height: enemy.height,
          });
          const kb = resolveTorchCollision({
            x: treeResolved.x,
            y: treeResolved.y,
            width: enemy.width,
            height: enemy.height,
          }, solidProps);
          return { ...enemy, x: kb.x, y: kb.y };
        }

        // Bosses pop up briefly when they take melee finisher-grade damage;
        // while airborne they should read as caught, not still advancing.
        if (enemy.liftUntil !== undefined && now < enemy.liftUntil) {
          return { ...enemy, vx: 0, vy: 0 };
        }

        // Stun (from a crit) freezes the enemy in place — it's a sitting duck
        // for a melee finisher. gameTime-based so pauses don't cheat the timer.
        if (enemy.stunUntil !== undefined && gameTime < enemy.stunUntil) {
          return enemy;
        }

        // Plants are nearly stationary — they shuffle slightly toward the
        // player but mostly hold ground and spit seeds. Everything else
        // does the standard VS straight-line chase, but with inertia: the
        // chase velocity eases toward the heading so enemies curve into turns
        // (~0.3s) rather than snapping to face the player.
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        const speed = enemy.type === 'plant' ? enemy.speed * 0.25 : enemy.speed;
        const tvx = (dx / distance) * speed;
        const tvy = (dy / distance) * speed;

        const alpha = inertiaAlpha(deltaTime, ENEMY_INERTIA_TAU);
        const vx = (enemy.vx ?? tvx) + (tvx - (enemy.vx ?? tvx)) * alpha;
        const vy = (enemy.vy ?? tvy) + (tvy - (enemy.vy ?? tvy)) * alpha;

        const treeResolved = resolveTreeCollision({
          x: enemy.x + vx * deltaTime,
          y: enemy.y + vy * deltaTime,
          width: enemy.width,
          height: enemy.height,
        });
        const moved = resolveTorchCollision({
          x: treeResolved.x,
          y: treeResolved.y,
          width: enemy.width,
          height: enemy.height,
        }, solidProps);

        return { ...enemy, vx, vy, x: moved.x, y: moved.y };
      });

      return { enemies: updatedEnemies };
    });
  },

  stunEnemy: (id, until) => {
    set(state => ({
      enemies: state.enemies.map(e =>
        e.id === id ? { ...e, stunUntil: until } : e
      )
    }));
  },

  // Light bullet knockback: nudge an enemy along the shot direction. Reuses the
  // same decay model as the melee shove (KNOCKBACK_DURATION) but at a much
  // lower speed so it only staggers, never launches.
  knockbackEnemy: (id, dirX, dirY, multiplier = 1) => {
    const now = Date.now();
    const strength = Math.max(1, Math.min(3, multiplier));
    set(state => ({
      enemies: state.enemies.map(e =>
        e.id === id
          ? {
              ...e,
              knockbackVx: dirX * BULLET_KNOCKBACK_SPEED * strength,
              knockbackVy: dirY * BULLET_KNOCKBACK_SPEED * strength,
              knockbackUntil: now + KNOCKBACK_DURATION
            }
          : e
      )
    }));
  },

  // Ammo
  addAmmo: (type, amount) => {
    set(state => {
      const field = AMMO_FIELD[type];
      const max = AMMO_MAX[type];
      return {
        player: {
          ...state.player,
          [field]: Math.min(max, state.player[field] + amount)
        }
      };
    });
  },

  // Projectile actions
  addProjectile: (projectile) => {
    set(state => ({
      projectiles: [...state.projectiles, projectile]
    }));
  },
  
  removeProjectile: (id) => {
    set(state => ({
      projectiles: state.projectiles.filter(p => p.id !== id)
    }));
  },

  reflectProjectile: (id, multiplier = REFLECT_DAMAGE_MULTIPLIER) => {
    set(state => ({
      projectiles: state.projectiles.map(p => {
        if (p.id !== id) return p;
        return {
          ...p,
          direction: { x: -p.direction.x, y: -p.direction.y },
          speed: p.speed * REFLECT_SPEED_MULTIPLIER,
          damage: p.damage * multiplier,
          hostile: false,
          reflected: true,
          // Reflected bolts pierce — they plow through whatever line of
          // enemies happens to be between the player and the original
          // firer instead of stopping at the first body.
          passthrough: true,
          hitEnemies: [],
          createdAt: Date.now()
        };
      })
    }));
  },
  
  updateProjectiles: (deltaTime) => {
    const currentTime = Date.now();

    set(state => {
      const { projectiles, player, gameBounds, breakableProps } = state;
      const cullRadius = Math.max(gameBounds.width, gameBounds.height);
      const playerCX = player.x + player.width / 2;
      const playerCY = player.y + player.height / 2;
      const grenadeWallsFor = (p: Projectile) => {
        const pad = 260;
        const cx = p.x + p.width / 2;
        const cy = p.y + p.height / 2;
        const trunks = treesInRegion(cx - pad, cy - pad, cx + pad, cy + pad).map(trunkRect);
        const torches = breakableProps
          .filter(prop => prop.type === 'torch' && prop.health > 0)
          .map(torchRect);
        return [...trunks, ...torches];
      };

      const updatedProjectiles = projectiles
        .filter(p => {
          if (currentTime - p.createdAt > p.duration && p.weaponType !== 'grenade') return false;
          if (currentTime - p.createdAt > p.duration + 500) return false;
          // Garlic / bibles follow the player and shouldn't be culled by
          // their static spawn position; check distance from player.
          const px = p.x + p.width / 2;
          const py = p.y + p.height / 2;
          if (Math.hypot(px - playerCX, py - playerCY) > cullRadius) return false;
          return true;
        })
        .map(p => {
          // Orbital motion (bibles): position relative to the player using
          // a continuously-updated angle. Doesn't use direction/speed.
          if (p.orbitRadius !== undefined && p.orbitAngle !== undefined) {
            const angle = p.orbitAngle + (p.orbitSpeed ?? 0) * deltaTime;
            return {
              ...p,
              orbitAngle: angle,
              x: playerCX + Math.cos(angle) * p.orbitRadius - p.width / 2,
              y: playerCY + Math.sin(angle) * p.orbitRadius - p.height / 2
            };
          }
          // Aura that snaps to player (garlic)
          if (p.followsPlayer) {
            return {
              ...p,
              x: playerCX - p.width / 2,
              y: playerCY - p.height / 2
            };
          }
          // Ballistic motion with optional gravity (axes arc upward, fall)
          let dir = p.direction;
          if (p.gravity) {
            dir = { x: dir.x, y: dir.y + p.gravity * deltaTime };
          }
          if (p.weaponType === 'grenade') {
            let nextX = p.x + dir.x * p.speed * deltaTime;
            let nextY = p.y + dir.y * p.speed * deltaTime;
            const walls = grenadeWallsFor(p);
            const xRect = { x: nextX, y: p.y, width: p.width, height: p.height };
            if (walls.some(w => rectsOverlap(xRect, w))) {
              dir = { ...dir, x: -dir.x * GRENADE_BOUNCE_DAMPING };
              nextX = p.x;
            }
            const yRect = { x: nextX, y: nextY, width: p.width, height: p.height };
            if (walls.some(w => rectsOverlap(yRect, w))) {
              dir = { ...dir, y: -dir.y * GRENADE_BOUNCE_DAMPING };
              nextY = p.y;
            }
            return {
              ...p,
              direction: dir,
              speed: Math.max(24, p.speed * Math.exp(-GRENADE_ROLL_DRAG * deltaTime)),
              x: nextX,
              y: nextY
            };
          }
          return {
            ...p,
            direction: dir,
            x: p.x + dir.x * p.speed * deltaTime,
            y: p.y + dir.y * p.speed * deltaTime
          };
        });

      return { projectiles: updatedProjectiles };
    });
  },
  
  // Pickup actions
  addPickup: (pickup) => {
    set(state => ({
      pickups: [...state.pickups, pickup]
    }));
  },
  
  removePickup: (id) => {
    set(state => ({
      pickups: state.pickups.filter(p => p.id !== id)
    }));
  },
  
  collectPickup: (id) => {
    const { pickups } = get();
    const pickup = pickups.find(p => p.id === id);

    if (!pickup) return;

    switch (pickup.type) {
      case 'experience':
        get().gainExperience(pickup.value);
        break;
      case 'health':
        set(state => ({
          player: {
            ...state.player,
            health: Math.min(state.player.health + pickup.value, state.player.maxHealth)
          }
        }));
        break;
      case 'magnet': {
        // VS magnet: collect every XP gem currently on the field. We sum
        // their value in one go and remove them.
        const gems = get().pickups.filter(p => p.type === 'experience');
        const total = gems.reduce((s, g) => s + g.value, 0);
        if (total > 0) get().gainExperience(total);
        set(state => ({
          pickups: state.pickups.filter(p => p.type !== 'experience' || p.id === id)
        }));
        break;
      }
      case 'chest': {
        // Boss-drop treasure chest. Behaves like a level-up's upgrade menu
        // but without bumping the level or resetting XP. Player just gets
        // a free pick.
        const upgradeOptions = generateUpgradeOptions(get().player);
        set(state => ({
          upgradeOptions,
          showUpgradeMenu: true,
          isPaused: true,
          gameStats: state.gameStats
        }));
        break;
      }
      case 'bomb': {
        // VS rosary: kill every enemy currently on screen by zeroing their
        // HP. We don't grant experience for this — it's a panic button.
        const reachable = get().enemies.filter(e => e.type !== 'reaper');
        set(state => ({
          enemies: state.enemies.filter(e => e.type === 'reaper'),
          gameStats: {
            ...state.gameStats,
            enemiesKilled: state.gameStats.enemiesKilled + reachable.length
          }
        }));
        // Drop XP gems where each killed enemy was so the cleanup feels
        // rewarding even though we skipped the damage path.
        reachable.forEach(enemy => {
          get().addPickup({
            id: `pickup-bomb-${enemy.id}`,
            x: enemy.x + enemy.width / 2 - 8,
            y: enemy.y + enemy.height / 2 - 8,
            type: 'experience',
            value: enemy.experienceValue
          });
        });
        break;
      }
      case 'ammo-handgun':
      case 'ammo-shotgun':
      case 'ammo-rifle': {
        const fam = pickup.type.slice('ammo-'.length) as AmmoType;
        const amount = get().ammoPickupAmounts[fam];
        get().addAmmo(fam, amount);
        // Floating "+N" over the player's head, cyan so it reads apart from
        // damage numbers.
        const p = get().player;
        get().spawnAmmoNumber(p.x + p.width / 2, p.y - 6, amount);
        break;
      }
      case 'weapon-drop':
        if (pickup.weaponKey) get().grantWeapon(pickup.weaponKey);
        break;
      case 'weapon-crate':
        // Open the crate: roll a gun by category & tier and equip it.
        get().grantWeapon(openCrate(get().gameTime));
        break;
    }

    get().removePickup(id);
  },

  syncBreakableProps: (camera, bounds) => {
    const pad = 520;
    set(state => {
      const mineAmbushAnchor = state.mineAmbushAnchor ?? (
        state.gameTime >= MINE_AMBUSH_TIME_MS
          ? {
              id: `${Math.floor(state.gameTime)}`,
              x: state.player.x + state.player.width / 2,
              y: state.player.y + state.player.height / 2,
              width: bounds.width + 180,
              height: bounds.height + 180,
            }
          : null
      );
      const generated = torchesInRegion(
        camera.x - pad,
        camera.y - pad,
        camera.x + bounds.width + pad,
        camera.y + bounds.height + pad
      );
      const generatedMines = minesInRegion(
        camera.x - pad,
        camera.y - pad,
        camera.x + bounds.width + pad,
        camera.y + bounds.height + pad
      );
      const pressureMines = pressureMinesNearPlayer(
        state.player.x + state.player.width / 2,
        state.player.y + state.player.height / 2,
        state.player.lastDirection,
        state.gameTime
      );
      const ambushMines = mineAmbushAnchor ? mineAmbushAround(mineAmbushAnchor) : [];
      const current = new Map(state.breakableProps.map(p => [p.id, p]));
      const next: BreakableProp[] = [];

      for (const torch of generated) {
        if (state.destroyedBreakableProps[torch.id]) continue;
        const existing = current.get(torch.id);
        if (existing) {
          next.push(existing);
          continue;
        }
        const rect = torchRect(torch);
        next.push({
          id: torch.id,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          footX: torch.footX,
          footY: torch.footY,
          scale: torch.scale,
          health: 12,
          maxHealth: 12,
          type: 'torch',
          lastHit: 0
        });
      }

      for (const mine of [...generatedMines, ...pressureMines, ...ambushMines]) {
        if (state.destroyedBreakableProps[mine.id]) continue;
        const existing = current.get(mine.id);
        if (existing) {
          next.push(existing);
          continue;
        }
        const rect = mineRect(mine);
        next.push({
          id: mine.id,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          footX: mine.footX,
          footY: mine.footY,
          scale: mine.scale,
          health: 1,
          maxHealth: 1,
          type: 'mine',
          lastHit: 0
        });
      }

      return { breakableProps: next, mineAmbushAnchor };
    });
  },

  damageBreakableProp: (id, amount) => {
    let broken: BreakableProp | null = null;
    set(state => {
      const prop = state.breakableProps.find(p => p.id === id);
      if (!prop) return {};

      const nextHealth = Math.max(0, prop.health - amount);
      if (nextHealth <= 0) {
        broken = { ...prop, health: 0, lastHit: Date.now() };
        return {
          breakableProps: state.breakableProps.filter(p => p.id !== id),
          destroyedBreakableProps: {
            ...state.destroyedBreakableProps,
            [id]: true
          }
        };
      }

      return {
        breakableProps: state.breakableProps.map(p =>
          p.id === id ? { ...p, health: nextHealth, lastHit: Date.now() } : p
        )
      };
    });
    return broken;
  },

  dropBreakablePropLoot: (prop) => {
    if (Math.random() >= BREAKABLE_PROP_DROP_CHANCE) return;
    const x = prop.footX - 8;
    const y = prop.footY - 16;
    const roll = Math.random();
    const player = get().player;

    if (roll < 0.58) {
      const equippedAmmo = getActiveGun(player)?.ammoType;
      const owned = getGuns(player)
        .map(w => w.ammoType)
        .filter((t): t is AmmoType => !!t);
      const dropType = equippedAmmo ?? owned[0];
      if (dropType) {
        get().addPickup({
          id: `pickup-torch-ammo-${prop.id}`,
          x, y,
          type: `ammo-${dropType}` as 'ammo-handgun' | 'ammo-shotgun' | 'ammo-rifle',
          value: 0,
          worldDrop: true
        });
        return;
      }
    }

    if (roll < 0.8) {
      get().addPickup({
        id: `pickup-torch-health-${prop.id}`,
        x, y,
        type: 'health',
        value: 20,
        worldDrop: true
      });
      return;
    }

    if (roll < 0.89) {
      get().addPickup({
        id: `pickup-torch-magnet-${prop.id}`,
        x, y,
        type: 'magnet',
        value: 0
      });
      return;
    }

    if (roll < 0.96) {
      get().addPickup({
        id: `pickup-torch-bomb-${prop.id}`,
        x, y,
        type: 'bomb',
        value: 0
      });
      return;
    }

    get().addPickup({
      id: `pickup-torch-weapon-${prop.id}`,
      x, y,
      type: 'weapon-drop',
      value: 0,
      weaponKey: rollWeaponKey(get().gameTime),
      worldDrop: true
    });
  },

  // Equip a dropped/crate weapon into its slot. Auto-pick: a weapon only
  // replaces the current gun/melee if it is a higher tier (so a
  // stray T1 drop never downgrades a T3). Existing guns convert to ammo.
  grantWeapon: (key) => {
    const weapon = createWeapon(key);
    let duplicateAmmo: { amount: number } | null = null;
    set(state => {
      const player = state.player;

      // Melee: single slot, keep the higher tier (as before).
      if (weapon.isMelee) {
        const idx = player.weapons.findIndex(w => w.isMelee);
        const current = idx >= 0 ? player.weapons[idx] : undefined;
        if (current && (weapon.tier ?? 1) < (current.tier ?? 1)) return {};
        const weapons = [...player.weapons];
        if (idx >= 0) weapons[idx] = weapon; else weapons.push(weapon);
        return { player: { ...player, weapons } };
      }

      // Guns: one per category (max 3). A new category is added to the
      // arsenal; an existing category keeps whichever tier is higher.
      const idx = player.weapons.findIndex(
        w => !w.isMelee && w.category === weapon.category
      );
      const current = idx >= 0 ? player.weapons[idx] : undefined;
      const isActiveCategory = current && current.id === player.activeWeaponId;

      if (current && (weapon.tier ?? 1) <= (current.tier ?? 1)) {
        const ammoType = weapon.ammoType;
        const ammoField = AMMO_FIELD[ammoType];
        const amount = get().ammoPickupAmounts[ammoType] * 2;
        duplicateAmmo = { amount };
        return {
          player: {
            ...player,
            [ammoField]: Math.min(AMMO_MAX[ammoType], player[ammoField] + amount)
          },
          lastWeaponGet: {
            name: `${weaponTierLabel(weapon.tier)} ${weapon.name} -> 弾薬 +${amount}`,
            at: Date.now(),
            color: weaponTierColor(weapon.tier)
          }
        };
      }

      const weapons = [...player.weapons];
      if (idx >= 0) weapons[idx] = weapon; else weapons.push(weapon);

      // Keep the active selection sensible: stay on the upgraded active gun
      // (its id changed), or arm the new gun if we had none / were dry (no
      // loaded rounds and no reserve to reload from).
      const hadGun = getGuns(player).length > 0;
      const activeNow = getActiveGun(player);
      const activeDry =
        !activeNow?.ammoType ||
        ((activeNow.magazine ?? 0) <= 0 && ammoPoolFor(player, activeNow.ammoType) <= 0);
      let activeWeaponId = player.activeWeaponId;
      if (isActiveCategory || !hadGun || activeDry) {
        activeWeaponId = weapon.id;
      }

      // If the gun we just replaced was mid-reload, drop that reload (its id is
      // gone; the new gun comes fully loaded anyway).
      const wasReloadingReplaced = current && player.reloadingWeaponId === current.id;
      const reloadPatch = wasReloadingReplaced
        ? { reloadingWeaponId: '', reloadEndsAt: 0 }
        : {};

      return {
        player: { ...player, weapons, activeWeaponId, ...reloadPatch },
        lastWeaponGet: {
          name: `${weaponTierLabel(weapon.tier)} ${weapon.name}`,
          at: Date.now(),
          color: weaponTierColor(weapon.tier)
        }
      };
    });

    if (duplicateAmmo) {
      const p = get().player;
      get().spawnAmmoNumber(p.x + p.width / 2, p.y - 6, duplicateAmmo.amount);
    }
  },

  // Manually arm a specific gun (from the HUD weapon icons). Ignores melee.
  // Cancels any in-progress reload so the move-speed penalty doesn't follow
  // the player onto the freshly-armed gun.
  setActiveWeapon: (id) => {
    set(state => {
      const target = state.player.weapons.find(w => w.id === id && !w.isMelee);
      if (!target) return {};
      return {
        player: {
          ...state.player,
          activeWeaponId: id,
          reloadingWeaponId: '',
          reloadEndsAt: 0
        }
      };
    });
  },

  // Begin reloading a gun: pull rounds from its reserve into its magazine over
  // the weapon's reload time. No-op if already reloading it, the mag is full,
  // or the reserve is empty.
  startReload: (weaponId) => {
    set(state => {
      const p = state.player;
      const w = p.weapons.find(g => g.id === weaponId);
      if (!w || !w.ammoType) return {};
      if (p.reloadingWeaponId === weaponId && Date.now() < p.reloadEndsAt) return {};
      const need = effectiveMagSize(w, p) - (w.magazine ?? 0);
      if (need <= 0) return {};
      if (ammoPoolFor(p, w.ammoType) <= 0) return {}; // no reserve to load from
      return {
        player: {
          ...p,
          reloadingWeaponId: weaponId,
          reloadEndsAt: Date.now() + effectiveReloadMs(w, p)
        }
      };
    });
  },

  // Complete a finished reload: move min(need, reserve) rounds from the reserve
  // pool into the gun's magazine. Called once per frame from the game loop.
  tickReload: () => {
    set(state => {
      const p = state.player;
      if (!p.reloadingWeaponId || Date.now() < p.reloadEndsAt) return {};
      const w = p.weapons.find(g => g.id === p.reloadingWeaponId);
      if (!w || !w.ammoType) {
        return { player: { ...p, reloadingWeaponId: '', reloadEndsAt: 0 } };
      }
      const field = AMMO_FIELD[w.ammoType];
      const need = Math.max(0, effectiveMagSize(w, p) - (w.magazine ?? 0));
      const moved = Math.min(need, p[field]);
      return {
        player: {
          ...p,
          [field]: p[field] - moved,
          weapons: p.weapons.map(g =>
            g.id === w.id ? { ...g, magazine: (g.magazine ?? 0) + moved } : g
          ),
          reloadingWeaponId: '',
          reloadEndsAt: 0
        }
      };
    });
  },

  // Keep the active gun shootable. Called each frame before firing:
  //   1. active gun has loaded rounds -> nothing to do.
  //   2. active gun empty but has reserve -> reload it (don't switch).
  //   3. active gun fully dry -> switch to a gun that can fire now (loaded) or
  //      reload (has reserve); if none, the player falls back to melee.
  autoSwitchIfDry: () => {
    const player = get().player;
    const active = getActiveGun(player);
    if (!active?.ammoType) return;
    if ((active.magazine ?? 0) > 0) return;
    if (ammoPoolFor(player, active.ammoType) > 0) {
      get().startReload(active.id);
      return;
    }
    const guns = getGuns(player);
    const ready = guns.find(w => (w.magazine ?? 0) > 0);
    const reloadable = guns.find(w => w.ammoType && ammoPoolFor(player, w.ammoType) > 0);
    const target = ready ?? reloadable;
    if (target && target.id !== player.activeWeaponId) {
      set(state => ({ player: { ...state.player, activeWeaponId: target.id } }));
    }
  },
  
  // Game state actions
  setGameTime: (time) => {
    set({ gameTime: time });
  },
  
  setPaused: (paused) => {
    set({ isPaused: paused });
  },

  setMeleeAmmoDropPercent: (pct) => {
    const clamped = clampDropPct(pct);
    try { localStorage.setItem(DROP_PCT_KEY, String(clamped)); } catch { /* ignore */ }
    set({ meleeAmmoDropPercent: clamped });
  },

  setAmmoPickupAmount: (type, amount) => {
    const clamped = clampAmmoPickupAmount(amount);
    set(state => {
      const next = { ...state.ammoPickupAmounts, [type]: clamped };
      try { localStorage.setItem(AMMO_PICKUP_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return { ammoPickupAmounts: next };
    });
  },

  addMeleeFinishCombo: (amount = 1) => {
    const gain = Math.max(1, Math.floor(amount));
    set(state => ({
      meleeFinishComboCount: state.meleeFinishComboUntil >= state.gameTime
        ? state.meleeFinishComboCount + gain
        : gain,
      meleeFinishComboUntil: state.gameTime + MELEE_FINISH_COMBO_WINDOW_MS,
    }));
  },

  setGameBounds: (bounds) => {
    set({ gameBounds: bounds });
  },
  
  updateGameStats: (stats) => {
    set(state => ({
      gameStats: { ...state.gameStats, ...stats }
    }));
  },
  
  resetGame: (characterClass) => {
    const validClass = ['warrior', 'mage', 'rogue', 'necromancer'].includes(characterClass) 
      ? characterClass as CharacterClass 
      : 'warrior';
      
    const startingWeapons = getStartingWeapons(validClass);
    const profile = PLAYER_PROFILES[validClass] ?? PLAYER_PROFILES.warrior;
    const maxHealth = profile.maxHp;
    
    set(state => {
      void state;
      // World is infinite; player starts at the origin and the camera
      // follows. No need to pre-center within bounds.
      return {
        player: {
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          width: PLAYER_HITBOX,
          height: PLAYER_HITBOX,
          speed: PLAYER_BASE_SPEED,
          health: maxHealth,
          maxHealth,
          experience: 0,
          level: 1,
          experienceToNextLevel: 5,
          weapons: startingWeapons,
          activeWeaponId: startingWeapons.find(w => !w.isMelee)?.id ?? '',
          characterClass: validClass,
          direction: 'idle',
          isMoving: false,
          invulnerable: false,
          invulnerableTime: 0,
          lastDirection: null,
          counterWindowEnd: 0,
          counterCooldownEnd: 0,
          lastCounterSuccessTime: 0,
          ammoHandgun: AMMO_INITIAL.handgun,
          ammoShotgun: AMMO_INITIAL.shotgun,
          ammoRifle: AMMO_INITIAL.rifle,
          critChance: 0,
          reloadEndsAt: 0,
          reloadingWeaponId: '',
          magBonus: 0,
          reloadMult: 1,
          subWeapons: [],
          subWeaponLevels: {},
          subWeaponCooldowns: {}
        },
        enemies: [],
        projectiles: [],
        pickups: [],
        breakableProps: [],
        destroyedBreakableProps: {},
        mineAmbushAnchor: null,
        gameTime: 0,
        isPaused: false,
        showUpgradeMenu: false,
        gameWon: false,
        meleeFinishComboCount: 0,
        meleeFinishComboUntil: 0,
        upgradeOptions: [],
        swipeDirection: null,
        gameStats: {
          timeAlive: 0,
          enemiesKilled: 0,
          damageDealt: 0,
          experienceCollected: 0,
          maxLevel: 1
        },
        characterClass: validClass,
        effects: [],
        camera: {
          x: 0,
          y: 0
        },
        lastWeaponGet: null,
        hitstopUntil: 0,
        shakeUntil: 0
      };
    });
  },
  
  setCameraPosition: (x, y) => {
    // Infinite world: the camera follows the player one-to-one with no clamp.
    set({ camera: { x, y } });
  },

  spawnEffect: (effect) => {
    // Cap the effect pool so a stray bug can't degrade the framerate.
    set(state => {
      const next = [...state.effects, effect];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },

  spawnBurst: (x, y, color, count = 6) => {
    const now = Date.now();
    const fresh: VisualEffect[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      fresh.push({
        kind: 'particle',
        id: `fx-burst-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 2 + Math.random() * 2,
        createdAt: now,
        duration: 280 + Math.random() * 160,
        drag: 4
      });
    }
    set(state => {
      const next = [...state.effects, ...fresh];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },

  spawnDamageNumber: (x, y, value, crit = false) => {
    const now = Date.now();
    const effect: VisualEffect = {
      kind: 'damageNumber',
      id: `fx-dmg-${now}-${Math.random().toString(36).slice(2, 6)}`,
      x: x + (Math.random() - 0.5) * 18,
      y: y + (Math.random() - 0.5) * 8,
      value: Math.max(1, Math.round(value)),
      color: crit ? '#fbbf24' : '#fef9c3',
      createdAt: now,
      duration: 720,
      crit
    };
    set(state => {
      const next = [...state.effects, effect];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },

  // Floating "+N" for ammo pickups, in a distinct cyan so it reads separately
  // from white/gold damage numbers. Rises from the given point (player's head).
  spawnAmmoNumber: (x, y, amount) => {
    const now = Date.now();
    const effect: VisualEffect = {
      kind: 'damageNumber',
      id: `fx-ammo-${now}-${Math.random().toString(36).slice(2, 6)}`,
      x, y,
      value: amount,
      text: `+${amount}`,
      color: '#67e8f9',
      createdAt: now,
      duration: 760
    };
    set(state => {
      const next = [...state.effects, effect];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },

  // Big bold floating callout (e.g. "Kill!", "Counter!"). Rises and fades like
  // a damage number but larger.
  spawnCallout: (x, y, text, color) => {
    const now = Date.now();
    const effect: VisualEffect = {
      kind: 'damageNumber',
      id: `fx-callout-${now}-${Math.random().toString(36).slice(2, 6)}`,
      x, y,
      value: 0,
      text,
      color,
      scale: 1.9,
      createdAt: now,
      duration: 850
    };
    set(state => {
      const next = [...state.effects, effect];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },

  spawnRing: (x, y, startRadius, endRadius, color, width = 3, duration = 500) => {
    const now = Date.now();
    set(state => ({
      effects: [
        ...state.effects,
        {
          kind: 'ring',
          id: `fx-ring-${now}-${Math.random().toString(36).slice(2, 6)}`,
          x, y, startRadius, endRadius, color, width,
          createdAt: now,
          duration
        }
      ]
    }));
  },

  spawnGlow: (x, y, radius, color, duration = 320) => {
    const now = Date.now();
    set(state => {
      const next = [...state.effects, {
        kind: 'glow' as const,
        id: `fx-glow-${now}-${Math.random().toString(36).slice(2, 6)}`,
        x, y, radius, color,
        createdAt: now,
        duration
      }];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },

  spawnSlash: (x, y, color = 'rgba(255,255,255,0.95)') => {
    const now = Date.now();
    set(state => {
      const next = [...state.effects, {
        kind: 'slash' as const,
        id: `fx-slash-${now}-${Math.random().toString(36).slice(2, 6)}`,
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        angle: -0.9 + Math.random() * 0.5, // roughly diagonal, slight variance
        length: 26 + Math.random() * 8,
        color,
        createdAt: now,
        duration: 200
      }];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },

  spawnFlash: (color, duration = 220) => {
    const now = Date.now();
    set(state => ({
      effects: [
        ...state.effects,
        {
          kind: 'flash',
          id: `fx-flash-${now}`,
          color,
          createdAt: now,
          duration
        }
      ]
    }));
  },

  updateEffects: (deltaTime) => {
    const now = Date.now();
    set(state => {
      const live: VisualEffect[] = [];
      for (const e of state.effects) {
        if (now - e.createdAt > e.duration) continue;
        if (e.kind === 'particle') {
          const drag = e.drag ?? 0;
          const decay = drag > 0 ? Math.exp(-drag * deltaTime) : 1;
          live.push({
            ...e,
            x: e.x + e.vx * deltaTime,
            y: e.y + e.vy * deltaTime,
            vx: e.vx * decay,
            vy: e.vy * decay
          });
        } else if (e.kind === 'damageNumber') {
          // Damage numbers drift upward and slow over time
          live.push({ ...e, y: e.y - 40 * deltaTime });
        } else {
          live.push(e);
        }
      }
      return { effects: live };
    });
  }
}));
