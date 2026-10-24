import { describe, it, expect } from 'vitest';
import {
  BOSS_RECOVER_TINT, BOSS_ALERT_SFX_KEY,
  isWindupPhase, isRecoverPhase, isCounterablePhase, bossWindupJustEntered,
  bandForDistance, type RangeBand,
  phaseForHealth, phaseJustChanged,
  pickEligibleMove, pickComboFollowup,
  BOSS_RANGE, bossZoneForDistance, pickWeightedMove, type BossZone,
} from './bossScript';
import { GIANT_RANGE, giantZoneForDistance } from './giantScript';

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


// ==== v0.25.2609(ボス動き横断監査・バッチ1): 全ボス共通の距離ゾーン ==========================
describe('BOSS_RANGE — 城ボスのGIANT_RANGEと同値であること(複製のズレ検知)', () => {
  it('境界値が一致する', () => {
    expect(BOSS_RANGE.MELEE_MAX).toBe(GIANT_RANGE.MELEE_MAX);
    expect(BOSS_RANGE.NEAR_MAX).toBe(GIANT_RANGE.NEAR_MAX);
    expect(BOSS_RANGE.MID_MAX).toBe(GIANT_RANGE.MID_MAX);
  });
  it('ゾーン判定も城ボスと完全に一致する(境界±1を含めて全走査)', () => {
    const probes = [0, 1, 119, 120, 121, 299, 300, 301, 599, 600, 601, 1000, 5000];
    for (const d of probes) {
      expect(bossZoneForDistance(d), `distance=${d}`).toBe(giantZoneForDistance(d));
    }
  });
  it('遠ゾーンに上限が無い(引き撃ちで安全な距離を作らせない・BOSS_RANGE_REWORK.mdの帰結)', () => {
    expect(bossZoneForDistance(999999)).toBe('far');
  });
  it('境界は「上限を含む(<=)」の既存作法', () => {
    const expected: [number, BossZone][] = [
      [120, 'melee'], [121, 'near'], [300, 'near'], [301, 'mid'], [600, 'mid'], [601, 'far'],
    ];
    for (const [d, zone] of expected) expect(bossZoneForDistance(d), `distance=${d}`).toBe(zone);
  });
});

describe('pickWeightedMove — 重み比例ルーレット', () => {
  type M = 'a' | 'b' | 'c';
  const moves: M[] = ['a', 'b', 'c'];
  const allReady: Record<M, boolean> = { a: true, b: true, c: true };
  const w = (m: M): number => ({ a: 10, b: 30, c: 60 }[m]);

  it('累積境界どおりに選ぶ(rand=0→先頭)', () => {
    expect(pickWeightedMove(moves, w, allReady, () => 0)).toBe('a');
    expect(pickWeightedMove(moves, w, allReady, () => 0.05)).toBe('a');   // 0..10%
    expect(pickWeightedMove(moves, w, allReady, () => 0.2)).toBe('b');    // 10..40%
    expect(pickWeightedMove(moves, w, allReady, () => 0.5)).toBe('c');    // 40..100%
  });
  it('rand=1.0ちょうどの端は最後の候補へ落ちる(nullにしない安全網)', () => {
    expect(pickWeightedMove(moves, w, allReady, () => 1)).toBe('c');
  });
  it('重み0の技は選ばれない', () => {
    const zeroB = (m: M): number => (m === 'b' ? 0 : w(m));
    for (let i = 0; i < 200; i++) expect(pickWeightedMove(moves, zeroB, allReady)).not.toBe('b');
  });
  it('readyでない技は選ばれない', () => {
    const ready: Record<M, boolean> = { a: true, b: false, c: true };
    for (let i = 0; i < 200; i++) expect(pickWeightedMove(moves, w, ready)).not.toBe('b');
  });
  it('候補が全滅したらnull', () => {
    const none: Record<M, boolean> = { a: false, b: false, c: false };
    expect(pickWeightedMove(moves, w, none)).toBeNull();
    expect(pickWeightedMove(moves, () => 0, allReady)).toBeNull();
  });
  it('分布がおおよそ重みどおり(10/30/60・許容±4pt)', () => {
    const N = 20000;
    const c: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < N; i++) {
      const m = pickWeightedMove(moves, w, allReady);
      if (m) c[m] += 1;
    }
    expect(Math.abs((c.a / N) * 100 - 10)).toBeLessThan(4);
    expect(Math.abs((c.b / N) * 100 - 30)).toBeLessThan(4);
    expect(Math.abs((c.c / N) * 100 - 60)).toBeLessThan(4);
  });
});
