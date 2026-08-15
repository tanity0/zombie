// AI_DIRECTOR_METRICS計測バッチ(社長指示: 「aiディレクター用の未定の項目を埋める目の指標を取るテストを、
// n数ある程度信用できる回数ずつ取りたい」)。AI_DIRECTOR_HANDOFF.md §3「まだやっていない」の数値詰め
// (Intensity/Performance算出パラメータ・RELAX_ESC_MULT/RELAX_INTERVAL_MULT/RELAX_CAP_MULT・
// BUILDUP_ESC_BOOST_MAX・既定ON化の可否)を**裁定できるだけの数字**を、十分なN数で取る。
//
// ★このテストは値を1つも変更しない(計測専用)。数値そのものの変更は提案止まり(実装しない)。
// ★このテストは通常push(npm test)では走らない。DIRECTOR_METRICS=1 の時だけ走る:
//   DIRECTOR_METRICS=1 npx vitest run src/store/directorMetrics.test.ts
//   (本数を変えたい時は DIRECTOR_METRICS_N=5 のように環境変数で上書き。既定30)
//
// 実行経路(実機useGameLoop.tsとの既知の差はsrc/utils/playtestDriver.ts PlaytestTickOptions.
// directorApplyのコメント、および本ファイル末尾のコメントに明記):
//   既存のヘッドレスsim経路(createPlaytestRefs/runPlaytestTick@playtestDriver.ts)をそのまま再利用。
//   stepDirector(src/utils/aiDirector.ts)はrunDirectorSignalStep(directorTick.ts)経由で毎tick
//   実機と同じ入力(hpFrac/damageTakenFrac/nearEnemies/killDelta/dangerBias)から計算される。
//   RELAX/BUILDUPの適用(spawnEscへの反映)は本バッチのためにplaytestDriver.tsへ追加した
//   opts.directorApply(既定undefined=無効・既存テストは無影響)で有効化する。
import { describe, it, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { createPlaytestRefs, runPlaytestTick, type PlaytestRefs } from '../utils/playtestDriver';
import { mulberry32 } from '../utils/botUpgradePolicy';
import type { DirectorMacro } from '../utils/aiDirector';

declare const process: { env?: Record<string, string | undefined> } | undefined;
declare const require: (m: string) => { writeFileSync: (p: string, d: string) => void; mkdirSync: (p: string, o?: unknown) => void };

const DT = 1 / 60;
const RUN_SECONDS = 300; // 1ランの尺=ゲーム内5分固定(死亡した場合はそこで打ち切り=survivedSecが短くなる)
const TICKS = Math.round(RUN_SECONDS * 60 * 60) / 60 * 60; // 明示的に60fps換算(=RUN_SECONDS*60)
const CLASS = 'warrior';
const PERSONA = 'standard';

type Condition = 'A_off' | 'B_relax' | 'C_all';
const CONDITIONS: { id: Condition; directorApply: 'none' | 'relax' | 'all'; label: string }[] = [
  { id: 'A_off', directorApply: 'none', label: 'A: ディレクター無効(基準点)' },
  { id: 'B_relax', directorApply: 'relax', label: 'B: directorApply=relax' },
  { id: 'C_all', directorApply: 'all', label: 'C: directorApply=all(relax+buildup)' },
];

// ---- ストリーミング統計(平均/SD)。90ラン×18000tickぶんの生配列を保持しないための軽量集計。----
class Stream {
  n = 0; sum = 0; sumSq = 0; max = -Infinity; min = Infinity;
  push(v: number) { this.n++; this.sum += v; this.sumSq += v * v; if (v > this.max) this.max = v; if (v < this.min) this.min = v; }
  mean(): number { return this.n > 0 ? this.sum / this.n : 0; }
  sd(): number {
    if (this.n < 2) return 0;
    const m = this.mean();
    const v = Math.max(0, this.sumSq / this.n - m * m);
    return Math.sqrt(v);
  }
}

// ---- 1ランぶんのスカラー要約(このオブジェクトの各フィールドがN本ぶん集まって条件ごとの分布になる)。----
interface RunSummary {
  seed: number;
  survivedSec: number;
  died: boolean;
  // DirectorState 滞在時間比率
  buildupFrac: number; peakFrac: number; relaxFrac: number;
  // PEAK回数・間隔(緩急の周期) / RELAXの平均滞在
  peakCount: number;
  peakIntervalMeanSec: number | null; // 2回未満ならnull(間隔が定義できない)
  relaxDwellMeanSec: number | null;
  // Intensity/Performance
  intensityMean: number; intensitySD: number; ceilingFrac: number; // ceilingFrac=Intensity>=0.9の時間割合
  performanceMean: number; performanceSD: number;
  // 湧き・盤面
  spawnsPerMin: number;
  boardCountMean: number; boardCountMax: number;
  nearEnemyMean: number; // 半径240px以内(DirectorState.nearEnemiesをそのまま使う=実機と同じ定義)
  // プレイヤー
  hitsPerMin: number;
  hitIntervalMedianSec: number | null;
  minHpFrac: number; // 最大HPに対する割合(キャラ差を吸収するため%で見る)
  // 撃破
  killsPerMin: number;
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
};

// 1ラン実行。同じseedはA/B/C全条件で共有する(対応のある比較にするための固定)。
// Math.random は run 単位で mulberry32(seed) に差し替える(ボット行動/敵抽選/湧き乱数を条件間で揃える。
// ただし分岐が発生した瞬間から後段の乱数消費順は状態依存でズレていく=通常のペア比較の限界。§報告に明記)。
const runOne = (seed: number, directorApply: 'none' | 'relax' | 'all'): RunSummary => {
  const realEpoch = Date.now();
  vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['Date'] });
  vi.setSystemTime(realEpoch);
  const randomSpy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed * 2654435761));
  try {
    useGameStore.getState().resetGame(CLASS);
    const refs: PlaytestRefs = createPlaytestRefs();

    let prevMacro: DirectorMacro = refs.director.directorRef.current.state.macro; // 'buildup'(createDirectorState初期値)
    let macroSinceMs = 0; // 現macroに入ってからの経過(directorRef.state.macroMsをそのまま信用してもよいが、
                            // ここでは独立に持って「その状態に入った時刻」からの滞在秒を出す(検算・可読性のため)。
    const secByMacro: Record<DirectorMacro, number> = { buildup: 0, peak: 0, relax: 0 };
    let peakCount = 0;
    const peakEnterAtSec: number[] = [];
    const relaxDwellsSec: number[] = [];
    let relaxEnteredAtSec: number | null = null;

    const intensity = new Stream();
    const performance = new Stream();
    let ceilingMs = 0;
    const boardCount = new Stream();
    const nearEnemy = new Stream();

    const seenEnemyIds = new Set<string>();
    let spawnCount = 0;

    let hpLostEvents = 0;
    const hitAtSec: number[] = [];
    let minHpFrac = 1;
    let killsAtEnd = 0;

    let died = false;
    let survivedMs = 0;

    for (let i = 0; i < TICKS; i++) {
      const before = useGameStore.getState();
      if (before.player.health <= 0) break; // 死亡=そこで打ち切り(尺は可変=survivedSecへ記録)
      const healthBefore = before.player.health;
      const nextGameTime = before.gameTime + DT * 1000;
      vi.setSystemTime(realEpoch + nextGameTime);

      runPlaytestTick(refs, { persona: PERSONA, tickIndex: i, wanderSeed: seed, dt: DT, directorApply });

      const after = useGameStore.getState();
      survivedMs = after.gameTime;
      const tSec = after.gameTime / 1000;

      // --- DirectorState(macro/intensity/performance)はこのtickの末尾でrunDirectorSignalStepが
      //     更新済み=refs.director.directorRef.current.state を毎tick直接読む(0.5s間引きの
      //     recordDirectorSampleより高粒度。PEAK最低保持4000msなので取りこぼしはない)。
      const ds = refs.director.directorRef.current.state;
      secByMacro[ds.macro] += DT;
      if (ds.macro !== prevMacro) {
        if (ds.macro === 'peak') { peakCount++; peakEnterAtSec.push(tSec); }
        if (ds.macro === 'relax') { relaxEnteredAtSec = tSec; }
        else if (prevMacro === 'relax' && relaxEnteredAtSec !== null) {
          relaxDwellsSec.push(tSec - relaxEnteredAtSec);
          relaxEnteredAtSec = null;
        }
        prevMacro = ds.macro;
        macroSinceMs = 0;
      } else {
        macroSinceMs += DT * 1000;
      }
      intensity.push(ds.intensity);
      performance.push(ds.performance);
      if (ds.intensity >= 0.9) ceilingMs += DT * 1000;
      nearEnemy.push(ds.nearEnemies);

      boardCount.push(after.enemies.length);
      for (const e of after.enemies) {
        if (!seenEnemyIds.has(e.id)) { seenEnemyIds.add(e.id); spawnCount++; }
      }

      const dHp = Math.max(0, healthBefore - after.player.health);
      if (dHp > 0) { hpLostEvents++; hitAtSec.push(tSec); }
      const hpFracNow = after.player.maxHealth > 0 ? after.player.health / after.player.maxHealth : 0;
      if (hpFracNow < minHpFrac) minHpFrac = hpFracNow;
      killsAtEnd = after.gameStats.enemiesKilled;

      if (after.player.health <= 0) { died = true; }
    }
    // ループを抜けた時点で開いたままのrelax滞在があれば打ち切り時点までを1本として計上する
    // (「RELAXの平均滞在」を過小評価しないため。5分尺の終端/死亡どちらでも同じ扱い)。
    if (relaxEnteredAtSec !== null) relaxDwellsSec.push(survivedMs / 1000 - relaxEnteredAtSec);
    void macroSinceMs; // 検算用に保持しているだけ(未使用警告避け・意図的)

    const survivedSec = survivedMs / 1000;
    const survivedMin = Math.max(survivedSec / 60, 1 / 3600); // 0除算防止(理論上起きないが安全側)
    const peakIntervals: number[] = [];
    for (let k = 1; k < peakEnterAtSec.length; k++) peakIntervals.push(peakEnterAtSec[k] - peakEnterAtSec[k - 1]);
    const hitIntervals: number[] = [];
    for (let k = 1; k < hitAtSec.length; k++) hitIntervals.push(hitAtSec[k] - hitAtSec[k - 1]);

    return {
      seed, survivedSec, died,
      buildupFrac: secByMacro.buildup / survivedSec, peakFrac: secByMacro.peak / survivedSec, relaxFrac: secByMacro.relax / survivedSec,
      peakCount,
      peakIntervalMeanSec: peakIntervals.length > 0 ? peakIntervals.reduce((a, b) => a + b, 0) / peakIntervals.length : null,
      relaxDwellMeanSec: relaxDwellsSec.length > 0 ? relaxDwellsSec.reduce((a, b) => a + b, 0) / relaxDwellsSec.length : null,
      intensityMean: intensity.mean(), intensitySD: intensity.sd(), ceilingFrac: ceilingMs / survivedMs,
      performanceMean: performance.mean(), performanceSD: performance.sd(),
      spawnsPerMin: spawnCount / survivedMin,
      boardCountMean: boardCount.mean(), boardCountMax: boardCount.max,
      nearEnemyMean: nearEnemy.mean(),
      hitsPerMin: hpLostEvents / survivedMin,
      hitIntervalMedianSec: median(hitIntervals),
      minHpFrac,
      killsPerMin: killsAtEnd / survivedMin,
    };
  } finally {
    randomSpy.mockRestore();
    vi.useRealTimers();
  }
};

