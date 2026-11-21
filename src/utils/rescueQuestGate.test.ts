import { describe, it, expect } from 'vitest';
import { rescueQuestSpawnReady, duoCommActive, duoCommEnded, duoQuietWindow } from './rescueQuestGate';
// ※下の「4:00」はv2のレスキュー出現の基準時刻。v4(§2-18)では同じ関数を通信の開始(5:00=CASTLE_BOSS_MIN_TIME_MS)に流用する
//   (関数は基準時刻を引数で受ける汎用なので結果は同じ。監査C-2: 文言の古さだけ、ここに1行)。

describe('rescueQuestSpawnReady(EVENT_QUEST_DESIGN.md §2-11)', () => {
  it('basesRequired未設定(S1/S3/S4)は4:00超過だけで真', () => {
    expect(rescueQuestSpawnReady(4 * 60 * 1000, 4 * 60 * 1000, 0, undefined)).toBe(true);
    expect(rescueQuestSpawnReady(4 * 60 * 1000 - 1, 4 * 60 * 1000, 0, undefined)).toBe(false);
  });

  it('S5は拠点1か所以下のまま4:00を過ぎても偽(受け入れ条件1)', () => {
    expect(rescueQuestSpawnReady(10 * 60 * 1000, 4 * 60 * 1000, 1, 2)).toBe(false);
    expect(rescueQuestSpawnReady(10 * 60 * 1000, 4 * 60 * 1000, 0, 2)).toBe(false);
  });

  it('S5は2か所目を確保した瞬間(4:00以降なら即座に)真になる(受け入れ条件2)', () => {
    expect(rescueQuestSpawnReady(5 * 60 * 1000, 4 * 60 * 1000, 2, 2)).toBe(true);
  });

  it('4:00前に2か所確保済みでも、4:00に達するまでは偽(遅い方=両方満たすまで待つ)', () => {
    expect(rescueQuestSpawnReady(3 * 60 * 1000, 4 * 60 * 1000, 2, 2)).toBe(false);
    expect(rescueQuestSpawnReady(4 * 60 * 1000, 4 * 60 * 1000, 2, 2)).toBe(true);
  });
});

describe('v4 5:00の通信(EVENT_QUEST_DESIGN.md §2-18・社長指示2026-09-14)', () => {
  it('通信中=開始打刻あり・終了打刻なし(強制リラックスの条件)', () => {
    expect(duoCommActive(0, 0)).toBe(false);
    expect(duoCommActive(300000, 0)).toBe(true);
    expect(duoCommActive(300000, 312000)).toBe(false);
  });
  it('終了=表示中の行が無くキューも空。原稿0行(S5)は開始の同じフレームで終わる', () => {
    expect(duoCommEnded(true, 0)).toBe(false);
    expect(duoCommEnded(false, 2)).toBe(false);
    expect(duoCommEnded(false, 0)).toBe(true);
  });
});

describe('v4追補 通信の静けさの窓(duoQuietWindow・新規湧き停止)', () => {
  const base = { allowed: true, status: 'hidden', startedAtMs: 0, endedAtMs: 0, readyWithinLead: false, bossChasing: false };
  it('通信の10秒前に入ったら真(裏ボス戦闘中は待つ)。通信中は常に真。終了で偽', () => {
    expect(duoQuietWindow(base)).toBe(false);
    expect(duoQuietWindow({ ...base, readyWithinLead: true })).toBe(true);
    expect(duoQuietWindow({ ...base, readyWithinLead: true, bossChasing: true })).toBe(false);
    expect(duoQuietWindow({ ...base, startedAtMs: 300000, bossChasing: true })).toBe(true);
    expect(duoQuietWindow({ ...base, startedAtMs: 300000, endedAtMs: 312000 })).toBe(false);
  });
  it('対象外のラン(gone)/許可外のモードでは偽', () => {
    expect(duoQuietWindow({ ...base, status: 'gone', readyWithinLead: true })).toBe(false);
    expect(duoQuietWindow({ ...base, allowed: false, startedAtMs: 300000 })).toBe(false);
  });
});
