// PACING_REDESIGN.md バッチ3(最小版): 山(関所)の連続圧力化。
// 方式確定 v0.25.1304(Fableチャット決定): 離散段0〜7+最低滞在12秒は不採用。
// 「階段を強制的に作るというより、この階段になるように台本の中でディレクターがリアルタイムで
// 緩急をつけていく」= 連続スカラー pressure(0〜1)を毎フレーム動かし、そのままテンポ/数/問題児
// 解禁のレバーへ変換する。段差(二値)が残るのは問題児の解禁しきい値だけ。数値は全て実機調整前提。
//
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

import type { PlayStyle } from './killTelemetry';
import { RISE_DEBT_MAX } from './boardDebt';

export interface GatePressureState {
  pressure: number;
  crossed50: boolean; // 0.50を上向きに跨いで「配役済み」状態(ヒステリシスで0.45未満に落ちるまで保持)
  crossed65: boolean; // 0.65側の同上
}

export const createGatePressureState = (startPressure = 0): GatePressureState => ({
  pressure: Math.max(0, Math.min(1, startPressure)),
  crossed50: false,
  crossed65: false,
});

// 開始値のRankボーナス(DirectorRankの「次の山を強める」の統合。旧「開始段+1」の置き換え)。
// 社長決定: 関所間の持ち越しは無し(毎回0+ボーナスから登り直し)。
export const startPressureForRank = (rank: 0 | 1 | 2): number => (rank === 2 ? 0.2 : rank === 1 ? 0.1 : 0);

const NO_HIT_SCORE_SEC = 10;   // 無被弾スコア: 直近被弾からこの秒数で1.0
const KILL_RATE_GOOD = 0.3;    // 撃破ペーススコア: kill/sのEMAがこの値で1.0
const UP_TAU_S = 5;            // 上げの時定数(PACING_V2.mdバッチR1-E: 8秒→5秒。60秒関所内に配役0.50へ確実に届かせる)
const DOWN_TAU_S = 2;          // 下げの時定数(速い)
const HIT_IMPULSE_DROP = 0.15; // 被弾インパルスの即時ステップ減
const HYSTERESIS = 0.05;       // 配役しきい値のヒステリシス幅(点滅防止)

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export interface GatePressureInputs {
  msSinceLastHit: number; // 直近被弾からの経過ms
  killRateEma: number;    // 撃破/秒のEMA
  hitImpulse: boolean;    // このフレームで被弾インパルス(2秒以内2被弾 or 1発でHP15%減)が発生したか
  // PACING_V2.mdバッチR1-E: Intensityによる上げホールドは撤廃済み(risingBlockedはboardDebtのみで
  // 判定)。フィールド自体は呼び出し側(useGameLoop)が引き続き渡すため残すが、このステップ関数内では未使用。
  intensity: number;      // AIディレクターのIntensity(0..1)
  ceiling: number;        // 実効天井(maxRung→天井変換 × ゾーン天井 の小さい方)
  dtMs: number;
  // PACING_REDESIGN.mdバッチ3.5-B(盤面在庫): 省略時は0=従来と完全一致(risingBlockedへ影響なし)。
  boardDebt?: number;
  // PACING_REDESIGN.mdバッチ6(ステージ難易度指数): 省略時はUP_TAU_S(PACING_V2.mdバッチR1-Eで5sへ
  // 変更済み)。実プレイではuseGameLoopが常にstageAggro.tsの`riseTauSForAggro`を渡すため、この
  // デフォルトは実プレイでは使われない。【裁定済みv0.26.6】riseTauSForAggroの中立点(aggro=0.5)も
  // 5sへ再較正済みなので、実プレイ・純関数どちらの経路でも中立5sで一致する。
  riseTauS?: number;
}

export interface GatePressureStepResult {
  state: GatePressureState;
  castFirstNow: boolean;  // このフレームで0.50を新規に上向きに跨いだ(1体目の配役タイミング)
  castSecondNow: boolean; // このフレームで0.65を新規に上向きに跨いだ(2体目の配役タイミング)
}

