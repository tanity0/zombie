import { describe, it, expect } from 'vitest';
import {
  createPuzzleClockState, tickPuzzleClock, capForState, cdBasisForRank, cdBasisTightened,
  assessKomaDelta, applyKomaAssessment, applyRankDelta, combineCycleDelta, isDemoteGrade,
  createKomaAccumulator, stepKomaAccumulator, finalizeKomaAssessmentInput,
  createSoftenState, stepSoften, SOFTEN_RELEASE_NO_HIT_MS,
  BASE_CAP, R7_CAP_MIN, R7_CAP_MAX, R7_CAP_STEP, RAMP_INTERVAL_NORMAL_MS, RAMP_INTERVAL_TIGHT_MS,
  RAMP_NO_HIT_HOLD_MS, TIGHTEN_NO_HIT_MS, TIGHTEN_STARVE_MS, clampRank,
  promotionScore,
  // M50(§6.27): 連続査定「捌けているか」一本化。
  RANK_WINDOW_MS, RANK_MIN_WINDOWS, HIT_RECENCY_MS, DEMOTE_STREAK_MS, RANK_KILLS_PER_WINDOW_BASE,
  rankKillTarget, createRankWindowState, stepRankWindow,
  createHitStreakState, stepHitStreak,
  createRankPaceState, tickRankPace,
  type KomaAssessmentInput, type RankWindowState, type PuzzleRank,
} from './rankAssessor';

describe('cdBasisForRank / cdBasisTightened', () => {
  it('matches the rank ladder R1=1.0s .. R6=0.25s', () => {
    expect(cdBasisForRank(1, R7_CAP_MIN)).toBe(1000);
    expect(cdBasisForRank(6, R7_CAP_MIN)).toBe(250);
  });
  it('R7=0.1s normally, but 0 once the R7 cap has grown to the max', () => {
    expect(cdBasisForRank(7, R7_CAP_MIN)).toBe(100);
    expect(cdBasisForRank(7, R7_CAP_MAX - 1)).toBe(100);
    expect(cdBasisForRank(7, R7_CAP_MAX)).toBe(0);
  });
  it('tightened uses one rank up; §3-D: tightening at R7 goes to CD0(仕様適合修正v0.25.1386)', () => {
    expect(cdBasisTightened(1, R7_CAP_MIN)).toBe(cdBasisForRank(2, R7_CAP_MIN));
    expect(cdBasisTightened(6, R7_CAP_MIN)).toBe(cdBasisForRank(7, R7_CAP_MIN));
    expect(cdBasisTightened(7, R7_CAP_MIN)).toBe(0);
    expect(cdBasisTightened(7, R7_CAP_MAX)).toBe(0);
  });
});

