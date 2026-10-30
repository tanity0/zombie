import { describe, it, expect } from 'vitest';
import {
  wraithOrbitPoint, wraithOrbitAngle, wraithOrbitTarget, wraithOppositePoint, wraithWarpState, wraithScreamFrame, wraithScreamBodyH,
  wraithFloatFrame, wraithLiftPx, WRAITH_ORBIT_RX, WRAITH_ORBIT_RY, WRAITH_WARP_FADE_MS, WRAITH_SCREAM_FRAMES, WRAITH_SCREAM_FRAME_MS,
  WRAITH_SCREAM_WINDUP_MS, WRAITH_SCREAM_BODY_PX, WRAITH_FLOAT_FRAME_H, WRAITH_FLOAT_BODY_PX, WRAITH_FLOAT_FRAMES, WRAITH_FLOAT_ALIGN_X,
  WRAITH_SCREAM_ALIGN_X, WRAITH_LIFT_PX, WRAITH_DRIFT_PX, WRAITH_SCREAM_RADIUS,
} from './wraithScript';

describe('亡霊: 周回の楕円(§8 A2)', () => {
  it('楕円の上の点は角度を測り直すと同じ角度に戻る', () => {
    for (let a = -3; a <= 3; a += 0.37) {
      const p = wraithOrbitPoint(100, 50, a);
      const b = wraithOrbitAngle(100, 50, p.x, p.y);
      expect(Math.cos(b)).toBeCloseTo(Math.cos(a));
      expect(Math.sin(b)).toBeCloseTo(Math.sin(a));
    }
  });
  it('スマホの画面(論理幅405)に左右とも収まり、上は地平線のフェード(約230px上)にかからない', () => {
    expect(WRAITH_ORBIT_RX).toBeLessThan(405 / 2);
    expect(WRAITH_ORBIT_RY).toBeLessThan(230 - 100); // 絵の背丈ぶんの余白
  });
  it('回る向きの先へ進む(+1=角度が増える向き)', () => {
    const p = wraithOrbitPoint(0, 0, 0);
    const q = wraithOrbitTarget(0, 0, p.x, p.y, 1, 16);
    expect(wraithOrbitAngle(0, 0, q.x, q.y)).toBeGreaterThan(0);
    const r = wraithOrbitTarget(0, 0, p.x, p.y, -1, 16);
    expect(wraithOrbitAngle(0, 0, r.x, r.y)).toBeLessThan(0);
  });
  it('反対側の点は相手を挟んだ向こう側', () => {
    const p = wraithOrbitPoint(0, 0, 0.7);
    const o = wraithOppositePoint(0, 0, p.x, p.y);
    expect(o.x).toBeCloseTo(-p.x);
    expect(o.y).toBeCloseTo(-p.y);
  });
  it('叫びの半径は楕円の一番近い所(縦)より外まで届く=周回の輪に居ると当たる', () => {
    expect(WRAITH_SCREAM_RADIUS).toBeGreaterThan(WRAITH_ORBIT_RY);
  });
});

describe('亡霊: ワープ(パッと消えない・消えている間は当たらない)', () => {
  it('消える→体を移す→現れる、の順で、計500msは当たらない', () => {
    expect(wraithWarpState(100, undefined)).toMatchObject({ alpha: 1, phased: false, done: true });
    const a = wraithWarpState(100, 100);
    expect(a.phased).toBe(true); expect(a.moveNow).toBe(false); expect(a.alpha).toBeCloseTo(1);
    const b = wraithWarpState(100 + WRAITH_WARP_FADE_MS / 2, 100);
    expect(b.alpha).toBeCloseTo(0.5); expect(b.phased).toBe(true);
    const c = wraithWarpState(100 + WRAITH_WARP_FADE_MS, 100);
    expect(c.moveNow).toBe(true); expect(c.alpha).toBeCloseTo(0); expect(c.phased).toBe(true);
    const d = wraithWarpState(100 + WRAITH_WARP_FADE_MS * 2 - 1, 100);
    expect(d.phased).toBe(true); expect(d.alpha).toBeGreaterThan(0.99);
    expect(wraithWarpState(100 + WRAITH_WARP_FADE_MS * 2, 100)).toMatchObject({ phased: false, done: true, alpha: 1 });
  });
});

