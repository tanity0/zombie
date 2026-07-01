// AIディレクター(L4D2型)の“信号”を算出する純関数モジュール。レンダラ非依存・副作用なし=ヘッドレスでテスト可能。
//
// 設計方針(社長＋Codex合意):
//  - Intensity   = 「いまどれだけ苦しいか」。上がるのは速く・下がるのは遅い(山を作って必ず緩める)。
//  - Performance = 「いまどれだけ余裕があるか」。ゆっくり動く。②(累積PP)とは別の“直近の勢い”。
//  - この2つを絶対に混ぜない: Intensity は「上げない/Relaxへ」だけに使い、Performance は「BuildUpを強める」だけに使う。
//    ("被弾が多いから難易度を上げる" は禁止。"無傷で捌き続けているから次の山を強める" は良い。)
//  - DirectorState = BUILD_UP / PEAK / RELAX の3状態。PEAK の後は必ず RELAX へ落とす。
//
// ★このモジュールは「算出するだけ」。湧き等ゲーム挙動には一切影響させない(ステップA=読むだけ)。
//   Date.now()/Math.random() は使わない(dtSec でタイマーを積む=resume安全・テスト再現可能)。

export type DirectorMacro = 'buildup' | 'peak' | 'relax';

// 1フレームの入力(useGameLoop が集めて渡す)。すべて“この瞬間”の観測値。
export interface DirectorInputs {
  hpFrac: number;          // 現在HP / 最大HP (0..1)
  damageTakenFrac: number; // このステップで受けたダメージ / 最大HP (>0 でスパイク)
  nearEnemies: number;     // 近接圏内(接触危険レンジ)にいる敵数 ← 画面内総数ではなく“近い敵”
  killDelta: number;       // このステップの撃破数
  // 危険敵の存在(0..1)。被弾していなくても“いる”だけで緊張する脅威の合成値(useGameLoop側で複数ソースの
  // 最大値を算出して渡す=合算はしない)。ハンター出現/追跡・werewolf突進予告/実行・pumpkinジャンプ予告/滞空・
  // screamer発動準備・plant射線内・ghost(抱卵型)の毒卵密度。
  dangerBias: number;
}

export interface DirectorState {
  intensity: number;      // 0..1
  performance: number;    // 0..1
  macro: DirectorMacro;
  macroMs: number;        // 現マクロ状態の経過(ms)
  peakHeldMs: number;     // PEAK を維持している時間(ms)
  // 内部積算(信号算出用の状態)。表示にも使える。
  sinceDamageMs: number;  // 最後に被弾してからの経過(ms)
  killRateEma: number;    // 撃破レート(体/秒)の指数移動平均
  // デバッグ可視化用に直近入力をエコー(なぜ Intensity が高いか=near/danger を画面で見る)。
  nearEnemies: number;
  dangerBias: number;
}

// ---- チューニング定数(すべて私案。デバッグ表示を見ながら詰める) ----
// Intensity
const NEAR_ENEMY_FULL = 8;     // この数の近接敵で swarm 成分が最大(1.0)
const INT_HP_W = 0.7;          // HP危険(=1-hp)の重み
const INT_SWARM_W = 0.6;       // 近接敵の重み
const INT_DANGER_W = 0.5;      // 危険敵の存在(ハンター等)の重み。追跡中(bias=1)で目標を+0.5=無傷でも山寄りに
const INT_HP_EXP = 1.3;        // 低HPほど非線形に効かせる
const INT_TAU_UP = 0.35;       // 上げの時定数(秒)=速い
const INT_TAU_DOWN = 4.0;      // 下げの時定数(秒)=遅い(山を維持→必ず緩める設計)
const INT_DMG_SPIKE = 2.5;     // 被弾スパイク係数(最大HPの10%被弾で +0.25 相当)
// Performance
const CALM_FULL_MS = 20000;    // 無被弾がこの時間続くと calm 成分が最大(直近20秒ノーダメージ)
const KILL_EMA_TAU = 4.0;      // 撃破レートEMAの時定数(秒)
const KILL_FULL = 2.0;         // この撃破レート(体/秒)で kill 成分が最大
const PERF_HP_W = 0.4;         // HP余裕
const PERF_CALM_W = 0.35;      // 無被弾継続
const PERF_KILL_W = 0.35;      // 撃破の勢い
const PERF_TAU = 3.0;          // Performance の追従時定数(秒)=ゆっくり両方向
// DirectorState 遷移(Intensity駆動＋タイマー)
const PEAK_ENTER = 0.7;        // BUILD_UP→PEAK に入る Intensity
const PEAK_EXIT = 0.45;        // PEAK 中に Intensity がこれを割ったら自然に山が引けた→RELAX
const PEAK_HOLD_MS = 4000;     // PEAK を維持する最大時間(超えたら必ず RELAX)
const RELAX_UNTIL = 0.25;      // RELAX を抜けてよい Intensity 上限
const RELAX_MIN_MS = 8000;     // RELAX の最低滞在(回復の余白を必ず作る)

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const createDirectorState = (): DirectorState => ({
  intensity: 0,
  performance: 0.5,
  macro: 'buildup',
  macroMs: 0,
  peakHeldMs: 0,
  sinceDamageMs: CALM_FULL_MS, // 開始時は「しばらく無被弾」扱い
  killRateEma: 0,
  nearEnemies: 0,
  dangerBias: 0,
});

