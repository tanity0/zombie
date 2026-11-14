// ★跳ぶ技の絵の区間割り。社長支給2026-09-21「パンプキン(蜘蛛)のジャンプ攻撃時」。
import { describe, it, expect } from 'vitest';
import { enemyJumpFrame, enemyJumpFallFrame, jumpSplitFrames, enemyJumpLandLastFrame, jumpLandDrawMs } from './enemyJumpSheet';
import { ENEMY_JUMP_SHEETS, ENEMY_JUMP_LAND_MS, jumpSheetName, jumpSheetSplit, jumpSheetBodyH } from './enemySheets';
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

describe('★着地の最後のコマで持たせる(社長報告2026-09-23「小ジャンプしてるみたいなのが最後に混ざってる」)', () => {
  // 着地の絵の長さ(ENEMY_JUMP_LAND_MS)は**硬直の長さとは別物**。蜘蛛は着地420msに対し硬直が実効1667ms
  // あるため、絵が尽きた後の約1.25秒が立ち絵へ戻り、体の高さが 80.5px → 87.8px(+9%)跳ね上がっていた。
  const SPLIT = { crouch: 4, air: 6, land: 5 } as const; // = pumpkin-common
  it('着地の最後のコマ番号は「全コマ数-1」', () => {
    expect(enemyJumpLandLastFrame(SPLIT)).toBe(4 + 6 + 5 - 1);
  });
  it('★進行度が1を超えたら enemyJumpFrame は null を返す(=呼び出し側が最後のコマで持たせる前提)', () => {
    expect(enemyJumpFrame(SPLIT, 'land', 0.999)).toBe(enemyJumpLandLastFrame(SPLIT));
    expect(enemyJumpFrame(SPLIT, 'land', 1)).toBeNull();
    expect(enemyJumpFrame(SPLIT, 'land', 4)).toBeNull();
  });
  it('持たせるコマは、着地区間の中で一番最後=絵が戻らない', () => {
    const last = enemyJumpLandLastFrame(SPLIT);
    for (let p = 0; p < 1; p += 0.05) {
      expect(enemyJumpFrame(SPLIT, 'land', p)!).toBeLessThanOrEqual(last);
    }
  });
  it('区間の割り方が違うシートでも同じ(城ボス=5/5/6 / ハンター=5/5/6)', () => {
    expect(enemyJumpLandLastFrame({ crouch: 4, air: 7, land: 5 })).toBe(15);
    expect(enemyJumpLandLastFrame({ crouch: 5, air: 5, land: 6 })).toBe(15);
  });
});

describe('jumpLandDrawMs（着地の絵は相より長くしない・v0.25.4608）', () => {
  it('相の方が短い時は詰める（城ボス1: 絵700ms / 相250ms）', () => {
    expect(jumpLandDrawMs(700, 250)).toBe(250);
  });

  it('相の方が長い時は絵の尺のまま（蜘蛛: 絵420ms / 相1667ms。余りは最後のコマで持たせる）', () => {
    expect(jumpLandDrawMs(420, 1667)).toBe(420);
  });

  it('ぴったり同じ時は変わらない（ハンター: 833ms）', () => {
    expect(jumpLandDrawMs(833, 833)).toBe(833);
  });

  it('相が分からない/0以下なら絵の尺へ落ちる（0除算で落とさない）', () => {
    expect(jumpLandDrawMs(700, 0)).toBe(700);
    expect(jumpLandDrawMs(700, -10)).toBe(700);
  });

  it('詰めた尺でも着地の全コマが出る（打ち切られない）', () => {
    const split = { crouch: 4, air: 7, land: 5 };
    const dur = jumpLandDrawMs(700, 250);
    const seen = new Set<number>();
    for (let t = 0; t <= dur; t += 1) {
      const f = enemyJumpFrame(split, 'land', t / dur);
      if (f !== null) seen.add(f);
    }
    // land 区間は通し番号 11..15（crouch4 + air7 の後）
    expect(seen.size).toBe(5);
  });
});