// ---- 条件ごとの分布集計(平均・SD・中央値・最小/最大) ----
const numericFields: (keyof RunSummary)[] = [
  'survivedSec', 'buildupFrac', 'peakFrac', 'relaxFrac', 'peakCount',
  'intensityMean', 'intensitySD', 'ceilingFrac', 'performanceMean', 'performanceSD',
  'spawnsPerMin', 'boardCountMean', 'boardCountMax', 'nearEnemyMean',
  'hitsPerMin', 'minHpFrac', 'killsPerMin',
];
// null許容フィールド(2回未満で未定義になりうる)は別枠で集計(non-nullぶんだけ)。
const nullableFields: (keyof RunSummary)[] = ['peakIntervalMeanSec', 'relaxDwellMeanSec', 'hitIntervalMedianSec'];

interface Dist { mean: number; sd: number; median: number; min: number; max: number; n: number }
const distOf = (xs: number[]): Dist => {
  if (xs.length === 0) return { mean: 0, sd: 0, median: 0, min: 0, max: 0, n: 0 };
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(Math.max(0, xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length));
  return { mean: m, sd, median: median(xs) ?? 0, min: Math.min(...xs), max: Math.max(...xs), n: xs.length };
};

// paired diff(同じseed同士の差)。SE=SD(diff)/sqrt(N)。|mean diff| < 2*SE なら「有意差なし」。
interface PairedDiff { meanDiff: number; sdDiff: number; se: number; sig: boolean; ratioToA: number | null }
const pairedDiff = (base: number[], other: number[]): PairedDiff => {
  const n = Math.min(base.length, other.length);
  const diffs: number[] = [];
  for (let i = 0; i < n; i++) diffs.push(other[i] - base[i]);
  const d = distOf(diffs);
  const se = n > 1 ? d.sd / Math.sqrt(n) : 0;
  const baseMean = distOf(base.slice(0, n)).mean;
  return {
    meanDiff: d.mean, sdDiff: d.sd, se,
    sig: Math.abs(d.mean) >= 2 * se && se > 0,
    ratioToA: Math.abs(baseMean) > 1e-9 ? (baseMean + d.mean) / baseMean : null,
  };
};

