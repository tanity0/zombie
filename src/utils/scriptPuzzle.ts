// PACING_PUZZLE.md バッチM3: 盤面構成パズル(scriptPuzzle)。
// 「今この瞬間、盤面のどの枠から何を1体湧かせるべきか」を決める純関数群。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。
//
// §0.5 攻略性の原則(最重要): 邪魔者・特別枠は常に時間差で着弾させる(バースト禁止)。
// 枠共通CD3秒はどんな締め/成長でも縮めない。被弾直後1.5秒は邪魔者・特別枠の新規投入をしない。

import type { PuzzleRank } from './rankAssessor';

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
export const CHAFF_WEIGHTS_HARVEST: ChaffWeights = { bat: 7, skeleton: 2, zombie: 1 }; // 4-C: バット寄せ

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

// ---- 4-C: 緩モード(RELAX/HARVEST)のオーバーライド --------------------------------------

export const RELAX_TARGET_FRACTION = 0.6;
export const RELAX_TARGET_MIN = 3;
export const RELAX_CD_MULT = 2;
export const HARVEST_CD_MULT = 0.5;
export const HARVEST_RAMP_INTERVAL_MS = 2000;

// RELAX: 目標数を現在値の60%(下限3)へ。
export const relaxBoardTarget = (currentTarget: number): number =>
  Math.max(RELAX_TARGET_MIN, Math.round(currentTarget * RELAX_TARGET_FRACTION));

// RELAX: 基本CD×2。
export const relaxCdMs = (cdMs: number): number => cdMs * RELAX_CD_MULT;

// RELAX/HARVEST共通: 邪魔者枠は「新規補充のみ停止・在席は残す」= 実効目標を現在の在籍数に固定する
// (nextNuisanceDeficitは常にnullを返すようになる=補充されない。倒せば自然に減る)。
export const noNewSupplyNuisanceTarget = (alive: NuisanceCounts): NuisanceCounts => ({ ...alive });

// HARVEST: 基本CD×0.5(刈ってもすぐ補充)。
export const harvestCdMs = (cdMs: number): number => cdMs * HARVEST_CD_MULT;

// HARVEST: チャフ目標数を上限まで増員間隔2秒で一気に埋める(rankAssessorの6s/4sランプとは別の
// 専用ランプ。呼び出し側がHARVESTコマの間だけこちらを呼び、通常のtickPuzzleClockは呼ばない)。
export interface HarvestRampState { target: number; msSinceRampMs: number; }
export const harvestTargetTick = (state: HarvestRampState, cap: number, dtMs: number): HarvestRampState => {
  let msSinceRampMs = state.msSinceRampMs + dtMs;
  let target = state.target;
  if (msSinceRampMs >= HARVEST_RAMP_INTERVAL_MS && target < cap) {
    target = Math.min(cap, target + 1);
    msSinceRampMs = 0;
  }
  return { target, msSinceRampMs };
};
