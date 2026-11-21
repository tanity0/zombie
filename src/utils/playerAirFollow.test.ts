import { describe, it, expect, beforeEach } from 'vitest';
import {
  stepPlayerAir, playerAirTargetPx, playerAirLaunchSpeed, playerAirPhase, playerAirBumpPx, playerAirPoseTarget,
  playerAirLandStrength, playerAirLandDepth, playerAirLandSquashY, playerAirShadowShrink,
  noteAirMeleeHit, getLastAirMeleeHit, resetAirMeleeHit, playerKickJump, playerKickJumpShape, PLAYER_KICK_HOLD_MS, PLAYER_KICK_RECOIL_PX, playerKickLandPx, playerKickLandSpeed, PLAYER_KICK_LAND_FRAC,
  PLAYER_AIR_HOVER_MS, PLAYER_AIR_LAND_MS, PLAYER_AIR_FOLLOW_K, PLAYER_AIR_BODY_CAP, PLAYER_AIR_CROUCH_MS, PLAYER_AIR_GRAVITY,
  playerAirShiftTarget, playerAirShiftStep, groundDustGate, PLAYER_AIR_SHIFT_BODY_W, PLAYER_AIR_DUST_HOLD_PX, PLAYER_AIR_DUST_PENDING_MAX_MS, type GroundDustGate,
  PLAYER_AIR_BUMP_PX, PLAYER_AIR_LAND_SQUASH_MIN, PLAYER_AIR_LAND_SQUASH_MAX, PLAYER_AIR_HOVER_SINK, PLAYER_AIR_POSE, type PlayerAirState,
} from './playerAirFollow';

/** hitAt を起点に、now を 10ms ずつ進める。target は followMs の間だけ渡す(それ以降は null)。 */
const run = (s0: PlayerAirState, o: { hitAt: number | null; target: number | null; t0: number; ms: number }) => {
  let s = s0; const hs: number[] = [s.h]; const vs: number[] = [s.vy]; let landAt = -1; let landSpeed: number | null = null; let takeoffAt = -1;
  for (let t = 0; t < o.ms; t += 10) {
    const now = o.t0 + t + 10;
    const r = stepPlayerAir(s, { now, dtMs: 10, targetPx: o.target, hitAt: o.hitAt });
    s = r.state; hs.push(s.h); vs.push(s.vy);
    if (r.takeoff && takeoffAt < 0) takeoffAt = t + 10;
    if (r.landSpeed !== null && landAt < 0) { landAt = t + 10; landSpeed = r.landSpeed; }
  }
  return { s, hs, vs, landAt, landSpeed, takeoffAt };
};
const G0: PlayerAirState = { h: 0, vy: 0 };

describe('高さの目標', () => {
  it('敵の高さの0.9倍・上限はプレイヤーの体の高さ×1.3・負や0は0', () => {
    expect(playerAirTargetPx(1, 50, 100)).toBeCloseTo(50 * PLAYER_AIR_FOLLOW_K, 6);
    expect(playerAirTargetPx(5, 50, 60)).toBeCloseTo(60 * PLAYER_AIR_BODY_CAP, 6);
    expect(playerAirTargetPx(0, 50, 60)).toBe(0);
    expect(playerAirTargetPx(-1, 50, 60)).toBe(0);
  });
});

describe('飛び立ち・上り(放物線)', () => {
  it('地上からは 40ms 沈んでから飛ぶ(沈みの間は地面のまま・合図は1回)', () => {
    const r = run(G0, { hitAt: 1000, target: 40, t0: 1000, ms: 300 });
    expect(r.takeoffAt).toBe(10);
    const crouchSteps = Math.round(PLAYER_AIR_CROUCH_MS / 10);
    for (let i = 0; i < crouchSteps - 1; i++) expect(r.hs[i]).toBe(0);
    expect(playerAirPhase({ h: 0, vy: 0, crouchUntil: 1040 }, 1020)).toBe('crouch');
  });
  it('初速 v0=√(2gh) で上り、重力で減速して目標の高さで速さ0(頂点)に着く・行き過ぎない', () => {
    const r = run(G0, { hitAt: 1000, target: 40, t0: 1000, ms: 600 });
    expect(playerAirLaunchSpeed(40)).toBeCloseTo(Math.sqrt(2 * PLAYER_AIR_GRAVITY * 40), 9);
    const apex = Math.max(...r.hs.slice(0, 40));
    expect(apex).toBeGreaterThan(36); expect(apex).toBeLessThan(41.5);
    // 上りの速さは単調に減る(減速して頂点で止まる)
    const up = r.vs.filter(v => v > 0);
    for (let i = 1; i < up.length; i++) expect(up[i]).toBeLessThan(up[i - 1] + 1e-9);
  });
});

