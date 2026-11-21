// TEST_HANDOFF/REQUEST-devbridge.md B節(Structured Event Timeline)のユニットテスト。
// TEST_BRIDGE_ACTIVE は `?testbridge=1` を読んだ結果を持つモジュール定数(devTestKnobs.ts)なので、
// ゲートON/OFFの両方を1ファイルで確かめるには vi.doMock + vi.resetModules で差し替えた上で
// 動的importし直す(モジュールキャッシュを毎回リセットしないと定数が固定されたままになるため)。
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('testEvents(B節: 構造化イベント履歴)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('ゲートOFF(TEST_BRIDGE_ACTIVE=false)では1件も溜まらない', async () => {
    vi.doMock('./devTestKnobs', () => ({ TEST_BRIDGE_ACTIVE: false }));
    const { recordTestEvent, getTestEvents } = await import('./testEvents');
    recordTestEvent('counter', { foo: 1 });
    recordTestEvent('enemySpawn', { type: 'bat' });
    expect(getTestEvents()).toEqual([]);
  });

  it('ゲートON: 記録され、各件にrealTime/gameTime/eventType/主要値が入る', async () => {
    vi.doMock('./devTestKnobs', () => ({ TEST_BRIDGE_ACTIVE: true }));
    const { recordTestEvent, getTestEvents, setTestEventClock } = await import('./testEvents');
    setTestEventClock(12345);
    const before = Date.now();
    recordTestEvent('counter', { hit: true });
    const events = getTestEvents();
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('counter');
    expect(events[0].gameTime).toBe(12345); // setTestEventClockの値にフォールバック
    expect(events[0].realTime).toBeGreaterThanOrEqual(before);
    expect(events[0].data).toEqual({ hit: true });
  });

  it('gameTimeを明示的に渡した呼び出しはそちらが優先される(clock未設定でも正しい)', async () => {
    vi.doMock('./devTestKnobs', () => ({ TEST_BRIDGE_ACTIVE: true }));
    const { recordTestEvent, getTestEvents } = await import('./testEvents');
    recordTestEvent('bossDefeated', { type: 'thor', result: 'defeated' }, 42);
    expect(getTestEvents()[0].gameTime).toBe(42);
  });

  it('ゲートON: リングバッファ上限(5000件)を超えたら古いものから捨てられる', async () => {
    vi.doMock('./devTestKnobs', () => ({ TEST_BRIDGE_ACTIVE: true }));
    const { recordTestEvent, getTestEvents } = await import('./testEvents');
    for (let i = 0; i < 5010; i++) recordTestEvent('enemySpawn', { seq: i });
    const events = getTestEvents();
    expect(events.length).toBe(5000);
    // 先頭10件(seq 0-9)が捨てられ、seq=10〜5009の5000件が残る。
    expect((events[0].data as { seq: number }).seq).toBe(10);
    expect((events[events.length - 1].data as { seq: number }).seq).toBe(5009);
  });

  // ★社長指示2026-09-17「回避は作らない」。発火箇所が1つも無い種別を型に残すと、観測側が
  // 「0件=記録漏れかもしれない」と毎回疑うことになる(実際 results/20260917-1430-bc-verify.md §1)。
  // 回避を作る決定が出るまでは、型に生えていないことを機械で固定する。
  it('★TestEventType に dodge は無い(回避は作らない=未実装を型に残さない)', async () => {
    vi.doMock('./devTestKnobs', () => ({ TEST_BRIDGE_ACTIVE: true }));
    const { recordTestEvent, getTestEvents } = await import('./testEvents');
    // @ts-expect-error 'dodge' は TestEventType に存在しない(存在するようになったらこの行が落ちる)
    recordTestEvent('dodge');
    expect(getTestEvents().length).toBe(1); // 実行時は素通り=型の話だけであることの確認
  });

  it('data省略時は data フィールドを持たない(空オブジェクトを毎回作らない)', async () => {
    vi.doMock('./devTestKnobs', () => ({ TEST_BRIDGE_ACTIVE: true }));
    const { recordTestEvent, getTestEvents } = await import('./testEvents');
    recordTestEvent('resumed');
    expect(getTestEvents()[0].data).toBeUndefined();
  });
});