// 1ステップ進める純関数。prev を変更せず新しい state を返す。
export const stepDirector = (prev: DirectorState, input: DirectorInputs, dtSec: number): DirectorState => {
  const dt = Math.max(0, Math.min(0.1, dtSec)); // 1フレームぶんにクランプ(タブ復帰等の巨大dt対策)
  const dtMs = dt * 1000;

  // ---- Intensity ----
  const hpDanger = Math.pow(clamp01(1 - input.hpFrac), INT_HP_EXP);
  const swarm = clamp01(input.nearEnemies / NEAR_ENEMY_FULL);
  const danger = clamp01(input.dangerBias);
  const intTarget = clamp01(INT_HP_W * hpDanger + INT_SWARM_W * swarm + INT_DANGER_W * danger);
  const intTau = intTarget > prev.intensity ? INT_TAU_UP : INT_TAU_DOWN;
  let intensity = prev.intensity + (intTarget - prev.intensity) * (1 - Math.exp(-dt / intTau));
  if (input.damageTakenFrac > 0) {
    // 被弾スパイク(即時加算→以降は遅い下げでゆっくり減衰=L4D2の山の作り方)。
    intensity = Math.max(intensity, intensity + input.damageTakenFrac * INT_DMG_SPIKE);
  }
  intensity = clamp01(intensity);

  // ---- Performance(Intensityとは独立ソース) ----
  const sinceDamageMs = input.damageTakenFrac > 0 ? 0 : prev.sinceDamageMs + dtMs;
  const killRate = dt > 0 ? input.killDelta / dt : 0;
  const killRateEma = prev.killRateEma + (killRate - prev.killRateEma) * (1 - Math.exp(-dt / KILL_EMA_TAU));
  const hpSlack = clamp01(input.hpFrac);
  const calm = clamp01(sinceDamageMs / CALM_FULL_MS);
  const killMomentum = clamp01(killRateEma / KILL_FULL);
  const perfTarget = clamp01(PERF_HP_W * hpSlack + PERF_CALM_W * calm + PERF_KILL_W * killMomentum);
  const performance = clamp01(prev.performance + (perfTarget - prev.performance) * (1 - Math.exp(-dt / PERF_TAU)));

  // ---- DirectorState(BUILD_UP / PEAK / RELAX) ----
  let macro = prev.macro;
  let macroMs = prev.macroMs + dtMs;
  let peakHeldMs = prev.peakHeldMs;
  const enter = (m: DirectorMacro) => { macro = m; macroMs = 0; };

  if (macro === 'buildup') {
    peakHeldMs = 0;
    if (intensity >= PEAK_ENTER) enter('peak');
  } else if (macro === 'peak') {
    peakHeldMs += dtMs;
    // PEAK は「山を短時間維持」→ 時間切れ or 自然に引けたら必ず RELAX へ。
    if (peakHeldMs >= PEAK_HOLD_MS || intensity < PEAK_EXIT) { enter('relax'); peakHeldMs = 0; }
  } else { // relax
    peakHeldMs = 0;
    // 回復の余白を必ず確保(最低滞在)＋緊張が十分下がってから BUILD_UP へ戻す。
    if (macroMs >= RELAX_MIN_MS && intensity <= RELAX_UNTIL) enter('buildup');
  }

  return { intensity, performance, macro, macroMs, peakHeldMs, sinceDamageMs, killRateEma, nearEnemies: input.nearEnemies, dangerBias: danger };
};

// ---- ラン全体の要約(リザルトの難易度スコア/タイムライン用・純関数) ----
export interface RunSampleLite { t: number; intensity: number; performance: number; macro: DirectorMacro; }
export interface RunSummary {
  score: number;          // 難易度スコア(0..100)=“どれだけしんどい体験だったか”
  avgIntensity: number;
  maxIntensity: number;
  peakCount: number;      // PEAK に入った回数(山の数)
  peakSeconds: number;    // PEAK 滞在の合計秒
  avgPerformance: number; // 平均の余裕(=上手さの目安)
  durationSec: number;
  sampleCount: number;
  // 「RELAXが少ない/短い」を体感でなく数字で見られるように、BUILD_UP/RELAX も同じ形で内訳を出す。
  buildupSeconds: number;
  relaxSeconds: number;
  relaxCount: number;     // RELAX に入った回数(=谷の数。理想はPEAKの数とだいたい一致)
}

