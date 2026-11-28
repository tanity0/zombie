// EVENT_QUEST_DESIGN.md §2-11(二人組クエストv2・B4): ステージ5だけの先行条件(拠点2か所確保)を
// 扱う純関数。世界の状態(store)の書き込みは呼び出し側(src/hooks/useGameLoop.ts)に置く
// (CLAUDE.md「判定・選択のロジックはsrc/utils/の純関数へ切り出す」・実装精度の規律4)。

/**
 * §2-11「レスキュー出現 = 『4:00』と『2か所目を確保した瞬間』の遅い方」。
 * `basesRequired` が undefined(S1/S3/S4)の時は先行条件なし=時刻のみで判定する。
 * `basesEverCaptured` はラッチ済みの値(呼び出し側が単調に保つ・§2-11「一度2に達したらランの終わりまで
 * 下がらない」)を渡す前提。
 */
export const rescueQuestSpawnReady = (
  nowMs: number,
  spawnAtMs: number,
  basesEverCaptured: number,
  basesRequired: number | undefined,
): boolean => nowMs >= spawnAtMs && (basesRequired === undefined || basesEverCaptured >= basesRequired);

// ★v4(EVENT_QUEST_DESIGN.md §2-18・社長指示2026-09-14): 5:00 の通信(受注会話)の開始/終了の純関数。
/** 通信中(=強制リラックス中)か。開始打刻あり・終了打刻なし。 */
export const duoCommActive = (startedAtMs: number, endedAtMs: number): boolean => startedAtMs > 0 && endedAtMs === 0;
/**
 * 通信が終わったか: 表示中の行が無く、キューも空。原稿0行(S5)は開始した同じフレームで終わる。
 * 守護霊の台詞など別の行が同じキューに載っていれば、それも捌けるまで「終わっていない」(通信は1本のキュー)。
 */
export const duoCommEnded = (dialogueShowing: boolean, queueLength: number): boolean => !dialogueShowing && queueLength === 0;

/**
 * ★v4追補(社長指示2026-09-14「5分で通信だから読める。その10秒前くらいに入っちゃえば盤面は静まってる」):
 * 通信の静けさ(新規湧き停止)の窓。通信中は常に真。通信前は「通信開始の lead ms 前に入った」(readyWithinLead=
 * 呼び手が rescueQuestSpawnReady(now+lead, …) で判定)かつ裏ボス戦闘中でない時に真。終了打刻で偽。対象外(gone)/許可外は常に偽。
 */
export const duoQuietWindow = (input: {
  allowed: boolean; status: string; startedAtMs: number; endedAtMs: number; readyWithinLead: boolean; bossChasing: boolean;
}): boolean => {
  if (!input.allowed || input.status === 'gone' || input.endedAtMs > 0) return false;
  if (input.startedAtMs > 0) return true;
  return input.status === 'hidden' && input.readyWithinLead && !input.bossChasing;
};
