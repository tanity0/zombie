// 攻略ヒントの掟(BOSS_MAKER.md §20-8-b-7)を機械で固定する。
import { describe, it, expect } from 'vitest';
import { BOSS_HINTS, bossHintsFor } from './bossHints';
import { PRACTICE_SLOTS } from '../utils/bossPractice';

describe('攻略ヒント', () => {
  // ★数値を書くと、バランス調整した瞬間に文面が嘘になる(チュートリアルの作り方と同じ掟)。
  it('本文に半角数字を書かない', () => {
    for (const [key, lines] of Object.entries(BOSS_HINTS)) {
      for (const line of lines ?? []) {
        expect(/[0-9]/.test(line), `${key}: "${line}"`).toBe(false);
      }
    }
  });

  it('ボスラッシュに並ぶ全てのボスにヒントがある', () => {
    for (const slot of PRACTICE_SLOTS) {
      expect(bossHintsFor(slot.bossType).length, slot.slotKey).toBeGreaterThan(0);
    }
  });
});