describe('亡霊: 叫び(§4)', () => {
  it('溜め=16コマ。最後のコマが終わる瞬間が当たる時刻', () => {
    expect(WRAITH_SCREAM_WINDUP_MS).toBe(WRAITH_SCREAM_FRAMES * WRAITH_SCREAM_FRAME_MS);
    expect(wraithScreamFrame(0)).toBe(0);
    expect(wraithScreamFrame(WRAITH_SCREAM_WINDUP_MS - 1)).toBe(WRAITH_SCREAM_FRAMES - 1);
    expect(wraithScreamFrame(WRAITH_SCREAM_WINDUP_MS + 300)).toBe(WRAITH_SCREAM_FRAMES - 1);
  });
  it('どのコマも浮遊の立ち絵と同じ背丈へ揃える(シートのズームを打ち消す)', () => {
    for (let f = 0; f < WRAITH_SCREAM_FRAMES; f++) {
      // bodyH / 枠の高さ152 = 本体 / 浮遊の本体150 の比で渡す=描いた本体の高さがどのコマも同じ
      expect(wraithScreamBodyH(f) / WRAITH_FLOAT_FRAME_H).toBeCloseTo(WRAITH_SCREAM_BODY_PX[f] / WRAITH_FLOAT_BODY_PX);
    }
    expect(WRAITH_SCREAM_BODY_PX).toHaveLength(WRAITH_SCREAM_FRAMES);
    expect(WRAITH_SCREAM_ALIGN_X).toHaveLength(WRAITH_SCREAM_FRAMES);
    expect(WRAITH_FLOAT_ALIGN_X).toHaveLength(WRAITH_FLOAT_FRAMES);
  });
});

describe('亡霊: 浮き', () => {
  it('いつも持ち上がっていて、漂いは±3px以内', () => {
    for (let t = 0; t < 10000; t += 37) {
      const v = wraithLiftPx(t, 123);
      expect(v).toBeGreaterThanOrEqual(WRAITH_LIFT_PX - WRAITH_DRIFT_PX - 1e-9);
      expect(v).toBeLessThanOrEqual(WRAITH_LIFT_PX + WRAITH_DRIFT_PX + 1e-9);
    }
  });
  it('浮遊のコマは16コマを順に回る', () => {
    const seen = new Set<number>();
    for (let t = 0; t < 3000; t += 10) seen.add(wraithFloatFrame(t, 0));
    expect(seen.size).toBe(WRAITH_FLOAT_FRAMES);
  });
});

import { wraithGrowthStep, wraithGraveSolids, wraithGrowthRise, isWraithGrave, WRAITH_GROWTH_CAP, WRAITH_GROWTH_AVOID_PLAYER_PX, WRAITH_GROWTH_GROW_MS, WRAITH_GROWTH_SINK_MS, WRAITH_GROWTH_NEAR_PX } from './wraithScript';

describe('亡霊: 近づくと地面から生えてくる物(§9)', () => {
  const view = { left: -200, right: 200, top: -400, bottom: 400 };
  const ok = () => true;
  const rng0 = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const run = (wraith: { x: number; y: number } | null, ms: number, seed = 3) => {
    const st = { nextAt: 0, seq: 0, lastSinkAt: -1e9 }, rng = rng0(seed);
    let p: ReturnType<typeof wraithGrowthStep> = [];
    let born = 0;
    for (let t = 0; t <= ms; t += 16) { const q = wraithGrowthStep(p, wraith, { x: 0, y: 0 }, view, ok, t, rng, st); born += q.filter(a => !p.some(b => b.id === a.id)).length; p = q; }
    return { p, born };
  };
  it('亡霊から遠いと生えない・近いほど沢山生える', () => {
    expect(run({ x: WRAITH_GROWTH_NEAR_PX + 50, y: 0 }, 10000).born).toBe(0);
    const far = run({ x: 1100, y: 0 }, 10000).born, near = run({ x: 150, y: 0 }, 10000).born;
    expect(near).toBeGreaterThan(far * 2);
  });
  it('プレイヤーの足元には生やさない・上限を超えると古い物から沈む', () => {
    const { p } = run({ x: 150, y: 0 }, 60000);
    for (const g of p) expect(Math.hypot(g.x, g.y)).toBeGreaterThanOrEqual(WRAITH_GROWTH_AVOID_PLAYER_PX);
    expect(p.filter(g => g.sinkAt === undefined).length).toBeLessThanOrEqual(WRAITH_GROWTH_CAP);
  });
  it('墓石が壁になるのは伸び切ってから。沈み始めたら壁ではない', () => {
    const g = { id: 'a', x: 0, y: 0, variant: 0, scale: 1.4, flip: false, bornAt: 0 };
    expect(isWraithGrave(0)).toBe(true); expect(isWraithGrave(5)).toBe(false);
    expect(wraithGraveSolids([g], WRAITH_GROWTH_GROW_MS * 0.5)).toHaveLength(0);
    expect(wraithGraveSolids([g], WRAITH_GROWTH_GROW_MS)).toHaveLength(1);
    expect(wraithGraveSolids([{ ...g, sinkAt: 2000 }], 2001)).toHaveLength(0);
    expect(wraithGraveSolids([{ ...g, variant: 6 }], 5000)).toHaveLength(0); // 花は壁ではない
  });
  it('伸びは0から始まって1で止まり、沈むと0へ戻る(パッと出ない・パッと消えない)', () => {
    const g = { bornAt: 1000 };
    expect(wraithGrowthRise(1000, g)).toBeCloseTo(0);
    expect(wraithGrowthRise(1000 + WRAITH_GROWTH_GROW_MS, g)).toBe(1);
    expect(wraithGrowthRise(1000 + WRAITH_GROWTH_GROW_MS * 3, { ...g, sinkAt: 1000 + WRAITH_GROWTH_GROW_MS * 3 })).toBeCloseTo(1);
    expect(wraithGrowthRise(1000 + WRAITH_GROWTH_GROW_MS * 3 + WRAITH_GROWTH_SINK_MS, { ...g, sinkAt: 1000 + WRAITH_GROWTH_GROW_MS * 3 })).toBeCloseTo(0);
  });
  it('亡霊が居なくなったら新しく生えず、残りは古い順に沈む', () => {
    const st = { nextAt: 0, seq: 0, lastSinkAt: -1e9 }, rng = rng0(9);
    let p: ReturnType<typeof wraithGrowthStep> = [];
    for (let t = 0; t <= 8000; t += 16) p = wraithGrowthStep(p, { x: 150, y: 0 }, { x: 0, y: 0 }, view, ok, t, rng, st);
    const n0 = p.length;
    expect(n0).toBeGreaterThan(3);
    for (let t = 8016; t <= 30000; t += 16) p = wraithGrowthStep(p, null, { x: 0, y: 0 }, view, ok, t, rng, st);
    expect(p).toHaveLength(0);
  });
});

