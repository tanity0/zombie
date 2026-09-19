import { describe, it, expect } from 'vitest';
import {
  heliRotorFrame, HELI_ROTOR_FRAMES, HELI_ROTOR_LOOP_FROM, HELI_ROTOR_LOOP_MS, HELI_ROTOR_SPINUP_MS,
} from './heliRotor';

describe('ヘリのローター回転(社長素材2026-09-19・18コマ)', () => {
  it('台帳: 18コマ / 最後の7枚がループ', () => {
    expect(HELI_ROTOR_FRAMES).toBe(18);
    expect(HELI_ROTOR_FRAMES - HELI_ROTOR_LOOP_FROM).toBe(7); // 社長「最後の7コマが高速回転のループ」
  });

  it('loop: 最後の7枚だけを順に回し、助走コマへは戻らない', () => {
    const seen = new Set<number>();
    for (let t = 0; t < HELI_ROTOR_LOOP_MS * 7 * 5; t += 1) seen.add(heliRotorFrame(t, 'loop'));
    expect([...seen].sort((a, b) => a - b)).toEqual([11, 12, 13, 14, 15, 16, 17]);
  });

  it('loop: 7コマでちょうど1周する', () => {
    const a = heliRotorFrame(0, 'loop');
    expect(heliRotorFrame(HELI_ROTOR_LOOP_MS * 7, 'loop')).toBe(a);
    expect(heliRotorFrame(HELI_ROTOR_LOOP_MS * 1, 'loop')).not.toBe(a);
  });

  it('spin-up: 止まり(0)から助走の最後(10)まで上がり、ループの手前で終わる', () => {
    expect(heliRotorFrame(0, 'spin-up')).toBe(0);
    expect(heliRotorFrame(HELI_ROTOR_SPINUP_MS, 'spin-up')).toBe(HELI_ROTOR_LOOP_FROM - 1);
    expect(heliRotorFrame(HELI_ROTOR_SPINUP_MS * 10, 'spin-up')).toBe(HELI_ROTOR_LOOP_FROM - 1); // 頭打ち
  });

  it('spin-down: spin-upの逆(高速側から止まりへ)', () => {
    expect(heliRotorFrame(0, 'spin-down')).toBe(HELI_ROTOR_LOOP_FROM - 1);
    expect(heliRotorFrame(HELI_ROTOR_SPINUP_MS, 'spin-down')).toBe(0);
  });

  it('★助走は等間隔で送らない(慣性MUST: 回り始めは遅く、だんだん速く)', () => {
    // 前半(0→50%)で進むコマ数 < 後半(50%→100%)で進むコマ数
    const mid = heliRotorFrame(HELI_ROTOR_SPINUP_MS * 0.5, 'spin-up');
    const end = heliRotorFrame(HELI_ROTOR_SPINUP_MS, 'spin-up');
    expect(mid - 0).toBeLessThan(end - mid);
  });

  it('負の経過時間でも範囲から出ない', () => {
    for (const ph of ['loop', 'spin-up', 'spin-down'] as const) {
      const f = heliRotorFrame(-999, ph);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(HELI_ROTOR_FRAMES);
    }
  });
});
