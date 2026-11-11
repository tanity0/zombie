import { describe, expect, it } from 'vitest';
import { MASTERY_MAX_LEVEL } from '../data/mastery';
import { masteryLevelFor, masteryNeedFor } from './mastery';
import {
  masteryBadgeOf, masteryFillSteps, masteryKeyOfSub, masteryLevelLabel, masteryResultRows,
} from './masteryView';

const KEY = 'handgun' as const;
/** Lv1 から Lv `level` に入るまでの累計。 */
const xpAt = (level: number): number => {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += masteryNeedFor(KEY, l);
  return sum;
};
const entry = (before: number, after: number) => ({
  before, after, levelBefore: masteryLevelFor(KEY, before), levelAfter: masteryLevelFor(KEY, after),
});

describe('masteryFillSteps', () => {
  it('段階をまたがない: 前の割合 → 後の割合の1区間', () => {
    const need = masteryNeedFor(KEY, 1);
    const steps = masteryFillSteps(KEY, entry(need * 0.2, need * 0.6));
    expect(steps).toHaveLength(1);
    expect(steps[0].level).toBe(1);
    expect(steps[0].from).toBeCloseTo(0.2);
    expect(steps[0].to).toBeCloseTo(0.6);
    expect(steps[0].levelUp).toBe(false);
  });

  it('1段またぐ: 満ちて上がる → 空から続き', () => {
    const base = xpAt(3);
    const steps = masteryFillSteps(KEY, entry(base + masteryNeedFor(KEY, 3) * 0.5, xpAt(4) + masteryNeedFor(KEY, 4) * 0.25));
    expect(steps.map(s => [s.level, s.levelUp])).toEqual([[3, true], [4, false]]);
    expect(steps[0].from).toBeCloseTo(0.5);
    expect(steps[0].to).toBe(1);
    expect(steps[1].from).toBe(0);
    expect(steps[1].to).toBeCloseTo(0.25);
  });

  it('ちょうど次の段階に入った所で止まる: 最後の区間は無い(0→0 は出さない)', () => {
    const steps = masteryFillSteps(KEY, entry(xpAt(2) + 10, xpAt(3)));
    expect(steps.map(s => [s.level, s.levelUp])).toEqual([[2, true]]);
  });

  it('複数段またぐ: 途中の段階は 0 → 1 で順に上がる', () => {
    const steps = masteryFillSteps(KEY, entry(xpAt(1) + 100, xpAt(5) + 1));
    expect(steps.map(s => s.level)).toEqual([1, 2, 3, 4, 5]);
    expect(steps.slice(0, 4).every(s => s.levelUp && s.to === 1)).toBe(true);
    expect(steps.slice(1, 4).every(s => s.from === 0)).toBe(true);
    expect(steps[4].levelUp).toBe(false);
    expect(steps[4].from).toBe(0);
    expect(steps[4].to).toBeGreaterThan(0);
  });

  it('最大に届く: Lv9 で満ちて上がって終わり(Lv10 の区間は無い)', () => {
    const steps = masteryFillSteps(KEY, entry(xpAt(8) + 5, xpAt(MASTERY_MAX_LEVEL) + 99999));
    expect(steps.map(s => [s.level, s.levelUp])).toEqual([[8, true], [9, true]]);
    expect(steps[1]).toEqual({ level: 9, from: 0, to: 1, levelUp: true });
  });

  it('最大からは増えない: 空', () => {
    expect(masteryFillSteps(KEY, entry(xpAt(MASTERY_MAX_LEVEL) + 10, xpAt(MASTERY_MAX_LEVEL) + 5000))).toEqual([]);
  });
});

describe('masteryResultRows', () => {
  it('上がらない物 → 上がる物の順・それぞれの中は伸びた量の多い順', () => {
    const rows = masteryResultRows({
      handgun: { before: 0, after: xpAt(3), levelBefore: 1, levelAfter: 3 },
      rifle: { before: 0, after: xpAt(2) + 1, levelBefore: 1, levelAfter: 2 },
      katana: { before: 0, after: 900, levelBefore: 1, levelAfter: 1 },
      dog: { before: 0, after: 300, levelBefore: 1, levelAfter: 1 },
    });
    expect(rows.map(r => r.key)).toEqual(['katana', 'dog', 'handgun', 'rifle']);
    expect(rows.map(r => r.levelUp)).toEqual([false, false, true, true]);
  });
  it('伸びた物だけを伸びた量の多い順に', () => {
    const rows = masteryResultRows({
      handgun: { before: 0, after: 100, levelBefore: 1, levelAfter: 1 },
      katana: { before: 50, after: 950, levelBefore: 1, levelAfter: 1 },
      shotgun: { before: 10, after: 10, levelBefore: 1, levelAfter: 1 },
    });
    expect(rows.map(r => r.key)).toEqual(['katana', 'handgun']);
    expect(rows[0].gain).toBe(900);
  });
  it('空・null は空', () => {
    expect(masteryResultRows({})).toEqual([]);
    expect(masteryResultRows(null)).toEqual([]);
  });
});

describe('札', () => {
  it('段階の文字', () => {
    expect(masteryLevelLabel(1)).toBe('Lv 1');
    expect(masteryLevelLabel(9)).toBe('Lv 9');
    expect(masteryLevelLabel(MASTERY_MAX_LEVEL)).toBe('MAX');
  });
  it('サブ → キー: 最初から最大は max・村雨は刀・知らない物は null', () => {
    expect(masteryKeyOfSub('flare-gun')).toBe('max');
    expect(masteryKeyOfSub('murasame')).toBe('katana');
    expect(masteryKeyOfSub('dog')).toBe('dog');
    expect(masteryKeyOfSub('shijin')).toBeNull();
  });
  it('保存の値 → 札', () => {
    expect(masteryBadgeOf(null, { xp: {} })).toBeNull();
    expect(masteryBadgeOf('max', { xp: {} })).toEqual({ level: MASTERY_MAX_LEVEL, frac: 1, max: true, fixed: true });
    const half = masteryBadgeOf(KEY, { xp: { handgun: xpAt(2) + masteryNeedFor(KEY, 2) / 2 } });
    expect(half?.level).toBe(2);
    expect(half?.frac).toBeCloseTo(0.5);
    expect(half?.max).toBe(false);
    expect(masteryBadgeOf(KEY, { xp: { handgun: xpAt(MASTERY_MAX_LEVEL) } })).toEqual({ level: MASTERY_MAX_LEVEL, frac: 1, max: true, fixed: false });
  });
});
