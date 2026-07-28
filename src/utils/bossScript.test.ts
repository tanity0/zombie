import { describe, it, expect } from 'vitest';
import {
  BOSS_RECOVER_TINT, BOSS_ALERT_SFX_KEY,
  isWindupPhase, isRecoverPhase, isCounterablePhase, bossWindupJustEntered,
  bandForDistance, type RangeBand,
  phaseForHealth, phaseJustChanged,
  pickEligibleMove, pickComboFollowup,
} from './bossScript';

describe('shared constants', () => {
  it('BOSS_RECOVER_TINT matches the existing giant/thor blue-white value (§6.26-4(d))', () => {
    expect(BOSS_RECOVER_TINT).toBe(0xbfe8ff);
  });
  it('BOSS_ALERT_SFX_KEY is the shared hunter-alert placeholder (§6.26-9 #5)', () => {
    expect(BOSS_ALERT_SFX_KEY).toBe('hunter-alert');
  });
});

describe('isWindupPhase / isRecoverPhase / isCounterablePhase (W6/W7)', () => {
  const windups = ['a-windup', 'b-windup'];
  const recovers = ['a-recover', 'b-recover'];

  it('windup phases are windup but not recover', () => {
    expect(isWindupPhase('a-windup', windups)).toBe(true);
    expect(isRecoverPhase('a-windup', recovers)).toBe(false);
  });
  it('recover phases are recover but not windup', () => {
    expect(isRecoverPhase('a-recover', recovers)).toBe(true);
    expect(isWindupPhase('a-recover', windups)).toBe(false);
  });
  it('active/idle phases are neither', () => {
    expect(isWindupPhase('a-active', windups)).toBe(false);
    expect(isRecoverPhase('a-active', recovers)).toBe(false);
    expect(isWindupPhase(undefined, windups)).toBe(false);
    expect(isRecoverPhase(undefined, recovers)).toBe(false);
  });
  it('isCounterablePhase = windup OR recover only (active is left to the caller = false)', () => {
    expect(isCounterablePhase('a-windup', windups, recovers)).toBe(true);
    expect(isCounterablePhase('a-recover', windups, recovers)).toBe(true);
    expect(isCounterablePhase('a-active', windups, recovers)).toBe(false);
    expect(isCounterablePhase(undefined, windups, recovers)).toBe(false);
  });
});

describe('bossWindupJustEntered (§6.28-12: 連射系は1発目のみ=エッジ検知)', () => {
  const windups = ['stomp-windup', 'sweep-windup'];
  it('is true only on the transition frame into a windup phase', () => {
    expect(bossWindupJustEntered(undefined, 'stomp-windup', windups)).toBe(true);
    expect(bossWindupJustEntered('stomp-windup', 'stomp-windup', windups)).toBe(false); // 同じwindup内では鳴らし続けない
  });
  it('is false when not currently in a windup phase', () => {
    expect(bossWindupJustEntered(undefined, undefined, windups)).toBe(false);
    expect(bossWindupJustEntered('stomp-windup', 'stomp-active', windups)).toBe(false);
  });
  it('re-fires when switching directly from one windup to a different windup', () => {
    expect(bossWindupJustEntered('stomp-windup', 'sweep-windup', windups)).toBe(true);
  });
});

describe('bandForDistance (GIANT_RANGEパターンの一般形)', () => {
  type Band = 'melee' | 'near' | 'far';
  const bands: RangeBand<Band>[] = [
    { id: 'melee', max: 140 },
    { id: 'near', max: 320 },
    { id: 'far', max: 1000 },
  ];
  it('classifies distances into the ascending band list', () => {
    expect(bandForDistance(0, bands)).toBe('melee');
    expect(bandForDistance(140, bands)).toBe('melee');
    expect(bandForDistance(141, bands)).toBe('near');
    expect(bandForDistance(1000, bands)).toBe('far');
  });
  it('returns null beyond the last band', () => {
    expect(bandForDistance(1001, bands)).toBeNull();
  });
});

describe('phaseForHealth / phaseJustChanged (N段階版)', () => {
  it('2段(ジャイアント相当・閾値60%)', () => {
    expect(phaseForHealth(1, [0.6])).toBe(1);
    expect(phaseForHealth(0.61, [0.6])).toBe(1);
    expect(phaseForHealth(0.6, [0.6])).toBe(2);
    expect(phaseForHealth(0, [0.6])).toBe(2);
  });
  it('3段(スカジ/トール相当・閾値70%/35%)', () => {
    expect(phaseForHealth(1, [0.7, 0.35])).toBe(1);
    expect(phaseForHealth(0.7, [0.7, 0.35])).toBe(2);
    expect(phaseForHealth(0.4, [0.7, 0.35])).toBe(2);
    expect(phaseForHealth(0.35, [0.7, 0.35])).toBe(3);
    expect(phaseForHealth(0, [0.7, 0.35])).toBe(3);
  });
  it('phaseJustChanged is false on the first frame (no previous phase) and while staying put', () => {
    expect(phaseJustChanged(undefined, 1)).toBe(false);
    expect(phaseJustChanged(1, 1)).toBe(false);
  });
  it('phaseJustChanged is true exactly on the transition frame', () => {
    expect(phaseJustChanged(1, 2)).toBe(true);
    expect(phaseJustChanged(2, 3)).toBe(true);
  });
});

describe('pickEligibleMove (等確率抽選の一般形)', () => {
  type Move = 'a' | 'b' | 'c';
  const all: Move[] = ['a', 'b', 'c'];
  it('returns null when nothing is eligible', () => {
    expect(pickEligibleMove(all, () => false)).toBeNull();
  });
  it('only returns eligible candidates (deterministic rand injection)', () => {
    expect(pickEligibleMove(all, m => m === 'b', () => 0)).toBe('b');
  });
  it('picks uniformly among the eligible pool via the injected rand', () => {
    expect(pickEligibleMove(all, () => true, () => 0)).toBe('a');
    expect(pickEligibleMove(all, () => true, () => 0.999)).toBe('c');
  });
});

describe('pickComboFollowup (確率つき追撃の一般形)', () => {
  type Move = 'sweep' | 'stomp' | 'dash' | 'jump';
  const table: Partial<Record<Move, Move>> = { sweep: 'stomp', dash: 'stomp' };
  it('returns null when no follow-up is defined for the finished move', () => {
    expect(pickComboFollowup('jump', table, 0.4, () => true, () => 0)).toBeNull();
  });
  it('returns null when the follow-up is not eligible (e.g. out of range)', () => {
    expect(pickComboFollowup('sweep', table, 0.4, () => false, () => 0)).toBeNull();
  });
  it('fires under the chance threshold, and not above it', () => {
    expect(pickComboFollowup('sweep', table, 0.4, () => true, () => 0.39)).toBe('stomp');
    expect(pickComboFollowup('sweep', table, 0.4, () => true, () => 0.41)).toBeNull();
    expect(pickComboFollowup('dash', table, 0.4, () => true, () => 0.39)).toBe('stomp');
  });
});
