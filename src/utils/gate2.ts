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

// 城ボス(giantbat)ユニーク版の強さ倍率。CONSTANT_STRENGTH_TYPESの固定値を、この個体だけ
// 赤レア相当(×2)へ上書きする(社長設計「暫定」)。
export const GATE2_BOSS_STRENGTH_MULT = 2;
