import { Player, Enemy, Projectile, Pickup } from '../types/game';

// Check collision between two rectangles
export const checkCollision = (
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): boolean => {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
};

// The player's DAMAGE hitbox is smaller than the sprite so near-misses don't
// clip — only used for taking damage (enemy contact, hostile bolts), not for
// picking things up. 2/3 of the full body, centered.
const PLAYER_HIT_SCALE = 2 / 3;
const playerHitbox = (player: { x: number; y: number; width: number; height: number }) => {
  const w = player.width * PLAYER_HIT_SCALE;
  const h = player.height * PLAYER_HIT_SCALE;
  return {
    x: player.x + (player.width - w) / 2,
    y: player.y + (player.height - h) / 2,
    width: w,
    height: h
  };
};

const throwProgress = (pickup: Pickup, now: number): number => {
  if (
    pickup.throwFromX === undefined ||
    pickup.throwFromY === undefined ||
    pickup.throwStartAt === undefined ||
    pickup.throwDuration === undefined ||
    pickup.throwDuration <= 0
  ) {
    return 1;
  }
  return Math.max(0, Math.min(1, (now - pickup.throwStartAt) / pickup.throwDuration));
};

export const pickupDisplayPosition = (pickup: Pickup, now = Date.now()) => {
  const t = throwProgress(pickup, now);
  if (t >= 1 || pickup.throwFromX === undefined || pickup.throwFromY === undefined) {
    return { x: pickup.x, y: pickup.y, arc: 0 };
  }
  const eased = 1 - Math.pow(1 - t, 2);
  const arc = Math.sin(Math.PI * t) * 24;
  return {
    x: pickup.throwFromX + (pickup.x - pickup.throwFromX) * eased,
    y: pickup.throwFromY + (pickup.y - pickup.throwFromY) * eased - arc,
    arc
  };
};

// Check collisions between projectiles and enemies
export const checkProjectileEnemyCollisions = (
  projectiles: Projectile[],
  enemies: Enemy[]
): { projectileId: string; enemyId: string; damage: number }[] => {
  const collisions: { projectileId: string; enemyId: string; damage: number }[] = [];
  const now = Date.now();

  projectiles.forEach(projectile => {
    // Hostile projectiles only damage enemies once they've been reflected
    if (projectile.hostile) return;
    // Timed grenades explode from their own fuse, not from body contact.
    // Decoys are stationary interceptor devices: they tick down on a timer and
    // shoot down enemy bullets — they must NOT be consumed by enemy body contact.
    if (projectile.weaponType === 'grenade' || projectile.weaponType === 'trap' || projectile.weaponType === 'decoy') return;
    // Scheduled-but-not-yet-active projectiles (e.g. the second slash of a
    // whip chain) shouldn't deal damage until their start time arrives.
    if (projectile.createdAt > now) return;
    enemies.forEach(enemy => {
      // Skip if already hit by this projectile (for passthrough weapons)
      if (projectile.hitEnemies.includes(enemy.id)) {
        return;
      }

      if (checkCollision(projectile, enemy)) {
        collisions.push({
          projectileId: projectile.id,
          enemyId: enemy.id,
          damage: projectile.damage
        });

        // Add to hit enemies list for passthrough weapons
        if (projectile.passthrough) {
          projectile.hitEnemies.push(enemy.id);
        }
      }
    });
  });

  return collisions;
};

// Check collisions between hostile projectiles and the player.
// Returns the projectiles that collided so the caller can decide whether
// they were guarded, reflected, or did damage.
export const checkProjectilePlayerCollisions = (
  projectiles: Projectile[],
  player: Player
): Projectile[] => {
  const hit = playerHitbox(player);
  return projectiles.filter(p => p.hostile && checkCollision(p, hit));
};

// Check collisions between player and enemies (uses the reduced damage hitbox)
export const checkPlayerEnemyCollisions = (
  player: Player,
  enemies: Enemy[]
): Enemy[] => {
  const hit = playerHitbox(player);
  return enemies.filter(enemy => checkCollision(hit, enemy));
};

// Check collisions between player and pickups
export const checkPlayerPickupCollisions = (
  player: Player,
  pickups: Pickup[]
): string[] => {
  // Slight magnet around the player so collection feels snappy without
  // hoovering pickups from across the screen.
  const PAD = 16;
  const expandedPlayer = {
    x: player.x - PAD,
    y: player.y - PAD,
    width: player.width + PAD * 2,
    height: player.height + PAD * 2
  };

  // Pickups don't carry width/height in the type, so treat them as the
  // 16×16 sprite the renderer draws.
  const PICKUP_SIZE = 16;
  const now = Date.now();

  return pickups
    .filter(pickup => {
      if (
        pickup.throwStartAt !== undefined &&
        pickup.throwDuration !== undefined &&
        now - pickup.throwStartAt < pickup.throwDuration
      ) {
        return false;
      }
      const pos = pickupDisplayPosition(pickup, now);
      return checkCollision(expandedPlayer, {
        x: pos.x,
        y: pos.y,
        width: PICKUP_SIZE,
        height: PICKUP_SIZE
      });
    })
    .map(pickup => pickup.id);
};

// Calculate distance between two points
export const getDistance = (
  x1: number, 
  y1: number, 
  x2: number, 
  y2: number
): number => {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
};
