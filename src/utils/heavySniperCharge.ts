// UNIQUE_WEAPONS.md §16-2「大型狙撃銃」(rifle-t2-heavysniper・バッチB): 静止時間の蓄積。
// 止まっている間 0→3秒で最大まで伸び、射程 250→400・連射間隔 ×1.0→×0.6。移動した瞬間に0へリセット。
// 帯は蓄積0の素の値で測る(§16-1)。speedRamp.ts(連続移動の蓄積・切り返しリセット)と対になる
// 「連続静止の蓄積」。純関数のみ=ヘッドレスでユニットテスト可能。
//
// ★状態(蓄積ms)はPlayer側に置く(Weapon側ではない)。静止/移動はプレイヤーの移動状態そのものであり、
// 特定の武器の所持に依存しないため(marksmanMovingSinceと同じ理由=movePlayerが毎tick更新)。
// UNIQUE_WEAPONS.md §17-11(B案件・積む): 射程/連射のper-frame書き換え自体は将来の改善対象として
// 記録済み(このバッチでは対応しない=既に指摘済みの既知の設計)。

export const HEAVY_SNIPER_CHARGE_FULL_MS = 3000;
export const HEAVY_SNIPER_RANGE_MIN_PX = 250;
export const HEAVY_SNIPER_RANGE_MAX_PX = 400;
// CATALOGのcooldown(rifle-t2-heavysniper=1300ms)と一致させること。per-frameで再計算するたびに
// 前フレームの結果から計算すると誤差が積み重なるため、常にこの基準値から導出する。
export const HEAVY_SNIPER_BASE_COOLDOWN_MS = 1300;
export const HEAVY_SNIPER_COOLDOWN_MULT_AT_ZERO = 1.0;
export const HEAVY_SNIPER_COOLDOWN_MULT_AT_FULL = 0.6;

/** 1tickぶん静止蓄積msを進める。移動していれば即0へリセット(移動した瞬間に0)。 */
export const stepHeavySniperStillMs = (stillMs: number, dtMs: number, moving: boolean): number =>
  moving ? 0 : Math.min(HEAVY_SNIPER_CHARGE_FULL_MS, Math.max(0, stillMs) + Math.max(0, dtMs));

/** 蓄積msを0..1の割合へ。 */
export const heavySniperChargeFrac = (stillMs: number): number =>
  Math.max(0, Math.min(1, stillMs / HEAVY_SNIPER_CHARGE_FULL_MS));

/** 割合→射程(px)。0=250(=カテゴリ既定と同じ)、1=400。 */
export const heavySniperRangePx = (frac: number): number =>
  HEAVY_SNIPER_RANGE_MIN_PX + (HEAVY_SNIPER_RANGE_MAX_PX - HEAVY_SNIPER_RANGE_MIN_PX) * frac;

/** 割合→連射間隔(ms)。0=基準値そのまま(×1.0)、1=×0.6。 */
export const heavySniperCooldownMs = (frac: number): number =>
  HEAVY_SNIPER_BASE_COOLDOWN_MS
  * (HEAVY_SNIPER_COOLDOWN_MULT_AT_ZERO
    - (HEAVY_SNIPER_COOLDOWN_MULT_AT_ZERO - HEAVY_SNIPER_COOLDOWN_MULT_AT_FULL) * frac);
