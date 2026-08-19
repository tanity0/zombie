// ボスメーカー横展開・第1弾(BOSS_MAKER.md §6 フェーズ4): 賞金首4種の**可変チューニングテーブル**。
//
// 方針は idol と同じ「台本はコード / 数字はテーブル」(BOSS_MAKER.md §2-2):
//  - 状態機械(bountyTick.ts)のロジックは一切変えず、**数値の置き場所だけ**をここへ移す。
//  - 既存コードは使用時参照(tick中/描画中に読む)なので、テーブルのプロパティを読む形にすれば
//    挙動は1バイトも変わらない。**既定値は現行の実装値と完全一致**(=リファクタとして無変更)。
//  - 判定(bountyTick/levelUpGate)と描画(pixiScene)は**このテーブルの同じ場所を読む**。
//    どちらか一方が古い定数を読むと「赤いのに当たらない」になるので、寸法は必ずここに1つだけ置く。
//
// ★このファイルは**依存の軽い葉**でなければならない(import は deepClone / bountyDims /
//   bossTelegraph の3つ=いずれも store を触らない層だけ)。理由は bountyDims.ts 冒頭の
//   「gameStore → levelUpGate → bountyTick → gameStore の循環importで本番バンドルがTDZ=起動直後
//   真っ暗」(v0.25.3390)。levelUpGate.ts が寸法をここから読むので、**gameStore を import しないこと**。
//   その代わり、gameStore にある輸入技の値(werewolf/pumpkin)は**値を複製し、一致は
//   bountyScript.test.ts が実体を import して機械検査する**(bossTelegraph.ts / bountyTriple.ts と
//   同じ確立済みの作法)。
//
// 未対応(★次バッチ): 三段突き(bountyTriple.ts)・射撃サイクル(bountyShots.ts)・レーザー(輸入=
//   mimirLaserTrack.ts の寸法をそのまま使う技)・HP基準値(BOUNTY_BASE_HP=4体共通)・中立時間
//   (BOUNTY_NEUTRAL_MS=4体+共通経路で共有)。いずれも「共有されている/別の葉が正」なので、
//   テーブル化には持ち主側の分解が要る。
import { deepCloneTuning } from './deepClone';
import { withRecoverFloor } from './bossTelegraph';

/** 技ごとのノックバック(距離と時間。速度はknockbackSpeedForが逆算する)。 */
export interface BountyKnockback { distPx: number; ms: number }

// ================================================================================================
// バス停(bounty-ranged)
// ================================================================================================
export interface BountyRangedTuning {
  /** 引き撃ちの帯(これより近いと後退・遠いと詰める)。 */
  kite: { min: number; max: number };
  /** 押しのけ(小KB・カウンター可・分類1=判定に揃える。得物=標識の薙ぎ)。 */
  push: {
    /** 発動距離(§4「近接されたら押しのけ」)。 */
    pickRange: number;
    windup: number;
    /** 帯(カプセル)の長さ。 */
    reach: number;
    halfWidth: number;
    damage: number;
    recover: number;
    kb: BountyKnockback;
  };
  /** 通常のポツポツ撃ちの弾(共通弾・型3種のサイクルは bountyShots.ts が持つ)。 */
  shot: { speed: number; damage: number; size: number };
  /** 輸入=ミーミル型レーザー。**寸法/溜め/発射時間は本物(mimirLaserTrack.ts)のまま**=ここには無い。 */
  laser: { damage: number; recover: number; cdMs: number };
  /** 取り巻き召喚(交戦開始1回だけ)。 */
  escort: { count: number };
  /** 三段突き。**寸法/溜め/段のタイミングは bountyTriple.ts が正**=ここには硬直だけ。 */
  triple: { recover: number };
  /** 標識の先端(構えの中心=手元から先端まで)。発射起点(判定)と構えの絵(描画)が同じ値を読む。 */
  signTipPx: number;
}

export const BOUNTY_RANGED_TUNING: BountyRangedTuning = {
  kite: { min: 340, max: 560 },
  push: {
    pickRange: 110,
    windup: 500,
    reach: 82,
    halfWidth: 34,
    damage: 8,
    recover: withRecoverFloor(700),
    kb: { distPx: 100, ms: 240 },
  },
  shot: { speed: 260, damage: 10, size: 10 },
  laser: { damage: 24, recover: withRecoverFloor(900), cdMs: 9000 },
  escort: { count: 2 },
  triple: { recover: withRecoverFloor(900) },
  signTipPx: 120,
};

