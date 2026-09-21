// ★シートの台帳(葉モジュール)の不変条件。
//
// ★なぜ葉に分けたか: v0.25.4537 で `enemyAttackSheet ⇄ batLanternSwing` の**循環import**を作った
// (表を片方に置き、もう片方が引き返した)。表は4方向から引かれるので、依存ゼロの葉に置く。
// ★社長裁定2026-09-21「全敵アニメーション入れる予定なのでミラーさせます / 少しずつ揃えていくので個々実装」
// = **シートを持つ個体だけミラーする**(型ではなく個体)。素材が揃うたび自動でミラー側へ移る。
import { describe, it, expect } from 'vitest';
import {
  ENEMY_WALK_SHEETS, ENEMY_ATTACK_SHEETS, ENEMY_SHEET_FACES_RIGHT,
  walkSheetName, attackSheetName, walkSheetFrames, attackSheetFrames,
  hasAnimSheet, sheetFacesRight,
} from './enemySheets';
import { ENEMY_VARIANT_SETS, variantTextureName } from './enemyVariant';

describe('★表', () => {
  it('シート名の付け方', () => {
    expect(walkSheetName('bat-female')).toBe('bat-female-walk');
    expect(attackSheetName('bat-female')).toBe('bat-female-attack');
  });

  it('★★表に載る立ち絵は、必ず実在する変種の絵であること(名前を間違えると一生出ない)', () => {
    const all = new Set(Object.values(ENEMY_VARIANT_SETS).flat());
    for (const n of [...Object.keys(ENEMY_WALK_SHEETS), ...Object.keys(ENEMY_ATTACK_SHEETS),
                     ...Object.keys(ENEMY_SHEET_FACES_RIGHT)]) {
      expect(all.has(n), n).toBe(true);
    }
  });

  it('コマ数は2以上(1コマのシートは意味が無い)', () => {
    for (const n of Object.values({ ...ENEMY_WALK_SHEETS, ...ENEMY_ATTACK_SHEETS })) {
      expect(n).toBeGreaterThan(1);
    }
  });
});

describe('★★ミラーの対象は「型」ではなく「個体」', () => {
  it('シートを持つ立ち絵だけが対象', () => {
    expect(hasAnimSheet('bat-female')).toBe(true);
    expect(hasAnimSheet('bat-male')).toBe(false);
    expect(hasAnimSheet('zombie-common')).toBe(false);
    expect(hasAnimSheet(null)).toBe(false);
  });

  it('★同じ型でも個体で分かれる(素材が1体ずつ届くため)', () => {
    const ids = Array.from({ length: 24 }, (_, k) => `e${k}`);
    const male = ids.filter(id => variantTextureName('bat', id) === 'bat-male');
    const female = ids.filter(id => variantTextureName('bat', id) === 'bat-female');
    expect(male.length, '男の個体').toBeGreaterThan(0);
    expect(female.length, '女の個体').toBeGreaterThan(0);
    for (const id of female) expect(hasAnimSheet(variantTextureName('bat', id)), id).toBe(true);
    for (const id of male) expect(hasAnimSheet(variantTextureName('bat', id)), id).toBe(false);
  });

  it('向きの既定は左(いまのシートは2枚とも左向き)', () => {
    expect(sheetFacesRight('bat-female')).toBe(false);
    expect(sheetFacesRight('bat-male')).toBe(false);
  });

  it('★歩きだけ/攻撃だけでも対象になる(片方から揃えていける)', () => {
    // 表を直接組み替えずに、述語の論理だけを確かめる(将来どちらか片方だけの型が来る)。
    expect(walkSheetFrames('bat-female') > 1 || attackSheetFrames('bat-female') > 1).toBe(true);
    expect(hasAnimSheet('bat-female')).toBe(true);
  });
});
