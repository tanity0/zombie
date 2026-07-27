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

export type M0Beat = 'shoot' | 'melee' | 'crit' | 'finish' | 'counter' | 'levelup' | 'area' | 'hunter' | 'ammo';

/** 教習1本あたりに倒させる数(社長指示v0.25.2300「3体ずつくらい」)。1体ずつ順番に出す。 */
export const M0_PRACTICE_COUNT = 3;

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
  /**
   * **説明だけを後回しにする**(敵の配置・演習の開始は関門に着いた時点で行う)。
   * クリティカルの教習は「まず演出を見せてから説明」(社長指摘v0.25.2307)だが、説明の発火条件を
   * 「クリが出たら」にすると**敵が湧く前にクリ待ちになって永久に始まらない**(卵が先か鶏が先か)。
   * → ビート自体は関門で始めて敵を出し、**説明だけ**を最初のクリの後(+`delayMs`)へずらす。
   */
  popupAfterCrit?: boolean;
  /**
   * 付随イベント: 敵を出す。**`count` 体を一気にではなく1体ずつ**出す(社長指示v0.25.2300
   * 「それぞれのチュートリアルで3体ずつくらい倒させて練習させてあげる。一気に出さずに順番に」)。
   * 倒すたびに次が出る。全部倒し切るまで次のビートへは進まない。
   */
  spawn?: {
    type: 'zombie' | 'skeleton' | 'plant'; dx: number; dy: number; count?: number;
    /** 近接何発で落ちる体力にするか(未指定=素の体力)。教習ごとに「何発目で何が起きるか」を作る。 */
    meleeHits?: number;
  };
  /**
   * クリティカル演習(社長指示v0.25.2314「一個ずつ丁寧に終わらせてから次に行って」)。
   * true の間は**近接3発ごとに必ずクリティカル**が出る。これが無いと、クリティカルは
   * 「最初の1回だけ」になり、クリ/キルの教習を**それぞれ練習させられない**。
   */
  critDrill?: boolean;
  /** ポップアップの前に流す掛け声(左上の通信)。**説明より先に、状況の理由を言う**。 */
  callouts?: readonly { speaker: string; text: string }[];
  /** このビートで解禁する要素(社長指示v0.25.2293「解禁されるまで封印」)。 */
  unlock?: 'melee';
  /**
   * このビートを行う場所(px)。ここに**歩いて到達するまで発火しない**うえ、
   * **未発火の間はここより先へ進めない**(透明壁)。社長指示v0.25.2297
   * 「一体倒した後、間髪入れずに次に行くのを一拍置きたい/その前までしか移動できないダンジョン」。
   * 条件(敵を倒した等)を満たしても、**次の場所まで歩く**という一拍が必ず挟まる。
   */
  gateX?: number;
  /**
   * 条件を満たしてから**この時間だけ待って**から出す(ms)。
   * 区域の銘打ち(`WallInscription`・約4秒)のような**先に見せたい演出**があるビート用。
   * 待たずにポップアップを出すと、ポップアップがゲームを止める一方で銘打ちは**実時間の
   * `setTimeout` で進む**ため、読んでいる間に演出が終わって消えてしまう(社長報告v0.25.2297
   * 「エリアタイトル表示が一瞬すぎて見えない」)。
   */
  delayMs?: number;
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
//
// 関門(gateX)の間隔について(社長報告v0.25.2301「最初の移動チュートリアルの移動できる範囲が狭すぎる」):
// **最初の関門は「開幕の会話が流れ切るまで歩ける距離」**が要る。近すぎると、会話を聞いている途中で
// 壁に当たって足踏みすることになり、動ける箱が狭く感じる。→ 300→**800**(左端-100からの実移動900px)。
// 以降の関門は「少し歩いたら次」で足りる。**5つの教習(射撃/近接/クリ/キル/カウンター)を
// それぞれ別の場所に分ける**(社長指示v0.25.2314「畳み掛けすぎ。一個ずつ丁寧に終わらせてから次に」)
// ため 800/1000/1150/1300/1450 に配置。**全て区域境界(1500)より手前**=区域の説明より先に
// 戦闘教習を終わらせる。※戦闘中は壁が外れる(v0.25.2305)ので、間隔の狭さは可動域に影響しない。
export const M0_BEATS: readonly M0BeatDef[] = [
  // 開幕の会話が終わった**直後**に、グレッグの号令で始める(社長台本v0.25.2293)。
  // 位置では出さない=会話→戦闘が途切れない。弾は「ちょうど倒せてちょうど切れる」量に台本側で詰める
  // (useGameLoop 側で設定)。味方も撃つがダメージは0=演出。
  {
    id: 'shoot', tutorial: 'm0-shoot', afterConvo: true, gateX: 800,
    spawn: { type: 'zombie', dx: 420, dy: 0 },
    callouts: [{ speaker: 'グレッグ', text: '変異体だ！構えろ！' }],
  },
  // **弾切れの状態から始まる**。前のビートの終わり方(弾がちょうど切れる)がそのまま入口になる。
  // ここで初めて近接を解禁する(それまでは振れない=社長指示v0.25.2293の封印)。
  {
    // **近接だけ**の練習。クリティカルはまだ出さない(2発で落ちる体力にして3発目に届かせない)。
    id: 'melee', tutorial: 'm0-melee', afterEnemyCleared: true, requires: 'shoot', gateX: 1000,
    spawn: { type: 'skeleton', dx: 150, dy: 0, meleeHits: 2 },
    callouts: [
      { speaker: 'ジュン', text: '弾切れです！' },
      { speaker: 'グレッグ', text: 'お前しか近距離で戦えない！頼んだぞ！' },
    ],
    unlock: 'melee',
  },
  // **クリティカルの練習**(社長指示v0.25.2314「一個ずつ丁寧に終わらせてから次に行って」)。
  // 以前は近接の1体目を殴っている最中にクリとキルの説明が連続で挟まり、畳み掛けになっていた。
  // → **専用の場所・専用の3体**に分けた。ここから `critDrill` で**3発ごとに必ずクリ**が出る。
  // 相手は4発耐える体力=3発目にクリ、その後に仕留められる。
  // **delayMs=700 の根拠(上下から挟んである)**:
  //   下限=クリの演出(金色の数字・黄リング 260〜520ms)が出切ってから説明する
  //        (社長指摘v0.25.2307「クリティカル演出出る前にポップアップが出ちゃってる」)。
  //   上限=**次の近接が出せるのは820ms後**(`COUNTER_WINDOW 400` + `COUNTER_COOLDOWN 420`)。
  //        越えると崩した相手を倒してから説明することになり、順序が壊れる。
  {
    id: 'crit', tutorial: 'm0-crit', gateX: 1150, requires: 'melee', afterEnemyCleared: true,
    popupAfterCrit: true, delayMs: 700,
    spawn: { type: 'skeleton', dx: 170, dy: 0, meleeHits: 4 }, critDrill: true,
  },
  // **キル(近接フィニッシュ)の練習**。崩れた相手を一撃で仕留める。ここも3発ごとにクリが出る。
  {
    id: 'finish', tutorial: 'm0-finish', gateX: 1300, requires: 'crit', afterEnemyCleared: true,
    spawn: { type: 'skeleton', dx: 170, dy: 0, meleeHits: 4 }, critDrill: true,
  },
  // **カウンター=飛んでくる弾を近接で弾き返す**技(反射弾は10倍)。社長指摘v0.25.2299
  // 「近接フィニッシュとカウンターがごっちゃ/カウンターの時は遠距離弾の敵が必要」。
  // 近接で殴りに行く相手だと**弾が飛んでこない**ので、相手は**遠距離から撃つ型(plant)**。
  { id: 'counter', tutorial: 'm0-counter', gateX: 1450, afterEnemyCleared: true, requires: 'finish', spawn: { type: 'plant', dx: 300, dy: 0 } },
  // 上の3体を倒していれば結晶が溜まってレベルが上がる。位置ではなく成長で発火。
  { id: 'levelup', tutorial: 'm0-levelup', atLevel: 2, expireAfterX: 3000 },
  // 研究区域へ入った瞬間(社長指示v0.25.2288)。※踏破儀式は端末で初回1回きりなので**位置で判定する**。
  // 区域の説明。**演出(銘打ち)は説明を読んでから**出す(社長指示v0.25.2305)ので、ここでは待たない
  // (v0.25.2297 の delayMs=4200 は撤回。useGameLoop 側が銘打ちを預かって後で出し直す)。
  // requires: 戦闘中は壁が外れるため、練習の途中で先へ走って区域の説明だけ先に見てしまわないよう鎖でつなぐ。
  { id: 'area', tutorial: 'm0-area', atX: 1500, requires: 'counter' },
  // デンジャー入場=ハンター出現(社長指示v0.25.2287)。湧かせるのは useGameLoop 側(専用の配置)。
  { id: 'hunter', tutorial: 'm0-hunter', atX: 3000, requires: 'area' },
  // 追われながら弾を拾う。ハンターの直後に置く(社長指示v0.25.2286「5で弾補充」)。
  { id: 'ammo', tutorial: 'm0-ammo', atX: 3160, requires: 'hunter' },
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
  /**
   * 今の教習で**まだ出していない残り**の数。1体ずつ出すので、倒した直後は一瞬「敵0体」になる。
   * これを見ないと、その隙に次のビートが始まってしまう(=練習が1体で終わる)。
   */
  scriptedWaveRemaining: number;
  /** この出撃で既に出したビート。 */
  fired: ReadonlySet<M0Beat>;
}

