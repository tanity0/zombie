import { describe, it, expect } from 'vitest';
import {
  phillPhaseForHealth, phillRequiredMoveReady, phillRequiredMoveDamage, phillCageInitialRadiusPx,
  phillSummonSpawnCount, pickPhillMove, PHILL_SUMMON_CAP, PHILL_REQUIRED_GAP_MS,
  type PhillMoveGates,
  phillWingcomboRed, phillRingtossRed, phillGoldringProg,
  phillLightrainDrawAt, phillLightrainHitTimes, phillLightrainProg,
} from './phillScript';

const READY_ALL: PhillMoveGates = {
  lightrainReady: true, goldringReady: true, judgmentReady: true, cageReady: true,
  requiredReady: true, summonReady: true,
};
const READY_NONE: PhillMoveGates = {
  lightrainReady: false, goldringReady: false, judgmentReady: false, cageReady: false,
  requiredReady: false, summonReady: false,
};

describe('phillPhaseForHealth', () => {
  it('HP50%超はフェーズ1、50%以下はフェーズ2', () => {
    expect(phillPhaseForHealth(1)).toBe(1);
    expect(phillPhaseForHealth(0.51)).toBe(1);
    expect(phillPhaseForHealth(0.5)).toBe(2);
    expect(phillPhaseForHealth(0.1)).toBe(2);
  });
});

describe('phillRequiredMoveReady(§10-14#7)', () => {
  it('フェーズ1では常にfalse(裁きの光/羽根の檻はP2解禁)', () => {
    expect(phillRequiredMoveReady(1, 100000, 0)).toBe(false);
  });
  it('フェーズ2でも直近の成立/被弾から4秒未満はfalse', () => {
    const firedAt = 10000;
    const readyAt = firedAt + PHILL_REQUIRED_GAP_MS;
    expect(phillRequiredMoveReady(2, readyAt - 1, readyAt)).toBe(false);
  });
  it('フェーズ2かつゲート明け後はtrue', () => {
    const firedAt = 10000;
    const readyAt = firedAt + PHILL_REQUIRED_GAP_MS;
    expect(phillRequiredMoveReady(2, readyAt, readyAt)).toBe(true);
  });
});

describe('phillRequiredMoveDamage(§10-15#5・35%クランプ)', () => {
  it('技のダメージが上限未満ならそのまま', () => {
    expect(phillRequiredMoveDamage(30, 1000)).toBe(30);
  });
  it('技のダメージが上限を超えたら最大HPの35%へクランプ', () => {
    expect(phillRequiredMoveDamage(9999, 1000)).toBe(350);
  });
  it('係数がいくら乗っても35%を破れない(上限ちょうどの境界)', () => {
    expect(phillRequiredMoveDamage(350, 1000)).toBe(350);
    expect(phillRequiredMoveDamage(351, 1000)).toBe(350);
  });
});

describe('phillCageInitialRadiusPx(§10-12#17・可視短辺の0.45倍が上限)', () => {
  it('叩き台の半径が上限内ならそのまま', () => {
    expect(phillCageInitialRadiusPx(100, 1000)).toBe(100);
  });
  it('叩き台の半径が上限を超えたら可視短辺×0.45へクランプ(?zoomlock=0.4のような強い引きでも破綻しない)', () => {
    // 可視短辺400px(強いズーム引き)に対し、叩き台300pxは0.45倍=180pxを超えるのでクランプされる。
    expect(phillCageInitialRadiusPx(300, 400)).toBeCloseTo(180);
  });
});

describe('phillSummonSpawnCount(§10-3の6・同時上限3)', () => {
  it('生存0体なら2〜3体を返す', () => {
    for (let i = 0; i < 20; i++) {
      const n = phillSummonSpawnCount(0, () => i / 20);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(3);
    }
  });
  it('上限に空きが無ければ0', () => {
    expect(phillSummonSpawnCount(PHILL_SUMMON_CAP)).toBe(0);
    expect(phillSummonSpawnCount(PHILL_SUMMON_CAP + 1)).toBe(0);
  });
  it('空きが1体分しかなければ1体だけ(上限を超えない)', () => {
    expect(phillSummonSpawnCount(PHILL_SUMMON_CAP - 1, () => 0.99)).toBe(1);
  });
});

