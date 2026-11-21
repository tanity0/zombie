// ★ナイフ(近接)の浮きには落ちる速さの緩急(brawlerFallK)を当てない(社長指示2026-11-13「移動距離は変えないで」)。
// 浮いている間は追跡AIが止まる=浮きが伸びると戻りが遅れ、スラッシャーの2段目が届かなくなる。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import {
  brawlerAirborne, brawlerFallStretchMs, BRAWLER_GROUND_LAUNCH, BRAWLER_JUGGLE_WEIGHT, BRAWLER_JUGGLE_MIN_MS,
} from '../utils/brawlerCombo';
import { BRAWLER_LIFT_MS } from '../utils/brawler';

let now = 13_000_000;
afterEach(() => { vi.restoreAllMocks(); });

const setup = (slasher: boolean) => {
  now = 13_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: false },
    breakableProps: [],
    player: {
      ...st.player, health: 9999, maxHealth: 9999,
      ...(slasher ? { skills: [...st.player.skills, 'slasher'], skillLevels: { ...(st.player.skillLevels ?? {}), slasher: 3 } } : {}),
    },
  }));
  const p = useGameStore.getState().player;
  const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
  const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
  const z = { ...e, x: cx + 40 - e.width / 2, y: cy - e.height / 2, id: 'z', health: 99999, maxHealth: 99999, dormant: false } as Enemy;
  useGameStore.setState({ enemies: [z] });
};
const en = () => useGameStore.getState().enemies.find(e => e.id === 'z')!;

describe('ナイフの1撃目の浮き(落ちる速さの緩急の対象外)', () => {
  for (const slasher of [false, true]) {
    it(`地上の雑魚の浮きの長さは緩急なしの弧のまま(スラッシャー${slasher ? 'あり' : 'なし'})`, () => {
      setup(slasher);
      expect(brawlerAirborne(en(), now)).toBe(false);
      const r = useGameStore.getState().triggerCounter();
      expect(r.hit).toBe(true);
      const z = en();
      expect(brawlerAirborne(z, now)).toBe(true);
      // 地上の打ち上げ=3段目(s3)・雑魚の重さ。落ちる部分を伸ばさない元の弧の長さ。
      const f = BRAWLER_GROUND_LAUNCH.s3! * BRAWLER_JUGGLE_WEIGHT.mob;
      const plain = Math.max(BRAWLER_JUGGLE_MIN_MS, Math.round(BRAWLER_LIFT_MS * f));
      expect(z.brLiftFallK ?? 1).toBe(1);
      expect(z.brLiftMs).toBe(plain);
      expect(z.brLiftMs).toBe(brawlerFallStretchMs(plain, 1));
      expect(z.brLiftMs).toBeLessThan(brawlerFallStretchMs(plain, 1.25)); // 緩急を当てた長さではない
    });
  }
});