// ★社長報告2026-09-25「城3のジャンプの絵がやたら小さい」。
describe('★跳びシートの bodyH(シートが小さく描かれていた分の補正)', () => {
  // ★`bodyH` を持つのは「**枠いっぱいに描かれていない**シート」だけ。書いた値は**立ち絵へ重ねて測った
  // 描き込み倍率 × 立ち絵の枠**(城3は 150×0.815=122 / 城5は 150×1.333/1.425=140)。
  // ★城4は **v0.25.4652 でシートの取り違えを是正**して 144→136 になった(144 は取り違えていた
  //   もう1枚=腕を薙ぐ絵の値で、そちらは今 `GIANT_ALT_SWEEP` 側が持っている)。
  it('bodyH を持つのは実測で小さく描かれていたシートだけ', () => {
    expect(ENEMY_JUMP_SHEETS['stage3-enemies/giantbat'].bodyH).toBe(122);
    expect(ENEMY_JUMP_SHEETS['stage4-enemies/giantbat'].bodyH).toBe(136);
    expect(ENEMY_JUMP_SHEETS['stage5-enemies/giantbat'].bodyH).toBe(140);
    const WITH = new Set(['stage3-enemies/giantbat', 'stage4-enemies/giantbat', 'stage5-enemies/giantbat']);
    for (const [n, sp] of Object.entries(ENEMY_JUMP_SHEETS)) {
      if (WITH.has(n)) continue;
      expect(sp.bodyH, n).toBeUndefined();
    }
  });

  // ★城ボス4は**着地だけ別倍率、が無い**。
  it('城ボス4の跳びは着地も同じ倍率(landBodyH を持たない)', () => {
    const KEY = 'stage4-enemies/giantbat';
    expect(ENEMY_JUMP_SHEETS[KEY].landBodyH).toBeUndefined();
    for (const f of [0, 5, 10, 11, 15]) expect(jumpSheetBodyH(KEY, f), `コマ${f}`).toBe(136);
  });

  // ★v0.25.4652: 砂埃の画素数が**10コマ目で跳ねる**(123→278)=そこが着地。⇒ 3/7/6。
  it('城ボス4の跳びは 16コマを 3/7/6 に割る(砂埃が10コマ目で跳ねる)', () => {
    const sp = ENEMY_JUMP_SHEETS['stage4-enemies/giantbat'];
    expect(jumpSplitFrames(sp)).toBe(16);
    expect([sp.crouch, sp.air, sp.land]).toEqual([3, 7, 6]);
    expect(sp.crouch + sp.air).toBe(10); // 着地の先頭コマ=一撃のコマ
  });

  // ★城ボス5(社長支給2026-09-25「ジャンプ及び叩きつけモーション」)。
  // 4で踏み切り(全体高150=最大)→ 10で最も潰れる(96=最小)=着地の一撃。
  it('城ボス5の跳びは 15コマを 4/6/5 に割る(10コマ目が着地の一撃)', () => {
    const sp = ENEMY_JUMP_SHEETS['stage5-enemies/giantbat'];
    expect(jumpSplitFrames(sp)).toBe(15);
    expect([sp.crouch, sp.air, sp.land]).toEqual([4, 6, 5]);
    expect(sp.crouch + sp.air).toBe(10);
    expect(sp.landBodyH).toBeUndefined(); // 着地だけ別倍率は今のところ無し(実機で見て決める)
  });

  // ★社長報告2026-09-25「城3ボス、ジャンプの**着地中の絵だけ**小さい」。
  // シートの中で**同じ姿勢どうし**を重ねて測ったら、着地の5コマだけ 0.78倍だった
  // (跳3→跳11 0.785 / →跳12 0.790 / 跳2→跳11 0.785 / 跳0→跳13〜15 0.740〜0.775)。
  it('★着地の区間だけ別の値を返す(それ以外は bodyH)', () => {
    const KEY = 'stage3-enemies/giantbat';
    const sp = ENEMY_JUMP_SHEETS[KEY];
    expect(sp.landBodyH).toBe(95);
    // 溜め(0〜3)と滞空(4〜10)は 122。
    for (const f of [0, 3, 4, 10]) expect(jumpSheetBodyH(KEY, f), `コマ${f}`).toBe(122);
    // 着地(11〜15)は 95。
    for (const f of [11, 12, 13, 14, 15]) expect(jumpSheetBodyH(KEY, f), `コマ${f}`).toBe(95);
    // コマを渡さない呼び方はシート全体の値(=従来どおり)。
    expect(jumpSheetBodyH(KEY)).toBe(122);
  });

  it('landBodyH を持たないシートは、どのコマでも bodyH のまま', () => {
    for (const [n, sp] of Object.entries(ENEMY_JUMP_SHEETS)) {
      if (sp.landBodyH !== undefined || sp.frameBodyH !== undefined) continue;
      for (const f of [0, sp.crouch + sp.air, jumpSplitFrames(sp) - 1]) {
        expect(jumpSheetBodyH(n, f), `${n} コマ${f}`).toBe(sp.bodyH ?? null);
      }
    }
  });

  it('★コマごとの大きさ合わせ(frameBodyH)はコマ数と同じ長さで、そのコマの値が返る', () => {
    for (const [n, sp] of Object.entries(ENEMY_JUMP_SHEETS)) {
      if (sp.frameBodyH === undefined) continue;
      expect(sp.frameBodyH.length, n).toBe(jumpSplitFrames(sp));
      sp.frameBodyH.forEach((v, f) => {
        expect(v, `${n} コマ${f}`).toBeGreaterThan(0);
        expect(jumpSheetBodyH(n, f), `${n} コマ${f}`).toBe(v);
      });
    }
    // グレン形態1: 0コマ目はほぼ立ち絵どおり、1コマ目以降は人物が小さく描かれている=値が小さい(=拡大される)
    const g = ENEMY_JUMP_SHEETS['glen-boss'].frameBodyH!;
    expect(g[0]).toBeGreaterThan(g[2]);
  });

  it('bodyH は区間の割り方に1ビットも影響しない(背丈だけの話)', () => {
    const sp = ENEMY_JUMP_SHEETS['stage3-enemies/giantbat'];
    expect(jumpSplitFrames(sp)).toBe(16);
    expect([sp.crouch, sp.air, sp.land]).toEqual([4, 7, 5]);
  });
});
