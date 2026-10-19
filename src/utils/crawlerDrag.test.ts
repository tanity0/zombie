import { describe, expect, it } from 'vitest';
import { crawlerDragGain } from './labCrawlerTick';

describe('死体の塊が体を引きずる音(社長「近いと流れてくる。遠いと小さくなり、鳴らなくなる」)', () => {
  it('近いと最大、遠いほど小さく、遠すぎると鳴らない', () => {
    const near = crawlerDragGain(100, 60, false);
    const mid = crawlerDragGain(700, 60, false);
    expect(near).toBeCloseTo(1);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(near);
    expect(crawlerDragGain(1300, 60, false)).toBe(0);
  });
  it('止まっている時・昇天中は鳴らない', () => {
    expect(crawlerDragGain(100, 0, false)).toBe(0);
    expect(crawlerDragGain(100, 60, true)).toBe(0);
  });
});