// ================================================================================================
// 馬乗り(bounty-melee)
// ================================================================================================
export interface BountyMeleeTuning {
  /** 密着=コンボ帯。 */
  meleeMax: number;
  /** 遠距離にこれだけ居ると懲罰狙撃(§4③「近寄らざるを得ない」)。 */
  farMs: number;
  /** 突進(輸入=werewolf の windup→charge)。 */
  charge: { windup: number; maxMs: number; speedMult: number; reach: number; recover: number };
  /** ダッシュ後の360度ムチ振り。判定=自分中心の円(鞭の長さ)。 */
  whip360: { windup: number; active: number; radius: number; damage: number };
  /** 3段コンボ(速→速→遅・終端パニッシュ窓)。 */
  combo: {
    range: number;
    halfWidth: number;
    /** 各段の予告(3段ぶん)。 */
    windup: [number, number, number];
    damage: [number, number, number];
    /** 1・2段目の間だけの短い硬直(カウンター可)。 */
    stepRecover: number;
    /** 終端=確定パニッシュ窓。 */
    finishRecover: number;
    /** 終段だけ小さく押し出す。 */
    kb: BountyKnockback;
  };
  /** 輸入=懲罰狙撃(idol snipe の値の複製。ダメージのみ弱体化)。 */
  snipe: { windup: number; active: number; range: number; halfWidth: number; damage: number; recover: number };
}

export const BOUNTY_MELEE_TUNING: BountyMeleeTuning = {
  meleeMax: 130,
  farMs: 2000,
  charge: {
    // ★gameStore の WEREWOLF_* の複製(このファイルは store を import しない葉)。
    // 一致は bountyScript.test.ts が実体を import して機械検査する。
    windup: 600,      // = WEREWOLF_WINDUP_MS
    maxMs: 2800,      // = WEREWOLF_CHARGE_MAX_MS
    speedMult: 9,     // = WEREWOLF_CHARGE_SPEED_MULT(3) × 3(社長指示v0.25.3473)
    reach: 420,
    recover: withRecoverFloor(700),
  },
  // 社長指示v0.25.3473「ダッシュ後に360度、ムチ振り攻撃。(慣性入れてね)」。判定=自分中心の円(鞭の長さ)。
  // 公平の物差し: 起点=近接がギリギリ届く位置(賞金首44x44の縦横平均22+74=96)→ 必要
  // (170-96)/104.4*1000 ≒ 709ms … 予告750msで合格(見てから離れられる)。半径を触ったらここも見直す。
  whip360: { windup: 750, active: 420, radius: 170, damage: 12 },
  combo: {
    range: 130,
    halfWidth: 28,
    windup: [480, 480, 900],
    damage: [14, 14, 20],
    stepRecover: 220,
    finishRecover: withRecoverFloor(1400),
    kb: { distPx: 70, ms: 220 },
  },
  // 輸入=懲罰狙撃(§4③・idolScript snipe の値の複製=完全同一。ダメージのみ弱体化)。
  snipe: { windup: 1100, active: 200, range: 900, halfWidth: 40, damage: 22, recover: withRecoverFloor(900) },
};

// ================================================================================================
// 鋏(bounty-balance)
// ================================================================================================
export interface BountyBalanceTuning {
  /** 近=薙ぎ払い / 遠=跳びかかり の境目。 */
  nearMax: number;
  sweep: { range: number; halfWidth: number; windup: number; damage: number; recover: number };
  /** 跳びかかり(輸入=pumpkin)。 */
  leap: { radius: number; windup: number; airMs: number; recover: number; damage: number };
}

export const BOUNTY_BALANCE_TUNING: BountyBalanceTuning = {
  nearMax: 170,
  // sweep.range 150→300: ボスメーカー実機チューニングの貼り戻し(社長確定 v0.25.3576)。
  sweep: { range: 300, halfWidth: 40, windup: 750, damage: 18, recover: withRecoverFloor(900) },
  // ★v0.25.3576: 跳びかかりは元pumpkin輸入(複製)だったが、ボスメーカーの実機チューニングで
  // **鋏専用の値に確定**した(貼り戻し)。以後pumpkinとは独立(bountyScript.test.tsも裁定値の固定へ変更)。
  leap: {
    radius: 110,   // 旧: PUMPKIN_EXPLOSION_RADIUS(=54)
    windup: 1000,  // 旧: 3000 = PUMPKIN_CROUCH_MS
    airMs: 300,    // 旧: 1000 = PUMPKIN_JUMP_MS
    recover: 500,  // 旧: 1000。※硬直フロア(BOSS_RECOVER_FLOOR_MS=900)の外で確定(leapは元から未適用)
    damage: 22,
  },
};

// ================================================================================================
// 舞妓(bounty-maiko)
// ================================================================================================
export interface BountyMaikoTuning {
  nearMax: number;
  /** 手毬打ちの間合い。 */
  farMin: number;
  /** 型A→型Bへ1回だけ切り替わるHP割合。 */
  phaseHpFrac: number;
  /** 型切替時の舞い直し(短硬直・無敵なし)。 */
  reposeMs: number;
  /** 毬の薙ぎ(型A単発 / 型B2連。windupは2択ランダム=変則ディレイ)。 */
  naginata: {
    range: number;
    halfWidth: number;
    /** 型A単発の予告(2択)。 */
    windup: [number, number];
    /** 型B・1段目=速。 */
    windup1: [number, number];
    /** 型B・2段目=遅。 */
    windup2: [number, number];
    damage: number;
    recover: number;
    /** 2連の1段目→2段目の間の短い硬直。 */
    stepRecover: number;
  };
  /** 毬回し(自分中心円・回したまま踏み込む)。 */
  spin: { radius: number; windup: [number, number]; active: number; lungePx: number; damage: number; recover: number };
  /** 水鳥乱舞(型B専用大技・毬3連バウンド。着地円のみ判定)。 */
  suiu: {
    radius: number;
    /** 最終段だけ大円。 */
    finalRadiusMult: number;
    /** ホップ間隔=各ホップの予告時間そのもの(2択)。 */
    hopInterval: [number, number];
    /** 着地直前の移動(予告は継続表示)。 */
    travelMs: number;
    damage: number;
    /** 着地点のばらつき(プレイヤー位置＋この範囲)。 */
    offsetRange: number;
    recover: number;
  };
  /** 手毬打ち(遠距離・打ち出し→戻るブーメラン軌道)。 */
  boom: {
    range: number;
    hitRadius: number;
    windup: number;
    outMs: number;
    backMs: number;
    damage: number;
    recover: number;
  };
}

