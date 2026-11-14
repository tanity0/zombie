// 熟練度(research/MASTERY.md「v2 発注仕様」+「v2.1 追補」)の純関数・保存・出撃の間の状態の不変条件。
// 与ダメの各呼び口への当てはめ(次の発注)はここでは見ない。
import { describe, it, expect, beforeEach } from 'vitest';

// localStorage は node 環境に無いので、モジュールを読む**前に**スタブを差す(playerUpgrades.test.ts と同じ作法)。
const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => { backing[k] = v; },
  removeItem: (k: string) => { delete backing[k]; },
  clear: () => { for (const k of Object.keys(backing)) delete backing[k]; },
  key: () => null,
  get length() { return Object.keys(backing).length; },
} as Storage;

import {
  GROWING_MASTERY_KEYS, MASTERY_BASE, MASTERY_BASE_BY_TIER, masteryBaseTierOf, MASTERY_KEY, MASTERY_PENDING_KEY, MASTERY_MAXED_SUBS, SUB_TO_MASTERY_KEY,
  MASTERY_SUB_KEYS, MASTERY_GUN_KEYS, MASTERY_MELEE_KEYS, MASTERY_XP_WEIGHT, isGrowingMasteryKey,
} from '../data/mastery';
import type { SubWeaponKey } from '../types/game';
import {
  masteryNeedFor, masteryLevelFor, masteryProgress, masteryDamageMult, normalizeMastery, loadMastery, saveMastery,
  masteryMultTable, masteryLoadoutMult, masteryMultOf, masteryIgnoredRun, commitMasteryRun, getLastMasteryCommit,
  recoverMasteryPending, masteryXpWeight, masteryXpAmount, burnRefreshMastery, type MasteryRunFlags,
  normalizeMasteryRecord, objectMasteryMult, guardianMasteryMult, migrateLegacyMeleeXp, meleeMasteryKeyOf, loadStashedMasteryPending,
} from './mastery';
import {
  withMastery, currentMasterySource, currentMasteryExecute, beginMasteryRun, noteMasteryDamage, getPendingMastery, getMasteryReport,
  stashMasteryPending, isMasteryRunIgnored, currentMasteryAppliedMult,
} from './masteryRun';

const xpOfLevel = (key: Parameters<typeof masteryNeedFor>[0], level: number): number => {
  let xp = 0;
  for (let l = 1; l < level; l++) xp += masteryNeedFor(key, l);
  return xp;
};

const NO_FLAGS: MasteryRunFlags = {
  practice: false, noProgress: false, bossMaker: false, gauntlet: false, bot: false, tutorial: false, benchmark: false,
};

/** resetGame の熟練度の部分だけを、同じ順番でなぞる(回収→焼き込み→beginMasteryRun)。 */
const startRun = (ignored = false) => {
  recoverMasteryPending();
  const mult = masteryMultTable(loadMastery(), ignored);
  beginMasteryRun({ ignored });
  return mult;
};

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  beginMasteryRun({ ignored: false });
  recoverMasteryPending();
  for (const k of Object.keys(backing)) delete backing[k];
});

