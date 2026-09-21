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
  hasAnimSheet, sheetFacesRight, walkPlayback, attackImpactFrame,
  sheetHasWeapon, ENEMY_SHEET_HAS_WEAPON, ENEMY_ATTACK_IMPACT_FRAME,
  sheetFrontOn, ENEMY_SHEET_FRONT_ON,
} from './enemySheets';
import { ENEMY_VARIANT_SETS } from './enemyVariant';

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
  // ★ここも**名前を手書きしない**(下の注意書きと同じ理由。ゾンビの歩きが届いた回=v0.25.4548 で
  // `hasAnimSheet('zombie-common')` を false と書いていたテストが落ちた=4回目の同じ壊れ方)。
  it('シートを持つ立ち絵だけが対象(表から導出する)', () => {
    const withSheet = new Set([...Object.keys(ENEMY_WALK_SHEETS), ...Object.keys(ENEMY_ATTACK_SHEETS)]);
    expect(withSheet.size).toBeGreaterThan(0);
    for (const n of withSheet) expect(hasAnimSheet(n), n).toBe(true);
    const noSheet = Object.values(ENEMY_VARIANT_SETS).flat().filter(n => !withSheet.has(n));
    expect(noSheet.length, 'まだシートの無い絵が1枚も無いなら、この検査は何も言っていない').toBeGreaterThan(0);
    for (const n of noSheet) expect(hasAnimSheet(n), n).toBe(false);
    expect(hasAnimSheet(null)).toBe(false);
  });

  // ★★名前を手書きしない(2026-09-21・3回続けて同じ壊れ方をしたため)。
  // 素材は1体ずつ届くので、「まだシートが無い絵」を列挙すると**届くたびにテストが落ちる**
  // (bat-male の歩き→攻撃→skeleton-male の歩き、で3回)。**表から導出する。**
  it('★シートを持たない立ち絵は従来どおり(型の設定のまま)', () => {
    const withSheet = new Set([...Object.keys(ENEMY_WALK_SHEETS), ...Object.keys(ENEMY_ATTACK_SHEETS)]);
    const without = [...new Set(Object.values(ENEMY_VARIANT_SETS).flat())].filter(n => !withSheet.has(n));
    expect(without.length, 'まだシートの無い絵が1つも無い(この検算が空回りしている)').toBeGreaterThan(0);
    for (const n of without) expect(hasAnimSheet(n), n).toBe(false);
  });

  it('男女とも攻撃シートを持つ', () => {
    expect(attackSheetFrames('bat-female')).toBeGreaterThan(1);
    expect(attackSheetFrames('bat-male')).toBeGreaterThan(1);
  });

  // ★★社長報告2026-09-21「コウモリ女の攻撃時に武器が消えてる」の再発防止。
  it('★★「シートがある」と「シートに武器が描かれている」は別の表(混ぜない)', () => {
    expect(attackSheetFrames('bat-female')).toBeGreaterThan(1);   // シートはある
    expect(sheetHasWeapon('bat-female')).toBe(false);             // が、武器は描かれていない
    expect(sheetHasWeapon('bat-male')).toBe(true);
  });

  // ★社長指示2026-09-21「**別スプライトの爪は消さなくていい**」。v0.25.4543〜4545 は
  // 「シートに爪が描かれている=二本になる」として止めていたが、裁定で**出したまま**になった。
  // ⇒ 骸骨は表に載せない(描画側もシートの有無を見ない)。**戻したら二本になるので、表で止める。**
  it('★★骸骨は表に載せない=別スプライトの爪を出し続ける(社長指示2026-09-21)', () => {
    for (const n of ['skeleton-male', 'skeleton-female']) {
      expect(attackSheetFrames(n), n).toBeGreaterThan(1);   // 攻撃シートは持っている
      expect(sheetHasWeapon(n), n).toBe(false);             // が、爪のスプライトは止めない
    }
    expect(sheetHasWeapon('lich-common')).toBe(false);      // 爪を共有するリッチも従来どおり
  });

  // ★社長支給2026-09-21「雲歩き」(=蜘蛛の歩き)。正面向きの絵を左右反転すると、
  // 振り向きの潰しが進む向きを変えるたびに走って**正面の絵が理由もなく捻れる**。
  it('★★正面向きのシートはミラーしない / 横向きのシートは必ずミラーする', () => {
    expect(sheetFrontOn('pumpkin-common')).toBe(true);
    // 既定は「横向き」=ミラーする側。シートを持つ他の絵が黙って正面扱いになっていないこと。
    const withSheet = [...new Set([...Object.keys(ENEMY_WALK_SHEETS), ...Object.keys(ENEMY_ATTACK_SHEETS)])];
    const sideOn = withSheet.filter(n => !sheetFrontOn(n));
    expect(sideOn.length, '横向きのシートが1枚も無いなら、この検査は何も言っていない').toBeGreaterThan(0);
    for (const n of sideOn) expect(sheetFrontOn(n), n).toBe(false);
  });

  it('★正面向きの印を付けられるのは、シートを持つ絵だけ(付け間違いを弾く)', () => {
    for (const n of Object.keys(ENEMY_SHEET_FRONT_ON)) {
      expect(hasAnimSheet(n), n).toBe(true);
    }
  });

  it('★武器ありの印を付けられるのは、攻撃シートを持つ絵だけ(付け間違いを弾く)', () => {
    for (const n of Object.keys(ENEMY_SHEET_HAS_WEAPON)) {
      expect(attackSheetFrames(n), n).toBeGreaterThan(1);
    }
  });

  it('★当たるコマの既定は末尾から2コマ目(指定が無い絵だけ)', () => {
    const defaulted = Object.keys(ENEMY_ATTACK_SHEETS).filter(n => !(n in ENEMY_ATTACK_IMPACT_FRAME));
    expect(defaulted.length).toBeGreaterThan(0);   // 既定の絵が0枚になったらこのテストは意味を失う
    for (const n of defaulted) {
      expect(attackImpactFrame(n), n).toBe(ENEMY_ATTACK_SHEETS[n] - 2);
    }
  });

  // ★掟③(消え切る時刻=当たる時刻)を絵の側から支える不変条件。指定があってもなくても成り立つ。
  it('★★当たるコマの後には必ず振り抜きが残る / 前には必ず溜めがある', () => {
    for (const n of Object.keys(ENEMY_ATTACK_SHEETS)) {
      const frames = ENEMY_ATTACK_SHEETS[n];
      const impact = attackImpactFrame(n);
      expect(frames - 1 - impact, `${n} の振り抜き`).toBeGreaterThanOrEqual(1);
      expect(impact, `${n} の溜め`).toBeGreaterThanOrEqual(2);
    }
  });

  it('★当たるコマの指定は、そのシートのコマ数の内側にある', () => {
    for (const [n, i] of Object.entries(ENEMY_ATTACK_IMPACT_FRAME)) {
      expect(ENEMY_ATTACK_SHEETS[n], `${n} は攻撃シートを持つ`).toBeGreaterThan(1);
      expect(i, n).toBeGreaterThanOrEqual(0);
      expect(i, n).toBeLessThan(ENEMY_ATTACK_SHEETS[n]);
    }
  });

  it('★送り方は表から引く(既定はループ)', () => {
    expect(walkPlayback('bat-female')).toBe('loop');
    expect(walkPlayback('bat-male')).toBe('pingpong');
    expect(walkPlayback('zombie-common')).toBe('loop');
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
