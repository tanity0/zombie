import { describe, expect, it } from 'vitest';
import type { Enemy, EnemyType } from '../types/game';
import {
  applyBossPostureDamage, applyBrokenGunReward, applyBrokenMeleeFatal,
  bossPostureMax, tickBossPosture, BOSS_POSTURE_BREAK_MS, BOSS_POSTURE_REBREAK_LOCK_MS,
} from './bossPosture';

const boss = (type: EnemyType = 'giantbat', over: Partial<Enemy> = {}): Enemy => ({
  id: 'boss', type, x: 0, y: 0, width: 100, height: 100,
  health: 1000, maxHealth: 1000, damage: 10, speed: 10, lastHit: 0,
  ...over,
} as Enemy);

describe('boss posture', () => {
  it('uses 80/100/120 maxima and five counters break every boss class', () => {
    expect(bossPostureMax('giantbat')).toBe(80);
    expect(bossPostureMax('miguel')).toBe(100);
    expect(bossPostureMax('mimir')).toBe(120);
    for (const type of ['giantbat', 'miguel', 'mimir'] as EnemyType[]) {
      let e = boss(type);
      for (let i = 0; i < 5; i++) {
        const result = applyBossPostureDamage(e, 'counter', 1000 + i)!;
        e = { ...e, ...result.patch };
        expect(result.triggered).toBe(i === 4);
      }
      expect(e.bossPosture).toBe(0);
      expect(e.bossBreakRewardRemaining).toBe(250);
    }
  });

  it('locks recovery to crossed checkpoints and starts after eight seconds', () => {
    let e = boss('miguel');
    for (let i = 0; i < 3; i++) e = { ...e, ...applyBossPostureDamage(e, 'heavy', i)!.patch };
    expect(e.bossPosture).toBe(70);
    expect(e.bossPostureRecoveryCap).toBe(75);
    expect(tickBossPosture(e, 8003, 1)?.bossPosture).toBe(73);
    e = { ...e, bossPosture: 75 };
    expect(tickBossPosture(e, 9000, 1)).toBeNull();
  });

  it('caps gun reward and consumes all remaining reward with a melee fatal', () => {
    const now = 500;
    const e = boss('giantbat', {
      bossPosture: 0,
      bossFullStunUntil: now + BOSS_POSTURE_BREAK_MS,
      bossBreakRewardRemaining: 30,
    });
    const gun = applyBrokenGunReward(e, 10, now)!;
    expect(gun.damage).toBe(40);
    expect(gun.patch.bossBreakRewardRemaining).toBe(0);
    const fatal = applyBrokenMeleeFatal(e, 12, now)!;
    expect(fatal.damage).toBe(90);
    expect(fatal.patch.bossFullStunUntil).toBeUndefined();
    expect(fatal.patch.bossPostureLockUntil).toBe(now + BOSS_POSTURE_REBREAK_LOCK_MS);
  });
});