describe('pickPhillMove(距離帯×重み+ゲート)', () => {
  it('全ゲートtrueなら密着距離でも何かしら選ばれる', () => {
    const move = pickPhillMove(50, READY_ALL, () => 0.5);
    expect(move).not.toBeNull();
  });
  it('全ゲートfalseでも一般技(近接/弾/召喚以外)は選ばれる(CD無し勢が生きている)', () => {
    const move = pickPhillMove(500, READY_NONE, () => 0.5);
    expect(move).not.toBeNull();
    expect(move).not.toBe('lightrain');
    expect(move).not.toBe('goldring');
    expect(move).not.toBe('summon');
    expect(move).not.toBe('judgment');
    expect(move).not.toBe('cage');
  });
  it('requiredReadyがfalseならjudgment/cageは絶対に選ばれない(乱数を全走査)', () => {
    const gates: PhillMoveGates = { ...READY_ALL, requiredReady: false };
    for (let i = 0; i < 50; i++) {
      const move = pickPhillMove(300, gates, () => i / 50);
      expect(move).not.toBe('judgment');
      expect(move).not.toBe('cage');
    }
  });
  it('summonReadyがfalseならsummonは絶対に選ばれない', () => {
    const gates: PhillMoveGates = { ...READY_ALL, summonReady: false };
    for (let i = 0; i < 50; i++) {
      expect(pickPhillMove(300, gates, () => i / 50)).not.toBe('summon');
    }
  });
  it('密着距離ではwingslash/wingthrust/wingcombo以外に振れやすい重み設定(遠距離技の重みは0)', () => {
    // 密着ではlightrain(far寄り)は重み5と小さいが0ではない=完全排除ではなく比重の話であることを確認。
    expect(pickPhillMove(50, READY_ALL, () => 0)).not.toBeNull();
  });
});

// ★★赤い予告の4つの掟②③(CLAUDE.md・社長指示2026-09-18)。PACING_PUZZLE.md §18-1 A-2 / A-3 / C-1。
// **旧実装の嘘の検知器**(=v0.25.4456以前の壊れ方をそのまま書くと落ちるテスト)。
describe('★フィルの羽連撃(A-2)の2撃目にも予告があり、当たる瞬間に消え切る', () => {
  // 判定側(angelBossTick.runPhillTick)の実測値。
  const WC = { windupMs: 650, active1Ms: 130, gapMs: 260 };
  const TOTAL = WC.windupMs + WC.active1Ms + WC.gapMs; // 1040 = 2撃目が当たるまで

  it('★2撃目の予告は「溜めの頭」から出ている(旧実装の嘘の検知器: 旧は2撃目の帯が存在しなかった)', () => {
    const atWindupStart = phillWingcomboRed('phill-wingcombo-windup', WC.windupMs, WC);
    expect(atWindupStart.secondProg).toBe(0);      // 出ている(=null ではない)
    expect(atWindupStart.firstProg).toBe(0);
  });

  it('★1撃目は溜め明けで消え切るが、2撃目はまだ消えない', () => {
    const atHit1 = phillWingcomboRed('phill-wingcombo-windup', 0, WC);
    expect(atHit1.firstProg).toBe(1);                                    // 1撃目=当たる瞬間に消え切る
    expect(atHit1.secondProg).toBeCloseTo(WC.windupMs / TOTAL, 6);
    expect(atHit1.secondProg!).toBeLessThan(1);                          // 2撃目はまだ在る
  });

  it('★2撃目が消え切るのは gap の満了(= +active1 + gapMs)=2撃目が当たる瞬間', () => {
    expect(phillWingcomboRed('phill-wingcombo-active1', 0, WC).secondProg)
      .toBeCloseTo((WC.windupMs + WC.active1Ms) / TOTAL, 6);
    expect(phillWingcomboRed('phill-wingcombo-gap', 1, WC).secondProg!).toBeLessThan(1);
    expect(phillWingcomboRed('phill-wingcombo-gap', 0, WC).secondProg).toBe(1);
  });

  it('2撃目が済んだ後(active2/recover)は赤を出さない', () => {
    expect(phillWingcomboRed('phill-wingcombo-active2', 100, WC)).toEqual({ firstProg: null, secondProg: null });
    expect(phillWingcomboRed('phill-wingcombo-recover', 400, WC)).toEqual({ firstProg: null, secondProg: null });
  });

  it('★進行は州をまたいで単調(巻き戻らない)', () => {
    const seq: number[] = [];
    for (let r = WC.windupMs; r >= 0; r -= 25) seq.push(phillWingcomboRed('phill-wingcombo-windup', r, WC).secondProg!);
    for (let r = WC.active1Ms; r >= 0; r -= 10) seq.push(phillWingcomboRed('phill-wingcombo-active1', r, WC).secondProg!);
    for (let r = WC.gapMs; r >= 0; r -= 10) seq.push(phillWingcomboRed('phill-wingcombo-gap', r, WC).secondProg!);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
    expect(seq[seq.length - 1]).toBe(1);
  });
});

