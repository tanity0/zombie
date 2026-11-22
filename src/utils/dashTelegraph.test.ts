// research/TELEGRAPH_FIXES.md §1(1-0・D06・E02・E12・N01): 突進の予告の位相(dashTelegraphPhase)と判定の一致。
// 固定する不変条件(設計書 0-1): ②溜め開始で prog=0 ③斬る瞬間に帯の prog=1(meteorPhase(1).er=1)
// ④走りの間に体当たりが有る型は「走りの州の全フレームで線が在る」。
import { describe, it, expect } from 'vitest';
import {
  dashTelegraphPhase, dashRunSpecOf, DASH_RUN_TABLE, dashRunnerFrac, thorDashArrival, thorDashRunCenter,
  dashStrikeBandEnd, type DashTelegraphInput,
} from './dashTelegraph';
import { meteorPhase } from './telegraphStyle';
import { airHopEase01 } from './airHop';
import { dashLineEraseRescale, dashLineStrikeEnd } from './geometry';
import { HIDDEN_THOR_TUNING as HB_TH } from './hiddenBossScript';
import { ANGEL_MIGUEL_TUNING as MG_T, ANGEL_URI_TUNING as UR_T } from './angelScript';
import { isBodySlamNow } from './enemyBite';
import { TELEGRAPH_DRAW_SOURCES } from './telegraphDrawSources';
import { thorPlayableAreaCtx } from './thorDashPushback';

const OPEN_CTX = thorPlayableAreaCtx({ farBackdrop: 'none', stageTheme: 'city', corridorMode: false, corridorRunInActive: false });
const BOX = { width: 60, height: 80 };
const DT = 1000 / 60;

const base = (over: Partial<DashTelegraphInput>): DashTelegraphInput => ({
  gameTime: 0, windupMs: 600, moveMs: 230, strikeMs: 110, state: 'windup',
  bossStateUntil: 600, aiStartedAt: 0, path: 'straight', bodySlamInRun: true,
  lineFrom: { x: 0, y: 0 }, lineEnd: { x: 500, y: 0 }, runnerPos: { x: 0, y: 0 }, hasStrike: true,
  ...over,
});

/** トールの突進を sim と同じ式(thorDashRunCenter+airHopEase01)で回し、各フレームの予告を返す。 */
const thorRun = () => {
  const from = { x: 100, y: 200 }, target = { x: 500, y: 260 };
  const W = HB_TH.dash.windup, M = HB_TH.dash.moveMs, S = HB_TH.dash.strikeMs;
  const windupStart = 1000, runStart = windupStart + W, stateEnd = runStart + M + S;
  const arrival = thorDashArrival(from, target, BOX, OPEN_CTX);
  const lineEnd = dashStrikeBandEnd(from, target, arrival, HB_TH.harai.range);
  const frames: { t: number; state: 'windup' | 'run'; runner: { x: number; y: number }; ph: ReturnType<typeof dashTelegraphPhase> }[] = [];
  let baked: { x: number; y: number } | null = null;
  for (let t = windupStart; t < stateEnd; t += DT) {
    const state = t < runStart ? 'windup' as const : 'run' as const;
    const runner = state === 'windup' ? from
      : thorDashRunCenter(from, target, airHopEase01(Math.min(1, (t - runStart) / M)), BOX, OPEN_CTX);
    if (state === 'run' && !baked) baked = runner;
    const ph = dashTelegraphPhase({
      gameTime: t, windupMs: W, moveMs: M, strikeMs: S, state,
      bossStateUntil: state === 'windup' ? runStart : stateEnd, aiStartedAt: runStart,
      path: 'straight', bodySlamInRun: true, lineFrom: state === 'windup' ? runner : baked!, lineEnd, runnerPos: runner, hasStrike: true,
    });
    frames.push({ t, state, runner, ph });
  }
  return { frames, from, target, arrival, lineEnd, runStart, stateEnd, W, M, S };
};

