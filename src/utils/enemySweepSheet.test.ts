// ★薙ぎ払いの絵の区間割り。社長支給2026-09-22「伐採人の薙払いの時のモーション」。
import { describe, it, expect } from 'vitest';
import { enemySweepFrame, enemySweepSpanFrame, giantMotionSpanOf, sweepPhaseOf, sweepSplitFrames, sweepImpactFrame, sweepWindupLastFrame, LOGGER_SWEEP_PHASES, sweepBandDirX, sweepFaceMulFor, sweepActiveLoopFrame } from './enemySweepSheet';
import { ENEMY_SWEEP_SHEETS, sweepSheetName, sweepSheetSplit, sweepSheetBodyH, giantMotionSkipFor, giantAltSweepFor, giantNoActiveExtraFor, giantActiveLoopMsFor,
  jumpSheetSplit,
} from './enemySheets';
import { jumpSplitFrames } from './enemyJumpSheet';
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

// ★城ボス3の叩きつけ(社長支給2026-09-25)。薙ぎ・突きと**同じ3相の仕組みを借りている**。
describe('★城ボス3の叩きつけ(g-slam)', () => {
  const KEY = 'stage3-enemies/giantbat';
  const sp = ENEMY_SWEEP_SHEETS[KEY];

  // ★城ボスは `sweepPhaseOf`(伐採人・削岩型の表)ではなく `giantMotionSpanOf` の別経路で写す。
  // 混ぜると「薙ぎの震え」「帯の向き」の判定まで城ボスへ波及するので、表には入れない。
  it('城ボスの相は伐採人・削岩型の表には入れない', () => {
    for (const ph of ['g-slam-windup', 'g-slam-active', 'g-slam-recover']) {
      expect(sweepPhaseOf(ph), ph).toBeNull();
      expect(giantMotionSpanOf(ph), ph).not.toBeNull();
    }
  });

  it('素材名は -slam(薙ぎでも突きでもない)', () => {
    expect(sweepSheetName(KEY)).toBe('stage3-enemies/giantbat-slam');
  });

  it('16コマを 10/1/5 に割る', () => {
    expect(sweepSplitFrames(sp)).toBe(16);
    expect([sp.windup, sp.active, sp.recover]).toEqual([10, 1, 5]);
  });

  // ★掟③(消え切る時刻=当たる時刻)。当たりは windup→active の遷移で1回だけ積まれるので、
  // **叩き区間の先頭コマ=当たる瞬間**。砂埃が初めて出るのは10コマ目(実測)なので、そこに一致する。
  it('★当たる瞬間に出るのは10コマ目=砂埃が初めて出るコマ', () => {
    expect(sweepImpactFrame(sp)).toBe(10);
    expect(sweepWindupLastFrame(sp)).toBe(9);
  });

  it('★背丈は「枠」ではなく「本体150」で揃える(振り上げた蔓のぶん枠が20px高いため)', () => {
    expect(sweepSheetBodyH(KEY)).toBe(150);
    // 他のシートは持たない=従来どおり枠で揃う。
    expect(sweepSheetBodyH('reaper-common')).toBeNull();
    expect(sweepSheetBodyH('driller-common')).toBeNull();
  });

  it('全コマを1度は通る(どの区間も飛ばさない)', () => {
    const seen = new Set<number>();
    for (const ph of ['windup', 'active', 'recover'] as const) {
      for (let k = 0; k <= 400; k++) {
        const f = enemySweepFrame(sp, ph, k / 400);
        if (f !== null) seen.add(f);
      }
    }
    expect(seen.size).toBe(16);
  });
});

