import { Enemy, EnemyType, Player, GameBounds } from '../types/game';
import { spawnEnemyAt } from './enemyUtils';

// Mad Forest's scripted wave/elite/boss schedule. Each event has a fixed
// trigger time and a spawn pattern. The game loop calls
// consumeDueWaves(gameTime, ...) every frame; events past their time fire
// exactly once and are then marked consumed.

type Spawner = (player: Player, bounds: GameBounds, gameTime: number) => Enemy[];

interface WaveEvent {
  id: string;
  triggerAtMs: number;
  spawner: Spawner;
}

// Helper — distribute N enemies around the player just outside the viewport
const ringAroundPlayer = (
  type: EnemyType,
  count: number,
  radius: number,
  player: Player,
  gameTime: number
): Enemy[] => {
  const enemies: Enemy[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2 + Math.random() * 0.2;
    const x = player.x + Math.cos(theta) * radius;
    const y = player.y + Math.sin(theta) * radius;
    enemies.push(spawnEnemyAt(type, x, y, gameTime));
  }
  return enemies;
};

// Helper — line of enemies along one off-screen edge
const lineFromSide = (
  type: EnemyType,
  count: number,
  side: 'top' | 'right' | 'bottom' | 'left',
  player: Player,
  bounds: GameBounds,
  gameTime: number
): Enemy[] => {
  const enemies: Enemy[] = [];
  const half = { x: bounds.width / 2 + 80, y: bounds.height / 2 + 80 };
  for (let i = 0; i < count; i++) {
    const along = (i / Math.max(1, count - 1) - 0.5) * Math.max(bounds.width, bounds.height);
    let x = player.x;
    let y = player.y;
    if (side === 'top')    { y -= half.y; x += along; }
    if (side === 'bottom') { y += half.y; x += along; }
    if (side === 'left')   { x -= half.x; y += along; }
    if (side === 'right')  { x += half.x; y += along; }
    enemies.push(spawnEnemyAt(type, x, y, gameTime));
  }
  return enemies;
};

const WAVE_EVENTS: WaveEvent[] = [
  {
    // First boss — single pumpkin so the player gets their first chest
    // within ~3 minutes regardless of how the spawner is rolling.
    id: 'pumpkin-solo-3min',
    triggerAtMs: 3 * 60 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('pumpkin', 1, 280, player, t)
  },
  {
    id: 'pumpkin-elites-5min',
    triggerAtMs: 5 * 60 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('pumpkin', 3, 320, player, t)
  },
  {
    id: 'bat-horde-7min',
    triggerAtMs: 7 * 60 * 1000,
    spawner: (player, bounds, t) => lineFromSide('bat', 40, 'right', player, bounds, t)
  },
  {
    id: 'giantbat-10min',
    triggerAtMs: 10 * 60 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('giantbat', 1, 280, player, t)
  },
  {
    id: 'werewolf-pack-12min',
    triggerAtMs: 12 * 60 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('werewolf', 12, 360, player, t)
  },
  {
    id: 'zombie-line-15min',
    triggerAtMs: 15 * 60 * 1000,
    spawner: (player, bounds, t) => lineFromSide('zombie', 30, 'left', player, bounds, t)
  },
  {
    id: 'pumpkin-ring-18min',
    triggerAtMs: 18 * 60 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('pumpkin', 8, 380, player, t)
  },
  {
    id: 'giantbat-pair-20min',
    triggerAtMs: 20 * 60 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('giantbat', 2, 320, player, t)
  },
  {
    // Mid/late-game chest opportunity so the player has a fresh upgrade
    // pick before the 25:00 ghost swarm rolls in.
    id: 'giantbat-solo-22min',
    triggerAtMs: 22 * 60 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('giantbat', 1, 320, player, t)
  },
  {
    id: 'ghost-swarm-25min',
    triggerAtMs: 25 * 60 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('ghost', 30, 400, player, t)
  },
  {
    id: 'pumpkin-pair-27min',
    triggerAtMs: 27 * 60 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('pumpkin', 2, 320, player, t)
  },
  {
    id: 'reaper',
    triggerAtMs: 30 * 60 * 1000,
    spawner: (player, _b, t) => [spawnEnemyAt('reaper', player.x - 100, player.y - 100, t)]
  }
];

// Caller-managed consumption set. Reset on game restart.
export type ConsumedWaves = Set<string>;
export const newConsumedWaves = (): ConsumedWaves => new Set();

export const consumeDueWaves = (
  gameTime: number,
  consumed: ConsumedWaves,
  player: Player,
  bounds: GameBounds
): Enemy[] => {
  const out: Enemy[] = [];
  for (const ev of WAVE_EVENTS) {
    if (consumed.has(ev.id)) continue;
    if (gameTime < ev.triggerAtMs) continue;
    consumed.add(ev.id);
    out.push(...ev.spawner(player, bounds, gameTime));
  }
  return out;
};

// True once Reaper has been released into the world. The HUD uses this to
// flip into a final "REAPER" warning state.
export const reaperHasSpawned = (consumed: ConsumedWaves) => consumed.has('reaper');

// Pre-warning: returns true in the 30s before Reaper spawn, so the HUD can
// flash a banner.
export const reaperWarningActive = (gameTime: number, consumed: ConsumedWaves) =>
  !consumed.has('reaper') &&
  gameTime >= 30 * 60 * 1000 - 30000 &&
  gameTime < 30 * 60 * 1000;
