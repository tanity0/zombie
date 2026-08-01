import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { mineRect } from '../world/mines';
import {
  canaryDriftMs,
  slowFrameRatio,
  stageDeltaMs,
  summarizeFrames,
  type FrameStats,
} from '../utils/benchmarkStats';
import type { BreakableProp, EnemyType, Projectile, WeaponType } from '../types/game';

const BENCHMARK_ATTEMPT_MS = 3600;
const BENCHMARK_ATTEMPT_WARMUP_MS = 1200;
const BENCHMARK_TICK_MS = 320;
const BENCHMARK_ENEMY_HP = 999999;
const BENCHMARK_PASS_AVG_FPS = 40;
const BENCHMARK_PASS_MIN_FPS = 30;
const BENCHMARK_EARLY_FAIL_FPS = 24;
const BENCHMARK_EARLY_FAIL_AFTER_MS = 2200;
const BENCHMARK_EARLY_FAIL_WINDOW_MS = 800;
const BENCHMARK_NET_SAMPLE_COUNT = 8;
const BENCHMARK_NET_SAMPLE_GAP_MS = 500;
const BENCHMARK_MAIN_DELAY_SAMPLE_MS = 250;

// ★計測の作法(v0.25.2690で追加。ここが無かったせいで同じ負荷が 35〜58fps に暴れていた)
// ① 暖機(WARMUP): **計測しない**捨て段。端末が冷えている1本目は10〜13fps遅いと実測済みで、
//    これまでは社長が手で「1本目は捨てる」運用をしていた。ベンチ自身にやらせる。
// ② 基準段(CANARY): **系統が変わるたびに同じ負荷を測り直す**。熱で端末が遅くなっても、
//    直前の基準段と比べれば「その負荷が1フレームに足したms(Δms)」は残る。
//    これが「全系統の後半の段」と「単独計測の段」を比較可能にする唯一の量。
// 尺は「1本の総時間」と相談して決めた叩き台。基準段は平均さえ取れればよく、1.6秒でも
// フレームは60〜95個取れる(旧実装の1段ぶんの観測が2〜3個だったことを思えば十分)。
const BENCHMARK_WARMUP_MS = 3000;       // 捨て段の長さ(計測しない)
const BENCHMARK_CANARY_MS = 2200;       // 基準段の長さ
const BENCHMARK_CANARY_SETTLE_MS = 600; // 基準段の頭(負荷が乗り切るまで)は捨てる

const benchFlag = (key: string, def: boolean): boolean => {
  if (typeof window === 'undefined') return def;
  const v = new URLSearchParams(window.location.search).get(key);
  return v == null ? def : !(v === '0' || v === 'off' || v === 'false');
};
// FX は寿命で消えるので、1tick(320ms)で撒いた分が次tickまで残るよう少し長めに出す
// (ステディ状態で profile の指定数の約2倍が画面に乗り、実戦の「派手な瞬間」を模す)。
const BENCHMARK_FX_DURATION_MS = 720;

// 各ステージは「いまの仕様で実際に重い系統」を1軸ずつ(最後に全部入り)ランプさせる:
//   ENEMY = 重量級スプライト多数(影/ライティング) / PROJ = 弾幕(移動+衝突判定)
//   FX = リング/グロー/粒子/斬撃/ダメージ数字の嵐 / IMG = 斬(テクスチャ)マーク = 最重量FX
//   LIGHT = 松明+グロー(光源コスト) / ALL = 全系統を同時に「考えうる最大」まで
type BenchmarkProfile = {
  id: string;
  category: string;
  label: string;
  enemyTarget: number;
  heavy: boolean;        // true = 重量級の敵プール(パンプキン/巨体/ジャイアントバット/リーパー等)
  glowCount: number;
  ringCount: number;
  particleCount: number;
  slashCount: number;
  dmgCount: number;
  imageCount: number;    // 斬マーク(テクスチャ付きエフェクト)
  torchCount: number;
  projectileCount: number;
  yOscillation: number;
  shadowJitter: number;
  mineCount: number;     // §5.24 M23: 緑卵(mine)。プールスプライト1枚+個別影キャスターの実パスを計測。
};

const P = (
  id: string, category: string, label: string,
  enemyTarget: number, heavy: boolean,
  glowCount: number, ringCount: number, particleCount: number,
  slashCount: number, dmgCount: number, imageCount: number,
  torchCount: number, projectileCount: number,
  yOscillation: number, shadowJitter: number,
  mineCount: number
): BenchmarkProfile => ({
  id, category, label, enemyTarget, heavy,
  glowCount, ringCount, particleCount, slashCount, dmgCount, imageCount,
  torchCount, projectileCount, yOscillation, shadowJitter, mineCount,
});

