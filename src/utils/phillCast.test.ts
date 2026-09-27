// ★フィルの「演出1」(魔法の詠唱)の送り。社長支給2026-09-27「最後数コマだけピンポンして(余韻)」。
import { describe, it, expect } from 'vitest';
import { PHILL_CAST_SHEET, phillCastFrame, phillCastTech } from './enemySheets';

describe('フィルの演出1(魔法の詠唱)', () => {
  it('0→15 を一方向に流し、その後は 11〜15 を往復する(継ぎ目で同じコマが2回続かない)', () => {
    const seq = Array.from({ length: 32 }, (_, s) => phillCastFrame(s * 100 + 1, 100));
    expect(seq.slice(0, 16)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(seq.slice(16, 28)).toEqual([14, 13, 12, 11, 12, 13, 14, 15, 14, 13, 12, 11]);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    for (const f of seq) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(PHILL_CAST_SHEET.frames); }
    for (const f of seq.slice(16)) expect(f).toBeGreaterThanOrEqual(PHILL_CAST_SHEET.loopFrom);
  });
  it('経過が負・非数なら先頭コマ', () => {
    expect(phillCastFrame(-50, 75)).toBe(0);
    expect(phillCastFrame(Number.NaN, 75)).toBe(0);
  });
  it('使う技は空から来る魔法4つ(社長選択)。他の技では出さない', () => {
    for (const st of ['phill-lightrain-windup', 'phill-meteor-active', 'phill-judgment-recover', 'phill-summon-windup']) {
      expect(phillCastTech(st), st).not.toBeNull();
    }
    for (const st of ['phill-lancefan-windup', 'phill-wingslash-active', 'phill-cage-windup', 'chase', undefined]) {
      expect(phillCastTech(st), String(st)).toBeNull();
    }
  });
});