describe('漂い・落下・着地', () => {
  it('漂い(最後の当たりから250ms)はゆっくり沈むだけ(0.04px/ms)・その後は重力で加速して落ち、着地で一度だけ速さが返る', () => {
    const top: PlayerAirState = { h: 40, vy: 0 };
    const hover = run(top, { hitAt: 1000, target: 5, t0: 1000, ms: PLAYER_AIR_HOVER_MS });
    expect(top.h - hover.s.h).toBeCloseTo(PLAYER_AIR_HOVER_SINK * PLAYER_AIR_HOVER_MS, 0);
    const fall = run({ h: 40, vy: 0 }, { hitAt: 1000, target: null, t0: 1000 + PLAYER_AIR_HOVER_MS + 1, ms: 600 });
    const d = fall.hs.slice(1).map((v, i) => fall.hs[i] - v).filter(v => v > 0);
    for (let i = 1; i < Math.min(d.length, 10); i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1] - 1e-9);
    expect(fall.landAt).toBeGreaterThan(120); expect(fall.landAt).toBeLessThan(260);
    expect(fall.landSpeed).toBeGreaterThan(0);
    expect(fall.hs[fall.hs.length - 1]).toBe(0);
  });
  it('落ちている途中で再び当たったら、その高さから途切れずに上がり直す', () => {
    const falling = run({ h: 40, vy: 0 }, { hitAt: 1000, target: null, t0: 1300, ms: 80 }).s;
    expect(falling.h).toBeLessThan(40); expect(falling.vy).toBeLessThan(0);
    const r = stepPlayerAir(falling, { now: 1400, dtMs: 10, targetPx: 40, hitAt: 1400 });
    expect(r.state.vy).toBeGreaterThan(0);
    expect(r.state.h).toBeGreaterThanOrEqual(falling.h - 0.01); // カクンと落ちない
    expect(r.state.h - falling.h).toBeLessThan(10);
    expect(r.landSpeed).toBeNull();
  });
  it('ヒットストップ中(now < hitAt)は動かさない。明けた時刻から上がる', () => {
    const r = stepPlayerAir(G0, { now: 1000, dtMs: 10, targetPx: 40, hitAt: 1100 });
    expect(r.state).toEqual(G0); expect(r.takeoff).toBe(false);
    const r2 = stepPlayerAir(G0, { now: 1100, dtMs: 10, targetPx: 40, hitAt: 1100 });
    expect(r2.takeoff).toBe(true);
  });
  it('地上で記録が無ければ動かない', () => {
    expect(stepPlayerAir(G0, { now: 5000, dtMs: 10, targetPx: null, hitAt: null }).state.h).toBe(0);
  });
  it('目標が今より低ければ追って下がらない(漂うだけ)', () => {
    const r = stepPlayerAir({ h: 40, vy: 0 }, { now: 1100, dtMs: 10, targetPx: 10, hitAt: 1000 });
    expect(r.state.vy).toBe(0); expect(r.state.h).toBeGreaterThan(39);
  });
});