describe('台帳(data/mastery)', () => {
  it('キーは実在の型と一致する(型で止める: data/mastery は types/game を読めないため)', () => {
    const subs: readonly SubWeaponKey[] = MASTERY_SUB_KEYS;
    const maxed: readonly SubWeaponKey[] = MASTERY_MAXED_SUBS as readonly SubWeaponKey[];
    const toMastery: Partial<Record<SubWeaponKey, string>> = SUB_TO_MASTERY_KEY;
    expect(MASTERY_GUN_KEYS.length).toBe(37);
    expect(subs.length).toBe(21);
    expect(maxed.length).toBe(5);
    expect(Object.keys(toMastery).length).toBe(22);
  });
  it('育つキーは銃37(武器ごと)+近接武器5+サブ21=63。murasame は katana・最初から最大のサブは育たない・旧 melee・銃の種類の名は育たない', () => {
    expect(GROWING_MASTERY_KEYS.length).toBe(63);
    for (const k of ['handgun', 'shotgun', 'rifle', 'glauncher', 'phill']) expect(isGrowingMasteryKey(k), k).toBe(false); // 種類ごとのキーは廃止
    for (const k of MASTERY_GUN_KEYS) expect(isGrowingMasteryKey(k), k).toBe(true);
    expect(new Set(GROWING_MASTERY_KEYS)).toEqual(new Set([...MASTERY_GUN_KEYS, ...MASTERY_MELEE_KEYS, ...MASTERY_SUB_KEYS]));
    expect(isGrowingMasteryKey('melee')).toBe(false);
    for (const k of MASTERY_MELEE_KEYS) expect(isGrowingMasteryKey(k), k).toBe(true);
    expect(MASTERY_SUB_KEYS.length).toBe(21);
    expect(SUB_TO_MASTERY_KEY.shield).toBe('shield');
    expect(SUB_TO_MASTERY_KEY['first-aid-kit']).toBe('first-aid-kit');
    expect([...MASTERY_MAXED_SUBS].sort()).toEqual(['flare-gun', 'marksman-trap', 'sage-stone', 'striker-hunting', 'striker-quick-mag']);
    expect(SUB_TO_MASTERY_KEY.murasame).toBe('katana');
    for (const s of MASTERY_MAXED_SUBS) expect(SUB_TO_MASTERY_KEY[s], s).toBeUndefined();
    expect(SUB_TO_MASTERY_KEY.shijin).toBeUndefined();
    for (const k of ['loadout', 'none', 'max', 'shijin', 'murasame']) expect(isGrowingMasteryKey(k), k).toBe(false);
  });
  it('MASTERY_BASE は区分の値: 格闘 120,000 / 銃(武器ごと)・近接 60,000 / サブウェポン 20,000(値そのものを固定するのはこの1本だけ)', () => {
    expect(MASTERY_BASE_BY_TIER).toEqual({ brawler: 120_000, gunMelee: 60_000, sub: 20_000 });
    expect(masteryBaseTierOf('brawler')).toBe('brawler');
    for (const k of [...MASTERY_GUN_KEYS, ...MASTERY_MELEE_KEYS]) expect(masteryBaseTierOf(k), k).toBe('gunMelee');
    for (const k of MASTERY_SUB_KEYS) if (k !== 'brawler') expect(masteryBaseTierOf(k), k).toBe('sub');
    for (const k of GROWING_MASTERY_KEYS) expect(MASTERY_BASE[k], k).toBe(MASTERY_BASE_BY_TIER[masteryBaseTierOf(k)]);
    expect(Object.keys(MASTERY_BASE).sort()).toEqual([...GROWING_MASTERY_KEYS].sort());
  });
});

