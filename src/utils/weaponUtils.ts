import { Weapon, CharacterClass, WeaponType, Projectile, Player, Enemy } from '../types/game';
import { useGameStore } from '../store/gameStore';

// Starting weapons modeled after Vampire Survivors' default-character map:
//   warrior  ≈ Antonio   → Whip
//   mage     ≈ Imelda    → Magic Wand (auto-target)
//   rogue    ≈ Pasqualina→ Knife (linear throw)
//   necromancer ≈ Arca/Poppea → Garlic (aura)
export const getStartingWeapons = (characterClass: CharacterClass): Weapon[] => {
  switch (characterClass) {
    case 'warrior':
      return [{
        id: 'weapon-whip',
        name: '鞭',
        type: 'whip',
        damage: 12,
        cooldown: 1200,
        lastFired: 0,
        level: 1,
        area: 130,
        duration: 220
      }];

    case 'mage':
      return [{
        id: 'weapon-wand',
        name: '魔法の杖',
        type: 'wand',
        damage: 10,
        cooldown: 1100,
        lastFired: 0,
        level: 1,
        projectileSpeed: 360,
        projectileSize: 14,
        passthrough: false
      }];

    case 'rogue':
      return [{
        id: 'weapon-knife',
        name: '投げナイフ',
        type: 'knife',
        damage: 8,
        cooldown: 600,
        lastFired: 0,
        level: 1,
        projectileSpeed: 420,
        projectileSize: 12,
        passthrough: false,
        count: 1
      }];

    case 'necromancer':
      return [{
        id: 'weapon-garlic',
        name: 'ニンニク',
        type: 'garlic',
        damage: 3,
        cooldown: 300,
        lastFired: 0,
        level: 1,
        area: 110
      }];

    default:
      return [{
        id: 'weapon-whip',
        name: '鞭',
        type: 'whip',
        damage: 10,
        cooldown: 1200,
        lastFired: 0,
        level: 1,
        area: 120,
        duration: 220
      }];
  }
};

// Whip slash counter — global flip flag so the whip alternates left/right
// like in VS (Antonio's iconic forward/back slash cycle).
let whipSwingLeft = false;

// Helper: build a single horizontal slash slab. `delay` shifts when the
// slash becomes active/visible (used for the chained second slash).
const buildWhipSlash = (
  player: Player,
  weapon: Weapon,
  facingLeft: boolean,
  delay: number,
  spawnedAt: number
): Projectile => {
  const area = (weapon.area || 130) + 20 * (weapon.level - 1);
  const slashHeight = 56 + 6 * (weapon.level - 1);
  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;
  return {
    id: `proj-${weapon.id}-${spawnedAt}-${facingLeft ? 'L' : 'R'}-${delay}`,
    x: facingLeft ? px - area : px,
    y: py - slashHeight / 2,
    width: area,
    height: slashHeight,
    speed: 0,
    damage: weapon.damage,
    direction: { x: facingLeft ? -1 : 1, y: 0 },
    weaponType: 'whip',
    // createdAt in the future delays both the visual fade-in (see renderer)
    // and the collision check (gated below in useGameLoop via hitEnemies).
    duration: (weapon.duration || 230) + delay,
    createdAt: spawnedAt + delay,
    passthrough: true,
    hitEnemies: [],
    hostile: false,
    reflected: false
  };
};


