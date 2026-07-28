import { describe, it, expect } from 'vitest';
import { idolMoveEligible, idolPhaseForHealth, idolFanCount, pickIdolMove, IDOL_RANGE, type IdolMove } from './idolScript';

const allReady = (): Record<IdolMove, boolean> => ({ aim: true, fan: true, roll: true, punch: true });

describe('idolPhaseForHealth — 2相(50%)', () => {
  it('phase1 above 50%', () => {
    expect(idolPhaseForHealth(1)).toBe(1);
    expect(idolPhaseForHealth(0.51)).toBe(1);
  });
  it('phase2 at or below 50%', () => {
    expect(idolPhaseForHealth(0.5)).toBe(2);
    expect(idolPhaseForHealth(0)).toBe(2);
  });
});

describe('idolFanCount — Phase2で3→5(近距離技には影響しない)', () => {
  it('phase1=3 / phase2=5', () => {
    expect(idolFanCount(1)).toBe(3);
    expect(idolFanCount(2)).toBe(5);
  });
});

describe('idolMoveEligible — 「近づくほど安全」= 全ボスの逆(受け入れ条件①の変種: 各帯に技がある)', () => {
  it('遠(>340)はaimのみ', () => {
    expect(idolMoveEligible('aim', 341)).toBe(true);
    expect(idolMoveEligible('fan', 341)).toBe(false);
    expect(idolMoveEligible('roll', 341)).toBe(false);
    expect(idolMoveEligible('punch', 341)).toBe(false);
  });

  it('中(140〜340)はfanのみ', () => {
    expect(idolMoveEligible('fan', 200)).toBe(true);
    expect(idolMoveEligible('aim', 200)).toBe(false);
    expect(idolMoveEligible('roll', 200)).toBe(false);
  });

  it('近(<140)はroll/punchの両方(=弱い技しかない=このボスの主題)', () => {
    expect(idolMoveEligible('roll', 50)).toBe(true);
    expect(idolMoveEligible('punch', 50)).toBe(true);
    expect(idolMoveEligible('aim', 50)).toBe(false);
    expect(idolMoveEligible('fan', 50)).toBe(false);
  });

  it('各帯に必ず1つ以上の技がある(ハメ間合いが無い)', () => {
    const ALL: IdolMove[] = ['aim', 'fan', 'roll', 'punch'];
    for (const d of [0, 100, 139, 140, 200, 340, 341, 900]) {
      expect(ALL.some(m => idolMoveEligible(m, d))).toBe(true);
    }
  });

  it('境界値: distance===NEAR_MAXは近扱い・===MID_MAXは中扱い', () => {
    expect(idolMoveEligible('roll', IDOL_RANGE.NEAR_MAX)).toBe(true);
    expect(idolMoveEligible('fan', IDOL_RANGE.NEAR_MAX)).toBe(false);
    expect(idolMoveEligible('fan', IDOL_RANGE.MID_MAX)).toBe(true);
    expect(idolMoveEligible('aim', IDOL_RANGE.MID_MAX)).toBe(false);
  });
});

describe('pickIdolMove', () => {
  it('遠帯では常にaim', () => {
    expect(pickIdolMove(500, allReady(), () => 0.5)).toBe('aim');
  });

  it('中帯では常にfan', () => {
    expect(pickIdolMove(250, allReady(), () => 0.5)).toBe('fan');
  });

  it('近帯ではroll/punchのどちらかを等確率で返す', () => {
    const pick = pickIdolMove(50, allReady(), () => 0);
    expect(['roll', 'punch']).toContain(pick);
  });

  it('readyでない技は選ばれない', () => {
    const ready = allReady(); ready.roll = false;
    expect(pickIdolMove(50, ready, () => 0.9)).toBe('punch');
  });

  it('何もreadyでなければnull', () => {
    const ready: Record<IdolMove, boolean> = { aim: false, fan: false, roll: false, punch: false };
    expect(pickIdolMove(50, ready)).toBeNull();
  });
});
