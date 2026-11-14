// レバーガードで受け切った直後は被弾の演出を出さない(research/BRAWLER.md §12-1c・社長裁定2026-11-11)。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  LEVER_GUARD_HURT_MUTE_MS, noteLeverGuardFull, clearLeverGuardFull, leverGuardHurtMuted, isPlayerHurtFlashColor, isPlayerHurtBurstColor,
} from './leverGuardStamp';

describe('レバーガードで受け切った直後の被弾の演出', () => {
  beforeEach(() => clearLeverGuardFull());
  it('受け切ってから150msの間だけ止める。ガードではない被弾が入ったら、すぐ解く', () => {
    expect(leverGuardHurtMuted(1000)).toBe(false);
    noteLeverGuardFull(1000);
    expect(leverGuardHurtMuted(1000)).toBe(true);
    expect(leverGuardHurtMuted(1000 + LEVER_GUARD_HURT_MUTE_MS - 1)).toBe(true);
    expect(leverGuardHurtMuted(1000 + LEVER_GUARD_HURT_MUTE_MS)).toBe(false);
    expect(leverGuardHurtMuted(999)).toBe(false); // 時計が戻った時は止めない
    noteLeverGuardFull(2000);
    clearLeverGuardFull();
    expect(leverGuardHurtMuted(2001)).toBe(false);
  });
  it('止めるのは被弾の赤だけ(ほかの色のフラッシュ・粒は止めない)', () => {
    expect(isPlayerHurtFlashColor('rgba(239,68,68,0.22)')).toBe(true);
    expect(isPlayerHurtFlashColor('rgba(220, 38, 38, 0.18)')).toBe(true);
    expect(isPlayerHurtFlashColor('rgba(34, 197, 94, 0.34)')).toBe(false);
    expect(isPlayerHurtFlashColor('rgba(255,248,230,')).toBe(false);
    expect(isPlayerHurtBurstColor('#dc2626')).toBe(true);
    expect(isPlayerHurtBurstColor('#ef4444')).toBe(true);
    expect(isPlayerHurtBurstColor('#38bdf8')).toBe(false);
  });
});