// ★★叩きつけのモーションを「跳ぶ」以外の技へ配る(社長指示2026-09-25
// 「モーションの叩きつけをジャンプ以外の技に入れたい」)。
describe('★叩きつけモーションの配り方(城ボス)', () => {
  const sp = ENEMY_SWEEP_SHEETS['stage3-enemies/giantbat'];   // 溜め10 / 当たり1 / 戻り5

  it('跳ぶ技には配らない(社長指示の「ジャンプ以外」)', () => {
    for (const ph of ['g-jump-windup', 'g-jump-air', 'g-jump-recover', 'g-trijump-windup']) {
      expect(giantMotionSpanOf(ph), ph).toBeNull();
    }
  });

  // ★社長指示2026-09-25「城1のジャンプと**突進以外**の攻撃モーション」。
  // 城ボス1だけ突進も外す(城ボス3は跳ぶ技だけ外す)。
  it('★城ボス1は突進にも配らない(城ボス3は配る)', () => {
    const SKIP1 = giantMotionSkipFor('giantbat');
    const SKIP3 = giantMotionSkipFor('stage3-enemies/giantbat');
    expect(SKIP3).toEqual([]);
    for (const ph of ['g-dash-windup', 'g-dash-charge', 'g-dash-recover']) {
      expect(giantMotionSpanOf(ph, SKIP1), `城1 ${ph}`).toBeNull();
      expect(giantMotionSpanOf(ph, SKIP3), `城3 ${ph}`).not.toBeNull();
    }
    // 突進以外は城ボス1にも配る。
    for (const ph of ['g-stomp-windup', 'g-sweep-active', 'g-bite-windup', 'g-bolt-burst', 'g-wing-active']) {
      expect(giantMotionSpanOf(ph, SKIP1), `城1 ${ph}`).not.toBeNull();
    }
    // 跳ぶ技はどちらも外れる。
    for (const ph of ['g-jump-windup', 'g-trijump-air']) {
      expect(giantMotionSpanOf(ph, SKIP1), ph).toBeNull();
      expect(giantMotionSpanOf(ph, SKIP3), ph).toBeNull();
    }
  });

  // ★城ボス4(衛生兵)。**既定は叩きつけの絵**(`-jump` ファイル)。砂埃の画素数で境目を決めた
  // (9コマ目まで0〜123 → **10コマ目で278** → 15で1061)。城ボス3の叩きつけと同じ 10/1/5。
  // ★v0.25.4652 でシートの取り違えを是正したため、**薙ぎ表が引くのは `-jump`**(同じ絵を跳びとしても読む)。
  it('城ボス4の薙ぎ表は叩きつけの絵を 16コマ 10/1/5 に割る(当たり=砂埃が出る10コマ目)', () => {
    const sp4 = ENEMY_SWEEP_SHEETS['stage4-enemies/giantbat'];
    expect(sweepSplitFrames(sp4)).toBe(16);
    expect([sp4.windup, sp4.active, sp4.recover]).toEqual([10, 1, 5]);
    expect(sweepImpactFrame(sp4)).toBe(10);
    expect(sweepSheetName('stage4-enemies/giantbat')).toBe('stage4-enemies/giantbat-jump');
    expect(sweepSheetBodyH('stage4-enemies/giantbat')).toBe(136);
    // 城ボス4は突進も含めて「ジャンプ以外の全部」(外すのは城ボス1だけ)。
    expect(giantMotionSkipFor('stage4-enemies/giantbat')).toEqual([]);
  });

  // ★技ごとの差し替え(社長指示2026-09-25)。城ボス4=氷の横薙ぎ/通常弾だけ「腕を薙ぐ絵」。
  // 城ボス5=既定が銃の連射で、踏み鳴らしだけ「叩きつけの絵」。
  it('差し替えシートは指定した技だけに効く', () => {
    const s4 = (ph: string) => giantAltSweepFor('stage4-enemies/giantbat', ph);
    expect(s4('g-quad-breath-active')?.suffix).toBe('attack');
    expect(s4('g-bolt-windup')?.suffix).toBe('attack');
    expect(s4('g-sweep-windup')).toBeNull();      // 薙ぎ払いは既定(叩きつけ)のまま
    expect(s4('g-quad-windup')).toBeNull();       // 三連突進の本体も既定のまま
    expect(s4('g-stomp-windup')).toBeNull();
    const s5 = (ph: string) => giantAltSweepFor('stage5-enemies/giantbat', ph);
    expect(s5('g-stomp-windup')?.suffix).toBe('jump');
    expect(s5('g-stomp-recover')?.split.windup).toBe(10); // 一撃のコマ(10)が立ち直りの頭に来る
    expect(s5('g-bolt-burst')).toBeNull();        // 撃つ技は既定(銃の連射)のまま
    expect(giantAltSweepFor('giantbat', 'g-sweep-windup')).toBeNull();
  });

  // ★社長報告2026-09-25「銃をうつモーションが静止画になってる」。扇撃ちは溜め→立ち直りで当たりの相を通らない。
  // 城ボス5だけ、通常弾の立ち直りを「当たり+戻り」(1〜7コマ目)として流す。他の城ボスは動かさない。
  it('城ボス5の通常弾は立ち直りで連射のコマが流れる(他の城ボスは従来どおり)', () => {
    const x5 = giantNoActiveExtraFor('stage5-enemies/giantbat');
    expect(giantMotionSpanOf('g-bolt-recover', [], x5)).toEqual(['active', 'recover']);
    expect(giantMotionSpanOf('g-bolt-windup', [], x5)).toEqual(['windup', 'windup']);
    expect(giantMotionSpanOf('g-bolt-burst', [], x5)).toEqual(['active', 'active']);
    const sp5 = ENEMY_SWEEP_SHEETS['stage5-enemies/giantbat'];
    const f = (p: number) => enemySweepSpanFrame(sp5, ['active', 'recover'], p);
    expect(f(0)).toBe(1);                 // 弾が出た瞬間=1発目の閃光
    expect(f(0.99)).toBe(7);              // 撃ち終わりまで流れ切る
    for (const k of ['giantbat', 'stage3-enemies/giantbat', 'stage4-enemies/giantbat']) {
      expect(giantNoActiveExtraFor(k), k).toEqual([]);
      expect(giantMotionSpanOf('g-bolt-recover', [], giantNoActiveExtraFor(k)), k).toEqual(['recover', 'recover']);
    }
  });

  // ★社長報告2026-09-25「その他の同じ絵がでる技が乱射するモーションが…ぎこちなく流れたりする」。
  // 当たりの6コマを相の長さに引き伸ばすと、220ms(薙ぎ払い・三連射)では速すぎ、900ms(掃射)では遅すぎた。
  it('城ボス5の銃の連射は、当たりの間 一定の速さでループする(通常弾は従来どおり)', () => {
    const sp5 = ENEMY_SWEEP_SHEETS['stage5-enemies/giantbat'];
    const ms = giantActiveLoopMsFor('stage5-enemies/giantbat', 'g-sweepbeam-active');
    expect(ms).toBe(45);
    expect(giantActiveLoopMsFor('stage5-enemies/giantbat', 'g-trishot-active')).toBe(45);
    expect(giantActiveLoopMsFor('stage5-enemies/giantbat', 'g-sweep-active')).toBe(45);
    expect(giantActiveLoopMsFor('stage5-enemies/giantbat', 'g-bolt-burst')).toBeNull();   // 社長「合ってる」
    expect(giantActiveLoopMsFor('stage4-enemies/giantbat', 'g-sweep-active')).toBeNull(); // 他の城ボスは不変
    // 1〜6コマ目を 45ms ごとに進めて巡回する
    const seq = [0, 44, 45, 134, 135, 269, 270, 315].map(t => sweepActiveLoopFrame(sp5, t, 45));
    expect(seq).toEqual([1, 1, 2, 3, 4, 6, 1, 2]);
    expect(sweepActiveLoopFrame(sp5, -5, 45)).toBe(1);
    expect(sweepActiveLoopFrame(sp5, Number.NaN, 45)).toBe(1);
    // 掃射(実効900ms)でも三連射(220ms)でも同じ速さ=1コマ45ms
    expect(sweepActiveLoopFrame(sp5, 900, 45)).toBe(sweepActiveLoopFrame(sp5, 900 % 270, 45));
  });

  // ★社長指示2026-09-25「ダッシュはジャンプの着地の絵を使って(城4ボスみたいに)」。
  it('城ボス5の突進は叩きつけの絵(城ボス4と同じ読み方)', () => {
    const alt = giantAltSweepFor('stage5-enemies/giantbat', 'g-dash-charge');
    expect(alt?.suffix).toBe('jump');
    expect([alt?.split.windup, alt?.split.active, alt?.split.recover]).toEqual([10, 1, 4]);
    expect(giantAltSweepFor('stage5-enemies/giantbat', 'g-dash-windup')?.suffix).toBe('jump');
    expect(giantAltSweepFor('stage5-enemies/giantbat', 'g-dash-recover')?.suffix).toBe('jump');
  });

  // ★城ボス5の攻撃(社長支給2026-09-25)。閃光の画素数で境目を決めた
  // (0コマ目373 → 2681/1133/2483/1360/2328/1295 → 7コマ目207)=1〜6コマ目が撃っている。
  it('城ボス5の攻撃シートは 8コマを 1/6/1 に割る(連射が当たりの区間に来る)', () => {
    const sp5 = ENEMY_SWEEP_SHEETS['stage5-enemies/giantbat'];
    expect(sweepSplitFrames(sp5)).toBe(8);
    expect([sp5.windup, sp5.active, sp5.recover]).toEqual([1, 6, 1]);
    expect(sweepSheetName('stage5-enemies/giantbat')).toBe('stage5-enemies/giantbat-attack');
    expect(sweepSheetBodyH('stage5-enemies/giantbat')).toBeNull();
  });

  it('★コマごとの大きさ合わせ(frameBodyH)はコマ数と同じ長さで、そのコマの値が返る(グレン形態1)', () => {
    for (const [n, sp] of Object.entries(ENEMY_SWEEP_SHEETS)) {
      if (sp.frameBodyH === undefined) continue;
      expect(sp.frameBodyH.length, n).toBe(sp.windup + sp.active + sp.recover);
      sp.frameBodyH.forEach((v, f) => expect(sweepSheetBodyH(n, f), `${n} コマ${f}`).toBe(v));
    }
    expect(ENEMY_SWEEP_SHEETS['glen-boss'].frameBodyH).toBeDefined();
    // コマを渡さない呼び方は従来どおり(bodyH が無ければ null)
    expect(sweepSheetBodyH('glen-boss')).toBeNull();
  });

  it('城ボス1の攻撃シートは 10コマを 6/1/3 に割る(当たり=翼を薙ぎ抜く6コマ目)', () => {
    const sp1 = ENEMY_SWEEP_SHEETS['giantbat'];
    expect(sweepSplitFrames(sp1)).toBe(10);
    expect([sp1.windup, sp1.active, sp1.recover]).toEqual([6, 1, 3]);
    expect(sweepImpactFrame(sp1)).toBe(6);
    expect(sweepSheetName('giantbat')).toBe('giantbat-attack');
  });

  it('城ボス以外の相には配らない', () => {
    for (const ph of ['logger-sweep-windup', 'driller-thrust-active', 'charge', 'crouch', 'recover', undefined]) {
      expect(giantMotionSpanOf(ph), String(ph)).toBeNull();
    }
  });

  // ★社長指示2026-09-25「**ジャンプ以外の攻撃全てだよ**」。city ボスの相は `g-<技>-<区間>` に
  // 揃っているので、**表を作らず相の名前で決める**。ここは「今ある全部の相」を並べて取りこぼしを止める。
  it('★跳ぶ技以外の相は、全部どこかの区間へ写る', () => {
    const WINDUP = ['g-slam-windup', 'g-wing-windup', 'g-sweep-windup', 'g-sweep-track', 'g-stomp-windup',
      'g-bite-windup', 'g-bite-hold', 'g-bolt-windup', 'g-dash-windup', 'g-glide-windup', 'g-dive-windup',
      'g-quad-windup', 'g-quad-breath-windup', 'g-nova-windup', 'g-trishot-windup', 'g-sweepbeam-windup',
      'g-talon-windup', 'g-boon-windup', 'g-reach-windup', 'g-tailslam-windup',
      'g-nihil-chant1', 'g-nihil-chant2', 'g-nihil-chant3'];
    const ACTIVE = ['g-slam-active', 'g-wing-active', 'g-sweep-active', 'g-bite-active', 'g-bolt-burst',
      'g-dash-charge', 'g-glide-active', 'g-quad-charge', 'g-quad-breath-active', 'g-nova-active',
      'g-trishot-active', 'g-sweepbeam-active', 'g-tailslam-active', 'g-tailslam-volley'];
    // 当たりの相を持たない技=戻りが「当たり+戻り」を受け持つ(溜めの終わりで当たるので、
    // 戻りの先頭コマ=砂埃のコマ=当たる瞬間になる)。
    const ACTIVE_RECOVER = ['g-stomp-recover', 'g-talon-recover', 'g-boon-recover', 'g-reach-recover',
      'g-dive-recover', 'g-nihil-recover'];
    const RECOVER = ['g-slam-recover', 'g-wing-recover', 'g-sweep-recover', 'g-bite-recover',
      'g-bolt-recover', 'g-dash-recover', 'g-glide-recover', 'g-quad-recover', 'g-nova-recover',
      'g-trishot-recover', 'g-sweepbeam-recover', 'g-tailslam-recover'];
    for (const ph of WINDUP) expect(giantMotionSpanOf(ph), ph).toEqual(['windup', 'windup']);
    for (const ph of ACTIVE) expect(giantMotionSpanOf(ph), ph).toEqual(['active', 'active']);
    for (const ph of ACTIVE_RECOVER) expect(giantMotionSpanOf(ph), ph).toEqual(['active', 'recover']);
    for (const ph of RECOVER) expect(giantMotionSpanOf(ph), ph).toEqual(['recover', 'recover']);
  });

  // ★掟③(消え切る時刻=当たる時刻)。当たりのコマ(=砂埃が初めて出る10コマ目)が
  // **当たる瞬間**に出ること。技ごとに相の並びが違うので、ここが一番壊れやすい。
  it('★当たりのコマは、どの技でも「当たる瞬間」に出る', () => {
    // 溜め→当たり→戻り を持つ技: 当たりの相の先頭。
    for (const ph of ['g-slam-active', 'g-wing-active', 'g-sweep-active']) {
      expect(enemySweepSpanFrame(sp, giantMotionSpanOf(ph)!, 0), ph).toBe(10);
    }
    // 踏み鳴らしは**当たりの相が無く**、溜めの終わりで当たる=戻りの先頭コマがそれ。
    expect(enemySweepSpanFrame(sp, giantMotionSpanOf('g-stomp-recover')!, 0)).toBe(10);
  });

  it('溜めは0コマ目から始まり、9コマ目で終わる(当たりの手前)', () => {
    for (const ph of ['g-slam-windup', 'g-wing-windup', 'g-sweep-windup', 'g-stomp-windup']) {
      expect(enemySweepSpanFrame(sp, giantMotionSpanOf(ph)!, 0), ph).toBe(0);
      expect(enemySweepSpanFrame(sp, giantMotionSpanOf(ph)!, 0.999), ph).toBe(9);
    }
  });

  it('踏み鳴らしの戻りは 当たり+戻り をまとめて流し切る(10→15)', () => {
    const span = giantMotionSpanOf('g-stomp-recover')!;
    const seen = new Set<number>();
    for (let k = 0; k <= 400; k++) {
      const f = enemySweepSpanFrame(sp, span, k / 400);
      if (f !== null) seen.add(f);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15]);
  });

  // ★★**流し切ったら最後のコマで持つ**(立ち絵へは戻さない)。
  // 城ボスの戻りは台本で伸び縮みする(`scriptRestMs`)ので、絵が先に尽きることがある。そこで立ち絵へ
  // 戻すと**相がまだ続いているのに構えが解けて背丈も跳ねる**——蜘蛛の跳びで実際に起きた事故
  // (v0.25.4605「ジャンプの後コマが変。小ジャンプしてるみたいなのが最後に混ざってる」)と同じ形。
  // その時の裁定どおり「技の絵は技が終わるまで持たせる」に揃える。相が明ければ `giantMotionSpanOf` が
  // null を返す=そこで初めて歩き/立ち絵へ戻る。
  it('流し切っても絵を捨てない(最後のコマで持つ)', () => {
    const last: Record<string, number> = {
      'g-slam-windup': 9, 'g-wing-windup': 9, 'g-sweep-windup': 9, 'g-stomp-windup': 9,
      'g-slam-active': 10, 'g-wing-active': 10, 'g-sweep-active': 10,
      'g-slam-recover': 15, 'g-wing-recover': 15, 'g-sweep-recover': 15, 'g-stomp-recover': 15,
    };
    for (const [ph, f] of Object.entries(last)) {
      expect(enemySweepSpanFrame(sp, giantMotionSpanOf(ph)!, 1.2), ph).toBe(f);
    }
  });

  it('全コマを1度は通る(どの技の組でも飛ばさない)', () => {
    const seen = new Set<number>();
    for (const ph of ['g-sweep-windup', 'g-sweep-active', 'g-sweep-recover']) {
      for (let k = 0; k <= 400; k++) {
        const f = enemySweepSpanFrame(sp, giantMotionSpanOf(ph)!, k / 400);
        if (f !== null) seen.add(f);
      }
    }
    expect(seen.size).toBe(sweepSplitFrames(sp));
  });
});

