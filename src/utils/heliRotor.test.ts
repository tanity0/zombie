import { describe, it, expect } from 'vitest';
import { heliRotorFrame, HELI_ROTOR_FRAMES, HELI_ROTOR_LOOP_MS } from './heliRotor';

describe('ヘリのローター回転(社長素材2026-09-19・高速ループ7コマ)', () => {
  it('★出荷素材は7コマだけ(助走11コマは捨てた=社長指示「容量無駄なので」)', () => {
    expect(HELI_ROTOR_FRAMES).toBe(7);
  });

  it('7コマを順に回し、範囲から出ない', () => {
    const seen = new Set<number>();
    for (let t = 0; t < HELI_ROTOR_LOOP_MS * 7 * 5; t += 1) {
      const f = heliRotorFrame(t);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(HELI_ROTOR_FRAMES);
      seen.add(f);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('7コマでちょうど1周する', () => {
    expect(heliRotorFrame(HELI_ROTOR_LOOP_MS * 7)).toBe(heliRotorFrame(0));
    expect(heliRotorFrame(HELI_ROTOR_LOOP_MS)).not.toBe(heliRotorFrame(0));
  });

  it('負の経過時間でも範囲から出ない', () => {
    expect(heliRotorFrame(-999)).toBe(0);
  });
});
