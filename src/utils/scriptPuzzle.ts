// PACING_PUZZLE.md バッチM3: 盤面構成パズル(scriptPuzzle)。
// 「今この瞬間、盤面のどの枠から何を1体湧かせるべきか」を決める純関数群。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。
//
// §0.5 攻略性の原則(最重要): 邪魔者・特別枠は常に時間差で着弾させる(バースト禁止)。
// 枠共通CD3秒はどんな締め/成長でも縮めない。被弾直後1.5秒は邪魔者・特別枠の新規投入をしない。

import type { PuzzleRank } from './rankAssessor';
import { cdBasisForRank, cdBasisTightened } from './rankAssessor';

export type NuisanceType = 'plant' | 'werewolf' | 'pumpkin';
export type SpecialType = 'screamer' | 'ghost';
export type ChaffType = 'bat' | 'skeleton' | 'zombie';
export type PuzzleSpawnType = NuisanceType | SpecialType | ChaffType;
export type PuzzleSpawnSlot = 'nuisance' | 'special' | 'chaff';

export interface NuisanceCounts { plant: number; werewolf: number; pumpkin: number; }
export const NUISANCE_TYPES: NuisanceType[] = ['plant', 'werewolf', 'pumpkin'];
export const ZERO_NUISANCE: NuisanceCounts = { plant: 0, werewolf: 0, pumpkin: 0 };

// ---- 4-A/4-B: 台本(盤面構成パターン)表 -----------------------------------------------

export interface FormationPattern {
  id: string;   // 'R{rank}-{slot}'
  rank: PuzzleRank;
  slot: 'A' | 'B' | 'C' | 'D';
  nuisance: Partial<Record<NuisanceType, number>>;
}

const p = (rank: PuzzleRank, slot: FormationPattern['slot'], nuisance: Partial<Record<NuisanceType, number>>): FormationPattern =>
  ({ id: `R${rank}-${slot}`, rank, slot, nuisance });

// 社長決定・確定表(§4-B)。弾=plant/犬=werewolf。R6はC/D無し・R7はD無し(表のとおり)。
export const FORMATION_TABLE: FormationPattern[] = [
  p(1, 'A', {}), p(1, 'B', { werewolf: 1 }), p(1, 'C', { pumpkin: 1 }), p(1, 'D', { plant: 1 }),
  p(2, 'A', { werewolf: 2 }), p(2, 'B', { plant: 2 }), p(2, 'C', { pumpkin: 1, plant: 1 }), p(2, 'D', { werewolf: 1, plant: 1 }),
  p(3, 'A', { werewolf: 1, pumpkin: 1 }), p(3, 'B', { werewolf: 2, plant: 1 }), p(3, 'C', { plant: 3 }), p(3, 'D', { pumpkin: 1, plant: 2 }),
  p(4, 'A', { pumpkin: 2 }), p(4, 'B', { werewolf: 1, plant: 1, pumpkin: 1 }), p(4, 'C', { werewolf: 2, plant: 2 }), p(4, 'D', { plant: 3, pumpkin: 1 }),
  p(5, 'A', { pumpkin: 2, werewolf: 1 }), p(5, 'B', { pumpkin: 2, plant: 2 }), p(5, 'C', { werewolf: 3 }), p(5, 'D', { werewolf: 2, pumpkin: 1 }),
  p(6, 'A', { pumpkin: 1, plant: 3, werewolf: 1 }), p(6, 'B', { werewolf: 3, plant: 1 }),
  p(7, 'A', { pumpkin: 2, werewolf: 3 }), p(7, 'B', { werewolf: 3, plant: 3 }), p(7, 'C', { werewolf: 2, pumpkin: 2, plant: 3 }),
];

// HARVEST(4-C)は台本を強制的にこれへ固定する(基本セットのみ)。
export const HARVEST_PATTERN: FormationPattern = FORMATION_TABLE[0]; // R1-A

export const patternsForRank = (rank: PuzzleRank): FormationPattern[] => FORMATION_TABLE.filter(fp => fp.rank === rank);

export const nuisanceTarget = (pattern: FormationPattern): NuisanceCounts => ({
  plant: pattern.nuisance.plant ?? 0,
  werewolf: pattern.nuisance.werewolf ?? 0,
  pumpkin: pattern.nuisance.pumpkin ?? 0,
});

