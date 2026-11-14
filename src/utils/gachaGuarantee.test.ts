import { describe, it, expect } from 'vitest';
import {
  GACHA_GUARANTEE_EVERY, isGachaGuaranteedPull, gachaGuaranteeRemaining, nextGachaMissStreak,
  resolveGachaPull, canGachaPromote, nextGachaPity,
} from './gachaGuarantee';
import { SKILLS, skillMaxLevel, gachaPoolOf, gachaRateTable, rarityWeightsForPity, GACHA_EXCLUDED_SKILLS } from '../data/campaign';
import type { SkillKey } from '../types/game';

const seq = (...xs: number[]) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };
const maxAll = (keys: readonly SkillKey[]) => Object.fromEntries(keys.map(k => [k, skillMaxLevel(k)])) as Partial<Record<SkillKey, number>>;
const allPool = [...gachaPoolOf('super'), ...gachaPoolOf('rare'), ...gachaPoolOf('normal')];
// 通常の抽選は必ず Lv1 を返す rng(0)=所持 Lv1 以上は昇格しない
const zero = () => 0;
const normalKey = gachaPoolOf('normal').find(k => skillMaxLevel(k) === 3)!;

describe('保証の数え方', () => {
  it('9回連続で昇格しなかった次の1回が保証の回', () => {
    let streak = 0;
    for (let i = 0; i < GACHA_GUARANTEE_EVERY - 1; i++) {
      expect(isGachaGuaranteedPull(streak)).toBe(false);
      streak = nextGachaMissStreak(streak, false);
    }
    expect(streak).toBe(9);
    expect(isGachaGuaranteedPull(streak)).toBe(true);
    expect(gachaGuaranteeRemaining(streak)).toBe(1);
    expect(gachaGuaranteeRemaining(0)).toBe(10);
  });
  it('昇格した回で0へ戻る', () => {
    expect(nextGachaMissStreak(5, true)).toBe(0);
    expect(nextGachaMissStreak(9, true)).toBe(0);
  });
});

describe('resolveGachaPull', () => {
  const owned = [normalKey];
  const levels = { [normalKey]: 1 } as Partial<Record<SkillKey, number>>;

  it('保証でない回は従来どおり返金(昇格しない)', () => {
    const r = resolveGachaPull({ rolledKey: normalKey, owned, levels, dupes: {}, missStreak: 3, pity: 0, rng: zero });
    expect(r.promoted).toBe(false);
    expect(r.guaranteed).toBe(false);
    expect(r.forced).toBe('none');
  });
  it('9回連続返金の次は必ず昇格(①通常で昇格すればそのまま)', () => {
    const r = resolveGachaPull({ rolledKey: normalKey, owned, levels, dupes: {}, missStreak: 9, pity: 0, rng: () => 0.99 });
    expect(r.promoted).toBe(true);
    expect(r.forced).toBe('none');
    expect(r.newLevel).toBe(3);
  });
  it('②抽選したスキルが上がらない時は Lv+1', () => {
    const r = resolveGachaPull({ rolledKey: normalKey, owned, levels, dupes: { [normalKey]: 4 }, missStreak: 9, pity: 0, rng: zero });
    expect(r).toMatchObject({ key: normalKey, promoted: true, forced: 'bump', prevLevel: 1, newLevel: 2, dupeCount: 4, guaranteed: true });
  });
  it('③抽選したスキルが上限なら同じレア度から選び直す', () => {
    const lv = { [normalKey]: 3 } as Partial<Record<SkillKey, number>>;
    const r = resolveGachaPull({ rolledKey: normalKey, owned, levels: lv, dupes: {}, missStreak: 9, pity: 0, rng: zero });
    expect(r.promoted).toBe(true);
    expect(r.forced).toBe('same-rarity');
    expect(r.key).not.toBe(normalKey);
    expect(SKILLS[r.key].rarity).toBe('normal');
    expect(r.firstAcquire).toBe(true);
  });
  it('③同じレア度で所持済み上限未満を選んだら +1', () => {
    const normals = gachaPoolOf('normal');
    const other = normals.find(k => k !== normalKey && skillMaxLevel(k) === 3)!;
    const ownedAll = [...normals];
    const lv = { ...maxAll(normals), [other]: 2 };
    const r = resolveGachaPull({ rolledKey: normalKey, owned: ownedAll, levels: lv, dupes: {}, missStreak: 9, pity: 0, rng: zero });
    expect(r).toMatchObject({ key: other, forced: 'same-rarity', prevLevel: 2, newLevel: 3, promoted: true });
  });
  it('④同じレア度が全部上限ならほかのレア度から', () => {
    const normals = gachaPoolOf('normal');
    const r = resolveGachaPull({ rolledKey: normalKey, owned: normals, levels: maxAll(normals), dupes: {}, missStreak: 9, pity: 0, rng: zero });
    expect(r.promoted).toBe(true);
    expect(r.forced).toBe('other-rarity');
    expect(SKILLS[r.key].rarity).not.toBe('normal');
  });
  it('全部上限なら保証は効かず返金', () => {
    const r = resolveGachaPull({ rolledKey: normalKey, owned: allPool, levels: maxAll(allPool), dupes: {}, missStreak: 9, pity: 0, rng: zero });
    expect(r.promoted).toBe(false);
    expect(r.forced).toBe('none');
    expect(r.guaranteed).toBe(true);
    expect(allPool.every(k => !canGachaPromote(k, allPool, maxAll(allPool)))).toBe(true);
  });
  it('保証の回の結果はどの所持状態でも昇格する(全部上限を除く)', () => {
    const rng = seq(...Array.from({ length: 400 }, (_, i) => ((i * 7919) % 1000) / 1000));
    for (let n = 0; n < 200; n++) {
      const ownedN = allPool.filter((_, i) => (i + n) % 3 !== 0);
      const lv = Object.fromEntries(ownedN.map((k, i) => [k, 1 + ((i + n) % skillMaxLevel(k))])) as Partial<Record<SkillKey, number>>;
      const rolledKey = allPool[n % allPool.length];
      const r = resolveGachaPull({ rolledKey, owned: ownedN, levels: lv, dupes: {}, missStreak: 9, pity: n % 15, rng });
      expect(r.promoted).toBe(true);
    }
  });
});