export const BOUNTY_MAIKO_TUNING: BountyMaikoTuning = {
  nearMax: 150,
  farMin: 380,
  phaseHpFrac: 0.5,
  reposeMs: 500,
  // 毬の薙ぎ。型A=単発(windup=2択ランダム=変則ディレイ)/型B=2連(速→遅の順固定=レラーナ経験則。
  // 各段が独立して2択から抽選=個別予告)。
  naginata: {
    range: 140,
    halfWidth: 30,
    windup: [700, 1150],
    windup1: [550, 750],
    windup2: [900, 1300],
    damage: 16,
    recover: withRecoverFloor(900),
    stepRecover: 220,
  },
  // 毬回し(自分中心円・windup=2択ランダム)。★AOE_TELEGRAPH_AUDIT登録対象(escapeMs=短い方=800)。
  // §6.38 v11(社長裁定2026-08-15「毱回しは案Aで」): 中距離でしか選ばれないのに判定が自分中心の円で、
  // 実行中もボスが動かず**構造的に当たらない技**だった(社長指摘「毱回しは絶対当たらない」)。
  // 直し方=**回したままプレイヤー方向へ踏み込む**(lungePx)。判定円ごと前進するので中距離でも届く。
  spin: {
    radius: 180,
    windup: [800, 1300],
    active: 500,
    lungePx: 220,
    damage: 14,
    recover: withRecoverFloor(900),
  },
  // 水鳥乱舞(型B専用大技・毬3連バウンド・マレニア§2-4)。着地点=プレイヤー現在位置+抽選オフセット
  // (clampRectToPlayableArea適用)。ホップ間隔=2択ランダム(=各ホップの予告時間そのもの)。最終段のみ大円。
  // ホップ中の毬に接触判定なし=着地円のみ(v5承認)。乱舞後は長め硬直(パニッシュ窓)。
  // ★半径と予告は連動する: 社長指示v0.25.3460で着地円を50→100pxにした際、円から歩いて出るのに要る時間
  // (=(半径+自機14)/104.4*1000 = 613→1092ms)に合わせてホップ間隔を[400,600]→[850,1050]へ伸ばし、
  // 「見てから歩いて避けられる」公平の掟(bossTelegraph.minWindupMs・bountyTick.testで機械化)を保った。
  // **radius を触る時は hopInterval も一緒に見る**(テストが落ちて教えてくれる)。
  suiu: {
    radius: 100,
    finalRadiusMult: 1.8,
    hopInterval: [850, 1050],
    travelMs: 260,
    damage: 16,
    offsetRange: 90,
    recover: withRecoverFloor(1500),
  },
  // 手毬打ち(遠距離・打ち出し→戻るブーメラン軌道。判定=毬の絵に揃える=共通弾ではない)。
  // 社長指示v0.25.3460「手毬うちは遅すぎる、短すぎる。両方二倍にして」: 飛ぶ距離を2倍(500→1000)。
  // **往路/復路の時間(outMs/backMs)は据え置き**=同じ時間で倍の距離=速さも2倍(時間を縮めると
  // 往復が一瞬になり毬が読めなくなるため、時間ではなく距離で出す)。
  boom: {
    range: 1000,
    hitRadius: 30,
    windup: 750,
    outMs: 420,
    backMs: 420,
    damage: 14,
    recover: withRecoverFloor(900),
  },
};

// ---- 既定値(リセット/差分表示用・BOSS_MAKER.md §2-2) --------------------------------------------
// テーブルとは**別のオブジェクト**として焼く(参照を共有すると「リセット」で戻せなくなる)。
export const BOUNTY_RANGED_TUNING_DEFAULTS: BountyRangedTuning = deepCloneTuning(BOUNTY_RANGED_TUNING);
export const BOUNTY_MELEE_TUNING_DEFAULTS: BountyMeleeTuning = deepCloneTuning(BOUNTY_MELEE_TUNING);
export const BOUNTY_BALANCE_TUNING_DEFAULTS: BountyBalanceTuning = deepCloneTuning(BOUNTY_BALANCE_TUNING);
export const BOUNTY_MAIKO_TUNING_DEFAULTS: BountyMaikoTuning = deepCloneTuning(BOUNTY_MAIKO_TUNING);