// §5.24 M23(社長採用v0.25.1538): 「軽すぎる段を毎回律儀に走る」不満を解消するため、各カテゴリを
// 重→軽(旧: 軽→重)に反転。nextProfileIndexが「余裕あり」なら残りの軽い段を飛ばして次カテゴリの
// 最重段へ進む(下方の余裕ライン定数/ロジック参照)。単段カテゴリ(FX-G/R/P/S/D)は反転不要のため不変。
export const BENCHMARK_PROFILES: BenchmarkProfile[] = [
  //   id    cat     label  E   heavy  G   R   P   S   D   I   T   J   yOsc jit  mine
  P('B1',  'BASE',  'BASE', 10, false, 1,  1,  4,  0,  0,  0,  2,  0,  12,  4,  0),

  P('E3',  'ENEMY', 'E60',  60, true,  1,  1,  4,  0,  0,  0,  3,  0,  48,  22, 0),
  P('E2',  'ENEMY', 'E40',  40, true,  1,  1,  4,  0,  0,  0,  3,  0,  36,  16, 0),
  P('E1',  'ENEMY', 'E24',  24, true,  1,  1,  4,  0,  0,  0,  3,  0,  24,  10, 0),

  P('PR3', 'PROJ',  'J130', 16, false, 1,  1,  4,  0,  0,  0,  2, 130,  16,  6, 0),
  P('PR2', 'PROJ',  'J80',  16, false, 1,  1,  4,  0,  0,  0,  2,  80,  16,  6, 0),
  P('PR1', 'PROJ',  'J40',  16, false, 1,  1,  4,  0,  0,  0,  2,  40,  16,  6, 0),

  P('F3',  'FX',    'F3',   14, false, 14, 14, 96, 16, 20, 0,  2,  0,  16,  6, 0),
  P('F2',  'FX',    'F2',   14, false, 10, 10, 64, 12, 14, 0,  2,  0,  16,  6, 0),
  P('F1',  'FX',    'F1',   14, false, 6,  6,  40, 8,  8,  0,  2,  0,  16,  6, 0),

  // FX 単軸分解(F1の主犯特定用)。各々を独立カテゴリにして、FAILしても全部走らせる(単段=反転不要)。
  P('FXG', 'FX-G',  'G12',  14, false, 12, 0,  0,  0,  0,  0,  2,  0,  16,  6, 0),
  // ★v0.25.2677: FX-G は長らく **G12 の1段だけ**で、`safe: not found` にしかならなかった
  // (=「強glowは何個までなら耐えるか」が測れない)。実測(社長・実機 v0.25.2676)で
  // 「塗り面積は主因の約3割・残る本命は**同時数のキャップ**」と分かったので、
  // **キャップの数字を決めるために軽い段を足す**。他カテゴリと同じ重→軽の並び。
  P('FXG10','FX-G', 'G10',  14, false, 10, 0,  0,  0,  0,  0,  2,  0,  16,  6, 0),
  P('FXG8', 'FX-G', 'G8',   14, false,  8, 0,  0,  0,  0,  0,  2,  0,  16,  6, 0),
  P('FXG6', 'FX-G', 'G6',   14, false,  6, 0,  0,  0,  0,  0,  2,  0,  16,  6, 0),
  P('FXG4', 'FX-G', 'G4',   14, false,  4, 0,  0,  0,  0,  0,  2,  0,  16,  6, 0),
  P('FXR', 'FX-R',  'R12',  14, false, 0,  12, 0,  0,  0,  0,  2,  0,  16,  6, 0),
  P('FXP', 'FX-P',  'P90',  14, false, 0,  0,  90, 0,  0,  0,  2,  0,  16,  6, 0),
  P('FXS', 'FX-S',  'S16',  14, false, 0,  0,  0,  16, 0,  0,  2,  0,  16,  6, 0),
  P('FXD', 'FX-D',  'D20',  14, false, 0,  0,  0,  0,  20, 0,  2,  0,  16,  6, 0),

  P('IM3', 'IMG',   'I12',  14, false, 2,  2,  6,  0,  8,  12, 2,  0,  16,  6, 0),
  P('IM2', 'IMG',   'I8',   14, false, 2,  2,  6,  0,  6,  8,  2,  0,  16,  6, 0),
  P('IM1', 'IMG',   'I4',   14, false, 2,  2,  6,  0,  4,  4,  2,  0,  16,  6, 0),

  P('L3',  'LIGHT', 'T24',  14, false, 14, 1,  4,  0,  0,  0,  24, 0,  16,  6, 0),
  P('L2',  'LIGHT', 'T16',  14, false, 10, 1,  4,  0,  0,  0,  16, 0,  16,  6, 0),
  P('L1',  'LIGHT', 'T8',   14, false, 6,  1,  4,  0,  0,  0,  8,  0,  16,  6, 0),

  // 純ライト(effectLayerのglowを足さず、松明=局所ライト+炎Graphicsだけ)。lightそのものの重さを切り分ける。
  P('LP3', 'LIGHT-P','T24p', 14, false, 1,  1,  4,  0,  0,  0,  24, 0,  16,  6, 0),
  P('LP2', 'LIGHT-P','T16p', 14, false, 1,  1,  4,  0,  0,  0,  16, 0,  16,  6, 0),
  P('LP1', 'LIGHT-P','T8p',  14, false, 1,  1,  4,  0,  0,  0,  8,  0,  16,  6, 0),

  P('A3',  'ALL',   'MAX',  72, true,  12, 12, 96, 16, 20, 10, 24, 140, 48,  24, 0),
  P('A2',  'ALL',   'A2',   52, true,  10, 10, 80, 14, 16, 8,  18, 100, 42,  18, 0),
  P('A1',  'ALL',   'A1',   36, true,  8,  8,  64, 12, 12, 6,  12, 70,  36,  14, 0),

  // §5.24 M23: 緑卵(mine)系統。M52=mineAmbushAroundの実数(最悪ケース)。卵自体はプールスプライト
  // 1枚で安いが、卵1個ごとに影キャスターが付くため「多数同時+塊」の実パスを単独で切り分ける。
  P('MI3', 'MINE',  'M52',  14, false, 1,  1,  4,  0,  0,  0,  0,  0,  16,  6, 52),
  P('MI2', 'MINE',  'M32',  14, false, 1,  1,  4,  0,  0,  0,  0,  0,  16,  6, 32),
  P('MI1', 'MINE',  'M16',  14, false, 1,  1,  4,  0,  0,  0,  0,  0,  16,  6, 16),
];

// ★基準段(canary)の負荷。暖機と、系統の切れ目ごとの「端末の今の速さ」測定に使う。
// 設計の要点:
//  - **強glowを1個も入れない**。強glowは今まさに調整中(`?glowhalo=`)なので、基準段に入れると
//    「端末の速さ」と「調整の効果」が混ざって、ビルドをまたいだ比較ができなくなる。
//  - **60fpsで頭打ちにならないだけ重くする**。頭打ちだと熱で遅くなっても60のままで、
//    ドリフトが見えない。
//  - 中身は**固定**。ここを触るとビルドをまたいだ Δms が比較できなくなる(触るなら全部測り直し)。
//
// ★v0.25.2692で作り直した(初版が軽すぎた)。初版(敵40+弾80+粒子64+松明8+画像4)は
// 実機で **60.0 → 60.0 → 60.0 と完全に頭打ち**になり、**同じ1本の中で検算段が +5.4ms の
// 熱ダレを捉えているのに、基準段は「ドリフト -0.0ms」と報告した**(v0.25.2691実測)。
// 頭打ちの基準段は「安定した基準」ではなく**目隠し**だった。
// 新版は **ALL A1 から強glowだけを抜いたもの**=この端末で40fps台に落ちる実績のある重さ。
const CANARY_PROFILE: BenchmarkProfile =
  //   id     cat      label   E   heavy  G  R  P   S   D   I  T   J   yOsc jit mine
  P('CAL', 'CANARY', 'CAL', 36, true,  0, 8, 64, 12, 12, 6, 12, 70, 36,  14, 0);

// §5.24-追補(社長報告v0.25.1542): 重い順化でALLカテゴリがMAX(A3・敵72+弾140+全FX+強glow=絶対
// ピーク)から始まるようになり、スマホでは一度も食らったことのない負荷=天井超えでクラッシュ
// (=データも取れない)。緑卵(MINE)は無罪(緑卵段は60fps実測)。既存のモバイル判定
// (Game.tsx/OrientationGuard.tsxと同じ 'ontouchstart' in window || navigator.maxTouchPoints > 0)を
// 流用し、モバイルではALLカテゴリの最重段(MAX=A3・A2)を除外する(ALLはA1のみ走る)。
// 重い順スキップ自体は他系統で維持・デスクトップはMAXも回す。
export const isMobileBenchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

