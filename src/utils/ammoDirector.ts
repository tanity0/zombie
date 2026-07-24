// 弾薬AIディレクター(v0.25.2170・社長決定): キルドロップ基礎率を10%に絞り、
// 「全所持銃の弾備蓄の枯渇度 × 敵の多さ」で最大20%まで底上げする。
// その上に装備/パッシブ加算とフィニッシャー1.5倍(既存)が乗る。数値は叩き台=実機調整前提。
export const AMMO_DIR_MAX_PCT = 20;    // 底上げ後の上限%
export const AMMO_DIR_RATIO_FULL = 0.5;  // 備蓄率がこれ以上なら枯渇度0
export const AMMO_DIR_RATIO_EMPTY = 0.15; // これ以下で枯渇度1
export const AMMO_DIR_ENEMY_CALM = 8;   // 敵数これ以下で圧力0
export const AMMO_DIR_ENEMY_SWARM = 25; // これ以上で圧力1
export const AMMO_DIR_PRESSURE_FLOOR = 0.35; // 枯渇していれば敵が少なくても効く最低係数
export interface AmmoDirectorInput { families: { reserve: number; max: number }[]; enemyCount: number }
export const ammoDirectorRate = (basePct: number, input: AmmoDirectorInput): number => {
  const totMax = input.families.reduce((a, f) => a + f.max, 0);
  if (totMax <= 0) return basePct;
  const ratio = input.families.reduce((a, f) => a + f.reserve, 0) / totMax;
  const s = Math.max(0, Math.min(1, (AMMO_DIR_RATIO_FULL - ratio) / (AMMO_DIR_RATIO_FULL - AMMO_DIR_RATIO_EMPTY)));
  const p = Math.max(0, Math.min(1, (input.enemyCount - AMMO_DIR_ENEMY_CALM) / (AMMO_DIR_ENEMY_SWARM - AMMO_DIR_ENEMY_CALM)));
  return basePct + (AMMO_DIR_MAX_PCT - basePct) * s * (AMMO_DIR_PRESSURE_FLOOR + (1 - AMMO_DIR_PRESSURE_FLOOR) * p);
};
