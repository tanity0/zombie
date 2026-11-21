// research/BRAWLER_PHANTOM.md §7: 拳鬼(固有の幻影)を本編で倒すと、格闘の設計図+格闘Lv1。汎用の幻影では何も出ない。
import { describe, it, expect, beforeEach } from 'vitest';

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => { backing[k] = v; },
  removeItem: (k: string) => { delete backing[k]; },
  clear: () => { for (const k of Object.keys(backing)) delete backing[k]; },
  key: () => null,
  get length() { return Object.keys(backing).length; },
} as Storage;

import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { hasSubBlueprint } from '../data/progress';

const phantom = (unique: boolean) => {
  const e = spawnEnemyAt('guardian-phantom', 400, 400, useGameStore.getState().gameTime);
  e.health = 1; e.maxHealth = 130; e.dormant = false; e.bossState = 'chase';
  if (unique) e.phantomUnique = 'brawler';
  return e;
};
const kill = (unique: boolean) => {
  const e = phantom(unique);
  useGameStore.setState({ enemies: [e], lastWeaponGet: null });
  useGameStore.getState().damageEnemy(e.id, 999999);
};

describe('拳鬼の報酬(store)', () => {
  beforeEach(() => {
    for (const k of Object.keys(backing)) delete backing[k];
    useGameStore.getState().resetGame('rogue');
    useGameStore.setState({ purchasedSubLevels: {} });
  });

  it('拳鬼を倒すと設計図+格闘Lv1・トースト「格闘 入手」', () => {
    kill(true);
    expect(hasSubBlueprint('brawler')).toBe(true);
    expect(useGameStore.getState().purchasedSubLevels.brawler).toBe(1);
    expect(useGameStore.getState().lastWeaponGet?.name).toContain('入手');
    expect(useGameStore.getState().lastWeaponGet?.weaponKey).toBe('brawler');
  });

  it('汎用の幻影(印なし)を倒しても何も出ない', () => {
    kill(false);
    expect(hasSubBlueprint('brawler')).toBe(false);
    expect(useGameStore.getState().purchasedSubLevels.brawler ?? 0).toBe(0);
    expect(useGameStore.getState().lastWeaponGet).toBeNull();
  });

  it('既に格闘を買っていた人: 設計図は立つ・段数はそのまま・トーストは出ない', () => {
    useGameStore.setState({ purchasedSubLevels: { brawler: 2 } });
    kill(true);
    expect(hasSubBlueprint('brawler')).toBe(true);
    expect(useGameStore.getState().purchasedSubLevels.brawler).toBe(2);
    expect(useGameStore.getState().lastWeaponGet).toBeNull();
  });

  it('2回目に倒しても入手は出ない(再戦)', () => {
    kill(true);
    useGameStore.setState({ lastWeaponGet: null });
    kill(true);
    expect(useGameStore.getState().lastWeaponGet).toBeNull();
    expect(useGameStore.getState().purchasedSubLevels.brawler).toBe(1);
  });
});
