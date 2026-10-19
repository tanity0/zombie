import { describe, it, expect } from 'vitest';
import { labDistantCue, labDistantDue, LAB_DISTANT_SLOT_MS } from './labDistantSound';

const cuesUpTo = (ms: number, seed: number) => {
  const out: number[] = [];
  for (let t = 0; t < ms; t += 16) {
    const c = labDistantDue(t, t + 16, seed);
    if (c) out.push(c.at);
  }
  return out;
};

describe('labDistantSound', () => {
  it('出撃直後の枠では鳴らない', () => {
    for (let seed = 0; seed < 50; seed++) expect(labDistantCue(0, seed)).toBeNull();
  });
  it('毎フレーム問い合わせると各回をちょうど1度だけ返す', () => {
    const ten = 10 * 60 * 1000;
    for (const seed of [1, 7, 12345]) {
      const got = cuesUpTo(ten, seed);
      const want: number[] = [];
      for (let sl = 0; sl * LAB_DISTANT_SLOT_MS < ten; sl++) {
        const c = labDistantCue(sl, seed);
        if (c && c.at < ten) want.push(c.at);
      }
      expect(got).toEqual(want);
      expect(new Set(got).size).toBe(got.length);
    }
  });
  it('たまに鳴る: 10分で数回〜十数回、間隔は一定にならない', () => {
    const got = cuesUpTo(10 * 60 * 1000, 99);
    expect(got.length).toBeGreaterThanOrEqual(5);
    expect(got.length).toBeLessThanOrEqual(16);
    const gaps = got.slice(1).map((t, i) => t - got[i]);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(5000);
    expect(Math.min(...gaps)).toBeGreaterThan(5000);
  });
  it('遠いほど小さくこもる・値の範囲', () => {
    for (let sl = 1; sl < 200; sl++) {
      const c = labDistantCue(sl, 3);
      if (!c) continue;
      expect(c.gain).toBeGreaterThan(0.3);
      expect(c.gain).toBeLessThanOrEqual(0.75);
      expect(Math.abs(c.pan)).toBeLessThanOrEqual(0.9);
      expect(c.lowpassHz).toBeGreaterThanOrEqual(900);
      expect(c.lowpassHz).toBeLessThanOrEqual(2600);
    }
  });
  it('時間が戻った時(新しい出撃)は鳴らさない', () => {
    expect(labDistantDue(50000, 100, 1)).toBeNull();
  });
});