// 未見優先→ランダム。直前と同じパターンは選ばない(そのランクが1種しかない極端ケースは許容)。
export const allPatternsSeen = (rank: PuzzleRank, seenIds: ReadonlySet<string>): boolean =>
  patternsForRank(rank).every(fp => seenIds.has(fp.id));

export const selectPattern = (
  rank: PuzzleRank,
  seenIds: ReadonlySet<string>,
  lastPatternId: string | null,
  tieBreakRandom: number
): FormationPattern => {
  const all = patternsForRank(rank);
  let pool = all.length > 1 ? all.filter(fp => fp.id !== lastPatternId) : all;
  const unseen = pool.filter(fp => !seenIds.has(fp.id));
  if (unseen.length > 0) pool = unseen;
  const idx = Math.min(pool.length - 1, Math.floor(tieBreakRandom * pool.length));
  return pool[idx];
};

// ---- 4-A: 特別枠(距離解禁) -------------------------------------------------------------

export interface SpecialSlotDef { type: SpecialType; count: number; minArea: number; }
// 叩き台(★未決: ステージ別の追加種類は本表を更新する。雪原=リッチ等は未着手)。
export const SPECIAL_SLOTS: SpecialSlotDef[] = [
  { type: 'screamer', count: 1, minArea: 3 },
  { type: 'ghost', count: 2, minArea: 4 },
];

export const eligibleSpecialSlots = (area: number): SpecialSlotDef[] => SPECIAL_SLOTS.filter(s => area >= s.minArea);

export const nextSpecialDeficit = (area: number, alive: Partial<Record<SpecialType, number>>): SpecialType | null => {
  for (const s of eligibleSpecialSlots(area)) {
    if ((alive[s.type] ?? 0) < s.count) return s.type;
  }
  return null;
};

export const nextNuisanceDeficit = (target: NuisanceCounts, alive: NuisanceCounts): NuisanceType | null => {
  for (const t of NUISANCE_TYPES) {
    if (alive[t] < target[t]) return t;
  }
  return null;
};

// ---- 0.5/4-A: 投入CD(枠共通・締めても縮めない) -----------------------------------------

export const NUISANCE_CD_MS = 3000;
export const SPECIAL_CD_MS = 3000;
export const POST_HIT_GUARD_MS = 1500; // 被弾直後は邪魔者・特別枠の新規投入をしない(叩き台)

// ---- 4-A: 基本セット(チャフ)度数 -------------------------------------------------------

export interface ChaffWeights { bat: number; skeleton: number; zombie: number; }
export const CHAFF_WEIGHTS_DEFAULT: ChaffWeights = { bat: 5, skeleton: 3, zombie: 1 };
// (旧CHAFF_WEIGHTS_HARVEST(7:2:1)はM6の§4-C改訂でコマ別度数chaffWeightsForKomaへ置き換え)

export const pickChaffType = (weights: ChaffWeights, tieBreakRandom: number): ChaffType => {
  const total = Math.max(1e-9, weights.bat + weights.skeleton + weights.zombie);
  let r = tieBreakRandom * total;
  if (r < weights.bat) return 'bat';
  r -= weights.bat;
  if (r < weights.skeleton) return 'skeleton';
  return 'zombie';
};

// ---- 盤面維持: 「今なにを1体湧かせるべきか」の決定 --------------------------------------

export interface PuzzleSpawnDecision { type: PuzzleSpawnType; slot: PuzzleSpawnSlot; }

export interface BoardMaintenanceInput {
  boardCount: number;
  boardTarget: number;
  cdElapsedMs: number;              // 最後の基本湧きからの経過ms
  cdMs: number;                     // 実効基本CD(rankAssessor.tickPuzzleClockの結果を渡す)
  nuisanceElapsedMs: number;        // 最後の邪魔者投入からの経過ms
  nuisanceTargetCounts: NuisanceCounts; // RELAX等のオーバーライドを適用済みの実効目標
  aliveNuisance: NuisanceCounts;
  specialElapsedMs: number;
  area: number;                     // RELAX中は-1を渡せば特別枠は自然に不適格になる(呼び出し側の慣習)
  aliveSpecial: Partial<Record<SpecialType, number>>;
  msSinceLastHit: number;
  chaffWeights: ChaffWeights;
  tieBreakRandom: number;
}