/**
 * 今、プレイヤーが越えられない前線(px)。未発火ビートのうち**最初の関門**。
 * これが無いと、教習中の敵を置き去りにして先へ走れてしまう(台本が崩れる)。
 * 関門を持つ未発火ビートが無ければ null=制限なし。
 */
export const m0AdvanceLimit = (fired: ReadonlySet<M0Beat>, waveActive: boolean): number | null => {
  // **戦闘中は壁を外す**(社長指摘v0.25.2305「近接チュートリアル、移動可能距離が短すぎる」)。
  // 関門の役目は「戦う前に先へ行かせない」ことと「倒した直後に次を始めない一拍」であって、
  // **戦っている最中に狭い箱へ閉じ込めること**ではない。練習中は自由に動き回れた方がいい。
  // 先へ走られても、次のビートは `requires`(前のビートが済んでいること)で塞いであるので順序は壊れない。
  if (waveActive) return null;
  for (const beat of M0_BEATS) {
    if (fired.has(beat.id)) continue;
    if (beat.gateX !== undefined) return beat.gateX;
  }
  return null;
};

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
    // 関門: そこまで歩いて来るまでは発火しない(=倒した直後に次が始まらない・一拍が入る)。
    if (beat.gateX !== undefined && gate.playerX < beat.gateX) return null;
    const byX = beat.atX !== undefined && gate.playerX >= beat.atX;
    const byLevel = beat.atLevel !== undefined && gate.playerLevel >= beat.atLevel;
    const byConvo = beat.afterConvo === true && gate.convoDone;
    // 「前の台本の敵を片付けたら次」。倒しきるまでは次の説明を被せない。
    // 「前の台本の敵を**全部**片付けたら次」。1体ずつ出す途中の空白では進めない。
    const byCleared = beat.afterEnemyCleared === true && !gate.scriptedEnemyAlive && gate.scriptedWaveRemaining <= 0;
    if (byX || byLevel || byConvo || byCleared) return beat;
  }
  return null;
};