describe('gachaRateTable', () => {
  it('合計100%・除外スキルは出ない・枠内均等', () => {
    for (const pity of [0, 5, 14, 30]) {
      const t = gachaRateTable(pity);
      const total = t.reduce((a, r) => a + r.percent, 0);
      expect(total).toBeCloseTo(100, 6);
      for (const row of t) {
        expect(row.skills.reduce((a, s) => a + s.percent, 0)).toBeCloseTo(row.percent, 6);
        for (const s of row.skills) expect(GACHA_EXCLUDED_SKILLS.includes(s.key)).toBe(false);
      }
    }
  });
  it('超レアの率は天井で上がり、基本の率は pity=0 のまま', () => {
    const sup = gachaRateTable(10).find(r => r.rarity === 'super')!;
    const w = rarityWeightsForPity(10);
    expect(sup.percent).toBeCloseTo((w.super / (w.normal + w.rare + w.super)) * 100, 6);
    expect(sup.basePercent).toBeCloseTo(5, 6);
  });
});

describe('nextGachaPity', () => {
  it('普通の抽選は今どおり(super で0・それ以外は+1)', () => {
    expect(nextGachaPity(6, 'super', 'super')).toBe(0);
    expect(nextGachaPity(6, 'rare', 'rare')).toBe(7);
    expect(nextGachaPity(6, 'normal', 'normal')).toBe(7);
  });
  it('保証の選び直しで super になった回は0へ戻す', () => {
    const normals = gachaPoolOf('normal');
    const rares = gachaPoolOf('rare');
    const owned = [...normals, ...rares];
    // ノーマル・レアが全部上限 → ④で super へ選び直す
    const r = resolveGachaPull({ rolledKey: normalKey, owned, levels: maxAll(owned), dupes: {}, missStreak: 9, pity: 6, rng: zero });
    expect(r.forced).toBe('other-rarity');
    expect(r.rarity).toBe('super');
    expect(nextGachaPity(6, SKILLS[normalKey].rarity, r.rarity)).toBe(0);
    // 選び直しが super 以外なら今どおり+1
    expect(nextGachaPity(6, 'normal', 'rare')).toBe(7);
  });
});
