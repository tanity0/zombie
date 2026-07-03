// PACING_V2.mdバッチR4-C(v0.26.6定量化): 浅いエリア(エリア0-1)の代替表現。
// featured問題児を出せない関所でも、湧き方の違いでテーマを感じさせる。新しい湧きシステムは
// 作らず、①型(本ファイル) ②スケジューラ(dueShallowSpawns) ③座標(ringPositions/fanPositions)の
// 純関数だけを提供し、useGameLoopが既存generateEnemy/spawnEnemyAtへ流し込む(配線最小)。
//
// 発動条件・共通ルール(呼び出し側の責務・PACING_V2.md参照):
// - gateコマ中 ∧ コマ開始時点のプレイヤーが初心者ゾーン(エリア0-1)。コマ開始時に1回判定して固定。
// - 湧かせるのはチャフ3種のみ(問題児は型レベルで不可)。
// - countCap内(現在数+投入数≤dirCountCap)。超過分は切り捨て(繰り越さない)。
//
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。
import type { EnemyType } from '../types/game';
import type { ChaffMix } from './chaffMix';

export type ShallowExpressionKind = 'tempo' | 'ring' | 'pincer' | 'waves' | 'burst';

export interface RingEventSpec { atMs: number; count: number }
export interface PincerEventSpec { atMs: number; perSide: number; wobbleDeg: number }
export interface WaveEventSpec { atMs: number; count: number; spreadDeg: number }
export interface BurstEventSpec { atMs: number; count: number; durationMs: number; spreadDeg: number }

// PACING_V2.mdバッチR4-C台本別パターン表(v0.26.6)をそのまま型にした判別共用体。
export type ShallowExpression =
  | { kind: 'tempo'; intervalMult: number; mix: ChaffMix } // 数: 湧きテンポ×0.7(≒1.4倍)+bat寄せ配合
  | { kind: 'ring'; events: RingEventSpec[] }               // 射線/襲撃: 円配置(等間隔=360°/count)
  | { kind: 'pincer'; events: PincerEventSpec[] }           // 判断: 軸角θ/θ+180°の2方向から扇状
  | { kind: 'waves'; events: WaveEventSpec[]; rotateDeg: number } // 三択: 波ごとに方向がrotateDegずつ回転
  | { kind: 'burst'; events: BurstEventSpec[] };            // スパイク: 1方向の扇状から時間差投入

// 解決済み(乱数を引いた後)の1体ぶんの発火予定。atMsは関所開始からの相対時刻。
export interface ResolvedShallowSpawn {
  atMs: number;
  angleRad: number;
}

const deg2rad = (d: number): number => (d * Math.PI) / 180;
const TWO_PI = Math.PI * 2;

// 中心角から±spreadDeg内へcount個を均等配置(count=1なら中心そのもの)。
const fanAngles = (centerRad: number, spreadDeg: number, count: number): number[] => {
  if (count <= 1) return [centerRad];
  const half = deg2rad(spreadDeg);
  const step = (2 * half) / (count - 1);
  return Array.from({ length: count }, (_, i) => centerRad - half + i * step);
};

