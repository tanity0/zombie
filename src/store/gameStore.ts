import { create } from 'zustand';
import { generateUpgradeOptions } from '../utils/upgradeUtils';
import {
  Player, Enemy, Projectile, Pickup, GameStats,
  InputState, UpgradeOption, GameBounds, CharacterClass,
  VisualEffect, AmmoType
} from '../types/game';
import { getStartingWeapons, createWeapon, AMMO_FIELD, getActiveGun, getGuns, ammoPoolFor } from '../utils/weaponUtils';
import { openCrate } from '../utils/weaponDrop';

// RE-style ammo economy. Each gun family draws from its own pool. Pools start
// modest and cap low so resupply pickups (and crit refunds) matter.
export const AMMO_INITIAL: Record<AmmoType, number> = { handgun: 30, shotgun: 12, rifle: 6 };
export const AMMO_MAX: Record<AmmoType, number> = { handgun: 90, shotgun: 36, rifle: 18 };
// How much a world ammo pickup grants for each family (enemy drops + air
// drops). Tripled so resupply moments feel meaningful.
export const AMMO_PICKUP: Record<AmmoType, number> = { handgun: 54, shotgun: 18, rifle: 9 };
// How much each level-up tops up every family. A partial resupply — enough to
// reward leveling without removing the pressure of managing ammo between gems.
export const AMMO_LEVELUP: Record<AmmoType, number> = { handgun: 14, shotgun: 5, rifle: 3 };
// Rounds refunded per melee finisher, by the equipped gun's family. Executing a
// stunned enemy tops the gun back up so the crit→stun→finish loop sustains ammo.
export const FINISHER_AMMO_REFUND: Record<AmmoType, number> = { handgun: 6, shotgun: 2, rifle: 1 };

// Light knockback applied to a normal enemy each time a bullet connects.
export const BULLET_KNOCKBACK_SPEED = 190;

// Crit → stun duration (gameTime ms). A stunned enemy is a finisher target.
export const STUN_DURATION_MS = 5000;
export const CRIT_DAMAGE_MULT = 1.5;
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
export const KNOCKBACK_SPEED = 600;
export const KNOCKBACK_DURATION = 280;
export const REFLECT_DAMAGE_MULTIPLIER = 12.0;
export const REFLECT_SPEED_MULTIPLIER = 1.8;

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

interface GameState {
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: Pickup[];
  gameTime: number;
  isPaused: boolean;
  showUpgradeMenu: boolean;
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
  
  // Player actions
  movePlayer: (input: InputState, deltaTime: number) => void;
  setSwipeDirection: (direction: { x: number; y: number } | null) => void;
  setLastDirection: (direction: { x: number; y: number } | null) => void;
  damagePlayer: (amount: number) => boolean;
  gainExperience: (amount: number) => void;
  levelUp: () => void;
  triggerCounter: () => void;
  
  // Weapon actions
  fireWeapons: (currentTime: number) => void;
  selectUpgrade: (upgrade: UpgradeOption) => void;
  
  // Enemy actions
  addEnemy: (enemy: Enemy) => void;
  removeEnemy: (id: string) => void;
  damageEnemy: (id: string, amount: number) => boolean;
  updateEnemies: (deltaTime: number) => void;
  stunEnemy: (id: string, until: number) => void;
  knockbackEnemy: (id: string, dirX: number, dirY: number) => void;

  // Ammo
  addAmmo: (type: AmmoType, amount: number) => void;

  // Weapons (drops / crates)
  grantWeapon: (key: string) => void;
  setActiveWeapon: (id: string) => void;
  autoSwitchIfDry: () => void;

  // Projectile actions
  addProjectile: (projectile: Projectile) => void;
  removeProjectile: (id: string) => void;
  updateProjectiles: (deltaTime: number) => void;
  reflectProjectile: (id: string, multiplier?: number) => void;
  
  // Pickup actions
  addPickup: (pickup: Pickup) => void;
  removePickup: (id: string) => void;
  collectPickup: (id: string) => void;
  
  // Game state actions
  setGameTime: (time: number) => void;
  setPaused: (paused: boolean) => void;
  setGameBounds: (bounds: GameBounds) => void;
  updateGameStats: (stats: Partial<GameStats>) => void;
  resetGame: (characterClass: string) => void;
  setCameraPosition: (x: number, y: number) => void;

