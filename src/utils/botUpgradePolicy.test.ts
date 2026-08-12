import { describe, it, expect } from 'vitest';
import { mulberry32, pickUpgrade, pickUpgradeByPolicy } from './botUpgradePolicy';
import type { EquipLoadout, Player, UpgradeOption } from '../types/game';

describe('mulberry32 (シード付き決定的乱数)', () => {
  it('同じシードからは同じ数列を返す(再現性=M26-L仕様)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it('異なるシードは異なる数列になる', () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  it('値域は[0,1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('pickUpgrade (レベルアップ自動選択・一様ランダム)', () => {
  it('必ずoptions内の要素を返す', () => {
    const opts = ['a', 'b', 'c'];
    const r = mulberry32(3);
    for (let i = 0; i < 50; i++) expect(opts).toContain(pickUpgrade(opts, r));
  });

  it('同じシードなら同じ選択列になる(決定的)', () => {
    const opts = [1, 2, 3, 4];
    const seqA = Array.from({ length: 10 }, () => 0).map(() => pickUpgrade(opts, mulberry32(9)));
    const seqB = Array.from({ length: 10 }, () => 0).map(() => pickUpgrade(opts, mulberry32(9)));
    expect(seqA).toEqual(seqB);
  });

  it('rand()が1.0近傍でも配列外へ出ない(クランプ)', () => {
    expect(pickUpgrade(['x', 'y'], () => 0.9999999)).toBe('y');
    expect(pickUpgrade(['x'], () => 0)).toBe('x');
  });
});

// M49-4(§6.25): 強化選択のポリシー化。
describe('pickUpgradeByPolicy (M49-4: 段階つき強化選択ポリシー)', () => {
  const equipment = (over: Partial<EquipLoadout> = {}): EquipLoadout =>
    ({ body: null, arms: null, accessory: null, ...over });
  const player = (over: Partial<Pick<Player, 'equipment' | 'health' | 'maxHealth'>> = {}):
    Pick<Player, 'equipment' | 'health' | 'maxHealth'> =>
    ({ equipment: equipment(), health: 100, maxHealth: 100, ...over });

  const opt = (over: Partial<UpgradeOption>): UpgradeOption =>
    ({ id: 'o', name: 'n', description: 'd', type: 'scrap', level: 1, ...over });

  it('policy===\'random\' は pickUpgrade と完全に同一結果(同じrand列)', () => {
    const options = [opt({ id: 'a', type: 'scrap' }), opt({ id: 'b', type: 'heal' }), opt({ id: 'c', type: 'knife' })];
    for (const seed of [1, 2, 3, 42, 999]) {
      const r1 = mulberry32(seed), r2 = mulberry32(seed);
      expect(pickUpgradeByPolicy(options, r1, 'random', player())).toEqual(pickUpgrade(options, r2));
    }
  });

  it('greedy: 今装備しているものよりTierが高い装備を最優先する', () => {
    const options = [
      opt({ id: 'scrap', type: 'scrap' }),
      opt({ id: 'heal', type: 'heal' }),
      opt({ id: 'equip-low', type: 'equipment', equipDefId: 'body-protection-1', level: 1 }),
      opt({ id: 'equip-up', type: 'equipment', equipDefId: 'body-protection-4', level: 4 }),
    ];
    const p = player({ equipment: equipment({ body: 'body-protection-2' }), health: 10, maxHealth: 100 });
    const picked = pickUpgradeByPolicy(options, () => 0, 'greedy', p);
    expect(picked.id).toBe('equip-up'); // Tier2装備中→Tier4候補だけが「アップグレード」
  });

  it('greedy: 装備アップグレードが複数あれば最も高いTierを選ぶ', () => {
    const options = [
      opt({ id: 'equip-t3', type: 'equipment', equipDefId: 'body-protection-3', level: 3 }),
      opt({ id: 'equip-t5', type: 'equipment', equipDefId: 'body-protection-5', level: 5 }),
    ];
    const p = player({ equipment: equipment({ body: 'body-protection-1' }) });
    expect(pickUpgradeByPolicy(options, () => 0, 'greedy', p).id).toBe('equip-t5');
  });

  it('greedy: 装備アップグレードが無ければナイフ > heal(HP<50%のみ) > scrap > その他 の順', () => {
    const p = player();
    expect(pickUpgradeByPolicy(
      [opt({ id: 'scrap', type: 'scrap' }), opt({ id: 'knife', type: 'knife' })], () => 0, 'greedy', p,
    ).id).toBe('knife');
    expect(pickUpgradeByPolicy(
      [opt({ id: 'scrap', type: 'scrap' }), opt({ id: 'heal', type: 'heal' })],
      () => 0, 'greedy', player({ health: 40, maxHealth: 100 }),
    ).id).toBe('heal'); // HP40% < 50%
    expect(pickUpgradeByPolicy(
      [opt({ id: 'scrap', type: 'scrap' }), opt({ id: 'heal', type: 'heal' })],
      () => 0, 'greedy', player({ health: 90, maxHealth: 100 }),
    ).id).toBe('scrap'); // HP90% >= 50% → healは優先されない
  });

  it('greedy: 同順位が複数ならrandで決める(決定的)', () => {
    const options = [opt({ id: 'a', type: 'scrap' }), opt({ id: 'b', type: 'scrap' })];
    const p = player();
    const r1 = mulberry32(5), r2 = mulberry32(5);
    expect(pickUpgradeByPolicy(options, r1, 'greedy', p).id)
      .toBe(pickUpgradeByPolicy(options, r2, 'greedy', p).id);
  });

  it('空配列を渡してもクラッシュしない(pickUpgradeへフォールバック)', () => {
    expect(() => pickUpgradeByPolicy([], () => 0, 'greedy', player())).not.toThrow();
  });

  // SKILL_BUILD_REDESIGN.md §12-2#5/§17-2条件4: runBuild充足<4は新規最優先、4以降はLv+1優先。
  // スクラップ択は「取るものが無い時のみ」選ばれる。
  describe('greedy: スキル専業レベルアップ画面(runBuildLength引数)', () => {
    const skillOpt = (kind: 'new' | 'levelup', id: string): UpgradeOption =>
      opt({ id, type: 'skill', skillCardKind: kind, skillKey: id as UpgradeOption['skillKey'] });

    it('充足<4: 新規カードを最優先(Lv+1・scrapより上)', () => {
      const options = [
        opt({ id: 'scrap', type: 'scrap' }),
        skillOpt('levelup', 'lv'),
        skillOpt('new', 'new'),
      ];
      expect(pickUpgradeByPolicy(options, () => 0, 'greedy', player(), 2).id).toBe('new');
    });

    it('充足>=4: Lv+1カードを最優先', () => {
      const options = [
        opt({ id: 'scrap', type: 'scrap' }),
        skillOpt('new', 'new'),
        skillOpt('levelup', 'lv'),
      ];
      expect(pickUpgradeByPolicy(options, () => 0, 'greedy', player(), 4).id).toBe('lv');
    });

    it('スキルカードが無い(スクラップのみ)時だけscrapを選ぶ', () => {
      const options = [opt({ id: 'scrap', type: 'scrap' })];
      expect(pickUpgradeByPolicy(options, () => 0, 'greedy', player(), 2).id).toBe('scrap');
    });

    it('runBuildLength省略時は既定0(=新規優先扱い)で動作しクラッシュしない', () => {
      const options = [skillOpt('new', 'new'), skillOpt('levelup', 'lv')];
      expect(() => pickUpgradeByPolicy(options, () => 0, 'greedy', player())).not.toThrow();
      expect(pickUpgradeByPolicy(options, () => 0, 'greedy', player()).id).toBe('new');
    });
  });
});
