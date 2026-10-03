// PACING_REDESIGN.md バッチM1-C(主題保証): 関所開始から15秒経ってもその関所のfeatured問題児が
// 当該関所内で1体も出現していなければ、pressureしきい値とboardDebt投入ゲートを無視して1体を
// 確定投入する(=単調対策の「アクセル役」)。ただし以下は破らない(仕様どおり):
//   ゾーン天井(憲法4条=初心者ゾーン(エリア0-1)では保証発動しない) /
//   同時数キャップ(憲法2条=useGameLoopのoverCap表と同じ数。通常のforcedType/セットピースは
//   このキャップの対象外だが、保証投入は明示的にキャップを守る=仕様の指定) /
//   リフラクトリ(killTelemetry.ts の PROBLEM_REFRACTORY_MS=15秒)。
// screamerは対象外(既存の専用ディレクター(screamerRef)が独自にCD/同時数を管理しており、保証側から
// 割り込むと状態がズレる。REFRACTORY_TYPES(useGameLoop.ts)も同じ理由でscreamerを除外している既存踏襲)。
//
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

import type { ProblemChild } from './gatePressure';
import { isInRefractory } from './killTelemetry';

export const GATE_FEATURE_GUARANTEE_MS = 15000;

// 憲法第2条(useGameLoop.tsのoverCap表と同じ数)。screamerは保証の対象外なのでここにも含めない。
export type GuaranteeType = Exclude<ProblemChild, 'screamer'>;
export const GUARANTEE_CONCURRENT_CAP: Record<GuaranteeType, number> = {
  plant: 2, werewolf: 2, pumpkin: 2, ghost: 1,
};

export interface FeatureGuaranteeInput {
  type: GuaranteeType;
  elapsedMs: number;                // 関所開始からの経過ms
  spawnedCountForType: number;      // 関所開始からの当該型の出現数(snapshotSpawns()差分。呼び出し側でディープコピーを取ること)
  area: number;                     // プレイヤーの現在エリア(0-4)
  isEventGate: boolean;             // 襲撃/スパイクなどイベント関所か(イベント自体が主題なので対象外)
  aliveOfType: number;              // 現在生存中の当該型の数
  lastKillAtMs: number | undefined; // 当該型の直近キル時刻(未キルはundefined)
  nowMs: number;
}

// true = この型を今すぐ1体、pressure/boardDebtを無視して投入してよい。
export const shouldGuaranteeSpawn = (input: FeatureGuaranteeInput): boolean => {
  if (input.isEventGate) return false;
  if (input.area <= 1) return false; // 憲法4条: 初心者ゾーン(エリア0-1)では保証発動しない
  if (input.elapsedMs < GATE_FEATURE_GUARANTEE_MS) return false;
  if (input.spawnedCountForType > 0) return false;
  if (input.aliveOfType >= GUARANTEE_CONCURRENT_CAP[input.type]) return false; // キャップ満杯は空き待ち
  if (isInRefractory(input.lastKillAtMs, input.nowMs)) return false;
  return true;
};
