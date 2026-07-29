import { describe, it, expect } from 'vitest';
import {
  giantPhaseForHealth, giantPhaseJustChanged, giantMoveEligible, pickGiantMove, pickGiantCombo,
  giantPhaseForHealthStory, pickGiantStoryCombo,
  giantStageRangeMult,
  GIANT_RANGE, type GiantMove,
} from './giantScript';

const ALL_MOVES: GiantMove[] = ['stomp', 'sweep', 'jump', 'dash', 'bolt'];
const allReady = (): Record<GiantMove, boolean> => ({ stomp: true, sweep: true, jump: true, dash: true, bolt: true });

describe('giantPhaseForHealth', () => {
  it('is phase 1 above the 60% threshold', () => {
    expect(giantPhaseForHealth(1)).toBe(1);
    expect(giantPhaseForHealth(0.61)).toBe(1);
  });
  it('is phase 2 at or below the 60% threshold', () => {
    expect(giantPhaseForHealth(0.6)).toBe(2);
    expect(giantPhaseForHealth(0.1)).toBe(2);
    expect(giantPhaseForHealth(0)).toBe(2);
  });
});

describe('giantPhaseJustChanged', () => {
  it('is false on the very first frame (no previous phase yet)', () => {
    expect(giantPhaseJustChanged(undefined, 1)).toBe(false);
    expect(giantPhaseJustChanged(undefined, 2)).toBe(false);
  });
  it('is false while staying in the same phase', () => {
    expect(giantPhaseJustChanged(1, 1)).toBe(false);
    expect(giantPhaseJustChanged(2, 2)).toBe(false);
  });
  it('is true exactly on the transition frame', () => {
    expect(giantPhaseJustChanged(1, 2)).toBe(true);
  });
});

describe('giantMoveEligible — 受け入れ条件①③: 各帯(密着含む)に必ず1つ以上の技がある', () => {
  const bandSamples = [70, 230, 470, 800]; // 密着/近/中/遠の代表距離

  it('every band has at least one eligible move in phase 1', () => {
    for (const d of bandSamples) {
      const anyEligible = ALL_MOVES.some(m => giantMoveEligible(m, d, 1));
      expect(anyEligible).toBe(true);
    }
  });

  it('every band has at least one eligible move in phase 2', () => {
    for (const d of bandSamples) {
      const anyEligible = ALL_MOVES.some(m => giantMoveEligible(m, d, 2));
      expect(anyEligible).toBe(true);
    }
  });

  it('密着帯(0〜140)にはstompが必ずある=ハメ間合いが存在しない', () => {
    expect(giantMoveEligible('stomp', 0, 1)).toBe(true);
    expect(giantMoveEligible('stomp', 140, 1)).toBe(true);
    expect(giantMoveEligible('stomp', 70, 2)).toBe(true);
  });

  it('sweep is phase-2 only', () => {
    expect(giantMoveEligible('sweep', 230, 1)).toBe(false);
    expect(giantMoveEligible('sweep', 230, 2)).toBe(true);
  });
});

describe('giantMoveEligible — 受け入れ条件②: Phase2で追加されるのは種類/頻度だけ(既存技の帯を狭めない)', () => {
  it('phase 2 never removes eligibility phase 1 already granted (monotonic)', () => {
    for (let d = 0; d <= GIANT_RANGE.FAR_MAX; d += 10) {
      for (const m of ALL_MOVES) {
        if (giantMoveEligible(m, d, 1)) {
          expect(giantMoveEligible(m, d, 2)).toBe(true);
        }
      }
    }
  });
});

describe('pickGiantMove', () => {
  it('returns null when nothing is ready or eligible', () => {
    expect(pickGiantMove(70, 1, { stomp: false, sweep: false, jump: false, dash: false, bolt: false })).toBeNull();
    expect(pickGiantMove(5000, 1, allReady())).toBeNull(); // 全帯の外
  });

  it('only returns eligible+ready moves (deterministic rand injection)', () => {
    // 距離230(近帯)・phase1: stomp/sweep/dash/boltは不適格、jumpのみ適格。
    const ready = allReady();
    const pick = pickGiantMove(230, 1, ready, () => 0);
    expect(pick).toBe('jump');
  });

  it('respects the ready gate even when eligible', () => {
    const ready = allReady();
    ready.jump = false;
    // 230は jump のみ適格だったので、readyを落とすと候補が空になる。
    expect(pickGiantMove(230, 1, ready)).toBeNull();
  });

  it('picks uniformly among the candidate pool via the injected rand', () => {
    // 距離800(遠帯): dashのみ適格。
    const pick = pickGiantMove(800, 2, allReady(), () => 0.999);
    expect(pick).toBe('dash');
  });
});

