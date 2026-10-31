// 「連れて歩く」のオン/オフ(research/ESCORT_FOLLOW.md §9)のユニット。
import { describe, it, expect, beforeEach } from 'vitest';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => { mem.clear(); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;

const { loadEscortFollowEnabled, saveEscortFollowEnabled, followToggleBaseAt } = await import('./escortFollowToggle');

beforeEach(() => { mem.clear(); });

describe('連れて歩くの保存', () => {
  it('既定はオフ・壊れた値もオフ(社長指示2026-10-13「最初は連れていくをオフに」)', () => {
    expect(loadEscortFollowEnabled()).toBe(false);
    mem.set('zombie.settings.escortFollow', 'xyz');
    expect(loadEscortFollowEnabled()).toBe(false);
  });
  it('オフを覚える/オンへ戻せる', () => {
    saveEscortFollowEnabled(false);
    expect(loadEscortFollowEnabled()).toBe(false);
    saveEscortFollowEnabled(true);
    expect(loadEscortFollowEnabled()).toBe(true);
  });
});

describe('切り替えのボタンを出す場所', () => {
  const bases = [
    { id: 'base-0', x: 4800, y: 0, status: 'captured' },
    { id: 'base-1', x: 0, y: 4800, status: 'open' },
  ];
  it('解放済みの拠点の円の中だけ', () => {
    expect(followToggleBaseAt(4800 + 100, 0, bases, 130)).toBe('base-0');
    expect(followToggleBaseAt(4800 + 140, 0, bases, 130)).toBeNull();
  });
  it('未解放の拠点の円では出ない', () => {
    expect(followToggleBaseAt(0, 4800, bases, 130)).toBeNull();
  });
});