describe('段階と倍率', () => {
  it('masteryDamageMult: 1→1.0・10→1.9・間は0.1刻み・範囲の外は丸める', () => {
    for (let l = 1; l <= 10; l++) expect(masteryDamageMult(l), String(l)).toBeCloseTo(1 + 0.1 * (l - 1), 10);
    expect(masteryDamageMult(1)).toBe(1);
    expect(masteryDamageMult(10)).toBe(1.9);
    expect(masteryDamageMult(0)).toBe(1);
    expect(masteryDamageMult(-5)).toBe(1);
    expect(masteryDamageMult(11)).toBe(1.9);
    expect(masteryDamageMult(NaN)).toBe(1);
  });
  it('必要量: Lv n→n+1 = base × 1.37^(n−1)(四捨五入)', () => {
    for (const k of ['handgun-t1', 'brawler', 'katana'] as const) {
      const b = MASTERY_BASE[k];
      expect(masteryNeedFor(k, 1), k).toBe(b);
      expect(masteryNeedFor(k, 2), k).toBe(Math.round(b * 1.37));
      expect(masteryNeedFor(k, 9), k).toBe(Math.round(b * Math.pow(1.37, 8)));
    }
  });
  it('masteryLevelFor: 境目・上限・xp に単調・壊れた値で落ちない', () => {
    expect(masteryLevelFor('rifle-t1', 0)).toBe(1);
    expect(masteryLevelFor('rifle-t1', MASTERY_BASE['rifle-t1'] - 1)).toBe(1);
    expect(masteryLevelFor('rifle-t1', MASTERY_BASE['rifle-t1'])).toBe(2);
    expect(masteryLevelFor('rifle-t1', xpOfLevel('rifle-t1', 10))).toBe(10);
    expect(masteryLevelFor('rifle-t1', xpOfLevel('rifle-t1', 10) - 1)).toBe(9);
    expect(masteryLevelFor('rifle-t1', 1e12)).toBe(10);
    for (const bad of [NaN, -1, Infinity, '5000', null, undefined, {}]) expect(masteryLevelFor('rifle-t1', bad), String(bad)).toBe(1);
    let prev = 1;
    for (let xp = 0; xp <= xpOfLevel('rifle-t1', 10) + 5000; xp += 9973) {
      const l = masteryLevelFor('rifle-t1', xp);
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });
  it('masteryProgress: 今の段階と次までの割合・上限では frac=1', () => {
    const meleeBase = MASTERY_BASE['knife-t1'];
    expect(masteryProgress('knife-t1', meleeBase / 2)).toEqual({ level: 1, into: meleeBase / 2, need: meleeBase, frac: 0.5 });
    const p2 = masteryProgress('knife-t1', meleeBase + 411);
    expect(p2.level).toBe(2);
    expect(p2.frac).toBeCloseTo(411 / masteryNeedFor('knife-t1', 2), 10);
    const top = masteryProgress('knife-t1', xpOfLevel('knife-t1', 10) + 7);
    expect(top).toEqual({ level: 10, into: 7, need: 0, frac: 1 });
  });
});

describe('保存(normalize / load / save)', () => {
  it('壊れた保存・特別なキー・未知のキー・負の値を捨てる', () => {
    for (const raw of [null, undefined, 3, 'x', [], { xp: 5 }, { xp: null }]) expect(normalizeMastery(raw), String(raw)).toEqual({ xp: {} });
    expect(normalizeMastery({ xp: { 'handgun-t1': 1200.4, loadout: 99, none: 1, max: 1, foo: 3, 'rifle-t1': -5, katana: NaN, whip: '7' } }))
      .toEqual({ xp: { 'handgun-t1': 1200 } });
  });
  it('load: 保存が無い/壊れた JSON は空。save→load で戻る', () => {
    expect(loadMastery()).toEqual({ xp: {} });
    backing[MASTERY_KEY] = '{not json';
    expect(loadMastery()).toEqual({ xp: {} });
    saveMastery({ xp: { 'shotgun-t1': 4000, decoy: 12 } });
    expect(loadMastery()).toEqual({ xp: { 'shotgun-t1': 4000, decoy: 12 } });
  });
});

describe('焼き込み', () => {
  it('masteryMultTable: 無視する出撃は空・通常は max=1.9 と上がった段階だけ', () => {
    const s = { xp: { 'handgun-t1': xpOfLevel('handgun-t1', 4), katana: 10 } };
    expect(masteryMultTable(s, true)).toEqual({});
    const t = masteryMultTable(s, false);
    expect(t.max).toBe(1.9);
    expect(t['handgun-t1']).toBeCloseTo(1.3, 10);
    expect(t.katana).toBeUndefined(); // Lv1 は載せない(=1)
    expect(masteryMultTable({ xp: {} }, false)).toEqual({ max: 1.9 });
  });
  it('masteryLoadoutMult: 重複なしの集合の平均(v2.1 A-11)', () => {
    const m = { 'handgun-t1': 1.5, 'shotgun-t1': 1.1, 'knife-t1': 1.2, 'machete-t3': 1.7, brawler: 1.9, katana: 1.4, max: 1.9 };
    // 同じ銃は2挺でも1つ。銃は武器ごと(同じ種類の別の銃は別々に数える)。近接は持っている近接武器のキー(ナイフ毎)。
    expect(masteryLoadoutMult(m, { gunKeys: ['handgun-t1', 'handgun-t1'], meleeKey: 'knife-t1', subs: [] })).toBeCloseTo((1.5 + 1.2) / 2, 10);
    expect(masteryLoadoutMult(m, { gunKeys: ['handgun-t1'], meleeKey: 'machete-t3', subs: [] })).toBeCloseTo((1.5 + 1.7) / 2, 10);
    expect(masteryLoadoutMult({ ...m, 'handgun-t3-piledriver': 1.9 }, { gunKeys: ['handgun-t1', 'handgun-t3-piledriver'], meleeKey: undefined, subs: [] }))
      .toBeCloseTo((1.5 + 1.9) / 2, 10);
    // 台帳に無い近接は数えない。
    expect(masteryLoadoutMult(m, { gunKeys: ['handgun-t1'], meleeKey: 'bogus-knife', subs: [] })).toBeCloseTo(1.5, 10);
    // 格闘を持っていれば近接の枠は brawler・サブの brawler と二重に数えない。
    expect(masteryLoadoutMult(m, { gunKeys: ['handgun-t1'], meleeKey: 'knife-t1', subs: ['brawler'] })).toBeCloseTo((1.5 + 1.9) / 2, 10);
    // murasame → katana・katana と二重に数えない。最初から最大のサブ・shijin は入れない。
    expect(masteryLoadoutMult(m, { gunKeys: ['shotgun-t1'], meleeKey: undefined, subs: ['murasame', 'katana', 'sage-stone', 'shijin'] }))
      .toBeCloseTo((1.1 + 1.4) / 2, 10);
    // 無い欄は1。集合が空なら1。
    expect(masteryLoadoutMult(m, { gunKeys: ['rifle-t1'], meleeKey: undefined, subs: [] })).toBe(1);
    expect(masteryLoadoutMult(m, { gunKeys: [undefined, 'handgun'], meleeKey: undefined, subs: ['flare-gun'] })).toBe(1);
    // shield・first-aid-kit は育つキー=持っていれば数える。
    expect(masteryLoadoutMult({ shield: 1.5, 'first-aid-kit': 1.3 }, { gunKeys: [], meleeKey: undefined, subs: ['shield', 'first-aid-kit'] }))
      .toBeCloseTo(1.4, 10);
    expect(masteryLoadoutMult({}, { gunKeys: ['handgun-t1'], meleeKey: 'knife-t1', subs: ['dog'] })).toBe(1);
  });
  it('masteryMultOf: none→1 / loadout→焼いた平均 / それ以外→焼いた倍率(無い欄=1)', () => {
    const p = { masteryMult: { 'handgun-t1': 1.3, max: 1.9 }, masteryLoadoutMult: 1.15 };
    expect(masteryMultOf(p, 'none')).toBe(1);
    expect(masteryMultOf(p, 'loadout')).toBe(1.15);
    expect(masteryMultOf(p, 'max')).toBe(1.9);
    expect(masteryMultOf(p, 'handgun-t1')).toBe(1.3);
    expect(masteryMultOf(p, 'shotgun-t1')).toBe(1); // ハンドガンを上げてもショットガンは変わらない
    expect(masteryMultOf(p, 'handgun-t3-piledriver')).toBe(1); // 同じハンドガンでも別の銃は変わらない(武器ごと)
    expect(masteryMultOf({}, 'loadout')).toBe(1);
    expect(masteryMultOf({}, 'max')).toBe(1);
    expect(masteryMultOf(null, 'handgun-t1')).toBe(1);
  });
  it('masteryIgnoredRun: 旗のどれか1つでも立てば無視する', () => {
    expect(masteryIgnoredRun(NO_FLAGS)).toBe(false);
    for (const k of Object.keys(NO_FLAGS) as (keyof MasteryRunFlags)[]) {
      expect(masteryIgnoredRun({ ...NO_FLAGS, [k]: true }), k).toBe(true);
    }
  });
});

describe('出どころの包み(withMastery)', () => {
  it('包んでいる間だけ立つ・入れ子は内側が勝つ・戻り値は fn の戻り値', () => {
    expect(currentMasterySource()).toBeNull();
    const r = withMastery('handgun-t1', () => {
      expect(currentMasterySource()).toBe('handgun-t1');
      const inner = withMastery('none', () => {
        expect(currentMasterySource()).toBe('none');
        return 7;
      });
      expect(currentMasterySource()).toBe('handgun-t1');
      return inner * 2;
    });
    expect(r).toBe(14);
    expect(currentMasterySource()).toBeNull();
  });
  it('例外が出ても元へ戻る', () => {
    withMastery('knife-t1', () => {
      expect(() => withMastery('katana', () => { throw new Error('x'); })).toThrow('x');
      expect(currentMasterySource()).toBe('knife-t1');
    });
    expect(currentMasterySource()).toBeNull();
  });
  it('処刑の印(execute)は包んだ間だけ立ち、入れ子では内側の物・抜けると元へ戻る', () => {
    expect(currentMasteryExecute()).toBe(false);
    withMastery('knife-t1', () => {
      expect(currentMasteryExecute()).toBe(true);
      withMastery('none', () => { expect(currentMasteryExecute()).toBe(false); });
      expect(currentMasteryExecute()).toBe(true);
    }, { execute: true });
    expect(currentMasteryExecute()).toBe(false);
  });
});

describe('区分の重み(masteryXpWeight / masteryXpAmount)', () => {
  // 社長裁定2026-11-11: ボス級=2倍・強個体=1.5倍・雑魚=1(区分は brawlerEnemyClass)。
  it('表の値', () => {
    expect(MASTERY_XP_WEIGHT).toEqual({ mob: 1, strong: 1.5, boss: 2 });
  });
  it('雑魚=1・強個体=1.5(型/赤い個体)・ボス級=2', () => {
    expect(masteryXpWeight({ type: 'zombie' })).toBe(1);
    expect(masteryXpWeight({ type: 'logger' })).toBe(1.5);
    expect(masteryXpWeight({ type: 'zombie', colorTier: 'red' })).toBe(1.5);
    expect(masteryXpWeight({ type: 'thor' })).toBe(2);
    expect(masteryXpWeight(null)).toBe(1);
  });
  it('貯まる量 = 四捨五入(通った量 ÷ 熟練度の倍率) × 重み', () => {
    const player = { masteryMult: { katana: 1.3 } } as Parameters<typeof masteryXpAmount>[0];
    const base = Math.round(100 / 1.3); // 77
    expect(masteryXpAmount(player, 'katana', 100, { type: 'zombie' })).toBe(base);
    expect(masteryXpAmount(player, 'katana', 100, { type: 'logger' })).toBe(base * 1.5);
    expect(masteryXpAmount(player, 'katana', 100, { type: 'thor' })).toBe(base * 2);
    expect(masteryXpAmount(player, 'loadout', 100, { type: 'thor' })).toBe(0);
  });
  it('処刑(noDivide)は割り戻さず、重みだけ掛ける', () => {
    const player = { masteryMult: { katana: 1.3 } } as Parameters<typeof masteryXpAmount>[0];
    expect(masteryXpAmount(player, 'katana', 100, { type: 'zombie' }, { noDivide: true })).toBe(100);
    expect(masteryXpAmount(player, 'katana', 100, { type: 'thor' }, { noDivide: true })).toBe(200);
    expect(masteryXpAmount(player, 'none', 100, { type: 'thor' }, { noDivide: true })).toBe(0);
  });
});

describe('燃焼の付け直し(burnRefreshMastery)', () => {
  it('強さは高い方・キーは強さが勝った方の付け手(同じ強さなら新しい方)', () => {
    expect(burnRefreshMastery({ burnDpsTick: 5, burnMasteryKey: 'molotov' }, 3, 'shotgun-t1')).toEqual({ burnDpsTick: 5, burnMasteryKey: 'molotov' });
    expect(burnRefreshMastery({ burnDpsTick: 3, burnMasteryKey: 'molotov' }, 5, 'shotgun-t1')).toEqual({ burnDpsTick: 5, burnMasteryKey: 'shotgun-t1' });
    expect(burnRefreshMastery({ burnDpsTick: 4, burnMasteryKey: 'molotov' }, 4, 'shotgun-t1')).toEqual({ burnDpsTick: 4, burnMasteryKey: 'shotgun-t1' });
    expect(burnRefreshMastery({}, 2, 'loadout')).toEqual({ burnDpsTick: 2, burnMasteryKey: 'loadout' });
  });
  it('守護霊の燃焼の倍率(burnMasteryMult)もキーと同じ付け手に揃う(本人が勝てば消える)', () => {
    expect(burnRefreshMastery({ burnDpsTick: 3 }, 5, 'none', 1.4).burnMasteryMult).toBe(1.4);
    expect(burnRefreshMastery({ burnDpsTick: 9, burnMasteryKey: 'none', burnMasteryMult: 1.4 }, 5, 'molotov').burnMasteryMult).toBe(1.4);
    expect(burnRefreshMastery({ burnDpsTick: 3, burnMasteryKey: 'none', burnMasteryMult: 1.4 }, 5, 'molotov').burnMasteryMult).toBeUndefined();
  });
});

describe('守護霊の熟練度(記録の復元・倍率の引き方)', () => {
  it('normalizeMasteryRecord: 欄が無い(古い記録)は {} と 1', () => {
    expect(normalizeMasteryRecord(undefined, undefined)).toEqual({ masteryMult: {}, masteryLoadoutMult: 1 });
    expect(normalizeMasteryRecord(null, null)).toEqual({ masteryMult: {}, masteryLoadoutMult: 1 });
  });
  it('normalizeMasteryRecord: 知らないキーは捨てる(育つキーと max は残す)', () => {
    const r = normalizeMasteryRecord({ 'handgun-t1': 1.3, max: 1.9, loadout: 1.5, none: 1.5, bogus: 1.5, __proto__x: 1.5 }, 1.2);
    expect(r.masteryMult).toEqual({ 'handgun-t1': 1.3, max: 1.9 });
    expect(r.masteryLoadoutMult).toBeCloseTo(1.2, 10);
  });
  it('normalizeMasteryRecord: 倍率は 1〜1.9 に丸める', () => {
    const r = normalizeMasteryRecord({ 'handgun-t1': 5, 'rifle-t1': 0.2, 'knife-t1': -3, melee: -3 }, 99);
    expect(r.masteryMult).toEqual({ 'handgun-t1': 1.9 }); // 1 に丸まった物は表から落とす(無い欄=1)
    expect(r.masteryLoadoutMult).toBe(1.9);
    expect(normalizeMasteryRecord({}, 0.5).masteryLoadoutMult).toBe(1);
  });
  it('normalizeMasteryRecord: 数でない物は 1(表が配列・文字列でも壊れない)', () => {
    const r = normalizeMasteryRecord({ 'handgun-t1': '1.5', 'rifle-t1': NaN, melee: Infinity, 'shotgun-t1': null }, '1.5');
    expect(r.masteryMult).toEqual({});
    expect(r.masteryLoadoutMult).toBe(1);
    expect(normalizeMasteryRecord([1.5, 1.5], 1).masteryMult).toEqual({});
    expect(normalizeMasteryRecord('x', 1).masteryMult).toEqual({});
    for (const k of GROWING_MASTERY_KEYS) {
      expect(masteryMultOf(normalizeMasteryRecord({ [k]: 'bad' }, undefined), k)).toBe(1);
    }
  });
  it('guardianMasteryMult: 疑似プレイヤーなら記録の値・本人(主語が落ちた)なら1', () => {
    const rec = { masteryMult: { 'knife-t1': 1.5 }, masteryLoadoutMult: 1.2 };
    expect(guardianMasteryMult({ ...rec, pseudoActor: true }, 'knife-t1')).toBe(1.5);
    expect(guardianMasteryMult({ ...rec, pseudoActor: true }, 'loadout')).toBe(1.2);
    expect(guardianMasteryMult({ ...rec, pseudoActor: true }, 'none')).toBe(1);
    expect(guardianMasteryMult(rec, 'knife-t1')).toBe(1);
    expect(guardianMasteryMult(null, 'knife-t1')).toBe(1);
  });
  it('objectMasteryMult: 作る所で確定した欄があればそれ・無ければ本人の焼き値', () => {
    const player = { masteryMult: { turret: 1.3 }, masteryLoadoutMult: 1 };
    expect(objectMasteryMult({}, player, 'turret')).toBe(1.3);
    expect(objectMasteryMult({ masteryMult: 1.6 }, player, 'none')).toBe(1.6);
    expect(objectMasteryMult({}, player, 'none')).toBe(1);
    expect(objectMasteryMult({ masteryMult: NaN }, player, 'turret')).toBe(1.3);
  });
  it('withMastery の mult は包んでいる間だけ見える(入れ子は内側・外へ漏れない)', () => {
    expect(currentMasteryAppliedMult()).toBeNull();
    withMastery('none', () => {
      expect(currentMasteryAppliedMult()).toBe(1.5);
      withMastery('handgun-t1', () => expect(currentMasteryAppliedMult()).toBeNull());
      expect(currentMasteryAppliedMult()).toBe(1.5);
    }, { mult: 1.5 });
    expect(currentMasteryAppliedMult()).toBeNull();
    withMastery('none', () => expect(currentMasteryAppliedMult()).toBeNull(), { mult: 0 });
  });
});

describe('貯める(noteMasteryDamage)', () => {
  it('育つキーだけ・四捨五入・0以下と壊れた値は捨てる', () => {
    startRun(false);
    noteMasteryDamage('handgun-t1', 10.4);
    noteMasteryDamage('handgun-t1', 0.6);
    noteMasteryDamage('loadout', 50);
    noteMasteryDamage('none', 50);
    noteMasteryDamage('max', 50);
    noteMasteryDamage(null, 50);
    noteMasteryDamage('rifle-t1', -3);
    noteMasteryDamage('rifle-t1', NaN);
    noteMasteryDamage('rifle-t1', 0.2);
    expect(getPendingMastery()).toEqual({ 'handgun-t1': 11 });
    expect(getMasteryReport()).toEqual({ 'handgun-t1': 11 });
  });
  it('無視する出撃では pending へ足さず、報告用の表にだけ足す', () => {
    startRun(true);
    expect(isMasteryRunIgnored()).toBe(true);
    noteMasteryDamage('shotgun-t1', 40);
    expect(getPendingMastery()).toEqual({});
    expect(getMasteryReport()).toEqual({ 'shotgun-t1': 40 });
  });
});

describe('リザルトでの確定(commitMasteryRun)', () => {
  it('貯めた分を本体へ足し、before/after を返す。2回目は何も足さず空(直前の結果は読み直せる)', () => {
    const hgBefore = MASTERY_BASE['handgun-t1'] - 100;
    const hgAfter = hgBefore + 200;
    saveMastery({ xp: { 'handgun-t1': hgBefore } });
    startRun(false);
    noteMasteryDamage('handgun-t1', 200);
    noteMasteryDamage('katana', 50);
    const r = commitMasteryRun();
    expect(r).toEqual({
      'handgun-t1': { before: hgBefore, after: hgAfter, levelBefore: 1, levelAfter: 2 },
      katana: { before: 0, after: 50, levelBefore: 1, levelAfter: 1 },
    });
    expect(loadMastery().xp).toEqual({ 'handgun-t1': hgAfter, katana: 50 });
    expect(getPendingMastery()).toEqual({});
    expect(commitMasteryRun()).toEqual({});
    expect(loadMastery().xp).toEqual({ 'handgun-t1': hgAfter, katana: 50 });
    expect(getLastMasteryCommit()).toEqual(r);
  });
  it('直前の確定結果は出撃の開始(beginMasteryRun)で空になる', () => {
    startRun(false);
    noteMasteryDamage('handgun-t1', 200);
    commitMasteryRun();
    expect(getLastMasteryCommit()).not.toEqual({});
    startRun(false); // リザルトを通らずに次の出撃
    expect(getLastMasteryCommit()).toEqual({});
  });
  it('出撃の間に段階は変わらない。確定の後、次の出撃で倍率が上がる', () => {
    saveMastery({ xp: { 'rifle-t1': MASTERY_BASE['rifle-t1'] - 10 } });
    const before = startRun(false);
    noteMasteryDamage('rifle-t1', 100);
    expect(masteryMultTable(loadMastery(), false)['rifle-t1']).toBeUndefined(); // 出撃の間は保存も動かない
    expect(before['rifle-t1']).toBeUndefined();
    commitMasteryRun();
    const after = startRun(false);
    expect(after['rifle-t1']).toBeCloseTo(1.1, 10);
  });
  it('無視する出撃: 確定しても保存は動かず空を返す。次の通常の出撃の頭でも流れない', () => {
    saveMastery({ xp: { 'handgun-t1': 100 } });
    startRun(true);
    noteMasteryDamage('handgun-t1', 5000);
    stashMasteryPending();
    expect(backing[MASTERY_PENDING_KEY]).toBeUndefined();
    expect(commitMasteryRun()).toEqual({});
    expect(getLastMasteryCommit()).toEqual({});
    startRun(false);
    expect(loadMastery().xp).toEqual({ 'handgun-t1': 100 });
  });
});

describe('退避と回収の順番(v2.1 A-4・受け入れ条件 追加14)', () => {
  it('一時停止(退避)→撤退→リザルト(確定)→次の出撃: 同じ分が二重に足されない', () => {
    startRun(false);
    noteMasteryDamage('shotgun-t1', 300);
    stashMasteryPending(); // 一時停止
    expect(JSON.parse(backing[MASTERY_PENDING_KEY]).xp).toEqual({ 'shotgun-t1': 300 });
    noteMasteryDamage('shotgun-t1', 20); // 撤退までの間にもう少し
    commitMasteryRun(); // リザルト
    expect(backing[MASTERY_PENDING_KEY]).toBeUndefined(); // 確定で退避も消える
    startRun(false); // 次の出撃
    expect(loadMastery().xp).toEqual({ 'shotgun-t1': 320 });
  });
  it('退避は上書き(足し込まない)・空なら消す', () => {
    startRun(false);
    noteMasteryDamage('whip', 10);
    stashMasteryPending();
    stashMasteryPending();
    noteMasteryDamage('whip', 5);
    stashMasteryPending();
    expect(JSON.parse(backing[MASTERY_PENDING_KEY]).xp).toEqual({ whip: 15 });
    beginMasteryRun({ ignored: false }); // pending を空にした状態で退避すると消える
    stashMasteryPending();
    expect(backing[MASTERY_PENDING_KEY]).toBeUndefined();
  });
  it('リザルトを通らずに次の出撃(同じページ): メモリの分を1回だけ足す', () => {
    startRun(false);
    noteMasteryDamage('dog', 70);
    stashMasteryPending();
    noteMasteryDamage('dog', 30);
    startRun(false);
    expect(loadMastery().xp).toEqual({ dog: 100 });
    expect(backing[MASTERY_PENDING_KEY]).toBeUndefined();
    startRun(false);
    expect(loadMastery().xp).toEqual({ dog: 100 });
  });
  it('閉じて開き直した(メモリは空・退避だけ残る): 退避の分を1回だけ足す', () => {
    backing[MASTERY_PENDING_KEY] = JSON.stringify({ xp: { molotov: 250, loadout: 9 } });
    startRun(false);
    expect(loadMastery().xp).toEqual({ molotov: 250 });
    expect(backing[MASTERY_PENDING_KEY]).toBeUndefined();
    startRun(false);
    expect(loadMastery().xp).toEqual({ molotov: 250 });
  });
  it('回収で報告用の表も空になる', () => {
    startRun(true);
    noteMasteryDamage('rifle-t1', 9);
    expect(getMasteryReport()).toEqual({ 'rifle-t1': 9 });
    startRun(false);
    expect(getMasteryReport()).toEqual({});
  });
});

// 社長裁定2026-11-12「近接の括りではない。ナイフ毎の括り」: 近接の熟練度はナイフ毎。旧 `melee` は移す。
describe('近接はナイフ毎(キー・移行・古い記録)', () => {
  beforeEach(() => { for (const k of Object.keys(backing)) delete backing[k]; });
  const knife = (key: string) => ({ isMelee: true, key }) as never;

  it('meleeMasteryKeyOf: 装備している近接武器のキー・近接武器が無い/台帳に無ければ loadout', () => {
    for (const k of MASTERY_MELEE_KEYS) expect(meleeMasteryKeyOf({ weapons: [knife(k)] }), k).toBe(k);
    expect(meleeMasteryKeyOf({ weapons: [{ isMelee: false, key: 'handgun-t1' } as never] })).toBe('loadout');
    expect(meleeMasteryKeyOf({ weapons: [knife('bogus')] })).toBe('loadout');
    expect(meleeMasteryKeyOf({ weapons: [] })).toBe('loadout');
    expect(meleeMasteryKeyOf(null)).toBe('loadout');
  });

  it('migrateLegacyMeleeXp: 旧 melee を装備しているナイフへ足して消す・装備が分からなければ基本のナイフ・2度通しても同じ', () => {
    const once = migrateLegacyMeleeXp({ melee: 500, 'machete-t3': 20, 'handgun-t1': 7 }, 'machete-t3');
    expect(once).toEqual({ 'machete-t3': 520, 'handgun-t1': 7 });
    expect(migrateLegacyMeleeXp(once, 'machete-t3')).toEqual(once);
    expect(migrateLegacyMeleeXp({ melee: 300 })).toEqual({ 'knife-t1': 300 });
    expect(migrateLegacyMeleeXp({ melee: 300 }, 'bogus')).toEqual({ 'knife-t1': 300 });
    expect(migrateLegacyMeleeXp({ melee: 'x', 'rifle-t1': 3 }, 'hatchet-t2')).toEqual({ 'rifle-t1': 3 });
    const src = { melee: 10 };
    migrateLegacyMeleeXp(src, 'hatchet-t2');
    expect(src).toEqual({ melee: 10 }); // 元の表は変えない
  });

  it('loadMastery(装備を渡す): 保存の旧 melee をそのナイフへ移して書き戻す・2度読んでも二重に足さない', () => {
    backing[MASTERY_KEY] = JSON.stringify({ xp: { melee: 1000, 'hatchet-t2': 5, 'rifle-t1': 9 } });
    expect(loadMastery('hatchet-t2').xp).toEqual({ 'hatchet-t2': 1005, 'rifle-t1': 9 });
    expect(JSON.parse(backing[MASTERY_KEY]).xp).toEqual({ 'hatchet-t2': 1005, 'rifle-t1': 9 });
    expect(loadMastery('hatchet-t2').xp).toEqual({ 'hatchet-t2': 1005, 'rifle-t1': 9 });
    expect(loadMastery('machete-t3').xp).toEqual({ 'hatchet-t2': 1005, 'rifle-t1': 9 }); // 移した後は持ち替えても動かない
  });

  it('loadMastery(装備が分からない): 基本のナイフへ移した形で返すが書き戻さない(次の出撃の頭でその時の装備へ移す)', () => {
    backing[MASTERY_KEY] = JSON.stringify({ xp: { melee: 1000 } });
    expect(loadMastery().xp).toEqual({ 'knife-t1': 1000 });
    expect(JSON.parse(backing[MASTERY_KEY]).xp).toEqual({ melee: 1000 });
    expect(loadMastery('tactical-knife-t4').xp).toEqual({ 'tactical-knife-t4': 1000 });
    expect(loadMastery().xp).toEqual({ 'tactical-knife-t4': 1000 });
  });

  it('退避の旧 melee も装備しているナイフへ移して本体へ足す(recoverMasteryPending)', () => {
    backing[MASTERY_KEY] = JSON.stringify({ xp: { melee: 100 } });
    backing[MASTERY_PENDING_KEY] = JSON.stringify({ xp: { melee: 40, 'handgun-t1': 3 } });
    expect(loadStashedMasteryPending('anti-mutant-knife-t5')).toEqual({ 'anti-mutant-knife-t5': 40, 'handgun-t1': 3 });
    beginMasteryRun({ ignored: false });
    recoverMasteryPending('anti-mutant-knife-t5');
    expect(loadMastery().xp).toEqual({ 'anti-mutant-knife-t5': 140, 'handgun-t1': 3 });
    expect(MASTERY_PENDING_KEY in backing).toBe(false);
    recoverMasteryPending('anti-mutant-knife-t5');
    expect(loadMastery().xp).toEqual({ 'anti-mutant-knife-t5': 140, 'handgun-t1': 3 });
  });

  it('normalizeMasteryRecord: 古い記録の旧 melee は記録の近接武器のキー(無ければ基本のナイフ)・新しいキーが在ればそちら', () => {
    expect(normalizeMasteryRecord({ melee: 1.6, 'handgun-t1': 1.2 }, 1, 'machete-t3').masteryMult).toEqual({ 'machete-t3': 1.6, 'handgun-t1': 1.2 });
    expect(normalizeMasteryRecord({ melee: 1.6 }, 1).masteryMult).toEqual({ 'knife-t1': 1.6 });
    expect(normalizeMasteryRecord({ melee: 1.6, 'machete-t3': 1.3 }, 1, 'machete-t3').masteryMult).toEqual({ 'machete-t3': 1.3 });
    expect(normalizeMasteryRecord({ melee: 99 }, 1, 'hatchet-t2').masteryMult).toEqual({ 'hatchet-t2': 1.9 });
  });
});
