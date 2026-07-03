// PACING_REDESIGN.mdバッチ5 / PACING_V2.mdバッチR1: 山(関所)の台本選択。
// 緩明けに、次の関所の「台本」(主題+maxRung)をメニューから選ぶ純関数。台本=SpawnSceneと同形の
// データ(featured/intervalMult/rareMult/mix)+台本自身のmaxRung(離散のまま)。
// PHASESの時刻・countCapは不変。関所の「中身(シーン)」とpressure天井の元になるmaxRungだけを
// 台本が差し替える(※台本のmaxRungはバッチ3のceilingForMaxRungでpressure天井に変換される)。
//
// PACING_V2.mdバッチR1: 台本選択は「難易度」ではなく「多様性」で回す(rank寄せ廃止)。
// 適格判定はPHASESのmaxRungではなく台本ごとの時間解禁(unlockMs)、選択は未見優先+直前禁止+
// 一様タイブレーク。Rankの残る用途はstartPressureForRank/ホード規模/報酬倍率のみ(台本選択には
// 一切使わない)。旧rank寄せロジックは`?v2=0`で戻せるよう`selectGateProgramLegacy`として残す。
import type { EnemyType } from '../types/game';
import type { PlayStyle } from './killTelemetry';
import type { SpawnScene } from './difficultyDirector';

export type GateProgramId = 'gate-number' | 'gate-lineofsight' | 'gate-judgment' | 'gate-triple' | 'gate-ambush' | 'gate-assault' | 'gate-boss-spike';

// SpawnSceneと同形+台本固有フィールド。useGameLoop側でcurPhase.scene代わりにそのまま使える。
export interface GateProgram extends SpawnScene {
  id: GateProgramId;
  maxRung: number;              // 台本自身の値付け(離散のまま。ceilingForMaxRungへ渡す。安全弁として維持)
  unlockMs: number;             // PACING_V2.mdバッチR1-A: この時刻(gameTime)以降でないと選出対象にならない
  judgmentPrimary?: EnemyType;  // 判断の関所のみ: 犬/パンプキンどちらを主役にしたか(スタイル依存)
  eventKind?: 'horde' | 'boss'; // バッチ5追補: 関所の頭で発火するアリーナイベント種別(既存beginArenaEvent流用)
}

// 数の関所: チャフ濁流(CD極短)。featuredなし=素の分布+高速湧き(mowdownと同系統の配合)。
export const GATE_NUMBER: GateProgram = {
  id: 'gate-number', maxRung: 3, unlockMs: 0,
  featured: [], intervalMult: 0.5, rareMult: 1.2,
  mix: { bat: 60, skeleton: 35, zombie: 5 },
};

// 射線の関所: plant中心(既存SCENE_GATE_MASS_RANGEDと同値=壁+弾のコンボ)。
export const GATE_LINEOFSIGHT: GateProgram = {
  id: 'gate-lineofsight', maxRung: 4, unlockMs: 0,
  featured: ['plant'], intervalMult: 0.6, rareMult: 1.2,
  mix: { bat: 25, skeleton: 35, zombie: 40 },
};

// 判断の関所: 犬orパンプキン1種+弾。既存specialCastOrderと同じスタイル対応(近接→犬優先/遠距離→
// パンプキン優先/バランスはタイブレーク乱数)で主役を1つに絞る。
export const gateJudgmentProgram = (style: PlayStyle, tieBreakRandom: number): GateProgram => {
  const primary: EnemyType = style === '近接' ? 'werewolf' : style === '遠距離' ? 'pumpkin' : (tieBreakRandom < 0.5 ? 'werewolf' : 'pumpkin');
  return {
    id: 'gate-judgment', maxRung: 5, unlockMs: 2 * 60 * 1000,
    featured: [primary, 'plant'], intervalMult: 0.7, rareMult: 1.25,
    mix: { bat: 35, skeleton: 40, zombie: 25 }, // v0.25.1343: 主役を立てるため壁は控えめ(チャフ配合の穴埋め)
    judgmentPrimary: primary,
  };
};

