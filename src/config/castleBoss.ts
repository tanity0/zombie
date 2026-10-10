// 通常ステージの城ボス出現時刻。デバッグの ?castlenow=1 はこの待ち時間を無視する。
export const CASTLE_BOSS_MIN_TIME_MS = 5 * 60 * 1000;

// 二人組クエストv4(EVENT_QUEST_DESIGN.md §2-18・社長指示2026-09-14「会話終了で城ボス出現イベント」):
// 通信(受注会話)が終わってから城ボスが湧くまでのディレイ。会話が終わった後なので被る演出が無い=0。
// (v2の RESCUE_TO_CASTLE_DELAY_MS=3000 は「全滅の余韻と会話1行目に被らない」ための値だった。v4で撤去)
export const DUO_COMM_TO_CASTLE_DELAY_MS = 0;