// Per-weapon kind, return the projectiles fired this tick (cooldown-aware).
export const fireWeapon = (weapon: Weapon, player: Player, enemies: Enemy[]): Projectile[] => {
  const projectiles: Projectile[] = [];
  const now = Date.now();

  if (now - weapon.lastFired < weapon.cooldown) {
    return [];
  }

  switch (weapon.type) {
    case 'knife': {
      // Linear throw in the player's last move direction; default = up.
      let direction = { x: 0, y: -1 };
      if (player.lastDirection) {
        direction = { ...player.lastDirection };
      } else if (player.direction !== 'idle') {
        if (player.direction === 'right') direction = { x: 1, y: 0 };
        else if (player.direction === 'left') direction = { x: -1, y: 0 };
        else if (player.direction === 'down') direction = { x: 0, y: 1 };
        else if (player.direction === 'up') direction = { x: 0, y: -1 };
      }

      const count = (weapon.count || 1) + Math.floor(weapon.level / 2);
      const spread = 0.18;

      for (let i = 0; i < count; i++) {
        let pd = { ...direction };
        if (count > 1) {
          const angle = -spread * (count - 1) / 2 + i * spread;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          pd = {
            x: direction.x * cos - direction.y * sin,
            y: direction.x * sin + direction.y * cos
          };
        }

        projectiles.push({
          id: `proj-${weapon.id}-${now}-${i}`,
          x: player.x + player.width / 2 - (weapon.projectileSize || 12) / 2,
          y: player.y + player.height / 2 - (weapon.projectileSize || 12) / 2,
          width: weapon.projectileSize || 12,
          height: weapon.projectileSize || 12,
          speed: weapon.projectileSpeed || 420,
          damage: weapon.damage,
          direction: pd,
          weaponType: weapon.type,
          duration: 1600,
          createdAt: now,
          passthrough: weapon.passthrough || weapon.level >= 5,
          hitEnemies: [],
          hostile: false,
          reflected: false
        });
      }
      break;
    }

    case 'axe': {
      // Throw axes upward; gravity pulls them back down (proper parabola).
      // Each axe pierces. Level adds more axes per throw and a faster cycle.
      const count = 1 + Math.floor(weapon.level / 2);
      const baseUp = -1.1; // initial upward unit velocity
      for (let i = 0; i < count; i++) {
        const xKick = ((i - (count - 1) / 2) * 0.35) + (Math.random() - 0.5) * 0.4;
        projectiles.push({
          id: `proj-${weapon.id}-${now}-${i}`,
          x: player.x + player.width / 2 - (weapon.projectileSize || 22) / 2,
          y: player.y + player.height / 2 - (weapon.projectileSize || 22) / 2,
          width: weapon.projectileSize || 22,
          height: weapon.projectileSize || 22,
          speed: weapon.projectileSpeed || 320,
          damage: weapon.damage,
          // direction.y is negative (upward) — gravity adds positive y over
          // time, flipping it. The exact magnitude isn't normalized; the
          // simulator uses direction*speed*dt directly.
          direction: { x: xKick, y: baseUp },
          weaponType: weapon.type,
          duration: 2400,
          createdAt: now,
          passthrough: true,
          hitEnemies: [],
          hostile: false,
          reflected: false,
          gravity: 4.2
        });
      }
      break;
    }

    case 'wand': {
      // Auto-target nearest enemy (within a generous range).
      if (enemies.length === 0) break;
      let closest: Enemy | null = null;
      let closestD2 = Infinity;
      for (const e of enemies) {
        const dx = e.x - player.x;
        const dy = e.y - player.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < closestD2) {
          closestD2 = d2;
          closest = e;
        }
      }
      if (!closest) break;

      const dx = closest.x - player.x;
      const dy = closest.y - player.y;
      const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
      const dir = { x: dx / dist, y: dy / dist };

      const shots = 1 + Math.floor(weapon.level / 2);
      for (let i = 0; i < shots; i++) {
        const angle = (i - (shots - 1) / 2) * 0.18;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        projectiles.push({
          id: `proj-${weapon.id}-${now}-${i}`,
          x: player.x + player.width / 2 - (weapon.projectileSize || 12) / 2,
          y: player.y + player.height / 2 - (weapon.projectileSize || 12) / 2,
          width: weapon.projectileSize || 12,
          height: weapon.projectileSize || 12,
          speed: weapon.projectileSpeed || 360,
          damage: weapon.damage,
          direction: { x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c },
          weaponType: weapon.type,
          duration: 1600,
          createdAt: now,
          passthrough: weapon.level >= 5,
          hitEnemies: [],
          hostile: false,
          reflected: false
        });
      }
      break;
    }

    case 'whip': {
      // VS-style whip: each fire is a CHAIN of slashes (default 2). The
      // chain alternates left/right per fire so over time both sides are
      // covered. At Lv4+ the chain becomes 3 slashes. Each subsequent
      // slash in the chain is offset by a short delay so the renderer
      // shows them as two consecutive flashes.
      whipSwingLeft = !whipSwingLeft;
      const facingLeftBias = whipSwingLeft;
      const chain = weapon.level >= 4 ? 3 : 2;
      const stride = 120;
      for (let i = 0; i < chain; i++) {
        // Alternate sides within the chain so a 2-chain hits left then right.
        const left = (i % 2 === 0) ? facingLeftBias : !facingLeftBias;
        projectiles.push(buildWhipSlash(player, weapon, left, i * stride, now));
      }
      break;
    }

    case 'bible': {
      // True orbital weapon. Books circle the player continuously via the
      // orbit fields; updateProjectiles recomputes their position each
      // frame. We only respawn the orbit when the player has fewer bibles
      // alive than the expected level-derived count (e.g. after death or
      // when the weapon levels up). Otherwise we no-op so the cooldown
      // doesn't keep doubling the books.
      const expected = 2 + weapon.level;
      const radius = 70 + 5 * weapon.level;
      const size = weapon.projectileSize || 18;
      // Effectively-permanent orbit. We never expire on duration; the only
      // way to despawn is the explicit cleanup at level-up below.
      const lifetime = 60_000;
      const aliveBibles = useGameStore.getState().projectiles
        .filter(pp => pp.weaponType === 'bible' && pp.orbitRadius !== undefined)
        .length;
      if (aliveBibles >= expected) {
        // Another revolution is already in flight; bump the cooldown so we
        // don't re-check every frame, but don't spawn duplicates.
        break;
      }
      // Despawn any leftover stale bibles before spawning the new set.
      useGameStore.setState(state => ({
        projectiles: state.projectiles.filter(
          pp => !(pp.weaponType === 'bible' && pp.orbitRadius !== undefined)
        )
      }));
      for (let i = 0; i < expected; i++) {
        const angle = (i / expected) * Math.PI * 2;
        projectiles.push({
          id: `proj-${weapon.id}-${now}-${i}`,
          x: player.x + player.width / 2 + Math.cos(angle) * radius - size / 2,
          y: player.y + player.height / 2 + Math.sin(angle) * radius - size / 2,
          width: size,
          height: size,
          speed: 0,
          damage: weapon.damage,
          direction: { x: 0, y: 0 },
          weaponType: weapon.type,
          duration: lifetime,
          createdAt: now,
          passthrough: true,
          hitEnemies: [],
          hostile: false,
          reflected: false,
          orbitRadius: radius,
          orbitAngle: angle,
          orbitSpeed: 5 // rad/s; ~0.8 revolutions per second
        });
      }
      break;
    }

    case 'garlic': {
      // Persistent aura that snaps to the player every frame. We respawn
      // it each cooldown so the hit-list resets and the same enemy gets
      // damage ticks (otherwise hitEnemies would lock out repeat hits).
      const area = (weapon.area || 110) + 14 * (weapon.level - 1);
      // Clear stale auras first so we never stack two at once.
      useGameStore.setState(state => ({
        projectiles: state.projectiles.filter(
          pp => !(pp.weaponType === 'garlic' && pp.followsPlayer)
        )
      }));
      projectiles.push({
        id: `proj-${weapon.id}-${now}`,
        x: player.x + player.width / 2 - area / 2,
        y: player.y + player.height / 2 - area / 2,
        width: area,
        height: area,
        speed: 0,
        damage: weapon.damage,
        direction: { x: 0, y: 0 },
        weaponType: weapon.type,
        duration: weapon.cooldown + 80,
        createdAt: now,
        passthrough: true,
        hitEnemies: [],
        hostile: false,
        reflected: false,
        followsPlayer: true
      });
      break;
    }
  }

  // Bookkeeping: record lastFired so the cooldown gate works next tick.
  useGameStore.setState(state => ({
    player: {
      ...state.player,
      weapons: state.player.weapons.map(w =>
        w.id === weapon.id ? { ...w, lastFired: now } : w
      )
    }
  }));

  return projectiles;
};

