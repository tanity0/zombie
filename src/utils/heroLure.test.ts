// research/MUTANT_HERO.md §3-2: 雑魚は近くの英雄を追う(ボスは見ない)。resolveEnemyTarget の英雄引数のテスト。
import { describe, it, expect } from 'vitest';
import { resolveEnemyTarget, spawnEnemyAt } from './enemyUtils';
import type { Player } from '../types/game';

const player = { x: 0, y: 0, width: 40, height: 56 } as unknown as Player;
const hero = { id: 'hero-1', x: 0, y: 0, width: 110, height: 60 };

describe('雑魚が英雄を狙う', () => {
  it('英雄の方が近く、範囲内なら英雄を追う', () => {
    const z = spawnEnemyAt('zombie', 300, 0, 0);
    const h = { ...hero, x: 380, y: 0 };
    const t = resolveEnemyTarget(z, player, [], 380, false, 0, h);
    expect(t.x).toBeCloseTo(h.x + h.width / 2);
  });
  it('プレイヤーの方が近ければプレイヤー', () => {
    const z = spawnEnemyAt('zombie', 60, 0, 0);
    const t = resolveEnemyTarget(z, player, [], 380, false, 0, { ...hero, x: 300, y: 0 });
    expect(t.x).toBeCloseTo(20);
  });
  it('英雄が渡されなければ従来どおり(1bit同じ)', () => {
    const z = spawnEnemyAt('zombie', 300, 0, 0);
    const a = resolveEnemyTarget(z, player, [], 380, false, 0);
    const b = resolveEnemyTarget(z, player, [], 380, false, 0, null);
    expect(a).toEqual(b);
  });
  it('ボスは英雄を見ない(狙いは今のまま)', () => {
    const b = spawnEnemyAt('bounty-melee', 300, 0, 0);
    const t = resolveEnemyTarget(b, player, [], 380, false, 0, { ...hero, x: 360, y: 0 });
    expect(t.x).toBeCloseTo(20);
  });
});
