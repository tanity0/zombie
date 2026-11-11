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
  GROWING_MASTERY_KEYS, MASTERY_BASE, MASTERY_KEY, MASTERY_PENDING_KEY, MASTERY_MAXED_SUBS, SUB_TO_MASTERY_KEY,
  MASTERY_SUB_KEYS, MASTERY_GUN_KEYS, isGrowingMasteryKey,
} from '../data/mastery';
import type { AmmoType, SubWeaponKey } from '../types/game';
import {
  masteryNeedFor, masteryLevelFor, masteryProgress, masteryDamageMult, normalizeMastery, loadMastery, saveMastery,
  masteryMultTable, masteryLoadoutMult, masteryMultOf, masteryIgnoredRun, commitMasteryRun, getLastMasteryCommit,
  recoverMasteryPending, type MasteryRunFlags,
} from './mastery';
import {
  withMastery, currentMasterySource, beginMasteryRun, noteMasteryDamage, getPendingMastery, getMasteryReport,
  stashMasteryPending, isMasteryRunIgnored,
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
    const guns: readonly AmmoType[] = MASTERY_GUN_KEYS;
    const subs: readonly SubWeaponKey[] = MASTERY_SUB_KEYS;
    const maxed: readonly SubWeaponKey[] = MASTERY_MAXED_SUBS as readonly SubWeaponKey[];
    const toMastery: Partial<Record<SubWeaponKey, string>> = SUB_TO_MASTERY_KEY;
    expect(guns.length).toBe(5);
    expect(subs.length).toBe(21);
    expect(maxed.length).toBe(5);
    expect(Object.keys(toMastery).length).toBe(22);
  });
  it('育つキーは銃5+melee+サブ21=27。murasame は katana・最初から最大のサブは育たない', () => {
    expect(GROWING_MASTERY_KEYS.length).toBe(27);
    expect(MASTERY_SUB_KEYS.length).toBe(21);
    expect(SUB_TO_MASTERY_KEY.shield).toBe('shield');
    expect(SUB_TO_MASTERY_KEY['first-aid-kit']).toBe('first-aid-kit');
    expect([...MASTERY_MAXED_SUBS].sort()).toEqual(['flare-gun', 'marksman-trap', 'sage-stone', 'striker-hunting', 'striker-quick-mag']);
    expect(SUB_TO_MASTERY_KEY.murasame).toBe('katana');
    for (const s of MASTERY_MAXED_SUBS) expect(SUB_TO_MASTERY_KEY[s], s).toBeUndefined();
    expect(SUB_TO_MASTERY_KEY.shijin).toBeUndefined();
    for (const k of ['loadout', 'none', 'max', 'shijin', 'murasame']) expect(isGrowingMasteryKey(k), k).toBe(false);
  });
  it('MASTERY_BASE は全キー仮の 3000', () => {
    for (const k of GROWING_MASTERY_KEYS) expect(MASTERY_BASE[k], k).toBe(3000);
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
    expect(masteryNeedFor('handgun', 1)).toBe(3000);
    expect(masteryNeedFor('handgun', 2)).toBe(Math.round(3000 * 1.37));
    expect(masteryNeedFor('handgun', 9)).toBe(Math.round(3000 * Math.pow(1.37, 8)));
  });
  it('masteryLevelFor: 境目・上限・xp に単調・壊れた値で落ちない', () => {
    expect(masteryLevelFor('rifle', 0)).toBe(1);
    expect(masteryLevelFor('rifle', 2999)).toBe(1);
    expect(masteryLevelFor('rifle', 3000)).toBe(2);
    expect(masteryLevelFor('rifle', xpOfLevel('rifle', 10))).toBe(10);
    expect(masteryLevelFor('rifle', xpOfLevel('rifle', 10) - 1)).toBe(9);
    expect(masteryLevelFor('rifle', 1e12)).toBe(10);
    for (const bad of [NaN, -1, Infinity, '5000', null, undefined, {}]) expect(masteryLevelFor('rifle', bad), String(bad)).toBe(1);
    let prev = 1;
    for (let xp = 0; xp <= xpOfLevel('rifle', 10) + 5000; xp += 997) {
      const l = masteryLevelFor('rifle', xp);
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });
  it('masteryProgress: 今の段階と次までの割合・上限では frac=1', () => {
    expect(masteryProgress('melee', 1500)).toEqual({ level: 1, into: 1500, need: 3000, frac: 0.5 });
    const p2 = masteryProgress('melee', 3000 + 411);
    expect(p2.level).toBe(2);
    expect(p2.frac).toBeCloseTo(411 / masteryNeedFor('melee', 2), 10);
    const top = masteryProgress('melee', xpOfLevel('melee', 10) + 7);
    expect(top).toEqual({ level: 10, into: 7, need: 0, frac: 1 });
  });
});

