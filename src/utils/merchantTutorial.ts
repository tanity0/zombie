/**
 * 「武器商人」チュートリアル(tutorials.ts の 'merchant')の発火条件。
 * スタート地点の武器商人(store.weaponMerchant)のサークルに初めて入った時に、端末で1度だけ出す(既読は loadSeenForGate)。
 * 拠点の商人(確保した拠点の武器庫)では出さない=このゲートは weaponMerchant のサークルしか見ない。
 * 取引の開き方(サークルの滞在 → updateMerchantDwell)には触らない: 出している間はゲームが止まって滞在が積まれず、
 * 閉じた後もサークルに立っていれば、いつもどおり滞在が満ちて取引が開く。
 */
export interface MerchantTutorialGate {
  /** プレイヤーの中心がスタート地点の武器商人のサークルの中か。 */
  inMerchantCircle: boolean;
  /** 商人がまだ居ない(ウェルカムが終わる前)。 */
  merchantHidden: boolean;
  /** ボス戦中(+復帰猶予)の施設ロック=取引が開かない間。 */
  facilitiesLocked: boolean;
  /** 端末で既読か(loadSeenForGate 由来)。 */
  seen: boolean;
  /** 訓練(M0)ステージか。 */
  trainingStage: boolean;
  popupOpen: boolean;
  menuOpen: boolean;
  dialogueActive: boolean;
  /** アテンション(大型の登場演出等)の最中か。 */
  attention: boolean;
}

export const shouldShowMerchantTutorial = (g: MerchantTutorialGate): boolean =>
  g.inMerchantCircle && !g.merchantHidden && !g.facilitiesLocked && !g.seen && !g.trainingStage &&
  !g.popupOpen && !g.menuOpen && !g.dialogueActive && !g.attention;

/** プレイヤーの中心が商人のサークル(中心 x,y・半径 radius)の中か。縁ちょうどは中(updateMerchantDwell と同じ <=)。半径0=商人の居ない出撃は外。 */
export const isInsideMerchantCircle = (
  pcx: number, pcy: number, merchant: { x: number; y: number; radius: number },
): boolean => {
  if (!(merchant.radius > 0)) return false; // 商人の居ない出撃(半径0)
  const dx = merchant.x - pcx, dy = merchant.y - pcy;
  return dx * dx + dy * dy <= merchant.radius * merchant.radius;
};
