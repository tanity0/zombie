// PACING_REDESIGN.md バッチ2(計測): 演目選択(バッチ4/5)とスタイル対応の判断材料となる純関数群。
// このバッチ自体はゲーム挙動を一切変えない(記録と表示のみ)。
//
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

import type { EnemyType } from '../types/game';

// 種別キル数の集計バケツ。少なくとも問題児5種は個別に見る(社長要望の演目選定材料)。
// それ以外は全て「チャフ計」にまとめる(ラボ専用/ボス/裏ボス等の希少キルで表を汚さない)。
export type KillBucket = 'pumpkin' | 'werewolf' | 'plant' | 'ghost' | 'screamer' | 'chaff';

const TRACKED_TYPES = new Set<string>(['pumpkin', 'werewolf', 'plant', 'ghost', 'screamer']);

// PACING_PUZZLE.md §9-3/§9-7#1(社長指示 2026-08-20): driller はpumpkin枠の実体化差し替え
// (「同格」)なので、演目選定材料の集計もpumpkinバケツへ合流させる(KillBucketにdriller枠は増やさない
// =台帳・演目判定は従来どおりpumpkinのまま消化する、という§9-3の「実体化のみ差し替え」原則の踏襲)。
export const bucketForKill = (type: EnemyType): KillBucket =>
  type === 'driller' ? 'pumpkin' : TRACKED_TYPES.has(type) ? (type as KillBucket) : 'chaff';

export type PlayStyle = '近接' | '遠距離' | 'バランス';

// スタイル推定: ガンキル/近接キルの累積比率。閾値は実機調整前提(私案)。
// キルが1件も無い(ラン開始直後)は判定不能なので「バランス」を安全な既定値として返す。
const MELEE_RATE_MELEE_STYLE = 0.6;  // これを超えたら近接型
const MELEE_RATE_RANGED_STYLE = 0.3; // これ未満なら遠距離型

export const styleFromKillCounts = (gunKills: number, meleeKills: number): PlayStyle => {
  const total = gunKills + meleeKills;
  if (total === 0) return 'バランス';
  const meleeRate = meleeKills / total;
  if (meleeRate > MELEE_RATE_MELEE_STYLE) return '近接';
  if (meleeRate < MELEE_RATE_RANGED_STYLE) return '遠距離';
  return 'バランス';
};

// バッチ3.5-Bの追補(社長報告「やっと倒したらすぐ沸いた」対応): 同型の問題児をキルしてから
// この時間内は、通常湧き抽選(featured床含む)+gatePressure配役の両方で再投入を禁止する。
// ボス系・screamer(専用ディレクター持ち)は対象外(呼び出し側でフィルタする)。
export const PROBLEM_REFRACTORY_MS = 15000;

// lastKillAtでの記録有無から、今この型が再投入禁止(リフラクトリ中)かどうかを判定する純関数。
export const isInRefractory = (lastKillAtMs: number | undefined, nowMs: number): boolean =>
  lastKillAtMs !== undefined && nowMs - lastKillAtMs < PROBLEM_REFRACTORY_MS;