const fmt = (v: number, digits = 3): string => Number.isFinite(v) ? v.toFixed(digits) : 'n/a';

describe('AIディレクター計測バッチ(DIRECTOR_METRICS=1 の時だけ走る)', () => {
  it.runIf(typeof process !== 'undefined' && process?.env?.DIRECTOR_METRICS)(
    'A(無効)/B(relax)/C(all) を同一シード列でN本ずつ回し、指標をresearch/DIRECTOR_METRICS.mdへ出す',
    () => {
      const N = Number(process?.env?.DIRECTOR_METRICS_N ?? '30') || 30;
      console.log(`[director-metrics] N=${N} conditions=${CONDITIONS.map(c => c.id).join(',')} run_seconds=${RUN_SECONDS} class=${CLASS} persona=${PERSONA}`);

      const results: Record<Condition, RunSummary[]> = { A_off: [], B_relax: [], C_all: [] };
      for (let seed = 1; seed <= N; seed++) {
        for (const cond of CONDITIONS) {
          const r = runOne(seed, cond.directorApply);
          results[cond.id].push(r);
        }
        if (seed % 5 === 0 || seed === N) console.log(`[director-metrics] ...seed ${seed}/${N} done`);
      }

      // ---- Markdown組み立て ----
      const lines: string[] = [];
      lines.push('# AIディレクター 計測レポート(DIRECTOR_METRICS)');
      lines.push('');
      lines.push(`生成日: ${new Date().toISOString().slice(0, 10)} / N=${N} / 1ランの尺=ゲーム内${RUN_SECONDS}秒固定(死亡時は打ち切り) / class=${CLASS} persona=${PERSONA}`);
      lines.push('');
      lines.push('再現コマンド:');
      lines.push('```');
      lines.push(`DIRECTOR_METRICS=1 DIRECTOR_METRICS_N=${N} npx vitest run src/store/directorMetrics.test.ts`);
      lines.push('```');
      lines.push('');
      lines.push('条件: A=ディレクター無効(基準点) / B=?directorApply=relax相当 / C=?directorApply=all相当(relax+buildup)。');
      lines.push('シードは1..Nを固定し、A/B/C全条件で共有(対応のある比較=paired diff)。');
      lines.push('');

      const metricLabel: Partial<Record<keyof RunSummary, string>> = {
        survivedSec: '生存時間(秒)', buildupFrac: 'BUILD_UP滞在比率', peakFrac: 'PEAK滞在比率', relaxFrac: 'RELAX滞在比率',
        peakCount: 'PEAK回数', intensityMean: 'Intensity平均', intensitySD: 'Intensity SD', ceilingFrac: 'Intensity天井張り付き率(≥0.9)',
        performanceMean: 'Performance平均', performanceSD: 'Performance SD',
        spawnsPerMin: '湧き数/分', boardCountMean: '盤面敵数(平均)', boardCountMax: '盤面敵数(最大)',
        nearEnemyMean: '近接敵数(半径240px・平均)', hitsPerMin: '被弾回数/分', minHpFrac: 'HP最低値(割合)', killsPerMin: '撃破数/分',
      };

      lines.push('## 1. 条件ごとの分布(平均 / SD / 中央値 / 最小 / 最大, N=' + N + ')');
      lines.push('');
      lines.push('| 指標 | 条件 | 平均 | SD | 中央値 | 最小 | 最大 |');
      lines.push('|---|---|---|---|---|---|---|');
      for (const f of numericFields) {
        for (const cond of CONDITIONS) {
          const xs = results[cond.id].map(r => r[f] as number);
          const d = distOf(xs);
          lines.push(`| ${metricLabel[f] ?? f} | ${cond.id} | ${fmt(d.mean)} | ${fmt(d.sd)} | ${fmt(d.median)} | ${fmt(d.min)} | ${fmt(d.max)} |`);
        }
      }
      lines.push('');
      lines.push('null許容(サンプル不足になりうる)指標: PEAK間隔(秒)・RELAX平均滞在(秒)・被弾間隔中央値(秒)。');
      lines.push('');
      lines.push('| 指標 | 条件 | 平均 | SD | 中央値 | 最小 | 最大 | 有効n |');
      lines.push('|---|---|---|---|---|---|---|---|');
      const nullableLabel: Partial<Record<keyof RunSummary, string>> = {
        peakIntervalMeanSec: 'PEAK間隔(秒・緩急の周期)', relaxDwellMeanSec: 'RELAX平均滞在(秒)', hitIntervalMedianSec: '被弾間隔 中央値(秒)',
      };
      for (const f of nullableFields) {
        for (const cond of CONDITIONS) {
          const xs = results[cond.id].map(r => r[f] as number | null).filter((v): v is number => v !== null);
          const d = distOf(xs);
          lines.push(`| ${nullableLabel[f] ?? f} | ${cond.id} | ${fmt(d.mean)} | ${fmt(d.sd)} | ${fmt(d.median)} | ${fmt(d.min)} | ${fmt(d.max)} | ${xs.length}/${N} |`);
        }
      }
      lines.push('');

      lines.push('## 2. 死亡率');
      lines.push('');
      lines.push('| 条件 | 死亡数 | 死亡率 |');
      lines.push('|---|---|---|');
      for (const cond of CONDITIONS) {
        const died = results[cond.id].filter(r => r.died).length;
        lines.push(`| ${cond.id} | ${died}/${N} | ${fmt(died / N, 2)} |`);
      }
      lines.push('');

      lines.push('## 3. 条件間の差(対応のある比較・同一シード, N=' + N + ')');
      lines.push('');
      lines.push('SE=paired diffのSD/√N。|平均差|が2×SE未満なら「有意差なし」と明記(判定列)。A比倍率=(A平均+差)/A平均。');
      lines.push('');
      lines.push('| 指標 | 比較 | 平均差 | SE | A比倍率 | 判定 |');
      lines.push('|---|---|---|---|---|---|');
      const comparisons: [Condition, Condition, string][] = [['A_off', 'B_relax', 'B-A'], ['A_off', 'C_all', 'C-A'], ['B_relax', 'C_all', 'C-B']];
      for (const f of numericFields) {
        for (const [baseId, otherId, label] of comparisons) {
          const base = results[baseId].map(r => r[f] as number);
          const other = results[otherId].map(r => r[f] as number);
          const pd = pairedDiff(base, other);
          const verdict = pd.se === 0 ? '(SE計算不能)' : pd.sig ? '★有意差あり' : '有意差なし';
          lines.push(`| ${metricLabel[f] ?? f} | ${label} | ${fmt(pd.meanDiff)} | ${fmt(pd.se)} | ${pd.ratioToA !== null ? fmt(pd.ratioToA, 2) + '×' : 'n/a'} | ${verdict} |`);
        }
      }
      lines.push('');

      lines.push('## 4. 実行経路(実機useGameLoop.tsとの既知の差)');
      lines.push('');
      lines.push('- ヘッドレスsim(`src/utils/playtestDriver.ts` の `createPlaytestRefs`/`runPlaytestTick`)をそのまま再利用。');
      lines.push('  新しいゲームループは書いていない。');
      lines.push('- `stepDirector`(`src/utils/aiDirector.ts`)は`runDirectorSignalStep`(`directorTick.ts`)経由で毎tick');
      lines.push('  実機と同じ入力(hpFrac/damageTakenFrac/nearEnemies/killDelta/dangerBias)から計算している(信号の算出式は実機と完全に同一)。');
      lines.push('- RELAX/BUILDUPの**適用**(spawnEscへの反映)は本バッチのため`playtestDriver.ts`へ追加した');
      lines.push('  `opts.directorApply`(既定undefined=無効・既存の他の計測テストは無影響)で有効化した。');
      lines.push('  適用式は`useGameLoop.ts`と同じ: `spawnEsc = clamp01(buildEsc + buildupAdj.escBoost) * relaxAdj.escMult`');
      lines.push('  (`buildEsc`=`spawnEscalation`(難易度③・戦力連動escalation)をheadlessでも同じ式で計算)。');
      lines.push('- **実機と違う点(既知の簡略化)**:');
      lines.push('  1. 関所ライブ補正(`gateLiveCorrection`・難易度④)とDirectorRankのescBoost(`directorRank.ts`・難易度⑤)は');
      lines.push('     headlessで未配線のため`spawnEsc`に合算していない。実機はこの2つがベースを底上げすることがあるため、');
      lines.push('     本レポートの`spawnEsc`絶対値は実機より低めに出る可能性が高い。ただしRELAX/BUILDUPの**相対効果**');
      lines.push('     (escMultで0倍にする/escBoostを足す)自体は独立して機能するため、方向と大きさの評価は成立する。');
      lines.push('  2. RELAXの`intervalMult`/`capMult`(湧き間隔・湧き上限)は、現行ビルドでは`puzzleActiveNow`配下の');
      lines.push('     通常湧き(本方式=盤面構成パズル方式)には使われていない——`useGameLoop.ts`側でもこの2つは');
      lines.push('     `!puzzleActiveNow`(=台本上のボスフェーズ中だけ)が読む旧spawnerの変数で、`playtestDriver.ts`は');
      lines.push('     その旧spawnerを移植していない。**つまりRELAXの実効レバーは現状escMult(spawnEscのゼロ化)のみ**');
      lines.push('     であり、本レポートもその1本だけを測っている(下記§5参照・コードで確認済みの事実)。');
      lines.push('  3. ハンター/叫喚型ディレクター・紅き月・囲いイベントの一部は`playtestDriver.ts`側の簡略実装');
      lines.push('     (ゲート1/2+凶悪ハンターのみ接続。他は`playtestDriver.ts`冒頭コメントのとおり対象外)。');
      lines.push('  4. 「盤面敵数」は画面内(カメラ画角)ではなく、盤面上(オフスクリーンリサイクル済み範囲内)の総数。');
      lines.push('');

      const out = lines.join('\n') + '\n';
      const fs = require('fs');
      fs.mkdirSync('research', { recursive: true });
      fs.writeFileSync('research/DIRECTOR_METRICS.md', out);
      console.log('[director-metrics] wrote research/DIRECTOR_METRICS.md');
    },
    30 * 60 * 1000, // 30分(N=30×3条件=90ラン。目安は実測してから調整)
  );
});
