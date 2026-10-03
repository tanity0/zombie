// ステージ2(研究所)のチュートリアルの**発火条件**(社長指示v0.25.2251)。
// 2件:
//   1) PHILL銃を入手した時 = 狙いの合わせ方 + ヘッドショット2種(通常/吸い付き)
//   2) 初めて敵に近づいた時(**見つかる前**) = 索敵と遮蔽物
// 表示は既存の showTutorialPopup(ゲーム停止・OK1つ)を流用する。
//
// 社長決定(v0.25.2251):
//   - 索敵は「**初めて敵に近づいた時=見つかる前**」に出す(見つかってから教えない)。
//   - **1度だけ**(端末に記憶)。2周目以降のM2では出さない。
// v0.25.2252: **本文は `src/data/tutorials.ts` に移動**(資料室と共用=同じ文章を2箇所で持たない)。
//   既読の記憶も `src/utils/tutorialArchive.ts` に一本化した。ここに残すのは発火条件だけ。
//
// このファイルは純関数のみ(renderer非依存・storeにもPixiにも依存しない)。判定を useGameLoop に
// 直書きしないための切り出し(CLAUDE.md 実装精度の規律4)。

// 「初めて敵に近づいた」と見なす距離(px)。
// **敵の視界(LAB_VISION_RANGE=200)より必ず大きいこと**=この距離で出せば必ず「見つかる前」になる。
// 画面の半幅(約400前後)より小さいので、説明が出た時にその敵が画面に写っている。
export const LAB_TUTORIAL_APPROACH_PX = 360;

export interface LabTutorialGate {
  seen: boolean;         // この端末で表示済みか
  popupOpen: boolean;    // 別のポップアップが出ている(重ねない)
  menuOpen: boolean;     // ショップ/強化メニュー等が開いている(裏で出さない)
}

// 1件目: PHILL銃を持っていて、メニューを閉じた状態になったら出す。
// (M2でのPHILL銃の入手経路は武器商人の無料配布 `buy-phill` の1つだけ。購入直後は商人画面が
//  開いているので、閉じるまで待ってから出す=UIを重ねない。)
export const shouldShowPhillTutorial = (
  gate: LabTutorialGate & { hasPhillGun: boolean },
): boolean => gate.hasPhillGun && !gate.seen && !gate.popupOpen && !gate.menuOpen;

// 2件目: **休眠中の**敵に LAB_TUTORIAL_APPROACH_PX まで近づいたら出す。
// 休眠中に限るのが肝: 起床済み(=既に見つかっている)なら「見つかる前に教える」が成立しないので出さない。
export const shouldShowScoutTutorial = (
  gate: LabTutorialGate & { nearestDormantDist: number | null },
): boolean =>
  gate.nearestDormantDist !== null &&
  gate.nearestDormantDist <= LAB_TUTORIAL_APPROACH_PX &&
  !gate.seen && !gate.popupOpen && !gate.menuOpen;
