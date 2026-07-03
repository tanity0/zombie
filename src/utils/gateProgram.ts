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
import type { ChaffMix } from './chaffMix';

export type GateProgramId = 'gate-number' | 'gate-lineofsight' | 'gate-judgment' | 'gate-triple' | 'gate-ambush' | 'gate-assault' | 'gate-boss-spike';

// PACING_V2.mdバッチR4-C: 浅いエリア(エリア0-1)の代替表現。ゾーン天井でfeatured問題児が解禁
// されない関所でも、湧き方の違いでテーマを感じさせる(バナー名は同じまま=違いは名前と湧き方で)。
// ★未決事項(PACING_V2.md参照): 'volume'(数)と'chaffHorde'(襲撃/スパイク=既存horde/boss
// イベントの雑魚版として配線済み)以外は、具体的な半径・角度・体数・タイミングの数値指定が
// 仕様に無く、新規の湧き配置ジオメトリ(リング/挟み撃ち/波状)を要するため本バッチでは未配線
// (データの型・タグのみ用意)。
export type ShallowExpressionKind = 'volume' | 'ring' | 'pincer' | 'chaffHorde' | 'waves';
export interface ShallowExpression {
  kind: ShallowExpressionKind;
  tempoMult?: number; // 'volume'用: 湧きテンポの倍率(叩き台1.4)
  mix?: ChaffMix;     // 'volume'用: bat寄せ配合の叩き台(50/30/20)
}

// SpawnSceneと同形+台本固有フィールド。useGameLoop側でcurPhase.scene代わりにそのまま使える。
export interface GateProgram extends SpawnScene {
  id: GateProgramId;
  maxRung: number;              // 台本自身の値付け(離散のまま。ceilingForMaxRungへ渡す。安全弁として維持)
  unlockMs: number;             // PACING_V2.mdバッチR1-A: この時刻(gameTime)以降でないと選出対象にならない
  judgmentPrimary?: EnemyType;  // 判断の関所のみ: 犬/パンプキンどちらを主役にしたか(スタイル依存)
  eventKind?: 'horde' | 'boss'; // バッチ5追補: 関所の頭で発火するアリーナイベント種別(既存beginArenaEvent流用)
  shallowExpression?: ShallowExpression; // PACING_V2.mdバッチR4-C: 浅いエリア向けの代替表現(叩き台)
}

// 数の関所: チャフ濁流(CD極短)。featuredなし=素の分布+高速湧き(mowdownと同系統の配合)。
export const GATE_NUMBER: GateProgram = {
  id: 'gate-number', maxRung: 3, unlockMs: 0,
  featured: [], intervalMult: 0.5, rareMult: 1.2,
  mix: { bat: 60, skeleton: 35, zombie: 5 },
  // R4-C: 配線済み(useGameLoopが浅いエリアでtempoMult/mixを実際に適用する)。
  shallowExpression: { kind: 'volume', tempoMult: 1.4, mix: { bat: 50, skeleton: 30, zombie: 20 } },
};

// 射線の関所: plant中心(既存SCENE_GATE_MASS_RANGEDと同値=壁+弾のコンボ)。
export const GATE_LINEOFSIGHT: GateProgram = {
  id: 'gate-lineofsight', maxRung: 4, unlockMs: 0,
  featured: ['plant'], intervalMult: 0.6, rareMult: 1.2,
  mix: { bat: 25, skeleton: 35, zombie: 40 },
  // R4-C: 未配線(★未決事項参照)。「画面外周に散らばる同時湧き(リング配置)」の具体的な
  // 半径・体数はgateProgram.ts側のデータではなく実際の湧き配置ロジックの新設が必要。
  shallowExpression: { kind: 'ring' },
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
    // R4-C: 未配線(★未決事項参照)。「2方向からの挟み同時湧き」の角度・距離は仕様に数値指定が無い。
    shallowExpression: { kind: 'pincer' },
  };
};

// 三択の関所: 犬+パンプキン+弾(既存SCENE_GATE_CHAOSと同値=全部盛り)。
export const GATE_TRIPLE: GateProgram = {
  id: 'gate-triple', maxRung: 6, unlockMs: 4 * 60 * 1000,
  featured: ['pumpkin', 'werewolf', 'plant'], intervalMult: 0.55, rareMult: 1.35,
  mix: { bat: 30, skeleton: 40, zombie: 30 }, // v0.25.1343: チャフ配合の穴埋め(未指定=素の分布でゾンビ過多だった)
  // R4-C: 未配線(★未決事項参照)。「3グループ順次湧き(方向を変えて3波)」のグループ数・波の間隔は
  // 仕様に数値指定が無い。
  shallowExpression: { kind: 'waves' },
};

// 不意打ちの関所: 三択+叫び/ゴースト。7:00以降(深入り専用)でのみ選ばれる。screamer/ghost自体の解禁は
// gatePressureのallowedProblemChildren(pressure0.80/0.95)がそのまま効くので、featuredに含めても
// 前段が許可するまでは重み増しが素通りするだけ(二重ゲートの心配なし=既存gate-chaosと同じ設計)。
// R4-C: 不意打ちは代替表現の一覧に無い(深入り専用=7:00以降のみ選ばれるため浅いエリア想定外。仕様書のまま)。
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
  // R4-C: 配線済み(useGameLoopのhorde段階スポーンが、イベント開始時に浅いエリアならパンプキン/
  // ウルフの代入を止めて雑魚のみにする=「既存hordeの雑魚版」)。
  shallowExpression: { kind: 'chaffHorde' },
};

// スパイクの関所: 関所頭でミニボス版囲い(パンプキン+取り巻き、既存boss kind再利用)。
// 旧セットピース(1:45中ボス/4:55ペア)の見せ場をここへ再編入。
export const GATE_BOSS_SPIKE: GateProgram = {
  id: 'gate-boss-spike', maxRung: 5, unlockMs: 4 * 60 * 1000, eventKind: 'boss',
  featured: [], intervalMult: 0.5, rareMult: 1.2,
  mix: { bat: 60, skeleton: 35, zombie: 5 },
  // R4-C: 配線済み(useGameLoopがイベント開始時に浅いエリアならミニボス(パンプキン)を出さず
  // 雑魚のみの小さな囲いへ差し替える=「雑魚ホード小・イベント形のみ再現」)。
  shallowExpression: { kind: 'chaffHorde' },
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

// PACING_V2.mdバッチR3: 関所テーマの可視化用の表示名(社長指定文言)。新旧どちらの選択ロジックでも
// idは共通なのでこの1枚のマップで両対応する。
export const GATE_PROGRAM_DISPLAY_NAME: Record<GateProgramId, string> = {
  'gate-number': '数の関所',
  'gate-lineofsight': '射線の関所',
  'gate-judgment': '判断の関所',
  'gate-triple': '三択',
  'gate-ambush': '不意打ち',
  'gate-assault': '襲撃',
  'gate-boss-spike': 'スパイク',
};

// PACING_V2.mdバッチR3: 診断グラフ(DirectorResult)用の1文字ラベル。既存のエリア表示(Z0-Z4)と
// 同じ「短く・場所を取らない」流儀に合わせる(ゲーム内バナーはGATE_PROGRAM_DISPLAY_NAMEの正式名を使う)。
export const GATE_PROGRAM_SHORT_LABEL: Record<GateProgramId, string> = {
  'gate-number': '数',
  'gate-lineofsight': '射',
  'gate-judgment': '判',
  'gate-triple': '三',
  'gate-ambush': '不',
  'gate-assault': '襲',
  'gate-boss-spike': 'ス',
};
