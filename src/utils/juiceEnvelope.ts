// PACING_PUZZLE.md §5.22 M21(社長委任v0.25.1516・CD制確定v0.25.1524): KILL演出の
// 「フル(フリーズ+ズーム+スロー)を出すか、CD内で最低保証フラッシュのみか」の判定を純関数化。
// 実装精度の規律4: 配線ロジックは純関数へ切り出してユニットテスト可能にする。
export const shouldFireFullJuiceCinematic = (
  nowMs: number, lastFullAtMs: number, cdMs: number,
): boolean => nowMs - lastFullAtMs >= cdMs;
