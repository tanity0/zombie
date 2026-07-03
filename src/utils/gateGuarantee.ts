// PACING_V2.mdバッチR1-D: 関所の「主題保証」。台本のfeatured問題児が関所開始から
// GATE_FEATURE_GUARANTEE_MS(15秒)経ってもこのランの当該関所内で1体も出現していなければ、
// pressureしきい値・boardDebt投入ゲート・Intensityホールドを無視して1体だけ確定投入する
// (「台本は見せる。危険度は状況で抑える」)。
//
// 破ってよい: pressureしきい値/boardDebt投入ゲート/Intensityホールド。
// 破ってはならない(この関数の外=呼び出し側の責務): ゾーン天井/同時数キャップ/リフラクトリ15秒。
// ゾーン天井で解禁されない型は`allowedAtCeiling`に含めないことで対象外にする(初心者ゾーンでは
// 確定投入が立たない)。キャップ満杯時の「空き待ち」も呼び出し側がpendingとして毎フレーム
// 再評価する(このモジュールは「今投入すべきか」の判定のみを持つ)。
//
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

import type { KillBucket } from './killTelemetry';
import type { ProblemChild } from './gatePressure';

export const GATE_FEATURE_GUARANTEE_MS = 15000;

export interface GateGuaranteeInputs {
  elapsedMs: number;                          // 関所開始からの経過ms
  featuredProblemChildren: ProblemChild[];    // 台本のfeaturedのうち問題児のみ(呼び出し側でフィルタ済み)
  allowedAtCeiling: ProblemChild[];            // このゾーン/台本の天井で解禁されている問題児(allowedProblemChildren(ceiling, order)の結果)
  anchorSpawns: Readonly<Record<KillBucket, number>>; // 関所開始時点のsnapshotSpawns()(ディープコピー必須・呼び出し側の責務)
  nowSpawns: Readonly<Record<KillBucket, number>>;    // 現在のsnapshotSpawns()
  alreadyInjected: boolean;                    // このgate内で既に確定投入済みか(1体だけの意図)
}

export interface GateGuaranteeResult {
  shouldInject: boolean;
  type: ProblemChild | null;
}

export const evaluateGateGuarantee = (input: GateGuaranteeInputs): GateGuaranteeResult => {
  if (input.alreadyInjected) return { shouldInject: false, type: null };
  if (input.elapsedMs < GATE_FEATURE_GUARANTEE_MS) return { shouldInject: false, type: null };
  const target = input.featuredProblemChildren.find(t =>
    input.allowedAtCeiling.includes(t) && input.nowSpawns[t] <= input.anchorSpawns[t]
  );
  return target ? { shouldInject: true, type: target } : { shouldInject: false, type: null };
};
