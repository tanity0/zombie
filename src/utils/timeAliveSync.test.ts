import { describe, it, expect, beforeEach } from 'vitest';
import { timeAliveWriteDue, pendingTimeAlive, noteTimeAlive, flushTimeAlive, freezeTimeAliveAtDeath, resetTimeAliveSyncForTest } from './timeAliveSync';

describe('生存時間の書き込み(途中は1秒に1回・結果画面へ移る時に最後の値)', () => {
  beforeEach(() => resetTimeAliveSyncForTest());

  it('秒(整数部)が変わった時だけ書く', () => {
    expect(timeAliveWriteDue(0, 0.016)).toBe(false);
    expect(timeAliveWriteDue(0, 0.999)).toBe(false);
    expect(timeAliveWriteDue(0.999, 1.0)).toBe(true);
    expect(timeAliveWriteDue(12.3, 12.9)).toBe(false);
  });
  it('新しい出撃(値が戻った)でも書く', () => {
    expect(timeAliveWriteDue(95.2, 0.4)).toBe(true);
  });

  it('★結果画面へ移る時、最後のtickの値(小数のまま)を書く=リザルトのスコアは従来と同じ', () => {
    const store = { gameTime: 95_400, gameStats: { timeAlive: 95.0 }, updateGameStats(p: { timeAlive: number }) { this.gameStats = { ...this.gameStats, ...p }; } };
    noteTimeAlive(95_400, 95.383);
    flushTimeAlive(() => store);
    expect(store.gameStats.timeAlive).toBe(95.383);
  });

  it('別の出撃の値は書かない(resetGame 後に gameTime が記録より小さい)', () => {
    expect(pendingTimeAlive({ gameTimeMs: 95_400, sec: 95.383 }, 0, 0)).toBeNull();
  });
  it('既に同じ値なら書かない・記録が無ければ書かない', () => {
    expect(pendingTimeAlive({ gameTimeMs: 10, sec: 1.5 }, 10, 1.5)).toBeNull();
    expect(pendingTimeAlive(null, 10, 0)).toBeNull();
  });
  it('記録の後に gameTime だけ進んだ(会話の時計など)場合も、最後に記録した値を書く', () => {
    expect(pendingTimeAlive({ gameTimeMs: 10_000, sec: 9.98 }, 12_000, 9.0)).toBe(9.98);
  });

  it('★死亡: リザルトの生存時間は死んだ瞬間の値(死亡演出の間に進んだゲーム時間を数えない)', () => {
    const store = { gameTime: 0, gameStats: { timeAlive: 0 }, updateGameStats(p: { timeAlive: number }) { this.gameStats = { ...this.gameStats, ...p }; } };
    noteTimeAlive(60_000, 59.98);
    // 死亡(ゲーム時間 60.0 秒)
    freezeTimeAliveAtDeath(60_000, 60.0);
    // 死亡演出の約2秒(スロー中も gameTime は進む)
    expect(noteTimeAlive(60_400, 60.3)).toBeNull();
    expect(noteTimeAlive(61_500, 61.4)).toBeNull();
    store.gameTime = 61_500;
    flushTimeAlive(() => store);
    expect(store.gameStats.timeAlive).toBe(60.0);
  });

  it('死亡で固定した後でも、新しい出撃(gameTime が戻る)では普通に記録する', () => {
    freezeTimeAliveAtDeath(60_000, 60.0);
    expect(noteTimeAlive(16, 0)).toBe(0);
    expect(noteTimeAlive(1_016, 1.0)).toBe(1.0);
    const store = { gameTime: 1_016, gameStats: { timeAlive: 0 }, updateGameStats(p: { timeAlive: number }) { this.gameStats = { ...this.gameStats, ...p }; } };
    flushTimeAlive(() => store);
    expect(store.gameStats.timeAlive).toBe(1.0);
  });
});
