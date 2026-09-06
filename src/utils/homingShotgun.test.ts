import { describe, it, expect } from 'vitest';
import { assignHomingShotgunTargets } from './homingShotgun';

describe('assignHomingShotgunTargets', () => {
  it('対象なし(0体)なら全弾undefined', () => {
    const result = assignHomingShotgunTargets([], 9);
    expect(result).toHaveLength(9);
    expect(result.every(id => id === undefined)).toBe(true);
  });

  it('1体だけなら全弾が同じ1体に集中する(UNIQUE_WEAPONS.md §16-2「1体なら全弾集中」)', () => {
    const result = assignHomingShotgunTargets([{ id: 'e1' }], 9);
    expect(result).toHaveLength(9);
    expect(result.every(id => id === 'e1')).toBe(true);
  });

  it('複数体なら均等に分散する(round-robin・§16-2「複数なら分散」)', () => {
    const result = assignHomingShotgunTargets([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 9);
    expect(result).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c']);
    // 3体で9発なら1体あたりちょうど3発(偏りなし)。
    const counts = new Map<string, number>();
    for (const id of result) counts.set(id as string, (counts.get(id as string) ?? 0) + 1);
    expect([...counts.values()]).toEqual([3, 3, 3]);
  });

  it('割り切れない体数でも先頭から順に配られる(偏りは先頭側に1発ずつ)', () => {
    const result = assignHomingShotgunTargets([{ id: 'a' }, { id: 'b' }], 9);
    const counts = new Map<string, number>();
    for (const id of result) counts.set(id as string, (counts.get(id as string) ?? 0) + 1);
    expect(counts.get('a')).toBe(5);
    expect(counts.get('b')).toBe(4);
  });

  it('count=0なら空配列', () => {
    expect(assignHomingShotgunTargets([{ id: 'a' }], 0)).toEqual([]);
  });
});