describe('pickGiantCombo — 受け入れ条件(6.26-9 #8): 40%・許可2組のみ', () => {
  it('never combos in phase 1', () => {
    expect(pickGiantCombo('sweep', 1, 70, () => 0)).toBeNull();
    expect(pickGiantCombo('dash', 1, 70, () => 0)).toBeNull();
  });

  it('only sweep->stomp and dash->stomp are allowed follow-ups', () => {
    expect(pickGiantCombo('jump', 2, 70, () => 0)).toBeNull();
    expect(pickGiantCombo('bolt', 2, 70, () => 0)).toBeNull();
    expect(pickGiantCombo('stomp', 2, 70, () => 0)).toBeNull();
  });

  it('requires the target to still be in the follow-up move\'s band', () => {
    // stompの追撃はdistance<=140が必要。800は密着帯の外なのでnull。
    expect(pickGiantCombo('sweep', 2, 800, () => 0)).toBeNull();
    expect(pickGiantCombo('dash', 2, 800, () => 0)).toBeNull();
  });

  it('fires the follow-up under the 40% threshold, and not above it', () => {
    expect(pickGiantCombo('sweep', 2, 70, () => 0.39)).toBe('stomp');
    expect(pickGiantCombo('sweep', 2, 70, () => 0.41)).toBeNull();
    expect(pickGiantCombo('dash', 2, 70, () => 0.39)).toBe('stomp');
  });
});

// ====================================================================================
// M60(PACING_PUZZLE.md §6.28-11): グレン/未確認変異体(storyBoss)専用のPhase3。
// これらのテストが守るのは「storyBoss専用の新規関数が正しいこと」であって、上のPhase1/2の
// テスト(通常城ボスが今も使う関数)は1つも書き換えていない=不変性の担保はそのまま生きている。
// ====================================================================================

describe('giantPhaseForHealthStory — 受け入れ条件: Phase1/2の境界は通常版と完全一致・Phase3はHP30%以下', () => {
  it('is phase 1 above the 60% threshold (通常版giantPhaseForHealthと同じ境界)', () => {
    expect(giantPhaseForHealthStory(1)).toBe(1);
    expect(giantPhaseForHealthStory(0.61)).toBe(1);
  });
  it('is phase 2 between 30%(exclusive) and 60%(inclusive)', () => {
    expect(giantPhaseForHealthStory(0.6)).toBe(2);
    expect(giantPhaseForHealthStory(0.31)).toBe(2);
  });
  it('is phase 3 at or below the 30% threshold', () => {
    expect(giantPhaseForHealthStory(0.3)).toBe(3);
    expect(giantPhaseForHealthStory(0.1)).toBe(3);
    expect(giantPhaseForHealthStory(0)).toBe(3);
  });
  it('never disagrees with giantPhaseForHealth above the phase-3 threshold(=通常城ボスと同じ挙動)', () => {
    for (let f = 0.31; f <= 1; f += 0.01) {
      expect(giantPhaseForHealthStory(f)).toBe(giantPhaseForHealth(f));
    }
  });
});

describe('giantMoveEligible(phase=3) — sweepはPhase2で解禁されたままPhase3でも消えない', () => {
  it('sweep stays eligible in phase 3 with the same band as phase 2', () => {
    expect(giantMoveEligible('sweep', 230, 3)).toBe(true);
    expect(giantMoveEligible('sweep', 70, 3)).toBe(false);  // 密着帯の外
    expect(giantMoveEligible('sweep', 400, 3)).toBe(false); // 近帯の外
  });
  it('phase does not change stomp/jump/dash/bolt eligibility (1と2と3で同じ)', () => {
    const samples = [70, 230, 470, 800];
    for (const d of samples) {
      for (const m of ['stomp', 'jump', 'dash', 'bolt'] as GiantMove[]) {
        expect(giantMoveEligible(m, d, 3)).toBe(giantMoveEligible(m, d, 2));
        expect(giantMoveEligible(m, d, 3)).toBe(giantMoveEligible(m, d, 1));
      }
    }
  });
});