describe('★グレン形態1の踏み潰し=跳びの絵の後半(社長指示2026-09-26)', () => {
  const alt = giantAltSweepFor('glen-boss', 'g-stomp-windup')!;
  it('跳びの絵を 5コマ目から読み、合計が跳びのシートのコマ数と一致する(切り分けがずれない)', () => {
    expect(alt).not.toBeNull();
    expect(alt.suffix).toBe('jump');
    expect(alt.from).toBe(5);
    expect((alt.from ?? 0) + sweepSplitFrames(alt.split)).toBe(jumpSplitFrames(jumpSheetSplit('glen-boss')!));
    expect(giantMotionSkipFor('glen-boss')).not.toContain('g-stomp-');
  });
  it('★溜めは 5,6(頂点→降下)、立ち直りの頭=一撃は 7(一番潰れるコマ)', () => {
    const from = alt.from ?? 0;
    const wind = giantMotionSpanOf('g-stomp-windup')!;
    const rec = giantMotionSpanOf('g-stomp-recover')!;
    expect(from + enemySweepSpanFrame(alt.split, wind, 0)!).toBe(5);
    expect(from + enemySweepSpanFrame(alt.split, wind, 0.99)!).toBe(6);
    expect(from + enemySweepSpanFrame(alt.split, rec, 0)!).toBe(7);
    expect(from + enemySweepSpanFrame(alt.split, rec, 0.99)!).toBe(10);
  });
  it('踏み潰し以外(爪など)は差し替えない=攻撃の絵のまま', () => {
    expect(giantAltSweepFor('glen-boss', 'g-talon-windup')).toBeNull();
  });
});