describe('D06 トールの突進', () => {
  it('(1) 溜めの頭で line.prog=0・band.prog=0(出る=溜め開始)', () => {
    const r = thorRun();
    const f0 = r.frames[0];
    expect(f0.ph.line?.prog).toBe(0);
    expect(f0.ph.band?.prog).toBe(0);
    expect(f0.ph.band?.windupOn).toBe(true);
  });
  it('(2) aiStartedAt+moveMs で band.prog=1(meteorPhase(1).er=1)・その瞬間 windupOn が落ちる', () => {
    const r = thorRun();
    const at = (t: number) => dashTelegraphPhase({
      gameTime: t, windupMs: r.W, moveMs: r.M, strikeMs: r.S, state: 'run',
      bossStateUntil: r.stateEnd, aiStartedAt: r.runStart, path: 'straight', bodySlamInRun: true,
      lineFrom: r.from, lineEnd: r.lineEnd, runnerPos: r.from, hasStrike: true,
    });
    const strike = at(r.runStart + r.M);
    expect(strike.band?.prog).toBe(1);
    expect(meteorPhase(strike.band!.prog).er).toBe(1);
    expect(strike.band?.windupOn).toBe(false);
    expect(at(r.runStart + r.M - 1).band!.prog).toBeLessThan(1);
    expect(at(r.runStart + r.M - 1).band!.windupOn).toBe(true);
  });
  it('(3) thor-dash-move の全フレーム(到着後の斬り抜けの間も含む)で線が描かれ、州の終わりで alpha=0', () => {
    const r = thorRun();
    const runs = r.frames.filter(f => f.state === 'run');
    expect(runs.length).toBeGreaterThan(5);
    for (const f of runs) {
      const l = f.ph.line!;
      expect(l).not.toBeNull();
      expect(l.prog - (l.eraseOverride ?? 0)).toBeGreaterThan(0);
      expect(l.alpha).toBeGreaterThan(0);
    }
    const end = dashTelegraphPhase({
      gameTime: r.stateEnd, windupMs: r.W, moveMs: r.M, strikeMs: r.S, state: 'run',
      bossStateUntil: r.stateEnd, aiStartedAt: r.runStart, path: 'straight', bodySlamInRun: true,
      lineFrom: r.from, lineEnd: r.lineEnd, runnerPos: r.arrival, hasStrike: true,
    });
    expect(end.line!.alpha).toBe(0);
  });
  it('(4) 走りの間の全フレームで eraseOverride ≤ 走者の位置の割合(走者より前の線が先に消えない)', () => {
    const r = thorRun();
    for (const f of r.frames.filter(x => x.state === 'run')) {
      const frac = dashRunnerFrac(f.ph.line!.from, r.lineEnd, f.runner);
      expect(f.ph.line!.eraseOverride!).toBeLessThanOrEqual(frac + 1e-9);
    }
  });
  it('(5) thorDashArrival=判定の到達点(クランプ後)・帯の終点=判定のカプセルの終点', () => {
    const from = { x: 100, y: 200 }, target = { x: 500, y: 260 };
    const sim = thorDashRunCenter(from, target, airHopEase01(1), BOX, OPEN_CTX);
    const arr = thorDashArrival(from, target, BOX, OPEN_CTX);
    expect(arr).toEqual(sim);
    const end = dashStrikeBandEnd(from, target, arr, HB_TH.harai.range);
    // 判定(useGameLoop thor-dash-move): ex = dnx + normalize(dt − df) × HB_TH.harai.range
    const l = Math.hypot(target.x - from.x, target.y - from.y);
    expect(end.x).toBeCloseTo(arr.x + (target.x - from.x) / l * HB_TH.harai.range, 9);
    expect(end.y).toBeCloseTo(arr.y + (target.y - from.y) / l * HB_TH.harai.range, 9);
  });
  it('(5b) 帯の外へ出る目標でも、到達点は「行ける帯」でクランプした点(クランプが効く ctx で検算)', () => {
    const ctx = thorPlayableAreaCtx({ farBackdrop: 'none', stageTheme: 'city', corridorMode: true, corridorRunInActive: false });
    const from = { x: 0, y: 0 }, target = { x: 300, y: 99999 };
    const arr = thorDashArrival(from, target, BOX, ctx);
    expect(arr).toEqual(thorDashRunCenter(from, target, 1, BOX, ctx));
  });
});

