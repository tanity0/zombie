// ★レバーガードで受け切った直後は、被弾の演出(被弾音・赤いフラッシュ・赤い粒)を出さない
// (research/BRAWLER.md §12-1c・社長裁定2026-11-11「ガードは はい」=ガード成立時は被弾の演出を出さず、ガードの絵と音だけにする)。
// 被弾の演出は damagePlayer の呼び手(接触・弾・爆風・幻影・床…)が約20か所で別々に出している=1か所ずつ止めると必ず取りこぼす。
// だから「受け切った時刻」をここに1つ持ち、出口(audioManager.playSfx / store の spawnFlash・spawnBurst)が読んで止める。
// 依存なし(store・audio のどちらからも import できる)。時刻は壁時計(Date.now)。
/** 受け切った後、被弾の演出を止める長さ(ms)。呼び手は damagePlayer の直後(同じフレーム)に出す。体力の減りを見て出す赤いフラッシュは次のフレーム。 */
export const LEVER_GUARD_HURT_MUTE_MS = 150;
let fullGuardAt = -1e9;
/** レバーガードで受け切った(押し・怯みも置き換えた=「半減だけ」の技は含めない)。 */
export const noteLeverGuardFull = (nowMs: number): void => { fullGuardAt = nowMs; };
/** ガードではない被弾が入った(その被弾の演出は出す)・新しい出撃。 */
export const clearLeverGuardFull = (): void => { fullGuardAt = -1e9; };
/** いま被弾の演出を止めるか。 */
export const leverGuardHurtMuted = (nowMs: number): boolean => nowMs - fullGuardAt >= 0 && nowMs - fullGuardAt < LEVER_GUARD_HURT_MUTE_MS;
/** 被弾の赤いフラッシュの色か(呼び手が使う2色: rgba(239,68,68,…) / rgba(220,38,38,…))。 */
export const isPlayerHurtFlashColor = (color: string): boolean =>
  /^rgba\(\s*(239\s*,\s*68\s*,\s*68|220\s*,\s*38\s*,\s*38)\s*,/.test(color);
/** 被弾の赤い粒の色か(呼び手が使う2色)。 */
export const isPlayerHurtBurstColor = (color: string): boolean => color === '#dc2626' || color === '#ef4444';
/** 赤い粒をプレイヤーの体の近くに出しているか(敵の血と区別する距離・px)。 */
export const LEVER_GUARD_BURST_NEAR_PX = 44;
