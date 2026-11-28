import { describe, expect, it } from 'vitest';
import { crawlerDragGain, escapeGhostGain } from './labCrawlerTick';
import { CRAWLER_VANISH_MS } from '../world/labCrawler';

describe('変異塊が体を引きずる音(社長「近いと流れてくる。遠いと小さくなり、鳴らなくなる」)', () => {
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

describe('帰り道の亡霊の声(社長「資料拾った後、塊が登場したらループ再生。塊が消えたら音も消す」)', () => {
  it('資料の前(追ってこない塊)は鳴らない・塊が居なければ鳴らない', () => {
    expect(escapeGhostGain({ chasing: false, state: 'move', stateAt: 0 }, 1000)).toBe(0);
    expect(escapeGhostGain(null, 1000)).toBe(0);
  });
  it('出てきた塊が追っている間は鳴り続ける(溜め・立て直し中も)', () => {
    for (const state of ['move', 'windup', 'recover'] as const) expect(escapeGhostGain({ chasing: true, state, stateAt: 0 }, 5000)).toBe(1);
  });
  it('沈んで消える間に絞り切り、消え切った時には無音・倒して昇天したら止まる', () => {
    const at = 1000;
    const mid = escapeGhostGain({ chasing: true, state: 'vanish', stateAt: at }, at + CRAWLER_VANISH_MS / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(escapeGhostGain({ chasing: true, state: 'vanish', stateAt: at }, at + CRAWLER_VANISH_MS)).toBe(0);
    expect(escapeGhostGain({ chasing: true, state: 'ascend', stateAt: at }, at)).toBe(0);
  });
});
