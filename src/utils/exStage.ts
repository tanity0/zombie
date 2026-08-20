// PACING_PUZZLE.md §10-15#7(EXボス「フィル(変異体)」バッチ1): isExStageRun は葉モジュールに置く
// (循環import回避=v0.25.3390 TDZ暗転の教訓。drillerAi/gauntletModeと同じ作法=依存を
// getSelectedStageId 1本だけに絞る)。
//
// storyBossOnly を stage-ex1 から廃止した後も、EX固有の抑止(賞金首自然湧き/紅き夜/囲いイベント/
// ハンター変異体/警察署アリーナ等の側イベント・城ボス出現)は維持したい。useGameLoop の
// `!storyBoss` 抑止サイトへ `&& !isExStageRun()` として足すための1関数(PACING_PUZZLE.md §10-14#4)。
import { getSelectedStageId } from '../data/progress';

/** 今の出撃がEXステージ(stage-ex1)か。 */
export const isExStageRun = (): boolean => getSelectedStageId() === 'stage-ex1';

/**
 * PACING_PUZZLE.md §10-14#5(フィル出現トリガ): gate2Cleared(スリィエル撃破) && プレイヤー深度が
 * PHILL_SPAWN_DEPTH以上、で出現させる。深度の算出(Math.hypot)は呼び出し側(useGameLoop)が渡す
 * (このモジュールはプレイヤー座標に依存しない=葉のまま)。
 */
export const phillBossSpawnReady = (
  gate2Cleared: boolean, playerDepthPx: number, spawnDepthPx: number,
): boolean => gate2Cleared && playerDepthPx >= spawnDepthPx;

/**
 * バッチ1のフィル(phillboss)は技を持たない置物=プレイヤーへ直進するだけの最小AI
 * (バッチ2でangelBossTickへ本格編入するまでの仮の動き。CLAUDE.md「動きは慣性」は技の演出の話で、
 * この直進チェイス自体は既存の雑魚チェイスAIと同じ直線追跡=対象外)。
 * 速度ベクトルを返すだけの純関数。移動の反映・clampRectToPlayableAreaは呼び出し側の責務。
 */
export const phillChaseVelocity = (
  bossCx: number, bossCy: number, targetCx: number, targetCy: number, speed: number,
): { vx: number; vy: number } => {
  const dx = targetCx - bossCx, dy = targetCy - bossCy;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return { vx: 0, vy: 0 };
  return { vx: (dx / dist) * speed, vy: (dy / dist) * speed };
};
