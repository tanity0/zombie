// 訓練(M0)のチュートリアルの**発火条件**。本文は `src/data/tutorials.ts` の台帳。
//
// **M0は「ずっとチュートリアルが出る」ステージ**(社長指示v0.25.2266)。
// M2の2件(phill/scout)が「端末で1度だけ」なのに合わせて既読で止めるようにしたのは**取り違え**で、
// v0.25.2264で入れた既読ゲートは撤回した。M0では**出撃ごとに1回**必ず出す。
//  - 「出撃ごとに1回」の記憶は store の `tutorialPopupShown`(resetGameでリセット)を使う。
//    端末記憶(zombie:tutorialsSeen)は**見ない**。
//  - ただし表示時に既読の記録自体は書く(資料室の「操作記録」に載せるため)。これは showTutorialOnce 側の仕事。

import type { TutorialId } from '../data/tutorials';

export interface M0TutorialGate {
  shownThisRun: boolean; // この出撃で既に出したか(store の tutorialPopupShown)
  popupOpen: boolean;    // 別のポップアップが出ている(重ねない)
  menuOpen: boolean;     // ショップ/強化メニュー等が開いている(裏で出さない)
  gameTimeMs: number;
}

// 出すまでの待ち(ms)。開幕の登場演出とぶつけないための間。
export const M0_MOVE_TUTORIAL_AT_MS = 1200;

export const shouldShowMoveTutorial = (gate: M0TutorialGate): boolean =>
  gate.gameTimeMs >= M0_MOVE_TUTORIAL_AT_MS &&
  !gate.shownThisRun && !gate.popupOpen && !gate.menuOpen;

// ---------------------------------------------------------------------------
// 教習ビート(TUTORIAL_STAGE.md「M0 チュートリアル進行案」・社長裁定v0.25.2286〜2291)
//
// M0は**左が透明壁の一本道で戻れない**ので、「xを通過したら発火」で順序が保証できる。
// 判定をここに純関数として置き、`useGameLoop` には**呼ぶだけ**を残す
// (CLAUDE.md 実装精度の規律4「配線ロジックは純関数に切り出してテスト」)。
//
// 区域の並び(`AREA_THRESHOLDS`)に乗せてある:
//   0〜1500 = 軍備   … 射撃・近接・カウンター・成長
//   1500     = 研究入場 … 区域の説明
//   3000     = デンジャー入場 … ハンター出現(既存の凶悪ハンターと同じ境界)
// ---------------------------------------------------------------------------

export type M0Beat = 'shoot' | 'melee' | 'counter' | 'levelup' | 'area' | 'hunter' | 'ammo';

/** ビートの定義。順序=この配列の順(必ず前のビートから先に出る)。 */
export interface M0BeatDef {
  id: M0Beat;
  tutorial: TutorialId;
  /** このx以上で発火(px・出撃地点からの距離)。レベル条件のビートは undefined。 */
  atX?: number;
  /** このレベル以上で発火。位置ではなく成長で決まるビート用。 */
  atLevel?: number;
  /** 付随イベント: 敵を1体だけ湧かせる(プレイヤーからの相対位置)。 */
  spawn?: { type: 'zombie' | 'skeleton'; dx: number; dy: number };
  /**
   * このxを越えたらもう出さない(見送る)。位置で決まらないビート(レベル等)が
   * **条件を満たさないまま後続を止め続ける**のを防ぐ番人。
   * 例: 敵を倒さずに走り抜けるとレベルが上がらない → `levelup` が永久に未発火になり、
   * これが後続を塞ぐと `area`/`hunter` が二度と出ない(=進行不能のチュートリアル)。
   */
  expireAfterX?: number;
}

// x位置は叩き台(TUTORIAL_STAGE.md)。区域境界(1500=研究 / 3000=デンジャー)だけは
// `AREA_THRESHOLDS` と一致していることに意味があるので勝手に動かさないこと。
export const M0_BEATS: readonly M0BeatDef[] = [
  // 1体だけ、遅い型を前方に置く。「近づけば勝手に撃つ」を落ち着いて見せる。
  { id: 'shoot', tutorial: 'm0-shoot', atX: 400, spawn: { type: 'zombie', dx: 420, dy: 0 } },
  // 密着してくる速い型。銃より近接が速い状況を作る。
  { id: 'melee', tutorial: 'm0-melee', atX: 800, spawn: { type: 'skeleton', dx: 150, dy: 0 } },
  // カウンターは「敵の攻撃を見てから合わせる」ので、melee で攻撃モーションを1度見た後に置く。
  { id: 'counter', tutorial: 'm0-counter', atX: 1200, spawn: { type: 'skeleton', dx: 260, dy: 0 } },
  // 上の3体を倒していれば結晶が溜まってレベルが上がる。位置ではなく成長で発火。
  { id: 'levelup', tutorial: 'm0-levelup', atLevel: 2, expireAfterX: 3000 },
  // 研究区域へ入った瞬間(社長指示v0.25.2288)。※踏破儀式は端末で初回1回きりなので**位置で判定する**。
  { id: 'area', tutorial: 'm0-area', atX: 1500 },
  // デンジャー入場=ハンター出現(社長指示v0.25.2287)。湧かせるのは useGameLoop 側(専用の配置)。
  { id: 'hunter', tutorial: 'm0-hunter', atX: 3000 },
  // 追われながら弾を拾う。ハンターの直後に置く(社長指示v0.25.2286「5で弾補充」)。
  { id: 'ammo', tutorial: 'm0-ammo', atX: 3160 },
];

export interface M0BeatGate {
  playerX: number;
  playerLevel: number;
  popupOpen: boolean;
  menuOpen: boolean;
  /** この出撃で既に出したビート。 */
  fired: ReadonlySet<M0Beat>;
}

/**
 * 今出すべきビートを1つ返す(無ければ null)。
 * **未発火のうち定義順で最も早い、条件を満たしたもの**を返す。ポップアップは表示中に
 * `popupOpen` で塞がるので、仮に複数が同時に条件を満たしても**定義順に1つずつ**出る。
 * `expireAfterX` を越えた未発火ビートは見送る(後続を塞がない)。
 */
export const nextM0Beat = (gate: M0BeatGate): M0BeatDef | null => {
  if (gate.popupOpen || gate.menuOpen) return null; // 重ねない・裏で出さない
  for (const beat of M0_BEATS) {
    if (gate.fired.has(beat.id)) continue;
    if (beat.expireAfterX !== undefined && gate.playerX >= beat.expireAfterX) continue; // 見送り
    const byX = beat.atX !== undefined && gate.playerX >= beat.atX;
    const byLevel = beat.atLevel !== undefined && gate.playerLevel >= beat.atLevel;
    if (byX || byLevel) return beat;
  }
  return null;
};
