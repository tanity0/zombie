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
//
// ★v0.25.3558(ボスメーカー横展開・第1弾): 賞金首4種の**技の寸法はここから bountyScript.ts の
// 可変テーブルへ移した**(画面から数字を動かすため。BOSS_MAKER.md §2-2)。bountyScript.ts も
// 同じ「storeを触らない葉」なので、循環importを避けるこのファイルの役目は変わらない。
// ここに残すのは「賞金首の技ではない共有値」だけ。

/** パンプキン(/lab-zombie-3)のジャンプ攻撃の着地爆発半径(px)。定義の正はここ(gameStoreがre-export)。
 * 旧: gameStore.ts 直書き54(66→54=社長指示)。値は不変・置き場所だけ移動。 */
export const PUMPKIN_EXPLOSION_RADIUS = 54;

/** §6.38 §3「HP: 基準値(叩き台)」。bountyMaxHealth(bountyTick.ts)がここへ実効難易度倍率を掛ける。
 * 変異体対策室(bossPractice.ts)のHP表示もここを直接読む(掲載裁定・値は不変・置き場所だけ葉へ移動=
 * bossPractice→bountyTick→gameStore→bossPractice の循環import防止。v0.25.3390の教訓と同じ理由)。 */
export const BOUNTY_BASE_HP = 2000;

// ---- 賞金首4種の技の寸法は `bountyScript.ts`(可変テーブル)へ移設した(v0.25.3558) ----
// 旧: BR_SIGN_TIP_PX / BB_SWEEP_HALFWIDTH / BB_LEAP_RADIUS / MK_NAGINATA_HALFWIDTH /
//     MK_SPIN_RADIUS / MK_SUIU_RADIUS / MK_SUIU_FINAL_RADIUS_MULT
// 新: BOUNTY_RANGED_TUNING.signTipPx / BOUNTY_BALANCE_TUNING.sweep.halfWidth / .leap.radius /
//     BOUNTY_MAIKO_TUNING.naginata.halfWidth / .spin.radius / .suiu.radius / .suiu.finalRadiusMult
// **値は不変**(置き場所だけの移動)。判定(bountyTick/levelUpGate)も描画(pixiScene)も、引き続き
// 同じ1箇所を読む=「赤いのに当たらない」は起きない。
