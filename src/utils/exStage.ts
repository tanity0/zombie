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
 *
 * ★§10-14#1の不変条件「天使は同時に1体」(runAngelBossTickは先頭1体しかtickしない=2体並ぶと
 * 片方が無言で凍る)を**唯一の生成点であるここで強制**する(v0.25.3721・検収監査#2):
 * otherAngelActive=場に別のゲート2天使(bossState保持)が居る間は、他の条件が揃っても湧かせない。
 * 通常フロー(gate2Cleared=スリィエル退場後)では常にfalseだが、?phillnow=1や将来の出現条件変更が
 * ゲート発火と重なっても不変条件が破れない安全網。
 */
export const phillBossSpawnReady = (
  gate2Cleared: boolean, playerDepthPx: number, spawnDepthPx: number, otherAngelActive = false,
): boolean => !otherAngelActive && gate2Cleared && playerDepthPx >= spawnDepthPx;

// ★バッチ2(§10-2「angelBossTickの7人目」): phillChaseVelocity(バッチ1の最小チェイスAI)はここで撤去した。
// フィルはisGate2AngelBoss編入によりrunAngelBossTick(angelBossTick.ts)が移動・技選択を丸ごと持つため、
// この葉モジュールに移動ロジックを置く必要が無くなった(exStageRun判定/出現深度判定の2関数だけが残る)。

// PACING_PUZZLE.md §10-20#3(EX舞台の洋館通路化・関所「スリィエル」): 既存gate2機構
// (gate2Pending/activeEvent/beginArenaEvent)を一切使わない、EX専用の3点セットの判定を純関数化する
// (CLAUDE.md「配線ロジックは純関数に切り出してテスト」)。呼び出し側(useGameLoop)はこの2関数の
// 結果でrefを進めるだけ=判定ロジック自体はここに1本化。

/**
 * §10-20#3(a) 発火判定: 未スポーンかつプレイヤーyがトリガーy以下(=より奥)に到達したら1回だけtrue。
 * 通路はyが負へ進むほど奥(北)なので「以下」で判定する(depthのMath.hypotではなくyそのもの)。
 */
export const surielGateSpawnReady = (
  alreadySpawned: boolean, playerY: number, triggerY: number,
): boolean => !alreadySpawned && playerY <= triggerY;

/**
 * §10-20#3(b) クリア打刻判定: §10-16のフィル撃破検知と同型のガードをそのまま書き写す
 * (スポーン済みref && まだ未打刻 && 場に居ない && 討伐カットイン/崩壊の間ではない)。
 */
export const surielGateClearReady = (
  spawned: boolean, alreadyCleared: boolean, alive: boolean, attentionActive: boolean, bossCorpseActive: boolean,
): boolean => spawned && !alreadyCleared && !alive && !attentionActive && !bossCorpseActive;