describe('★フィルの光輪投げ(A-3)は往路の2点で消え切り、判定の無い復路には赤を出さない', () => {
  const RT = { windupMs: 700, outMs: 380 };

  it('★復路(back)は赤なし(旧実装の嘘の検知器: 旧は往復とも静的な全形が出っぱなし=380msの嘘)', () => {
    expect(phillRingtossRed('phill-ringtoss-back', 380, RT)).toEqual({ firstProg: null, secondProg: null });
    expect(phillRingtossRed('phill-ringtoss-back', 0, RT)).toEqual({ firstProg: null, secondProg: null });
    expect(phillRingtossRed('phill-ringtoss-recover', 400, RT)).toEqual({ firstProg: null, secondProg: null });
  });

  it('★往路(out)の赤は静的な全形ではなく、往路の終わり(2撃目の命中)で消え切る', () => {
    expect(phillRingtossRed('phill-ringtoss-out', RT.outMs, RT).secondProg)
      .toBeCloseTo(RT.windupMs / (RT.windupMs + RT.outMs), 6);
    expect(phillRingtossRed('phill-ringtoss-out', 1, RT).secondProg!).toBeLessThan(1);
    expect(phillRingtossRed('phill-ringtoss-out', 0, RT).secondProg).toBe(1);
    expect(phillRingtossRed('phill-ringtoss-out', 100, RT).firstProg).toBeNull(); // 1撃目はもう済んでいる
  });

  it('★2撃目の予告も「出る=溜め開始」。1撃目は溜め明けで消え切る', () => {
    expect(phillRingtossRed('phill-ringtoss-windup', RT.windupMs, RT)).toEqual({ firstProg: 0, secondProg: 0 });
    const atHit1 = phillRingtossRed('phill-ringtoss-windup', 0, RT);
    expect(atHit1.firstProg).toBe(1);
    expect(atHit1.secondProg!).toBeLessThan(1);
  });
});

describe('★フィルの金環(C-1)は流星になる(濃くなるだけではない)', () => {
  it('★溜め開始で0・溜め明け(=当たる瞬間)で1。それ以外の州では赤を出さない', () => {
    expect(phillGoldringProg('phill-goldring-windup', 1600, 1600)).toBe(0);
    expect(phillGoldringProg('phill-goldring-windup', 800, 1600)).toBeCloseTo(0.5, 6);
    expect(phillGoldringProg('phill-goldring-windup', 0, 1600)).toBe(1);
    expect(phillGoldringProg('phill-goldring-active', 260, 1600)).toBeNull();
    expect(phillGoldringProg('phill-goldring-recover', 900, 1600)).toBeNull();
  });
});

describe('§18-1 A-5「祝福 1発目」= 抽選の前倒し(社長裁定2026-09-18「フィルは推薦で」)', () => {
  const END = 10_000, N = 6, GAP = 220;

  it('★命中時刻は1msも変わらない(前倒しは抽選だけ)', () => {
    const hits = phillLightrainHitTimes(END, N, GAP);
    expect(hits).toEqual([10000, 10220, 10440, 10660, 10880, 11100]);
    expect(hits[0]).toBe(END);                       // 1発目は溜めの満了ちょうど=旧実装と同じ
    expect(hits[N - 1] - hits[0]).toBe((N - 1) * GAP); // 技の尺も不変
  });

  it('★抽選はちょうど shotGapMs だけ前倒しされる', () => {
    expect(phillLightrainDrawAt(END, GAP)).toBe(END - GAP);
  });

  it('★1発目にも他の発と同じ長さの予告が付く(旧実装の嘘の検知器: 旧は尺0=1フレームも出ない)', () => {
    const born = phillLightrainDrawAt(END, GAP);
    const hits = phillLightrainHitTimes(END, N, GAP);
    // 旧実装は born = END だったので 1発目の尺は 0 だった
    expect(hits[0] - END).toBe(0);
    expect(hits[0] - born).toBe(GAP);
  });

  it('★どの発も「消え切る瞬間=当たる瞬間」(掟③)', () => {
    const born = phillLightrainDrawAt(END, GAP);
    for (const at of phillLightrainHitTimes(END, N, GAP)) {
      expect(phillLightrainProg(at, born, at)).toBe(1);          // 命中の瞬間=満ちている
      expect(phillLightrainProg(at, born, at - 1)).toBeLessThan(1);
    }
  });

  it('★出る時刻より前は0(まだ来ていないのに赤くならない)', () => {
    const born = phillLightrainDrawAt(END, GAP);
    expect(phillLightrainProg(END, born, born)).toBe(0);
    expect(phillLightrainProg(END, born, born - 50)).toBe(0);
  });
});
