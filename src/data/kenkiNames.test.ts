import { describe, expect, it } from 'vitest';
import { KENKI_LEVEL_LINES, KENKI_LEVEL_NAMES } from './kenkiNames';
import { kenkiLevelLine, kenkiLevelLook } from '../utils/kenkiLevel';

const LEVELS = [1, 2, 3, 4, 5] as const;

describe('孫悟空のレベルごとのセリフ(KENKI_LEVEL_LINES)', () => {
  it('5段そろっていて、名前の表と同じ段を持つ', () => {
    expect(Object.keys(KENKI_LEVEL_LINES).map(Number).sort()).toEqual([...LEVELS]);
    expect(Object.keys(KENKI_LEVEL_LINES).sort()).toEqual(Object.keys(KENKI_LEVEL_NAMES).sort());
  });

  it('名乗り・倒された時のどちらも空文字が無い', () => {
    for (const lv of LEVELS) {
      expect(KENKI_LEVEL_LINES[lv].intro.trim()).not.toBe('');
      expect(KENKI_LEVEL_LINES[lv].defeat.trim()).not.toBe('');
    }
  });

  it('社長指定の文言どおり', () => {
    expect(KENKI_LEVEL_LINES[1]).toEqual({ intro: '……天、へ……', defeat: '……まだ、足りぬ……' });
    expect(KENKI_LEVEL_LINES[5]).toEqual({ intro: '……戦の果て……我、仏なり……', defeat: '……空へ……還る……' });
  });

  it('通信に積む1行は、話者名=その段の名前(頭上の名札と同じ)', () => {
    for (const lv of LEVELS) {
      expect(kenkiLevelLine(lv, 'intro')).toEqual({ name: kenkiLevelLook(lv).name, text: KENKI_LEVEL_LINES[lv].intro });
      expect(kenkiLevelLine(lv, 'defeat')).toEqual({ name: kenkiLevelLook(lv).name, text: KENKI_LEVEL_LINES[lv].defeat });
    }
  });
});
