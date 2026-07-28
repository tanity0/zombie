import { describe, it, expect } from 'vitest';
import {
  giantPhaseForHealth, giantPhaseJustChanged, giantMoveEligible, pickGiantMove, pickGiantCombo,
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