import { pickRunMutantBoss, RUN_MUTANT_BOSS_CHANCE } from './wraithScript';
describe('宇宙飛行群と亡霊の出現(1ランにどちらか1体だけ・20%)', () => {
  it('2割のランでどちらか1体・残りは出ない。出る時は半々', () => {
    let seed = 1;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const n = { astro: 0, wraith: 0, none: 0 };
    for (let i = 0; i < 20000; i++) n[pickRunMutantBoss(rng)]++;
    expect((n.astro + n.wraith) / 20000).toBeCloseTo(RUN_MUTANT_BOSS_CHANCE, 1);
    expect(n.astro / (n.astro + n.wraith)).toBeGreaterThan(0.45);
    expect(n.astro / (n.astro + n.wraith)).toBeLessThan(0.55);
  });
});

import {
  wraithPointFrame, pickWraithSkill, wraithFlingLandings, pickWraithCurseGraves, wraithCurseLiftAt, WRAITH_POINT_RAISE_MS, WRAITH_POINT_LOWER_MS,
  WRAITH_POINT_FRAMES, WRAITH_POINT_ALIGN_X, WRAITH_FLING_RING_PX, WRAITH_CURSE_MAX, WRAITH_CURSE_GAP_MS, WRAITH_CURSE_MIN_PLAYER_PX, WRAITH_GROWTH_GROW_MS as GROW,
} from './wraithScript';
describe('亡霊: 指差しの技(§11)', () => {
  it('腕は0→3で上がり、指している間は3〜7を往復し、下ろすと3→0', () => {
    expect(wraithPointFrame(0)).toBe(0);
    expect(wraithPointFrame(WRAITH_POINT_RAISE_MS - 1)).toBe(3);
    const hold = new Set<number>();
    for (let t = WRAITH_POINT_RAISE_MS; t < WRAITH_POINT_RAISE_MS + 3000; t += 20) hold.add(wraithPointFrame(t));
    expect([...hold].sort()).toEqual([3, 4, 5, 6, 7]);
    expect(wraithPointFrame(5000, 0)).toBe(3);
    expect(wraithPointFrame(5000, WRAITH_POINT_LOWER_MS)).toBe(0);
    // 上げている途中で止めたら、そのコマから下ろす(伸び切りのコマへ跳ばない)
    expect(wraithPointFrame(5000, 0, 1)).toBe(1);
    expect(wraithPointFrame(5000, 90, 1)).toBe(0);
    expect(WRAITH_POINT_ALIGN_X).toHaveLength(WRAITH_POINT_FRAMES);
  });
  it('同じ技は、他に使える技がある時は続けない。使えない技は選ばない', () => {
    for (let i = 0; i < 50; i++) {
      const r = () => i / 50;
      expect(pickWraithSkill({ fling: true, curse: true }, 'curse', r)).not.toBe('curse');
      expect(pickWraithSkill({ fling: false, curse: false }, 'scream', r)).toBe('scream');
      expect(['scream', 'curse']).toContain(pickWraithSkill({ fling: false, curse: true }, null, r));
    }
  });
  it('吹き飛ばした雑魚はプレイヤーを囲む輪の上に等間隔で降りる', () => {
    const mobs = [{ x: 300, y: 10 }, { x: -280, y: 40 }, { x: 20, y: -300 }, { x: 10, y: 320 }];
    const l = wraithFlingLandings(mobs, 0, 0);
    for (const p of l) expect(Math.hypot(p.x, p.y)).toBeCloseTo(WRAITH_FLING_RING_PX);
    const ang = l.map(p => Math.atan2(p.y, p.x)).sort((a, b) => a - b);
    for (let i = 1; i < ang.length; i++) expect(ang[i] - ang[i - 1]).toBeCloseTo(Math.PI / 2);
    // それぞれ来た側へ降りる(右から来た物は右・左から来た物は左)
    expect(l[0].x).toBeGreaterThan(0); expect(l[1].x).toBeLessThan(0);
  });
  it('呪い: 1秒に1つ・最大5つ。生え切った墓石だけ・プレイヤーに近すぎる物と花は使わない', () => {
    expect(wraithCurseLiftAt(1) - wraithCurseLiftAt(0)).toBe(WRAITH_CURSE_GAP_MS);
    expect(wraithCurseLiftAt(0)).toBe(WRAITH_POINT_RAISE_MS);
    const base = { scale: 1.4, flip: false, bornAt: 0 };
    const pieces = [...Array(8).keys()].map(i => ({ ...base, id: `g${i}`, x: 200 + i * 20, y: 0, variant: i % 4 }));
    pieces.push({ ...base, id: 'flower', x: 205, y: 0, variant: 5 });
    pieces.push({ ...base, id: 'young', x: 201, y: 0, variant: 0, bornAt: 10000 });
    pieces.push({ ...base, id: 'near', x: WRAITH_CURSE_MIN_PLAYER_PX - 10, y: 0, variant: 0 });
    const got = pickWraithCurseGraves(pieces, { x: 200, y: 0 }, { x: 0, y: 0 }, GROW + 1, () => true);
    expect(got).toHaveLength(WRAITH_CURSE_MAX);
    expect(got.map(g => g.id)).toEqual(['g0', 'g1', 'g2', 'g3', 'g4']);
  });
});

