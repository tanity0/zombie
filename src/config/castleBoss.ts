// 通常ステージの城ボス出現時刻。デバッグの ?castlenow=1 はこの待ち時間を無視する。
// 社長指示2026-10-12(延長計画「推薦どおりで進めて」): 5:00 → 7:00。二人組の通信もこの時刻(DUO_COMM_AT_MS)。
export const CASTLE_BOSS_MIN_TIME_MS = 7 * 60 * 1000;

// 二人組クエストv4(EVENT_QUEST_DESIGN.md §2-18・社長指示2026-09-14「会話終了で城ボス出現イベント」):
// 通信(受注会話)が終わってから城ボスが湧くまでのディレイ。会話が終わった後なので被る演出が無い=0。
// (v2の RESCUE_TO_CASTLE_DELAY_MS=3000 は「全滅の余韻と会話1行目に被らない」ための値だった。v4で撤去)
export const DUO_COMM_TO_CASTLE_DELAY_MS = 0;
