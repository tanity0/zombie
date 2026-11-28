// ★格闘中のスケボーの乗り方(社長指示2026-11-28「2回目を押しながら移動したら、じゃない?そんな動作ないし格闘に。」)。
// 格闘以外: 今までどおり「短いタップ → すぐもう一度押す」=押した瞬間に乗る。
// 格闘中だけ: 2回目を押した瞬間には乗らず(=構える)、**2回目を押したまま動かした**時に乗る。
//   - フリック(素早く払って離す)・ステップ(切り返して離す)とは「押したまま一定時間離さない+払いの最中ではない」で分ける。
//   - 抉り打ちの長押し(押したまま動かさない)とは「動いたか(移動の入力)」で分ける。
// 判定は純関数。呼び手はタッチ(VirtualJoystick)と PC/パッドの指(pcPress)。

/** 2度押しの間隔(1回目の離し→2回目の押下)。タッチ(VirtualJoystick)と PC(pcPress の PC_SKATER_DOUBLETAP_MS)が共有する。 */
export const SKATER_MOUNT_DOUBLETAP_MS = 300;

/**
 * 格闘中に乗るまでに2回目を押し続ける最短の時間(ms)。「タップ」とみなす最長の押下(SKATER_TAP_MAX_MS=220)と同じ=
 * タップ(通常攻撃の連打)の押下では乗らない。フリックは離す直前 120ms(KATANA_FLICK_WINDOW_MS)しか見ないので、
 * 素早く払って離すフリックの押下はほぼこの時間に届かない。
 */
export const BRAWLER_SKATER_HOLD_MS = 220;
/** タッチ: 2回目の押下点からの指のずれの下限(px)。「タップ」とみなす最大のずれ(SKATER_TAP_MAX_DRAG=24)と同じ=タップの揺れでは乗らない。 */
export const BRAWLER_SKATER_MOVE_PX = 24;
/**
 * タッチ: 「払っている最中ではない」を見る窓(ms)と距離(px)。直近 120ms に 20px 以上動いていたら、まだフリック/ステップの払いの
 * 最中かもしれないので乗らずに待つ(指が落ち着いたら乗る)。値はフリックの判定(KATANA_FLICK_WINDOW_MS=120・KATANA_FLICK_MIN_DIST=20)と同じ=
 * 「いま離したらフリックになる」押下では乗らない(フリックはこの窓で 20px 以上の払いを要る)。
 */
export const BRAWLER_SKATER_SETTLE_MS = 120;
export const BRAWLER_SKATER_SETTLE_PX = 20;

export type SkaterPressResult = 'mount' | 'arm' | 'none';

/**
 * 主ボタン(タッチの指・PC の指)を押した瞬間の2度押しの判定。
 * 'mount'=今すぐ乗る(格闘以外=今までどおり)/'arm'=格闘中の2度押し=押したまま動かしたら乗る/'none'=乗らない。
 */
export const skaterPressResult = (o: {
  lastWasTap: boolean; sinceLastUpMs: number; retaliationOpen: boolean; brawler: boolean;
}): SkaterPressResult => {
  if (!o.lastWasTap || o.sinceLastUpMs > SKATER_MOUNT_DOUBLETAP_MS || o.retaliationOpen) return 'none';
  return o.brawler ? 'arm' : 'mount';
};

export interface TouchSample { x: number; y: number; t: number }

/**
 * タッチ・格闘中の2度押しの後: いま乗るか。samples=押下からの指の位置(古い順・最初が押下点でなくてもよい)・origin=2回目の押下点・
 * downAt=2回目を押した時刻・now=いま(samples と同じ時計)。
 * 乗る=①押し続けて BRAWLER_SKATER_HOLD_MS 以上 ②押下点から BRAWLER_SKATER_MOVE_PX 以上ずれている(=動かした)
 *       ③直近 BRAWLER_SKATER_SETTLE_MS に BRAWLER_SKATER_SETTLE_PX 未満しか動いていない(=払いの最中ではない)。
 */
export const shouldMountBrawlerSkaterTouch = (
  samples: readonly TouchSample[], origin: { x: number; y: number }, downAt: number, now: number,
): boolean => {
  if (now - downAt < BRAWLER_SKATER_HOLD_MS) return false;
  if (samples.length === 0) return false;
  const last = samples[samples.length - 1];
  if (Math.hypot(last.x - origin.x, last.y - origin.y) < BRAWLER_SKATER_MOVE_PX) return false;
  // 窓の始まりの時点で指が居た所=その時刻以前で一番新しい点(無ければ一番古い点=動きを大きめに見積もる=乗るのを待つ側)。
  let ref = samples[0];
  for (const s of samples) {
    if (s.t <= now - BRAWLER_SKATER_SETTLE_MS) ref = s; else break;
  }
  return Math.hypot(last.x - ref.x, last.y - ref.y) < BRAWLER_SKATER_SETTLE_PX;
};

/**
 * PC(マウス左・Space/J)とパッド(A)・格闘中の2度押しの後: いま乗るか。PC のフリックは別のボタン(右クリック/K/パッドB)なので
 * 払いと混ざらない。押し続けて BRAWLER_SKATER_HOLD_MS 以上 + 移動の入力(移動キー・スティック)がある時に乗る。
 * 移動キーを押しながらの通常攻撃の連打(タップ)は押下が短いので乗らない。
 */
export const shouldMountBrawlerSkaterPc = (downAt: number, now: number, moveInput: boolean): boolean =>
  moveInput && now - downAt >= BRAWLER_SKATER_HOLD_MS;
