import { beforeEach, describe, expect, it } from 'vitest';
import {
  GHOST_ARRIVAL_COMMENT_DEFAULT,
  GHOST_DEPARTURE_COMMENT_DEFAULT,
  loadGhostComments,
  sanitizeGhostComment,
  saveGhostComments,
} from './ghostComment';

const installStorage = () => {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() { return map.size; },
  } as Storage;
};

describe('guardian arrival and departure comments', () => {
  beforeEach(installStorage);

  it('uses the requested defaults when nothing has been saved', () => {
    expect(loadGhostComments()).toEqual({
      arrivalComment: GHOST_ARRIVAL_COMMENT_DEFAULT,
      departureComment: GHOST_DEPARTURE_COMMENT_DEFAULT,
    });
  });

  it('saves both fields and restores blank fields to their defaults', () => {
    saveGhostComments({ arrivalComment: '任せて！', departureComment: '' });
    expect(loadGhostComments()).toEqual({
      arrivalComment: '任せて！',
      departureComment: GHOST_DEPARTURE_COMMENT_DEFAULT,
    });
  });

  it('limits comments to 30 Unicode characters and removes control text', () => {
    expect([...sanitizeGhostComment('あ'.repeat(35))]).toHaveLength(30);
    expect(sanitizeGhostComment('援護\nします\u202e！')).toBe('援護 します ！');
  });
});