describe('保存(normalize / load / save)', () => {
  it('壊れた保存・特別なキー・未知のキー・負の値を捨てる', () => {
    for (const raw of [null, undefined, 3, 'x', [], { xp: 5 }, { xp: null }]) expect(normalizeMastery(raw), String(raw)).toEqual({ xp: {} });
    expect(normalizeMastery({ xp: { handgun: 1200.4, loadout: 99, none: 1, max: 1, foo: 3, rifle: -5, katana: NaN, whip: '7' } }))
      .toEqual({ xp: { handgun: 1200 } });
  });
  it('load: 保存が無い/壊れた JSON は空。save→load で戻る', () => {
    expect(loadMastery()).toEqual({ xp: {} });
    backing[MASTERY_KEY] = '{not json';
    expect(loadMastery()).toEqual({ xp: {} });
    saveMastery({ xp: { shotgun: 4000, decoy: 12 } });
    expect(loadMastery()).toEqual({ xp: { shotgun: 4000, decoy: 12 } });
  });
});

describe('焼き込み', () => {
  it('masteryMultTable: 無視する出撃は空・通常は max=1.9 と上がった段階だけ', () => {
    const s = { xp: { handgun: xpOfLevel('handgun', 4), katana: 10 } };
    expect(masteryMultTable(s, true)).toEqual({});
    const t = masteryMultTable(s, false);
    expect(t.max).toBe(1.9);
    expect(t.handgun).toBeCloseTo(1.3, 10);
    expect(t.katana).toBeUndefined(); // Lv1 は載せない(=1)
    expect(masteryMultTable({ xp: {} }, false)).toEqual({ max: 1.9 });
  });
  it('masteryLoadoutMult: 重複なしの集合の平均(v2.1 A-11)', () => {
    const m = { handgun: 1.5, shotgun: 1.1, melee: 1.2, brawler: 1.9, katana: 1.4, max: 1.9 };
    // 銃の種類は2挺でも1つ。近接は melee。
    expect(masteryLoadoutMult(m, { gunCategories: ['handgun', 'handgun'], hasMelee: true, subs: [] })).toBeCloseTo((1.5 + 1.2) / 2, 10);
    // 格闘を持っていれば近接の枠は brawler・サブの brawler と二重に数えない。
    expect(masteryLoadoutMult(m, { gunCategories: ['handgun'], hasMelee: true, subs: ['brawler'] })).toBeCloseTo((1.5 + 1.9) / 2, 10);
    // murasame → katana・katana と二重に数えない。最初から最大のサブ・shijin は入れない。
    expect(masteryLoadoutMult(m, { gunCategories: ['shotgun'], hasMelee: false, subs: ['murasame', 'katana', 'sage-stone', 'shijin'] }))
      .toBeCloseTo((1.1 + 1.4) / 2, 10);
    // 無い欄は1。集合が空なら1。
    expect(masteryLoadoutMult(m, { gunCategories: ['rifle'], hasMelee: false, subs: [] })).toBe(1);
    expect(masteryLoadoutMult(m, { gunCategories: [undefined], hasMelee: false, subs: ['flare-gun'] })).toBe(1);
    // shield・first-aid-kit は育つキー=持っていれば数える。
    expect(masteryLoadoutMult({ shield: 1.5, 'first-aid-kit': 1.3 }, { gunCategories: [], hasMelee: false, subs: ['shield', 'first-aid-kit'] }))
      .toBeCloseTo(1.4, 10);
    expect(masteryLoadoutMult({}, { gunCategories: ['handgun'], hasMelee: true, subs: ['dog'] })).toBe(1);
  });
  it('masteryMultOf: none→1 / loadout→焼いた平均 / それ以外→焼いた倍率(無い欄=1)', () => {
    const p = { masteryMult: { handgun: 1.3, max: 1.9 }, masteryLoadoutMult: 1.15 };
    expect(masteryMultOf(p, 'none')).toBe(1);
    expect(masteryMultOf(p, 'loadout')).toBe(1.15);
    expect(masteryMultOf(p, 'max')).toBe(1.9);
    expect(masteryMultOf(p, 'handgun')).toBe(1.3);
    expect(masteryMultOf(p, 'shotgun')).toBe(1); // ハンドガンを上げてもショットガンは変わらない
    expect(masteryMultOf({}, 'loadout')).toBe(1);
    expect(masteryMultOf({}, 'max')).toBe(1);
    expect(masteryMultOf(null, 'handgun')).toBe(1);
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
    const r = withMastery('handgun', () => {
      expect(currentMasterySource()).toBe('handgun');
      const inner = withMastery('none', () => {
        expect(currentMasterySource()).toBe('none');
        return 7;
      });
      expect(currentMasterySource()).toBe('handgun');
      return inner * 2;
    });
    expect(r).toBe(14);
    expect(currentMasterySource()).toBeNull();
  });
  it('例外が出ても元へ戻る', () => {
    withMastery('melee', () => {
      expect(() => withMastery('katana', () => { throw new Error('x'); })).toThrow('x');
      expect(currentMasterySource()).toBe('melee');
    });
    expect(currentMasterySource()).toBeNull();
  });
});