// ★1系統だけ回す絞り込み(社長指示v0.25.2675「テストって具体的になにやるの？」)。
// 既定(パラメータ無し)は**従来どおり全部**。`?benchonly=FXG` のようにカテゴリIDを渡すと
// **その系統だけ**を回す。A/B(例: `?glowhalo=1.3` の有無)を何度も測り比べる時、
// 全系統(数分)を毎回待たずに済む。カンマ区切りで複数指定も可(`?benchonly=FXG,ALL`)。
// 指定が1つも当たらなければ**無視して全部**(タイプミスで何も走らない事故を作らない)。
const benchmarkOnlyFilter = (): string[] => {
  if (typeof window === 'undefined') return [];
  const raw = new URLSearchParams(window.location.search).get('benchonly');
  if (!raw) return [];
  return raw.split(',').map(v => v.trim().toUpperCase()).filter(Boolean);
};

export const activeBenchmarkProfiles = (mobile: boolean, only: string[] = []): BenchmarkProfile[] => {
  const base = mobile
    ? BENCHMARK_PROFILES.filter(p => !(p.category === 'ALL' && (p.id === 'A3' || p.id === 'A2')))
    : BENCHMARK_PROFILES;
  if (only.length === 0) return base;
  // カテゴリ(例 FX-G / FXG)でも、段のID(例 G12)でも当てられるようにする。
  const norm = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const wanted = new Set(only.map(norm));
  const picked = base.filter(p => wanted.has(norm(p.category)) || wanted.has(norm(p.id)));
  return picked.length > 0 ? picked : base;
};

// 軽量プール(雑魚スウォーム)と重量級プール(大スプライト=影/ライティング負荷)。
const LIGHT_ENEMY_TYPES: EnemyType[] = ['zombie', 'skeleton', 'bat', 'ghost', 'plant'];
const HEAVY_ENEMY_TYPES: EnemyType[] = ['pumpkin', 'lab-zombie-3', 'giantbat', 'werewolf', 'reaper', 'lab-zombie-2'];
const enemyPool = (profile: BenchmarkProfile) => (profile.heavy ? HEAVY_ENEMY_TYPES : LIGHT_ENEMY_TYPES);

export type BenchmarkGrade = 'PASS' | 'CAUTION' | 'FAIL';

export type BenchmarkStageResult = {
  id: string;
  category: string;
  label: string;
  grade: BenchmarkGrade;
  avgFps: number;
  minFps: number;
  /** 目標(40fps)より遅かったフレームの割合(0..1)。旧: 1秒サンプルの個数。 */
  drops: number;
  enemyTarget: number;
  stress: string;
  safeStress: string;
  adjusted: boolean;
  maxTorches: number;
  maxMines: number;
  maxEnemies: number;
  maxFx: number;
  /** 観測フレーム数(旧 sampleCount は1秒サンプルの個数=2〜3だった)。 */
  sampleCount: number;
  /** ★この段の負荷が1フレームに足したms(直前の基準段との差)。実行順・熱をまたいで比較できる量。 */
  deltaMs: number;
  /** この段の直前に測った基準段のfps(Δmsの基準)。 */
  canaryFps: number;
  /** フレーム時間の標準偏差(ms)=ばらつき。2つの計測の差が有意かの判断に使う。 */
  sdMs: number;
  /** 95パーセンタイルのフレーム時間(ms)=スパイクの指標。 */
  p95Ms: number;
};

export type BenchmarkResult = {
  grade: BenchmarkGrade;
  avgFps: number;
  minFps: number;
  drops: number;
  maxEnemies: number;
  maxFx: number;
  maxProjectiles: number;
  maxPickups: number;
  maxTorches: number;
  maxMines: number;
  stageCount: number;
  stages: BenchmarkStageResult[];
  categorySummary: string[];
  bottleneck: string;
  diagnostics: BenchmarkDiagnostics;
  /** 基準段(canary)のfps系列。先頭=計測開始直後・末尾=計測終了時。 */
  canaryFps: number[];
  /** 計測中に端末が遅くなった量(1フレームあたりms)。正=遅くなった。 */
  driftMs: number;
  /**
   * ★検算段: **最初に走った段を最後にもう一度**測ったもの(v0.25.2691)。
   * 基準段は軽くて60fpsで頭打ちになりやすく、**軽い熱ダレを見逃す**。
   * 同じ重い段を最初と最後で測れば、頭打ちに関係なく「この1本の中で数字が動いたか」が分かる。
   */
  repeatStage: BenchmarkStageResult | null;
};

export type BenchmarkDiagnostics = {
  netRttAvg: number;
  netRttMax: number;
  netSamples: number;
  netFailures: number;
  mainDelayAvg: number;
  mainDelayMax: number;
  mainSamples: number;
  verdict: string;
};

interface BenchmarkOverlayProps {
  fps: number;
  onComplete: (result: BenchmarkResult) => void;
}


const stressLabel = (profile: BenchmarkProfile) =>
  `E${profile.enemyTarget} J${profile.projectileCount} G${profile.glowCount} R${profile.ringCount} P${profile.particleCount} I${profile.imageCount} T${profile.torchCount} M${profile.mineCount}`;

// §5.24 M23(社長採用v0.25.1538): 重→軽ランプ+余裕スキップ。「軽すぎる段を毎回走る」不満の解消。
// 余裕ライン(現PASS=avg40/min30より明確に上の叩き台・実機調整前提)。
export const BENCHMARK_MARGIN_AVG_FPS = 52;
export const BENCHMARK_MARGIN_MIN_FPS = 45;

export const hasBenchmarkMargin = (avgFps: number, minFps: number): boolean =>
  avgFps >= BENCHMARK_MARGIN_AVG_FPS && minFps >= BENCHMARK_MARGIN_MIN_FPS;

// 余裕あり(avg≥52&min≥45)→この系統の残り(軽い段)を飛ばして次カテゴリの先頭(最重段)へ。
// 余裕未満(タイトPASS/CAUTION/FAILいずれも)→同系統の次の(軽い)段へ降りて安全ラインを探す。
// 降り切ったら(currentIndex+1が次カテゴリへ跨ぐ)自然に次カテゴリへ移る。
// §5.24-追補: 実際に走る系統(モバイルではALL MAX/A2抜き)を`profiles`で受け取る
// (モバイル/デスクトップで指す配列が変わるため、固定のBENCHMARK_PROFILESを直接参照しない)。
export const nextProfileIndex = (profiles: BenchmarkProfile[], currentIndex: number, avgFps: number, minFps: number): number => {
  if (hasBenchmarkMargin(avgFps, minFps)) {
    const currentCategory = profiles[currentIndex]?.category;
    const nextCategoryIndex = profiles.findIndex((profile, index) =>
      index > currentIndex && profile.category !== currentCategory
    );
    return nextCategoryIndex === -1 ? profiles.length : nextCategoryIndex;
  }
  return currentIndex + 1;
};

