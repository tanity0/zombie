import { describe, it, expect } from 'vitest';
import {
  isInsideRescueQuestCircle, shouldFireRescueQuestArena, shouldFoldRescueHold,
  rescueQuestArenaOutcome, computeQuestGateOk,
} from './rescueQuestArena';

// EVENT_QUEST_DESIGN.md §2-4/§2-5/§2-6(二人組クエストv2・B3)の純関数テスト。

describe('isInsideRescueQuestCircle', () => {
  it('円のちょうど縁(<=)は中と判定する', () => {
    expect(isInsideRescueQuestCircle(0, 0, 240, 240, 0)).toBe(true);
  });
  it('円の外は中ではない', () => {
    expect(isInsideRescueQuestCircle(0, 0, 240, 241, 0)).toBe(false);
  });
});

const baseFireInput = {
  npcStatus: 'rescue' as const,
  movePhase: null,
  rescueArenaStartedAt: 0,
  npcX: 100, npcY: 100, triggerRadius: 240,
  playerX: 150, playerY: 100, // 距離50(円の中)
};

describe('shouldFireRescueQuestArena(§2-4 確定・発火条件)', () => {
  it('円の中・status=rescue・着地完了・未発火 なら発火する', () => {
    expect(shouldFireRescueQuestArena(baseFireInput)).toBe(true);
  });
  it('円の外なら発火しない', () => {
    expect(shouldFireRescueQuestArena({ ...baseFireInput, playerX: 1000, playerY: 1000 })).toBe(false);
  });
  it('status!==rescue(hidden/accepted等)なら発火しない', () => {
    expect(shouldFireRescueQuestArena({ ...baseFireInput, npcStatus: 'hidden' })).toBe(false);
    expect(shouldFireRescueQuestArena({ ...baseFireInput, npcStatus: 'accepted' })).toBe(false);
  });
  it('飛来/退場中(movePhase!==null)は発火しない(着地完了のみ)', () => {
    expect(shouldFireRescueQuestArena({ ...baseFireInput, movePhase: 'flyin' })).toBe(false);
    expect(shouldFireRescueQuestArena({ ...baseFireInput, movePhase: 'crouch' })).toBe(false);
    expect(shouldFireRescueQuestArena({ ...baseFireInput, movePhase: 'flyout' })).toBe(false);
  });
  it('既に自分の囲いが発火済み(rescueArenaStartedAt>0)なら発火しない(再発火防止)', () => {
    expect(shouldFireRescueQuestArena({ ...baseFireInput, rescueArenaStartedAt: 12345 })).toBe(false);
  });
});

describe('shouldFoldRescueHold(§2-4「★★発火時の手順は…」前置き・救助ホールドを畳んでよいか)', () => {
  const baseFold = { ...baseFireInput, gate1Pending: false, gate2Pending: false, gate2WouldFire: false };
  it('発火条件を満たし、ゲートが先に枠を取らないなら畳んでよい', () => {
    expect(shouldFoldRescueHold(baseFold)).toBe(true);
  });
  it('gate1PendingRefが立っているフレームでは畳まない(監査A-10)', () => {
    expect(shouldFoldRescueHold({ ...baseFold, gate1Pending: true })).toBe(false);
  });
  it('gate2PendingRefが立っているフレームでは畳まない', () => {
    expect(shouldFoldRescueHold({ ...baseFold, gate2Pending: true })).toBe(false);
  });
  it('ゲート2がこの場で成立する(gate2WouldFire)フレームでは畳まない', () => {
    expect(shouldFoldRescueHold({ ...baseFold, gate2WouldFire: true })).toBe(false);
  });
  it('発火条件そのものを満たさなければ畳まない(円の外)', () => {
    expect(shouldFoldRescueHold({ ...baseFold, playerX: 1000, playerY: 1000 })).toBe(false);
  });
});

describe('rescueQuestArenaOutcome(§2-4 終了条件・§2-5 完了の3契機のうち①②)', () => {
  it('生存0・グレース経過後はcleared=true(全滅)', () => {
    const r = rescueQuestArenaOutcome({ aliveCount: 0, startedAt: 0, endsAt: 90000, graceMs: 600, now: 1000 });
    expect(r.cleared).toBe(true);
    expect(r.timedOut).toBe(false);
    expect(r.done).toBe(true);
  });
  it('グレース中は生存0でもclearedにならない(開始直後の誤終了防止)', () => {
    const r = rescueQuestArenaOutcome({ aliveCount: 0, startedAt: 0, endsAt: 90000, graceMs: 600, now: 500 });
    expect(r.cleared).toBe(false);
    expect(r.done).toBe(false);
  });
  it('生存者が残っていてもendsAtを過ぎればtimedOut=true(強制クリア扱い・失敗ではない)', () => {
    const r = rescueQuestArenaOutcome({ aliveCount: 3, startedAt: 0, endsAt: 90000, graceMs: 600, now: 90000 });
    expect(r.cleared).toBe(false);
    expect(r.timedOut).toBe(true);
    expect(r.done).toBe(true);
  });
  it('90秒を超えない限り、生存者が居ればdoneにならない(§2-4受け入れ条件8)', () => {
    const r = rescueQuestArenaOutcome({ aliveCount: 1, startedAt: 0, endsAt: 90000, graceMs: 600, now: 89999 });
    expect(r.done).toBe(false);
  });
  it('死体は生存に数えない前提でaliveCountを渡す(呼び出し側でisCorpse除外済み)ので0なら即done判定対象', () => {
    const r = rescueQuestArenaOutcome({ aliveCount: 0, startedAt: 0, endsAt: 90000, graceMs: 600, now: 700 });
    expect(r.done).toBe(true);
  });
});

describe('computeQuestGateOk(§2-6 確定・城ボスのゲート)', () => {
  it('status===gone(対象外ステージ/クリア済み)なら常にtrue', () => {
    expect(computeQuestGateOk({ npcStatus: 'gone', rescueClearedAt: 0, now: 0, delayMs: 3000 })).toBe(true);
  });
  it('rescueClearedAt===0(未完了)ならfalse(何分経っても出ない)', () => {
    expect(computeQuestGateOk({ npcStatus: 'rescue', rescueClearedAt: 0, now: 10 ** 9, delayMs: 3000 })).toBe(false);
  });
  it('完了直後(ディレイ未経過)はfalse(同じフレームでは出さない・受け入れ条件2)', () => {
    expect(computeQuestGateOk({ npcStatus: 'accepted', rescueClearedAt: 100000, now: 100000, delayMs: 3000 })).toBe(false);
    expect(computeQuestGateOk({ npcStatus: 'accepted', rescueClearedAt: 100000, now: 102999, delayMs: 3000 })).toBe(false);
  });
  it('ディレイちょうど経過でtrue', () => {
    expect(computeQuestGateOk({ npcStatus: 'accepted', rescueClearedAt: 100000, now: 103000, delayMs: 3000 })).toBe(true);
  });
});