describe('tickPuzzleClock', () => {
  const base = { dtMs: 1000, msSinceLastHit: 999999, perf: 0.2, boardCount: 0 };

  it('ramps the board target by 1 every 6s while healthy and understocked', () => {
    let s = createPuzzleClockState();
    for (let i = 0; i < 6; i++) s = tickPuzzleClock(s, { ...base, dtMs: 1000, boardCount: 0 }).state;
    expect(s.boardTarget).toBe(2);
  });

  it('does not increase the target within 10s of a hit (held)', () => {
    let s = createPuzzleClockState();
    for (let i = 0; i < 6; i++) s = tickPuzzleClock(s, { ...base, dtMs: 1000, msSinceLastHit: 500, boardCount: 0 }).state;
    expect(s.boardTarget).toBe(1);
  });

  it('never ramps past the cap for the current rank (BASE_CAP for R1-R6)', () => {
    const s = { ...createPuzzleClockState(), boardTarget: BASE_CAP };
    const r = tickPuzzleClock(s, { ...base, dtMs: RAMP_INTERVAL_NORMAL_MS, boardCount: 0 });
    expect(r.state.boardTarget).toBe(BASE_CAP);
  });

  it('belowTargetMs resets to 0 the instant the board catches up to target', () => {
    const s = { ...createPuzzleClockState(), boardTarget: 5 };
    let r = tickPuzzleClock(s, { ...base, dtMs: 5000, boardCount: 2 });
    expect(r.state.belowTargetMs).toBe(5000);
    r = tickPuzzleClock(r.state, { ...base, dtMs: 1000, boardCount: 5 });
    expect(r.state.belowTargetMs).toBe(0);
  });

  it('tightens (real-time cinch) when no-hit >=15s AND perf>=0.6 — steps CD up one rank and speeds the ramp interval', () => {
    const s = createPuzzleClockState();
    const r = tickPuzzleClock(s, { dtMs: 1000, msSinceLastHit: TIGHTEN_NO_HIT_MS, perf: 0.7, boardCount: 0 });
    expect(r.tightened).toBe(true);
    expect(r.cdMs).toBe(cdBasisForRank(2, R7_CAP_MIN)); // R1 tightened -> R2 basis
  });

  it('tightens via the starving path (board understocked for >=15s) even with low perf', () => {
    const s = { ...createPuzzleClockState(), boardTarget: 5, belowTargetMs: TIGHTEN_STARVE_MS };
    const r = tickPuzzleClock(s, { dtMs: 100, msSinceLastHit: TIGHTEN_NO_HIT_MS, perf: 0.1, boardCount: 0 });
    expect(r.tightened).toBe(true);
  });

  it('does NOT tighten with low perf and no starving, even after 15s no-hit', () => {
    const s = createPuzzleClockState();
    const r = tickPuzzleClock(s, { dtMs: 1000, msSinceLastHit: TIGHTEN_NO_HIT_MS, perf: 0.3, boardCount: 5 });
    expect(r.tightened).toBe(false);
    expect(r.cdMs).toBe(cdBasisForRank(1, R7_CAP_MIN));
  });

  it('a hit (msSinceLastHit reset near 0) immediately drops tightening back to the rank baseline', () => {
    const r = tickPuzzleClock(createPuzzleClockState(), { dtMs: 16, msSinceLastHit: 0, perf: 0.9, boardCount: 0 });
    expect(r.tightened).toBe(false);
  });

  it('RAMP_NO_HIT_HOLD_MS < TIGHTEN_NO_HIT_MS (hold-off is shorter than the tighten trigger, as specced)', () => {
    expect(RAMP_NO_HIT_HOLD_MS).toBeLessThan(TIGHTEN_NO_HIT_MS);
  });

  it('tightened ramp interval (4s) is faster than normal (6s)', () => {
    expect(RAMP_INTERVAL_TIGHT_MS).toBeLessThan(RAMP_INTERVAL_NORMAL_MS);
  });
});

describe('capForState', () => {
  it('R1-R6 always use BASE_CAP regardless of r7Cap', () => {
    expect(capForState({ rank: 3, r7Cap: 18, boardTarget: 0, belowTargetMs: 0, msSinceRampMs: 0 })).toBe(BASE_CAP);
  });
  it('R7 uses r7Cap', () => {
    expect(capForState({ rank: 7, r7Cap: 16, boardTarget: 0, belowTargetMs: 0, msSinceRampMs: 0 })).toBe(16);
  });
});

describe('assessKomaDelta', () => {
  const good = { capReached: true, perfAvg: 0.5, intensAvg: 0.3, dmgRatio: 0.1, starveRatio: 0 };
  it('promotes when cap reached, low damage, and good perf', () => {
    expect(assessKomaDelta(good)).toBe(1);
  });
  it('promotes via the starveRatio path even with low perf (processing-speed credit)', () => {
    expect(assessKomaDelta({ ...good, perfAvg: 0.1, starveRatio: 0.5 })).toBe(1);
  });
  it('does not promote without capReached when starveRatio is also low', () => {
    expect(assessKomaDelta({ ...good, capReached: false })).toBe(0);
  });
  it('【裁定v0.25.1387】promotes via starveRatio even when capReached is false (fastest players who out-clear the spawner)', () => {
    expect(assessKomaDelta({ capReached: false, perfAvg: 0.1, intensAvg: 0.3, dmgRatio: 0.1, starveRatio: 0.5 })).toBe(1);
  });
  it('demotes on high damage ratio', () => {
    expect(assessKomaDelta({ ...good, dmgRatio: 0.6 })).toBe(-1);
  });
  it('demotes on sustained high intensity', () => {
    expect(assessKomaDelta({ ...good, dmgRatio: 0.1, intensAvg: 0.9 })).toBe(-1);
  });
  it('holds (0) otherwise', () => {
    expect(assessKomaDelta({ capReached: false, perfAvg: 0.5, intensAvg: 0.5, dmgRatio: 0.2, starveRatio: 0 })).toBe(0);
  });
});

