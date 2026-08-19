// research/GHOST_BOSS.md(守護霊ボス「幻影」)の**数字だけ**を持つ表。
//
// なぜ分けるか(BOSS_MAKER.md §2-2「台本はコード / 数字はテーブル」・bountyScript.ts と同じ流儀):
// **判定(phantomTick)と描画(pixiScene)が同じテーブルの同じ場所を読む**ので、
// 「見えている斬撃と当たり判定がズレる」が原理的に起きない。寸法を各所へ写経しない。
//
// ★このファイルは**依存ゼロの葉**(store も pixi も import しない)。
//   ここが重くなると循環importで起動全損(v0.25.3390)を再演する。
//
// ★v6(GHOST_BOSS.md「v6 実装仕様」)で**予告・州機械・一閃・銃の手書き値は全廃**した。
//   - 予告(windup/active/recover)は無い=幻影の攻撃はプレイヤーと同じ即発。
//   - 一閃(gp-issen)は廃止(プレイヤーの標準操作に無い動作。サブウェポン再現の第3弾で対称に戻す)。
//   - 銃は**台帳武器の実性能**(createWeapon(activeGunKey))をそのまま使う=ここに銃の数字は書かない。
//   残っているのは「近接の寸法+ダメージ」と「パリィの数字」だけ。
//
// 数値は全て**叩き台**(社長の実機確認で調整する前提)。

export const GUARDIAN_PHANTOM_TUNING = {
  /**
   * 近接(即発ミラー)。判定=幻影中心→プレイヤー方向へ長さ `reach`・半幅 `halfWidth` のカプセル。
   * 発火周期は**プレイヤーの近接の実効周期**(ghostDriver.GHOST_COUNTER_MELEE_PERIOD_MS=
   * COUNTER_WINDOW+COUNTER_COOLDOWN)を import して使う=ここに周期の数字は置かない(写経禁止)。
   */
  melee: { reach: 160, halfWidth: 20, damage: 18 },
  /**
   * パリィ(プレイヤーの「カウンター」の鏡)の再発火まで置く間隔(ms・gameTime基準)。
   * 成立率そのものは台帳(strongestGuardian().profile.counterChance)=ここには書かない。
   */
  parryCdMs: 1000,
  /**
   * 振りの絵(斬撃弧+踏み込み)の表示時間(ms)。**判定は即発の1フレーム**なので、これは
   * 「見えるようにするための絵の尺」であって当たり判定の長さではない(設計書に指定が無いので
   * 実装で埋めた値。慣性MUST: 踏み込み→戻りをこの尺の中でイーズする)。
   */
  swingFxMs: 260,
} as const;
