import { describe, it, expect } from 'vitest';
import { variantTextureName, ENEMY_VARIANT_SETS } from './enemyVariant';
import { attackSheetFrames, sheetHasWeapon } from './enemySheets';
import {
  batLanternPose, batLanternBack, batLanternDownDefault, batLanternDownAngle,
  batSlamFrame, batSlamFrameWithWindup, batSlamTotalMs, BAT_SLAM_FRAMES, BAT_SLAM_IMPACT_FRAME,
  BAT_SLAM_HOLD_MS, BAT_SLAM_ANCHOR_X, BAT_LANTERN_SETTLE_MS, BAT_LANTERN_REST,
  usesBatLantern, batSlamTexName, batSlamCounterable,
} from './batLanternSwing';

const W = 300, B = 200;
const norm = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
const poseR = (t: number) => batLanternPose(t, 1, batLanternDownDefault(1), W, B)!;

describe('バットのランタン: 上下は画面で固定(重力)', () => {
  it('★静止は真下に垂れる(振り上げの出だし=真下)', () => {
    expect(poseR(0).angle).toBeCloseTo(BAT_LANTERN_REST, 5);
  });

  it('★上下は狙い方向に連動しない。左右だけ鏡になる', () => {
    // 右向き=背中の上は左上 / 左向き=背中の上は右上。どちらも「上」である(sinが負)。
    expect(Math.sin(batLanternBack(1))).toBeLessThan(0);
    expect(Math.sin(batLanternBack(-1))).toBeLessThan(0);
    expect(Math.cos(batLanternBack(1))).toBeLessThan(0);   // 右向きの背中=左
    expect(Math.cos(batLanternBack(-1))).toBeGreaterThan(0); // 左向きの背中=右
  });

  it('★振り下ろし切った所は「下」である(振り上がらない)', () => {
    expect(Math.sin(norm(batLanternDownDefault(1)))).toBeGreaterThan(0);
    expect(Math.sin(norm(batLanternDownDefault(-1)))).toBeGreaterThan(0);
  });

  it('★溜めの終わり=背中の上まで振り上がっている', () => {
    expect(poseR(W).angle).toBeCloseTo(batLanternBack(1), 5);
  });

  it('★当たる瞬間=振り下ろし切っている', () => {
    expect(poseR(W + B).angle).toBeCloseTo(batLanternDownDefault(1), 5);
  });

  it('★振り上げは135°ぶん動く(小さくて見えない動きにしない)', () => {
    const d = Math.abs(poseR(W).angle - poseR(0).angle);
    expect(d).toBeGreaterThan(130 * Math.PI / 180);
  });

  it('★振り上げは上ほど遅い / 振り下ろしは落ちるほど速い(等速でない)', () => {
    const up1 = Math.abs(poseR(W * 0.5).angle - poseR(0).angle);
    const up2 = Math.abs(poseR(W).angle - poseR(W * 0.5).angle);
    expect(up1).toBeGreaterThan(up2 * 1.5);
    const dn1 = Math.abs(poseR(W + B * 0.5).angle - poseR(W).angle);
    const dn2 = Math.abs(poseR(W + B).angle - poseR(W + B * 0.5).angle);
    expect(dn2).toBeGreaterThan(dn1 * 1.5);
  });

  it('★叩いた後は減衰する揺れ(対称なS字で戻すだけにしない=符号が2回変わる)', () => {
    const d0 = batLanternDownDefault(1);
    const sgn: number[] = [];
    for (let t = 1; t < BAT_LANTERN_SETTLE_MS; t += 4) {
      const a = batLanternPose(W + B + t, 1, d0, W, B)!.angle - d0;
      sgn.push(Math.sign(a));
    }
    let flips = 0;
    for (let i = 1; i < sgn.length; i++) if (sgn[i] !== 0 && sgn[i] !== sgn[i - 1]) flips++;
    expect(flips).toBeGreaterThanOrEqual(2);
  });

  it('★揺れは収まる(終わりは着弾角へ戻っている)', () => {
    const d0 = batLanternDownDefault(1);
    const end = batLanternPose(W + B + BAT_LANTERN_SETTLE_MS - 1, 1, d0, W, B)!;
    expect(Math.abs(end.angle - d0)).toBeLessThan(2 * Math.PI / 180);
  });

  it('★余韻が切れたら消える', () => {
    expect(batLanternPose(W + B + BAT_LANTERN_SETTLE_MS + 1, 1, 0, W, B)).toBeNull();
  });
});

