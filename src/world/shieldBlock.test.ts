import { describe, it, expect } from 'vitest';
import {
  friendlyShieldRect, inShieldShadow, shieldBlocksArea, shieldBlocksLine, clipBeamAtShield, rectGap, SHIELD_AREA_GUARD_PX,
  clipBeamEnd, clipSweepBeam, blastBlockedByShield, splitBeamAtShield, beamStripsHit, shieldContactPoint, beamDrawPlan,
} from './shieldBlock';

// 上向きに置いた盾(横 58 × 厚み 16)。プレイヤーは盾の下(y が大きい側)。
const shield = { x: -29, y: -40, width: 58, height: 16 };
const playerAt = (cx: number, cy: number) => ({ x: cx - 14, y: cy - 14, width: 28, height: 28 });

describe('シールドで技を防ぐ(research/SHIELD_BLOCK.md)', () => {
  it('味方の盾だけを読む(幻影の盾=hostile は無視)', () => {
    expect(friendlyShieldRect([{ weaponType: 'shield', hostile: true, ...shield }])).toBeNull();
    expect(friendlyShieldRect([{ weaponType: 'bullet', ...shield }, { weaponType: 'shield', hostile: false, ...shield }])).toEqual(shield);
    expect(friendlyShieldRect([])).toBeNull();
  });

  it('影: 判定源→相手の線分が盾を通る時だけ。盾の中に居る時は防がない', () => {
    expect(inShieldShadow(0, -300, 0, 0, shield)).toBe(true);
    expect(inShieldShadow(200, -300, 200, 0, shield)).toBe(false); // 横
    expect(inShieldShadow(0, 300, 0, 0, shield)).toBe(false);      // 前から(盾の後ろではない)
    expect(inShieldShadow(0, -300, 0, -32, shield)).toBe(false);   // 相手が盾の中
    expect(inShieldShadow(0, -32, 0, 0, shield)).toBe(false);      // 判定源が盾の中
    expect(inShieldShadow(0, -300, 0, 0, null)).toBe(false);
  });

  it('円・扇: 影 かつ 盾から 40px 以内。41px で当たる', () => {
    const near = playerAt(0, -24 + 14 + SHIELD_AREA_GUARD_PX);   // 盾の下辺(-24)から体の上辺まで 40px
    const far = playerAt(0, -24 + 14 + SHIELD_AREA_GUARD_PX + 1);
    expect(rectGap(near, shield)).toBeCloseTo(40);
    expect(shieldBlocksArea(0, -300, near, shield)).toBe(true);
    expect(shieldBlocksArea(0, -300, far, shield)).toBe(false);
  });

  it('判定源がプレイヤーの足元の技は防げない', () => {
    const p = playerAt(0, 0);
    expect(shieldBlocksArea(0, 0, p, shield)).toBe(false);
    expect(shieldBlocksLine(0, 0, p, shield)).toBe(false);
  });

  it('帯・突進・レーザー: 影なら距離に関係なく防ぐ', () => {
    expect(shieldBlocksLine(0, -300, playerAt(0, 400), shield)).toBe(true);
    expect(shieldBlocksLine(0, -300, playerAt(300, 400), shield)).toBe(false);
  });

  it('光線の長さは中心線が盾に入る所で切る。外れたら・起点が盾の中なら切らない', () => {
    expect(clipBeamAtShield(0, -300, 0, 1, 2600, shield)).toBeCloseTo(260);
    expect(clipBeamAtShield(100, -300, 0, 1, 2600, shield)).toBe(2600);
    expect(clipBeamAtShield(0, -32, 0, 1, 2600, shield)).toBe(2600);
    expect(clipBeamAtShield(0, -300, 0, 1, 100, shield)).toBe(100); // 届かない
    expect(clipBeamAtShield(0, -300, 0, 1, 2600, null)).toBe(2600);
  });

  it('clipBeamEnd: 丸い先端なら終点を半幅ぶん手前にする(光は盾の面より先へ届かない)', () => {
    // 起点(0,-300)→(0,2300)。盾の上辺は y=-40(= 260 進んだ所)。
    const plain = clipBeamEnd(0, -300, 0, 2300, shield, 0);
    expect(plain.clipped).toBe(true);
    expect(plain.y).toBeCloseTo(-40);
    const round = clipBeamEnd(0, -300, 0, 2300, shield, 34);
    expect(round.clipped).toBe(true);
    expect(round.y).toBeCloseTo(-40 - 34); // 先端の丸みが盾の面で終わる
    // 外れる/盾が無い/長さ0 は元のまま。
    expect(clipBeamEnd(300, -300, 0, 2300, shield, 34)).toEqual({ x: 0, y: 2300, clipped: false });
    expect(clipBeamEnd(0, -300, 0, 2300, null, 34)).toEqual({ x: 0, y: 2300, clipped: false });
    expect(clipBeamEnd(0, -300, 0, -300, shield, 34).clipped).toBe(false);
  });
  it('clipBeamEnd: 丸い先端が盾に触れるだけ(中心線は届かない)でも切る / 起点が盾に近すぎたら起点まで', () => {
    // 中心線の終点は盾の手前 10px(y=-50)。半幅34の丸い先端は盾に食い込む=切る。
    const r = clipBeamEnd(0, -300, 0, -50, shield, 34);
    expect(r.clipped).toBe(true);
    expect(r.y).toBeCloseTo(-40 - 34);
    // 起点から盾までが半幅より近い: 終点は起点より手前へ戻らない。
    const near = clipBeamEnd(0, -60, 0, 2300, shield, 34);
    expect(near.clipped).toBe(true);
    expect(near.y).toBeCloseTo(-60);
  });
  it('clipSweepBeam: 中心から懐を空けて伸びる掃射。切れた先を返し、懐の中で塞がれたら blocked', () => {
    // 中心(0,-300)から下向き(angle=π/2)、懐 100・長さ2000・半幅 30。盾の上辺は 260 進んだ所。
    const cut = clipSweepBeam(0, -300, Math.PI / 2, 100, 2000, 30, shield);
    expect(cut.clipped).toBe(true);
    expect(cut.blocked).toBe(false);
    expect(Math.hypot(cut.farX - 0, cut.farY - -300)).toBeCloseTo(260 - 30);
    expect(cut.nearY).toBeCloseTo(-200);
    // 盾が懐(100)の内側にある: 丸ごと塞がれる。
    const blocked = clipSweepBeam(0, -100, Math.PI / 2, 100, 2000, 30, shield);
    expect(blocked.blocked).toBe(true);
    // 盾が無ければ切らない。
    expect(clipSweepBeam(0, -300, Math.PI / 2, 100, 2000, 30, null).clipped).toBe(false);
  });
  it('blastBlockedByShield: 円=影+40px / 扇=要から / 帯=起点から(距離なし) / 長さ0の帯=円 / 光線=false(終点を切る側の仕事)', () => {
    const near = playerAt(0, -24 + 14 + SHIELD_AREA_GUARD_PX);
    const far = playerAt(0, 400);
    expect(blastBlockedByShield({ x: 0, y: -300 }, near, shield)).toBe(true);
    expect(blastBlockedByShield({ x: 0, y: -300 }, far, shield)).toBe(false);          // 円は 40px の外
    expect(blastBlockedByShield({ x: 0, y: 0, fan: { cx: 0, cy: -300 } }, near, shield)).toBe(true);
    const band = { x: 0, y: 0, capsule: { fx: -150, fy: 400, tx: 150, ty: 400, halfWidth: 20 } };
    expect(blastBlockedByShield({ ...band, origin: { x: 0, y: -300 } }, far, shield)).toBe(true);   // 帯は距離なし
    expect(blastBlockedByShield({ ...band, origin: { x: 300, y: -300 } }, far, shield)).toBe(false); // 横なら影ではない
    expect(blastBlockedByShield(band, far, shield)).toBe(false);                        // origin 無し=始点(-150,400)=プレイヤーと同じ高さで影ではない
    const zero = { x: 0, y: -300, capsule: { fx: 0, fy: -300, tx: 0, ty: -300, halfWidth: 20 } };
    expect(blastBlockedByShield(zero, far, shield)).toBe(false);                        // 長さ0の帯は円=40px の外
    expect(blastBlockedByShield(zero, near, shield)).toBe(true);
    expect(blastBlockedByShield({ ...band, beam: true, origin: { x: 0, y: -300 } }, far, shield)).toBe(false);
    expect(blastBlockedByShield({ x: 0, y: -300 }, near, null)).toBe(false);
  });
});

