import { describe, it, expect } from 'vitest';
import { rescueQuestSpawnReady } from './rescueQuestGate';

describe('rescueQuestSpawnReady(EVENT_QUEST_DESIGN.md §2-11)', () => {
  it('basesRequired未設定(S1/S3/S4)は4:00超過だけで真', () => {
    expect(rescueQuestSpawnReady(4 * 60 * 1000, 4 * 60 * 1000, 0, undefined)).toBe(true);
    expect(rescueQuestSpawnReady(4 * 60 * 1000 - 1, 4 * 60 * 1000, 0, undefined)).toBe(false);
  });

  it('S5は拠点1か所以下のまま4:00を過ぎても偽(受け入れ条件1)', () => {
    expect(rescueQuestSpawnReady(10 * 60 * 1000, 4 * 60 * 1000, 1, 2)).toBe(false);
    expect(rescueQuestSpawnReady(10 * 60 * 1000, 4 * 60 * 1000, 0, 2)).toBe(false);
  });

  it('S5は2か所目を確保した瞬間(4:00以降なら即座に)真になる(受け入れ条件2)', () => {
    expect(rescueQuestSpawnReady(5 * 60 * 1000, 4 * 60 * 1000, 2, 2)).toBe(true);
  });

  it('4:00前に2か所確保済みでも、4:00に達するまでは偽(遅い方=両方満たすまで待つ)', () => {
    expect(rescueQuestSpawnReady(3 * 60 * 1000, 4 * 60 * 1000, 2, 2)).toBe(false);
    expect(rescueQuestSpawnReady(4 * 60 * 1000, 4 * 60 * 1000, 2, 2)).toBe(true);
  });
});
