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

export type M0Beat = 'shoot' | 'melee' | 'finish' | 'counter' | 'levelup' | 'area' | 'hunter' | 'ammo';

/** ビートの定義。順序=この配列の順(必ず前のビートから先に出る)。 */
export interface M0BeatDef {
  id: M0Beat;
  tutorial: TutorialId;
  /** このx以上で発火(px・出撃地点からの距離)。レベル条件のビートは undefined。 */
  atX?: number;
  /** このレベル以上で発火。位置ではなく成長で決まるビート用。 */
  atLevel?: number;
  /** 開幕の会話(グレッグ×2→ジュン×2)が流れ終わった直後に発火する。 */
  afterConvo?: boolean;
  /** 台本で出した敵を全部倒した直後に発火する(前のビートの終わり方が入口になる)。 */
  afterEnemyCleared?: boolean;
  /** 強制クリティカルが出た(=クリティカルが解禁された)直後に発火する。 */
  afterCritUnlocked?: boolean;
  /** 付随イベント: 敵を1体だけ湧かせる(プレイヤーからの相対位置)。 */
  spawn?: { type: 'zombie' | 'skeleton'; dx: number; dy: number };
  /** ポップアップの前に流す掛け声(左上の通信)。**説明より先に、状況の理由を言う**。 */
  callouts?: readonly { speaker: string; text: string }[];
  /** このビートで解禁する要素(社長指示v0.25.2293「解禁されるまで封印」)。 */
  unlock?: 'melee';
  /**
   * 前提ビート。これが出ていないと発火しない。
   * 「前のビートの終わり方が次の入口になる」台本(社長指示v0.25.2293)を成立させるための鍵で、
   * これが無いと **`afterEnemyCleared` は開幕(敵0体)で即成立して近接が射撃を追い越す**。
   * また、封印を解くビートより先に、それを使う教習が出るのも防ぐ。
   */
  requires?: M0Beat;
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
  // 開幕の会話が終わった**直後**に、グレッグの号令で始める(社長台本v0.25.2293)。
  // 位置では出さない=会話→戦闘が途切れない。弾は「ちょうど倒せてちょうど切れる」量に台本側で詰める
  // (useGameLoop 側で設定)。味方も撃つがダメージは0=演出。
  {
    id: 'shoot', tutorial: 'm0-shoot', afterConvo: true,
    spawn: { type: 'zombie', dx: 420, dy: 0 },
    callouts: [{ speaker: 'グレッグ', text: '変異体だ！構えろ！' }],
  },
  // **弾切れの状態から始まる**。前のビートの終わり方(弾がちょうど切れる)がそのまま入口になる。
  // ここで初めて近接を解禁する(それまでは振れない=社長指示v0.25.2293の封印)。
  {
    id: 'melee', tutorial: 'm0-melee', afterEnemyCleared: true, requires: 'shoot',
    spawn: { type: 'skeleton', dx: 150, dy: 0 },
    callouts: [
      { speaker: 'ジュン', text: '弾切れです！' },
      { speaker: 'グレッグ', text: 'お前しか近距離で戦えない！頼んだぞ！' },
    ],
    unlock: 'melee',
  },
  // 近接3発目の**強制クリティカルで敵が崩れた瞬間**に、フィニッシュを別枠で教える
  // (社長指示v0.25.2294「近接とフィニッシュのチュートリアルは切り分けて。2回に分けて」)。
  // 敵を出し直さない=目の前で崩れている相手にそのまま追撃させる。
  // 見送りx: 万一クリティカルが出ないまま先へ進んだ時に、後ろで浮いたまま残らないようにする。
  { id: 'finish', tutorial: 'm0-finish', afterCritUnlocked: true, requires: 'melee', expireAfterX: 1500 },
  // カウンターは「敵の攻撃を見てから合わせる」ので、melee で攻撃モーションを1度見た後に置く。
  // 近接が解禁されていないとカウンター(=近接を合わせる)は成立しないので、melee を前提にする。
  { id: 'counter', tutorial: 'm0-counter', atX: 1200, requires: 'melee', spawn: { type: 'skeleton', dx: 260, dy: 0 } },
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
  /** 開幕の会話(グレッグ×2→ジュン×2)が流れ終わったか。 */
  convoDone: boolean;
  /** 台本で出した敵が1体でも生きているか(生きている間は次のビートへ進めない)。 */
  scriptedEnemyAlive: boolean;
  /** クリティカルが解禁済みか(=近接3発目の強制クリティカルが出たか)。 */
  critUnlocked: boolean;
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
    if (beat.requires !== undefined && !gate.fired.has(beat.requires)) continue;         // 前提待ち
    const byX = beat.atX !== undefined && gate.playerX >= beat.atX;
    const byLevel = beat.atLevel !== undefined && gate.playerLevel >= beat.atLevel;
    const byConvo = beat.afterConvo === true && gate.convoDone;
    // 「前の台本の敵を片付けたら次」。倒しきるまでは次の説明を被せない。
    const byCleared = beat.afterEnemyCleared === true && !gate.scriptedEnemyAlive;
    const byCrit = beat.afterCritUnlocked === true && gate.critUnlocked;
    if (byX || byLevel || byConvo || byCleared || byCrit) return beat;
  }
  return null;
};
