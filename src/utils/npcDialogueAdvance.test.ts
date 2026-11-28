import { describe, it, expect } from 'vitest';
import { canAdvanceNpcLine, advanceNpcDialogueState } from './npcDialogueAdvance';
import { GLEN_ROAR_LINE, GLEN_FINAL_LINE } from './glenIntro';

const T = { lineMs: 2800, gapMs: 500, slowExtraMs: 1200 };
const free = { attention: false, glenTransform: false };

describe('canAdvanceNpcLine', () => {
  it('ふつうの行は送れる', () => {
    expect(canAdvanceNpcLine({ text: 'きてくれたか……' }, free)).toBe(true);
    expect(canAdvanceNpcLine({ text: GLEN_FINAL_LINE }, free)).toBe(true);
  });
  it('行が無い時は何もしない', () => {
    expect(canAdvanceNpcLine(null, free)).toBe(false);
  });
  it('咆哮の行は送れない(変身の場面が出し入れする)', () => {
    expect(canAdvanceNpcLine({ text: GLEN_ROAR_LINE }, free)).toBe(false);
  });
  it('寄り(アテンション)の間・変身の場面の間は送れない', () => {
    expect(canAdvanceNpcLine({ text: 'a' }, { attention: true, glenTransform: false })).toBe(false);
    expect(canAdvanceNpcLine({ text: 'a' }, { attention: false, glenTransform: true })).toBe(false);
  });
});

describe('advanceNpcDialogueState', () => {
  it('次の行を行間なしで今すぐ出す(尺は自動の時と同じ)', () => {
    const q = [{ name: 'ミラ', text: 'b' }, { name: 'グレン', text: 'c' }];
    const r = advanceNpcDialogueState(q, 1000, T);
    expect(r.npcDialogue).toEqual({ name: 'ミラ', text: 'b', until: 1000 + T.lineMs });
    expect(r.npcDialogueQueue).toEqual([q[1]]);
    expect(r.npcDialogueNextAt).toBe(1000);
  });
  it('ゆっくり話す行は文字送りのぶん長い', () => {
    const r = advanceNpcDialogueState([{ name: 'ジュン', text: 'x', slow: true }], 0, T);
    expect(r.npcDialogue?.until).toBe(T.lineMs + T.slowExtraMs);
  });
  it('立ち絵の差し替えなど追加の項目はそのまま引き継ぐ', () => {
    const r = advanceNpcDialogueState([{ name: 'グレン', text: GLEN_ROAR_LINE, portrait: 'グレン(変異)' }], 0, T);
    expect(r.npcDialogue?.portrait).toBe('グレン(変異)');
  });
  it('最後の行なら閉じるだけ(次に積まれた行は行間の後)', () => {
    const r = advanceNpcDialogueState([], 2000, T);
    expect(r.npcDialogue).toBeNull();
    expect(r.npcDialogueQueue).toEqual([]);
    expect(r.npcDialogueNextAt).toBe(2000 + T.gapMs);
  });
});