import { wraithBattleActive, WRAITH_BATTLE_RANGE_PX } from './wraithScript';
describe('亡霊と戦っている間(§12)', () => {
  const pl = { x: 0, y: 0, width: 20, height: 20, health: 100 };
  const w = { type: 'mutant-wraith' as const, health: 100, corpseUntil: undefined, libAlerted: true, x: 100, y: 0, width: 60, height: 50 };
  it('気づいていて近くに居る間だけ。倒れた・見失った・遠い・プレイヤーが倒れたら終わる', () => {
    expect(wraithBattleActive([w], pl)).toBe(true);
    expect(wraithBattleActive([{ ...w, libAlerted: false }], pl)).toBe(false);
    expect(wraithBattleActive([{ ...w, corpseUntil: 5000 }], pl)).toBe(false);
    expect(wraithBattleActive([{ ...w, health: 0 }], pl)).toBe(false);
    expect(wraithBattleActive([{ ...w, x: WRAITH_BATTLE_RANGE_PX + 100 }], pl)).toBe(false);
    expect(wraithBattleActive([w], { ...pl, health: 0 })).toBe(false);
  });
});

import { wraithAudioMix, WRAITH_AUDIO_FAR_PX, WRAITH_AUDIO_NEAR_PX } from './wraithScript';
describe('亡霊に近づいた時の音の混ざり具合(§12-3・花と同じ距離感)', () => {
  const pl = { x: 0, y: 0, width: 20, height: 20, health: 100 };
  const w = (dx: number) => ({ type: 'mutant-wraith' as const, health: 100, corpseUntil: undefined, x: 10 + dx - 30, y: 20 - 50, width: 60, height: 50 });
  it('遠いと0・近づくほど増え・すぐそばで1。花が生え始める距離から入り始める', () => {
    expect(wraithAudioMix([w(WRAITH_AUDIO_FAR_PX + 10)], pl)).toBe(0);
    const a = wraithAudioMix([w(900)], pl), b = wraithAudioMix([w(500)], pl);
    expect(a).toBeGreaterThan(0); expect(b).toBeGreaterThan(a);
    expect(wraithAudioMix([w(WRAITH_AUDIO_NEAR_PX - 10)], pl)).toBe(1);
  });
  it('倒れた亡霊・プレイヤーが倒れた時は0', () => {
    expect(wraithAudioMix([{ ...w(100), corpseUntil: 9 }], pl)).toBe(0);
    expect(wraithAudioMix([w(100)], { ...pl, health: 0 })).toBe(0);
  });
});
