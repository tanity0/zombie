// PACING_PUZZLE.md §6.38 v12「バス停の新技『三段突き』」(社長指示2026-08-15)+
// ★社長裁定(2026-08-15・監査の3点に回答)+「監査で出た未指定の埋め」。
//
// 判定(bountyTick.ts)と描画(pixiScene.ts)が3本の角度・タイミングを**同じ純関数**から導くための
// 依存ゼロの葉(bountyDims.ts/bountyShots.tsと同じ流儀=循環import防止+単一の出どころ)。
// このファイルは他モジュールを一切importしないこと。

// ---- 選択(社長裁定#2で確定) ---------------------------------------------------------------------
/**
 * 選択距離帯(px)。押しのけ(<=110)とレーザーの割り込み判定の後・中立の射撃サイクルの前に見る。
 *
 * ★v0.25.3516(社長指示「三段突きは0から全部出る様にして」): 下限を 380 → **0**。
 * 経緯: 選択帯が380〜460しか無かったため、**110〜340pxが「技が何も出ない空白地帯」**になっていた
 * (押しのけは<=110、レーザーは>340、三段突きは>=380。この帯では中立の射撃サイクルしか出ない)。
 * 下限を0にして、この空白を三段突きで埋める。
 *
 * ★注意(実際に出る範囲): **<=110px では押しのけが先に割り込む**(§4「近接されたら押しのけ→距離を
 * 開け直す」が最優先の防御反応。判定順は tickRanged のとおり)。よって体感上の三段突きの帯は
 * 概ね 110〜460px になる。押しのけより三段突きを優先させたい場合は判定順の入れ替えが要る=別の裁定。
 */
export const BR_TRIPLE_MIN = 0;
export const BR_TRIPLE_MAX = 460;
/** クールダウン(ms)。置き場所は BountyTickState 側(社長裁定「activeId切替で消えてよい」)。 */
export const BR_TRIPLE_CD_MS = 6000;

// ---- 溜め(社長裁定#2で900msへ) -------------------------------------------------------------------
/**
 * 溜め(この間ボスは静止)。
 * 旧: 起点380→実効到達468が必要843ms ≦ 900ms=物差し①(歩いて避けられるか)合格。
 * ★v0.25.3516で下限を0にしたため、**近距離では歩いて避けられない**(起点0なら必要4483ms)。
 * これは v0.25.3489(高速接近の追加)で社長が既に承認済みの扱い=**この技はカウンターで対処する技**、
 * の延長。溜め900msは変えていない(=遠距離から選ばれた時の公平性は従来どおり保たれる)。
 */
export const BR_TRIPLE_WINDUP_MS = 900;

// ---- 帯(カプセル)寸法(社長裁定#2で確定) -----------------------------------------------------------
export const BR_TRIPLE_REACH = 300;
export const BR_TRIPLE_HALF_WIDTH = 34;
/** 3段を通した踏み込みの合計前進距離(px)。加速→減速の慣性(smoothstep)で1つの弧として消化する。 */
export const BR_TRIPLE_STEP = 120;

// ---- ダメージ(社長裁定#1「実質1ヒットで割り切り」で9のまま) -----------------------------------------
export const BR_TRIPLE_DAMAGE = 9;

// ---- 左右の振り角(社長指定=真ん中の1回ロック・追尾なし) --------------------------------------------
export const BR_TRIPLE_SPREAD_DEG = 20;
export const BR_TRIPLE_SPREAD_RAD = (BR_TRIPLE_SPREAD_DEG * Math.PI) / 180;

// ---- 各段のタイミング(監査で出た未指定の埋め=A-6是正どおり) ------------------------------------------
/** 突き出し(命中判定は末尾=この時間が経過した瞬間)。 */
export const BR_TRIPLE_THRUST_MS = 90;
/** 戻り。 */
export const BR_TRIPLE_RETURN_MS = 60;
/** 段間(1・2段目の後にだけ挟む。3段目は挟まずそのまま硬直へ)。 */
export const BR_TRIPLE_GAP_MS = 70;
/** 1・2段目の周期(突き出し+戻り+段間)。 */
export const BR_TRIPLE_STEP_MS = BR_TRIPLE_THRUST_MS + BR_TRIPLE_RETURN_MS + BR_TRIPLE_GAP_MS; // 220
/** 3段目の周期(段間なし=そのまま硬直へ)。 */
export const BR_TRIPLE_LAST_STEP_MS = BR_TRIPLE_THRUST_MS + BR_TRIPLE_RETURN_MS; // 150
/** 3段合計の実行尺(監査A-6是正どおり590ms)。踏み込みイーズの分母(3段を1つの弧として消化する)。 */
export const BR_TRIPLE_ACTIVE_MS = BR_TRIPLE_STEP_MS * 2 + BR_TRIPLE_LAST_STEP_MS; // 590