// 光線の幅 × 盾の影(research/SHIELD_BLOCK.md §8): 影は盾の幅だけ。太い光線の縁は盾の脇を通り抜ける。
describe('splitBeamAtShield / beamStripsHit / shieldContactPoint', () => {
  // 光線は (0,-300) から真下へ。盾は x:-29..29, y:-40..-24(幅58)。
  const down = (hw: number, sh: typeof shield | null = shield) => splitBeamAtShield(0, -300, 0, 2300, hw, sh, true);
  it('光線が盾より太い: 中央の帯は盾の面で止まり、両縁の帯は全長のまま(3本)', () => {
    const sp = down(34)!;
    expect(sp.strips).toHaveLength(3);
    expect(sp.centerStopped).toBe(true);
    expect(sp.coverPx).toBeCloseTo(58);
    const stopped = sp.strips[0];
    expect(stopped.halfWidth).toBeCloseTo(29);
    expect(stopped.ty).toBeCloseTo(-40 - 29); // 先端が伸びる形なので自分の半幅ぶん手前
    for (const side of sp.strips.slice(1)) {
      expect(side.halfWidth).toBeCloseTo(2.5);
      expect(Math.abs(side.tx)).toBeCloseTo(31.5);
      expect(side.ty).toBeGreaterThan(2300); // 全長以上(先端の延長ぶん)
    }
    expect(sp.contact.y).toBeCloseTo(-40);
    expect(Math.abs(sp.contact.sx)).toBeCloseTo(1);
  });
  it('身体が丸ごと影の中(盾の向こう)なら当たらない / 縁にはみ出せば当たる / 盾の手前なら当たる', () => {
    const strips = down(34)!.strips;
    expect(beamStripsHit(strips, 0, 0, 14, true)).toBe(false);   // 影の真ん中・盾の向こう
    expect(beamStripsHit(strips, 20, 0, 14, true)).toBe(true);   // 身体が影(±29)の外へ 5px はみ出す
    expect(beamStripsHit(strips, 0, -150, 14, true)).toBe(true); // 盾の手前(光線の元側)
    expect(beamStripsHit(strips, 100, 0, 14, true)).toBe(false); // そもそも光線の外
  });
  it('光線が盾より細い(影に丸ごと収まる)なら1本=従来どおり丸ごと止まる', () => {
    const sp = down(20)!;
    expect(sp.strips).toHaveLength(1);
    expect(sp.strips[0].halfWidth).toBeCloseTo(20);
    expect(sp.strips[0].ty).toBeCloseTo(-40 - 20);
    expect(beamStripsHit(sp.strips, 15, 0, 14, true)).toBe(false); // 影の内側
  });
  it('割らない: 盾が無い / 起点が盾の中 / 影が光線に掛からない / 盾の面が光線の届く先より遠い', () => {
    expect(down(34, null)).toBeNull();
    expect(splitBeamAtShield(0, -30, 0, 2300, 34, shield, true)).toBeNull();
    expect(splitBeamAtShield(300, -300, 300, 2300, 34, shield, true)).toBeNull();
    expect(splitBeamAtShield(0, -300, 0, -200, 10, shield, true)).toBeNull();
  });
  it('影が光線の片側の縁だけに掛かる: 中心線は止まらず、掛かった幅だけ止まる', () => {
    // 盾を右へずらす(x:20..78)。光線 ±34 のうち影は 20..34 の14px。
    const right = { x: 20, y: -40, width: 58, height: 16 };
    const sp = splitBeamAtShield(0, -300, 0, 2300, 34, right, true)!;
    expect(sp.centerStopped).toBe(false);
    expect(sp.coverPx).toBeCloseTo(14);
    expect(beamStripsHit(sp.strips, 0, 0, 14, true)).toBe(true); // 中心線は止まらない=盾の向こうでも当たる
  });
  it('丸くない(tipExt=false)なら止まる帯の終点は盾の面そのもの', () => {
    const sp = splitBeamAtShield(0, -300, 0, 2300, 34, shield, false)!;
    expect(sp.strips[0].ty).toBeCloseTo(-40);
  });
  it('懐(startOffset): 懐の中で止まった中央の帯は無し。縁の帯は残る', () => {
    // 起点 (0,-300) から懐 300 まで光らない。盾の面は 260 進んだ所 = 懐の中。
    const sp = splitBeamAtShield(0, -300, 0, 2300, 34, shield, true, 300)!;
    expect(sp.strips).toHaveLength(2);
    expect(sp.strips.every(p => p.halfWidth < 5)).toBe(true);
    const thin = splitBeamAtShield(0, -300, 0, 2300, 20, shield, true, 300)!;
    expect(thin.strips).toHaveLength(0); // 影に丸ごと収まる細さ=丸ごと塞がれる
  });
  it('shieldContactPoint: 攻撃源→相手の線分が盾に入る点と、攻撃の向き', () => {
    const cp = shieldContactPoint(0, -300, 0, 0, shield);
    expect(cp.x).toBeCloseTo(0);
    expect(cp.y).toBeCloseTo(-40);
    expect(cp.dy).toBeCloseTo(1);
    const miss = shieldContactPoint(200, -300, 200, 0, shield); // 当たらない=盾の中心
    expect(miss.x).toBeCloseTo(0);
    expect(miss.y).toBeCloseTo(-32);
  });
});

