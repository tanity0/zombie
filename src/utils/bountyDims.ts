// §6.38 賞金首の予告寸法の葉モジュール(v0.25.3390・起動全損ホットフィックス)。
//
// ★なぜ独立ファイルか(消さない): B2bで levelUpGate.ts が bountyTick.ts から寸法をimportした結果、
// 「gameStore → levelUpGate → bountyTick → gameStore」の循環importが生まれ、bountyTick の
// モジュール初期化時の `BB_LEAP_RADIUS = PUMPKIN_EXPLOSION_RADIUS`(gameStoreの未初期化const読み)が
// **本番バンドルでTDZ(ReferenceError)=起動直後に真っ暗**を起こした(build/typecheck/testは全て素通り)。
// 判定と描画が同じ値を読む「単一の出どころ」規約は保ったまま、寸法だけを**依存ゼロの葉**に置いて
// 循環を断つ。このファイルは他モジュールを一切importしないこと(それがこのファイルの存在理由)。
//
// 使い方: bountyTick.ts が named re-export しているので、既存の消費者(pixiScene/テスト)は
// 従来どおり bountyTick からimportしてよい。gameStore/levelUpGate はここから直接importする。

/** パンプキン(/lab-zombie-3)のジャンプ攻撃の着地爆発半径(px)。定義の正はここ(gameStoreがre-export)。
 * 旧: gameStore.ts 直書き54(66→54=社長指示)。値は不変・置き場所だけ移動。 */
export const PUMPKIN_EXPLOSION_RADIUS = 54;

/** §6.38 §3「HP: 基準値(叩き台)」。bountyMaxHealth(bountyTick.ts)がここへ実効難易度倍率を掛ける。
 * 変異体対策室(bossPractice.ts)のHP表示もここを直接読む(掲載裁定・値は不変・置き場所だけ葉へ移動=
 * bossPractice→bountyTick→gameStore→bossPractice の循環import防止。v0.25.3390の教訓と同じ理由)。 */
export const BOUNTY_BASE_HP = 2000;

// ---- バス停(bounty-ranged) ----
/** 標識の先端(構えの中心=手元から先端まで・px)。社長指示v0.25.3443「弾飛ばす時もバス停の先から
 * 撃つ感じにして」: 発射起点(bountyTick)と構えの絵の先端(pixiScene・手元+55px中心の130px標識の先)が
 * 同じこの値を読む。構えの高さ=身長比-0.15は両側でe.height×0.15をインライン共有。 */
export const BR_SIGN_TIP_PX = 120;

// ---- 鋏(bounty-balance) ----
/** 薙ぎ払いのカプセル半幅(px)。判定(bountyTick)と予告描画(pixiScene)と levelUpGate が共有。 */
export const BB_SWEEP_HALFWIDTH = 40;
/** 跳びかかりの着地円半径=パンプキンと同一(輸入技の同一性・複製しない)。 */
export const BB_LEAP_RADIUS = PUMPKIN_EXPLOSION_RADIUS;

// ---- 舞妓(bounty-maiko) ----
/** 毬の薙ぎのカプセル半幅(px)。 */
export const MK_NAGINATA_HALFWIDTH = 30;
/** 毬回し(自分中心円)の半径(px)。AOE_TELEGRAPH_AUDIT 登録対象。 */
export const MK_SPIN_RADIUS = 90;
/** 水鳥乱舞の各着地円の半径(px)。社長指示v0.25.3460「範囲狭すぎる。二倍くらいにして」で 50→100。 */
export const MK_SUIU_RADIUS = 100;
/** 水鳥乱舞・最終段の円の倍率。 */
export const MK_SUIU_FINAL_RADIUS_MULT = 1.8;