describe('applyKomaAssessment', () => {
  const good = { capReached: true, perfAvg: 0.5, intensAvg: 0.3, dmgRatio: 0.1, starveRatio: 0 };
  const bad = { capReached: false, perfAvg: 0, intensAvg: 0.9, dmgRatio: 0.7, starveRatio: 0 };
  const hold = { capReached: false, perfAvg: 0.5, intensAvg: 0.5, dmgRatio: 0.2, starveRatio: 0 };

  it('promotes rank 1->2 on a good koma', () => {
    const s = applyKomaAssessment(createPuzzleClockState(), good);
    expect(s.rank).toBe(2);
  });
  it('holds rank on a neutral koma', () => {
    const s = applyKomaAssessment(createPuzzleClockState(), hold);
    expect(s.rank).toBe(1);
  });
  it('clamps at rank 1 (never demotes below it)', () => {
    const s = applyKomaAssessment(createPuzzleClockState(), bad);
    expect(s.rank).toBe(1);
  });
  it('respects a per-run minRank floor (社長決定v0.25.1988: 開始最低ランクの1つ下まで)', () => {
    // stage-6 相当: minRank=4。R5から悪コマで降格すると4まで、さらに悪くても4で止まる。
    const atR5 = { rank: 5 as const, r7Cap: R7_CAP_MIN, boardTarget: 10, belowTargetMs: 0, msSinceRampMs: 0, minRank: 4 };
    const demoted = applyKomaAssessment(atR5, bad);
    expect(demoted.rank).toBe(4);
    expect(applyKomaAssessment(demoted, bad).rank).toBe(4); // 下限で頭打ち(3へは落ちない)
    // minRank 未指定(=省略)は従来どおり全体下限1まで落ちる。
    const noFloor = { rank: 2 as const, r7Cap: R7_CAP_MIN, boardTarget: 10, belowTargetMs: 0, msSinceRampMs: 0 };
    expect(applyKomaAssessment(noFloor, bad).rank).toBe(1);
    // 昇格は下限に関係なく通る(minRankは降格の下限のみ)。
    expect(applyKomaAssessment(atR5, good).rank).toBe(6);
  });
  it('promoting from rank 6 into rank 7 resets r7Cap to the minimum', () => {
    const atR6 = { rank: 6 as const, r7Cap: 18, boardTarget: 10, belowTargetMs: 0, msSinceRampMs: 0 };
    const s = applyKomaAssessment(atR6, good);
    expect(s.rank).toBe(7);
    expect(s.r7Cap).toBe(R7_CAP_MIN);
  });
  it('while at rank 7, a good koma grows r7Cap by R7_CAP_STEP instead of promoting rank (there is no rank 8)', () => {
    const atR7 = { rank: 7 as const, r7Cap: 10, boardTarget: 10, belowTargetMs: 0, msSinceRampMs: 0 };
    const s = applyKomaAssessment(atR7, good);
    expect(s.rank).toBe(7);
    expect(s.r7Cap).toBe(R7_CAP_MIN + R7_CAP_STEP);
  });
  it('r7Cap growth clamps at R7_CAP_MAX', () => {
    const atR7Full = { rank: 7 as const, r7Cap: R7_CAP_MAX, boardTarget: 20, belowTargetMs: 0, msSinceRampMs: 0 };
    const s = applyKomaAssessment(atR7Full, good);
    expect(s.r7Cap).toBe(R7_CAP_MAX);
  });
  it('while at rank 7 above the floor, a bad koma shrinks r7Cap by R7_CAP_STEP and rank stays 7', () => {
    const atR7 = { rank: 7 as const, r7Cap: 14, boardTarget: 14, belowTargetMs: 0, msSinceRampMs: 0 };
    const s = applyKomaAssessment(atR7, bad);
    expect(s.rank).toBe(7);
    expect(s.r7Cap).toBe(12);
  });
  it('at rank 7 with r7Cap already at the floor, a further bad koma actually demotes to rank 6 and resets the cap to 10', () => {
    const atR7Floor = { rank: 7 as const, r7Cap: R7_CAP_MIN, boardTarget: 10, belowTargetMs: 0, msSinceRampMs: 0 };
    const s = applyKomaAssessment(atR7Floor, bad);
    expect(s.rank).toBe(6);
    expect(s.r7Cap).toBe(R7_CAP_MIN);
  });
  it('demoting from rank 7 clamps a grown boardTarget down to BASE_CAP', () => {
    const atR7Floor = { rank: 7 as const, r7Cap: R7_CAP_MIN, boardTarget: 10, belowTargetMs: 0, msSinceRampMs: 0 };
    // Force a scenario where boardTarget somehow exceeds BASE_CAP going into the demotion (defensive clamp check).
    const s = applyKomaAssessment({ ...atR7Floor, boardTarget: 16 }, bad);
    expect(s.rank).toBe(6);
    expect(s.boardTarget).toBeLessThanOrEqual(BASE_CAP);
  });
});

