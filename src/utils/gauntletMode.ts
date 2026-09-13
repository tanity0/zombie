// ボス・ガントレット(開発用の全ボス自動テスト・`?gauntlet=1`)の**述語だけ**を持つ葉。
//
// 依存ゼロ(import なし)にしてあるのは、store からも App からも読むため——判定を1本に保ったまま
// どこから読んでも循環importにならない形にする(isBossMakerRun() と同型)。
// 他のデバッグフラグと同じ作法で**モジュールロード時に1回だけ**読む(ページ読込時のURLが真実)。
const GAUNTLET_FLAG = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('gauntlet') === '1';

/** この読込がボス・ガントレットの走行か。 */
export const isGauntletRun = (): boolean => GAUNTLET_FLAG;
