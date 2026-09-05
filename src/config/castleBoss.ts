// 通常ステージの城ボス出現時刻。デバッグの ?castlenow=1 はこの待ち時間を無視する。
export const CASTLE_BOSS_MIN_TIME_MS = 5 * 60 * 1000;

// 二人組クエストv2(EVENT_QUEST_DESIGN.md §2-6・B3): レスキュー完了から城ボス出現までの固定ディレイ。
// 全滅の余韻・駆除成功バナー・受注会話の1行目に、城ボスの出現アテンション(950ms後)が被らないための
// 猶予(合計で全滅からアテンションまで3.95秒)。会話の長さには依存させない(§2-0の中核原則)。
export const RESCUE_TO_CASTLE_DELAY_MS = 3000;
