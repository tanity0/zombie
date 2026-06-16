// 死神(深奥リスク)システム v1。仕様の全文は repo ルートの reaper_spec.md。
// マップは無限。スタート/商人(原点付近)から遠いほど死神が画面を横切り、深奥に長居すると完全出現して追跡する。
// 横切り=無害な演出(pixiScene 単独スプライト)、追跡=本物の reaper 敵(被弾・接触・討伐可)。

const url = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
// テスト用: ?reapertest=1 で常に「深奥(extreme)」扱い。原点に居てもフェーズが進む(プレビュー確認用)。
export const REAPER_TEST = url?.get('reapertest') === '1';

export const REAPER_CONFIG = {
  // 原点(スタート/商人付近)からの距離(px)でフェーズ判定。商人~360px・城~900-1300px の外側で警告開始。
  // ※仕様は「商人から何秒ぶん離れたか」基準だが、v1は実装しやすいピクセル距離で近似(調整可)。
  warningDepthPx: 1200,    // ここから横切り警告
  frequentDepthPx: 2200,   // 横切り頻発
  spawnRiskDepthPx: 3200,  // リスク蓄積(完全出現へ)
  extremeDepthPx: 4400,    // リスク急増
  // 横切り間隔(ms)。深いほど頻発。
  passIntervalWarningMs: 9000,
  passIntervalFrequentMs: 5000,
  passIntervalDeepMs: 3000,
  crossDurationMs: 1300,   // 1回の横切りに要する時間
  // 内部リスク(深奥滞在で増加・深奥外で減少)。v1は「距離」と「滞在時間」だけ。
  riskMax: 100,
  riskGainPerSecDeep: 14,     // spawnRisk 深度で /秒
  riskGainPerSecExtreme: 26,  // extreme 深度で /秒
  riskDecayPerSec: 18,        // 深奥外へ戻ると /秒 減少
  spawnRiskThreshold: 100,    // これで完全出現
  // 完全出現(追跡)
  spawnDistFromPlayer: 620,   // プレイヤーから少し離して出す(=即接触させない猶予)
  contactDamage: 9999,        // 接触ダメージ(ほぼ即死)
  moveSpeedMultiplier: 1.2,   // 追跡の最終速度 = プレイヤー現在移動速度 × 1.2
  chaseStartMult: 0.5,        // 出現直後の速度倍率(プレイヤーの約半分)
  chaseRampMs: 10000,         // 0.5倍 → 1.2倍 へフェードインで加速する時間(最初の10秒)
  chaserHealth: 6000,         // 高いが有限(極まれば討伐可能)
  canBeKilled: true,
} as const;

export type ReaperPhase = 'none' | 'warning_pass' | 'frequent_pass' | 'spawned' | 'chasing';

// 追跡速度 = プレイヤー現在移動速度 × 1.2。currentPlayerMoveSpeed は成長/強化を反映した通常速度
// (ダッシュ・ノックバック・強制移動は含めない=呼び出し側で player.speed を渡す)。
export const getReaperMoveSpeed = (currentPlayerMoveSpeed: number): number =>
  currentPlayerMoveSpeed * REAPER_CONFIG.moveSpeedMultiplier;

// 出現からの経過(ms)で倍率を 0.5 → 1.2 へフェードイン(smoothstep)。慣性は updateEnemies 側で別途かかる。
export const getReaperRampedSpeed = (currentPlayerMoveSpeed: number, elapsedMs: number): number => {
  const p = Math.max(0, Math.min(1, elapsedMs / REAPER_CONFIG.chaseRampMs));
  const eased = p * p * (3 - 2 * p);
  const mult = REAPER_CONFIG.chaseStartMult + (REAPER_CONFIG.moveSpeedMultiplier - REAPER_CONFIG.chaseStartMult) * eased;
  return currentPlayerMoveSpeed * mult;
};

// 深度(px)→ 横切り間隔(ms)。
export const reaperPassIntervalMs = (depthPx: number): number => {
  if (depthPx >= REAPER_CONFIG.spawnRiskDepthPx) return REAPER_CONFIG.passIntervalDeepMs;
  if (depthPx >= REAPER_CONFIG.frequentDepthPx) return REAPER_CONFIG.passIntervalFrequentMs;
  return REAPER_CONFIG.passIntervalWarningMs;
};
