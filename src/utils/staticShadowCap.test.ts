import { describe, it, expect } from 'vitest';
import { stepStaticShadowCap, STATIC_SHADOW_CAP, STATIC_SHADOW_RESERVED_FOR_MOVING } from './staticShadowCap';
import { SHADOW_TOTAL_MESH_MAX } from './shadowSlots';

const cands = (n: number, off = 0) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, d2: (i + off) * (i + off) }));

describe('止まっている物の影の上限(stepStaticShadowCap)', () => {
  it('上限 = 枠 − 動く影のために空ける20枚', () => {
    expect(STATIC_SHADOW_RESERVED_FOR_MOVING).toBe(20);
    expect(STATIC_SHADOW_CAP).toBe(SHADOW_TOTAL_MESH_MAX - 20);
  });
  it('近い順に上限まで選び、描く枚数(フェード中を含む)は上限を超えない', () => {
    const st = new Map<string, number>(), out = new Map<string, number>();
    const c = cands(30);
    for (let f = 0; f < 40; f++) {
      stepStaticShadowCap(c, st, out, 10, 16);
      expect(out.size).toBeLessThanOrEqual(10);
    }
    expect([...out.keys()].sort()).toEqual(c.slice(0, 10).map(x => x.id).sort());
    for (const v of out.values()) expect(v).toBeCloseTo(1, 9);
  });
  it('入れ替わりは ease(パッと出ない・消えない)で、途中も上限を超えない', () => {
    const st = new Map<string, number>(), out = new Map<string, number>();
    const a = cands(6);
    for (let f = 0; f < 30; f++) stepStaticShadowCap(a, st, out, 3, 16);
    // o5 が一番近くへ動く → o2 が外れる
    const b = a.map(x => (x.id === 'o5' ? { ...x, d2: -1 } : x));
    stepStaticShadowCap(b, st, out, 3, 16);
    expect(out.get('o2')!).toBeGreaterThan(0.9); // まだ消えない
    expect(out.has('o5')).toBe(false); // 枠が空くまで待つ
    let seenMid = false;
    for (let f = 0; f < 40; f++) {
      stepStaticShadowCap(b, st, out, 3, 16);
      expect(out.size).toBeLessThanOrEqual(3);
      const v = out.get('o5');
      if (v !== undefined && v > 0.05 && v < 0.95) seenMid = true;
    }
    expect(seenMid).toBe(true);
    expect(out.has('o2')).toBe(false);
    expect(out.get('o5')).toBeCloseTo(1, 9);
  });
  it('約250ms で 0→1', () => {
    const st = new Map<string, number>(), out = new Map<string, number>();
    const a = cands(1);
    stepStaticShadowCap(a, st, out, 5, 125);
    expect(out.get('o0')!).toBeCloseTo(0.5, 9);
    stepStaticShadowCap(a, st, out, 5, 125);
    expect(out.get('o0')!).toBeCloseTo(1, 9);
  });
  it('候補から消えた物は捨てる(枠を使わない)', () => {
    const st = new Map<string, number>(), out = new Map<string, number>();
    stepStaticShadowCap(cands(5), st, out, 5, 300);
    stepStaticShadowCap([], st, out, 5, 16);
    expect(st.size).toBe(0);
    expect(out.size).toBe(0);
  });
});

describe('薄い影を消す倍率(staticShadowLowAlphaMult)', () => {
  it('しきい値の0.5倍以下で0・1倍以上で1・間は単調でなめらか', async () => {
    const { staticShadowLowAlphaMult, STATIC_SHADOW_MIN_ALPHA } = await import('./staticShadowCap');
    expect(STATIC_SHADOW_MIN_ALPHA).toBe(0.08);
    expect(staticShadowLowAlphaMult(0.04)).toBe(0);
    expect(staticShadowLowAlphaMult(0.01)).toBe(0);
    expect(staticShadowLowAlphaMult(0.08)).toBe(1);
    expect(staticShadowLowAlphaMult(0.5)).toBe(1);
    expect(staticShadowLowAlphaMult(0.06)).toBeCloseTo(0.5, 9);
    let prev = 0;
    for (let a = 0.04; a <= 0.08; a += 0.001) {
      const m = staticShadowLowAlphaMult(a);
      expect(m).toBeGreaterThanOrEqual(prev);
      expect(m - prev).toBeLessThan(0.06); // 跳ばない
      prev = m;
    }
    expect(staticShadowLowAlphaMult(0.0400001)).toBeLessThan(1e-6);
  });
});
