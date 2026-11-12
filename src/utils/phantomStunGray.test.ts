import { describe, it, expect } from 'vitest';
import { phantomStunGrayK, PHANTOM_STUN_GRAY_IN_MS, PHANTOM_STUN_GRAY_OUT_MS } from './phantomStunGray';
import { chipPvpPosture, freshPvpPosture, pvpAfterFatal, PVP_BREAK_MS, PVP_FATAL_DAZE_MS } from './pvpPosture';

const T0 = 10_000;
const broken = () => {
  let s = freshPvpPosture();
  let t = T0 - 1000;
  for (let i = 0; i < 4; i++) { s = chipPvpPosture(s, 'counter', t, 1).next; t += 10; }
  const r = chipPvpPosture(s, 'counter', T0, 1);
  expect(r.broke).toBe(true);
  return r.next;
};

describe('phantomStunGrayK', () => {
  it('動ける時は0', () => {
    expect(phantomStunGrayK(undefined, T0)).toBe(0);
    expect(phantomStunGrayK(freshPvpPosture(), T0)).toBe(0);
    expect(phantomStunGrayK(chipPvpPosture(freshPvpPosture(), 'counter', T0, 1).next, T0 + 50)).toBe(0);
  });

  it('崩れた直後は0から色が抜け、約200msで白黒になる', () => {
    const s = broken();
    expect(phantomStunGrayK(s, T0)).toBe(0);
    const a = phantomStunGrayK(s, T0 + PHANTOM_STUN_GRAY_IN_MS * 0.3);
    const b = phantomStunGrayK(s, T0 + PHANTOM_STUN_GRAY_IN_MS * 0.7);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(phantomStunGrayK(s, T0 + PHANTOM_STUN_GRAY_IN_MS)).toBe(1);
    expect(phantomStunGrayK(s, T0 + PVP_BREAK_MS / 2)).toBe(1);
  });

  it('明けの約300ms前から色が戻り、明けで0', () => {
    const s = broken();
    const end = T0 + PVP_BREAK_MS;
    expect(phantomStunGrayK(s, end - PHANTOM_STUN_GRAY_OUT_MS)).toBe(1);
    const a = phantomStunGrayK(s, end - PHANTOM_STUN_GRAY_OUT_MS * 0.7);
    const b = phantomStunGrayK(s, end - PHANTOM_STUN_GRAY_OUT_MS * 0.3);
    expect(b).toBeLessThan(a);
    expect(b).toBeGreaterThan(0);
    expect(phantomStunGrayK(s, end)).toBe(0);
  });

  it('窓が通常より長く書かれた状態(確認用に止めた)は白黒のまま', () => {
    const G = 5000;
    expect(phantomStunGrayK({ posture: 0, recoveryCap: 0, lastChipAt: G, breakUntil: G + 1e9, lockUntil: G + 1e9 }, G)).toBe(1);
  });

  it('致命の後の窓は白黒のまま始まり明けに0。1フレームで大きく跳ばない', () => {
    const s = broken();
    const fatalAt = T0 + 1500;
    const d = pvpAfterFatal(s, fatalAt);
    expect(phantomStunGrayK(d, fatalAt)).toBe(1);
    expect(phantomStunGrayK(d, fatalAt + PVP_FATAL_DAZE_MS)).toBe(0);
    const at = (t: number) => phantomStunGrayK(t < fatalAt ? s : d, t);
    let prev = at(T0);
    for (let t = T0 + 16; t <= fatalAt + PVP_FATAL_DAZE_MS + 32; t += 16) {
      const k = at(t);
      expect(Math.abs(k - prev)).toBeLessThan(0.15);
      prev = k;
    }
  });
});
