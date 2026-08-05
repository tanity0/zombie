import { describe, expect, it } from 'vitest';
import { BOSS_COMBAT_PROFILES, bossNeutralDelayMs, bossRebuildIdForEnemy } from './bossRebuild';

describe('boss rebuild contract', () => {
  it('stage-1城ボスを対象に含めず、再構築対象16体を一元管理する', () => {
    expect('stage-1' in BOSS_COMBAT_PROFILES).toBe(false);
    expect(Object.keys(BOSS_COMBAT_PROFILES)).toHaveLength(16);
    expect(bossRebuildIdForEnemy('mimir')).toBe('mimir');
    expect(bossRebuildIdForEnemy('giantbat')).toBeNull();
  });

  it('全員に反撃時間と連段上限を保証する', () => {
    for (const profile of Object.values(BOSS_COMBAT_PROFILES)) {
      expect(profile.mandatoryRestMs).toBeGreaterThanOrEqual(900);
      expect(profile.maxConcurrentC).toBeLessThanOrEqual(1);
      expect(profile.maxString.every(n => n >= 2 && n <= 5)).toBe(true);
      expect(profile.maxString.every((n, i, a) => i === 0 || n >= a[i - 1])).toBe(true);
      expect(profile.neutralMs.every(b => b.min >= 0 && b.max >= b.min)).toBe(true);
    }
  });

  it('中立時間はフェーズ別の範囲内で、後半ほど長く戻らない', () => {
    expect(bossNeutralDelayMs('acrasiel', 1, () => 0)).toBe(750);
    expect(bossNeutralDelayMs('acrasiel', 2, () => 1)).toBe(850);
    expect(bossNeutralDelayMs('acrasiel', 99, () => 0.5)).toBe(550);
    for (const profile of Object.values(BOSS_COMBAT_PROFILES)) {
      expect(profile.neutralMs.every((b, i, a) => i === 0 || b.max <= a[i - 1].max)).toBe(true);
    }
  });

  it('全ボスの主題が重複しない', () => {
    const identities = Object.values(BOSS_COMBAT_PROFILES).map(p => p.identity);
    expect(new Set(identities).size).toBe(identities.length);
  });
});
