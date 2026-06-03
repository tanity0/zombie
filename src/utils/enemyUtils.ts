import { Enemy, EnemyType, GameBounds, Player, Projectile } from '../types/game';

// Mad-Forest port: a stat sheet per enemy type. Difficulty multiplier scales
// the base values over time so a 25-minute zombie has more HP than a 1-minute
// zombie, mirroring how VS ramps. Spawn weights for each type live in the
// stage director (selectEnemyType) below.
interface EnemyStats {
  width: number;
  height: number;
  speed: number;       // px/s at base difficulty
  health: number;
  damage: number;
  experienceValue: number;
}

const ENEMY_STATS: Record<EnemyType, EnemyStats> = {
  bat:       { width: 22, height: 22, speed: 75,  health: 8,    damage: 6,   experienceValue: 1 },
  skeleton:  { width: 26, height: 26, speed: 60,  health: 18,   damage: 8,   experienceValue: 1 },
  zombie:    { width: 30, height: 30, speed: 42,  health: 40,   damage: 10,  experienceValue: 2 },
  plant:     { width: 28, height: 28, speed: 8,   health: 25,   damage: 0,   experienceValue: 2 },
  ghost:     { width: 24, height: 24, speed: 90,  health: 14,   damage: 5,   experienceValue: 1 },
  werewolf:  { width: 30, height: 30, speed: 105, health: 32,   damage: 12,  experienceValue: 3 },
  pumpkin:   { width: 40, height: 40, speed: 55,  health: 150,  damage: 16,  experienceValue: 8 },
  giantbat:  { width: 60, height: 60, speed: 70,  health: 500,  damage: 22,  experienceValue: 30 },
  reaper:    { width: 80, height: 80, speed: 130, health: 99999,damage: 999, experienceValue: 0 }
};

// Stage director: which enemy types are eligible at this gameTime, and how
// likely each is to be picked. Modeled after Mad Forest's gentle ramp.
interface EnemyWeight { type: EnemyType; weight: number; }

const selectEnemyType = (gameTime: number): EnemyType => {
  const t = gameTime;
  const pool: EnemyWeight[] = [];

  // 0:00-0:30 — only bats
  pool.push({ type: 'bat', weight: 100 });

  if (t >= 30000)  pool.push({ type: 'skeleton', weight: 60 });
  if (t >= 90000)  pool.push({ type: 'zombie',   weight: 40 });
  if (t >= 120000) pool.push({ type: 'plant',    weight: 12 });
  if (t >= 180000) pool.push({ type: 'ghost',    weight: 50 });
  if (t >= 360000) pool.push({ type: 'werewolf', weight: 45 });

  // Past 8 min the early enemies thin out so later types dominate; tweak the
  // bat weight downward so the field doesn't stay swarmy forever.
  if (t >= 480000) pool[0].weight = 30;
  if (t >= 900000) pool[0].weight = 12; // 15 min onward, bats are rare

  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const entry of pool) {
    r -= entry.weight;
    if (r <= 0) return entry.type;
  }
  return pool[pool.length - 1].type;
};

// Compute a difficulty multiplier capped at 5×. Same shape as the legacy
// code; HP and damage scale with it, base speed does not (VS keeps enemy
// speed mostly constant, only the spawn pressure increases).
const difficultyFor = (gameTime: number) => Math.min(1 + gameTime / 90000, 5);