describe('飛び蹴りが空中の敵を追う時の跳び(§18-3・社長指示2026-11-11)', () => {
  const CAP = 56;
  it('どの蹴りも、当たる時刻(f=1)にちょうど敵の高さに居る・始まりは飛び出した高さ', () => {
    for (const n of [1, 2, 3]) for (const ground of [true, false]) {
      const sh = playerKickJumpShape(n, ground), h0 = ground ? 0 : 20;
      expect(playerKickJump(h0, 40, 0, sh, CAP).h).toBe(h0);
      expect(playerKickJump(h0, 40, 1, sh, CAP).h).toBeCloseTo(40, 5);
      expect(playerKickJump(h0, 40, 2, sh, CAP).h).toBeCloseTo(40, 5);  // 進みは 0..1 に収める
    }
  });
  it('蹴りごとに形が違う: 1発目は少し行き過ぎて降りながら当てる・2発目は行き過ぎなし・3発目は大きく跳び越えて蹴り下ろす', () => {
    const peak = (n: number, ground: boolean) => {
      const sh = playerKickJumpShape(n, ground); let top = 0, dirAtHit = 0;
      for (let f = 0; f <= 1.0001; f += 0.01) { const r = playerKickJump(ground ? 0 : 20, 40, f, sh, CAP); top = Math.max(top, r.h); dirAtHit = r.dir; }
      return { top, dirAtHit };
    };
    expect(peak(1, true).top).toBeCloseTo(40 * 1.08, 1);
    expect(peak(1, true).dirAtHit).toBe(-1);            // 降りながら当てる
    expect(peak(2, false).top).toBeCloseTo(40, 1);      // 行き過ぎなし
    expect(peak(2, false).dirAtHit).toBe(0);            // 頂点で届く
    expect(peak(3, true).top).toBeCloseTo(48, 1);       // ×1.2
    expect(peak(3, true).dirAtHit).toBe(-1);            // 蹴り下ろす
    // 行き過ぎは上限(体の高さ×1.3)まで。上限が敵の高さより低ければ行き過ぎない。
    expect(peak(3, true).top).toBeLessThanOrEqual(CAP);
    let top = 0; for (let f = 0; f <= 1.0001; f += 0.01) top = Math.max(top, playerKickJump(0, 50, f, playerKickJumpShape(3, true), 52).h);
    expect(top).toBeCloseTo(52, 1);
  });
  it('地面から跳ぶ時は、最初の12%は地面で沈む(膝を溜める)。空中から続けて跳ぶ時は沈まない', () => {
    const g = playerKickJumpShape(1, true), a = playerKickJumpShape(2, false);
    expect(playerKickJump(0, 40, 0.06, g, CAP)).toEqual({ h: 0, dir: 0, crouch: true });
    expect(playerKickJump(0, 40, 0.2, g, CAP).crouch).toBe(false);
    expect(playerKickJump(0, 40, 0.2, g, CAP).h).toBeGreaterThan(0);
    expect(playerKickJump(20, 40, 0.06, a, CAP).crouch).toBe(false);
  });
  it('上りは蹴り出しが一番速い(だんだん遅くなる)・蹴り下ろしは加速する。敵が低ければ同じ形で下りる', () => {
    const sh = playerKickJumpShape(3, false);
    const up = [0, 0.175, 0.35, 0.525, 0.7].map(f => playerKickJump(0, 40, f, sh, CAP).h);
    const du = up.slice(1).map((v, i) => v - up[i]);
    for (let i = 1; i < du.length; i++) expect(du[i]).toBeLessThan(du[i - 1]);
    const dn = [0.7, 0.8, 0.9, 1].map(f => playerKickJump(0, 40, f, sh, CAP).h);
    const dd = dn.slice(1).map((v, i) => dn[i] - v);
    for (let i = 1; i < dd.length; i++) expect(dd[i]).toBeGreaterThan(dd[i - 1]);
    expect(playerKickJump(30, 10, 0.5, playerKickJumpShape(2, false), CAP).h).toBeCloseTo(15, 5);
    expect(playerKickJump(30, 10, 0.5, playerKickJumpShape(3, false), CAP).dir).toBe(-1);
  });
  it('当たった後の止めは短い(60ms)・反動の浮きは小さい(6px)', () => {
    expect(PLAYER_KICK_HOLD_MS).toBe(60);
    expect(PLAYER_KICK_RECOIL_PX).toBe(6);
  });
  it('3発目の溜めの間は、前の蹴りの高さから加速しながら落ちて、溜めの7割で着地する(残りは地面で溜める)', () => {
    expect(PLAYER_KICK_LAND_FRAC).toBe(0.7);
    expect(playerKickLandPx(56, 0)).toBe(56);
    expect(playerKickLandPx(56, 1)).toBe(0);
    expect(playerKickLandPx(56, 1.4)).toBe(0);
    const hs = [0, 0.25, 0.5, 0.75, 1].map(u => playerKickLandPx(56, u));
    const d = hs.slice(1).map((v, i) => hs[i] - v);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1]); // だんだん速く落ちる
    expect(playerKickLandSpeed(56, 140)).toBeCloseTo(0.8, 5);                   // 着地の瞬間の速さ=2h/T
  });
  it('蹴りで当てた後は漂わない: ヒットストップが明けたらすぐ重力で落ちて着地する(追いかけ直さない)', () => {
    // 同じ条件で: 普通の近接は 250ms 漂う / 蹴り(noHover)はすぐ落ちる。
    const step = (noHover: boolean) => {
      let s: PlayerAirState = { h: 40, vy: 0 }; let landAt = -1; const hs: number[] = [];
      for (let t = 10; t <= 400; t += 10) {
        const r = stepPlayerAir(s, { now: 1000 + t, dtMs: 10, targetPx: 60, hitAt: 1000, noHover });
        s = r.state; hs.push(s.h);
        if (r.landSpeed !== null && landAt < 0) landAt = t;
      }
      return { landAt, hs };
    };
    const hover = step(false), kick = step(true);
    expect(hover.hs[5]).toBeGreaterThan(40);          // 追いかけて上がる(目標60)
    expect(kick.hs[5]).toBeLessThan(40);              // 上がらず落ち始めている
    expect(kick.landAt).toBeGreaterThan(150); expect(kick.landAt).toBeLessThan(220); // 40px は約180msで着地
    // ヒットストップ中(now < hitAt)は動かない
    const held = stepPlayerAir({ h: 40, vy: 0 }, { now: 990, dtMs: 10, targetPx: null, hitAt: 1000, noHover: true });
    expect(held.state.h).toBe(40);
  });
});

