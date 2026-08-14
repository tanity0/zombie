// PACING_PUZZLE.md §7-11c(2): ランク床(案A・決定済み仕様)。
// ①ランク持ち越し廃止・全ランR1固定スタート(持ち越しの保存/読み出しはprogress.tsから撤去済み)。
// ②床カーブ=時間経過による下限(査定=既存のrankAssessor昇降格はそのまま床の上に乗る)。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(実装精度の規律4)。
//
// 床上限=R5(最後の2段R6/R7は査定=腕でしか到達しない・§7-11(4)「地獄の上澄みは腕の証明として残す」)。
// 間隔(案A): stage-1=2.5分 / stage-3=2.0分 / stage-4=1.5分 / stage-5=1.2分 / stage-6=1.0分。
// stage-2/stage-7/チュートリアル/EX/未指定は掲載なし=床なし(常にR1。旧STAGE_MIN_START_RANKで
// stage-1/stage-2が共に「フロアなし相当」だった扱いをstage-2側だけそのまま引き継ぐ形になる)。

export const RANK_FLOOR_CAP = 5;

const RANK_FLOOR_INTERVAL_MIN: Record<string, number> = {
  'stage-1': 2.5,
  'stage-3': 2.0,
  'stage-4': 1.5,
  'stage-5': 1.2,
  'stage-6': 1.0,
};

/** 純関数: ステージ→床が1段上がる間隔(ms)。未掲載ステージ=Infinity(床が一切上がらない=常にR1)。 */
export const rankFloorIntervalMs = (stageId: string): number => {
  const min = RANK_FLOOR_INTERVAL_MIN[stageId];
  return typeof min === 'number' ? min * 60000 : Infinity;
};

/**
 * 純関数: 経過ms×ステージ→床ランク(1..RANK_FLOOR_CAP)。
 * paceMult = `?rankfloorpace=<倍率>`(既定1・大きいほど間隔が伸びる=床の上昇が遅くなる)。
 * 0以下・NaNは既定1へフォールバック(暴走防止)。
 */
export const rankFloorForElapsed = (stageId: string, elapsedMs: number, paceMult = 1): number => {
  const safePace = Number.isFinite(paceMult) && paceMult > 0 ? paceMult : 1;
  const interval = rankFloorIntervalMs(stageId) * safePace;
  if (!Number.isFinite(interval) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return 1;
  return Math.max(1, Math.min(RANK_FLOOR_CAP, 1 + Math.floor(elapsedMs / interval)));
};

/** 純関数: `?rankfloorpace=`の生値→倍率(空/NaN/0以下はデフォルト1へフォールバック)。 */
export const parseRankFloorPaceMult = (raw: string | null | undefined): number => {
  if (raw === null || raw === undefined || raw === '') return 1;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : 1;
};
