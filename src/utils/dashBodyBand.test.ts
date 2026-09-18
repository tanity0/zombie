// ★★赤い予告の4つの掟④(CLAUDE.md・社長指示2026-09-18「**通るものもそれに合わせて**」)。
// PACING_PUZZLE.md §18-1(d)。**旧実装の嘘の検知器**=v0.25.4456以前の壊れ方をそのまま書くと落ちる。
//
// 旧: **走行中の赤帯はトールの突進(thor-dash-move)にしか無かった**。犬/lab-zombie-2/城ボス(giantbat)/
// ハンターの `charge`、裏ボス3体の `dash`、城ボスの `g-dash-charge`/`g-quad-charge`、馬乗りの
// `bm-charge` は、**走り出した瞬間に赤が消えるのに体当たりで当たる**=「赤くないのに当たる」だった。
import { describe, it, expect } from 'vitest';
import {
  DASH_BAND_AI_PHASES, DASH_BAND_BOSS_STATES, DASH_BAND_FADE_MS, DASH_BAND_ARRIVE_FADE_PX,
  dashBodyBandOn, dashBodyBandPurple, dashBandAlpha01, dashBodyBandSpec,
  type DashBandDurations,
} from './dashBodyBand';

const D: DashBandDurations = {
  chargeMaxMs: 2800 / 1.2,  // WEREWOLF_CHARGE_MAX_MS / ENEMY_ATTACK_SPEED_MULT(既定1.2)
  hiddenDashMs: 700,        // HIDDEN_COMMON_TUNING.dash.ms
  bmChargeMaxMs: 2800,      // BOUNTY_MELEE_TUNING.charge.maxMs
  thorDashMoveMs: 230,      // HIDDEN_THOR_TUNING.dash.moveMs
};

const actor = (o: Partial<Parameters<typeof dashBodyBandSpec>[0]> = {}) => ({
  x: 0, y: 0, width: 40, height: 60, ...o,
});

describe('★走行中は赤帯を出す州の台帳(掟④)', () => {
  it('★§18-1(d)の4件(D-1〜D-4)が全部載っている(旧実装の嘘の検知器: 旧はトールだけ)', () => {
    // D-1 汎用突進(犬/lab-zombie-2/giantbat/ハンター)
    expect(dashBodyBandOn('charge', undefined)).toBe(true);
    // D-2 裏ボス共通(ミーミル/ヨルムンガルド/スカディ)
    expect(dashBodyBandOn(undefined, 'dash')).toBe(true);
    // D-3 城ボス
    expect(dashBodyBandOn('g-dash-charge', undefined)).toBe(true);
    expect(dashBodyBandOn('g-quad-charge', undefined)).toBe(true);
    // D-4 馬乗り
    expect(dashBodyBandOn(undefined, 'bm-charge')).toBe(true);
    // 先例(既に揃っていた側)も同じ台帳から配る
    expect(dashBodyBandOn(undefined, 'thor-dash-move')).toBe(true);
  });

  it('溜め中・硬直中・平常時には出さない(走っている間だけ)', () => {
    expect(dashBodyBandOn('windup', undefined)).toBe(false);
    expect(dashBodyBandOn('g-dash-windup', undefined)).toBe(false);
    expect(dashBodyBandOn(undefined, 'dash-windup')).toBe(false);
    expect(dashBodyBandOn(undefined, 'bm-charge-windup')).toBe(false);
    expect(dashBodyBandOn(undefined, 'chase')).toBe(false);
    expect(dashBodyBandOn(undefined, undefined)).toBe(false);
  });

  it('台帳と spec の対応が抜けない(載っている州は必ず spec を返す)', () => {
    for (const ph of DASH_BAND_AI_PHASES) {
      expect(dashBodyBandSpec(actor({ aiPhase: ph, aiPhaseUntil: 1000, aiTargetX: 300, aiTargetY: 0 }), 500, D)).not.toBeNull();
    }
    for (const bs of DASH_BAND_BOSS_STATES) {
      expect(dashBodyBandSpec(actor({
        bossState: bs, bossStateUntil: 1000, aiStartedAt: 400, aiTargetX: 300, aiTargetY: 0,
      }), 500, D)).not.toBeNull();
    }
    expect(dashBodyBandSpec(actor({ aiPhase: 'windup', aiPhaseUntil: 1000 }), 500, D)).toBeNull();
  });
});

describe('★走行中は「ずっと」赤が在る(赤が消えている間は当たらない)', () => {
  // 掟④の本体: 走り始めから走り終わりまで、**濃さが0になる瞬間が無い**こと
  // (両端の加減速ぶんの数フレームを除く=CLAUDE.md「動きの絶対ルール: 慣性」)。
  it('汎用突進(D-1): 走行の間ずっと濃さ>0(旧実装は走り出しで赤が消えていた)', () => {
    const start = 10_000, until = start + D.chargeMaxMs;
    let minA = 1;
    for (let t = start + DASH_BAND_FADE_MS; t <= until - DASH_BAND_FADE_MS; t += 25) {
      const spec = dashBodyBandSpec(actor({
        aiPhase: 'charge', aiPhaseUntil: until, aiTargetX: 2000, aiTargetY: 0,
      }), t, D)!;
      minA = Math.min(minA, dashBandAlpha01(spec.sinceStartMs, spec.remainMs, spec.distRemainPx));
    }
    expect(minA).toBeGreaterThan(0.9); // 途切れない(ほぼ全開のまま)
  });

  it('裏ボス(D-2)/馬乗り(D-4)も同じ(尺だけが違う)', () => {
    for (const [bs, total] of [['dash', D.hiddenDashMs], ['bm-charge', D.bmChargeMaxMs]] as const) {
      const start = 5_000, until = start + total;
      const mid = dashBodyBandSpec(actor({
        bossState: bs, bossStateUntil: until, aiTargetX: 2000, aiTargetY: 0,
      }), start + total / 2, D)!;
      expect(dashBandAlpha01(mid.sinceStartMs, mid.remainMs, mid.distRemainPx)).toBeGreaterThan(0.9);
    }
  });
});

