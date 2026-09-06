// UNIQUE_WEAPONS.md §16-2/§16-5(バッチD「ロケットランチャー」glauncher-t1-rocket)。
// 溜め(500ms)→直進弾(追尾なし)→敵か壁に当たった時だけ爆発。何にも当たらなければ不発。
// 溜め中でも弾頭に敵が接触すればその場で爆発(=弾を「速度0のまま」その場に置くことで実現する。
// 通常の敵衝突判定(collisionUtils.checkProjectileEnemyCollisions)がそのまま拾うので、
// 「溜め中の当たり判定」を別途持たせるコードは不要=fireWeapon側の1フック(速度0化)だけで足りる)。
//
// ★溜め(500ms)は「別時間として足さない」——CATALOGのcooldown自体が溜め込みの長さ
// (=帯を測るサイクル式のcooldown項と同一)。ここに定数を分けて持つのは、fireWeaponが
// 「発射直後の弾を何msその場に留めるか」を読むためであり、CATALOGのcooldownと二重管理しない
// (ROCKET_CHARGE_MS は CATALOG の cooldown と同値であることをテストで固定する)。
export const ROCKET_CHARGE_MS = 500;

// 爆発範囲は既定グレネードt1(GRENADE_BLAST_RADIUS)に対する倍率(§16-1「既定比×1.2」)。
export const ROCKET_BLAST_RADIUS_MULT = 1.2;

/**
 * 1サイクル(溜め→着弾)の実効DPS(UNIQUE_WEAPONS.md §5-2)。
 * 溜めをcooldownへ畳んだ実装なので、汎用式(damage / (cooldown + 実効リロード))と同じ形になる
 * ——ここでは「溜めを二重に足さない」ことを明示するために専用の関数として置く。
 */
export const rocketCycleDps = (damage: number, cooldownMs: number, reloadMsRaw: number): number => {
  const effectiveReloadMs = Math.max(250, reloadMsRaw * 2);
  return (damage / (cooldownMs + effectiveReloadMs)) * 1000;
};
