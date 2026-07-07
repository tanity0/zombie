// PACING_PUZZLE.md §5.21 M20 stage③: 囲いゲート1(デンジャー→未確認境界=r>=5000のソフトゲート)。
// 発火条件/未達ペナルティ(死神前倒し)の判定を純関数化してユニットテスト可能にする
// (実装精度の規律4: 配線ロジックは純関数へ切り出す)。

export interface Gate1TriggerInput {
  enabled: boolean;           // 復帰フラグ ?gate=0 で無効化
  wallIdx: number | null;     // detectWallBreach の返り値(このtickで踏破した壁番号。無ければnull)
  gate1Cleared: boolean;      // このステージで既にクリア済み(恒久解除)か
  activeEventActive: boolean; // 他の囲い/イベント(horde/boss/rescue)が進行中でないか
}

// 未確認境界(wallIdx===3)を踏破した瞬間、未クリアなら囲いゲート1を発火する。
export const shouldTriggerGate1 = (input: Gate1TriggerInput): boolean =>
  input.enabled && input.wallIdx === 3 && !input.gate1Cleared && !input.activeEventActive;

// 未クリアのまま未確認境界を踏破した=以後「未達ペナルティ」が発動する(社長設計)。
export const entersGate1Penalty = (wallIdx: number | null, gate1Cleared: boolean): boolean =>
  wallIdx === 3 && !gate1Cleared;

// 死神リスク蓄積の起点(spawnRiskDepthPx相当)。ペナルティ発動中は未確認到達ライン(frontloadedFloor)
// へ前倒しする(既存の起点より遠い=緩い方向には絶対に振れない=Math.minで安全側)。
export const effectiveReaperRiskFloor = (
  baseFloor: number, penaltyActive: boolean, frontloadedFloor: number,
): number => (penaltyActive ? Math.min(baseFloor, frontloadedFloor) : baseFloor);
