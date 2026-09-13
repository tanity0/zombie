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

  // ★穴④(v0.25.2409・実機1本目で判明)の回帰テスト。
  // windowsAtRank/windowsClearing は「このランクに来てから」のカウンタで、ランクが動くたび0へ戻る。
  // そのため R7→R6 の直後に死んだ実機ランは clearRatePct:0 = 較正の主役が丸ごと空になった。
  // ランク別の実測(kpw*)は**ランクが動いても消えない**ことを不変条件として固定する。
  it('ランク別の実測は、ランクが変わっても前のランクぶんが消えない', () => {
    // R5 に 20秒(500ms×40tick)居て 18体 → 窓=10秒なので kpw5 ≒ 9.0。
    for (let i = 0; i <= 40; i++) {
      tickKomaLive(live({ atMs: i * 500, rank: 5, kills: Math.round(i * 0.45) }));
    }
    // そのまま R6 へ上がって 10秒で 12体 → kpw6 ≒ 12.0。R5 の記録は残っていること。
    for (let j = 1; j <= 20; j++) {
      tickKomaLive(live({ atMs: 20000 + j * 500, rank: 6, kills: 18 + Math.round(j * 0.6) }));
    }
    const s = komaLogSummary();
    // ← ランクが動いても消えない(これが穴④の本体)。境界の1tickぶんの誤差は許容する。
    expect(s.kpw5).toBeGreaterThan(8.5);
    expect(s.kpw5).toBeLessThan(9.6);
    expect(s.kpw6).toBeGreaterThan(11);
    expect(s.kpw6).toBeLessThan(12.5);
    expect(s.min5).toBeGreaterThan(0);
  });

  it('新しいランではランク別の実測もリセットされる', () => {
    for (let i = 0; i <= 40; i++) tickKomaLive(live({ atMs: 300000 + i * 500, rank: 5, kills: 100 + i }));
    expect(komaLogSummary().kpw5).toBeGreaterThan(0);
    tickKomaLive(live({ atMs: 500, rank: 1, kills: 0 })); // リトライ
    expect(komaLogSummary().kpw5).toBeUndefined();
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
