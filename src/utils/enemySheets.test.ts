// ★シートの台帳(葉モジュール)の不変条件。
//
// ★なぜ葉に分けたか: v0.25.4537 で `enemyAttackSheet ⇄ batLanternSwing` の**循環import**を作った
// (表を片方に置き、もう片方が引き返した)。表は4方向から引かれるので、依存ゼロの葉に置く。
// ★社長裁定2026-09-21「全敵アニメーション入れる予定なのでミラーさせます / 少しずつ揃えていくので個々実装」
// + 社長指示2026-09-22「**ミラーは全ての敵で適用します**」
// = **手で描かれた絵を持つ個体は全部ミラーする**(型ではなく個体・例外なし)。素材が揃うたび自動で移る。
import { describe, it, expect } from 'vitest';
import {
  ENEMY_WALK_SHEETS, ENEMY_ATTACK_SHEETS, ENEMY_SHEET_FACES_RIGHT,
  walkSheetName, attackSheetName, walkSheetFrames, attackSheetFrames,
  hasAnimSheet, sheetFacesRight, walkPlayback, attackImpactFrame,
  sheetHasWeapon, ENEMY_SHEET_HAS_WEAPON, ENEMY_ATTACK_IMPACT_FRAME,
  sheetFrontOn, ENEMY_SHEET_FRONT_ON,
  ENEMY_IDLE_SHEETS, ENEMY_SHOT_SHEETS, ENEMY_JUMP_SHEETS, ENEMY_SWEEP_SHEETS,
  ENEMY_WALK_STRIDE_MUL, ENEMY_WALK_DASH_GEAR, walkStrideMul,
} from './enemySheets';
import { ENEMY_VARIANT_SETS } from './enemyVariant';

/**
 * ★**5つの表のどれかに載っている立ち絵**=ミラーの対象(v0.25.4566)。
 * 歩き/攻撃だけを見ていると、**待機だけ・弾だけ・跳びだけ**の絵を持つ個体を取りこぼす。
 * ★名前は手書きしない(表から導出する。素材が1体ずつ届くので、書くと届くたびに落ちる)。
 */
const ALL_SHEETED = new Set([
  ...Object.keys(ENEMY_WALK_SHEETS), ...Object.keys(ENEMY_ATTACK_SHEETS),
  ...Object.keys(ENEMY_IDLE_SHEETS), ...Object.keys(ENEMY_SHOT_SHEETS), ...Object.keys(ENEMY_JUMP_SHEETS),
  ...Object.keys(ENEMY_SWEEP_SHEETS),
]);