describe('clampRank', () => {
  it('clamps to the 1..7 range', () => {
    expect(clampRank(0)).toBe(1);
    expect(clampRank(-3)).toBe(1);
    expect(clampRank(8)).toBe(7);
    expect(clampRank(4)).toBe(4);
  });
});

describe('koma accumulator (finalizeKomaAssessmentInput)', () => {
  it('produces a time-weighted average for perf/intensity, a damage ratio, and a starve ratio', () => {
    let acc = createKomaAccumulator();
    acc = stepKomaAccumulator(acc, { dtMs: 1000, perf: 0.5, intensity: 0.2, dmgTakenThisFrame: 10, boardCount: 5, boardTarget: 10, cap: 10 });
    acc = stepKomaAccumulator(acc, { dtMs: 1000, perf: 1.0, intensity: 0.4, dmgTakenThisFrame: 0, boardCount: 10, boardTarget: 10, cap: 10 });
    const input = finalizeKomaAssessmentInput(acc, 100);
    expect(input.perfAvg).toBeCloseTo(0.75, 5);
    expect(input.intensAvg).toBeCloseTo(0.3, 5);
    expect(input.dmgRatio).toBeCloseTo(0.1, 5);
    expect(input.starveRatio).toBeCloseTo(0.5, 5); // understocked for 1s out of 2s total
    expect(input.capReached).toBe(true); // M6意味: 盤面数(10)がコマ総目標(cap=10)へ到達した瞬間があった
  });

  it('M6: capReached stays false if the BOARD never actually reaches the koma total target', () => {
    let acc = createKomaAccumulator();
    acc = stepKomaAccumulator(acc, { dtMs: 1000, perf: 0.5, intensity: 0.2, dmgTakenThisFrame: 0, boardCount: 3, boardTarget: 4, cap: 4 });
    expect(finalizeKomaAssessmentInput(acc, 100).capReached).toBe(false);
    acc = stepKomaAccumulator(acc, { dtMs: 1000, perf: 0.5, intensity: 0.2, dmgTakenThisFrame: 0, boardCount: 4, boardTarget: 4, cap: 4 });
    expect(finalizeKomaAssessmentInput(acc, 100).capReached).toBe(true);
  });

  it('an empty koma (zero duration) does not divide by zero', () => {
    const acc = createKomaAccumulator();
    const input = finalizeKomaAssessmentInput(acc, 100);
    expect(Number.isFinite(input.perfAvg)).toBe(true);
    expect(Number.isFinite(input.starveRatio)).toBe(true);
  });
});

describe('M6 §4-C: combineCycleDelta(2段査定の確定規則)', () => {
  const mk = (over: Partial<KomaAssessmentInput>): KomaAssessmentInput =>
    ({ capReached: true, perfAvg: 0.5, intensAvg: 0.3, dmgRatio: 0.1, starveRatio: 0, ...over });

  it('昇格=仮査定が昇格 かつ ピークでも耐えた(dmgRatio<0.35)', () => {
    expect(combineCycleDelta(1, mk({ dmgRatio: 0.2 }))).toBe(1);
  });
  it('仮査定が昇格でもピークで耐えられなければ(0.35<=dmg<0.60)維持へ落ちる', () => {
    expect(combineCycleDelta(1, mk({ dmgRatio: 0.4 }))).toBe(0);
  });
  it('降格=どちらかのコマで降格級(通常側=仮査定-1/ピーク側=dmg>=0.60 or intens>=0.85)', () => {
    expect(combineCycleDelta(-1, mk({}))).toBe(-1);
    expect(combineCycleDelta(0, mk({ dmgRatio: 0.7 }))).toBe(-1);
    expect(combineCycleDelta(1, mk({ intensAvg: 0.9 }))).toBe(-1); // 昇格候補でもピーク降格級なら降格(安全側)
  });
  it('仮査定=維持でピークが無難なら維持', () => {
    expect(combineCycleDelta(0, mk({}))).toBe(0);
  });
  it('isDemoteGrade thresholds', () => {
    expect(isDemoteGrade(mk({ dmgRatio: 0.6 }))).toBe(true);
    expect(isDemoteGrade(mk({ intensAvg: 0.85 }))).toBe(true);
    expect(isDemoteGrade(mk({}))).toBe(false);
  });
});

