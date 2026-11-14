// 社長指示2026-10-05「英雄は解放された後は2度と出ない。あ、昇天のみ」: 一度でも昇天させたら、本編の周回の英雄は
// 二度と置かない(力ずくで倒した場合は数えない)。端末に1つの印だけを持つ葉モジュール(store を読まない)。
// ※対策室(練習)中の書き込みは practiceGuard が localStorage ごと封じる=練習で昇天させても印は付かない。
const KEY = 'zombie.progress.heroAscended';

export const loadHeroAscended = (): boolean => {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'; } catch { return false; }
};
export const saveHeroAscended = (): void => {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
};