describe('dashBandAlpha01 — 出現/消滅の慣性(パッと出てパッと消えない)', () => {
  it('走り出し・走り終わりは0、間は最大', () => {
    expect(dashBandAlpha01(0, 1000)).toBe(0);
    expect(dashBandAlpha01(500, 0)).toBe(0);
    expect(dashBandAlpha01(-1, 1000)).toBe(0);
    expect(dashBandAlpha01(DASH_BAND_FADE_MS, 1000)).toBeCloseTo(1, 6);
  });
  it('立ち上がりは加速→減速(等速でない)', () => {
    const a = dashBandAlpha01(DASH_BAND_FADE_MS * 0.1, 1000);
    const b = dashBandAlpha01(DASH_BAND_FADE_MS * 0.5, 1000);
    expect(b - a).toBeGreaterThan(a); // 中盤の伸びの方が序盤より大きい
  });
  it('到達点に近づくと絞れる(到達で終わる型がパッと消えないため)', () => {
    expect(dashBandAlpha01(500, 500, 0)).toBe(0);
    expect(dashBandAlpha01(500, 500, DASH_BAND_ARRIVE_FADE_PX)).toBeCloseTo(1, 6);
    expect(dashBandAlpha01(500, 500, DASH_BAND_ARRIVE_FADE_PX / 2))
      .toBeLessThan(dashBandAlpha01(500, 500, DASH_BAND_ARRIVE_FADE_PX));
  });
  it('★トール(先例)は距離で絞らない=見た目が1つも変わっていない', () => {
    // thor-dash-move は必ず moveMs ぴったりで終わるので distRemainPx=Infinity。
    const spec = dashBodyBandSpec(actor({
      bossState: 'thor-dash-move', aiStartedAt: 1000, aiTargetX: 300, aiTargetY: 0,
    }), 1100, D)!;
    expect(spec.distRemainPx).toBe(Infinity);
    expect(spec.sinceStartMs).toBe(100);
    expect(spec.remainMs).toBe(D.thorDashMoveMs - 100);
    // 旧 drawThorDashBodyBand と同じ式(fade 60ms の両端イーズの積)。
    expect(dashBandAlpha01(spec.sinceStartMs, spec.remainMs, spec.distRemainPx)).toBeCloseTo(1, 6);
  });
});

describe('dashBodyBandSpec — 帯の終点は「その突進の赤いライン」と同じ aiTarget', () => {
  it('線と帯で終点を二重定義しない(=赤いのに当たらない、を作らない)', () => {
    const spec = dashBodyBandSpec(actor({
      aiPhase: 'g-quad-charge', aiPhaseUntil: 2000, aiTargetX: 640, aiTargetY: 480,
    }), 1000, D)!;
    expect(spec.endCx).toBe(640);
    expect(spec.endCy).toBe(480);
  });
  it('aiTarget が無い1フレームは自分の中心へ落とす(NaN を描かない)', () => {
    const spec = dashBodyBandSpec(actor({ aiPhase: 'charge', aiPhaseUntil: 2000 }), 1000, D)!;
    expect(spec.endCx).toBe(20);
    expect(spec.endCy).toBe(30);
    expect(spec.distRemainPx).toBe(0);
  });
});

describe('★色の文法: 赤=カウンター可 / 紫=カウンター不能(CLAUDE.md)', () => {
  it('城ボスの三連突進(g-quad-charge)だけ紫。他の突進は赤', () => {
    // 予告ライン側は既に紫(v0.25.3049 の社長裁定)。体帯だけ赤にすると読み分けが壊れる。
    expect(dashBodyBandPurple('g-quad-charge')).toBe(true);
    expect(dashBodyBandPurple('g-dash-charge')).toBe(false);
    expect(dashBodyBandPurple('charge')).toBe(false);
    expect(dashBodyBandPurple(undefined)).toBe(false);
  });
  it('spec が色まで運ぶ(描画側で色を決め直さない)', () => {
    expect(dashBodyBandSpec(actor({ aiPhase: 'g-quad-charge', aiPhaseUntil: 2000, aiTargetX: 100, aiTargetY: 0 }), 1000, D)!.purple).toBe(true);
    expect(dashBodyBandSpec(actor({ bossState: 'bm-charge', bossStateUntil: 2000, aiTargetX: 100, aiTargetY: 0 }), 1000, D)!.purple).toBe(false);
  });
});
