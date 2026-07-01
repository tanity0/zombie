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
  // 危険敵の存在(0..1)。被弾していなくても“いる”だけで緊張する脅威の合成値。今はハンター出現/追跡のみ。
  // 後段で werewolf突進予告 / plant射線 / ghost毒卵密度 / screamer準備 も足す予定(=このbiasの最大値)。
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
