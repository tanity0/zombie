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
