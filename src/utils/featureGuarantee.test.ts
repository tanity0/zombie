import { describe, it, expect } from 'vitest';
import { shouldGuaranteeSpawn, GATE_FEATURE_GUARANTEE_MS, GUARANTEE_CONCURRENT_CAP } from './featureGuarantee';

const BASE = {
  type: 'pumpkin' as const,
  elapsedMs: GATE_FEATURE_GUARANTEE_MS,
  spawnedCountForType: 0,
  area: 2,
  isEventGate: false,
  aliveOfType: 0,
  lastKillAtMs: undefined,
  nowMs: 100000,
};

describe('shouldGuaranteeSpawn (PACING_REDESIGN.mdバッチM1-C 主題保証)', () => {
  it('15秒経過・未出現・条件が揃えば保証投入する', () => {
    expect(shouldGuaranteeSpawn(BASE)).toBe(true);
  });

  it('15秒未満では発動しない', () => {
    expect(shouldGuaranteeSpawn({ ...BASE, elapsedMs: GATE_FEATURE_GUARANTEE_MS - 1 })).toBe(false);
  });

  it('関所内で既に1体でも出現していれば発動しない', () => {
    expect(shouldGuaranteeSpawn({ ...BASE, spawnedCountForType: 1 })).toBe(false);
  });

  it('憲法4条: 初心者ゾーン(エリア0-1)では不発', () => {
    expect(shouldGuaranteeSpawn({ ...BASE, area: 0 })).toBe(false);
    expect(shouldGuaranteeSpawn({ ...BASE, area: 1 })).toBe(false);
    expect(shouldGuaranteeSpawn({ ...BASE, area: 2 })).toBe(true);
  });

  it('イベント関所(囲い/スパイク)では不発', () => {
    expect(shouldGuaranteeSpawn({ ...BASE, isEventGate: true })).toBe(false);
  });

  it('憲法2条: 同時数キャップが満杯なら空き待ち(発動しない)', () => {
    expect(shouldGuaranteeSpawn({ ...BASE, type: 'pumpkin', aliveOfType: GUARANTEE_CONCURRENT_CAP.pumpkin })).toBe(false);
    expect(shouldGuaranteeSpawn({ ...BASE, type: 'pumpkin', aliveOfType: GUARANTEE_CONCURRENT_CAP.pumpkin - 1 })).toBe(true);
  });

  it('ghostのキャップは1(他の型と異なる値)', () => {
    expect(GUARANTEE_CONCURRENT_CAP.ghost).toBe(1);
    expect(shouldGuaranteeSpawn({ ...BASE, type: 'ghost', aliveOfType: 1 })).toBe(false);
    expect(shouldGuaranteeSpawn({ ...BASE, type: 'ghost', aliveOfType: 0 })).toBe(true);
  });

  it('リフラクトリ中(直近キルから15秒未満)は待つ', () => {
    expect(shouldGuaranteeSpawn({ ...BASE, lastKillAtMs: BASE.nowMs - 1000 })).toBe(false);
    expect(shouldGuaranteeSpawn({ ...BASE, lastKillAtMs: BASE.nowMs - 15001 })).toBe(true);
  });
});
