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

/**
 * 触れ直しの間隔(クリエイティブ監査): 離れて REFIRE_GAP_MS 以上たつか、REFIRE_DIST_PX 以上離れてからでないと再発火しない。
 * last=前回触れ終えた時刻とプレイヤー中心x(無ければ初回=発火してよい)。判定の発動には関係しない(手応えの出し分けだけ)。
 */
export const POI_TOUCH_REFIRE_GAP_MS = 800;
export const POI_TOUCH_REFIRE_DIST_PX = 16;
export const poiTouchMayFire = (
  last: { endAt: number; x: number } | undefined, nowMs: number, playerX: number,
): boolean => {
  if (!last) return true;
  return nowMs - last.endAt >= POI_TOUCH_REFIRE_GAP_MS || Math.abs(playerX - last.x) >= POI_TOUCH_REFIRE_DIST_PX;
};

// ---- 手応えの時間包絡(実時間ms)。建物は動かさない。受けるのはプレイヤーの体と光とカメラ。 ----
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
const easeInQuad = (t: number): number => t * t;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** 建物の光: 暖色寄りの白の加算。頂点の強さ(α) 0.25〜0.4。触れた瞬間が最大で ease-out で抜ける。 */
export const POI_TOUCH_FLASH_MS = 110;
export const POI_TOUCH_FLASH_PEAK = 0.34;
export const POI_TOUCH_FLASH_COLOR = 0xffe6c0;
export const poiTouchFlashAlpha = (elapsedMs: number): number =>
  elapsedMs >= 0 && elapsedMs < POI_TOUCH_FLASH_MS ? POI_TOUCH_FLASH_PEAK * (1 - easeOutCubic(elapsedMs / POI_TOUCH_FLASH_MS)) : 0;

/** プレイヤーの歩きのつっかえ(速度の倍率 0..1)。世界・敵・時間は止めない。1→0.1 へ滑らかに落ちて戻る(sin の1山)。 */
export const POI_TOUCH_STALL_MS = 100;
export const poiTouchStallMult = (elapsedMs: number): number =>
  elapsedMs >= 0 && elapsedMs < POI_TOUCH_STALL_MS ? 1 - 0.9 * Math.sin(Math.PI * (elapsedMs / POI_TOUCH_STALL_MS)) : 1;

/** プレイヤーの体が建物から押し戻される量(px・見た目だけ)。3px まで ease-out で入り、ease-in-out で戻る。 */
export const POI_TOUCH_PUSH_PX = 3;
export const POI_TOUCH_PUSH_IN_MS = 60;
export const POI_TOUCH_PUSH_OUT_MS = 240;
export const poiTouchPushPx = (elapsedMs: number): number => {
  if (!(elapsedMs >= 0) || elapsedMs >= POI_TOUCH_PUSH_IN_MS + POI_TOUCH_PUSH_OUT_MS) return 0;
  if (elapsedMs < POI_TOUCH_PUSH_IN_MS) return POI_TOUCH_PUSH_PX * easeOutCubic(elapsedMs / POI_TOUCH_PUSH_IN_MS);
  const u = clamp01((elapsedMs - POI_TOUCH_PUSH_IN_MS) / POI_TOUCH_PUSH_OUT_MS);
  return POI_TOUCH_PUSH_PX * (1 - (u * u * (3 - 2 * u)));
};

/** カメラの押し込み(px・建物の方=画面の上へ)。0→3.5px を 80ms で加速して入り、220ms で減速して戻る。横ぶれなし。銃の反動(kick)は使わない。 */
export const POI_TOUCH_CAM_PX = 3.5;
export const POI_TOUCH_CAM_IN_MS = 80;
export const POI_TOUCH_CAM_OUT_MS = 220;
export const poiTouchCamPx = (elapsedMs: number): number => {
  if (!(elapsedMs >= 0) || elapsedMs >= POI_TOUCH_CAM_IN_MS + POI_TOUCH_CAM_OUT_MS) return 0;
  if (elapsedMs < POI_TOUCH_CAM_IN_MS) return POI_TOUCH_CAM_PX * easeInQuad(elapsedMs / POI_TOUCH_CAM_IN_MS);
  return POI_TOUCH_CAM_PX * (1 - easeOutCubic((elapsedMs - POI_TOUCH_CAM_IN_MS) / POI_TOUCH_CAM_OUT_MS));
};

/** 建物ごとの音(既存の音の当て分け)。key=SfxKey、rate=再生速度、gain=音量。 */
export const POI_TOUCH_SOUND: Record<PoiTouchId, { key: 'shield-deploy' | 'heavy-impact' | 'brawler-stomp' | 'anchor-plant'; rate: number; gain: number; ms?: number }> = {
  armory: { key: 'shield-deploy', rate: 1.0, gain: 0.8 },                 // 鉄の「ガチャン」(counter.mp3 を低めに)
  hospital: { key: 'heavy-impact', rate: 0.8, gain: 0.55 },              // 重い扉の閉まり
  police: { key: 'brawler-stomp', rate: 0.95, gain: 0.6 },               // 厚い壁を打つ鈍い音
  'shrine-body': { key: 'anchor-plant', rate: 0.55, gain: 1.0 },         // 低く遅い・長め
  'shrine-arms': { key: 'anchor-plant', rate: 0.55, gain: 1.0 },
  'shrine-accessory': { key: 'anchor-plant', rate: 0.55, gain: 1.0 },
};
/** ±5% のピッチ揺らぎ(rand=0..1)。 */
export const poiTouchPitchJitter = (rand: number): number => 1 + (rand * 2 - 1) * 0.05;