describe('pickGiantStoryCombo — 受け入れ条件(§6.28-11 #2/#3): 薙ぎ払い→踏み鳴らし→突進の3発', () => {
  it('has no follow-up for jump/bolt (第4の連携は作らない)', () => {
    expect(pickGiantStoryCombo('jump', 70, false, () => 0)).toBeNull();
    expect(pickGiantStoryCombo('bolt', 70, false, () => 0)).toBeNull();
  });

  it('keeps the existing 2 pairs alive at phase3 (sweep→stomp / dash→stomp)', () => {
    expect(pickGiantStoryCombo('sweep', 70, false, () => 0)).toBe('stomp');
    expect(pickGiantStoryCombo('dash', 70, false, () => 0)).toBe('stomp');
  });

  it('adds the phase3-only 3rd link: stomp→dash', () => {
    // stomp→dashの帯はdash自体の帯(320<d<=1000)を要求する。
    expect(pickGiantStoryCombo('stomp', 500, false, () => 0)).toBe('dash');
    expect(pickGiantStoryCombo('stomp', 70, false, () => 0)).toBeNull(); // dashの帯の外
  });

  it('requires the target to still be in the follow-up move\'s band', () => {
    expect(pickGiantStoryCombo('sweep', 800, false, () => 0)).toBeNull();
    expect(pickGiantStoryCombo('dash', 800, false, () => 0)).toBeNull();
  });

  it('fires under 60% for グレン(stage-7), not above it', () => {
    expect(pickGiantStoryCombo('sweep', 70, false, () => 0.59)).toBe('stomp');
    expect(pickGiantStoryCombo('sweep', 70, false, () => 0.61)).toBeNull();
  });

  it('fires under 70% for 未確認変異体(stage-ex1・isEx=true), not above it', () => {
    expect(pickGiantStoryCombo('sweep', 70, true, () => 0.69)).toBe('stomp');
    expect(pickGiantStoryCombo('sweep', 70, true, () => 0.71)).toBeNull();
  });

  it('can chain the full 3発(薙ぎ払い→踏み鳴らし→突進)when each roll clears and the target stays in range', () => {
    const first = pickGiantStoryCombo('sweep', 70, false, () => 0);
    expect(first).toBe('stomp');
    const second = pickGiantStoryCombo(first as GiantMove, 500, false, () => 0);
    expect(second).toBe('dash');
  });

  it('does not force a 4th hit(標的が次技の帯の外なら連携は自然に終わる)', () => {
    // dashの直後、標的が密着帯(stompの帯)の外にいれば連携はここで止まる。
    expect(pickGiantStoryCombo('dash', 500, false, () => 0)).toBeNull();
  });

  it('a 4th+ hit can still occur if the target re-enters the next move\'s band(履歴を持たず間合いと確率だけで判断=トールのharai自己ループと同じ作法。既存dash→stompの2組は維持=原則⑥)', () => {
    expect(pickGiantStoryCombo('dash', 70, false, () => 0)).toBe('stomp');
  });
});

describe('giantStageRangeMult(M65・社長指示: ステージ別の踏み鳴らし/着地AoE/突進速度の倍率)', () => {
  it('stage-1 is exactly 1.00 (実機合格済みの基準・回帰ガード=最重要)', () => {
    expect(giantStageRangeMult('stage-1')).toBe(1);
  });

  it('is monotonically non-decreasing in stage order (1→3→4→5→6→7→ex1)', () => {
    const order = ['stage-1', 'stage-3', 'stage-4', 'stage-5', 'stage-6', 'stage-7', 'stage-ex1'];
    const values = order.map(id => giantStageRangeMult(id));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it('matches the confirmed table values exactly', () => {
    expect(giantStageRangeMult('stage-1')).toBeCloseTo(1.00);
    expect(giantStageRangeMult('stage-3')).toBeCloseTo(1.10);
    expect(giantStageRangeMult('stage-4')).toBeCloseTo(1.20);
    expect(giantStageRangeMult('stage-5')).toBeCloseTo(1.30);
    expect(giantStageRangeMult('stage-6')).toBeCloseTo(1.40);
    expect(giantStageRangeMult('stage-7')).toBeCloseTo(1.50);
    expect(giantStageRangeMult('stage-ex1')).toBeCloseTo(1.50);
  });

  it('falls back to 1.00 for unknown/未定義 stage IDs (安全側)', () => {
    expect(giantStageRangeMult('nonexistent')).toBe(1);
    expect(giantStageRangeMult('')).toBe(1);
    expect(giantStageRangeMult('stage-2')).toBe(1); // 研究所=城ボスが出ないステージ。表に無い=安全側
    expect(giantStageRangeMult('stage-tutorial')).toBe(1);
  });

  it('enabled=false (相当 `?giantstage=0`) forces every stage back to 1.00', () => {
    expect(giantStageRangeMult('stage-1', false)).toBe(1);
    expect(giantStageRangeMult('stage-3', false)).toBe(1);
    expect(giantStageRangeMult('stage-7', false)).toBe(1);
    expect(giantStageRangeMult('stage-ex1', false)).toBe(1);
    expect(giantStageRangeMult('nonexistent', false)).toBe(1);
  });
});
