import { describe, it, expect } from 'vitest';
import { coilTrajectoryOffsetRad, COIL_OUT_PHASE_MS, COIL_TOTAL_PHASE_MS, COIL_OUT_RAD } from './coilShotgun';

describe('coilTrajectoryOffsetRad', () => {
  it('中心弾(baseAngleRad=0)は常にオフセット0(広がりようがない)', () => {
    expect(coilTrajectoryOffsetRad(0, 0)).toBe(0);
    expect(coilTrajectoryOffsetRad(0, 90)).toBe(0);
    expect(coilTrajectoryOffsetRad(0, 300)).toBe(0);
    expect(coilTrajectoryOffsetRad(0, 1000)).toBe(0);
  });

  it('elapsed=0はオフセット0(発射直後は元の拡散角のまま)', () => {
    expect(coilTrajectoryOffsetRad(0.2, 0)).toBe(0);
    expect(coilTrajectoryOffsetRad(-0.2, 0)).toBe(0);
  });

  it('0〜180ms: 外側(+側ペレット)は正の方向へ増える', () => {
    const early = coilTrajectoryOffsetRad(0.2, 30);
    const mid = coilTrajectoryOffsetRad(0.2, 90);
    const late = coilTrajectoryOffsetRad(0.2, 179);
    expect(early).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(early);
    expect(late).toBeGreaterThan(mid);
  });

  it('180msちょうどで最大(+0.5rad)に達する', () => {
    expect(coilTrajectoryOffsetRad(0.2, COIL_OUT_PHASE_MS)).toBeCloseTo(COIL_OUT_RAD, 6);
  });

  it('180〜420ms: 最大から0へ戻っていく(収束)', () => {
    const justAfter = coilTrajectoryOffsetRad(0.2, 181);
    const mid = coilTrajectoryOffsetRad(0.2, 300);
    const justBefore = coilTrajectoryOffsetRad(0.2, 419);
    expect(justAfter).toBeLessThanOrEqual(COIL_OUT_RAD);
    expect(mid).toBeLessThan(justAfter);
    expect(justBefore).toBeLessThan(mid);
    expect(justBefore).toBeGreaterThan(0);
  });

  it('420ms以降はオフセット0(以後まっすぐ)', () => {
    expect(coilTrajectoryOffsetRad(0.2, COIL_TOTAL_PHASE_MS)).toBeCloseTo(0, 6);
    expect(coilTrajectoryOffsetRad(0.2, 5000)).toBe(0);
  });

  it('負側ペレット(baseAngleRad<0)は逆符号で対称に動く', () => {
    const pos = coilTrajectoryOffsetRad(0.2, 90);
    const neg = coilTrajectoryOffsetRad(-0.2, 90);
    expect(neg).toBeCloseTo(-pos, 10);
  });

  it('慣性(smoothstep): 増分が一定ではない(等速でない=CLAUDE.md「動きの絶対ルール」)', () => {
    const a = coilTrajectoryOffsetRad(0.2, 10) - coilTrajectoryOffsetRad(0.2, 0);
    const b = coilTrajectoryOffsetRad(0.2, 100) - coilTrajectoryOffsetRad(0.2, 90);
    expect(a).not.toBeCloseTo(b, 3);
  });
});