const gradeBenchmark = (avgFps: number, minFps: number): BenchmarkGrade => {
  if (avgFps >= BENCHMARK_PASS_AVG_FPS && minFps >= BENCHMARK_PASS_MIN_FPS) return 'PASS';
  if (avgFps >= 34 && minFps >= 24) return 'CAUTION';
  return 'FAIL';
};

/** 直近 windowMs のフレームから今の fps を出す(早期打ち切り判定用)。観測が薄い時は60を返す。 */
const recentFps = (times: number[], windowMs = BENCHMARK_EARLY_FAIL_WINDOW_MS): number => {
  if (times.length < 4) return 60;
  const last = times[times.length - 1];
  const from = last - windowMs;
  let count = 0;
  for (let i = times.length - 1; i >= 0 && times[i] >= from; i -= 1) count += 1;
  const span = last - Math.max(times[0], from);
  return span > 0 ? ((count - 1) * 1000) / span : 60;
};

const summarizeCategories = (attempts: BenchmarkStageResult[]) => {
  const categories = [...new Set(BENCHMARK_PROFILES.map(profile => profile.category))];
  const lines = categories.map(category => {
    const categoryAttempts = attempts.filter(attempt => attempt.category === category);
    if (categoryAttempts.length === 0) return `${category}: not run`;
    const lastPass = categoryAttempts.filter(attempt => attempt.grade === 'PASS').at(-1);
    const firstStop = categoryAttempts.find(attempt => attempt.grade !== 'PASS');
    const safe = lastPass ? lastPass.label : 'none';
    const stop = firstStop ? `${firstStop.label} ${firstStop.grade}` : 'max';
    return `${category}: safe ${safe} / stop ${stop}`;
  });
  const failed = attempts.filter(attempt => attempt.grade !== 'PASS');
  const weakest = failed.length
    ? [...failed].sort((a, b) => a.avgFps - b.avgFps || a.minFps - b.minFps)[0]
    : null;
  return {
    lines,
    bottleneck: weakest
      ? `${weakest.category} ${weakest.label} avg ${weakest.avgFps.toFixed(1)} min ${weakest.minFps}`
      : 'none',
  };
};

const summarizeDiagnostics = (
  netSamples: number[],
  netFailures: number,
  mainDelaySamples: number[]
): BenchmarkDiagnostics => {
  const avg = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const netRttAvg = avg(netSamples);
  const netRttMax = netSamples.length ? Math.max(...netSamples) : 0;
  const mainDelayAvg = avg(mainDelaySamples);
  const mainDelayMax = mainDelaySamples.length ? Math.max(...mainDelaySamples) : 0;
  const networkBad = netFailures >= 3 || netRttAvg >= 150 || netRttMax >= 450;
  const mainBad = mainDelayAvg >= 28 || mainDelayMax >= 140;
  const verdict = networkBad
    ? mainBad
      ? 'network + device unstable'
      : 'network unstable'
    : mainBad
      ? 'device hot / main-thread unstable'
      : 'network OK / device OK';

  return {
    netRttAvg,
    netRttMax,
    netSamples: netSamples.length,
    netFailures,
    mainDelayAvg,
    mainDelayMax,
    mainSamples: mainDelaySamples.length,
    verdict,
  };
};

const createBenchmarkTorches = (px: number, py: number, count: number, elapsed: number): BreakableProp[] => {
  const torches: BreakableProp[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + Math.sin(elapsed * 0.0008) * 0.12;
    const radius = 132 + (i % 5) * 34;
    const footX = px + Math.cos(angle) * radius;
    const footY = py + Math.sin(angle) * (radius * 0.72);
    const scale = 0.9 + (i % 3) * 0.07;
    const width = 20 * scale;
    const height = 16 * scale;
    torches.push({
      id: `bench-torch-${i}`,
      x: footX - width / 2,
      y: footY - height,
      width,
      height,
      footX,
      footY,
      scale,
      health: 999,
      maxHealth: 999,
      type: 'torch',
      lastHit: 0,
    });
  }
  return torches;
};

// §5.24 M23: 緑卵(mine)ベンチ生成(createBenchmarkTorches同型)。実際のスポーン(mineRect)と同じ
// footRect計算を使い、pooled sprite描画+個別影キャスターの実パスを計測する。health/typeは実際の
// mine BreakableProp(gameStore.ts syncBreakableProps)と同じ値(health=1・type='mine')。
export const createBenchmarkMines = (px: number, py: number, count: number, elapsed: number): BreakableProp[] => {
  const mines: BreakableProp[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + Math.sin(elapsed * 0.0008) * 0.12;
    const radius = 96 + (i % 5) * 22;
    const footX = px + Math.cos(angle) * radius;
    const footY = py + Math.sin(angle) * (radius * 0.72);
    const scale = 0.82 + (i % 3) * 0.06;
    const rect = mineRect({ footX, footY, scale });
    mines.push({
      id: `bench-mine-${i}`,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      footX,
      footY,
      scale,
      health: 1,
      maxHealth: 1,
      type: 'mine',
      lastHit: 0,
    });
  }
  return mines;
};

