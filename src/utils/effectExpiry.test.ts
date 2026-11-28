import { describe, it, expect } from 'vitest';
import { isEffectExpired, pruneExpiredEffects, effectLifeExtensionMs } from './effectExpiry';
import { MELEE_HIT_HOLD_MIN_MS } from './meleeHitstopTiming';

const fx = (id: string, createdAt: number, duration: number) => ({ kind: 'particle' as const, id, createdAt, duration });

describe('effectExpiry(updateEffects の掃除と同じ式)', () => {
  it('寿命を過ぎた物だけ切れる', () => {
    expect(isEffectExpired(fx('a', 1000, 500), 1500)).toBe(false);
    expect(isEffectExpired(fx('a', 1000, 500), 1501)).toBe(true);
  });
  it('一閃の筋・鞭の縄は絵の時計を止めた分だけ延びる', () => {
    expect(effectLifeExtensionMs({ kind: 'slash', createdAt: 0, duration: 100, stopMs: 80 })).toBe(80);
    expect(effectLifeExtensionMs({ kind: 'trail', createdAt: 0, duration: 100 })).toBe(0);
    expect(effectLifeExtensionMs({ kind: 'whiprope', createdAt: 0, duration: 100, stopAt: 10, stopMs: 1 })).toBe(MELEE_HIT_HOLD_MIN_MS);
    expect(effectLifeExtensionMs({ kind: 'whiprope', createdAt: 0, duration: 100 })).toBe(0);
    expect(isEffectExpired({ kind: 'slash', createdAt: 0, duration: 100, stopMs: 80 }, 150)).toBe(false);
  });
  it('切れた物が無ければ同じ配列を返す(store へ書かない)', () => {
    const list = [fx('a', 1000, 500), fx('b', 1200, 500)];
    expect(pruneExpiredEffects(list, 1400)).toBe(list);
  });
  it('切れた物だけを抜き、並びはそのまま(城ボスの撃破の寄りの間に溜まった分が捨てられる)', () => {
    const list = [fx('old1', 0, 300), fx('live', 900, 500), fx('old2', 100, 300), fx('live2', 1000, 900)];
    expect(pruneExpiredEffects(list, 1200).map(e => e.id)).toEqual(['live', 'live2']);
  });
});