describe('光線の絵の計画 beamDrawPlan(第2回クリエイティブ監査 #1・判定は不変)', () => {
  it('判定の割り(splitBeamAtShield)が null の時は null=元の1本をそのまま描く', () => {
    expect(beamDrawPlan(0, -300, 0, 300, 30, null, true)).toBeNull();
    expect(beamDrawPlan(300, -300, 300, 300, 30, shield, true)).toBeNull(); // 影が掛からない
    expect(beamDrawPlan(0, -300, 0, -200, 30, shield, true)).toBeNull();    // 盾の面が先端より遠い
  });
  it('盾の影の横の範囲は盾そのものの広がり(光線の太さで切らない)・中心線は盾の面で止まる', () => {
    const plan = beamDrawPlan(0, -300, 0, 300, 30, shield, false)!;
    expect(plan).not.toBeNull();
    // 起点 (0,-300)→下向き(u=(0,1))。n=(-1,0)。盾の x は -29..29 → 横は -29..29。
    expect(Math.min(plan.s0, plan.s1)).toBeCloseTo(-29);
    expect(Math.max(plan.s0, plan.s1)).toBeCloseTo(29);
    // 盾の面(上辺 y=-40)は起点から 260 の所。
    expect(plan.centerEnd).toBeCloseTo(260);
    expect(plan.faceAt(0, 600)).toBeCloseTo(260);
    // 影の外の横位置は盾に当たらない=終点まで。
    expect(plan.faceAt(plan.s1 > 0 ? -40 : 40, 600)).toBeCloseTo(600);
  });
  it('判定の strips と同じ割り(絵と判定が同じ splitBeamAtShield を読む)', () => {
    const plan = beamDrawPlan(0, -300, 0, 300, 20, shield, true)!;
    expect(plan.split).toEqual(splitBeamAtShield(0, -300, 0, 300, 20, shield, true));
    expect(plan.split.strips).toHaveLength(1); // 太さ20 < 盾の幅 → 止まる中央の帯1本だけ(縁は無い)
  });
});