// 三択の関所: 犬+パンプキン+弾(既存SCENE_GATE_CHAOSと同値=全部盛り)。
export const GATE_TRIPLE: GateProgram = {
  id: 'gate-triple', maxRung: 6, unlockMs: 4 * 60 * 1000,
  featured: ['pumpkin', 'werewolf', 'plant'], intervalMult: 0.55, rareMult: 1.35,
  mix: { bat: 30, skeleton: 40, zombie: 30 }, // v0.25.1343: チャフ配合の穴埋め(未指定=素の分布でゾンビ過多だった)
};

// 不意打ちの関所: 三択+叫び/ゴースト。7:00以降(深入り専用)でのみ選ばれる。screamer/ghost自体の解禁は
// gatePressureのallowedProblemChildren(pressure0.80/0.95)がそのまま効くので、featuredに含めても
// 前段が許可するまでは重み増しが素通りするだけ(二重ゲートの心配なし=既存gate-chaosと同じ設計)。
export const GATE_AMBUSH: GateProgram = {
  id: 'gate-ambush', maxRung: 7, unlockMs: 7 * 60 * 1000,
  featured: ['pumpkin', 'werewolf', 'plant', 'screamer', 'ghost'], intervalMult: 0.5, rareMult: 1.4,
  mix: { bat: 30, skeleton: 35, zombie: 35 }, // v0.25.1343: チャフ配合の穴埋め
};

// 襲撃の関所: 関所頭で囲いホード(既存beginArenaEvent+段階スポーン18体)を発火。ホード終了後の
// 残り時間は数の関所相当(チャフ濁流)で埋める。featured空=イベント自身の湧き(fromEvent)は
// selectEnemyTypeのfeatured重み付けを経由しないため自己整合(憲法テスト対象外の直接spawn)。
export const GATE_ASSAULT: GateProgram = {
  id: 'gate-assault', maxRung: 4, unlockMs: 3 * 60 * 1000, eventKind: 'horde',
  featured: [], intervalMult: 0.5, rareMult: 1.2,
  mix: { bat: 60, skeleton: 35, zombie: 5 },
};

// スパイクの関所: 関所頭でミニボス版囲い(パンプキン+取り巻き、既存boss kind再利用)。
// 旧セットピース(1:45中ボス/4:55ペア)の見せ場をここへ再編入。
export const GATE_BOSS_SPIKE: GateProgram = {
  id: 'gate-boss-spike', maxRung: 5, unlockMs: 4 * 60 * 1000, eventKind: 'boss',
  featured: [], intervalMult: 0.5, rareMult: 1.2,
  mix: { bat: 60, skeleton: 35, zombie: 5 },
};

export type Rank = 0 | 1 | 2;

export interface GateProgramInput {
  gameTime: number;             // PACING_V2.mdバッチR1-A: 時間解禁判定用(gameTime >= unlockMs)
  style: PlayStyle;             // 近接/遠距離/バランス(判断の関所の主役選びに使用)
  lastProgramId: GateProgramId | null; // 直近に見せた台本(連続回避用。無ければnull)
  tieBreakRandom: number;       // 0-1の一様乱数(未見優先後の一様選択/判断の関所のスタイルバランス時に使用)
  gateIndex: number;            // バッチ5追補選出ルール(a): 何番目の関所か(0始まり。最初の2関所はイベント関所を選ばない)
  lastWasEvent: boolean;        // バッチ5追補選出ルール(b): 直近がイベント関所だったか(連続回避)
  pityBlocked: boolean;         // バッチ5追補選出ルール(c): pity発動中/解除後10秒のスロットか(イベント関所を選ばない)
  seenProgramIds: ReadonlySet<GateProgramId>; // PACING_V2.mdバッチR1-B: このランで既に見せた台本(ラン開始でリセット)
}

