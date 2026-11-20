// 錬金術の召喚(通常個体)のレベル別の型と、装備画面の絵(社長指示2026-11-20「錬金術 レベル1の絵はバットで、2はゾンビで、3は伐採人で」)。
import { describe, it, expect } from 'vitest';
import { ALCHEMY_SUMMON_TYPE_BY_LEVEL, ALCHEMY_SUMMON_HP_BY_LEVEL, ALCHEMY_SUMMON_DAMAGE, ALCHEMY_SUMMON_SPEED, buildSummon } from './summonUtils';
import { getEnemyBaseSize } from './enemyUtils';
import { variantTextureName } from './enemyVariant';
import { attackSheetFrames, sweepSheetSplit, walkSheetFrames } from './enemySheets';
import { subWeaponIconName, ALCHEMY_ICON_BY_LEVEL } from '../data/subWeaponIcons';

describe('錬金術の召喚の型', () => {
  it('Lv1=バット / Lv2=ゾンビ / Lv3=伐採人', () => {
    expect(ALCHEMY_SUMMON_TYPE_BY_LEVEL).toEqual([null, 'bat', 'zombie', 'logger']);
    expect(buildSummon(1, 'normal', 0, 0).reusedType).toBe('bat');
    expect(buildSummon(2, 'normal', 0, 0).reusedType).toBe('zombie');
    expect(buildSummon(3, 'normal', 0, 0).reusedType).toBe('logger');
  });
  it('HP・ダメージはレベルの表のまま(型を替えても変わらない)', () => {
    for (const lvl of [1, 2, 3]) {
      const s = buildSummon(lvl, 'normal', 0, 0);
      expect(s.maxHealth).toBe(ALCHEMY_SUMMON_HP_BY_LEVEL[lvl]);
      expect(s.damage).toBe(ALCHEMY_SUMMON_DAMAGE);
      const size = getEnemyBaseSize(s.reusedType);
      expect(s.width).toBe(size.width);
      expect(s.height).toBe(size.height);
    }
  });
  it('どのレベルも歩きのコマと攻撃の絵(攻撃シートか薙ぎシート)を持つ', () => {
    for (const lvl of [1, 2, 3]) {
      const type = ALCHEMY_SUMMON_TYPE_BY_LEVEL[lvl]!;
      // 個体ごとに見た目が分かれる型(バット=男女)も、全部の見た目で確かめる
      for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
        const key = variantTextureName(type, id)!;
        expect(key).toBeTruthy();
        expect(walkSheetFrames(key)).toBeGreaterThan(1);
        expect(attackSheetFrames(key) > 1 || sweepSheetSplit(key) !== null).toBe(true);
      }
    }
  });
});

describe('錬金術の装備画面の絵', () => {
  it('レベルで替わる(省略=Lv1)', () => {
    expect(subWeaponIconName('alchemy')).toBe('sub-icons/alchemy-bat');
    expect(subWeaponIconName('alchemy', 1)).toBe('sub-icons/alchemy-bat');
    expect(subWeaponIconName('alchemy', 2)).toBe('sub-icons/alchemy-zombie');
    expect(subWeaponIconName('alchemy', 3)).toBe('sub-icons/alchemy-lumberjack');
    expect(subWeaponIconName('alchemy', 9)).toBe('sub-icons/alchemy-lumberjack');
    expect(ALCHEMY_ICON_BY_LEVEL).toHaveLength(4);
  });
  it('錬金術以外はレベルを渡しても変わらない', () => {
    expect(subWeaponIconName('whip', 3)).toBe(subWeaponIconName('whip'));
  });
});

describe('錬金術の召喚の速さ', () => {
  it('種類によらず全レベル同じ速さ', () => {
    expect([1, 2, 3].map(l => buildSummon(l, 'normal', 0, 0).speed)).toEqual([ALCHEMY_SUMMON_SPEED, ALCHEMY_SUMMON_SPEED, ALCHEMY_SUMMON_SPEED]);
  });
});
