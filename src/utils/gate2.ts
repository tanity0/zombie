// PACING_PUZZLE.md §5.21 M20 stage④: 囲いゲート2(未確認→深層境界=r>=7500のハードゲート)。
// 発火条件の判定を純関数化してユニットテスト可能にする(実装精度の規律4)。
export interface Gate2TriggerInput {
  enabled: boolean;           // 復帰フラグ ?gate=0 で無効化
  wallIdx: number | null;     // detectWallBreach の返り値(このtickで踏破した壁番号。無ければnull)
  gate2Cleared: boolean;      // このステージで既にクリア済み(恒久解除)か
  activeEventActive: boolean; // 他の囲い/イベント(horde/boss/rescue/ゲート1)が進行中でないか
}

// 深層境界(wallIdx===4)を踏破した瞬間、未クリアなら囲いゲート2を発火する。
export const shouldTriggerGate2 = (input: Gate2TriggerInput): boolean =>
  input.enabled && input.wallIdx === 4 && !input.gate2Cleared && !input.activeEventActive;

// ゲート2ボスの強さ倍率(旧: 城ボスgiantbat仮流用時の×5・§5.21-追補4)。
// 社長指示v0.25.1595「基本値の方にして」でミゲルには適用しない(useGameLoop側の乗算を撤去)=現在は休眠。
// 将来ゲート2ボスにも倍率を掛けたくなったら useGameLoop の spawn 2箇所で再度乗算する用に値だけ残す。gate2.testが値5を担保。
export const GATE2_BOSS_STRENGTH_MULT = 5;
