// ボット(`?bot=<persona>`)の旗。依存の無い葉(research/MASTERY.md v2.1 A-3)。
//
// もとは useGameLoop.ts の中の定数だったが、gameStore(resetGame の熟練度の「無視する出撃」の判定)からも
// 要るので葉へ出した(gameStore → useGameLoop の import は循環する)。値の意味は従来どおり:
// null(無指定)=通常プレイ。ペルソナ名の解決(不正値は 'standard')は useGameLoop 側のまま。
export const BOT_PARAM: string | null =
  typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('bot');

/** `bot=` の出撃か。 */
export const isBotRun = (): boolean => BOT_PARAM !== null;