const buildEnemy = (
  type: EnemyType,
  x: number,
  y: number,
  gameTime: number,
  isWave = false
): Enemy => {
  const stats = ENEMY_STATS[type];
  const diff = difficultyFor(gameTime);
  // Reaper is a fixed terminal entity — don't scale it.
  const hpMult = type === 'reaper' ? 1 : diff;
  const dmgMult = type === 'reaper' ? 1 : Math.min(diff, 2.5);

  return {
    id: `enemy-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    x,
    y,
    width: stats.width,
    height: stats.height,
    speed: stats.speed,
    health: stats.health * hpMult,
    maxHealth: stats.health * hpMult,
    damage: Math.round(stats.damage * dmgMult),
    type,
    experienceValue: stats.experienceValue,
    lastHit: 0,
    lastShot: Date.now() - Math.random() * 1500,
    spawnedAt: gameTime,
    isWave
  };
};

// Generate a single enemy at a random point outside the camera viewport but
// close enough that it will plausibly reach the player. Used by both the
// continuous spawner and the wave/elite spawner.
export const generateEnemy = (
  gameTime: number,
  player: Player,
  gameBounds: GameBounds,
  forcedType?: EnemyType
): Enemy => {
  const type = forcedType ?? selectEnemyType(gameTime);
  const buffer = 50;
  const viewportWidth = gameBounds.width;
  const viewportHeight = gameBounds.height;

  const spawnSide = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;
  switch (spawnSide) {
    case 0:
      x = player.x - viewportWidth / 4 - buffer + Math.random() * (viewportWidth / 2 + buffer * 2);
      y = player.y - viewportHeight / 4 - buffer;
      break;
    case 1:
      x = player.x + viewportWidth / 4 + buffer;
      y = player.y - viewportHeight / 4 - buffer + Math.random() * (viewportHeight / 2 + buffer * 2);
      break;
    case 2:
      x = player.x - viewportWidth / 4 - buffer + Math.random() * (viewportWidth / 2 + buffer * 2);
      y = player.y + viewportHeight / 4 + buffer;
      break;
    case 3:
      x = player.x - viewportWidth / 4 - buffer;
      y = player.y - viewportHeight / 4 - buffer + Math.random() * (viewportHeight / 2 + buffer * 2);
      break;
  }
  return buildEnemy(type, x, y, gameTime, false);
};

// Spawn an enemy at a specific world position (used for Reaper, scripted
// elites, and horde lines). These are tagged isWave so the enemy-cap culler
// gives them a short grace period before they can be removed.
export const spawnEnemyAt = (
  type: EnemyType,
  x: number,
  y: number,
  gameTime: number
): Enemy => buildEnemy(type, x, y, gameTime, true);

// Hostile projectile profiles. In the Mad Forest port only `plant` shoots —
// everything else is pure melee. Plants spit seeds toward the player on a
// generous cadence so the counter has real targets to time off of.
export const ENEMY_PROJECTILE_DURATION = 4000;

interface FireProfile {
  interval: number;
  range: number;
  speed: number;
  damage: number;
  size: number;
}

export const getEnemyFireProfile = (enemy: Enemy): FireProfile | null => {
  if (enemy.type === 'plant') {
    return { interval: 2200, range: 380, speed: 230, damage: 7, size: 12 };
  }
  return null;
};

export const createEnemyProjectile = (
  enemy: Enemy,
  player: Player
): Projectile => {
  const profile = getEnemyFireProfile(enemy) ?? {
    speed: 200, damage: 6, size: 12, interval: 0, range: 0
  };
  const ex = enemy.x + enemy.width / 2;
  const ey = enemy.y + enemy.height / 2;
  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;

  const dx = px - ex;
  const dy = py - ey;
  const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  const dir = { x: dx / dist, y: dy / dist };

  return {
    id: `proj-enemy-${enemy.id}-${Date.now()}-${Math.random()}`,
    x: ex - profile.size / 2,
    y: ey - profile.size / 2,
    width: profile.size,
    height: profile.size,
    speed: profile.speed,
    damage: profile.damage,
    direction: dir,
    weaponType: 'enemy_bolt',
    duration: ENEMY_PROJECTILE_DURATION,
    createdAt: Date.now(),
    passthrough: false,
    hitEnemies: [],
    hostile: true,
    reflected: false
  };
};

// Color palette per type. Used by the renderer for the body fill.
export const getEnemyColor = (type: EnemyType): string => {
  switch (type) {
    case 'bat':      return '#1f1b2c';  // near-black purple
    case 'skeleton': return '#e7e3d3';  // bone white
    case 'zombie':   return '#5a7a3c';  // sickly green
    case 'plant':    return '#7e2a86';  // pink-purple
    case 'ghost':    return '#cbd5e1';  // pale blue-white
    case 'werewolf': return '#6b3f1d';  // dark brown
    case 'pumpkin':  return '#f97316';  // orange
    case 'giantbat': return '#11122c';  // very dark
    case 'reaper':   return '#0a0a0a';  // pitch black
    default:         return '#dc2626';
  }
};

// RE-style spawn cadence: a sparse, deliberate trickle, not a swarm. One
// enemy at a time, slow interval, so the field stays at ~5-10 bodies under
// the hard cap (see useGameLoop) instead of the VS wall-of-enemies.
export const getEnemySpawnInterval = (gameTime: number): number => {
  // ~2000ms at start → ~1200ms floor by ~26 minutes.
  const base = Math.max(1200, 2000 - gameTime / 2000);
  return base + Math.random() * 300;
};

export const getEnemySpawnCount = (_gameTime: number): number => {
  // Always one body per spawn tick — density is governed by the cap.
  return 1;
};
