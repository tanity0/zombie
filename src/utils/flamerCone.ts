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
export const FLAMER_PULSE_DAMAGE = 7; // ★社長「はい」2026-10-28(「意外と弱い」→推薦の5→7)
// ★社長指示2026-10-28「弾切れが早すぎる」「タマ持ちもよくする」: 40(4秒)→ 80(8秒照射)。
export const FLAMER_MAG_SIZE = 80;
// ★社長指示2026-10-28「延焼効果も付ける」(旧=武器自体に燃焼なし・UNIQUE_WEAPONS.md §16-2 の指定): 炎に触れた敵が燃える。
// 刻みは既存の延焼(tickBurningEnemies・500msごと)。燃えている間にもう一度炙られると時間が延びる(強さは高い方)。
export const FLAMER_BURN_MS = 2500;
export const FLAMER_BURN_TICK_DAMAGE = 3; // 500msごと=毎秒6

/**
 * 炎に触れた相手(敵/プレイヤー)の燃焼の付け直し。燃えていれば時間を延ばし、強さは高い方
 * (UNIQUE_WEAPONS.md §17-6b: プレイヤー・守護霊・幻影の炎が同じこの1本を使う)。
 */
export const flamerBurnPatch = (
  cur: { burnUntil?: number; burnDpsTick?: number }, now: number, byGhost = false, tickDamage = FLAMER_BURN_TICK_DAMAGE,
): { burnUntil: number; burnDpsTick: number; burnByGhost: boolean | undefined } => ({
  burnUntil: Math.max(cur.burnUntil ?? 0, now + FLAMER_BURN_MS),
  burnDpsTick: Math.max(cur.burnDpsTick ?? 0, tickDamage),
  // 刻みのヘイト・撃破の帰属=直近に炙った側(守護霊の炎なら守護霊)。
  burnByGhost: byGhost || undefined,
});

// UNIQUE_WEAPONS.md §17-6b P2: 幻影の火炎放射器=溜め(紫の扇の予告・向き固定)→噴射(炎12回・向き固定)の一続き。
export const PHANTOM_FLAMER_WINDUP_MS = 450;
export const PHANTOM_FLAMER_PULSES = 12; // ×FLAMER_PULSE_MS=1.2秒の噴射

/** 一続きの k 回目(0始まり)の炎の予定時刻。0回目=溜め明け=紫の予告が流れ切る瞬間。 */
export const phantomFlamerPulseAt = (windupAt: number, k: number): number =>
  windupAt + PHANTOM_FLAMER_WINDUP_MS + k * FLAMER_PULSE_MS;

/** 一続きの今の段階。'windup'=予告中(当たらない) / 'spray'=次の炎を待っている(当たり得る=紫の縁を出す)。 */
export const phantomFlamerPhase = (windupAt: number | undefined, now: number): 'none' | 'windup' | 'spray' =>
  windupAt === undefined ? 'none' : now < phantomFlamerPulseAt(windupAt, 0) ? 'windup' : 'spray';

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
