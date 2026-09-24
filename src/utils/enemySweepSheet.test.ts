// ★薙ぎ払いの絵の区間割り。社長支給2026-09-22「伐採人の薙払いの時のモーション」。
import { describe, it, expect } from 'vitest';
import { enemySweepFrame, sweepPhaseOf, sweepSplitFrames, sweepImpactFrame, sweepWindupLastFrame, LOGGER_SWEEP_PHASES, sweepBandDirX, sweepFaceMulFor } from './enemySweepSheet';
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

describe('★薙ぎの帯の向き(社長裁定2026-09-23・絵と帯が逆を向かないように)', () => {
  it('右へ抜ける帯は +1 / 左は -1', () => {
    expect(sweepBandDirX(100, 300)).toBe(1);
    expect(sweepBandDirX(300, 100)).toBe(-1);
  });
  it('横成分が小さい(=ほぼ真上/真下へ薙ぐ)なら 0=判断しない', () => {
    expect(sweepBandDirX(100, 104)).toBe(0);
    expect(sweepBandDirX(100, 100)).toBe(0);
  });
  it('座標が焼かれていないなら 0(=従来どおり移動方向に任せる)', () => {
    expect(sweepBandDirX(undefined, 300)).toBe(0);
    expect(sweepBandDirX(100, undefined)).toBe(0);
    expect(sweepBandDirX(NaN, 300)).toBe(0);
  });
  it('★不感帯の境目: ちょうど deadzone は 0、1px でも超えたら向きが出る', () => {
    expect(sweepBandDirX(0, 8)).toBe(0);
    expect(sweepBandDirX(0, 9)).toBe(1);
    expect(sweepBandDirX(0, -9)).toBe(-1);
  });
});

describe('sweepFaceMulFor（薙ぎのミラーは「絵の振り」を「帯」へ揃える・社長報告2026-09-23）', () => {
  it('★不変条件: 画面上で絵が振る向き == 帯の向き', () => {
    for (const swingDir of [1, -1] as const) {
      for (const bandDir of [1, -1] as const) {
        const m = sweepFaceMulFor(bandDir, swingDir, 1);
        expect(swingDir * m).toBe(bandDir);
      }
    }
  });

  it('伐採人（絵は左→右）は、帯が右向きならミラーしない', () => {
    expect(sweepFaceMulFor(1, 1, 1)).toBe(1);
    expect(sweepFaceMulFor(-1, 1, 1)).toBe(-1);
  });

  it('帯の向きが読めない時は今の向きを保つ（振り向かない）', () => {
    expect(sweepFaceMulFor(0, 1, -1)).toBe(-1);
    expect(sweepFaceMulFor(0, -1, 1)).toBe(1);
  });
});

describe('削岩型の突き（社長支給2026-09-24・薙ぎと同じ3相の枠に乗せる）', () => {
  const split = ENEMY_SWEEP_SHEETS['driller-common'];

  it('台帳に載っていて、コマ数の合計が14', () => {
    expect(split).toBeDefined();
    expect(sweepSplitFrames(split)).toBe(14);
    expect(split.windup).toBe(8);
    expect(split.active).toBe(2);
    expect(split.recover).toBe(4);
  });

  it('★重みはコマ数ぶん在り、全部正（1つでも欠けると等分へ落ちて「ゆったり」に戻る）', () => {
    expect(split.weights).toBeDefined();
    expect(split.weights?.length).toBe(14);
    for (const w of split.weights ?? []) expect(w).toBeGreaterThan(0);
  });

  it('突きの相が区間へ写る（薙ぎの相も従来どおり）', () => {
    expect(sweepPhaseOf('driller-thrust-windup')).toBe('windup');
    expect(sweepPhaseOf('driller-thrust-active')).toBe('active');
    expect(sweepPhaseOf('driller-thrust-recover')).toBe('recover');
    expect(sweepPhaseOf('logger-sweep-active')).toBe('active');
    expect(sweepPhaseOf('crouch')).toBeNull();
    expect(sweepPhaseOf(undefined)).toBeNull();
  });

  it('★当たるのは突き区間の先頭コマ＝「突き切った絵」（掟③は重みを入れても動かない）', () => {
    // 溜めの末尾は7コマ目（出はじめ）、突きの先頭は8コマ目（突き切った姿）。境目でコマが飛ばない。
    expect(enemySweepFrame(split, 'windup', 0.999)).toBe(7);
    expect(enemySweepFrame(split, 'active', 0)).toBe(8);
  });

  it('★「出はじめ」の1枚は溜めの最後に一瞬だけ（＝突きが速く見える）', () => {
    const ws = split.weights ?? [];
    const windupSum = ws.slice(0, 8).reduce((a, b) => a + b, 0);
    expect(ws[7] / windupSum).toBeLessThan(0.07);          // 溜めのごく一部
    // 溜めの93%時点（=930ms）ではまだ「引き切った姿」（6コマ目）で待っていて、
    // 出はじめ（7コマ目）は残り57msになってから出る。
    expect(enemySweepFrame(split, 'windup', 0.93)).toBe(6);
    expect(enemySweepFrame(split, 'windup', 0.97)).toBe(7);
  });

  it('★★出はじめの1枚は30fpsの実機でも必ず1フレーム出る（＝端末で見えたり消えたりしない）', () => {
    // 重みは「そのコマを出すms」をそのまま書いてある＝溜めの合計は実効尺1000msと一致する。
    const ws = split.weights ?? [];
    expect(ws.slice(0, 8).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(ws[7]).toBeGreaterThan(1000 / 30);              // 30fpsの1フレーム(33.3ms)より長い
  });

  it('★溜めは「引き込み→収まり→止め→出はじめ」の4段（一本の坂にしない）', () => {
    const ws = split.weights ?? [];
    for (let i = 0; i < 3; i++) expect(ws[i + 1]).toBeLessThan(ws[i]);   // ①引き込みは加速する
    expect(ws[6]).toBeGreaterThan(ws[5] * 3);                           // ③止めの1枚に段差
    expect(ws[7]).toBe(Math.min(...ws.slice(0, 8)));                    // ④出はじめが最短
  });

  it('★硬直はほぼ同じ姿勢の3枚を「減衰する小刻み」で送る（均等にしない）', () => {
    const ws = split.weights ?? [];
    expect(ws.slice(10).reduce((a, b) => a + b, 0)).toBe(333);
    for (let i = 10; i < 13; i++) expect(ws[i + 1]).toBeGreaterThan(ws[i]);
  });

  it('全コマを1度は通る（どの区間も飛ばさない）', () => {
    const seen = new Set<number>();
    for (const ph of ['windup', 'active', 'recover'] as const) {
      for (let k = 0; k <= 400; k++) {
        const f = enemySweepFrame(split, ph, k / 400);
        if (f !== null) seen.add(f);
      }
    }
    expect(seen.size).toBe(14);
  });

  it('素材名は -thrust（薙ぎではないので名前を嘘にしない）', () => {
    expect(sweepSheetName('driller-common')).toBe('driller-common-thrust');
    expect(sweepSheetName('reaper-common')).toBe('reaper-common-sweep');
  });
});