export const getWeaponDisplayName = (type: WeaponType): string => {
  switch (type) {
    case 'knife': return '投げナイフ';
    case 'axe': return '斧';
    case 'wand': return '魔法の杖';
    case 'whip': return '鞭';
    case 'bible': return '聖書';
    case 'garlic': return 'ニンニク';
    default: return '不明';
  }
};

export const getWeaponDescription = (type: WeaponType, level: number): string => {
  switch (type) {
    case 'knife':
      return level === 1
        ? '前方に直線的に飛ぶナイフ'
        : `Lv${level} - 発射数と貫通が向上`;
    case 'axe':
      return level === 1
        ? '上方向に複数の斧を放つ'
        : `Lv${level} - 発射数とダメージが向上`;
    case 'wand':
      return level === 1
        ? '最も近い敵を自動追尾する魔法弾'
        : `Lv${level} - 弾数と貫通が向上`;
    case 'whip':
      return level === 1
        ? '左右に交互に振るう鞭'
        : level >= 4
          ? `Lv${level} - 左右同時に振るう`
          : `Lv${level} - 範囲とダメージが向上`;
    case 'bible':
      return level === 1
        ? '自分の周りを回転する聖書'
        : `Lv${level} - ${2 + level}冊が周回する`;
    case 'garlic':
      return level === 1
        ? '周囲の敵を継続的に焼くオーラ'
        : `Lv${level} - 範囲とダメージが向上`;
    default:
      return '不明';
  }
};