// バースト禁止(§0.5・§3-A): 呼び出し側は毎フレーム1回呼び、返り値が非nullの時だけ1体だけ湧かせる。
export const decideNextSpawn = (input: BoardMaintenanceInput): PuzzleSpawnDecision | null => {
  if (input.boardCount >= input.boardTarget) return null;
  if (input.cdElapsedMs < input.cdMs) return null;
  const guardActive = input.msSinceLastHit < POST_HIT_GUARD_MS;
  if (!guardActive && input.nuisanceElapsedMs >= NUISANCE_CD_MS) {
    const t = nextNuisanceDeficit(input.nuisanceTargetCounts, input.aliveNuisance);
    if (t) return { type: t, slot: 'nuisance' };
  }
  if (!guardActive && input.specialElapsedMs >= SPECIAL_CD_MS) {
    const t = nextSpecialDeficit(input.area, input.aliveSpecial);
    if (t) return { type: t, slot: 'special' };
  }
  return { type: pickChaffType(input.chaffWeights, input.tieBreakRandom), slot: 'chaff' };
};

// RELAX/HARVEST共通: 邪魔者枠は「新規補充のみ停止・在席は残す」= 実効目標を現在の在籍数に固定する
// (nextNuisanceDeficitは常にnullを返すようになる=補充されない。倒せば自然に減る)。
export const noNewSupplyNuisanceTarget = (alive: NuisanceCounts): NuisanceCounts => ({ ...alive });

// ---- M6 §4-C: 4コマサイクル(リラックス→ハーベスト→通常→ピーク)【旧4-C(RELAX⇄HARVEST交互)は廃止】

export type KomaKind4 = 'relax' | 'harvest' | 'normal' | 'peak';
export const KOMA_ORDER: KomaKind4[] = ['relax', 'harvest', 'normal', 'peak']; // ラン開始=リラックスから
export const nextKomaKind = (kind: KomaKind4): KomaKind4 =>
  KOMA_ORDER[(KOMA_ORDER.indexOf(kind) + 1) % KOMA_ORDER.length];

export const KOMA_BASE_MS = 40000;          // 各コマ基本40秒(社長決定v0.25.1384)
export const KOMA_EXTENSION_MAX_MS = 30000; // 通常/ピークの処理待ち延長上限(叩き台。超えたら強制切替)

// チャフ度数(§4-C各コマの役割)。リラックス=bat6:skel4:zombie0/ハーベスト=bat7:skel3:zombie0/
// 通常・ピーク=基本セット5:3:1。
export const chaffWeightsForKoma = (kind: KomaKind4): ChaffWeights => {
  if (kind === 'relax') return { bat: 6, skeleton: 4, zombie: 0 };
  if (kind === 'harvest') return { bat: 7, skeleton: 3, zombie: 0 };
  return CHAFF_WEIGHTS_DEFAULT;
};

// チャフ目標(§4-C・上限capに対する比率)。リラックス40%/ハーベスト100%/通常50%/ピーク100%。
export const chaffTargetForKoma = (kind: KomaKind4, cap: number): number => {
  if (kind === 'relax') return Math.round(cap * 0.4);
  if (kind === 'normal') return Math.round(cap * 0.5);
  return cap; // harvest / peak = 満量
};

// チャフ目標へのランプ間隔(§3-A/4-C: 目標へは1体ずつ近づく=バースト禁止の担保)。
// ハーベスト=2秒(明記)。通常/ピーク=6秒(締め中4秒)。リラックスも6秒(ラン開始の立ち上がり用。
// 下げ方向は即スナップなので通常は効かない)。
export const rampIntervalForKoma = (kind: KomaKind4, tightened: boolean): number => {
  if (kind === 'harvest') return 2000;
  return tightened ? 4000 : 6000;
};