// 弾幕用のベンチ弾: プレイヤーの周りを周回(orbit)させて画面内に留め、移動更新・衝突判定・描画を
// 毎フレーム走らせる。phill-bullet は壁カリングの対象外なので松明があっても消えない。
const createBenchBullet = (px: number, py: number, idx: number, total: number): Projectile => {
  const angle = (idx / Math.max(1, total)) * Math.PI * 2;
  const radius = 64 + (idx % 9) * 24;
  return {
    id: `bench-proj-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    x: px + Math.cos(angle) * radius,
    y: py + Math.sin(angle) * radius,
    width: 10,
    height: 10,
    speed: 0,
    damage: 0,
    direction: { x: Math.cos(angle), y: Math.sin(angle) },
    weaponType: 'phill-bullet' as WeaponType,
    duration: 999999,
    createdAt: Date.now(),
    passthrough: true,
    hitEnemies: [],
    hostile: false,
    reflected: false,
    orbitRadius: radius,
    orbitAngle: angle,
    orbitSpeed: 1.4 + (idx % 5) * 0.22,
  };
};

/**
 * 進行の段階。stage=本番の段 / warmup=捨て段 / canary=基準段 /
 * repeat=**最初の段をもう一度**(ドリフト検算) / net=通信計測(全段終了後)。
 */
type BenchmarkPhase = 'warmup' | 'canary' | 'stage' | 'repeat' | 'net';

const BenchmarkOverlay: React.FC<BenchmarkOverlayProps> = ({ fps, onComplete }) => {
  // §5.24-追補: モバイルはALLカテゴリの最重段(MAX=A3・A2)を除外(=クラッシュしうる段を走らせない)。
  // デバイス種別はセッション中に変わらない前提で一度だけ判定する。
  const [profiles] = useState<BenchmarkProfile[]>(() => activeBenchmarkProfiles(isMobileBenchDevice(), benchmarkOnlyFilter()));
  const [warmupEnabled] = useState(() => benchFlag('warm', true));
  const [canaryEnabled] = useState(() => benchFlag('canary', true));
  const [repeatEnabled] = useState(() => benchFlag('repeat', true));
  const [startedAt] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [activeAttempt, setActiveAttempt] = useState(0);
  const [phase, setPhase] = useState<BenchmarkPhase>(() =>
    warmupEnabled ? 'warmup' : (canaryEnabled ? 'canary' : 'stage')
  );
  const attemptStartedAtRef = useRef(performance.now());
  // ★計測の実体: rAF で拾ったフレーム時刻。旧実装は1秒更新の fps 値を500msごとに拾っていたので
  // 1段の独立観測が2〜3個しかなかった(=数字が暴れる原因)。ここに全フレームが入る。
  const frameTimesRef = useRef<number[]>([]);
  const canaryFpsRef = useRef<number[]>([]);
  const lastCanaryFpsRef = useRef(0);
  const finalCanaryRef = useRef(false);
  const repeatStageRef = useRef<BenchmarkStageResult | null>(null);
  const netRttSamplesRef = useRef<number[]>([]);
  const netFailuresRef = useRef(0);
  const mainDelaySamplesRef = useRef<number[]>([]);
  const completedAttemptsRef = useRef<BenchmarkStageResult[]>([]);
  const finalizedRef = useRef(false);
  const spawnedEnemyIdsRef = useRef(new Set<string>());
  const benchEnemyBaseRef = useRef<Record<string, { x: number; y: number; width: number; height: number; index: number }>>({});
  const maxCountsRef = useRef({
    enemies: 0,
    fx: 0,
    projectiles: 0,
    pickups: 0,
    torches: 0,
    mines: 0,
  });
  const attemptMaxCountsRef = useRef({
    enemies: 0,
    fx: 0,
    torches: 0,
    mines: 0,
  });

  const addEnemy = useGameStore(state => state.addEnemy);
  const removeEnemy = useGameStore(state => state.removeEnemy);
  const addProjectile = useGameStore(state => state.addProjectile);
  const spawnBurst = useGameStore(state => state.spawnBurst);
  const spawnRing = useGameStore(state => state.spawnRing);
  const spawnGlow = useGameStore(state => state.spawnGlow);
  const spawnSlash = useGameStore(state => state.spawnSlash);
  const spawnDamageNumber = useGameStore(state => state.spawnDamageNumber);
  const spawnImageMark = useGameStore(state => state.spawnImageMark);

  const cleanupBenchmarkObjects = useCallback(() => {
    spawnedEnemyIdsRef.current.forEach(removeEnemy);
    spawnedEnemyIdsRef.current.clear();
    benchEnemyBaseRef.current = {};
    useGameStore.setState(state => ({
      breakableProps: state.breakableProps.filter(prop => !prop.id.startsWith('bench-torch-') && !prop.id.startsWith('bench-mine-')),
      projectiles: state.projectiles.filter(p => !p.id.startsWith('bench-proj-')),
      effects: [],
    }));
  }, [removeEnemy]);

  const buildAttemptResult = useCallback((profile: BenchmarkProfile, stats: FrameStats, times: number[]): BenchmarkStageResult => {
    const grade = gradeBenchmark(stats.avgFps, stats.minFps);
    return {
      id: profile.id,
      category: profile.category,
      label: profile.label,
      grade,
      avgFps: stats.avgFps,
      minFps: stats.minFps,
      drops: slowFrameRatio(times, BENCHMARK_PASS_AVG_FPS),
      enemyTarget: profile.enemyTarget,
      stress: stressLabel(profile),
      safeStress: grade === 'PASS' ? stressLabel(profile) : 'not found',
      adjusted: profile.id !== profiles[0].id,
      maxTorches: attemptMaxCountsRef.current.torches,
      maxMines: attemptMaxCountsRef.current.mines,
      maxEnemies: attemptMaxCountsRef.current.enemies,
      maxFx: attemptMaxCountsRef.current.fx,
      sampleCount: stats.frames,
      deltaMs: stageDeltaMs(stats.avgFps, lastCanaryFpsRef.current),
      canaryFps: lastCanaryFpsRef.current,
      sdMs: stats.sdMs,
      p95Ms: stats.p95Ms,
    };
  }, [profiles]);

  /** 段を切り替える(計測のリセットはここ1箇所に集約する)。 */
  const startPhase = useCallback((next: BenchmarkPhase) => {
    frameTimesRef.current = [];
    attemptStartedAtRef.current = performance.now();
    attemptMaxCountsRef.current = { enemies: 0, fx: 0, torches: 0, mines: 0 };
    cleanupBenchmarkObjects();
    setPhase(next);
  }, [cleanupBenchmarkObjects]);

  // 通信計測は**全段が終わってから**回す(v0.25.2690)。旧実装は開始と同時に12回の fetch を
  // 650ms間隔で撃っていたので、**暖機と最初の2段(=一番冷えていて一番大事な段)にモロに被っていた**。
  const runNetworkSamples = useCallback(async () => {
    const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    for (let i = 0; i < BENCHMARK_NET_SAMPLE_COUNT; i += 1) {
      const start = performance.now();
      try {
        await fetch(`${baseUrl}?bench-net=${Date.now()}-${i}`, { cache: 'no-store', credentials: 'same-origin' });
        netRttSamplesRef.current.push(performance.now() - start);
      } catch {
        netFailuresRef.current += 1;
      }
      await sleep(BENCHMARK_NET_SAMPLE_GAP_MS);
    }
  }, []);

  const finishBenchmark = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    cleanupBenchmarkObjects();
    setPhase('net');
    void (async () => {
      await runNetworkSamples();
      const attempts = completedAttemptsRef.current;
      const passAttempt = attempts.filter(attempt => attempt.grade === 'PASS').at(-1);
      const finalGrade: BenchmarkGrade = passAttempt ? 'PASS' : 'FAIL';
      const displaySummary = passAttempt ?? attempts.at(-1) ?? { avgFps: 0, minFps: 0, drops: 0 };
      const categorySummary = summarizeCategories(attempts);
      const diagnostics = summarizeDiagnostics(
        netRttSamplesRef.current,
        netFailuresRef.current,
        mainDelaySamplesRef.current
      );
      const maxCounts = maxCountsRef.current;
      const nextResult: BenchmarkResult = {
        grade: finalGrade,
        avgFps: displaySummary.avgFps,
        minFps: displaySummary.minFps,
        drops: displaySummary.drops,
        maxEnemies: maxCounts.enemies,
        maxFx: maxCounts.fx,
        maxProjectiles: maxCounts.projectiles,
        maxPickups: maxCounts.pickups,
        maxTorches: maxCounts.torches,
        maxMines: maxCounts.mines,
        stageCount: attempts.length,
        stages: attempts,
        categorySummary: categorySummary.lines,
        bottleneck: categorySummary.bottleneck,
        diagnostics,
        canaryFps: [...canaryFpsRef.current],
        driftMs: canaryDriftMs(canaryFpsRef.current),
        repeatStage: repeatStageRef.current,
      };
      setResult(nextResult);
      window.setTimeout(() => onComplete(nextResult), 450);
    })();
  }, [cleanupBenchmarkObjects, onComplete, runNetworkSamples]);

  /** 暖機(捨て段)の終わり → 基準段へ(基準段OFFならそのまま本番へ)。 */
  const completeWarmup = useCallback(() => {
    startPhase(canaryEnabled ? 'canary' : 'stage');
  }, [canaryEnabled, startPhase]);

  /** 検算段で走らせる段(=最初に実際に走った段)。1段も走っていなければ null。 */
  const repeatProfile = useCallback((): BenchmarkProfile | null => {
    const firstId = completedAttemptsRef.current[0]?.id;
    return firstId ? (profiles.find(p => p.id === firstId) ?? null) : null;
  }, [profiles]);

  /** 基準段の終わり → 記録して本番へ。最後の基準段だったら検算段へ(無ければ締める)。 */
  const completeCanary = useCallback(() => {
    const stats = summarizeFrames(frameTimesRef.current);
    if (stats.avgFps > 0) {
      canaryFpsRef.current = [...canaryFpsRef.current, stats.avgFps];
      lastCanaryFpsRef.current = stats.avgFps;
    }
    if (finalCanaryRef.current) {
      if (repeatEnabled && repeatProfile()) startPhase('repeat');
      else finishBenchmark();
      return;
    }
    startPhase('stage');
  }, [finishBenchmark, repeatEnabled, repeatProfile, startPhase]);

  /** 検算段の終わり → 記録して締める。**成績には入れない**(同じ段を二重に数えない)。 */
  const completeRepeat = useCallback((profile: BenchmarkProfile) => {
    const times = frameTimesRef.current;
    repeatStageRef.current = buildAttemptResult(profile, summarizeFrames(times), times);
    finishBenchmark();
  }, [buildAttemptResult, finishBenchmark]);

  /** 本番の段の終わり → 次の段へ。系統をまたぐ時だけ基準段を挟む。 */
  const completeStage = useCallback((profile: BenchmarkProfile) => {
    const times = frameTimesRef.current;
    const attemptResult = buildAttemptResult(profile, summarizeFrames(times), times);
    completedAttemptsRef.current = [...completedAttemptsRef.current, attemptResult];
    const nextAttempt = nextProfileIndex(profiles, activeAttempt, attemptResult.avgFps, attemptResult.minFps);
    if (nextAttempt >= profiles.length) {
      if (canaryEnabled) {
        finalCanaryRef.current = true;
        startPhase('canary');
      } else if (repeatEnabled && repeatProfile()) {
        startPhase('repeat');
      } else {
        finishBenchmark();
      }
      return;
    }
    const crossesCategory = profiles[nextAttempt].category !== profiles[activeAttempt].category;
    setActiveAttempt(nextAttempt);
    startPhase(crossesCategory && canaryEnabled ? 'canary' : 'stage');
  }, [activeAttempt, buildAttemptResult, canaryEnabled, finishBenchmark, profiles, repeatEnabled, repeatProfile, startPhase]);

  useEffect(() => {
    let expected = performance.now() + BENCHMARK_MAIN_DELAY_SAMPLE_MS;
    const delayTimer = window.setInterval(() => {
      const tickNow = performance.now();
      mainDelaySamplesRef.current.push(Math.max(0, tickNow - expected));
      expected = tickNow + BENCHMARK_MAIN_DELAY_SAMPLE_MS;
    }, BENCHMARK_MAIN_DELAY_SAMPLE_MS);
    return () => window.clearInterval(delayTimer);
  }, []);

  // ★計測の心臓部: rAF で**全フレームの時刻**を記録する(v0.25.2690)。
  // 段の頭(負荷が乗り切るまで)は捨て、そこから終わりまでを1段の観測とする。
  useEffect(() => {
    if (result || phase === 'net') return;
    const settleMs = phase === 'canary' ? BENCHMARK_CANARY_SETTLE_MS : BENCHMARK_ATTEMPT_WARMUP_MS;
    let raf = 0;
    const step = (t: number) => {
      raf = window.requestAnimationFrame(step);
      if (t - attemptStartedAtRef.current >= settleMs) frameTimesRef.current.push(t);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [phase, result]);

  useEffect(() => {
    if (result || phase === 'net') return;
    const stageProfile = profiles[activeAttempt] ?? profiles[profiles.length - 1];
    // 検算段は「最初に走った段」を再現する。暖機段・基準段は**常に同じ固定負荷**(CANARY_PROFILE)。
    const replayProfile = phase === 'repeat' ? repeatProfile() : null;
    const profile = phase === 'stage' ? stageProfile : (replayProfile ?? CANARY_PROFILE);
    const pool = enemyPool(profile);
    const phaseTotalMs =
      phase === 'warmup' ? BENCHMARK_WARMUP_MS : phase === 'canary' ? BENCHMARK_CANARY_MS : BENCHMARK_ATTEMPT_MS;
    const completePhase = () => {
      if (phase === 'warmup') completeWarmup();
      else if (phase === 'canary') completeCanary();
      else if (phase === 'repeat') completeRepeat(profile);
      else completeStage(stageProfile);
    };

    const runBenchmarkTick = () => {
      const elapsed = performance.now() - startedAt;
      const tickNow = performance.now();
      const attemptElapsed = tickNow - attemptStartedAtRef.current;
      if (attemptElapsed >= phaseTotalMs) {
        completePhase();
        return;
      }

      // 早期打ち切りは**本番の段だけ**(暖機/基準段は最後まで回す=基準がブレると全部ブレる)。
      if (
        phase === 'stage' &&
        attemptElapsed >= BENCHMARK_EARLY_FAIL_AFTER_MS &&
        frameTimesRef.current.length >= 8 &&
        recentFps(frameTimesRef.current) <= BENCHMARK_EARLY_FAIL_FPS
      ) {
        completePhase();
        return;
      }

      useGameStore.setState(state => ({
        isPaused: false,
        showUpgradeMenu: false,
        upgradeOptions: [],
        player: {
          ...state.player,
          health: state.player.maxHealth,
          invulnerable: true,
          invulnerableTime: Date.now(),
          experience: 0,
        },
        enemies: state.enemies.map(enemy => {
          const isBench = spawnedEnemyIdsRef.current.has(enemy.id);
          const base = benchEnemyBaseRef.current[enemy.id];
          const wave = isBench && base
            ? Math.sin(elapsed * 0.011 + base.index * 0.61)
            : 0;
          const stretch = isBench && base && profile.shadowJitter > 0
            ? Math.sin(elapsed * 0.012 + base.index * 1.7) * profile.shadowJitter
            : 0;
          return {
            ...enemy,
            x: base ? base.x : enemy.x,
            y: base ? base.y + wave * profile.yOscillation : enemy.y,
            width: base ? Math.max(14, base.width + stretch) : enemy.width,
            height: base ? Math.max(16, base.height + stretch * 0.35) : enemy.height,
            speed: isBench ? 0 : Math.min(enemy.speed, 8),
            damage: 0,
            health: isBench ? BENCHMARK_ENEMY_HP : enemy.health,
            maxHealth: isBench ? BENCHMARK_ENEMY_HP : enemy.maxHealth,
            // root で動き/特殊AI(ジャンプ・突進)を止め、計測を安定させる。
            rootUntil: state.gameTime + BENCHMARK_ATTEMPT_MS + 5000,
            aiPhase: undefined,
          };
        }),
        breakableProps: [
          ...state.breakableProps.filter(prop => !prop.id.startsWith('bench-torch-') && !prop.id.startsWith('bench-mine-')),
          ...createBenchmarkTorches(
            state.player.x + state.player.width / 2,
            state.player.y + state.player.height / 2,
            profile.torchCount,
            elapsed
          ),
          ...createBenchmarkMines(
            state.player.x + state.player.width / 2,
            state.player.y + state.player.height / 2,
            profile.mineCount,
            elapsed
          ),
        ],
        pickups: state.pickups.filter(pickup => pickup.type !== 'experience'),
      }));

      const state = useGameStore.getState();
      const px = state.player.x + state.player.width / 2;
      const py = state.player.y + state.player.height / 2;
      const existingBenchEnemies = state.enemies.filter(e => spawnedEnemyIdsRef.current.has(e.id));
      const benchTorchCount = state.breakableProps.filter(prop => prop.id.startsWith('bench-torch-')).length;
      const benchMineCount = state.breakableProps.filter(prop => prop.id.startsWith('bench-mine-')).length;
      const benchProjCount = state.projectiles.filter(p => p.id.startsWith('bench-proj-')).length;
      const missing = Math.max(0, profile.enemyTarget - existingBenchEnemies.length);

      if (existingBenchEnemies.length > profile.enemyTarget) {
        existingBenchEnemies
          .sort((a, b) => (benchEnemyBaseRef.current[b.id]?.index ?? 0) - (benchEnemyBaseRef.current[a.id]?.index ?? 0))
          .slice(0, existingBenchEnemies.length - profile.enemyTarget)
          .forEach(enemy => {
            removeEnemy(enemy.id);
            spawnedEnemyIdsRef.current.delete(enemy.id);
            delete benchEnemyBaseRef.current[enemy.id];
          });
      }

      maxCountsRef.current = {
        enemies: Math.max(maxCountsRef.current.enemies, state.enemies.length),
        fx: Math.max(maxCountsRef.current.fx, state.effects.length),
        projectiles: Math.max(maxCountsRef.current.projectiles, state.projectiles.length),
        pickups: Math.max(maxCountsRef.current.pickups, state.pickups.length),
        torches: Math.max(maxCountsRef.current.torches, benchTorchCount),
        mines: Math.max(maxCountsRef.current.mines, benchMineCount),
      };
      attemptMaxCountsRef.current = {
        enemies: Math.max(attemptMaxCountsRef.current.enemies, state.enemies.length),
        fx: Math.max(attemptMaxCountsRef.current.fx, state.effects.length),
        torches: Math.max(attemptMaxCountsRef.current.torches, benchTorchCount),
        mines: Math.max(attemptMaxCountsRef.current.mines, benchMineCount),
      };

      for (let i = 0; i < missing; i++) {
        const idx = existingBenchEnemies.length + i;
        const angle = (idx / Math.max(1, profile.enemyTarget)) * Math.PI * 2;
        const radius = 145 + (idx % 6) * 38;
        const type = pool[idx % pool.length];
        const jitter = profile.shadowJitter > 0 ? Math.sin(elapsed * 0.012 + idx * 1.7) * profile.shadowJitter : 0;
        const enemy = spawnEnemyAt(type, px + Math.cos(angle) * radius, py + Math.sin(angle) * radius, state.gameTime);
        const benchEnemy = {
          ...enemy,
          id: `bench-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          width: enemy.width + jitter,
          height: enemy.height + jitter * 0.35,
          speed: 0,
          damage: 0,
          health: BENCHMARK_ENEMY_HP,
          maxHealth: BENCHMARK_ENEMY_HP,
          rootUntil: state.gameTime + BENCHMARK_ATTEMPT_MS + 5000,
        };
        spawnedEnemyIdsRef.current.add(benchEnemy.id);
        benchEnemyBaseRef.current[benchEnemy.id] = {
          x: enemy.x,
          y: enemy.y,
          width: enemy.width,
          height: enemy.height,
          index: idx,
        };
        addEnemy(benchEnemy);
      }

      // 弾幕(orbit弾)を目標数まで補充。多すぎる場合は古い分から間引く。
      if (benchProjCount > profile.projectileCount) {
        const ids = state.projectiles.filter(p => p.id.startsWith('bench-proj-')).map(p => p.id);
        const remove = new Set(ids.slice(0, benchProjCount - profile.projectileCount));
        useGameStore.setState(s => ({ projectiles: s.projectiles.filter(p => !remove.has(p.id)) }));
      } else {
        const need = profile.projectileCount - benchProjCount;
        for (let i = 0; i < need; i++) {
          addProjectile(createBenchBullet(px, py, benchProjCount + i, Math.max(1, profile.projectileCount)));
        }
      }

      // FX の嵐: リング/グロー/粒子/斬撃/ダメージ数字/斬マークを毎tick撒く(寿命でステディに乗る)。
      const pulseAngle = elapsed * 0.002;
      for (let i = 0; i < profile.ringCount; i++) {
        const angle = pulseAngle + (i / Math.max(1, profile.ringCount)) * Math.PI * 2;
        const fxX = px + Math.cos(angle) * (96 + i * 24);
        const fxY = py + Math.sin(angle) * (64 + i * 16);
        spawnRing(fxX, fxY, 8, 84 + i * 12, 'rgba(96,165,250,0.72)', 3, BENCHMARK_FX_DURATION_MS);
      }
      for (let i = 0; i < profile.glowCount; i++) {
        const angle = pulseAngle * 1.35 + (i / Math.max(1, profile.glowCount)) * Math.PI * 2;
        const fxX = px + Math.cos(angle) * (86 + (i % 4) * 30);
        const fxY = py + Math.sin(angle) * (58 + (i % 3) * 22);
        spawnGlow(fxX, fxY, 58 + (i % 5) * 12, 'rgba(96,165,250,', BENCHMARK_FX_DURATION_MS);
      }
      if (profile.particleCount > 0) {
        // 1点に固めず数か所から撒いて、実戦の複数同時ヒットを模す。
        const bursts = Math.min(6, Math.max(1, Math.round(profile.particleCount / 18)));
        const per = Math.ceil(profile.particleCount / bursts);
        for (let b = 0; b < bursts; b++) {
          const a = pulseAngle * 1.7 + (b / bursts) * Math.PI * 2;
          spawnBurst(px + Math.cos(a) * 120, py + Math.sin(a) * 84, '#93c5fd', per);
        }
      }
      for (let i = 0; i < profile.slashCount; i++) {
        const a = pulseAngle * 2.1 + (i / Math.max(1, profile.slashCount)) * Math.PI * 2;
        spawnSlash(px + Math.cos(a) * (70 + (i % 4) * 18), py + Math.sin(a) * (52 + (i % 3) * 14), 'rgba(186,230,253,0.95)');
      }
      for (let i = 0; i < profile.dmgCount; i++) {
        const a = pulseAngle * 1.1 + (i / Math.max(1, profile.dmgCount)) * Math.PI * 2;
        spawnDamageNumber(px + Math.cos(a) * 90, py + Math.sin(a) * 60, 100 + ((i * 37) % 900), i % 3 === 0);
      }
      for (let i = 0; i < profile.imageCount; i++) {
        const a = pulseAngle * 0.8 + (i / Math.max(1, profile.imageCount)) * Math.PI * 2;
        spawnImageMark(px + Math.cos(a) * 110, py + Math.sin(a) * 76, 'zan', { scale: 1.0, duration: BENCHMARK_FX_DURATION_MS });
      }
      setNow(performance.now());
    };

    runBenchmarkTick();
    const tick = window.setInterval(runBenchmarkTick, BENCHMARK_TICK_MS);

    return () => window.clearInterval(tick);
  }, [
    activeAttempt,
    addEnemy,
    addProjectile,
    completeCanary,
    completeRepeat,
    completeStage,
    completeWarmup,
    phase,
    repeatProfile,
    profiles,
    removeEnemy,
    result,
    spawnBurst,
    spawnDamageNumber,
    spawnGlow,
    spawnImageMark,
    spawnRing,
    spawnSlash,
    startedAt,
  ]);

  useEffect(() => () => {
    cleanupBenchmarkObjects();
  }, [cleanupBenchmarkObjects]);

  const profile = profiles[activeAttempt] ?? profiles[profiles.length - 1];
  const phaseTotalMs =
    phase === 'warmup' ? BENCHMARK_WARMUP_MS : phase === 'canary' ? BENCHMARK_CANARY_MS : BENCHMARK_ATTEMPT_MS;
  const attemptElapsed = Math.min(phaseTotalMs, now - attemptStartedAtRef.current);
  // 通信計測(net)の間は描画を止めているので `now` が進まない=**メーターが途中で固まって見える**
  // (社長指摘v0.25.2691)。計測自体は正常なので、この段は満タン表示にして「終わって通信を測っている」
  // ことを示す(見出しにも `net` と出る)。
  const progress = result || phase === 'net' ? 100 : Math.round((attemptElapsed / phaseTotalMs) * 100);
  const secondsLeft = Math.max(0, Math.ceil((phaseTotalMs - attemptElapsed) / 1000));
  const phaseLabel =
    phase === 'warmup' ? '暖機(捨て)'
      : phase === 'canary' ? '基準段'
        : phase === 'repeat' ? '検算段(最初の段を再測定)'
          : phase === 'net' ? '通信計測' : null;
  const gradeStyle = useMemo(() => {
    switch (result?.grade) {
      case 'PASS':
        return 'border-emerald-300/50 bg-emerald-950/72 text-emerald-100';
      case 'CAUTION':
        return 'border-amber-300/50 bg-amber-950/72 text-amber-100';
      case 'FAIL':
        return 'border-rose-300/50 bg-rose-950/72 text-rose-100';
      default:
        return 'border-sky-300/35 bg-slate-950/72 text-sky-100';
    }
  }, [result?.grade]);

  return (
    <div
      className={`pointer-events-none absolute right-3 top-[calc(max(env(safe-area-inset-top),8px)+94px)] z-50 w-[184px] rounded-xl border px-3 py-2 shadow-xl backdrop-blur-md ${gradeStyle}`}
      style={{ fontFamily: 'monospace' }}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
        <span>BENCH</span>
        <span>{result ? result.grade : phase === 'net' ? 'net' : `${secondsLeft}s`}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-white/65 transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1.5 space-y-0.5 text-[10px] leading-tight text-white/80">
        {result ? (
          <>
            <div>avg {result.avgFps.toFixed(1)} / min {result.minFps}</div>
            <div>fx {result.maxFx} / proj {result.maxProjectiles}</div>
            <div>net {result.diagnostics.netRttAvg.toFixed(0)}ms main {result.diagnostics.mainDelayMax.toFixed(0)}ms</div>
            <div>safe {result.stages.filter(stage => stage.grade === 'PASS').at(-1)?.safeStress ?? 'not found'}</div>
          </>
        ) : (
          <>
            <div>try {activeAttempt + 1}/{profiles.length} fps {fps}</div>
            {phaseLabel
              ? <div>{phaseLabel}{phase === 'canary' && lastCanaryFpsRef.current > 0 ? ` (前回 ${lastCanaryFpsRef.current.toFixed(0)})` : ''}</div>
              : <div>{profile.id} {profile.category} {profile.label}</div>}
            <div>{stressLabel(phase === 'stage' ? profile : (phase === 'repeat' ? (repeatProfile() ?? CANARY_PROFILE) : CANARY_PROFILE))}</div>
          </>
        )}
      </div>
    </div>
  );
};

export default BenchmarkOverlay;
