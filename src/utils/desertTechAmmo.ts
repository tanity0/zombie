// UNIQUE_WEAPONS.md §16-2/§17-8 C-3「デザートテック」(rifle-t1-deserttech・バッチB): 専用弾(rifle)
// が尽きたら他カテゴリの弾を代用する。優先順位は rifle → handgun → shotgun → glauncher
// (phillは対象外=研究所専用銃の専用弾)。純関数のみ=ヘッドレスでユニットテスト可能。
//
// ★読み側の棚卸し(受け入れ条件6): HUDの残弾表示・弾切れ時の自動切替(autoSwitchIfDry)・
// 救急鞄の払い出し・商人の弾購入・リロードの3経路(startReload/tickReload・クイックマガジン・
// オーバークロック覚醒)。この5箇所が「今どの弾種を実際に消費するか」を、この1本の resolver から
// 引くことで揃える(weaponUtils.ts の weaponAmmoTypeFor が Player を読んでこの純関数へ渡す薄いラッパ)。

import type { AmmoType } from '../types/game';

export const DESERTTECH_WEAPON_KEY = 'rifle-t1-deserttech';

// rifle(専用)→handgun→shotgun→glauncherの順(§16-2)。
export const DESERTTECH_AMMO_PRIORITY: readonly AmmoType[] = ['rifle', 'handgun', 'shotgun', 'glauncher'];

export interface DesertTechAmmoPools {
  rifle: number;
  handgun: number;
  shotgun: number;
  glauncher: number;
}

/**
 * 現在このトリガー(リロード/発射)で実際に読み書きすべき弾種。優先順で最初に残弾>0のカテゴリ。
 * 全て0なら専用弾(rifle)を返す(=空撃ち/表示の既定。以後のreserve<=0判定で自然に「リロード不可」になる)。
 */
export const resolveDesertTechAmmoType = (pools: DesertTechAmmoPools): AmmoType => {
  for (const t of DESERTTECH_AMMO_PRIORITY) {
    const v = pools[t as keyof DesertTechAmmoPools];
    if (v > 0) return t;
  }
  return 'rifle';
};

/** 4カテゴリ全て0(=どの弾でも撃てない)か。autoSwitchIfDry等の「本当に空か」の判定に使う。 */
export const isDesertTechDry = (pools: DesertTechAmmoPools): boolean =>
  DESERTTECH_AMMO_PRIORITY.every(t => pools[t as keyof DesertTechAmmoPools] <= 0);
