import { describe, expect, it } from 'vitest';
import { MASTERY_MAX_LEVEL, gunMasteryKeyOfWeaponKey } from '../data/mastery';
import { masteryLevelFor, masteryNeedFor } from './mastery';
import {
  isGunMasteryKey, isMeleeMasteryKey, masteryBadgeOf, masteryDebugLine, masteryDebugRunLine, masteryFillSteps, masteryKeyOfMelee, masteryKeyOfSub, masteryLevelLabel,
  masteryResultRows,
} from './masteryView';

const KEY = 'handgun-t1' as const;
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
      'handgun-t1': { before: 0, after: xpAt(3), levelBefore: 1, levelAfter: 3 },
      'rifle-t1': { before: 0, after: xpAt(2) + 1, levelBefore: 1, levelAfter: 2 },
      katana: { before: 0, after: 900, levelBefore: 1, levelAfter: 1 },
      dog: { before: 0, after: 300, levelBefore: 1, levelAfter: 1 },
    });
    expect(rows.map(r => r.key)).toEqual(['katana', 'dog', 'handgun-t1', 'rifle-t1']);
    expect(rows.map(r => r.levelUp)).toEqual([false, false, true, true]);
  });
  it('伸びた物だけを伸びた量の多い順に', () => {
    const rows = masteryResultRows({
      'handgun-t1': { before: 0, after: 100, levelBefore: 1, levelAfter: 1 },
      katana: { before: 50, after: 950, levelBefore: 1, levelAfter: 1 },
      'shotgun-t1': { before: 10, after: 10, levelBefore: 1, levelAfter: 1 },
    });
    expect(rows.map(r => r.key)).toEqual(['katana', 'handgun-t1']);
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
    const half = masteryBadgeOf(KEY, { xp: { 'handgun-t1': xpAt(2) + masteryNeedFor(KEY, 2) / 2 } });
    expect(half?.level).toBe(2);
    expect(half?.frac).toBeCloseTo(0.5);
    expect(half?.max).toBe(false);
    expect(masteryBadgeOf(KEY, { xp: { 'handgun-t1': xpAt(MASTERY_MAX_LEVEL) } })).toEqual({ level: MASTERY_MAX_LEVEL, frac: 1, max: true, fixed: false });
  });
});

describe('masteryDebugLine(開発用の数字)', () => {
  it('段階をまたがない: 今回=後−前・累計=後・次まで=今の段の残り', () => {
    const need = masteryNeedFor(KEY, 1);
    const before = Math.floor(need * 0.2);
    const after = Math.floor(need * 0.6);
    expect(masteryDebugLine(KEY, entry(before, after)))
      .toBe(`今回 +${(after - before).toLocaleString('en-US')} / 累計 ${after.toLocaleString('en-US')} / 次まで ${(need - after).toLocaleString('en-US')}`);
  });

  it('段階をまたぐ: 次まで=上がった後の段の残り', () => {
    const before = xpAt(2) - 3;
    const after = xpAt(3) + 5;
    const rest = masteryNeedFor(KEY, 3) - 5;
    expect(masteryDebugLine(KEY, entry(before, after)))
      .toBe(`今回 +${(after - before).toLocaleString('en-US')} / 累計 ${after.toLocaleString('en-US')} / 次まで ${rest.toLocaleString('en-US')}`);
  });

  it('最大: 次までを出さず MAX', () => {
    const top = xpAt(MASTERY_MAX_LEVEL);
    const line = masteryDebugLine(KEY, entry(top - 10, top + 10));
    expect(line).toBe(`今回 +20 / 累計 ${(top + 10).toLocaleString('en-US')} / MAX`);
    expect(line).not.toContain('次まで');
  });

  it('出撃の行: mm:ss とステージ', () => {
    expect(masteryDebugRunLine(754.9, 'stage-2 避難回廊')).toBe('出撃 12:34・stage-2 避難回廊');
    expect(masteryDebugRunLine(5, '')).toBe('出撃 00:05・(ステージ不明)');
  });
});

// 社長裁定2026-11-12「ナイフ毎の括り」: 一時停止の近接の行は、装備している近接武器のキーで札を出す。
describe('近接の札(ナイフ毎)', () => {
  it('masteryKeyOfMelee: 近接武器のキーそのもの・台帳に無い/無しは null', () => {
    expect(masteryKeyOfMelee('machete-t3')).toBe('machete-t3');
    expect(masteryKeyOfMelee('knife-t1')).toBe('knife-t1');
    expect(masteryKeyOfMelee('handgun-t1')).toBeNull();
    expect(masteryKeyOfMelee(undefined)).toBeNull();
    expect(masteryKeyOfMelee('melee')).toBeNull();
  });
  it('札は装備しているナイフの量で決まる(別のナイフの量は見ない)', () => {
    const state = { xp: { 'machete-t3': masteryNeedFor('machete-t3', 1) * 1.5, 'knife-t1': 999_999_999 } };
    expect(masteryBadgeOf(masteryKeyOfMelee('machete-t3'), state)?.level).toBe(2);
    expect(masteryBadgeOf(masteryKeyOfMelee('hatchet-t2'), state)?.level).toBe(1);
    expect(masteryBadgeOf(masteryKeyOfMelee('knife-t1'), state)?.max).toBe(true);
  });
  it('isMeleeMasteryKey: 近接武器のキーだけ true', () => {
    expect(isMeleeMasteryKey('anti-mutant-knife-t5')).toBe(true);
    for (const k of ['handgun-t1', 'katana', 'brawler', 'melee', 'fire-knife']) expect(isMeleeMasteryKey(k), k).toBe(false);
  });
  it('リザルトの並びにナイフ毎のキーが出る', () => {
    const rows = masteryResultRows({ 'machete-t3': { before: 0, after: 10, levelBefore: 1, levelAfter: 1 } });
    expect(rows.map(r => r.key)).toEqual(['machete-t3']);
  });
});

// 社長指示2026-11-13「熟練度が武器毎になってない。種類ごとになってる」: 銃の札は銃のキーごと。
describe('銃の札(武器ごと)', () => {
  it('gunMasteryKeyOfWeaponKey: 銃のキーそのもの・種類の名/近接/無しは undefined', () => {
    expect(gunMasteryKeyOfWeaponKey('handgun-t3-piledriver')).toBe('handgun-t3-piledriver');
    expect(gunMasteryKeyOfWeaponKey('handgun-t3')).toBe('handgun-t3');
    for (const k of ['handgun', 'shotgun', 'knife-t1', 'katana', undefined, null]) expect(gunMasteryKeyOfWeaponKey(k), String(k)).toBeUndefined();
  });
  it('札は同じ種類でも銃ごとに別(別の銃の量は見ない)', () => {
    const state = { xp: { 'handgun-t3-piledriver': masteryNeedFor('handgun-t3-piledriver', 1) * 1.5 } };
    expect(masteryBadgeOf(gunMasteryKeyOfWeaponKey('handgun-t3-piledriver'), state)?.level).toBe(2);
    expect(masteryBadgeOf(gunMasteryKeyOfWeaponKey('handgun-t3'), state)?.level).toBe(1);
  });
  it('isGunMasteryKey: 銃のキーだけ true(リザルトの名前は武器の名前)', () => {
    expect(isGunMasteryKey('glauncher-t3-signal')).toBe(true);
    for (const k of ['handgun', 'knife-t1', 'katana', 'brawler']) expect(isGunMasteryKey(k), k).toBe(false);
  });
});