describe('★表', () => {
  it('シート名の付け方', () => {
    expect(walkSheetName('bat-female')).toBe('bat-female-walk');
    expect(attackSheetName('bat-female')).toBe('bat-female-attack');
  });

  // ★**この検査は `enemySheetFiles.test.ts`(PNGが実在するか)へ移した**(v0.25.4563)。
  // 変種の表(`ENEMY_VARIANT_SETS`)は**男女2種などを持つ敵だけ**の表で、ハンターのように
  // 変種を持たない敵は載っていない=**正しい名前でも落ちる**。しかも**シート側のファイル名を
  // 1バイトも見ていなかった**ので、「名前を間違えると一生出ない」を捕まえられていなかった。

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
    const withSheet = ALL_SHEETED;
    expect(withSheet.size).toBeGreaterThan(0);
    for (const n of withSheet) expect(hasAnimSheet(n), n).toBe(true);
    // ★★**2026-09-24(v0.25.4625)に、まだシートの無い絵が 0 枚になった**
    //   (`ENEMY_VARIANT_SETS` に載っている絵が全部アニメーションを持った)。
    //   ここには「1枚も無いならこの検査は空回り」という下限があったが、**素材が揃い切ると
    //   その下限のせいでテストの方が落ちる**=進捗が「壊れた」ことにされる。⇒ 下限は外し、
    //   **空回りの検知は「絶対にシートを持たない名前」で行う**(残りが0枚でも成立する形)。
    const noSheet = Object.values(ENEMY_VARIANT_SETS).flat().filter(n => !withSheet.has(n));
    for (const n of noSheet) expect(hasAnimSheet(n), n).toBe(false);
    expect(hasAnimSheet('__no-such-art__'), 'hasAnimSheet が何でも true を返していないか').toBe(false);
    expect(hasAnimSheet(null)).toBe(false);
    expect(hasAnimSheet(undefined)).toBe(false);
  });

  // ★★名前を手書きしない(2026-09-21・3回続けて同じ壊れ方をしたため)。
  // 素材は1体ずつ届くので、「まだシートが無い絵」を列挙すると**届くたびにテストが落ちる**
  // (bat-male の歩き→攻撃→skeleton-male の歩き、で3回)。**表から導出する。**
  it('★シートを持たない立ち絵は従来どおり(型の設定のまま)', () => {
    // ★2026-09-24: 上と同じ理由で下限を外した(**残りは現在0枚**)。素材が届くたびに減る側の数なので、
    //   「まだ残っている」を前提にした検査は、揃い切った瞬間に必ず落ちる。
    const without = [...new Set(Object.values(ENEMY_VARIANT_SETS).flat())].filter(n => !ALL_SHEETED.has(n));
    for (const n of without) expect(hasAnimSheet(n), n).toBe(false);
    expect(hasAnimSheet('__no-such-art__')).toBe(false);
  });

  it('男女とも攻撃シートを持つ', () => {
    expect(attackSheetFrames('bat-female')).toBeGreaterThan(1);
    expect(attackSheetFrames('bat-male')).toBeGreaterThan(1);
  });

  // ★★社長報告2026-09-21「コウモリ女の攻撃時に武器が消えてる」の再発防止。
  // ★★★**この表は空のままにする**(社長裁定3回。v0.25.4541 女のランタン / 4547 骸骨の爪 /
  // **4558 コウモリ男の武器**)。「シートに武器が描かれているから二本になる」と設計者が判断して
  // 登録するたびに差し戻されている。**別スプライトの武器は全個体で出る**が正。
  it('★★★別スプライトの武器を止めている個体が1体も無い', () => {
    expect(Object.keys(ENEMY_SHEET_HAS_WEAPON)).toHaveLength(0);
    const all = Object.values(ENEMY_VARIANT_SETS).flat();
    for (const n of all) expect(sheetHasWeapon(n), n).toBe(false);
    expect(sheetHasWeapon(null)).toBe(false);
  });

  it('シートを持っていても、武器を止めることとは別(表を混ぜない)', () => {
    expect(attackSheetFrames('bat-female')).toBeGreaterThan(1);   // シートはある
    expect(sheetHasWeapon('bat-female')).toBe(false);             // が、武器は止めない
    expect(attackSheetFrames('bat-male')).toBeGreaterThan(1);
    expect(sheetHasWeapon('bat-male')).toBe(false);
  });

  // ★社長指示2026-09-21「**別スプライトの爪は消さなくていい**」。v0.25.4543〜4545 は
  // 「シートに爪が描かれている=二本になる」として止めていたが、裁定で**出したまま**になった。
  // ⇒ 骸骨は表に載せない(描画側もシートの有無を見ない)。**戻したら二本になるので、表で止める。**
  it('★攻撃シートを持つ絵でも、武器のスプライトは止めない', () => {
    for (const n of Object.keys(ENEMY_ATTACK_SHEETS)) {
      expect(sheetHasWeapon(n), n).toBe(false);
    }
    expect(sheetHasWeapon('lich-common')).toBe(false);      // 爪を共有するリッチも従来どおり
  });

  // ★★社長指示2026-09-22「**ミラーは全ての敵で適用します**」。例外表は**空が正**。
  // 設計者は「正面向きの絵は反転しても得が無い」と考えて3件登録し、3件とも撤回された
  // (蜘蛛 v0.25.4552 / 咆哮型 v0.25.4560 / ハンター v0.25.4563 → v0.25.4566 で全撤回)。
  it('★★ミラーの例外表は空(=全ての敵がミラーする)', () => {
    expect(Object.keys(ENEMY_SHEET_FRONT_ON)).toHaveLength(0);
    const withSheet = [...ALL_SHEETED];
    expect(withSheet.length, 'シートが1枚も無いなら、この検査は何も言っていない').toBeGreaterThan(0);
    for (const n of withSheet) expect(sheetFrontOn(n), n).toBe(false);
    expect(sheetFrontOn(null)).toBe(false);
  });

  // ★★品質監査2026-09-23 の指摘(v0.25.4575): 薙ぎ払いの表を足した時、`hasAnimSheet` に入れ忘れて
  // **伐採人だけ手描きシートを持ちながらミラーされない**状態になっていた。表を足すたびに同じ穴が開くので、
  // 「**どの表に載っていても対象**」を機械で押さえる。
  it('★★表を1つ足してミラーの判定に入れ忘れると落ちる(表ごとに最低1件は対象)', () => {
    const tables: [string, Readonly<Record<string, unknown>>][] = [
      ['歩き', ENEMY_WALK_SHEETS], ['攻撃', ENEMY_ATTACK_SHEETS], ['待機', ENEMY_IDLE_SHEETS],
      ['弾', ENEMY_SHOT_SHEETS], ['跳ぶ', ENEMY_JUMP_SHEETS], ['薙ぎ', ENEMY_SWEEP_SHEETS],
    ];
    for (const [label, t] of tables) {
      const keys = Object.keys(t);
      expect(keys.length, `${label}: 表が空だと検査が空回りする`).toBeGreaterThan(0);
      for (const n of keys) expect(hasAnimSheet(n), `${label}: ${n}`).toBe(true);
    }
  });

  it('★待機だけ/弾だけ/跳びだけの絵を持つ個体も、ミラーの対象に入る', () => {
    const motionOnly = [...ALL_SHEETED].filter(n => walkSheetFrames(n) <= 1 && attackSheetFrames(n) <= 1);
    expect(motionOnly.length, '歩き・攻撃以外の絵しか持たない個体が居ないなら、この検査は空回り').toBeGreaterThan(0);
    for (const n of motionOnly) expect(hasAnimSheet(n), n).toBe(true);
  });

  it('★向きの印(正面/右向き)を付けられるのは、シートを持つ絵だけ(付け間違いを弾く)', () => {
    for (const n of [...Object.keys(ENEMY_SHEET_FRONT_ON), ...Object.keys(ENEMY_SHEET_FACES_RIGHT)]) {
      expect(hasAnimSheet(n), n).toBe(true);
    }
  });

  // ★歩幅/ギアの倍率は**名前が1文字違うと黙って無視される**(既定1へ落ちる)。
  // シート名を見ていなかった検査の穴(v0.25.4563)と同じ壊れ方なので、ここで弾く。
  it('★歩幅・ギアの倍率を付けられるのは、歩きシートを持つ絵だけ(名前の打ち間違いを弾く)', () => {
    const keys = [...Object.keys(ENEMY_WALK_STRIDE_MUL), ...Object.keys(ENEMY_WALK_DASH_GEAR)];
    expect(keys.length, '倍率が1つも無いなら、この検査は何も言っていない').toBeGreaterThan(0);
    for (const n of keys) {
      expect(walkSheetFrames(n), n).toBeGreaterThan(1);
      expect(walkStrideMul(n, false), n).toBeGreaterThan(0);
      expect(walkStrideMul(n, true), n).toBeGreaterThanOrEqual(walkStrideMul(n, false)); // 突進は落とさない
    }
    expect(walkStrideMul('zzz-not-a-sheet', false)).toBe(1);   // 載っていない絵は既定1
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
