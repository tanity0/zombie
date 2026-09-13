// EVENT_QUEST_DESIGN.md §2-4/§2-5/§2-6(二人組クエストv2・B3): 囲いの発火/完了/城ボスゲートの
// 判定だけを扱う純関数。世界の状態(store)の書き込みは呼び出し側(src/hooks/useGameLoop.ts)に置く
// (CLAUDE.md「判定・選択のロジックはsrc/utils/の純関数へ切り出す」・実装精度の規律4)。

import type { EventQuestStatus, EventQuestNpc } from '../types/game';

/** プレイヤーの中心点が、二人組の円(triggerRadius)の中に居るか(§2-4「サークルに入った」の判定式)。
 *  矩形では判定しない・このゲームの「円の中に居るか」は全部この式(isInReturnCircle等と同じ形)。 */
export const isInsideRescueQuestCircle = (
  npcX: number, npcY: number, triggerRadius: number,
  playerX: number, playerY: number,
): boolean => Math.hypot(npcX - playerX, npcY - playerY) <= triggerRadius;

export interface RescueQuestFireInput {
  npcStatus: EventQuestStatus;
  movePhase: EventQuestNpc['movePhase'];
  rescueArenaStartedAt: number; // 0=未発火
  npcX: number; npcY: number; triggerRadius: number;
  playerX: number; playerY: number;
}

/** §2-4 確定: レスキューの発火条件(if/else連鎖の枝の条件そのもの)。
 * 「円の中に居る」×「status==='rescue'」×「飛来/退場のどちらでもない(着地完了)」×「自分の囲いが未発火」。
 * 6条件ANDは2026-08-30裁定で撤去済み=これが真になった瞬間、必ず発火してよい(発火しない経路は無い)。 */
export const shouldFireRescueQuestArena = (input: RescueQuestFireInput): boolean =>
  input.npcStatus === 'rescue'
  && input.movePhase === null
  && input.rescueArenaStartedAt === 0
  && isInsideRescueQuestCircle(input.npcX, input.npcY, input.triggerRadius, input.playerX, input.playerY);

export interface RescueHoldFoldInput extends RescueQuestFireInput {
  gate1Pending: boolean; // gate1PendingRef.current
  gate2Pending: boolean; // gate2PendingRef.current
  gate2WouldFire: boolean; // gateFireOk && shouldTriggerGate2({...}) をその場で評価した値
}

/** §2-4「★★発火時の手順は…」前置き: このフレームで必ずレスキューの囲いが発火すると分かっている時
 * だけ、埋まっている救助ホールド(kind:'rescue')を畳んでよいか。発火条件に加えて「ゲートが先に枠を
 * 取るフレームではない」を課す(監査A-9/A-10)。 */
export const shouldFoldRescueHold = (input: RescueHoldFoldInput): boolean =>
  shouldFireRescueQuestArena(input)
  && !input.gate1Pending
  && !input.gate2Pending
  && !input.gate2WouldFire;

export interface RescueQuestArenaOutcomeInput {
  aliveCount: number; // このイベントで湧かせた個体のidセットのうち、isCorpseでない生存数
  startedAt: number;  // gameTime(ms)
  endsAt: number;     // gameTime(ms)
  graceMs: number;    // ARENA_END_GRACE_MS
  now: number;        // newGameTime
}

export interface RescueQuestArenaOutcome {
  cleared: boolean;
  timedOut: boolean;
  done: boolean; // cleared || timedOut
}

/** §2-4「終了条件」/「全滅をこのイベントの敵に限定する」: グローバルなfromEvent数ではなく、
 * このイベントで湧かせた個体のidセットの生存数(死体は数えない)で判定する。90秒の時間切れは
 * 「失敗」ではなく強制クリア扱い(プレイヤーから見える終わり方は全滅も時間切れも同じ・§2-5)。 */
export const rescueQuestArenaOutcome = (input: RescueQuestArenaOutcomeInput): RescueQuestArenaOutcome => {
  const cleared = input.now - input.startedAt > input.graceMs && input.aliveCount === 0;
  const timedOut = input.now >= input.endsAt;
  return { cleared, timedOut, done: cleared || timedOut };
};

export interface QuestGateOkInput {
  npcStatus: EventQuestStatus;
  rescueClearedAt: number; // 0=未
  now: number;             // newGameTime
  delayMs: number;         // RESCUE_TO_CASTLE_DELAY_MS
}

/** §2-6 確定: questGateOk =「このランでクエストが対象外(status==='gone')」または
 * 「レスキュー完了(rescueClearedAt>0)からdelayMs経過」。getEventQuestConfig(...)では判定しない
 * (設定はステージにしか紐づかないため、フリー出撃/練習/ベンチ/ボスメーカーでtrueになり城ボスが
 * ゲートされて詰む・§2-1)。 */
export const computeQuestGateOk = (input: QuestGateOkInput): boolean =>
  input.npcStatus === 'gone'
  || (input.rescueClearedAt > 0 && input.now >= input.rescueClearedAt + input.delayMs);
