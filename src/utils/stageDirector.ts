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

// Helper — a ring of mixed enemy types (one per entry), for set-piece swarms
const mixedRing = (
  types: EnemyType[],
  radius: number,
  player: Player,
  gameTime: number
): Enemy[] =>
  types.map((type, i) => {
    const theta = (i / types.length) * Math.PI * 2 + Math.random() * 0.2;
    const x = player.x + Math.cos(theta) * radius;
    const y = player.y + Math.sin(theta) * radius;
    return spawnEnemyAt(type, x, y, gameTime);
  });

// 4:10基準の旧フィナーレ定数。現在の警告は廃止(出現時バナーのみ)だが、互換のため5分(城ボス時刻)に合わせて残置。
export const FINALE_BOSS_TIME_MS = 300 * 1000; // 5:00(城ボス出現と同時刻)

// Compressed ~5-minute set-piece script. Designed as a tension curve:
// calm intro → first counter → mid-boss spike → build → 7-strong onslaught →
// second spike → short lull → finale boss. Weapon crates are dropped on a
// separate timed schedule (see useGameLoop) plus from every mid-boss kill.
const WAVE_EVENTS: WaveEvent[] = [
  {
    // 0:25 — a lone ranged plant so the player meets the counter early.
    id: 'plant-intro-25s',
    triggerAtMs: 25 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('plant', 1, 260, player, t)
  },
  {
    // 1:15 — first mid-boss spike; drops a weapon crate on death.
    id: 'pumpkin-solo-75s',
    triggerAtMs: 75 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('pumpkin', 1, 300, player, t)
  },
  {
    // 2:00 — refresh the ranged presence after the first plant is likely dead,
    // so counters stay part of the kit. The spawner caps live plants at 2.
    id: 'plant-refresh-120s',
    triggerAtMs: 120 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('plant', 1, 280, player, t)
  },
  {
    // 2:45 — PEAK: a 7-strong melee onslaught crashes in from all sides.
    id: 'onslaught-165s',
    triggerAtMs: 165 * 1000,
    spawner: (player, _b, t) => mixedRing(
      ['zombie', 'skeleton', 'zombie', 'werewolf', 'skeleton', 'zombie', 'skeleton'],
      360, player, t
    )
  },
  {
    // 3:30 — second mid-boss spike (pair) to gear up before the finale.
    id: 'pumpkin-pair-210s',
    triggerAtMs: 210 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('pumpkin', 2, 320, player, t)
  }
  // フィナーレ(giantbat)は stageDirector では出さない。城(固定設置)から5分で出現する城ボス経路に一本化(useGameLoop)。
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
