import { describe, expect, it } from 'vitest';
import { BOSS_COMBAT_PROFILES, bossNeutralDelayMs, bossRebuildIdForEnemy, BOSS_NEUTRAL_LEDGER_MS, BOSS_NEUTRAL_CASTLE_MS, BOUNTY_NEUTRAL_RULED_MS, IDOL_NEUTRAL_RULED_MS } from './bossRebuild';

describe('boss rebuild contract', () => {
  it('stage-1城ボスを対象に含めず、再構築対象16体を一元管理する', () => {
    expect('stage-1' in BOSS_COMBAT_PROFILES).toBe(false);
    expect(Object.keys(BOSS_COMBAT_PROFILES)).toHaveLength(16);
    expect(bossRebuildIdForEnemy('mimir')).toBe('mimir');
    expect(bossRebuildIdForEnemy('giantbat')).toBeNull();
  });

  it('全員に反撃時間と連段上限を保証する', () => {
    for (const profile of Object.values(BOSS_COMBAT_PROFILES)) {
      expect(profile.mandatoryRestMs).toBeGreaterThanOrEqual(1700);
      expect(profile.maxConcurrentC).toBeLessThanOrEqual(1);
      expect(profile.maxString.every(n => n >= 2 && n <= 5)).toBe(true);
      expect(profile.maxString.every((n, i, a) => i === 0 || n >= a[i - 1])).toBe(true);
      expect(profile.neutralMs.every(b => b.min >= 0 && b.max >= b.min)).toBe(true);
    }
  });

  it('★社長裁定2026-08-27: 技間は系ごとの固定値(城2.5s/賞金首2s/台帳1.5s/偶像1.2s・×2は削除)', () => {
    // 過去の裁定(事実): v3949=+600 / v3954=×2(帯×フェーズの揺らぎ込み)。本裁定が上書き。
    expect(bossNeutralDelayMs('acrasiel', 1, () => 0)).toBe(BOSS_NEUTRAL_LEDGER_MS);
    expect(bossNeutralDelayMs('thor', 3, () => 1)).toBe(BOSS_NEUTRAL_LEDGER_MS);
    expect(BOSS_NEUTRAL_LEDGER_MS).toBe(1500);
    expect(BOSS_NEUTRAL_CASTLE_MS).toBe(2500);
    expect(BOUNTY_NEUTRAL_RULED_MS).toBe(2000);
    expect(IDOL_NEUTRAL_RULED_MS).toBe(1200);
    for (const profile of Object.values(BOSS_COMBAT_PROFILES)) {
      expect(profile.neutralMs.every((b, i, a) => i === 0 || b.max <= a[i - 1].max)).toBe(true);
    }
  });

  it('全ボスの主題が重複しない', () => {
    const identities = Object.values(BOSS_COMBAT_PROFILES).map(p => p.identity);
    expect(new Set(identities).size).toBe(identities.length);
  });
});
