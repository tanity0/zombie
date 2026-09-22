// ★薙ぎ払いの絵の区間割り。社長支給2026-09-22「伐採人の薙払いの時のモーション」。
import { describe, it, expect } from 'vitest';
import {
  enemySweepFrame, sweepPhaseOf, sweepSplitFrames, sweepImpactFrame, sweepWindupLastFrame,
  LOGGER_SWEEP_PHASES,
} from './enemySweepSheet';
import { ENEMY_SWEEP_SHEETS, sweepSheetName, sweepSheetSplit } from './enemySheets';
import { LOGGER_SWEEP_WINDUP_MS, LOGGER_SWEEP_ACTIVE_MS, LOGGER_SWEEP_RECOVER_MS, ENEMY_ATTACK_SPEED_MULT } from '../store/gameStore';

const ALL = Object.entries(ENEMY_SWEEP_SHEETS);
const SP = ENEMY_SWEEP_SHEETS['reaper-common'];

describe('★表', () => {
  it('シート名は<立ち絵名>-sweep', () => {
    expect(sweepSheetName('reaper-common')).toBe('reaper-common-sweep');
    expect(sweepSheetSplit('zzz-not-a-sheet')).toBeNull();
    expect(sweepSheetSplit(null)).toBeNull();
  });

  it('★どの区間も1コマ以上ある(0だと区間ごと消える)', () => {
    expect(ALL.length).toBeGreaterThan(0);
    for (const [n, sp] of ALL) {
      expect(sp.windup, n).toBeGreaterThan(0);
      expect(sp.active, n).toBeGreaterThan(0);
      expect(sp.recover, n).toBeGreaterThan(0);
      expect(sweepSplitFrames(sp), n).toBe(sp.windup + sp.active + sp.recover);
    }
  });

  it('★store の aiPhase からしか区間を引かない(知らない技には出さない)', () => {
    expect(sweepPhaseOf('logger-sweep-windup')).toBe('windup');
    expect(sweepPhaseOf('logger-sweep-active')).toBe('active');
    expect(sweepPhaseOf('logger-sweep-recover')).toBe('recover');
    expect(sweepPhaseOf('driller-thrust')).toBeNull();   // 削岩型の突きは別の絵
    expect(sweepPhaseOf('charge')).toBeNull();
    expect(sweepPhaseOf(undefined)).toBeNull();
    // 表の3つは store の実際の文字列と綴りが一致していること(1文字違うと一生出ない)
    expect(Object.keys(LOGGER_SWEEP_PHASES).sort())
      .toEqual(['logger-sweep-active', 'logger-sweep-recover', 'logger-sweep-windup']);
  });
});

describe('★★掟③: 当たる瞬間 = 薙ぎ区間の先頭コマ', () => {
  it('溜めの最後のコマが終わった次のコマが、薙ぎの先頭', () => {
    for (const [n, sp] of ALL) {
      expect(enemySweepFrame(sp, 'windup', 0.999), n).toBe(sweepWindupLastFrame(sp));
      expect(enemySweepFrame(sp, 'active', 0), n).toBe(sweepImpactFrame(sp));
      expect(sweepImpactFrame(sp), n).toBe(sweepWindupLastFrame(sp) + 1);
    }
  });

  it('★伐採人: 刃が地を噛むコマ(1)が、カプセルの積まれる瞬間に出る', () => {
    // store は `logger-sweep-windup` の満了でカプセルを1回積み、その瞬間 `-active` へ移る。
    expect(sweepImpactFrame(SP)).toBe(1);
    expect(enemySweepFrame(SP, 'windup', 1)).toBe(0);   // 溜めは行き過ぎても0コマ目で待つ
    expect(enemySweepFrame(SP, 'active', 0)).toBe(1);
  });

  it('区間の境目でコマが飛ばない / 戻りの終わりで null', () => {
    for (const [n, sp] of ALL) {
      const total = sweepSplitFrames(sp);
      expect(enemySweepFrame(sp, 'windup', 0), n).toBe(0);
      expect(enemySweepFrame(sp, 'recover', 0), n).toBe(enemySweepFrame(sp, 'active', 1)! + 1);
      expect(enemySweepFrame(sp, 'recover', 0.999), n).toBe(total - 1);
      expect(enemySweepFrame(sp, 'recover', 1), n).toBeNull();
      expect(enemySweepFrame(sp, 'recover', 9), n).toBeNull();
    }
  });

  it('★どの区間も全コマを1度は通る / 番号は必ず範囲内', () => {
    for (const [n, sp] of ALL) {
      const total = sweepSplitFrames(sp);
      const seen = new Set<number>();
      for (let p = 0; p < 1; p += 0.002) {
        for (const ph of ['windup', 'active', 'recover'] as const) {
          const i = enemySweepFrame(sp, ph, p);
          if (i !== null) { expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(total); seen.add(i); }
        }
      }
      expect(seen.size, n).toBe(total);
    }
  });

  it('進み具合が負や巨大でも壊れない', () => {
    for (const p of [-9, -0.1, 0, 0.5, 1, 99]) {
      for (const ph of ['windup', 'active', 'recover'] as const) {
        const i = enemySweepFrame(SP, ph, p);
        if (i !== null) { expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(sweepSplitFrames(SP)); }
      }
    }
  });
});

// ★★60fpsで見た時にコマが飛ばないこと。尺は**判定と同じ出どころ**(store の生値 ÷ ゲームスピード)。
describe('★★画面で全コマが出る(実効の尺で数える)', () => {
  it('60fpsで1周ぶん見て、出ないコマが1枚も無い', () => {
    const M = ENEMY_ATTACK_SPEED_MULT;
    const durs = {
      windup: LOGGER_SWEEP_WINDUP_MS / M,
      active: LOGGER_SWEEP_ACTIVE_MS / M,
      recover: LOGGER_SWEEP_RECOVER_MS / M,
    } as const;
    const seen = new Set<number>();
    for (const ph of ['windup', 'active', 'recover'] as const) {
      for (let t = 0; t < durs[ph]; t += 1000 / 60) {
        const i = enemySweepFrame(SP, ph, t / durs[ph]);
        if (i !== null) seen.add(i);
      }
    }
    expect([...seen].sort((a, b) => a - b).join(',')).toBe(
      Array.from({ length: sweepSplitFrames(SP) }, (_, i) => i).join(','));
  });

  it('★薙ぎの3コマは一番速いが、1コマが1画面フレームを下回らない', () => {
    const perFrame = (LOGGER_SWEEP_ACTIVE_MS / ENEMY_ATTACK_SPEED_MULT) / SP.active;
    expect(perFrame).toBeGreaterThan(1000 / 60);
  });
});
