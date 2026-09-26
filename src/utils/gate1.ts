// PACING_PUZZLE.md §5.21 M20 stage③: 囲いゲート1(デンジャー→未確認境界=r>=5000のソフトゲート)。
// 発火条件/未達ペナルティ(死神前倒し)の判定を純関数化してユニットテスト可能にする
// (実装精度の規律4: 配線ロジックは純関数へ切り出す)。

export interface Gate1TriggerInput {
  enabled: boolean;           // 復帰フラグ ?gate=0 で無効化
  wallIdx: number | null;     // detectWallBreach の返り値(このtickで踏破した壁番号。無ければnull)
  gate1Cleared: boolean;      // このステージで既にクリア済み(恒久解除)か
  activeEventActive: boolean; // 他の囲い/イベント(horde/boss/rescue)が進行中でないか
  // §5.21-追補3(社長決定v0.25.1546): ラン内ガード。台本(fromEvent)殲滅でクリアした瞬間に立て、
  // 恒久コミット(gate1Cleared)を待たずに同ラン中の再発火を止める(実機報告「全滅後にまた沸いた」対策)。
  doneThisRun: boolean;
}

// 未確認境界(wallIdx===3)を踏破した瞬間、未クリアなら囲いゲート1を発火する。
export const shouldTriggerGate1 = (input: Gate1TriggerInput): boolean =>
  input.enabled && input.wallIdx === 3 && !input.gate1Cleared && !input.doneThisRun && !input.activeEventActive;

// 未クリアのまま未確認境界を踏破した=以後「未達ペナルティ」が発動する(社長設計)。
export const entersGate1Penalty = (wallIdx: number | null, gate1Cleared: boolean): boolean =>
  wallIdx === 3 && !gate1Cleared;

// 死神リスク蓄積の起点(spawnRiskDepthPx相当)。ペナルティ発動中は未確認到達ライン(frontloadedFloor)
// へ前倒しする(既存の起点より遠い=緩い方向には絶対に振れない=Math.minで安全側)。
export const effectiveReaperRiskFloor = (
  baseFloor: number, penaltyActive: boolean, frontloadedFloor: number,
): number => (penaltyActive ? Math.min(baseFloor, frontloadedFloor) : baseFloor);

// §5.21-追補4(社長決定v0.25.1553): 追補3で足した「ゲート1アクティブ中はchaff目標=ピーク・CD0を
// 強制」は撤回。ゲート1中もchaffは通常のkomaディレクター駆動のまま(ランク相応の目標/CD)。
// resolveGate1ChaffPlan(強制プラン関数)は削除済み — 雑魚の湧き数はディレクター任せに戻す。

// §5.21-追補7(社長決定v0.25.1574): 旧「ゲート1台本=紫tint+×5倍加算+finishKillOnly」は廃止。
// ゲート1台本は**レア色倍率のみ**で強さを表現する(GATE1_FORMATION_STRENGTH_MULT は削除・
// useGameLoop.ts のゲート1布陣配置箇所参照)。
// ★社長指示v0.25.3175「第一ゲートの敵は紫に降格で」: その色は **紫**(攻×2/HP×3)。
// v0.25.1574で赤(攻×3/HP×5)へ上げたぶんを戻した=**最初の関所に最上位レアは重すぎる**という裁定。
// 機構(色倍率だけで強さを出す)は追補7のまま=紫tintや×5加算の旧実装が戻ったわけではない。
