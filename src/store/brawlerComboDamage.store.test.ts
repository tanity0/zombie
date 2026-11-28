// ★格闘のコンボ数のダメージ倍率(社長指示2026-11-28「格闘コンボ数に応じて1.1倍ずつ上げたい」「コンボダメージは2倍を天井にしよう」)。
// 数は「N HIT」と同じ(当たる直前の敵の brComboHits・敵が動ける時は0)。倍率=min(2, 1.1^n)。純関数は utils/brawlerCombo.test.ts。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import type { BrawlerMoveKey } from '../utils/brawlerTypes';

let now = 9_000_000;

const setup = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: { ...st.player, health: 9999, maxHealth: 9999, invulnerable: false, subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 }, lastDirection: { x: 1, y: 0 } },
  }));
};
/** プレイヤーの右隣に置く。combo=当たる直前につながっている数(固まりの中に置く=動けない)。0 なら固まりも数も無し。 */
const place = (combo: number): Enemy => {
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
  const gt = useGameStore.getState().gameTime;
  return {
    ...e, id: 'z', x: p.x + p.width / 2 + 40 - e.width / 2, y: p.y + p.height / 2 - e.height / 2,
    health: 9_999_999, maxHealth: 9_999_999, dormant: false,
    ...(combo > 0 ? { brComboHits: combo, brLockUntil: gt + 5000 } : {}),
  } as Enemy;
};
/** 同じ技を1発当てて、入ったダメージを返す。 */
const dealt = (combo: number, move: BrawlerMoveKey = 's1'): number => {
  setup();
  useGameStore.setState({ enemies: [place(combo)] });
  const h0 = useGameStore.getState().enemies[0].health;
  useGameStore.getState().triggerCounter(undefined, {
    targetIds: ['z'], mult: 1, brawler: true, stunMs: 45, kb: { kind: 'none' }, postureMult: 1, pressedAt: Date.now(), combo: { move },
  });
  return h0 - useGameStore.getState().enemies.find(e => e.id === 'z')!.health;
};

beforeEach(() => {
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // 会心を出さない
});
afterEach(() => { vi.restoreAllMocks(); });

describe('格闘のコンボ数のダメージ倍率', () => {
  it('コンボ0と10で、同じ技のダメージがちょうど2倍(天井)', () => {
    const d0 = dealt(0);
    const d10 = dealt(10);
    expect(d0).toBeGreaterThan(0);
    expect(d10 / d0).toBeCloseTo(2, 9);
  });
  it('コンボ7は 1.1^7 倍・1発目(つながり無し)は等倍', () => {
    const d0 = dealt(0);
    expect(dealt(7) / d0).toBeCloseTo(Math.pow(1.1, 7), 9);
    expect(dealt(1) / d0).toBeCloseTo(1.1, 9);
  });
  it('秘奥義の当たりにも掛かる', () => {
    const d0 = dealt(0, 'secret');
    expect(dealt(10, 'secret') / d0).toBeCloseTo(2, 9);
  });
  it('数が残っていても、敵が動ける(つながっていない)なら等倍', () => {
    setup();
    const d0 = dealt(0);
    setup();
    useGameStore.setState({ enemies: [{ ...place(0), brComboHits: 10 }] }); // 固まりが無い=動ける
    const h0 = useGameStore.getState().enemies[0].health;
    useGameStore.getState().triggerCounter(undefined, {
      targetIds: ['z'], mult: 1, brawler: true, stunMs: 45, kb: { kind: 'none' }, postureMult: 1, pressedAt: Date.now(), combo: { move: 's1' },
    });
    expect((h0 - useGameStore.getState().enemies[0].health) / d0).toBeCloseTo(1, 9);
  });
});
