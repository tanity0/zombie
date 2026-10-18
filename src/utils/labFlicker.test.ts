import { describe, expect, it } from 'vitest';
import {
  LAB_FLICKER_SLOT_MS, episodeLength, flickerEpisode, labFlickerLevel, smoothFlicker, easeToward,
} from './labFlicker';

describe('labFlicker(ステージ2の切れかけの蛍光灯)', () => {
  it('同じ時刻・同じ種なら必ず同じ明るさ(決定的)', () => {
    for (let t = 0; t < 60000; t += 37) expect(labFlickerLevel(t, 5)).toBe(labFlickerLevel(t, 5));
  });

  it('出撃ごとの種が違えば、ちらつく時刻が変わる(覚えられない)', () => {
    let diff = 0;
    for (let t = 0; t < 300000; t += 50) if (labFlickerLevel(t, 1) !== labFlickerLevel(t, 2)) diff++;
    expect(diff).toBeGreaterThan(0);
  });

  it('ほとんどの時間は点いている', () => {
    for (const seed of [0, 1, 2, 3]) {
      let on = 0, n = 0;
      for (let t = 0; t < 600000; t += 10) { n++; if (labFlickerLevel(t, seed) === 1) on++; }
      expect(on / n).toBeGreaterThan(0.9);
    }
  });

  it('出撃直後(最初の2枠)は何も起きない', () => {
    for (const seed of [0, 1, 2, 3, 4]) {
      for (let t = 0; t < 2 * LAB_FLICKER_SLOT_MS; t += 20) expect(labFlickerLevel(t, seed)).toBe(1);
    }
  });

  it('「暗いまま約0.5秒」は稀だが来る(長い暗転は取っておく一撃)', () => {
    let blackouts = 0, episodes = 0;
    for (let seed = 0; seed < 10; seed++) {
      for (let s = 0; s < 600000 / LAB_FLICKER_SLOT_MS; s++) {
        const ep = flickerEpisode(s, seed);
        if (!ep) continue;
        episodes++;
        if (ep.kind !== 'blackout') continue;
        blackouts++;
        expect(ep.segs.some(([len, lv]) => lv === 0 && len >= 400 && len <= 650)).toBe(true);
      }
    }
    expect(blackouts).toBeGreaterThan(0);
    expect(blackouts / episodes).toBeLessThan(0.25);
  });

  it('ちらつきは次の枠に食い込まない(枠ごとに1回)', () => {
    for (let seed = 0; seed < 5; seed++) {
      for (let s = 0; s < 400; s++) {
        const ep = flickerEpisode(s, seed);
        if (!ep) continue;
        expect(ep.start + episodeLength(ep.segs)).toBeLessThan((s + 1) * LAB_FLICKER_SLOT_MS);
      }
    }
  });

  it('残光: 消える時はゆっくり、点く時は速く寄る', () => {
    const fall = smoothFlicker(1, 0, 16);
    const rise = smoothFlicker(0, 1, 16);
    expect(1 - fall).toBeLessThan(rise);
    expect(smoothFlicker(0.5, 0.5, 16)).toBeCloseTo(0.5);
    expect(easeToward(0, 1, 16, 120)).toBeGreaterThan(0);
    expect(easeToward(0, 1, 16, 120)).toBeLessThan(0.2);
  });
});
