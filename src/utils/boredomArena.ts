// PACING_PUZZLE.md §5.21 M20 軸1(退屈補正の囲い)。退屈シグナル(boredomDirector/upswing)が完全に
// 立ち上がった時に、眠っている囲いhorde(既存機構)を1回だけ差し込む発火条件。純関数化してユニット
// テスト可能にする(実装精度の規律4: 配線ロジックは純関数へ切り出す)。
export const BOREDOM_ARENA_START_MS = 60000; // ゲーム開始1分以降のみ対象(社長設計)
export const BOREDOM_ARENA_CD_MS = 120000;   // 発火後のCD=2分(社長設計「多用しない」)

export interface BoredomArenaGateInput {
  enabled: boolean;
  gameTime: number;
  nextEligibleAt: number;
  bossChasing: boolean;
  hiddenBossAlive: boolean;
  hunterIdle: boolean;
  redNightActive: boolean;
  boredomReady: boolean;
}

export const shouldFireBoredomArena = (input: BoredomArenaGateInput): boolean => {
  if (!input.enabled) return false;
  if (input.gameTime < BOREDOM_ARENA_START_MS) return false;
  if (input.gameTime < input.nextEligibleAt) return false;
  if (input.bossChasing || input.hiddenBossAlive) return false;
  if (!input.hunterIdle) return false;
  if (input.redNightActive) return false;
  if (!input.boredomReady) return false;
  return true;
};
