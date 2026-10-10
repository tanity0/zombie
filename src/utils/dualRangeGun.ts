// UNIQUE_WEAPONS.md §16-2「デュアルレンジピストル」(handgun-t2-dualrange): 対象までの距離で
// 近/遠の2セットの数値を入れ替える。ヒステリシス(近へ入る=120px以下/遠へ戻る=180px以上)は
// 境界で切り替えが震えないための純関数(CLAUDE.md「実装精度の規律」4: 配線ロジックは
// src/utils/ の純関数に切り出してテストする)。
//
// §17-8 C-1(監査の是正): 距離は fireWeapon の射程ゲートを通った「撃てる瞬間」にしか分からない
// (nearestEnemyDistance はクールダウン・リロード・弾倉のゲートを通った後にしか計算されない)。
// よってモード判定もその瞬間に置く。**この発射の cooldown ゲート自体は前回確定したモードの値を
// 使う**(1発ぶん遅れて反映されるが、機能上は問題ない=監査で確認済み)。

export type DualRangeMode = 'near' | 'far';

// UNIQUE_WEAPONS.md §16-2(社長仕様): 近へ入る/遠へ戻るの境界(px)。
export const DUAL_RANGE_NEAR_ENTER_PX = 120;
export const DUAL_RANGE_FAR_ENTER_PX = 180;

export interface DualRangeStats {
  damage: number;
  cooldown: number;
  projectileSpeed: number;
}

// UNIQUE_WEAPONS.md §16-1/§17-2: 近 14/cd260/540px、遠 28/cd700/700px
// (共通: count1 / magSize10 / reloadMs1100 / projectileSize8 は CATALOG 側の固定値)。
export const DUAL_RANGE_STATS: Record<DualRangeMode, DualRangeStats> = {
  near: { damage: 14, cooldown: 260, projectileSpeed: 540 },
  far: { damage: 28, cooldown: 700, projectileSpeed: 700 },
};

/**
 * 現在のモードと対象までの距離から次のモードを決める(ヒステリシス)。
 * 近↔遠の境界(120px〜180pxの間)では現在のモードを維持する=震えない。
 */
export const resolveDualRangeMode = (
  currentMode: DualRangeMode,
  distancePx: number,
): DualRangeMode => {
  if (currentMode === 'near') return distancePx >= DUAL_RANGE_FAR_ENTER_PX ? 'far' : 'near';
  return distancePx <= DUAL_RANGE_NEAR_ENTER_PX ? 'near' : 'far';
};
