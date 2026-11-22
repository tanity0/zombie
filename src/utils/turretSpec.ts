// 自動タレット(turret)の消滅時の小爆発の寸法(判定=useGameLoop と予告の描画=pixiScene の両方が読む)。
// research/TELEGRAPH_FIXES.md N12: もとは useGameLoop の非公開定数。予告の円と判定の半径を1本の出どころにするためここへ移した。
export const TURRET_EXPLOSION_RADIUS = 64; // 消滅時の小爆発・範囲。TODO: 実機調整(既存爆発演出を流用)

/** N12 予告の溜め: 「置いた物が爆ぜる」家族の既存の溜め(センサー地雷の信管)と同じ2秒(見え方の値=叩き台)。 */
export { SENSOR_MINE_FUSE_MS as PHANTOM_TURRET_TELEGRAPH_MS } from './sensorMine';

/**
 * N12(社長裁定2「幻影のビルドで決める」): 幻影のタレットの消滅爆発の半径。
 * `explosionMult` は**置いた幻影**のエクスプローダー倍率(`skillExplosionMult(combatActorPlayer(turret.ownerGhostId))`)。
 * 幻影を引けない時(倒れた後など)は null=幻影の既定のビルド=倍率1(プレイヤーには戻さない=地雷の `?? player` とはここだけ違う)。
 * ※倍率の関数は gameStore にあり、ここから import すると循環するので、呼び出し側が引いた倍率を渡す。
 */
export const phantomTurretBlastRadius = (explosionMult: number | null): number =>
  TURRET_EXPLOSION_RADIUS * (explosionMult ?? 1);