describe('E02 ミゲルの踏み込み', () => {
  it('(1)(2) 溜め頭で0・斬る瞬間に帯が1', () => {
    const W = MG_T.dash.windup, M = MG_T.dash.moveMs;
    const w0 = dashTelegraphPhase(base({ gameTime: 0, windupMs: W, moveMs: M, bossStateUntil: W }));
    expect(w0.line!.prog).toBe(0); expect(w0.band!.prog).toBe(0);
    const s = dashTelegraphPhase(base({ gameTime: W + M, windupMs: W, moveMs: M, state: 'run', aiStartedAt: W, bossStateUntil: W + M + MG_T.dash.strikeMs }));
    expect(s.band!.prog).toBe(1); expect(s.band!.windupOn).toBe(false);
  });
  it('線形に走る型: dashLineEraseRescale(時刻の割合, 距離, range) = 位置の割合(置き換えが同じ絵)', () => {
    const from = { x: 10, y: 20 }, target = { x: 260, y: 140 };
    const range = MG_T.harai.range, M = MG_T.dash.moveMs;
    const end = dashLineStrikeEnd(from.x, from.y, target.x, target.y, range);
    const d = Math.hypot(target.x - from.x, target.y - from.y);
    for (const el of [0, 30, 75, 120, M]) {
      const tFrac = Math.min(1, el / M);
      const runner = { x: from.x + (target.x - from.x) * tFrac, y: from.y + (target.y - from.y) * tFrac };
      expect(dashRunnerFrac(from, end, runner)).toBeCloseTo(dashLineEraseRescale(tFrac, d, range), 9);
    }
  });
});

describe('E12 ウリの踏み込み突き', () => {
  it('(1)(2) 溜め頭で0・突く瞬間に帯が1', () => {
    const W = UR_T.thrust.windup, M = UR_T.thrust.moveMs;
    const w0 = dashTelegraphPhase(base({ windupMs: W, moveMs: M, bossStateUntil: W, bodySlamInRun: false }));
    expect(w0.line!.prog).toBe(0); expect(w0.line!.eraseOverride).toBeUndefined(); expect(w0.band!.prog).toBe(0);
    const s = dashTelegraphPhase(base({ gameTime: W + M, windupMs: W, moveMs: M, state: 'run', aiStartedAt: W, bossStateUntil: W + M + UR_T.thrust.strikeMs, bodySlamInRun: false }));
    expect(s.band!.prog).toBe(1);
  });
  it('thrust の間は線が描かれない(当たらない赤を出さない)', () => {
    const W = UR_T.thrust.windup, M = UR_T.thrust.moveMs;
    for (let t = W; t < W + M + UR_T.thrust.strikeMs; t += DT) {
      const s = dashTelegraphPhase(base({ gameTime: t, windupMs: W, moveMs: M, state: 'run', aiStartedAt: W, bodySlamInRun: false }));
      expect(s.line).toBeNull();
    }
    expect(DASH_RUN_TABLE['bossState:thrust'].bodySlamInRun).toBe(false);
    expect(isBodySlamNow({ type: 'uri', aiPhase: undefined, bossState: 'thrust' }, 0)).toBe(false);
  });
  it('描く帯・剣の半幅=判定の半幅', () => {
    expect(TELEGRAPH_DRAW_SOURCES.uriThrustHalfWidth()).toBe(UR_T.thrust.halfWidth);
  });
});

