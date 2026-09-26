// 世界の距離スケール(社長裁定2026-09-14「はい」= 進軍NPCの速度 48→73px/s(×1.52)に合わせて、原点からの距離で決まる
// 世界の構造を丸ごと ×1.5 に広げる。区域の境界(AREA_THRESHOLDS)・拠点(BASE_SITE_RADIUS)・警察署/武器庫/病院(区域から導出)・
// 裏ボスの巣(BOSS_LAIR)・城ボス戦の移動制限(CASTLE_FIGHT_MAX_DIST)・裏ボス出現距離・死神の深度・ボットの判定・結果画面の断面図。
// **訓練ステージ(M0)だけ据え置き**(台本が 1500/3000 の境界に載っているため・enemyUtils.setAreaDistanceScale で切る)。
// 位置関係(何がどの区域にあるか)は変えない=全部同じ倍率。値はこの1箇所だけ(実機で絞る叩き台)。
export const WORLD_DIST_SCALE = 1.5;
/** 原点からの距離(px)を世界スケールで伸ばす(整数に丸める)。 */
export const worldDist = (basePx: number): number => Math.round(basePx * WORLD_DIST_SCALE);