/** 段indexから状態の周期(ms)を導く(0=左/1段目, 1=中/2段目, 2=右/3段目)。 */
export const brTripleStepDurationMs = (stepIdx: 0 | 1 | 2): number =>
  stepIdx === 2 ? BR_TRIPLE_LAST_STEP_MS : BR_TRIPLE_STEP_MS;

/**
 * 3本の角度(左→中→右。中=溜め明けにロックした狙い、左右はその±BR_TRIPLE_SPREAD_RAD)。
 * 判定(bountyTick.ts)と描画(pixiScene.ts)がここから導く=単一の出どころ(社長裁定#3
 * 「判定側と描画側が同じ純関数から導く」)。窓め中は呼び出し側が毎フレーム現在のプレイヤー方向を
 * 渡し(追尾)、windupが明けた瞬間の値をロックして以後は固定値を渡す(追尾しない)。
 */
export const brTripleAngles = (centerAngRad: number): readonly [number, number, number] => [
  centerAngRad - BR_TRIPLE_SPREAD_RAD, // 左(1段目)
  centerAngRad,                        // 中(2段目=ロックした狙い)
  centerAngRad + BR_TRIPLE_SPREAD_RAD, // 右(3段目)
];

/**
 * 踏み込み(慣性)の進行度(0→1・加速→減速=smoothstep)。elapsedMsは三段突き実行(br-triple-1開始)
 * からの累計経過ms。3段を1つの弧としてまとめて消化する(段ごとに瞬間停止しない=CLAUDE.md
 * 「ゲーム世界の全ての動きには必ず慣性を入れる」への対応・mk-spinと同型の設計)。
 */
export const brTripleLungeEase01 = (elapsedMs: number, totalMs: number = BR_TRIPLE_ACTIVE_MS): number => {
  const t = Math.max(0, Math.min(1, totalMs > 0 ? elapsedMs / totalMs : 1));
  return t * t * (3 - 2 * t); // smoothstep
};

/**
 * 実効到達距離(px)。社長裁定#2の検算式そのもの: REACH+帯の前端キャップ(HALF_WIDTH)+
 * 自機半径(叩き台14px・minWindupMs系の複製慣行と同じ)+踏み込み合計(STEP)。
 * 受け入れ条件「選択上限(BR_TRIPLE_MAX) ≦ 実効到達」の根拠(=空振り確定域が無いことの検算)。
 */
export const BR_TRIPLE_PLAYER_RADIUS_MIRROR = 14;
export const brTripleEffectiveReachPx = (
  reach: number = BR_TRIPLE_REACH,
  halfWidth: number = BR_TRIPLE_HALF_WIDTH,
  playerRadius: number = BR_TRIPLE_PLAYER_RADIUS_MIRROR,
  step: number = BR_TRIPLE_STEP,
): number => reach + halfWidth + playerRadius + step;

// ---- 接近(社長指示2026-08-15「今の距離ではプレイヤーに届かない。もっと高速で近づいてから使う」で追加)
// REACH/HALF_WIDTH/STEP/選択距離(MIN/MAX)/溜め(WINDUP_MS)は一切変更しない。溜め900msの間、静止する
// 代わりにプレイヤーへ高速接近し、「実行フェーズ(3段・590ms)が始まる時点で距離を詰めておく」ことで
// 到達性を担保する(旧実装は溜め中静止=プレイヤーが歩くだけで選択距離帯の上限側が届かなくなっていた)。
/**
 * 溜め中の接近速度倍率。馬乗り(bounty-melee)の突進 `BM_CHARGE_SPEED_MULT`(bountyTick.ts=
 * `WEREWOLF_CHARGE_SPEED_MULT(3) × 3` = 9)の複製値(このファイルは依存ゼロの葉のためimportしない・
 * 値の一致は bountyTriple.test.ts が実体をimportして機械検査する)。「同格」の参考値であって同一である
 * 必要は無いが、詰め切れることを実測(bountyTick.test.ts)で確認した上でこの値を採用した。
 */