describe('貯める(noteMasteryDamage)', () => {
  it('育つキーだけ・四捨五入・0以下と壊れた値は捨てる', () => {
    startRun(false);
    noteMasteryDamage('handgun', 10.4);
    noteMasteryDamage('handgun', 0.6);
    noteMasteryDamage('loadout', 50);
    noteMasteryDamage('none', 50);
    noteMasteryDamage('max', 50);
    noteMasteryDamage(null, 50);
    noteMasteryDamage('rifle', -3);
    noteMasteryDamage('rifle', NaN);
    noteMasteryDamage('rifle', 0.2);
    expect(getPendingMastery()).toEqual({ handgun: 11 });
    expect(getMasteryReport()).toEqual({ handgun: 11 });
  });
  it('無視する出撃では pending へ足さず、報告用の表にだけ足す', () => {
    startRun(true);
    expect(isMasteryRunIgnored()).toBe(true);
    noteMasteryDamage('shotgun', 40);
    expect(getPendingMastery()).toEqual({});
    expect(getMasteryReport()).toEqual({ shotgun: 40 });
  });
});

describe('リザルトでの確定(commitMasteryRun)', () => {
  it('貯めた分を本体へ足し、before/after を返す。2回目は何も足さず空(直前の結果は読み直せる)', () => {
    saveMastery({ xp: { handgun: 2900 } });
    startRun(false);
    noteMasteryDamage('handgun', 200);
    noteMasteryDamage('katana', 50);
    const r = commitMasteryRun();
    expect(r).toEqual({
      handgun: { before: 2900, after: 3100, levelBefore: 1, levelAfter: 2 },
      katana: { before: 0, after: 50, levelBefore: 1, levelAfter: 1 },
    });
    expect(loadMastery().xp).toEqual({ handgun: 3100, katana: 50 });
    expect(getPendingMastery()).toEqual({});
    expect(commitMasteryRun()).toEqual({});
    expect(loadMastery().xp).toEqual({ handgun: 3100, katana: 50 });
    expect(getLastMasteryCommit()).toEqual(r);
  });
  it('出撃の間に段階は変わらない。確定の後、次の出撃で倍率が上がる', () => {
    saveMastery({ xp: { rifle: 2990 } });
    const before = startRun(false);
    noteMasteryDamage('rifle', 100);
    expect(masteryMultTable(loadMastery(), false).rifle).toBeUndefined(); // 出撃の間は保存も動かない
    expect(before.rifle).toBeUndefined();
    commitMasteryRun();
    const after = startRun(false);
    expect(after.rifle).toBeCloseTo(1.1, 10);
  });
  it('無視する出撃: 確定しても保存は動かず空を返す。次の通常の出撃の頭でも流れない', () => {
    saveMastery({ xp: { handgun: 100 } });
    startRun(true);
    noteMasteryDamage('handgun', 5000);
    stashMasteryPending();
    expect(backing[MASTERY_PENDING_KEY]).toBeUndefined();
    expect(commitMasteryRun()).toEqual({});
    expect(getLastMasteryCommit()).toEqual({});
    startRun(false);
    expect(loadMastery().xp).toEqual({ handgun: 100 });
  });
});

describe('退避と回収の順番(v2.1 A-4・受け入れ条件 追加14)', () => {
  it('一時停止(退避)→撤退→リザルト(確定)→次の出撃: 同じ分が二重に足されない', () => {
    startRun(false);
    noteMasteryDamage('shotgun', 300);
    stashMasteryPending(); // 一時停止
    expect(JSON.parse(backing[MASTERY_PENDING_KEY]).xp).toEqual({ shotgun: 300 });
    noteMasteryDamage('shotgun', 20); // 撤退までの間にもう少し
    commitMasteryRun(); // リザルト
    expect(backing[MASTERY_PENDING_KEY]).toBeUndefined(); // 確定で退避も消える
    startRun(false); // 次の出撃
    expect(loadMastery().xp).toEqual({ shotgun: 320 });
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
    noteMasteryDamage('rifle', 9);
    expect(getMasteryReport()).toEqual({ rifle: 9 });
    startRun(false);
    expect(getMasteryReport()).toEqual({});
  });
});
