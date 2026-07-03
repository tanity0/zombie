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

// (旧・FINALE_BOSS_TIME_MSはv0.25.1373で削除: 城ボス時刻の実体はuseGameLoop.tsの
//  CASTLE_BOSS_MIN_TIME_MS(7:00)。未参照の重複定数を残すと「死んだ方を編集する」事故のもと。)

// ~7分アークのセットピース台本(社長指示で5分→7分へ再配置・×1.4ストレッチ)。緊張カーブは維持:
// 静かな導入 → 初カウンター → 中ボススパイク → 立て直し → 7体オンスロート(ピーク) → 第二スパイク →
// 最終育成 → 7:00 城ボス。武器箱は別スケジュール(useGameLoop)＋各中ボス撃破でドロップ。
// (フェーズ状態機械/動的難易度は別ステップで載せる。本変更は既存イベントの時刻再配置のみ。)
const WAVE_EVENTS: WaveEvent[] = [
  {
    // 0:35 — a lone ranged plant so the player meets the counter early.
    id: 'plant-intro-35s',
    triggerAtMs: 35 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('plant', 1, 260, player, t)
  },
  {
    // 1:45 — first mid-boss spike; drops a weapon crate on death.
    id: 'pumpkin-solo-105s',
    triggerAtMs: 105 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('pumpkin', 1, 300, player, t)
  },
  {
    // 2:50 — refresh the ranged presence after the first plant is likely dead,
    // so counters stay part of the kit. The spawner caps live plants at 2.
    id: 'plant-refresh-170s',
    triggerAtMs: 170 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('plant', 1, 280, player, t)
  },
  {
    // 3:55 — PEAK: a 7-strong melee onslaught crashes in from all sides.
    id: 'onslaught-235s',
    triggerAtMs: 235 * 1000,
    spawner: (player, _b, t) => mixedRing(
      ['zombie', 'skeleton', 'zombie', 'werewolf', 'skeleton', 'zombie', 'skeleton'],
      360, player, t
    )
  },
  {
    // 4:55 — second mid-boss spike (pair) to gear up before the finale.
    id: 'pumpkin-pair-295s',
    triggerAtMs: 295 * 1000,
    spawner: (player, _b, t) => ringAroundPlayer('pumpkin', 2, 320, player, t)
  }
  // フィナーレ(giantbat)は stageDirector では出さない。城(固定設置)から7分で出現する城ボス経路に一本化(useGameLoop)。
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