export const BR_TRIPLE_APPROACH_SPEED_MULT = 9;
/**
 * 接近の目標停止距離(px・ボス中心→プレイヤー中心)。「プレイヤーの現在位置からBR_TRIPLE_REACH手前」
 * =REACHそのものを流用する(行き過ぎて重ならない・実行フェーズのREACHだけで届く距離まで詰める)。
 */
export const BR_TRIPLE_APPROACH_STOP_DIST = BR_TRIPLE_REACH;

// 速度は「加速(発進からの経過ms)」×「減速(目標までの残り距離)」の2つの0..1倍率を掛けて作る
// (ゲームAIの定番"seek and arrive"の作法)。**時間の締切だけで減速を作ると**(=溜めの残り時間が
// 少ないほど強制的に減速)、プレイヤーが逃げ続けて残り距離がなかなか縮まらない場合に「締切が近いのに
// まだ距離が残っている」状況で速度が上限側(時間ベース)に潰されて詰め切れなくなる
// (実測: 900ms全力で逃げられると300px手前どころか350px前後までしか詰まらず、実行フェーズのREACH=300が
// 届かずに空振りした=最初の実装のバグ)。距離ベースの減速に直せば、逃げられている間は高速巡航を続け、
// 目標に近づいた分だけ自然に減速する=締切に関係なく詰め切れる。
/** 加速(発進=windup開始からの経過ms→1)。0で発進(瞬間発進を作らない)。 */
export const BR_TRIPLE_APPROACH_RAMP_MS = 250;
/** 減速(目標=STOP_DISTまでの残り距離pxがこれ以下で減速開始)。0で到達(瞬間停止せず滑らかに止まる)。 */
export const BR_TRIPLE_APPROACH_SLOW_RADIUS = 140;

/** 加速倍率(0→1・windup開始からの経過msに対して線形ランプ)。瞬間発進を作らない。 */
export const brTripleApproachAccelMult = (elapsedMs: number): number => {
  if (BR_TRIPLE_APPROACH_RAMP_MS <= 0) return 1;
  return Math.max(0, Math.min(1, elapsedMs / BR_TRIPLE_APPROACH_RAMP_MS));
};
/** 減速倍率(0→1・目標までの残り距離pxに対して線形)。目標到達=0で瞬間停止を作らない。 */
export const brTripleApproachDecelMult = (remainDistPx: number): number => {
  if (BR_TRIPLE_APPROACH_SLOW_RADIUS <= 0) return remainDistPx > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, remainDistPx / BR_TRIPLE_APPROACH_SLOW_RADIUS));
};

// ---- 近距離の台本その2「バックロール → 三段突き」(社長指示v0.25.3519) ----------------------------
//
// 社長の言葉: 「バス停の近距離の台本は、**押しのけ** と **バックロール→三段つき** にする」。
//
// 密着された時の答えを2通りにする台本。押しのけが「押し返して間合いを作る」なら、こちらは
// **自分から引いて、その間合いから突く**。1手目のロールは**攻撃ではない移動**なので溜めを持たない
// (=カウンター対象にしない)。ロールが明けたらそのまま三段突きの溜めへ繋ぐ。
//
// 数字は idol の離脱ローリング(`idolScript.ts`: rollDist=140 / active=180)をそのまま借りる。
// **同じ動作は同じ数字**(idolTick.tsの「距離=shape.rollDist・同じ動作は同じ数字」と同じ作法)=
// 新しい手触りを発明しない。
/** 後方ロールの距離(px)。idol の shape.rollDist と同値。 */
export const BR_ROLL_DIST = 140;
/** 後方ロールの所要(ms)。idol の TIMING.roll.active と同値。 */
export const BR_ROLL_MS = 180;

/**
 * ロールの進行度(0→1)を**慣性つき**の距離比へ変換する(smoothstep=加速→減速)。
 * CLAUDE.md「★動きの絶対ルール: 慣性」= 等速で始まって瞬間停止する動きは禁止。
 * (idol 側は線形のままだが、そちらを勝手に変えない=このバッチの担当外。)
 */
export const brRollEase = (t01: number): number => {
  const t = Math.max(0, Math.min(1, t01));
  return t * t * (3 - 2 * t);
};