// perf(そつなくこなせているか)へ指数平滑で追従。上げは遅く(UP_TAU_S)・下げは速く(DOWN_TAU_S)。
// 被弾インパルスは時定数を経由せず即座にステップで引く(ピンチには即座に圧を抜く俊敏さの保険)。
export const stepGatePressure = (prev: GatePressureState, inputs: GatePressureInputs): GatePressureStepResult => {
  const noHitScore = clamp01((inputs.msSinceLastHit / 1000) / NO_HIT_SCORE_SEC);
  const killScore = clamp01(inputs.killRateEma / KILL_RATE_GOOD);
  const perf = 0.6 * noHitScore + 0.4 * killScore;

  let pressure = prev.pressure;
  if (inputs.hitImpulse) pressure = Math.max(0, pressure - HIT_IMPULSE_DROP);

  // バッチ3.5-B(盤面在庫): 「今盤面に何がいるのか」を見ずに登り続けないよう、debtが高い間は
  // 登りだけをブロックする(憲法第5条「ピンチに撃たない」の盤面版)。
  // PACING_V2.mdバッチR1-E: Intensity≥0.75での上げ停止(ホールド)は撤廃(本書裁定)。危険時の抑制は
  // 被弾インパルス(-0.15・維持)+boardDebt+キャップが担う(「台本は見せる。危険度は状況で抑える」)。
  const risingBlocked = (inputs.boardDebt ?? 0) > RISE_DEBT_MAX;
  if (!risingBlocked) {
    const dtS = Math.max(0, inputs.dtMs) / 1000;
    const tauS = perf >= pressure ? (inputs.riseTauS ?? UP_TAU_S) : DOWN_TAU_S;
    const alpha = 1 - Math.exp(-dtS / tauS);
    pressure += (perf - pressure) * alpha;
  }
  const ceiling = Math.max(0, inputs.ceiling);
  pressure = Math.max(0, Math.min(ceiling, pressure));

  // ヒステリシス: 一度「配役済み」になったら 0.50-HYSTERESIS 未満に落ちるまで解除しない
  // (跨ぎ直後の微振動で配役が連発しない)。
  const crossed50 = prev.crossed50 ? pressure >= 0.50 - HYSTERESIS : pressure >= 0.50;
  const crossed65 = prev.crossed65 ? pressure >= 0.65 - HYSTERESIS : pressure >= 0.65;
  const castFirstNow = !prev.crossed50 && crossed50;
  const castSecondNow = !prev.crossed65 && crossed65;

  return { state: { pressure, crossed50, crossed65 }, castFirstNow, castSecondNow };
};

// ---- レバー変換(すべてpressureだけの純関数) --------------------------------------------

// 雑魚テンポ(第一レバー・憲法第3条): 1.0(素)→0.55(最速)の連続。段差なし。
export const intervalMultForPressure = (pressure: number): number => 1.0 - 0.45 * clamp01(pressure);

// 数(憲法第1条: 基本10+2のみ)。数を触るのはここだけ。
export const capBonusForPressure = (pressure: number): number => (pressure >= 0.55 ? 2 : 0);

// レア演出のブースト(0.80以上でrareMult×1.35相当を追加で乗せる、呼び出し側の裁量)。
export const rareBoostActiveForPressure = (pressure: number): boolean => pressure >= 0.80;

export type ProblemChild = 'plant' | 'werewolf' | 'pumpkin' | 'screamer' | 'ghost';

// スタイル(バッチ2 styleFromKillCounts)に応じた1種目/2種目の配役順。バランス型はtieBreakで1回だけ決める。
export const specialCastOrder = (style: PlayStyle, tieBreakRandom: number): [ProblemChild, ProblemChild] => {
  if (style === '遠距離') return ['pumpkin', 'werewolf'];
  if (style === '近接') return ['werewolf', 'pumpkin'];
  return tieBreakRandom < 0.5 ? ['pumpkin', 'werewolf'] : ['werewolf', 'pumpkin'];
};

// 現在のpressureで許可されている問題児の集合(累積: 高いpressureは低い段の許可を含む)。
// specialCast はラン内で固定された [1体目, 2体目] の配役順(specialCastOrderの結果)。
export const allowedProblemChildren = (pressure: number, specialCast: [ProblemChild, ProblemChild]): ProblemChild[] => {
  const p = clamp01(pressure);
  const allowed: ProblemChild[] = [];
  if (p >= 0.35) allowed.push('plant');
  if (p >= 0.50) allowed.push(specialCast[0]);
  if (p >= 0.65) allowed.push(specialCast[1]);
  if (p >= 0.80) allowed.push('screamer');
  if (p >= 0.95) allowed.push('ghost');
  return allowed;
};

// 台本のmaxRung(離散段の名残)→ pressureの天井へ変換(旧離散案との互換)。定義の無い値は天井1.0。
const MAX_RUNG_CEILING: Record<number, number> = { 2: 0.34, 3: 0.49, 4: 0.64, 5: 0.79, 6: 0.94, 7: 1.00 };
export const ceilingForMaxRung = (maxRung: number): number => MAX_RUNG_CEILING[maxRung] ?? 1.00;

// ゾーン上限(憲法第4条)。エリア0-1(初心者)はテンポと数のみに事実上制限される。
const ZONE_CEILING: number[] = [0.34, 0.34, 0.79, 0.94, 1.00]; // area 0..4
// GAME_AUDIT #8 検証結果: エリア3の天井0.94 < ghost解禁0.95は仕様どおり(旧離散段の
// ゾーン上限「エリア3=段6(叫びまで)/エリア4=段7(ゴースト)」の変換値。ghostの関所解禁は
// 深層域(エリア4)限定が意図。緩フェーズの自然プール(AREA_WEIGHTエリア2+)からは従来どおり出る)。
export const ceilingForZone = (area: number): number => ZONE_CEILING[Math.max(0, Math.min(4, area))] ?? 1.00;
