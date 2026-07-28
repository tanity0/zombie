// v0.25.2374: 実機テストチャットが見つけた `?komalog=1` の3つの穴を**不変条件として固定**する。
// (穴①=2分未満のランが `{koma:0}` で丸ごと無駄 / 穴②=クリア・帰還でコンソールに出ない /
//  穴③=スマホで読めない)。③はUI側なのでここでは①②と、その土台になる「既定OFF」を守る。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enableKomaLog, resetKomaLog, isKomaLogEnabled,
  tickKomaLive, komaLogSummary, logKomaSummary,
} from './komaLog';

const live = (over: Partial<Parameters<typeof tickKomaLive>[0]> = {}) => ({
  atMs: 60000, rank: 3, dist: 1500,
  windowsAtRank: 4, windowsClearing: 1, hitStreakMs: 0,
  kills: 42, hitThisFrame: false,
  ...over,
});

describe('komaLog: 既定は無効(通常プレイで1バイトも溜めない)', () => {
  // このブロックは enableKomaLog() より**先に**走る必要がある(モジュール状態は共有のため)。
  it('フラグ無しでは tickKomaLive が何もせず、要約も空のまま', () => {
    expect(isKomaLogEnabled()).toBe(false);
    tickKomaLive(live());
    expect(komaLogSummary()).toEqual({ koma: 0 });
  });
});

describe('komaLog: 有効時', () => {
  beforeEach(() => {
    enableKomaLog();
    resetKomaLog();
  });

  // ★穴①の回帰テスト。ここが壊れると「2分未満のランは成果ゼロ」に逆戻りする。
  it('コマが1件も閉じていなくても、較正値が出る', () => {
    tickKomaLive(live({ atMs: 99500 })); // 実測で `{koma:0}` になった 99.5秒のラン
    const s = komaLogSummary();
    expect(s.koma).toBe(0);              // コマは確かに0件
    expect(s.kills).toBe(42);            // それでも較正の主役は取れている
    expect(s.finalRank).toBe(3);
    expect(s.windowsAtRank).toBe(4);
    expect(s.clearRatePct).toBe(25);     // 1/4
    expect(s.runMinutes).toBe(1.7);
  });

  it('被弾はラン累計で数える(無敵700msがあるので「入ったフレーム」=1被弾)', () => {
    tickKomaLive(live({ atMs: 1000, hitThisFrame: true }));
    tickKomaLive(live({ atMs: 1016, hitThisFrame: false }));
    tickKomaLive(live({ atMs: 2000, hitThisFrame: true }));
    expect(komaLogSummary().hitsTotal).toBe(2);
  });

  // atMs の巻き戻り=リトライ。前のランの数字が混ざると較正が狂う。
  it('新しいランが始まったら前のランの値を引きずらない', () => {
    tickKomaLive(live({ atMs: 300000, kills: 200, hitThisFrame: true }));
    tickKomaLive(live({ atMs: 500, kills: 1 })); // リトライ(gameTimeが0から)
    const s = komaLogSummary();
    expect(s.kills).toBe(1);
    expect(s.hitsTotal).toBe(0);
    expect(s.runMinutes).toBe(0);
  });

  // ★穴②の回帰テスト。死亡の瞬間とリザルト画面の両方から呼ばれるので、二重に出してはいけない。
  it('同じランでは1回しかコンソールへ出さない', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    tickKomaLive(live());
    logKomaSummary();
    logKomaSummary();
    logKomaSummary();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('[KOMA_LOG]');
    spy.mockRestore();
  });

  it('ランが変わればまた出せる', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    tickKomaLive(live({ atMs: 300000 }));
    logKomaSummary();
    tickKomaLive(live({ atMs: 500 })); // 次のラン
    logKomaSummary();
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
