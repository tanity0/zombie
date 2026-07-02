// PACING_REDESIGN.mdバッチ5: 山(関所)の台本選択。
// 緩明けに、次の関所の「台本」(主題+maxRung)をメニューから選ぶ純関数。台本=SpawnSceneと同形の
// データ(featured/intervalMult/rareMult/mix)+台本自身のmaxRung(離散のまま)。
// PHASESの時刻・countCapは不変。関所の「中身(シーン)」とpressure天井の元になるmaxRungだけを
// 台本が差し替える(※台本のmaxRungはバッチ3のceilingForMaxRungでpressure天井に変換される)。
import type { EnemyType } from '../types/game';
import type { PlayStyle } from './killTelemetry';
import type { SpawnScene } from './difficultyDirector';

export type GateProgramId = 'gate-number' | 'gate-lineofsight' | 'gate-judgment' | 'gate-triple' | 'gate-ambush';

// SpawnSceneと同形+台本固有フィールド。useGameLoop側でcurPhase.scene代わりにそのまま使える。
export interface GateProgram extends SpawnScene {
  id: GateProgramId;
  maxRung: number;              // 台本自身の値付け(離散のまま。ceilingForMaxRungへ渡す)
  judgmentPrimary?: EnemyType;  // 判断の関所のみ: 犬/パンプキンどちらを主役にしたか(スタイル依存)
}

// 数の関所: チャフ濁流(CD極短)。featuredなし=素の分布+高速湧き(mowdownと同系統の配合)。
export const GATE_NUMBER: GateProgram = {
  id: 'gate-number', maxRung: 3,
  featured: [], intervalMult: 0.5, rareMult: 1.2,
  mix: { bat: 60, skeleton: 35, zombie: 5 },
};

// 射線の関所: plant中心(既存SCENE_GATE_MASS_RANGEDと同値=壁+弾のコンボ)。
export const GATE_LINEOFSIGHT: GateProgram = {
  id: 'gate-lineofsight', maxRung: 4,
  featured: ['plant'], intervalMult: 0.6, rareMult: 1.2,
  mix: { bat: 25, skeleton: 35, zombie: 40 },
};

// 判断の関所: 犬orパンプキン1種+弾。既存specialCastOrderと同じスタイル対応(近接→犬優先/遠距離→
// パンプキン優先/バランスはタイブレーク乱数)で主役を1つに絞る。
export const gateJudgmentProgram = (style: PlayStyle, tieBreakRandom: number): GateProgram => {
  const primary: EnemyType = style === '近接' ? 'werewolf' : style === '遠距離' ? 'pumpkin' : (tieBreakRandom < 0.5 ? 'werewolf' : 'pumpkin');
  return {
    id: 'gate-judgment', maxRung: 5,
    featured: [primary, 'plant'], intervalMult: 0.7, rareMult: 1.25,
    judgmentPrimary: primary,
  };
};

// 三択の関所: 犬+パンプキン+弾(既存SCENE_GATE_CHAOSと同値=全部盛り)。
export const GATE_TRIPLE: GateProgram = {
  id: 'gate-triple', maxRung: 6,
  featured: ['pumpkin', 'werewolf', 'plant'], intervalMult: 0.55, rareMult: 1.35,
};

// 不意打ちの関所: 三択+叫び/ゴースト。最終maxRung=7でのみ選ばれる。screamer/ghost自体の解禁は
// gatePressureのallowedProblemChildren(pressure0.80/0.95)がそのまま効くので、featuredに含めても
// 前段が許可するまでは重み増しが素通りするだけ(二重ゲートの心配なし=既存gate-chaosと同じ設計)。
export const GATE_AMBUSH: GateProgram = {
  id: 'gate-ambush', maxRung: 7,
  featured: ['pumpkin', 'werewolf', 'plant', 'screamer', 'ghost'], intervalMult: 0.5, rareMult: 1.4,
};

export type Rank = 0 | 1 | 2;

export interface GateProgramInput {
  phaseMaxRung: number;         // このgateスロット(PHASES)のmaxRung
  rank: Rank;                   // DirectorRank(直前の山の出来)
  style: PlayStyle;             // 近接/遠距離/バランス(判断の関所の主役選びに使用)
  lastProgramId: GateProgramId | null; // 直近に見せた台本(連続回避用。無ければnull)
  tieBreakRandom: number;       // 0-1のタイブレーク乱数(判断の関所のスタイルバランス時/rank1の選択に使用)
}

// 台本一覧(判断の関所だけスタイル依存で生成)。
const allPrograms = (input: GateProgramInput): GateProgram[] => [
  GATE_NUMBER, GATE_LINEOFSIGHT, gateJudgmentProgram(input.style, input.tieBreakRandom), GATE_TRIPLE, GATE_AMBUSH,
];

// 選択 = min(台本のmaxRung, PHASESのmaxRung)を満たす(=台本のmaxRung<=phaseMaxRung)ものから、
// 直近で見せていない主題を優先しつつ、Rankに応じて難度側へ寄せる(rank2=最も難しい適格台本/
// rank0=最も優しい適格台本/rank1=中庸、複数あればtieBreakで決める)。
export const selectGateProgram = (input: GateProgramInput): GateProgram => {
  const eligible = allPrograms(input).filter(p => p.maxRung <= input.phaseMaxRung);
  let pool = eligible;
  if (input.lastProgramId && pool.length > 1) {
    const filtered = pool.filter(p => p.id !== input.lastProgramId);
    if (filtered.length > 0) pool = filtered;
  }
  const byDifficulty = [...pool].sort((a, b) => a.maxRung - b.maxRung);
  if (input.rank === 2) return byDifficulty[byDifficulty.length - 1];
  if (input.rank === 0) return byDifficulty[0];
  const midIdx = Math.min(byDifficulty.length - 1, Math.floor(input.tieBreakRandom * byDifficulty.length));
  return byDifficulty[midIdx];
};
