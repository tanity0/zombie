// 社長裁定2026-10-05「3は代案がおもろい」: 英雄の昇天の間、周りの雑魚は英雄の方を向いて立ち止まる。
import { describe, it, expect } from 'vitest';
import { isEnemyFrozenForClocks } from './enemyClocks';
import { spawnEnemyAt } from './enemyUtils';

describe('英雄の昇天に見とれる', () => {
  it('見とれている間は時計が止まる(硬直と同じ)・期限が過ぎれば動く', () => {
    const z = spawnEnemyAt('zombie', 0, 0, 0);
    const now = 1_000_000;
    expect(isEnemyFrozenForClocks({ ...z, aweUntil: now + 1000 }, 0, now)).toBe(true);
    expect(isEnemyFrozenForClocks({ ...z, aweUntil: now - 1 }, 0, now)).toBe(false);
    expect(isEnemyFrozenForClocks(z, 0, now)).toBe(false);
  });
});
