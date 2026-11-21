import { describe, it, expect } from 'vitest';
import { cycledGunId } from './weaponCycle';

describe('武器の持ち替え(PC・パッド)', () => {
  it('次/前は枠の順で循環する', () => {
    expect(cycledGunId(['a', 'b', 'c'], 'a', 1)).toBe('b');
    expect(cycledGunId(['a', 'b', 'c'], 'c', 1)).toBe('a');
    expect(cycledGunId(['a', 'b', 'c'], 'a', -1)).toBe('c');
  });
  it('銃が1丁なら今のまま・無ければ null・今の銃が並びに無ければ先頭', () => {
    expect(cycledGunId(['a'], 'a', 1)).toBe('a');
    expect(cycledGunId([], null, 1)).toBeNull();
    expect(cycledGunId(['a', 'b'], 'zzz', 1)).toBe('a');
  });
});