  // Visual effects (renderer-only; no gameplay impact)
  spawnEffect: (effect: VisualEffect) => void;
  spawnBurst: (x: number, y: number, color: string, count?: number) => void;
  spawnDamageNumber: (x: number, y: number, value: number, crit?: boolean) => void;
  spawnRing: (x: number, y: number, startRadius: number, endRadius: number, color: string, width?: number, duration?: number) => void;
  spawnFlash: (color: string, duration?: number) => void;
  updateEffects: (deltaTime: number) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  player: {
    x: 0,
    y: 0,
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
    critChance: 0.07,
    moveFrozenUntil: 0
  },
  enemies: [],
  projectiles: [],
  pickups: [],
  gameTime: 0,
  isPaused: false,
  showUpgradeMenu: false,
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
  
  // Player actions
  movePlayer: (input, deltaTime) => {
    set(state => {
      const { player, gameBounds, swipeDirection } = state;
      let newX = player.x;
      let newY = player.y;
      let direction = 'idle';
      let isMoving = false;
      let lastDirection = player.lastDirection;
      // Shot hitstop: while the freeze window is open, the player is rooted
      // (movement speed 0) so each shot reads with a beat of recoil.
      const frozen = Date.now() < player.moveFrozenUntil;
      const moveSpeed = frozen ? 0 : player.speed;

      // Handle movement based on input state (keyboard) or swipe direction (touch)
      if (swipeDirection) {
        // Move based on swipe direction
        newX += swipeDirection.x * moveSpeed * deltaTime;
        newY += swipeDirection.y * moveSpeed * deltaTime;
        
        // Set dominant direction for animation
        const absX = Math.abs(swipeDirection.x);
        const absY = Math.abs(swipeDirection.y);
        
        if (absX > absY) {
          direction = swipeDirection.x > 0 ? 'right' : 'left';
        } else {
          direction = swipeDirection.y > 0 ? 'down' : 'up';
        }
        
        isMoving = true;
        // Update last direction when moving
        lastDirection = { ...swipeDirection };
      } else {
        // Traditional directional movement
        let dirX = 0;
        let dirY = 0;
        
        if (input.up) {
          newY -= moveSpeed * deltaTime;
          direction = 'up';
          isMoving = true;
          dirY = -1;
        }
        if (input.down) {
          newY += moveSpeed * deltaTime;
          direction = 'down';
          isMoving = true;
          dirY = 1;
        }
        if (input.left) {
          newX -= moveSpeed * deltaTime;
          direction = 'left';
          isMoving = true;
          dirX = -1;
        }
        if (input.right) {
          newX += moveSpeed * deltaTime;
          direction = 'right';
          isMoving = true;
          dirX = 1;
        }
        
        // Update last direction when moving with keyboard
        if (isMoving) {
          // Normalize the direction vector
          const length = Math.sqrt(dirX * dirX + dirY * dirY);
          if (length > 0) {
            lastDirection = {
              x: dirX / length,
              y: dirY / length
            };
          }
        }
      }
      
      // World is effectively infinite — no clamp. Mad Forest is open.
      void gameBounds;
      
      return {
        player: {
          ...player,
          x: newX,
          y: newY,
          direction: direction as any,
          isMoving: frozen ? false : isMoving,
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
    const { player, gameTime, enemies } = get();
    // Respect cooldown — no swing, no knockback, no window.
    if (now < player.counterCooldownEnd) return;

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
    const survivors: Enemy[] = [];
    for (const enemy of enemies) {
      if (enemy.type === 'reaper') { survivors.push(enemy); continue; }
      const ecx = enemy.x + enemy.width / 2;
      const ecy = enemy.y + enemy.height / 2;
      const dx = ecx - pcx;
      const dy = ecy - pcy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > MELEE_RADIUS) { survivors.push(enemy); continue; }

      const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil;
      if (stunned) {
        killed.push({ enemy, finisher: true }); // execute
        continue;
      }
      const newHealth = Math.max(0, enemy.health - meleeDamage);
      if (newHealth <= 0) {
        killed.push({ enemy, finisher: false });
        continue;
      }
      const norm = Math.max(0.001, dist);
      const falloff = 1 - dist / MELEE_RADIUS;
      const speed = KNOCKBACK_SPEED * (0.5 + falloff * 0.5);
      survivors.push({
        ...enemy,
        health: newHealth,
        lastHit: now,
        knockbackVx: (dx / norm) * speed,
        knockbackVy: (dy / norm) * speed,
        knockbackUntil: now + KNOCKBACK_DURATION
      });
    }

    set(state => ({
      enemies: survivors,
      gameStats: {
        ...state.gameStats,
        enemiesKilled: state.gameStats.enemiesKilled + killed.length
      },
      player: {
        ...state.player,
        counterWindowEnd: now + COUNTER_WINDOW,
        counterCooldownEnd: now + COUNTER_WINDOW + COUNTER_COOLDOWN
      }
    }));

    // Shockwave ring telegraph — wider than the hit zone so the swing reads big.
    get().spawnRing(pcx, pcy, 14, KNOCKBACK_RING_RADIUS, 'rgba(252, 211, 77, 0.85)', 4, 320);

    // Per-kill rewards. Finishers grant bonus XP, gold VFX, and refund a chunk
    // of ammo into the equipped gun — the loop that keeps a low-ammo run alive.
    let finisherCount = 0;
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
      if (finisher) {
        finisherCount += 1;
        get().spawnBurst(ex, ey, '#fcd34d', 16);
        get().spawnRing(ex, ey, 8, 64, 'rgba(252,211,77,0.9)', 4, 360);
      } else {
        get().spawnBurst(ex, ey, '#e5e7eb', 6);
      }
    }
    if (killed.some(k => k.finisher)) {
      get().spawnFlash('rgba(253, 224, 71, 0.18)', 160);
    }
    if (finisherCount > 0 && gun?.ammoType) {
      get().addAmmo(gun.ammoType, finisherCount * FINISHER_AMMO_REFUND[gun.ammoType]);
    }
  },

  damagePlayer: (amount) => {
    const { player } = get();

    if (player.invulnerable) return false;
    
    set(state => {
      const newHealth = Math.max(0, state.player.health - amount);
      return {
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
      
      // Level-up resupply: top up every ammo family (clamped to its cap). One
      // of the three ways the player restocks, alongside enemy drops and the
      // air-dropped crates that appear on the map.
      return {
        player: {
          ...player,
          level: newLevel,
          experienceToNextLevel: newExpToNextLevel,
          experience: 0,
          ammoHandgun: Math.min(AMMO_MAX.handgun, player.ammoHandgun + AMMO_LEVELUP.handgun),
          ammoShotgun: Math.min(AMMO_MAX.shotgun, player.ammoShotgun + AMMO_LEVELUP.shotgun),
          ammoRifle: Math.min(AMMO_MAX.rifle, player.ammoRifle + AMMO_LEVELUP.rifle)
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

      // RE rework: level-ups only strengthen the player — new weapons come
      // exclusively from world drops and crates. Every upgrade is a passive.
      if (upgrade.type === 'passive' && upgrade.passiveType) {
        const updatedPlayer = { ...player };
        switch (upgrade.passiveType) {
          case 'maxHealth':
            updatedPlayer.maxHealth += 20;
            updatedPlayer.health = Math.min(updatedPlayer.health + 20, updatedPlayer.maxHealth);
            break;
          case 'speed':
            updatedPlayer.speed = Math.round(updatedPlayer.speed * 1.1);
            break;
          case 'might':
            // Boost damage on both the gun and the melee weapon.
            updatedPlayer.weapons = updatedPlayer.weapons.map(w => ({
              ...w, damage: w.damage * 1.12
            }));
            break;
          case 'cooldown':
            // Faster fire rate on the gun (melee cooldown is 0, untouched).
            updatedPlayer.weapons = updatedPlayer.weapons.map(w => ({
              ...w, cooldown: w.cooldown > 0 ? Math.max(80, w.cooldown * 0.9) : w.cooldown
            }));
            break;
          case 'amount':
            // Extra bullet/pellet per shot for the gun.
            updatedPlayer.weapons = updatedPlayer.weapons.map(w =>
              w.isMelee ? w : { ...w, count: (w.count || 1) + 1 }
            );
            break;
          case 'critChance':
            updatedPlayer.critChance = Math.min(0.6, updatedPlayer.critChance + 0.05);
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
          gameStats: newStats
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
      const { enemies, player, gameTime } = state;
      const now = Date.now();

      const updatedEnemies = enemies.map(enemy => {
        // Knockback overrides chase AI: while it's active, slide outward
        // with linearly-decaying velocity instead of seeking the player.
        if (enemy.knockbackUntil && now < enemy.knockbackUntil) {
          const remaining = enemy.knockbackUntil - now;
          const decay = Math.max(0, remaining / KNOCKBACK_DURATION); // 1 → 0
          return {
            ...enemy,
            x: enemy.x + (enemy.knockbackVx ?? 0) * decay * deltaTime,
            y: enemy.y + (enemy.knockbackVy ?? 0) * decay * deltaTime
          };
        }

        // Stun (from a crit) freezes the enemy in place — it's a sitting duck
        // for a melee finisher. gameTime-based so pauses don't cheat the timer.
        if (enemy.stunUntil !== undefined && gameTime < enemy.stunUntil) {
          return enemy;
        }

        // Plants are nearly stationary — they shuffle slightly toward the
        // player but mostly hold ground and spit seeds. Everything else
        // does the standard VS straight-line chase.
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        const dirX = dx / distance;
        const dirY = dy / distance;

        const speed = enemy.type === 'plant' ? enemy.speed * 0.25 : enemy.speed;

        return {
          ...enemy,
          x: enemy.x + dirX * speed * deltaTime,
          y: enemy.y + dirY * speed * deltaTime
        };
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
  knockbackEnemy: (id, dirX, dirY) => {
    const now = Date.now();
    set(state => ({
      enemies: state.enemies.map(e =>
        e.id === id
          ? {
              ...e,
              knockbackVx: dirX * BULLET_KNOCKBACK_SPEED,
              knockbackVy: dirY * BULLET_KNOCKBACK_SPEED,
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
      const { projectiles, player, gameBounds } = state;
      const cullRadius = Math.max(gameBounds.width, gameBounds.height);
      const playerCX = player.x + player.width / 2;
      const playerCY = player.y + player.height / 2;

      const updatedProjectiles = projectiles
        .filter(p => {
          if (currentTime - p.createdAt > p.duration) return false;
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
        get().addAmmo('handgun', AMMO_PICKUP.handgun);
        break;
      case 'ammo-shotgun':
        get().addAmmo('shotgun', AMMO_PICKUP.shotgun);
        break;
      case 'ammo-rifle':
        get().addAmmo('rifle', AMMO_PICKUP.rifle);
        break;
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

  // Equip a dropped/crate weapon into its slot. Auto-pick: a weapon only
  // replaces the current gun/melee if it's the same or a higher tier (so a
  // stray T1 drop never downgrades a T3). Otherwise it's discarded.
  grantWeapon: (key) => {
    const weapon = createWeapon(key);
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

      if (current && (weapon.tier ?? 1) < (current.tier ?? 1)) {
        return {}; // already own a better gun of this category
      }

      const weapons = [...player.weapons];
      if (idx >= 0) weapons[idx] = weapon; else weapons.push(weapon);

      // Keep the active selection sensible: stay on the upgraded active gun
      // (its id changed), or arm the new gun if we had none / were dry.
      const hadGun = getGuns(player).length > 0;
      const activeDry =
        !hadGun ||
        (getActiveGun(player)?.ammoType
          ? ammoPoolFor(player, getActiveGun(player)!.ammoType!) <= 0
          : true);
      let activeWeaponId = player.activeWeaponId;
      if (isActiveCategory || !hadGun || activeDry) {
        activeWeaponId = weapon.id;
      }

      return { player: { ...player, weapons, activeWeaponId } };
    });
  },

  // Manually arm a specific gun (from the HUD weapon icons). Ignores melee.
  setActiveWeapon: (id) => {
    set(state => {
      const target = state.player.weapons.find(w => w.id === id && !w.isMelee);
      if (!target) return {};
      return { player: { ...state.player, activeWeaponId: id } };
    });
  },

  // If the active gun's pool is empty, auto-arm another owned gun that still
  // has ammo. Returns nothing; safe to call every frame before firing.
  autoSwitchIfDry: () => {
    const player = get().player;
    const active = getActiveGun(player);
    if (active?.ammoType && ammoPoolFor(player, active.ammoType) > 0) return;
    const stocked = getGuns(player).find(
      w => w.ammoType && ammoPoolFor(player, w.ammoType) > 0
    );
    if (stocked && stocked.id !== player.activeWeaponId) {
      set(state => ({ player: { ...state.player, activeWeaponId: stocked.id } }));
    }
  },
  
  // Game state actions
  setGameTime: (time) => {
    set({ gameTime: time });
  },
  
  setPaused: (paused) => {
    set({ isPaused: paused });
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
    
    set(state => {
      void state;
      // World is infinite; player starts at the origin and the camera
      // follows. No need to pre-center within bounds.
      return {
        player: {
          x: 0,
          y: 0,
          width: PLAYER_HITBOX,
          height: PLAYER_HITBOX,
          speed: PLAYER_BASE_SPEED,
          health: PLAYER_BASE_HP,
          maxHealth: PLAYER_BASE_HP,
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
          critChance: 0.07,
          moveFrozenUntil: 0
        },
        enemies: [],
        projectiles: [],
        pickups: [],
        gameTime: 0,
        isPaused: false,
        showUpgradeMenu: false,
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
        }
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