describe('M6: applyRankDelta(確定デルタの直接適用・applyKomaAssessmentと同じR7規則)', () => {
  it('promotes/demotes/holds with clamping, matching the legacy wrapper', () => {
    const s1 = createPuzzleClockState();
    expect(applyRankDelta(s1, 1).rank).toBe(2);
    expect(applyRankDelta(s1, -1).rank).toBe(1); // clamp
    expect(applyRankDelta(s1, 0).rank).toBe(1);
  });
  it('at R7: +1 grows the cap, -1 shrinks it, and demotes only from the floor', () => {
    const atR7 = { rank: 7 as const, r7Cap: R7_CAP_MIN, boardTarget: 10, belowTargetMs: 0, msSinceRampMs: 0 };
    expect(applyRankDelta(atR7, 1).r7Cap).toBe(R7_CAP_MIN + R7_CAP_STEP);
    const demoted = applyRankDelta(atR7, -1);
    expect(demoted.rank).toBe(6);
    expect(applyRankDelta({ ...atR7, r7Cap: 14 }, -1)).toMatchObject({ rank: 7, r7Cap: 12 });
  });
});

describe('M6 §3-D改訂: stepSoften(全コマ常時の「多少緩め」検知)', () => {
  const calm = { dtMs: 1000, dmgFracThisFrame: 0, intensity: 0.2, hpFrac: 1, msSinceLastHit: 99999 };

  it('直近10秒の被ダメ合計がmaxHealthの15%以上で緩め発動', () => {
    let s = createSoftenState();
    s = stepSoften(s, { ...calm, dmgFracThisFrame: 0.1, msSinceLastHit: 0 });
    expect(s.softened).toBe(false);
    s = stepSoften(s, { ...calm, dmgFracThisFrame: 0.06, msSinceLastHit: 0 });
    expect(s.softened).toBe(true); // 累計0.16 >= 0.15
  });

  it('直近10秒のIntensity平均が0.85以上で緩め発動', () => {
    let s = createSoftenState();
    for (let i = 0; i < 5; i++) s = stepSoften(s, { ...calm, intensity: 0.9 });
    expect(s.softened).toBe(true);
  });

  it('HP30%以下で緩め発動(継続中は無被弾10秒でも維持=ラッチ解釈)', () => {
    let s = createSoftenState();
    s = stepSoften(s, { ...calm, hpFrac: 0.25 });
    expect(s.softened).toBe(true);
    s = stepSoften(s, { ...calm, hpFrac: 0.25, msSinceLastHit: SOFTEN_RELEASE_NO_HIT_MS + 1 });
    expect(s.softened).toBe(true); // HP条件が残る限り解除しない
  });

  it('検知条件が消え、かつ無被弾10秒で基準へ戻る(それ未満はラッチ維持)', () => {
    let s = createSoftenState();
    s = stepSoften(s, { ...calm, dmgFracThisFrame: 0.2, msSinceLastHit: 0 }); // 発動
    expect(s.softened).toBe(true);
    // 11秒経過=バケツが一巡してダメージ窓が空になり、無被弾10秒超 → 解除。
    for (let i = 0; i < 11; i++) s = stepSoften(s, { ...calm, msSinceLastHit: 1000 * (i + 1) });
    expect(s.softened).toBe(false);
  });

  it('発動直後(無被弾10秒未満)はダメージ窓が流れてもラッチで維持される', () => {
    let s = createSoftenState();
    s = stepSoften(s, { ...calm, dmgFracThisFrame: 0.2, msSinceLastHit: 0 });
    for (let i = 0; i < 11; i++) s = stepSoften(s, { ...calm, msSinceLastHit: 500 }); // ずっと直近被弾扱い
    expect(s.softened).toBe(true);
  });
});

