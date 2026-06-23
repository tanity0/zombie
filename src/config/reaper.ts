// 死神(深奥リスク)システム v1。仕様の全文は repo ルートの reaper_spec.md。
// マップは無限。スタート/商人(原点付近)から遠いほど死神が画面を横切り、深奥に長居すると完全出現して追跡する。
// 横切り=無害な演出(pixiScene 単独スプライト)、追跡=本物の reaper 敵(被弾・接触・討伐可)。

const url = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
// テスト用: ?reapertest=1 で常に「深奥(extreme)」扱い。原点に居てもフェーズが進む(プレビュー確認用)。
export const REAPER_TEST = url?.get('reapertest') === '1';

export const REAPER_CONFIG = {
  // 原点(スタート/商人付近)からの距離(px)でフェーズ判定。深層域(7500px〜)に入ってしばらく進むと警告開始。
  // ※仕様は「商人から何秒ぶん離れたか」基準だが、v1は実装しやすいピクセル距離で近似(調整可)。
  // 死神が出現する領域を 8600px 開始へ(社長指示)。深層域より奥でのみ死神リスクが立ち上がる。
  warningDepthPx: 8600,    // ここから横切り警告(深層域の奥)
  frequentDepthPx: 11600,  // 横切り頻発(+3000)
  spawnRiskDepthPx: 14600, // リスク蓄積=完全出現へ(+3000)
  extremeDepthPx: 18200,   // リスク急増(+3600)
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
  // 進行方向へ出すが、必ず画面外から出す(社長指示)。実距離は画面サイズから算出(下記 spawnMarginPx)。
  // spawnDistFromPlayer は下限(小画面でも最低この距離は離す)。
  spawnDistFromPlayer: 780,   // 進行方向の画面外から出す距離の下限
  spawnMarginPx: 140,         // 画面の最遠角からさらに外へ出す余白(必ず画面外を保証)
  contactDamage: 77,          // 接触ダメージ(社長指示=77)
  chaseSpeedMult: 0.9,        // 追跡速度 = プレイヤー現在移動速度 × 0.9(遅いが下記ワープで回り込む)
  warpIntervalMs: 4000,       // 回り込みワープの間隔
  warpFadeMs: 500,            // ワープ時の消える/出る フェード時間(片側)。フェードアウト→テレポート→フェードイン。
  warpDistPx: 520,            // ワープ後にプレイヤーから取る距離(上下左右いずれかへ・多少ランダム)
  homeRadiusPx: 900,          // プレイヤーがスタート(原点)から この距離内へ戻ると死神は去る
  chaserHealth: 6000,         // 高いが有限(極まれば討伐可能)
  canBeKilled: true,
  // --- 時間による出現(社長指示) ---
  // 距離(深奥)とは別系統。10分経過後、20秒ごとに抽選。確率=10%+(10分以降の経過分×10%)で最大100%。
  // 抽選ごとに「気配演出」(横切り)を出し、当選で完全出現(深奥と同じ追跡 reaper)。
  timeStartMs: 10 * 60 * 1000,  // 10分から開始(社長指示で 7→10分)
  timeRollIntervalMs: 20000,    // 20秒に1回抽選
  timeBaseChance: 0.10,         // 10分時点 10%
  timeChancePerMin: 0.10,       // 以降1分ごとに +10%
} as const;

// 追跡速度 = プレイヤー現在移動速度 × 1.2。currentPlayerMoveSpeed は成長/強化を反映した通常速度
// (ダッシュ・ノックバック・強制移動は含めない=呼び出し側で player.speed を渡す)。
// 追跡速度 = プレイヤー現在移動速度 × 0.9(成長/強化反映・ダッシュ等は除外=呼び出し側で player.speed)。慣性は updateEnemies 側で別途かかる。
export const getReaperChaseSpeed = (currentPlayerMoveSpeed: number): number =>
  currentPlayerMoveSpeed * REAPER_CONFIG.chaseSpeedMult;

// 深度(px)→ 横切り間隔(ms)。
export const reaperPassIntervalMs = (depthPx: number): number => {
  if (depthPx >= REAPER_CONFIG.spawnRiskDepthPx) return REAPER_CONFIG.passIntervalDeepMs;
  if (depthPx >= REAPER_CONFIG.frequentDepthPx) return REAPER_CONFIG.passIntervalFrequentMs;
  return REAPER_CONFIG.passIntervalWarningMs;
};