describe('バットのランタン: 落とす点へ向けて振り切る', () => {
  it('★落とす点が無ければ既定の角度', () => {
    expect(batLanternDownAngle(1, null)).toBeCloseTo(batLanternDownDefault(1), 5);
  });

  it('★atan2 の折り返しで振りが逆回りしない(既定の近傍へ展開される)', () => {
    const nominal = batLanternDownDefault(1);
    const raw = norm(nominal);                       // -π..π に折り返した同じ向き
    expect(batLanternDownAngle(1, raw)).toBeCloseTo(nominal, 5);
  });

  it('★極端な狙い(真後ろ)でも既定から±70°に留まる', () => {
    const nominal = batLanternDownDefault(1);
    const far = batLanternDownAngle(1, nominal + Math.PI);
    expect(Math.abs(far - nominal)).toBeLessThanOrEqual(70 * Math.PI / 180 + 1e-9);
  });
});

describe('バットのランタン: 炸裂のコマ送り', () => {
  it('★当たる瞬間にちょうど炸裂のコマが出る', () => {
    expect(batSlamFrame(0)).toBe(BAT_SLAM_IMPACT_FRAME);
  });

  it('★当たる前に赤が出ている時間は短い(判定の点に立つ柱にしない)', () => {
    const lead = BAT_SLAM_HOLD_MS.slice(0, BAT_SLAM_IMPACT_FRAME).reduce((a, b) => a + b, 0);
    expect(lead).toBeLessThanOrEqual(90);
    expect(batSlamFrame(-lead)).toBe(0);
    expect(batSlamFrame(-lead - 1)).toBeNull();
  });

  it('★社長の指定: 9コマ・7コマ目が叩きつけのピーク・8-9は残像(0始まりで6)', () => {
    expect(BAT_SLAM_FRAMES).toBe(9);
    expect(BAT_SLAM_IMPACT_FRAME).toBe(6);
    expect(batSlamFrame(0)).toBe(6);                 // 当たる瞬間=7コマ目
    expect(BAT_SLAM_FRAMES - 1 - BAT_SLAM_IMPACT_FRAME).toBe(2); // 残像は2コマ
  });

  it('★一番大きいコマが一番長く出る(山が本番にある)', () => {
    const peak = BAT_SLAM_HOLD_MS[BAT_SLAM_IMPACT_FRAME];
    for (let i = 0; i < BAT_SLAM_IMPACT_FRAME; i++) expect(peak).toBeGreaterThan(BAT_SLAM_HOLD_MS[i]);
  });

  it('★余韻は減速する(等間隔にしない)', () => {
    for (let i = BAT_SLAM_IMPACT_FRAME + 1; i < BAT_SLAM_FRAMES - 1; i++) {
      expect(BAT_SLAM_HOLD_MS[i + 1]).toBeGreaterThan(BAT_SLAM_HOLD_MS[i]);
    }
  });

  it('★コマは戻らない。最後まで流し切ってから消える', () => {
    const lead = BAT_SLAM_HOLD_MS.slice(0, BAT_SLAM_IMPACT_FRAME).reduce((a, b) => a + b, 0);
    let prev = -1;
    for (let t = -lead; t < batSlamTotalMs(); t += 2) {
      const f = batSlamFrame(t);
      if (f === null) continue;
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(prev).toBe(BAT_SLAM_FRAMES - 1);
    expect(batSlamFrame(batSlamTotalMs() - lead)).toBeNull();
  });

  it('接地点の表はコマ数ぶんある(素材を足したら必ずここも足す)', () => {
    expect(BAT_SLAM_ANCHOR_X).toHaveLength(BAT_SLAM_FRAMES);
    expect(BAT_SLAM_HOLD_MS).toHaveLength(BAT_SLAM_FRAMES);
  });
});

// ★PACING_PUZZLE.md §16-E(社長指示2026-09-19「武器を構えて一瞬止まる、を雑魚モーションには
// 差し込んでみよう。牙なら牙の1コマ目で」)。コウモリの掴み(bat-grab)はwindupMs 400ms。
describe('バットの炸裂シート: 構え(溜めのあいだ0コマ目で静止)', () => {
  const WINDUP_MS = 400; // bat-grabのwindupMs(§16の技)

  it('E-5受け入れ条件1: 溜めが始まった同じフレームに0コマ目が出る', () => {
    expect(batSlamFrameWithWindup(0, WINDUP_MS, -9999)).toBe(0);
  });

  it('E-5受け入れ条件2: 溜めのあいだ(< windupMs)は0コマ目のまま静止する', () => {
    expect(batSlamFrameWithWindup(1, WINDUP_MS, -9999)).toBe(0);
    expect(batSlamFrameWithWindup(200, WINDUP_MS, -9999)).toBe(0);
    expect(batSlamFrameWithWindup(WINDUP_MS - 1, WINDUP_MS, -9999)).toBe(0);
  });

  it('E-5受け入れ条件3: 溜め明け(>= windupMs)からは`batSlamFrame`と1ミリも変わらない', () => {
    for (let sinceImpactMs = -100; sinceImpactMs <= 200; sinceImpactMs += 4) {
      const sinceWindupMs = WINDUP_MS + 9999; // 十分に溜め明け
      expect(batSlamFrameWithWindup(sinceWindupMs, WINDUP_MS, sinceImpactMs))
        .toBe(batSlamFrame(sinceImpactMs));
    }
  });

  it('まだ発火していない(sinceWindupMs<0)は出さない', () => {
    expect(batSlamFrameWithWindup(-1, WINDUP_MS, -9999)).toBeNull();
  });
});

describe('対象の型', () => {
  // ★★2026-09-20: 規則が変わった。**攻撃シート(武器ごと描かれた絵)を持つ個体は false**
  // ——別スプライトのランタンも出すと二本持ちになる。絵の中に武器がある個体は絵に任せる。
  it('バット以外は振らない', () => {
    expect(usesBatLantern({ type: 'skeleton', id: 'x' })).toBe(false);
    expect(usesBatLantern({ type: 'zombie', id: 'x' })).toBe(false);
  });

  // ★★社長報告2026-09-21「コウモリ女の攻撃時に武器が消えてる」の再発防止。
  // 旧実装は「**攻撃シートがある**=武器も描かれている」と決めつけて別スプライトを消していたが、
  // **女のシートは素手で掴む絵**だった(ぶら下がる小さなランタンは体の装飾)。
  // ⇒ 判定は `ENEMY_SHEET_HAS_WEAPON` の**明示**だけを見る。
  it('★★「武器ごと描かれたシート」を持つ個体だけ、別スプライトを出さない', () => {
    const ids = Array.from({ length: 24 }, (_, k) => `e${k}`);
    for (const id of ids) {
      const tex = variantTextureName('bat', id);
      expect(usesBatLantern({ type: 'bat', id }), `${id}(${tex})`).toBe(!sheetHasWeapon(tex));
    }
  });

  it('★★女は攻撃シートを持つが、武器は別スプライト=消えてはいけない', () => {
    expect(attackSheetFrames('bat-female'), '女は攻撃シートを持つ').toBeGreaterThan(1);
    expect(sheetHasWeapon('bat-female'), '女のシートに武器は描かれていない').toBe(false);
    const female = Array.from({ length: 24 }, (_, k) => `e${k}`)
      .filter(id => variantTextureName('bat', id) === 'bat-female');
    expect(female.length, '女の個体が見つからない').toBeGreaterThan(0);
    for (const id of female) expect(usesBatLantern({ type: 'bat', id }), id).toBe(true);
  });

  // ★社長報告2026-09-22「**バットの男の武器も消えてるよ**」。v0.25.4539 で「シートに武器が
  // 描かれている」と判断して止めていたのを撤回した(同種の差し戻しは3回目)。
  it('★★男女とも別スプライトの武器を出す(止めている個体は1体も無い)', () => {
    expect(sheetHasWeapon('bat-male')).toBe(false);
    expect(sheetHasWeapon('bat-female')).toBe(false);
    const ids = Array.from({ length: 24 }, (_, k) => `e${k}`);
    const male = ids.filter(id => variantTextureName('bat', id) === 'bat-male');
    const female = ids.filter(id => variantTextureName('bat', id) === 'bat-female');
    expect(male.length, '男の個体が見つからない').toBeGreaterThan(0);
    expect(female.length, '女の個体が見つからない').toBeGreaterThan(0);
    for (const id of ids) expect(usesBatLantern({ type: 'bat', id }), id).toBe(true);
  });

  it('★既定は「描かれていない」=新しいシートを足しても武器は消えない(安全な側)', () => {
    for (const tex of ENEMY_VARIANT_SETS.bat) {
      if (tex === 'bat-male') continue;
      expect(sheetHasWeapon(tex), tex).toBe(false);
    }
    expect(sheetHasWeapon('zombie-common')).toBe(false);
    expect(sheetHasWeapon(null)).toBe(false);
  });
});

describe('炸裂の色は「カウンターできるか」で決まる(色と形の文法)', () => {
  it('★掴み(bat-grab)は赤・既定の噛みつきは紫。台帳は enemyBite.ts の1箇所', () => {
    expect(batSlamCounterable({ type: 'bat', chaffMove: 'bat-grab' } as never)).toBe(true);
    expect(batSlamCounterable({ type: 'bat' } as never)).toBe(false);
  });

  it('★赤と紫で別のテクスチャを引く(同じ絵を赤で使い回さない)', () => {
    expect(batSlamTexName(5, true)).toBe('fx/bat-slam-5');
    expect(batSlamTexName(5, false)).toBe('fx/bat-slam-p-5');
    expect(batSlamTexName(5, true)).not.toBe(batSlamTexName(5, false));
  });
});