// PACING_V2.mdバッチR4-C: 台本ごとの湧きスケジュールを解決する(関所開始時に1回だけ呼ぶ想定)。
// 乱数(開始角/軸角/初期角)はrng()で都度取得する — ring/pincerは「各回ランダム」なので毎イベントで
// 呼ぶ。wavesは初期角だけ乱数を引き、以降はrotateDegずつ回転(社長指定「波ごとに120°ずつ回転」)。
// burstは1方向だけ乱数。'tempo'はスケジュールを持たない(mix/テンポの直接適用のみ)。
export const resolveShallowSchedule = (expr: ShallowExpression, rng: () => number): ResolvedShallowSpawn[] => {
  const out: ResolvedShallowSpawn[] = [];
  if (expr.kind === 'tempo') return out;
  if (expr.kind === 'ring') {
    for (const e of expr.events) {
      const start = rng() * TWO_PI;
      const step = TWO_PI / e.count; // 等間隔=360°/count(射線8体=45°/襲撃10体=36°と一致)
      for (let i = 0; i < e.count; i++) out.push({ atMs: e.atMs, angleRad: start + i * step });
    }
    return out;
  }
  if (expr.kind === 'pincer') {
    for (const e of expr.events) {
      const axis = rng() * TWO_PI;
      for (const side of [axis, axis + Math.PI]) {
        for (const a of fanAngles(side, e.wobbleDeg, e.perSide)) out.push({ atMs: e.atMs, angleRad: a });
      }
    }
    return out;
  }
  if (expr.kind === 'waves') {
    const initial = rng() * TWO_PI;
    expr.events.forEach((e, waveIdx) => {
      const center = initial + waveIdx * deg2rad(expr.rotateDeg);
      for (const a of fanAngles(center, e.spreadDeg, e.count)) out.push({ atMs: e.atMs, angleRad: a });
    });
    return out;
  }
  // burst: 1方向の扇状からcount体を、durationMsにかけて等間隔(durationMs/count)で時間差投入。
  for (const e of expr.events) {
    const center = rng() * TWO_PI;
    const angles = fanAngles(center, e.spreadDeg, e.count);
    const tickMs = e.count > 0 ? e.durationMs / e.count : 0;
    angles.forEach((a, i) => out.push({ atMs: e.atMs + i * tickMs, angleRad: a }));
  }
  return out;
};

// prevMs<発火時刻(絶対=gateStartMs+atMs)≤nowMsのものだけを返す(1回ずつ発火・二重発火なし)。
// resolvedは関所開始時に一度resolveShallowScheduleで作った不変のリストを毎フレーム渡す想定。
export const dueShallowSpawns = (
  resolved: ResolvedShallowSpawn[], gateStartMs: number, prevMs: number, nowMs: number
): ResolvedShallowSpawn[] =>
  resolved.filter(s => {
    const t = gateStartMs + s.atMs;
    return t > prevMs && t <= nowMs;
  });

// 座標変換: 中心+距離+角度 → ワールド座標。距離は既存reaperのoffScreenDist同式
// (Math.hypot(gameBounds.width/2, gameBounds.height/2) + OFFSCREEN_SPAWN_MARGIN)を呼び出し側が渡す。
export const positionForAngle = (center: { x: number; y: number }, dist: number, angleRad: number): { x: number; y: number } => ({
  x: center.x + Math.cos(angleRad) * dist,
  y: center.y + Math.sin(angleRad) * dist,
});

// 便宜関数(Fable指定シグネチャ): 円配置(等間隔=360°/count)のcount点をまとめて返す。
// 主にテスト用(実際の発火はresolveShallowSchedule+positionForAngleを都度呼ぶ経路を使う)。
export const ringPositions = (
  center: { x: number; y: number }, dist: number, count: number, startAngleRad: number
): { x: number; y: number }[] => {
  const step = TWO_PI / count;
  return Array.from({ length: count }, (_, i) => positionForAngle(center, dist, startAngleRad + i * step));
};

// 便宜関数: 中心角±spreadDeg内にcount点を均等配置した扇状の座標をまとめて返す(テスト用)。
export const fanPositions = (
  center: { x: number; y: number }, dist: number, count: number, centerAngleRad: number, spreadDeg: number
): { x: number; y: number }[] => fanAngles(centerAngleRad, spreadDeg, count).map(a => positionForAngle(center, dist, a));

// チャフ3種のみからmix比率で1つ選ぶ(roll=0-1の一様乱数)。問題児は型として存在しないので安全。
export const pickChaffFromMix = (mix: ChaffMix, roll: number): EnemyType => {
  const total = mix.bat + mix.skeleton + mix.zombie;
  if (total <= 0) return 'bat';
  const r = roll * total;
  if (r < mix.bat) return 'bat';
  if (r < mix.bat + mix.skeleton) return 'skeleton';
  return 'zombie';
};