export const summarizeRun = (samples: RunSampleLite[]): RunSummary => {
  const empty: RunSummary = {
    score: 0, avgIntensity: 0, maxIntensity: 0, peakCount: 0, peakSeconds: 0, avgPerformance: 0,
    durationSec: 0, sampleCount: 0, buildupSeconds: 0, relaxSeconds: 0, relaxCount: 0,
  };
  if (samples.length === 0) return empty;
  let sumI = 0, maxI = 0, sumP = 0;
  let peakSeconds = 0, peakCount = 0;
  let buildupSeconds = 0;
  let relaxSeconds = 0, relaxCount = 0;
  let prevMacro: DirectorMacro | null = null;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    sumI += s.intensity; sumP += s.performance;
    if (s.intensity > maxI) maxI = s.intensity;
    const dt = i > 0 ? Math.max(0, s.t - samples[i - 1].t) : 0;
    if (s.macro === 'peak') {
      if (prevMacro !== 'peak') peakCount++;
      peakSeconds += dt;
    } else if (s.macro === 'relax') {
      if (prevMacro !== 'relax') relaxCount++;
      relaxSeconds += dt;
    } else {
      buildupSeconds += dt;
    }
    prevMacro = s.macro;
  }
  const n = samples.length;
  const avgIntensity = sumI / n;
  const avgPerformance = sumP / n;
  const durationSec = Math.max(0, samples[n - 1].t - samples[0].t);
  const peakFrac = durationSec > 0 ? clamp01(peakSeconds / durationSec) : 0;
  // 体験のしんどさ = 平均の緊張 + PEAKに居た割合 + 最大の緊張、の合成(私案・チューニング可)。
  const score = Math.round(100 * clamp01(0.55 * avgIntensity + 0.25 * peakFrac + 0.20 * maxI));
  return {
    score, avgIntensity, maxIntensity: maxI, peakCount, peakSeconds, avgPerformance, durationSec, sampleCount: n,
    buildupSeconds, relaxSeconds, relaxCount,
  };
};

// ---- ステップB: RELAX中だけ湧きを緩める(社長合意の最初の実接続・事故最小) ----
// Intensity は「Relaxへ寄せる」だけに使う、のルールをここで具体化する: macro==='relax' の間だけ、
// 新規湧きの「escalation(強さ/種類の上乗せ)」「湧き間隔」「湧き上限」に効かせる。
// ★既存の敵を強制的に間引く(カリング上限)ことはしない=画面から急に消えて見える演出は避ける
//   (呼び出し側は「湧き上限/湧き間隔/escalation」にだけ掛ける。カリング上限は不変)。
export interface RelaxSpawnAdjust {
  escMult: number;      // 難易度③④(強さ/種類の上乗せ)に掛ける倍率。RELAX中は0=上乗せなし。
  intervalMult: number; // 湧き間隔(getEnemySpawnInterval等)に掛ける倍率。RELAX中は>1=遅く。
  capMult: number;      // 湧き上限(normalSpawnCap)に掛ける倍率。RELAX中は<1=少なく。
}
export const RELAX_ESC_MULT = 0;          // RELAX中は escalation を完全に止める(危険敵を足さない)
export const RELAX_INTERVAL_MULT = 1.35;  // 湧き間隔を35%伸ばす(気持ち緩める・私案)
export const RELAX_CAP_MULT = 0.85;       // 湧き上限を15%下げる(私案)

export const relaxSpawnAdjust = (macro: DirectorMacro): RelaxSpawnAdjust =>
  macro === 'relax'
    ? { escMult: RELAX_ESC_MULT, intervalMult: RELAX_INTERVAL_MULT, capMult: RELAX_CAP_MULT }
    : { escMult: 1, intervalMult: 1, capMult: 1 };

// ---- ステップC: Performance高でBuildUpを強める(社長合意・Bより慎重に=レバーを1本だけにする) ----
// ルール厳守: Performance は「BuildUpを強める」だけに使う(Intensity/被弾側とは絶対に混ぜない)。
// 効かせる先は escalation(③④=強さ/種類の上乗せ)の**上乗せ量のみ**。湧き間隔/湧き上限には触れない
// (RELAXは複数レバーで安全側に強く効かせる“ブレーキ”、こちらは単一レバーで慎重に効かせる“アクセルの微調整”)。
// ★スコア/経験値/レベル速度には一切触れない(社長指示: 触ってはいけないシステム)。
export interface BuildupSpawnAdjust {
  escBoost: number; // spawnEsc(0..1)に加算する上乗せ量。BUILD_UP以外は0。
}
export const BUILDUP_ESC_BOOST_MAX = 0.25; // Performance=1(満タン)の時に加算する最大量(私案・控えめ)

export const buildupSpawnAdjust = (macro: DirectorMacro, performance: number): BuildupSpawnAdjust =>
  macro === 'buildup' ? { escBoost: clamp01(performance) * BUILDUP_ESC_BOOST_MAX } : { escBoost: 0 };
