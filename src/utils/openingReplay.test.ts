// オープニングを毎回流さない(UIUX_PROPOSAL.md P7)の判定と記録。
import { describe, it, expect, beforeEach } from 'vitest';
import { OPENING_SEEN_KEY, loadOpeningSeen, markOpeningSeen, shouldPlayOpeningOnLaunch } from './openingReplay';

const installStorage = () => {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
  return map;
};

describe('openingReplay', () => {
  let store: Map<string, string>;
  beforeEach(() => { store = installStorage(); });

  it('キーは zombie.opening.seen で固定(変えると全端末でもう一度流れる)', () => {
    expect(OPENING_SEEN_KEY).toBe('zombie.opening.seen');
  });

  it('初めての端末は流す/見終えた後の起動は流さない', () => {
    expect(loadOpeningSeen()).toBe(false);
    expect(shouldPlayOpeningOnLaunch(loadOpeningSeen())).toBe(true);
    markOpeningSeen();
    expect(store.get(OPENING_SEEN_KEY)).toBe('1');
    expect(loadOpeningSeen()).toBe(true);
    expect(shouldPlayOpeningOnLaunch(loadOpeningSeen())).toBe(false);
  });

  it('チュートリアルの既読キーとは混ざらない', () => {
    markOpeningSeen();
    expect([...store.keys()]).toEqual([OPENING_SEEN_KEY]);
  });

  it('localStorage が読めない環境は「見ていない」=今どおり流す(落ちない)', () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    } as unknown as Storage;
    expect(() => markOpeningSeen()).not.toThrow();
    expect(loadOpeningSeen()).toBe(false);
    expect(shouldPlayOpeningOnLaunch(loadOpeningSeen())).toBe(true);
  });
});
