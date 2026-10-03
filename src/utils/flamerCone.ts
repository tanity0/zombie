// UNIQUE_WEAPONS.md §16-2/§17-2(バッチC-1「火炎放射器」shotgun-t3-flamer)。
// 弾を撃たず前方の扇(セクター)に持続判定。判定は距離+角度(distToSegmentではなく角度テスト=
// 「扇は線ではない」・落としやすい点1)。当てた後の適用(倍率/除外/キル処理)は
// useGameLoop.tsのapplyBeamPulse(金環/アイレーザー/氷槍と共通)を通す——ここは「拾う」だけ。
// 純関数のみ=ヘッドレスでユニットテスト可能。壁判定(segmentBlocked)は呼び出し側の責務
// (aoeWalls/beamWallsと同じ既存の壁取得+segmentBlockedの組み合わせ・このモジュールは壁を知らない)。

export const FLAMER_RANGE_PX = 90;
export const FLAMER_CONE_RAD = 0.5;               // 扇の全角(rad)。半角は÷2
export const FLAMER_HALF_ANGLE_RAD = FLAMER_CONE_RAD / 2;
export const FLAMER_PULSE_MS = 100;
export const FLAMER_PULSE_DAMAGE = 5;
export const FLAMER_MAG_SIZE = 40;
export const FLAMER_RELOAD_MS_RAW = 1500; // CATALOGへ書く生値(§17-2と同じ×2規則で実効3000ms)

export const flamerEffectiveReloadMs = (reloadMsRaw = FLAMER_RELOAD_MS_RAW): number =>
  Math.max(250, reloadMsRaw * 2);

/**
 * 1サイクル(装填40発を100msごとに1発消費しきる→リロード)の実効DPS(§5-2)。
 * 40弾×100ms照射(1tick 5)+リロード。(40×5)÷(4000+3000)ms=28.57。
 */
export const flamerCycleDps = (
  pulseDamage = FLAMER_PULSE_DAMAGE, magSize = FLAMER_MAG_SIZE, reloadMsRaw = FLAMER_RELOAD_MS_RAW,
): number => {
  const totalDamage = pulseDamage * magSize;
  const fireMs = magSize * FLAMER_PULSE_MS;
  const cycleMs = fireMs + flamerEffectiveReloadMs(reloadMsRaw);
  return (totalDamage / cycleMs) * 1000;
};

export interface FanHittableEnemy { id: string; x: number; y: number; width: number; height: number }

/**
 * 前方の扇(セクター)に入る敵を拾う。距離=中心間 <= range + 敵の概算半径(max(w,h)/2)。
 * 角度=aim方向との差 <= halfAngleRad(atan2の差を[-π,π]へ正規化してから比較)。
 * 壁は見ない(呼び出し側がsegmentBlockedで個別に弾く=既存のaoeWalls方式と同型)。
 */
export const pickFanHits = <T extends FanHittableEnemy>(
  px: number, py: number, dirX: number, dirY: number,
  rangePx: number, halfAngleRad: number, enemies: readonly T[],
): T[] => {
  const aimAngle = Math.atan2(dirY, dirX);
  return enemies.filter(e => {
    const cx = e.x + e.width / 2;
    const cy = e.y + e.height / 2;
    const dx = cx - px, dy = cy - py;
    const dist = Math.hypot(dx, dy);
    const r = Math.max(e.width, e.height) / 2;
    if (dist > rangePx + r) return false;
    if (dist < 1e-6) return true; // ほぼ同位置=角度不定だが範囲内なので当たり扱い
    const angle = Math.atan2(dy, dx);
    let diff = angle - aimAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) <= halfAngleRad;
  });
};