describe('当たりごとの跳ね・姿勢・着地・影', () => {
  it('跳ね: 80msで5pxへ ease-out・120msで戻る・前後は0', () => {
    expect(playerAirBumpPx(-1)).toBe(0);
    expect(playerAirBumpPx(80)).toBeCloseTo(PLAYER_AIR_BUMP_PX, 6);
    expect(playerAirBumpPx(40)).toBeGreaterThan(PLAYER_AIR_BUMP_PX * 0.7); // ease-out=早く上がる
    expect(playerAirBumpPx(140)).toBeLessThan(PLAYER_AIR_BUMP_PX * 0.6);
    expect(playerAirBumpPx(200)).toBe(0);
    expect(PLAYER_AIR_BUMP_PX).toBeGreaterThanOrEqual(4); expect(PLAYER_AIR_BUMP_PX).toBeLessThanOrEqual(6);
  });
  it('姿勢: 上り sqY1.10/sqX0.92・頂点 sqY0.94・落下 sqY1.06・沈み 0.9・地上 1', () => {
    expect(playerAirPoseTarget('rise')).toEqual({ sqY: 1.10, sqX: 0.92 });
    expect(playerAirPoseTarget('apex').sqY).toBe(0.94);
    expect(playerAirPoseTarget('fall').sqY).toBe(1.06);
    expect(playerAirPoseTarget('crouch').sqY).toBe(0.9);
    expect(playerAirPoseTarget('ground')).toEqual({ sqY: 1, sqX: 1 });
    expect(PLAYER_AIR_POSE.rise.sqY).toBe(1.10);
    expect(playerAirPhase({ h: 20, vy: 0.1 }, 0)).toBe('rise');
    expect(playerAirPhase({ h: 20, vy: 0 }, 0)).toBe('apex');
    expect(playerAirPhase({ h: 20, vy: -0.1 }, 0)).toBe('fall');
    expect(playerAirPhase({ h: 0, vy: 0 }, 0)).toBe('ground');
  });
  it('着地: 落下の速さで強さを振る(体の高さから=沈み0.22・低い落下=0.08)', () => {
    const bodyH = 40;
    const vBody = playerAirLaunchSpeed(bodyH);
    expect(playerAirLandStrength(vBody, bodyH)).toBe(1);
    expect(playerAirLandStrength(vBody * 3, bodyH)).toBe(1);
    expect(playerAirLandStrength(vBody * 0.2, bodyH)).toBeCloseTo(0.2, 6);
    expect(playerAirLandDepth(1)).toBeCloseTo(PLAYER_AIR_LAND_SQUASH_MAX, 9);
    expect(playerAirLandDepth(0)).toBeCloseTo(PLAYER_AIR_LAND_SQUASH_MIN, 9);
    expect(playerAirLandSquashY(-1, 0.22)).toBe(1);
    expect(playerAirLandSquashY(PLAYER_AIR_LAND_MS, 0.22)).toBe(1);
    const mid = playerAirLandSquashY(PLAYER_AIR_LAND_MS * 0.3, 0.22);
    expect(mid).toBeLessThan(1 - 0.22 * 0.8);
    expect(playerAirLandSquashY(PLAYER_AIR_LAND_MS * 0.3, 0.08)).toBeGreaterThan(mid);
    expect(playerAirLandSquashY(PLAYER_AIR_LAND_MS * 0.95, 0.22)).toBeGreaterThan(mid);
  });
  it('影: 縮みは0.75まで・高さ0で縮まない', () => {
    expect(playerAirShadowShrink(0)).toBe(1);
    expect(playerAirShadowShrink(1)).toBe(0.75);
    expect(playerAirShadowShrink(9)).toBe(0.75);
    expect(playerAirShadowShrink(0.5)).toBeCloseTo(0.875, 9);
  });
});