describe('突進の表(走りの州=runOn)', () => {
  it('体当たりの有無は isBodySlamNow と一致する', () => {
    for (const [key, spec] of Object.entries(DASH_RUN_TABLE)) {
      const [kind, name] = key.split(':');
      const e = (kind === 'aiPhase'
        ? { type: 'werewolf', aiPhase: name, bossState: undefined }
        : { type: 'thor', aiPhase: undefined, bossState: name }) as Parameters<typeof isBodySlamNow>[0];
      expect(isBodySlamNow(e, 0), key).toBe(spec.bodySlamInRun);
    }
  });
  it('体当たりの突進の州は全部、表に載っている(表に無い走りの州があれば落とす)', () => {
    for (const bs of ['thor-dash-move', 'mdash-move', 'bm-charge', 'dash']) {
      expect(dashRunSpecOf({ bossState: bs }), bs).not.toBeNull();
    }
    for (const ph of ['charge', 'g-dash-charge', 'g-quad-charge']) {
      expect(dashRunSpecOf({ aiPhase: ph }), ph).not.toBeNull();
    }
    // 突進でない体当たりの州(跳び・滑空・急降下の溜め)は表に載せない=線の出し入れに混ぜない。
    for (const ph of ['jump', 'g-jump-air', 'g-glide-active', 'g-dive-windup']) {
      expect(dashRunSpecOf({ aiPhase: ph }), ph).toBeNull();
    }
  });
});

describe('N01 体当たりのみの突進(線だけ)', () => {
  it('直進(bm-charge): 走りの全フレームで線が在り、eraseOverride ≤ 走者の割合', () => {
    const from = { x: 0, y: 0 }, target = { x: 300, y: 0 };
    for (let x = 0; x < 300; x += 7) {
      const s = dashTelegraphPhase(base({ state: 'run', hasStrike: false, lineFrom: from, lineEnd: target, runnerPos: { x, y: 0 } }));
      expect(s.band).toBeNull();
      expect(s.line!.prog - (s.line!.eraseOverride ?? 0)).toBeGreaterThan(0);
      expect(s.line!.eraseOverride!).toBeLessThanOrEqual(dashRunnerFrac(from, target, { x, y: 0 }) + 1e-9);
      expect(s.line!.alpha).toBe(1);
    }
  });
  it('曲がる型: 毎フレーム「今の体→今の終点」(線の無いフレームが無い)', () => {
    for (let t = 0; t < 600; t += DT) {
      const runner = { x: t * 0.4, y: Math.sin(t / 90) * 30 };
      const s = dashTelegraphPhase(base({ state: 'run', path: 'curved', hasStrike: false, runnerPos: runner, lineEnd: { x: 400, y: 50 } }));
      expect(s.line).not.toBeNull();
      expect(s.line!.from).toEqual(runner);
      expect(s.line!.to).toEqual({ x: 400, y: 50 });
      expect(s.line!.prog).toBe(1);
      expect(s.line!.eraseOverride).toBe(0);
    }
  });
  it('溜めの間は描きの位置を meteorPhase から取り、消しは0(走りへ持ち越す)', () => {
    const W = 600;
    for (const t of [0, 100, 270, 400, 599]) {
      const s = dashTelegraphPhase(base({ gameTime: t, windupMs: W, bossStateUntil: W, hasStrike: false }));
      expect(s.line!.prog).toBeCloseTo(meteorPhase(t / W).p, 9);
      expect(s.line!.eraseOverride).toBe(0);
    }
  });
  it('走りの州を抜けたら線は無い(中断の型は描画側の灰の残光)', () => {
    expect(dashTelegraphPhase(base({ state: 'other', hasStrike: false })).line).toBeNull();
    expect(dashTelegraphPhase(base({ state: 'other', hasStrike: true })).band).toEqual({ prog: 1, windupOn: false });
  });
});
