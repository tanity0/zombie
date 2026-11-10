import { describe, it, expect, beforeEach } from 'vitest';
import {
  stepPlayerAir, playerAirTargetPx, playerAirLaunchSpeed, playerAirPhase, playerAirBumpPx, playerAirPoseTarget,
  playerAirLandStrength, playerAirLandDepth, playerAirLandSquashY, playerAirShadowShrink,
  noteAirMeleeHit, getLastAirMeleeHit, resetAirMeleeHit,
  PLAYER_AIR_HOVER_MS, PLAYER_AIR_LAND_MS, PLAYER_AIR_FOLLOW_K, PLAYER_AIR_BODY_CAP, PLAYER_AIR_CROUCH_MS, PLAYER_AIR_GRAVITY,
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
