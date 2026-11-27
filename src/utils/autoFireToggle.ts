// 装備中の銃の枠をタップ=銃の装備を外す(社長指示2026-11-27「装備中の銃アイコンタップでオート射撃off」
// 「いわゆる装備を外してる状態になればいいので、新しい見た目はいれないよ」)。
// - いま装備中の銃をタップ → 装備を外す(どの銃の枠も「装備中でない」既存の見た目・プレイヤーの銃は撃たない)。
// - 外している間にどれかの銃をタップ → その銃を装備(今どおりの持ち替え)。
// - 装備中に別の銃をタップ → 今どおり持ち替え。
// 止めるのはプレイヤー自身の銃だけ(守護霊・タレット・サブウェポンは止めない)。
// 実装は「activeWeaponId を空にする」ではなく store の1欄(autoFireOff)にしてある:
// getActiveGun は id が見つからないと先頭の銃へ落ちる(weaponUtils)ので、id を空にすると
// 至る所で「先頭の銃を装備中」と読まれてしまうため。
// store/描画から読まれる純関数(PixiJS・React を import しない)。

/** プレイヤーの銃が撃てる(=装備している)か。autoFireOff=true の間は外している。 */
export const playerAutoFireAllowed = (s: { readonly autoFireOff?: boolean }): boolean => !s.autoFireOff;

export interface GunSlotTapResult {
  /** 装備する銃(今の銃のまま外す時は null)。 */
  readonly equip: string | null;
  /** タップ後に装備を外しているか。 */
  readonly autoFireOff: boolean;
}

/** 銃の枠をタップ(または PC でその枠のキー)した結果。 */
export const gunSlotTap = (
  activeId: string | null | undefined,
  tappedId: string,
  autoFireOff: boolean,
): GunSlotTapResult => {
  if (!autoFireOff && activeId && tappedId === activeId) return { equip: null, autoFireOff: true };
  return { equip: tappedId, autoFireOff: false };
};
