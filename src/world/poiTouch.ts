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

// ★社長の実機報告「つっかかりがゼロ」(2026-11-13): 旧版(100msだけ速度を最大0.1倍へ落とす sin の谷・押し戻し3px・カメラ3.5px)は
//   下から触れている間は上への移動が元々0(建物の当たりの箱に押し込んでいる)で、横滑りでも平均4割減×100ms=数pxにしかならず体感ゼロだった。
//   ⇒ 触れ始めの瞬間に移動を全方向とも短く止め、慣性つきで元の速さへ戻す。体の反動とカメラも見える大きさへ。
//   どれも発動の判定・報酬・POIの位置・プレイヤーの実際の位置(押し戻さない)には触れない。2回目以降(light)は止めも反動も半分。

/** 止め(全方向・移動の速さ0)の長さ。2回目以降は半分。 */
export const POI_TOUCH_HOLD_MS = 120;
/** 止めの後、元の速さへ戻るまで(加速→減速の ease)。2回目以降は半分。 */
export const POI_TOUCH_RELEASE_MS = 120;
/** つっかえ全体の長さ(止め+戻り)。 */
export const POI_TOUCH_STALL_MS = POI_TOUCH_HOLD_MS + POI_TOUCH_RELEASE_MS;
/** 止めの間、残っている速さを抜く時定数(秒)。瞬間に0にはしない(慣性MUST)が、ほぼ即座に止まる。 */
export const POI_TOUCH_HOLD_DECAY_S = 0.025;
const lightK = (light?: boolean): number => (light ? 0.5 : 1);

/** 止めの最中か(移動の目標を0にし、残りの速さを POI_TOUCH_HOLD_DECAY_S で抜く)。 */
export const poiTouchHolding = (elapsedMs: number, light?: boolean): boolean =>
  elapsedMs >= 0 && elapsedMs < POI_TOUCH_HOLD_MS * lightK(light);

/** プレイヤーの歩きのつっかえ(移動の速さの倍率 0..1)。世界・敵・時間は止めない。止めの間は0、戻りは smoothstep で1へ。 */
export const poiTouchStallMult = (elapsedMs: number, light?: boolean): number => {
  const k = lightK(light);
  const hold = POI_TOUCH_HOLD_MS * k, rel = POI_TOUCH_RELEASE_MS * k;
  if (!(elapsedMs >= 0) || elapsedMs >= hold + rel) return 1;
  if (elapsedMs < hold) return 0;
  const u = clamp01((elapsedMs - hold) / rel);
  return u * u * (3 - 2 * u);
};

/** プレイヤーの体が建物から押し戻される量(px・見た目だけ・建物から離れる向き)。ease-out で出て ease-in で戻る。2回目以降は半分。 */
export const POI_TOUCH_PUSH_PX = 9;
export const POI_TOUCH_PUSH_IN_MS = 70;
export const POI_TOUCH_PUSH_OUT_MS = 150;
export const poiTouchPushPx = (elapsedMs: number, light?: boolean): number => {
  if (!(elapsedMs >= 0) || elapsedMs >= POI_TOUCH_PUSH_IN_MS + POI_TOUCH_PUSH_OUT_MS) return 0;
  const amp = POI_TOUCH_PUSH_PX * lightK(light);
  if (elapsedMs < POI_TOUCH_PUSH_IN_MS) return amp * easeOutCubic(elapsedMs / POI_TOUCH_PUSH_IN_MS);
  return amp * (1 - easeInQuad(clamp01((elapsedMs - POI_TOUCH_PUSH_IN_MS) / POI_TOUCH_PUSH_OUT_MS)));
};

/** カメラの押し込み(px・建物の方=画面の上へ)。0→8px を 80ms で加速して入り、220ms で減速して戻る。横ぶれなし。銃の反動(kick)は使わない。2回目以降は半分。 */
export const POI_TOUCH_CAM_PX = 8;
export const POI_TOUCH_CAM_IN_MS = 80;
export const POI_TOUCH_CAM_OUT_MS = 220;
export const poiTouchCamPx = (elapsedMs: number, light?: boolean): number => {
  if (!(elapsedMs >= 0) || elapsedMs >= POI_TOUCH_CAM_IN_MS + POI_TOUCH_CAM_OUT_MS) return 0;
  const amp = POI_TOUCH_CAM_PX * lightK(light);
  if (elapsedMs < POI_TOUCH_CAM_IN_MS) return amp * easeInQuad(elapsedMs / POI_TOUCH_CAM_IN_MS);
  return amp * (1 - easeOutCubic((elapsedMs - POI_TOUCH_CAM_IN_MS) / POI_TOUCH_CAM_OUT_MS));
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
