// ウェルカムの連続クリア(社長指示2026-10-13「3連続でクリアした時のみ、もう出ない」)のユニット。
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

const {
  WELCOME_RETIRE_STREAK, loadWelcomeStreak, isWelcomeRetired, beginWelcomeAttempt, completeWelcomeAttempt, clearWelcomeStreaks,
} = await import('./welcomeStreak');

beforeEach(() => { mem.clear(); });

const clearOnce = (stageId: string) => completeWelcomeAttempt(stageId, beginWelcomeAttempt(stageId));

describe('ウェルカムの連続クリア', () => {
  it('3連続で卒業(以後出ない)', () => {
    expect(WELCOME_RETIRE_STREAK).toBe(3);
    clearOnce('stage-1'); clearOnce('stage-1');
    expect(isWelcomeRetired('stage-1')).toBe(false);
    clearOnce('stage-1');
    expect(isWelcomeRetired('stage-1')).toBe(true);
  });

  it('途中で倒れた/打ち切った(開始したが倒し切れなかった)回で0へ戻る', () => {
    clearOnce('stage-1'); clearOnce('stage-1');
    beginWelcomeAttempt('stage-1'); // 倒し切れずに終わった
    expect(loadWelcomeStreak('stage-1')).toBe(0);
    clearOnce('stage-1');
    expect(loadWelcomeStreak('stage-1')).toBe(1);
    expect(isWelcomeRetired('stage-1')).toBe(false);
  });

  it('ステージごとに別々に数える', () => {
    clearOnce('stage-1'); clearOnce('stage-1'); clearOnce('stage-1');
    expect(isWelcomeRetired('stage-1')).toBe(true);
    expect(isWelcomeRetired('stage-3')).toBe(false);
  });

  it('壊れた保存は0扱い・進行リセットで消える', () => {
    mem.set('zombie.progress.welcomeStreak', '{bad');
    expect(loadWelcomeStreak('stage-1')).toBe(0);
    clearOnce('stage-1');
    clearWelcomeStreaks();
    expect(loadWelcomeStreak('stage-1')).toBe(0);
  });
});
