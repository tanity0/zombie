// ステージ2(研究所)のチュートリアル(社長指示v0.25.2251)。
// 2件:
//   1) PHILL銃を入手した時 = 狙いの合わせ方 + ヘッドショット2種(通常/吸い付き)
//   2) 初めて敵に近づいた時(**見つかる前**) = 索敵と遮蔽物
// 表示は既存の showTutorialPopup(ゲーム停止・OK1つ)を流用する。
//
// 社長決定(v0.25.2251):
//   - 索敵は「**初めて敵に近づいた時=見つかる前**」に出す(見つかってから教えない)。
//   - **1度だけ**(端末に記憶=localStorage)。2周目以降のM2では出さない。
//
// このファイルは純関数+localStorageのみ(renderer非依存・storeにもPixiにも依存しない)。
// 判定を useGameLoop に直書きしないための切り出し(CLAUDE.md 実装精度の規律4)。

export type LabTutorialId = 'phill' | 'scout';

const STORAGE_KEY: Record<LabTutorialId, string> = {
  phill: 'zombie:tut:lab-phill',
  scout: 'zombie:tut:lab-scout',
};

// 「初めて敵に近づいた」と見なす距離(px)。
// **敵の視界(LAB_VISION_RANGE=200)より必ず大きいこと**=この距離で出せば必ず「見つかる前」になる。
// 画面の半幅(約400前後)より小さいので、説明が出た時にその敵が画面に写っている。
export const LAB_TUTORIAL_APPROACH_PX = 360;

export const hasSeenLabTutorial = (id: LabTutorialId): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY[id]) === '1';
  } catch {
    return false; // localStorage不可(プライベートモード等)= 毎回出す方に倒す(出ない事故より軽い)
  }
};

export const markLabTutorialSeen = (id: LabTutorialId): void => {
  try {
    localStorage.setItem(STORAGE_KEY[id], '1');
  } catch {
    /* 保存できなくても表示自体は成立する(次のランでまた出るだけ) */
  }
};

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

// 本文。数値(200px/450px/1秒等)は書かない=今後の調整で文面が嘘にならないようにする。
export const LAB_TUTORIAL_TEXT: Record<LabTutorialId, { title: string; lines: string[] }> = {
  phill: {
    title: 'ＰＨＩＬＬ-銃',
    lines: [
      '狙いサークルは、スティックを倒した向き(マウスならカーソル位置)に出る。撃つのは指を離した瞬間。',
      '【通常】立ち止まって撃つ。サークルの向きへ弾が飛び、頭に当たればヘッドショット。',
      '【吸い付き】サークルが敵の頭に近づくと、自動で頭に吸い付く。この状態なら移動中でも撃てて、ヘッドショットが確定する。',
      '弾は貴重。頭を狙って一撃で仕留めろ。',
    ],
  },
  scout: {
    title: '索敵と遮蔽物',
    lines: [
      '敵は眠っている。薄い赤が敵の視界。この中に入って視線が通ると、起きて襲ってくる。',
      '壁や什器で視線を切れば、赤の中でも見つからない。遮蔽物の裏を伝って進め。',
      '見つかっても、視線を切って離れ続ければ、やがて諦めてまた眠る。',
    ],
  },
};