// PACING_PUZZLE.md §5.17-追補/§5.19 バッチM18: 昇格度スコア(惜しさ指標の差し替え)。
// 「判定バランスは1ミリも変えない=表示の翻訳のみ」の裏付けとして、既存の assessKomaDelta と
// 「total>=100 ⇔ +1判定」で等価であることを格子全域で確認する。
describe('promotionScore', () => {
  // intensAvgは降格側専用のシグナルでpromotionScoreは読まない(§5.17-追補: 意味が濁るため混ぜない)。
  // 等価性は「昇格度で見せる範囲」= intensAvg<0.85(降格級でない)に限定して検証する。
  const INTENS_AVG_SAFE = 0;
  // dmgRatioは0.35をちょうど跨ぐ点だけ assessKomaDelta の厳密な `<0.35` と
  // promotionScore の `>=100`(dmgRatio<=0.35 相当)がズレ得るため、グリッドは0.35を避ける。
  const DMG_RATIOS = [0, 0.05, 0.1, 0.15, 0.2, 0.275, 0.325, 0.375, 0.425, 0.5, 0.6, 0.7, 0.85, 1];
  const PERF_AVGS = [0, 0.2, 0.44, 0.45, 0.46, 0.6, 1];
  const STARVE_RATIOS = [0, 0.2, 0.39, 0.4, 0.41, 0.7, 1];
  const CAP_REACHED = [true, false];

  it('total>=100 ⇔ assessKomaDelta==+1 across the full grid (intensAvg fixed below the demote line)', () => {
    let checked = 0;
    for (const dmgRatio of DMG_RATIOS) {
      for (const perfAvg of PERF_AVGS) {
        for (const starveRatio of STARVE_RATIOS) {
          for (const capReached of CAP_REACHED) {
            const input: KomaAssessmentInput = { capReached, perfAvg, intensAvg: INTENS_AVG_SAFE, dmgRatio, starveRatio };
            const delta = assessKomaDelta(input);
            const { total } = promotionScore(input);
            expect(total >= 100).toBe(delta === 1);
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(DMG_RATIOS.length * PERF_AVGS.length * STARVE_RATIOS.length * CAP_REACHED.length);
  });

  it('names the smallest gating item as the bottleneck (damage-limited example)', () => {
    // dmgRatio=0.5 → 被ダメスコア=40。processing/starveが共に満点でも被ダメが足を引っ張る。
    const r = promotionScore({ capReached: true, perfAvg: 1, intensAvg: 0, dmgRatio: 0.5, starveRatio: 1 });
    expect(r.bottleneck).toBe('damage');
    expect(Math.round(r.total)).toBe(40);
  });

  it('names throughput/starve as the bottleneck when damage is not the limiter', () => {
    // dmgRatioが十分低く(被ダメスコア=100超)、processing側だけが未達。
    const r = promotionScore({ capReached: false, perfAvg: 1, intensAvg: 0, dmgRatio: 0, starveRatio: 0.2 });
    expect(r.bottleneck).toBe('starve'); // capReached=falseなのでthroughputは常に0
  });

  it('clamps the display total at 0 and at PROMOTION_DISPLAY_CAP', () => {
    const zero = promotionScore({ capReached: false, perfAvg: 0, intensAvg: 0, dmgRatio: 1, starveRatio: 0 });
    expect(zero.total).toBe(0);
    const capped = promotionScore({ capReached: true, perfAvg: 1, intensAvg: 0, dmgRatio: 0, starveRatio: 1 });
    expect(capped.total).toBeLessThanOrEqual(120);
  });
});

// PACING_PUZZLE.md §6.27 バッチM50: 連続査定「捌けているか」一本化。
// 検証(§6.27「検証」)の不変条件6つをここで機械化する。
describe('M50 §6.27: rankKillTarget V(r) — ★仮値の係数=2', () => {
  it('the base coefficient lives as a single named constant', () => {
    expect(RANK_KILLS_PER_WINDOW_BASE).toBe(2);
  });

  it('implements the documented formula V(r) = 2 × (1000 / cdBasisForRank(r)) exactly', () => {
    ([1, 2, 3, 4, 5, 6] as PuzzleRank[]).forEach(r => {
      expect(rankKillTarget(r, R7_CAP_MIN)).toBeCloseTo(2 * (1000 / cdBasisForRank(r, R7_CAP_MIN)), 5);
    });
  });

  it('anchors the exact-integer rows of the §6.27 table (R1=2 / R5=5 / R6=8)', () => {
    // R2=2.4/R3=3/R4=4 in the doc's table are the *rounded* display values; the formula's raw
    // output (2.352941.../2.857142.../3.636363...) is what the previous test locks in exactly.
    expect(rankKillTarget(1, R7_CAP_MIN)).toBeCloseTo(2, 5);
    expect(rankKillTarget(5, R7_CAP_MIN)).toBeCloseTo(5, 5);
    expect(rankKillTarget(6, R7_CAP_MIN)).toBeCloseTo(8, 5);
  });

  it('【不変条件3】is monotonically increasing across R1..R6 (higher rank needs more)', () => {
    const targets = ([1, 2, 3, 4, 5, 6] as PuzzleRank[]).map(r => rankKillTarget(r, R7_CAP_MIN));
    for (let i = 1; i < targets.length; i++) expect(targets[i]).toBeGreaterThan(targets[i - 1]);
  });

  it('is Infinity once the R7 cap has grown to the max (CD=0=unreachable target, safe no-op)', () => {
    expect(rankKillTarget(7, R7_CAP_MAX)).toBe(Infinity);
  });
});

describe('M50 §6.27: stepRankWindow (promotion windows)', () => {
  const RANK1 = 1 as PuzzleRank;
  const target = rankKillTarget(RANK1, R7_CAP_MIN); // 2

  // 1つの10秒窓ぶんを進める(窓の最初のtickで撃破を一括投入・残りは移動のみ=撃破0)。
  const runOneWindow = (state: RankWindowState, kills: number) => {
    let r = stepRankWindow(state, { dtMs: 1000, killsThisFrame: kills, rank: RANK1, r7Cap: R7_CAP_MIN });
    for (let i = 1; i < RANK_WINDOW_MS / 1000; i++) {
      r = stepRankWindow(r.state, { dtMs: 1000, killsThisFrame: 0, rank: RANK1, r7Cap: R7_CAP_MIN });
    }
    return r;
  };

  it('【不変条件1】movement only(撃破0)では、窓がいくつ経過しても絶対に昇格しない', () => {
    let state = createRankWindowState();
    let promotedEver = false;
    for (let w = 0; w < 20; w++) {
      const r = runOneWindow(state, 0);
      state = r.state;
      promotedEver = promotedEver || r.promote;
    }
    expect(promotedEver).toBe(false);
    expect(state.windowsClearing).toBe(0);
    expect(state.windowsAtRank).toBe(20);
  });

  it('【不変条件5】RANK_MIN_WINDOWS未満では、全窓が達成でも昇格しない', () => {
    let state = createRankWindowState();
    let r;
    for (let w = 0; w < RANK_MIN_WINDOWS - 1; w++) {
      r = runOneWindow(state, Math.ceil(target));
      expect(r.promote).toBe(false);
      state = r.state;
    }
    expect(state.windowsAtRank).toBe(RANK_MIN_WINDOWS - 1);
  });

  it('RANK_MIN_WINDOWSに達し、全窓が達成していれば昇格する', () => {
    let state = createRankWindowState();
    let r;
    for (let w = 0; w < RANK_MIN_WINDOWS; w++) {
      r = runOneWindow(state, Math.ceil(target));
      state = r.state;
    }
    expect(r!.promote).toBe(true);
  });

  it('【不変条件6】昇格は「半分以上」であって「連続」ではない(飛び飛びでも半分あれば昇格)', () => {
    let state = createRankWindowState();
    // 6窓: 達成/未達/達成/未達/達成/未達 -> 3/6達成(連続ではない)。
    const pattern = [true, false, true, false, true, false];
    let r;
    for (const clear of pattern) {
      r = runOneWindow(state, clear ? Math.ceil(target) : 0);
      state = r.state;
    }
    expect(state.windowsClearing).toBe(3);
    expect(state.windowsAtRank).toBe(6);
    expect(r!.promote).toBe(true); // 3 >= ceil(6/2)=3
  });

  it('半分未満の達成では昇格しない(閾値のすぐ下を確認)', () => {
    let state = createRankWindowState();
    const pattern = [true, false, false, true, false, false]; // 2/6
    let r;
    for (const clear of pattern) {
      r = runOneWindow(state, clear ? Math.ceil(target) : 0);
      state = r.state;
    }
    expect(r!.promote).toBe(false);
  });
});

describe('M50 §6.27: stepHitStreak (「抜け出せなかった時間」で降格)', () => {
  it('【不変条件2】一瞬の集中被弾(HIT_RECENCY_MS=3秒以内に解ける)では降格しない', () => {
    let state = createHitStreakState();
    let r = stepHitStreak(state, { dtMs: 100, msSinceLastHit: 0 });
    state = r.state;
    for (let ms = 100; ms < HIT_RECENCY_MS + 500; ms += 100) {
      r = stepHitStreak(state, { dtMs: 100, msSinceLastHit: ms });
      state = r.state;
      expect(r.demote).toBe(false);
    }
    expect(state.streakMs).toBe(0); // 3秒を超えて途切れた時点でストリークは0へ戻る
  });

  it('【不変条件2】「被弾中」が途切れず続けばDEMOTE_STREAK_MS(8秒)で降格する', () => {
    let state = createHitStreakState();
    let r;
    const dtMs = 100;
    const ticks = DEMOTE_STREAK_MS / dtMs;
    for (let i = 0; i < ticks; i++) {
      // 常に直近500ms以内に被弾がある想定(HIT_RECENCY_MS=3秒の内側)=途切れず「被弾中」。
      r = stepHitStreak(state, { dtMs, msSinceLastHit: 500 });
      state = r.state;
    }
    expect(r!.demote).toBe(true);
  });

  it('8秒に届く前に一度でも途切れれば、その後また被弾が続いても(通算では8秒超でも)降格しない', () => {
    let state = createHitStreakState();
    let r;
    const dtMs = 100;
    for (let i = 0; i < 40; i++) { // 4秒ぶん「被弾中」
      r = stepHitStreak(state, { dtMs, msSinceLastHit: 500 });
      state = r.state;
    }
    // 3秒以上被弾なし=途切れる。
    r = stepHitStreak(state, { dtMs, msSinceLastHit: HIT_RECENCY_MS });
    state = r.state;
    expect(state.streakMs).toBe(0);
    for (let i = 0; i < 40; i++) { // もう4秒ぶん「被弾中」(通算は8秒を超えるが、連続ではない)
      r = stepHitStreak(state, { dtMs, msSinceLastHit: 500 });
      state = r.state;
    }
    expect(r!.demote).toBe(false);
  });
});

describe('M50 §6.27: tickRankPace(合成本体・ランク変更時の自動リセット)', () => {
  it('【不変条件4】昇格が成立すると窓カウンタ・被弾ストリークが全てリセットされる', () => {
    let state = createRankPaceState();
    const rank = 1 as PuzzleRank;
    const target = Math.ceil(rankKillTarget(rank, R7_CAP_MIN));
    let result;
    for (let w = 0; w < RANK_MIN_WINDOWS; w++) {
      for (let i = 0; i < RANK_WINDOW_MS / 1000; i++) {
        result = tickRankPace(state, {
          dtMs: 1000, killsThisFrame: i === 0 ? target : 0, msSinceLastHit: 999999, rank, r7Cap: R7_CAP_MIN,
        });
        state = result.state;
      }
    }
    expect(result!.delta).toBe(1);
    expect(state).toEqual(createRankPaceState());
  });

  it('【不変条件4】降格が成立すると窓カウンタ・被弾ストリークが全てリセットされる', () => {
    let state = createRankPaceState();
    let result;
    const dtMs = 100;
    for (let i = 0; i < DEMOTE_STREAK_MS / dtMs; i++) {
      result = tickRankPace(state, {
        dtMs, killsThisFrame: 0, msSinceLastHit: 500, rank: 3 as PuzzleRank, r7Cap: R7_CAP_MIN,
      });
      state = result.state;
    }
    expect(result!.delta).toBe(-1);
    expect(state).toEqual(createRankPaceState());
  });

  it('【不変条件1】合成本体でも、movement only(撃破0・無被弾)では絶対に昇格しない', () => {
    let state = createRankPaceState();
    let promotedEver = false;
    for (let w = 0; w < 20; w++) {
      for (let i = 0; i < RANK_WINDOW_MS / 1000; i++) {
        const r = tickRankPace(state, {
          dtMs: 1000, killsThisFrame: 0, msSinceLastHit: 999999, rank: 1 as PuzzleRank, r7Cap: R7_CAP_MIN,
        });
        state = r.state;
        promotedEver = promotedEver || r.delta === 1;
      }
    }
    expect(promotedEver).toBe(false);
  });
});
