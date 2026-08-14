import { describe, it, expect } from 'vitest';
import { isEnemyCapProtected } from './directorTick';
import type { EnemyType } from '../types/game';

// PACING_PUZZLE.md §6.38 B1(賞金首)保護3箇所のうち②: 上限カリングのisProtected表。
// 賞金首4型はここに載っていないとcap超過で消される(=「勝手に消える」実バグ)。
const mk = (type: EnemyType, patch: Partial<Parameters<typeof isEnemyCapProtected>[0]> = {}) => ({
  type, fixed: false, fromEvent: false, isNamed: false, questTarget: false, isWave: false, spawnedAt: 0,
  ...patch,
});

describe('isEnemyCapProtected — 上限カリングの保護表(§6.38 B1)', () => {
  it('賞金首4型は上限カリング対象外(保護される)', () => {
    for (const type of ['bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko'] as EnemyType[]) {
      expect(isEnemyCapProtected(mk(type), 100000), type).toBe(true);
    }
  });
  it('既存の保護対象は従来どおり保護される(挙動不変)', () => {
    expect(isEnemyCapProtected(mk('giantbat'), 0)).toBe(true);
    expect(isEnemyCapProtected(mk('pumpkin'), 0)).toBe(true);
    expect(isEnemyCapProtected(mk('reaper'), 0)).toBe(true);
    expect(isEnemyCapProtected(mk('lab-zombie-3'), 0)).toBe(true);
    expect(isEnemyCapProtected(mk('mimir'), 0)).toBe(true); // isHiddenBoss経由
    expect(isEnemyCapProtected(mk('zombie', { fixed: true }), 0)).toBe(true);
    expect(isEnemyCapProtected(mk('zombie', { fromEvent: true }), 0)).toBe(true);
    expect(isEnemyCapProtected(mk('zombie', { isNamed: true }), 0)).toBe(true);
    expect(isEnemyCapProtected(mk('zombie', { questTarget: true }), 0)).toBe(true);
  });
  it('通常の雑魚は保護されない(=カリング対象になり得る)', () => {
    expect(isEnemyCapProtected(mk('zombie'), 999999)).toBe(false);
  });
  it('waveは猶予10秒だけ保護され、以後は保護されない', () => {
    expect(isEnemyCapProtected(mk('zombie', { isWave: true, spawnedAt: 0 }), 5000)).toBe(true);
    expect(isEnemyCapProtected(mk('zombie', { isWave: true, spawnedAt: 0 }), 10001)).toBe(false);
  });
});
