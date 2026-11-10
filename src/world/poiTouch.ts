// POIに「触れた瞬間」の手応え(社長指示2026-11-10「poi触れた時、触れた感じが欲しい」)。
// 触れ始め(離れていた→触れている)の検出と、建物が受け止める動き(白い光・奥への沈み)の包絡線。
// 描画にもストアにも依存しない純関数だけを置く(world/ の規約)。判定・発動の条件には一切触れない。

/** 触れ始めの対象。祠は slot ごとに別の印。 */
export type PoiTouchId = 'hospital' | 'armory' | 'police' | 'shrine-body' | 'shrine-arms' | 'shrine-accessory';

/**
 * 触れ始めの検出。prev=前フレームに触れていた印、now=今フレーム触れている印。
 * 返す started は「前は触れていなかったのに今は触れている」印だけ(触れ続けている間は出ない・離れて触れ直せばまた出る)。
 * next は次フレームへ持ち越す印(now の重複を除いたもの)。
 */
export const poiTouchStarts = (
  prev: readonly string[],
  now: readonly string[],
): { started: string[]; next: string[] } => {
  const next: string[] = [];
  const started: string[] = [];
  for (const id of now) {
    if (next.includes(id)) continue;
    next.push(id);
    if (!prev.includes(id)) started.push(id);
  }
  return { started, next };
};

/** 建物が受け止める動きの長さ(実時間ms)。白い光は短く、沈みは戻りまで余韻を残す。 */
export const POI_TOUCH_FLASH_MS = 110;
export const POI_TOUCH_SINK_IN_MS = 60;
export const POI_TOUCH_SINK_OUT_MS = 280;
export const POI_TOUCH_SINK_PX = 3;
export const POI_TOUCH_TOTAL_MS = POI_TOUCH_SINK_IN_MS + POI_TOUCH_SINK_OUT_MS;

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/**
 * 触れてから elapsedMs 後の包絡線。flash=白(赤)の加算の強さ 0..1、sink=奥(画面の上)へ沈む量(px・奥行き倍率を掛ける前)。
 * 位置と光だけ(伸び縮みはしない)。沈みは ease-out で入り、ease-out で戻る(慣性MUST=加減速のある動き)。
 */
export const poiTouchEnvelope = (elapsedMs: number): { flash: number; sink: number } => {
  if (!(elapsedMs >= 0) || elapsedMs >= POI_TOUCH_TOTAL_MS) return { flash: 0, sink: 0 };
  // 光: 触れた瞬間が最大で、ease-out で抜ける。
  const flash = elapsedMs >= POI_TOUCH_FLASH_MS ? 0 : (1 - easeOutCubic(elapsedMs / POI_TOUCH_FLASH_MS));
  const sink = elapsedMs < POI_TOUCH_SINK_IN_MS
    ? POI_TOUCH_SINK_PX * easeOutCubic(elapsedMs / POI_TOUCH_SINK_IN_MS)
    : POI_TOUCH_SINK_PX * (1 - easeOutCubic((elapsedMs - POI_TOUCH_SINK_IN_MS) / POI_TOUCH_SINK_OUT_MS));
  return { flash, sink };
};

/** 体で受ける止め(全停止の長さ)と、カメラを建物の方へ押し込む量。スローは使わない。 */
export const POI_TOUCH_STOP_MS = 60;
export const POI_TOUCH_KICK_PX = 5;
export const POI_TOUCH_KICK_MS = 260;
