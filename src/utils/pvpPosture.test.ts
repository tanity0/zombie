// ★対人の体勢システム(SAME_ARENA.md §9)の不変条件。
import { describe, it, expect } from 'vitest';
import {
  freshPvpPosture, chipPvpPosture, tickPvpPosture, markPvpCritSlow,
  isPvpIncapacitated, isPvpFatalTarget, pvpMoveMult, pvpFatalDamage, pvpAfterFatal,
  PVP_POSTURE_MAX, PVP_BREAK_MS, PVP_SLOW_MULT, PVP_SLOW_MS, PVP_REBREAK_LOCK_MS,
  PVP_IMPACT_RATIO,
} from './pvpPosture';
import {
  BOSS_POSTURE_RECOVERY_DELAY_MS, BOSS_POSTURE_RECOVERY_PER_SEC,
} from './bossPosture';

describe('対人体勢: 削り(ボスと同じ削り率・カウンター5回で紫)', () => {
  it('削り率はボスの IMPACT_RATIO と同値(counter 0.20 / melee 0.04 / gun-crit 0.05 / reflect 0.05)', () => {
    expect(PVP_IMPACT_RATIO).toEqual({ counter: 0.20, melee: 0.04, 'gun-crit': 0.05, reflect: 0.05 });
  });

  it('counter×5 で紫(breakUntil=+3秒・ロック=紫明け+6秒)', () => {
    let s = freshPvpPosture();
    let broke = false;
    for (let i = 0; i < 5; i++) {
      const r = chipPvpPosture(s, 'counter', 1000 + i);
      s = r.next; broke = r.broke;
    }
    expect(broke).toBe(true);
    expect(s.posture).toBe(0);
    expect(s.breakUntil).toBe(1004 + PVP_BREAK_MS);
    expect(s.lockUntil).toBe(1004 + PVP_BREAK_MS + PVP_REBREAK_LOCK_MS);
    expect(isPvpIncapacitated(s, 1005)).toBe(true);
    expect(isPvpFatalTarget(s, 1005)).toBe(true);
  });

  it('紫中・ロック中は削れない', () => {
    let s = freshPvpPosture();
    for (let i = 0; i < 5; i++) s = chipPvpPosture(s, 'counter', 1000).next;
    const inBreak = chipPvpPosture(s, 'counter', 1500);
    expect(inBreak.next.posture).toBe(0);
    expect(inBreak.broke).toBe(false);
    // 紫明け(tickで満タン)後もロックが残っている間は削れない。
    const after = tickPvpPosture(s, 1000 + PVP_BREAK_MS + 1, 0.016)!;
    expect(after.posture).toBe(PVP_POSTURE_MAX);
    const locked = chipPvpPosture(after, 'counter', 1000 + PVP_BREAK_MS + 100);
    expect(locked.next.posture).toBe(PVP_POSTURE_MAX);
  });

  it('回復ラチェット: 75/50/25%を割ったらそこが回復上限', () => {
    let s = freshPvpPosture();
    s = chipPvpPosture(s, 'counter', 0).next;   // 100→80
    s = chipPvpPosture(s, 'counter', 1).next;   // 80→60(75%=75を割った→cap75)
    expect(s.recoveryCap).toBe(75);
    // 8秒後から3%/s。capの75で止まる。
    const t0 = 1 + BOSS_POSTURE_RECOVERY_DELAY_MS;
    let cur = s;
    for (let i = 0; i < 1000; i++) {
      const n = tickPvpPosture(cur, t0 + i * 100, 0.1);
      if (n) cur = n;
    }
    expect(cur.posture).toBe(75);
  });

  it('回復は最後の削りから8秒間は始まらない・速度は3%/s', () => {
    const s = { ...freshPvpPosture(), posture: 50, recoveryCap: 100, lastChipAt: 1000 };
    expect(tickPvpPosture(s, 1000 + BOSS_POSTURE_RECOVERY_DELAY_MS - 1, 0.1)).toBeNull();
    const n = tickPvpPosture(s, 1000 + BOSS_POSTURE_RECOVERY_DELAY_MS + 1, 1)!;
    expect(n.posture).toBeCloseTo(50 + PVP_POSTURE_MAX * BOSS_POSTURE_RECOVERY_PER_SEC, 6);
  });
});

describe('対人体勢: 紫と致命', () => {
  const broken = (): ReturnType<typeof freshPvpPosture> => {
    let s = freshPvpPosture();
    for (let i = 0; i < 5; i++) s = chipPvpPosture(s, 'counter', 1000).next;
    return s;
  };

  it('紫明けのtickで体勢は満タンへ戻る(0のまま復帰しない)', () => {
    const s = broken();
    const n = tickPvpPosture(s, 1000 + PVP_BREAK_MS + 1, 0.016)!;
    expect(n.posture).toBe(PVP_POSTURE_MAX);
    expect(n.breakUntil).toBeUndefined();
  });

  it('致命の一撃=×5+最大HP25%(裁定②)', () => {
    expect(pvpFatalDamage(10, 200)).toBe(10 * 5 + 200 * 0.25);
  });

  it('致命後は満タン+daze2秒(dazeは行動不能だが致命の対象ではない=連鎖しない)', () => {
    const s = pvpAfterFatal(broken(), 2000);
    expect(s.posture).toBe(PVP_POSTURE_MAX);
    expect(isPvpIncapacitated(s, 2100)).toBe(true);   // daze中=動けない
    expect(isPvpFatalTarget(s, 2100)).toBe(false);    // だが致命は取れない
    expect(isPvpIncapacitated(s, 2000 + 2000 + 1)).toBe(false);
  });
});

describe('対人体勢: クリ被弾の2/3減速', () => {
  it('クリを受けると3秒間×2/3・窓の外は×1', () => {
    const s = markPvpCritSlow(undefined, 5000);
    expect(pvpMoveMult(s, 5001)).toBe(PVP_SLOW_MULT);
    expect(pvpMoveMult(s, 5000 + PVP_SLOW_MS + 1)).toBe(1);
    expect(pvpMoveMult(undefined, 0)).toBe(1);
  });
});