// 基本CD(§4-C+§3-D)。リラックス=ランク基準×2/ハーベスト=×0.5/通常=ランク基準(締めで1段上)/
// ピーク=1段締めが基準(R7はさらに×0.5。締めでもう1段=表端はクランプ・R7の締めは0)。
// 緩め(softened)は全コマ共通で×1.5、かつ締めと同時成立時は緩め優先(安全側)。
export const cdForKoma = (
  kind: KomaKind4, rank: PuzzleRank, r7Cap: number, tightened: boolean, softened: boolean
): number => {
  const tight = tightened && !softened && (kind === 'normal' || kind === 'peak'); // 締めは通常/ピーク限定
  let cd: number;
  if (kind === 'relax') cd = cdBasisForRank(rank, r7Cap) * 2;
  else if (kind === 'harvest') cd = cdBasisForRank(rank, r7Cap) * 0.5;
  else if (kind === 'normal') cd = tight ? cdBasisTightened(rank, r7Cap) : cdBasisForRank(rank, r7Cap);
  else { // peak: 基準=1段締め(R7は×0.5)。さらに締め=もう1段(R6以下は表端クランプ・R7は0)。
    if (rank === 7) cd = tight ? 0 : cdBasisForRank(7, r7Cap) * 0.5;
    else {
      const base = cdBasisForRank(Math.min(7, rank + 1) as PuzzleRank, r7Cap);
      cd = tight ? cdBasisForRank(Math.min(7, rank + 2) as PuzzleRank, r7Cap) : base;
    }
  }
  return softened ? cd * 1.5 : cd;
};

// チャフ目標の実効値ランプ(上げは1ずつ・下げは即スナップ)。§3-Aの被弾ホールド(直近10秒被弾で
// 据え置き)は通常/ピーク/リラックスに適用、ハーベストは適用しない(盛りは演出=旧harvestTargetTickと
// 同じ扱い。辛い時は緩め§3-Dが別途効く)。
export interface ChaffRampState { target: number; msSinceRampMs: number; }
export const stepChaffRamp = (
  state: ChaffRampState,
  input: { dtMs: number; komaTarget: number; rampIntervalMs: number; holdIncrease: boolean }
): ChaffRampState => {
  if (state.target > input.komaTarget) return { target: input.komaTarget, msSinceRampMs: 0 }; // 下げは即
  if (state.target === input.komaTarget) return { target: state.target, msSinceRampMs: 0 };
  if (input.holdIncrease) return { target: state.target, msSinceRampMs: 0 }; // 被弾直後は足踏み
  const ms = state.msSinceRampMs + input.dtMs;
  if (ms >= input.rampIntervalMs) return { target: state.target + 1, msSinceRampMs: 0 };
  return { target: state.target, msSinceRampMs: ms };
};

// ---- M6 §4-D: 台本の「片付き」駆動ローテーション ----------------------------------------

// 台本の片付き判定: 台本の邪魔者が「全数出現済み かつ 現在0体」。特別枠とチャフは数えない。
// 邪魔者なし台本(R1-Aの基本のみ)は即「片付き」扱い(直前禁止があるので同じ台本の空回りはしない)。
export const isScriptCleared = (target: NuisanceCounts, spawnedForScript: NuisanceCounts, alive: NuisanceCounts): boolean => {
  for (const t of NUISANCE_TYPES) {
    if (spawnedForScript[t] < target[t]) return false; // まだ全数出ていない
    if (target[t] > 0 && alive[t] > 0) return false;   // まだ生きている
  }
  return true;
};

// 次の台本のプール選択: 基本は現ランクの表。AIの裁量で時々1ランク下を混ぜる
// (各引きで25%・直近10秒に被弾があれば50%。R1は下が無いのでR1のみ)。
export const LOWER_MIX_CHANCE = 0.25;
export const LOWER_MIX_CHANCE_HIT = 0.5;
export const selectRotationPattern = (
  rank: PuzzleRank,
  seenIds: ReadonlySet<string>,
  lastPatternId: string | null,
  recentlyHit: boolean,
  poolRoll: number, // 0-1: 下位混入の判定用
  pickRoll: number  // 0-1: プール内の選択用
): FormationPattern => {
  const chance = recentlyHit ? LOWER_MIX_CHANCE_HIT : LOWER_MIX_CHANCE;
  const useLower = rank > 1 && poolRoll < chance;
  const r = (useLower ? rank - 1 : rank) as PuzzleRank;
  return selectPattern(r, seenIds, lastPatternId, pickRoll);
};