describe('最後に空中の敵へ当てた記録', () => {
  beforeEach(() => resetAirMeleeHit());
  it('浮いている敵にだけ記録し、地上の敵には記録しない', () => {
    noteAirMeleeHit({ id: 'g' }, 1000);
    expect(getLastAirMeleeHit()).toBeNull();
    noteAirMeleeHit({ id: 'a', brLiftUntil: 3000, brawlerLiftAt: 900, brLiftMs: 1000, brLiftPeak: 1 }, 1000);
    expect(getLastAirMeleeHit()?.enemyId).toBe('a');
    expect(getLastAirMeleeHit()?.at).toBe(1000);
    expect(getLastAirMeleeHit()!.rel).toBeGreaterThan(0);
  });
});

describe('浮いている間は敵の方へ寄る', () => {
  it('寄せの目標は浮いた高さに比例・体の高さで体幅×0.3・地上は0・向きの符号つき', () => {
    expect(playerAirShiftTarget(0, 40, 30, 1)).toBe(0);
    expect(playerAirShiftTarget(40, 40, 30, 1)).toBeCloseTo(PLAYER_AIR_SHIFT_BODY_W * 30, 9);
    expect(playerAirShiftTarget(20, 40, 30, -1)).toBeCloseTo(-PLAYER_AIR_SHIFT_BODY_W * 30 * 0.5, 9);
    expect(playerAirShiftTarget(400, 40, 30, 1)).toBeCloseTo(PLAYER_AIR_SHIFT_BODY_W * 30, 9); // 満額で頭打ち
  });
  it('寄せ・戻しは指数で寄る(行き過ぎず跳ばない・増分は減り続ける)', () => {
    let cur = 0; const hs: number[] = [];
    for (let i = 0; i < 20; i++) { cur = playerAirShiftStep(cur, 9, 10); hs.push(cur); }
    expect(Math.max(...hs)).toBeLessThanOrEqual(9);
    const d = hs.map((v, i) => v - (hs[i - 1] ?? 0));
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThan(d[i - 1] + 1e-9);
    let back = 9; for (let i = 0; i < 40; i++) back = playerAirShiftStep(back, 0, 10);
    expect(back).toBeGreaterThanOrEqual(0); expect(back).toBeLessThan(1);
  });
});

describe('地面の砂埃の保留(着地まで)', () => {
  const fresh: GroundDustGate = { wasActive: false };
  it('浮いていない時は今までどおり(eff=active・1msも変わらない)', () => {
    let g = fresh;
    for (const a of [false, true, true, false, true]) {
      const r = groundDustGate(g, a, 0, 1000); expect(r.eff).toBe(a); g = r.next;
    }
    expect(groundDustGate(fresh, true, PLAYER_AIR_DUST_HOLD_PX, 1000).eff).toBe(true); // しきい値ちょうどは浮いていない扱い
  });
  it('浮いている間に出る番が来たら保留し、着地した瞬間に1回だけ出す(窓が終わっていても出す)', () => {
    let r = groundDustGate(fresh, true, 30, 1000);
    expect(r.eff).toBe(false); expect(r.next.pendingAt).toBe(1000);
    r = groundDustGate(r.next, true, 25, 1050); expect(r.eff).toBe(false);
    r = groundDustGate(r.next, false, 12, 1100); expect(r.eff).toBe(false); // 窓が終わっても保留は残る
    r = groundDustGate(r.next, false, 0, 1300); // 着地
    expect(r.eff).toBe(true); expect(r.next.pendingAt).toBeUndefined();
    r = groundDustGate(r.next, false, 0, 1310); expect(r.eff).toBe(false); // 出すのは1回だけ
  });
  it('保留は寿命を過ぎたら出さずに捨てる(出撃の切り替え・リセットで残さない)', () => {
    let r = groundDustGate(fresh, true, 30, 1000);
    r = groundDustGate(r.next, false, 0, 1000 + PLAYER_AIR_DUST_PENDING_MAX_MS + 1);
    expect(r.eff).toBe(false); expect(r.next.pendingAt).toBeUndefined();
  });
});
