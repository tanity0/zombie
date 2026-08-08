import { describe, expect, it } from 'vitest';
import type { Enemy, EnemyType } from '../types/game';
import {
  applyBossPostureDamage, applyBrokenGunReward, applyBrokenMeleeFatal,
  bossPostureMax, tickBossPosture, BOSS_POSTURE_BREAK_MS, BOSS_POSTURE_REBREAK_LOCK_MS,
  BOSS_FATAL_DAZE_MS,
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

  it('致命(紫kill)後は2秒停止してから活動再開(v0.25.3035・社長指示)', () => {
    const now = 500;
    const e = boss('giantbat', {
      bossPosture: 0,
      bossFullStunUntil: now + BOSS_POSTURE_BREAK_MS,
      bossBreakRewardRemaining: 30,
    });
    const fatal = applyBrokenMeleeFatal(e, 12, now)!;
    // 停止はstunUntil(全ボスの制御器が既に尊重する汎用フリーズ)で2秒。
    expect(fatal.patch.stunUntil).toBe(now + BOSS_FATAL_DAZE_MS);
    expect(BOSS_FATAL_DAZE_MS).toBe(2000);
    // 紫(bossFullStunUntil)は消える=停止中にもう一度致命が連鎖することはない。
    expect(fatal.patch.bossFullStunUntil).toBeUndefined();
  });

  it('紫の発火で未起爆の遅延ヒットは破棄・起爆済みの床(burst)は残す(v0.25.3037・裁定案1)', () => {
    const now = 500;
    const e = boss('giantbat', {
      bossPosture: 1,
      giantDelayedHits: [
        { x: 0, y: 0, radius: 40, fireAt: now + 800 },                                  // 未起爆→破棄
        { x: 1, y: 1, radius: 40, fireAt: now - 200, burst: true, floorUntil: now + 4000 }, // 血溜まり床→残す
      ] as Enemy['giantDelayedHits'],
    });
    const r = applyBossPostureDamage(e, 'counter', now)!;
    expect(r.triggered).toBe(true);
    expect(r.patch.giantDelayedHits).toHaveLength(1);
    expect(r.patch.giantDelayedHits![0].burst).toBe(true);
  });
});