// 台本一覧(判断の関所だけスタイル依存で生成)。新旧どちらのInputもstyle/tieBreakRandomを持つので共用できる。
const allPrograms = (input: { style: PlayStyle; tieBreakRandom: number }): GateProgram[] => [
  GATE_NUMBER, GATE_LINEOFSIGHT, gateJudgmentProgram(input.style, input.tieBreakRandom), GATE_TRIPLE, GATE_AMBUSH,
  GATE_ASSAULT, GATE_BOSS_SPIKE,
];

// PACING_V2.mdバッチR1-B: 選択 = 時間解禁(gameTime>=unlockMs)を満たす台本から、
// 1. イベント関所選出ルール(a)(b)(c)で絞る(バッチ5追補・従来どおり維持)
// 2. 直近に見せた台本を除外(pool>1のとき)
// 3. このランで未見の台本がpoolに残っていれば未見だけに絞る
// 4. 残りからtieBreakRandomで一様に選ぶ(難度分岐は無し=rankは台本選択に一切使わない)
export const selectGateProgram = (input: GateProgramInput): GateProgram => {
  const eligible = allPrograms(input).filter(p => input.gameTime >= p.unlockMs);
  const eventGateOk = input.gateIndex >= 2 && !input.lastWasEvent && !input.pityBlocked;
  let pool = eventGateOk ? eligible : eligible.filter(p => !p.eventKind);
  if (pool.length === 0) pool = eligible.filter(p => !p.eventKind);
  if (input.lastProgramId && pool.length > 1) {
    const filtered = pool.filter(p => p.id !== input.lastProgramId);
    if (filtered.length > 0) pool = filtered;
  }
  const unseen = pool.filter(p => !input.seenProgramIds.has(p.id));
  if (unseen.length > 0) pool = unseen;
  const idx = Math.min(pool.length - 1, Math.floor(input.tieBreakRandom * pool.length));
  return pool[idx];
};

// ---- 旧ロジック(rank寄せ選択・`?v2=0`用): 復帰フラグで戻すため削除しない ----------------------

export interface GateProgramInputLegacy {
  phaseMaxRung: number;         // このgateスロット(PHASES)のmaxRung
  rank: Rank;                   // DirectorRank(直前の山の出来)
  style: PlayStyle;             // 近接/遠距離/バランス(判断の関所の主役選びに使用)
  lastProgramId: GateProgramId | null; // 直近に見せた台本(連続回避用。無ければnull)
  tieBreakRandom: number;       // 0-1のタイブレーク乱数(判断の関所のスタイルバランス時/rank1の選択に使用)
  gateIndex: number;            // バッチ5追補選出ルール(a): 何番目の関所か(0始まり。最初の2関所はイベント関所を選ばない)
  lastWasEvent: boolean;        // バッチ5追補選出ルール(b): 直近がイベント関所だったか(連続回避)
  pityBlocked: boolean;         // バッチ5追補選出ルール(c): pity発動中/解除後10秒のスロットか(イベント関所を選ばない)
}

// 選択 = min(台本のmaxRung, PHASESのmaxRung)を満たす(=台本のmaxRung<=phaseMaxRung)ものから、
// 直近で見せていない主題を優先しつつ、Rankに応じて難度側へ寄せる(rank2=最も難しい適格台本/
// rank0=最も優しい適格台本/rank1=中庸、複数あればtieBreakで決める)。
// バッチ5追補: イベント関所(gate-assault/gate-boss-spike)は選出ルール(a)(b)(c)でさらに絞る。
export const selectGateProgramLegacy = (input: GateProgramInputLegacy): GateProgram => {
  const eligible = allPrograms(input).filter(p => p.maxRung <= input.phaseMaxRung);
  const eventGateOk = input.gateIndex >= 2 && !input.lastWasEvent && !input.pityBlocked;
  let pool = eventGateOk ? eligible : eligible.filter(p => !p.eventKind);
  if (pool.length === 0) pool = eligible.filter(p => !p.eventKind);
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
