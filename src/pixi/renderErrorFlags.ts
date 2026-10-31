// 描画層の「例外ログは初回だけ」フラグの置き場(research/BOSS_GAUNTLET.md 検出器5)。
//
// ★なぜ部品の外に出すか: これらのフラグは**マウント寿命**(PixiStage の effect ローカル)だったため、
// 1タブで連戦する(ボス・ガントレット)と2戦目以降の描画例外が丸ごと無音になった。
// 戦いの切れ目で外から再アームできるよう、モジュール寿命の1箇所に集める。
// **握り潰し方(挙動)は一切変えない**——拾えるかどうかだけの話。
// ※部品(.tsx)から関数を輸出すると Fast Refresh の警告が出るので、置き場は普通のモジュールにする。
export const renderErrorFlags = {
  /** PixiStage の ticker 内 sync 例外のログを出したか。 */
  pixiStageSyncLogged: false,
};

/** 次の1件をまた拾えるようにする(戦いの切れ目で呼ぶ)。通常プレイでは誰も呼ばない。 */
export const rearmRenderErrorFlags = (): void => {
  renderErrorFlags.pixiStageSyncLogged = false;
};
