// ジャンクウェポン(junk-weapon)サブウェポン: 近接攻撃と同時にスイング方向へ撃つ散弾銃(5発・CDなし)。
// 弾薬はスクラップ(straps): 1スクラップ消費=3ダメージとして、1発あたりの消費=Lv1:1/Lv2:2/Lv3:3
// (=1発のダメージ 3/6/9・5発フルの消費 5/10/15)。発射可否と消費量の判定を純関数に閉じ込める
// (CLAUDE.md「実装精度の規律」4)。発射の配線は gameStore.triggerCounter、弾の生成は
// weaponUtils.buildJunkWeaponPellets(ショットガンT1相当)。仕様の正は PACING_PUZZLE.md §6.7(バッチM30)。

// --- 調整用定数(§6.7 確定値) ---
export const JUNK_WEAPON_PELLETS = 5;                                        // 同時発射数(社長指定)
export const JUNK_WEAPON_SCRAP_PER_PELLET_BY_LEVEL: readonly number[] = [0, 1, 2, 3]; // index=level(1..3)。1発あたりの消費
export const JUNK_WEAPON_DAMAGE_PER_SCRAP = 3;                               // 1スクラップ=3ダメージ(社長指定)

export interface JunkShotResult {
  fire: boolean;        // 発射するか(スクラップ0のみ不発)
  cost: number;         // 消費スクラップ = min(フルコスト, 所持全部)(社長裁定v0.25.1693)
  pelletDamage: number; // 1発のダメージ(Lv固定=3/6/9。不足時も減らさない)
}

// 発射判定(副作用なし)。社長裁定v0.25.1693:
// 「スクラップ≥1なら常にフルセット5発を発射し、消費=min(フルコスト, 所持スクラップ全部)。
//   ダメージはLv固定のまま。スクラップ0のみ不発(弾切れ)。」
export const computeJunkShot = (level: number, straps: number): JunkShotResult => {
  const lv = Math.max(1, Math.min(3, level));
  if (straps < 1) return { fire: false, cost: 0, pelletDamage: 0 };
  const perPellet = JUNK_WEAPON_SCRAP_PER_PELLET_BY_LEVEL[lv];
  const fullCost = perPellet * JUNK_WEAPON_PELLETS;
  return {
    fire: true,
    cost: Math.min(fullCost, straps),
    pelletDamage: perPellet * JUNK_WEAPON_DAMAGE_PER_SCRAP,
  };
};
