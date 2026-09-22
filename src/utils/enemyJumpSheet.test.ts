// ★跳ぶ技の絵の区間割り。社長支給2026-09-21「パンプキン(蜘蛛)のジャンプ攻撃時」。
import { describe, it, expect } from 'vitest';
import { enemyJumpFrame, enemyJumpFallFrame, jumpSplitFrames } from './enemyJumpSheet';
import { ENEMY_JUMP_SHEETS, ENEMY_JUMP_LAND_MS, jumpSheetName, jumpSheetSplit } from './enemySheets';
import { ENEMY_VARIANT_SETS } from './enemyVariant';
import { PUMPKIN_RECOVER_MS, ENEMY_ATTACK_SPEED_MULT } from '../store/gameStore';

const SP = ENEMY_JUMP_SHEETS['pumpkin-common'];
const N = jumpSplitFrames(SP);
// ★v0.25.4565: 境目の検査を**表の全部**へ広げる(蜘蛛だけ見ていると、後から足した絵の
// 区間割りが合計と食い違っていても誰も落ちない)。
const ALL = Object.entries(ENEMY_JUMP_SHEETS);

describe('★表', () => {
  it('シート名は<立ち絵名>-jump', () => expect(jumpSheetName('pumpkin-common')).toBe('pumpkin-common-jump'));

  // ★**この検査は `enemySheetFiles.test.ts`(PNGが実在するか)へ移した**(v0.25.4563)。
  // 変種の表(`ENEMY_VARIANT_SETS`)は**男女2種などを持つ敵だけ**の表で、ハンターのように
  // 変種を持たない敵は載っていない=**正しい名前でも落ちる**。しかも**シート側のファイル名を
  // 1バイトも見ていなかった**ので、「名前を間違えると一生出ない」を捕まえられていなかった。


  it('★着地の尺を登録し忘れた絵が無い(既定へ黙って落ちない)', () => {
    for (const n of Object.keys(ENEMY_JUMP_SHEETS)) expect(ENEMY_JUMP_LAND_MS[n], n).toBeGreaterThan(0);
  });

  it('★区間の合計＝シートのコマ数が、絵ごとに辻褄が合う', () => {
    expect(ALL.length).toBeGreaterThan(1);                              // 検査対象が空/1件だけにならない
    for (const [n, sp] of ALL) expect(jumpSplitFrames(sp), n).toBe(sp.crouch + sp.air + sp.land);
  });

  it('★★どの絵でも区間の境目でコマが飛ばない(蜘蛛だけでなく表の全部)', () => {
    for (const [n, sp] of ALL) {
      const total = jumpSplitFrames(sp);
      expect(enemyJumpFrame(sp, 'crouch', 0), n).toBe(0);
      expect(enemyJumpFrame(sp, 'air', 0), n).toBe(enemyJumpFrame(sp, 'crouch', 1)! + 1);
      expect(enemyJumpFrame(sp, 'land', 0), n).toBe(enemyJumpFrame(sp, 'air', 1)! + 1);
      expect(enemyJumpFrame(sp, 'land', 0.999), n).toBe(total - 1);
      expect(enemyJumpFrame(sp, 'land', 1), n).toBeNull();
      const seen = new Set<number>();
      for (let q = 0; q < 1; q += 0.002) {
        for (const ph of ['crouch', 'air', 'land'] as const) {
          const i = enemyJumpFrame(sp, ph, q);
          if (i !== null) seen.add(i);
        }
      }
      expect(seen.size, n).toBe(total);                                  // 全コマを1度は通る
      expect(enemyJumpFallFrame(sp), n).toBe(sp.crouch + sp.air - 1);    // 弾かれた落下は滞空の最後
    }
  });

  it('★どの区間も1コマ以上ある(0だと区間ごと消える)', () => {
    for (const [n, sp] of Object.entries(ENEMY_JUMP_SHEETS)) {
      expect(sp.crouch, n).toBeGreaterThan(0);
      expect(sp.air, n).toBeGreaterThan(0);
      expect(sp.land, n).toBeGreaterThan(0);
    }
  });

  it('★ハンターの着地の絵は「立ち直りが明けるまで」持つ(最後のコマが立ち絵と繋がらないため)', () => {
    // 生の `PUMPKIN_RECOVER_MS` をゲームスピードで割った実効値=立ち直りの長さ。
    // ここがズレると、棺桶を地に置いたままの最後のコマの後に**担いだ立ち絵へ瞬間移動**する。
    const recoverMs = PUMPKIN_RECOVER_MS / ENEMY_ATTACK_SPEED_MULT;
    expect(Math.abs(ENEMY_JUMP_LAND_MS['hunter'] - recoverMs)).toBeLessThanOrEqual(1);
  });

  it('表に無い絵は割り当てなし', () => {
    const rest = Object.values(ENEMY_VARIANT_SETS).flat().filter(n => !(n in ENEMY_JUMP_SHEETS));
    expect(rest.length).toBeGreaterThan(0);
    for (const n of rest) expect(jumpSheetSplit(n), n).toBeNull();
  });
});

describe('★★区間の境目でコマが飛ばない', () => {
  it('しゃがみは先頭コマから始まり、沈み切りで区間の最後のコマになる', () => {
    expect(enemyJumpFrame(SP, 'crouch', 0)).toBe(0);
    expect(enemyJumpFrame(SP, 'crouch', 0.999)).toBe(SP.crouch - 1);
    expect(enemyJumpFrame(SP, 'crouch', 1)).toBe(SP.crouch - 1);      // はみ出しても飛ばない
  });

  it('★しゃがみの終わり → 滞空の始まりが隣り合うコマ', () => {
    expect(enemyJumpFrame(SP, 'air', 0)).toBe(enemyJumpFrame(SP, 'crouch', 1)! + 1);
  });

  it('★滞空の終わり → 着地の始まりが隣り合うコマ', () => {
    expect(enemyJumpFrame(SP, 'land', 0)).toBe(enemyJumpFrame(SP, 'air', 1)! + 1);
  });

  it('着地の絵が終わったら null(歩き/立ち絵へ返す)', () => {
    expect(enemyJumpFrame(SP, 'land', 0.999)).toBe(N - 1);
    expect(enemyJumpFrame(SP, 'land', 1)).toBeNull();
    expect(enemyJumpFrame(SP, 'land', 3)).toBeNull();
  });

  it('★どの区間も全コマを1度は通る(飛ばさない)', () => {
    const seen = new Set<number>();
    for (let p = 0; p < 1; p += 0.002) {
      for (const ph of ['crouch', 'air', 'land'] as const) {
        const i = enemyJumpFrame(SP, ph, p);
        if (i !== null) seen.add(i);
      }
    }
    expect(seen.size).toBe(N);
  });

  it('コマ番号は必ず範囲内(進み具合が負や巨大でも壊れない)', () => {
    for (const p of [-5, -0.1, 0, 0.5, 1, 99]) {
      for (const ph of ['crouch', 'air', 'land'] as const) {
        const i = enemyJumpFrame(SP, ph, p);
        if (i !== null) { expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(N); }
      }
    }
  });

  it('★弾かれて落ちている間は「滞空の最後のコマ」(着地の砂埃を先に出さない)', () => {
    expect(enemyJumpFallFrame(SP)).toBe(SP.crouch + SP.air - 1);
    expect(enemyJumpFallFrame(SP)).toBeLessThan(SP.crouch + SP.air);   // 着地区間には入らない
  });
});
