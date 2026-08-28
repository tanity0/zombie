// 死神(深奥リスク)システム。仕様の全文は repo ルートの reaper_spec.md + PACING_PUZZLE.md §14-4。
// マップは無限。スタート/商人(原点付近)から遠いほど死神が画面を横切り、深奥に長居すると完全出現して追跡する。
// 横切り=無害な演出(pixiScene 単独スプライト)、追跡=本物の reaper 敵(被弾・接触・討伐可)。
//
// PACING_PUZZLE.md §14-4(社長指示2026-08-28「新たな死神」): 出現システム(深奥リスク+15分時間抽選+
// 撃破escalation)はこのファイルの下半分(REAPER_CONFIG・変更なし)のまま維持。本体・技「使者」の
// 絵・挙動(REAPER2_CONFIG)だけを新死神へ置き換える。

const url = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
// テスト用: ?reapertest=1 で常に「深奥(extreme)」扱い。原点に居てもフェーズが進む(プレビュー確認用)。
export const REAPER_TEST = url?.get('reapertest') === '1';
// PACING_PUZZLE.md §14-4-5: ?rp2=1 で出撃直後にリスク最大=完全出現(テスト専用・既定OFF)。
// ※M0(訓練)は死なない仕様のためテスト場所にしない(社長注記)。
export const REAPER2_TEST = url?.get('rp2') === '1';

// §14-4-5のツマミ読み取りヘルパ。判定側の値は生URLSearchParamsで読む
// (tsNum/tsBoolはpixiScene専用=描画値。中12「判定側はevNum/生URLSearchParams」の作法)。
const numParam = (key: string, def: number): number => {
  const v = url?.get(key);
  const n = v !== null && v !== undefined && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
};

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
  homeRadiusPx: 900,          // プレイヤーがスタート(原点)から この距離内へ戻ると死神は去る
  // --- 時間による出現(社長指示) ---
  // 距離(深奥)とは別系統。15分経過後、20秒ごとに抽選。確率=10%+(15分以降の経過分×10%)で最大100%。
  // 抽選ごとに「気配演出」(横切り)を出し、当選で完全出現(深奥と同じ追跡 reaper)。
  timeStartMs: 15 * 60 * 1000,  // 15分から開始(社長指示: 7→10→15分)
  timeRollIntervalMs: 20000,    // 20秒に1回抽選
  timeBaseChance: 0.10,         // 15分時点 10%
  timeChancePerMin: 0.10,       // 以降1分ごとに +10%
} as const;

/**
 * PACING_PUZZLE.md §14-4(新たな死神v1)。本体の移動・被弾・技「使者」のパラメータ。
 * **数値は全て叩き台**(§14-4-6)=実機で社長が`?rp2*=`で調整する。妥当性への指摘は不要。
 */
export const REAPER2_CONFIG = {
  // --- 本体(§14-4-2) ---
  orbitDistPx: numParam('rp2dist', 70),        // 縁距離(px)。これを切ったら旋回(オービット)開始。
  orbitSpeedMult: numParam('rp2orbit', 0.667), // 旋回中の速度倍率(本体・直進速度に対して)。
  bodySpeedMult: numParam('rp2spd', 1.0),      // 本体の直進速度倍率(素の実効速度に対して)。
  bodyHealth: numParam('rp2bhp', 66666),       // 本体のHP(社長裁定2026-08-28=倒せる・現行の6000から変更)。
  bodyPosture: numParam('rp2post', 120),       // 本体の体勢値(既存ボス体勢システムの型・量は叩き台)。
  bodyContactDamage: numParam('rp2cdmg', 77),  // 本体の接触ダメージ(現行値=即死ではない)。
  // --- 技「使者」(§14-4-3) ---
  servantSpeedMult: numParam('rp2mspd', 1.2),  // 使者の速度倍率(プレイヤー「現在の」実効速度に対して・毎フレーム参照)。
  servantHealth: numParam('rp2hp', 2000),      // 使者の耐久(1体)。
  servantKnockback: numParam('rp2kb', 60),     // 使者のノックバック量(px相当・KNOCKBACK_SPEED系との整合はgameStore側)。
  servantAddIntervalMs: numParam('rp2int', 10) * 1000, // 使者が増える間隔。
  servantMax: Math.max(0, Math.round(numParam('rp2max', 5))), // 使者の最大数(全体で共有の枠・叩き台)。
  // 使者の接触ダメージ=999固定(社長裁定2026-08-28「既存の仕様で、ダメ999で」=専用即死ゲートではなく
  // 既存damagePlayer経路への999。ツマミ表(§14-4-5)に無い=既存reaperの999と同格の「表に出る」固定値)。
  servantContactDamage: 999,
} as const;

// 深度(px)→ 横切り間隔(ms)。
export const reaperPassIntervalMs = (depthPx: number): number => {
  if (depthPx >= REAPER_CONFIG.spawnRiskDepthPx) return REAPER_CONFIG.passIntervalDeepMs;
  if (depthPx >= REAPER_CONFIG.frequentDepthPx) return REAPER_CONFIG.passIntervalFrequentMs;
  return REAPER_CONFIG.passIntervalWarningMs;
};
