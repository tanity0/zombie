// 武器庫オブジェクト(PACING_PUZZLE.md §6.24 M48)。
//
// 仕様:
// - デンジャーゾーンのほぼ中間(4000)に1つ立つ寄り道POI。4方角のうち、裏ボス/病院/警察署と
//   被らないセクターへ毎ランランダムに配置される(world/detourPoi.ts が割り当てを決める)。
// - 病院と同じ「近づく→サークル→3秒滞在」の枠組み(world/hospital.ts と対の実装)。
// - 3秒滞在すると **100スクラップ を払って Tier3装備を確定入手**(社長指示v0.25.2425で200→100。
//   社長確認v0.25.3173「武器庫は100です」)。スクラップ不足なら何も起きない
//   =サークルを出入りすれば再挑戦できる。既存の dwell 挙動をそのまま流用)。
// - 入手すると武器庫はフェードアウトして消える(そのランでは再取得できない)。
//
// この層は renderer-agnostic(PixiJS非依存)。座標・当たり判定・滞在判定の純関数だけを置く。
// 描画は pixiScene、滞在の進行と付与(スクラップ消費+装備ロール)は gameStore が、ここの値を読んで行う。
import { footRect, resolveAabb, type Rect } from './obstacles';
import { DETOUR_DIST, DETOUR_CIRCLE_RADIUS, DETOUR_DWELL_MS, detourPosForSector } from './detourPoi';

/** デンジャーゾーン(AREA_THRESHOLDS[1]〜[2])の中点。§6.24: 武器庫方面=4000(不変)。 */
export const ARMORY_DIST = DETOUR_DIST.armory; // = 4000

/** 近づくと出るサークルの半径/滞在時間。病院と同じ値(§6.24 A4)。 */
export const ARMORY_CIRCLE_RADIUS = DETOUR_CIRCLE_RADIUS; // = 95
export const ARMORY_CIRCLE_REVEAL_DIST = 340; // 病院の HOSPITAL_CIRCLE_REVEAL_DIST と同じ
export const ARMORY_DWELL_MS = DETOUR_DWELL_MS; // = 3000
/** 入手後のフェードアウト時間(ms)。病院と同じ。 */
export const ARMORY_FADE_MS = 900;

/** スクラップ支払い額(§6.24 E1・社長裁定v0.25.2350)。 */
// 社長指示v0.25.2425「条件を100に下げる。200貯めるの大変なので」。
export const ARMORY_SCRAP_COST = 100;

// 素材(社長支給v0.25.2352・public/sprites/armory.png・520×394の等角ピクセルアート)。
// 横に広い絵なので**幅基準**で表示サイズを揃える(病院は高さ基準=HOSPITAL_DISPLAY_H)。
// 380px幅 = 病院(HOSPITAL_DISPLAY_H=300・実素材440×356→表示幅換算 約371px)と近い見た目の大きさになる値。
// ★実機調整前提の仮値(社長指示v0.25.2352「妥当な値を置いたうえで実機調整前提と明記」)。
export const ARMORY_DISPLAY_W = 380;
// 当たり判定=建物の土台だけ(絵より小さい・足元の敷地に合わせた低い箱)。病院の当たり判定と同寸を仮置き。
// ★実機調整前提の仮値。
export const ARMORY_HITBOX_W = 260;
export const ARMORY_HITBOX_H = 80;

/** 武器庫の立ち位置。割り当てられたセクター番号から位置だけを計算する純関数(乱数はここで引かない)。 */
export const armoryPos = (sector: number, offsetRad = 0): { x: number; y: number } => detourPosForSector('armory', sector, offsetRad);

/** 建物の当たり判定(足元基準・obstacles.tsの規約どおり)。 */
export const armoryRect = (pos: { x: number; y: number }): Rect =>
  footRect(pos.x, pos.y, ARMORY_HITBOX_W, ARMORY_HITBOX_H);

/**
 * 武器庫の壁で移動を解決する。入手後(taken)は建物ごと消えるので素通り。
 * 遠くに居る時は判定自体を省く(1個しか無いので距離1回で足りる)。
 */
export const resolveArmoryCollision = (
  rect: Rect,
  pos: { x: number; y: number } | null,
  taken: boolean,
): { x: number; y: number } => {
  if (!pos || taken) return { x: rect.x, y: rect.y };
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  if (Math.abs(cx - pos.x) > 600 || Math.abs(cy - pos.y) > 600) return { x: rect.x, y: rect.y };
  return resolveAabb(rect, [armoryRect(pos)]);
};

/** サークルの中心。建物の足元(=絵の下端)に置く。 */
export const armoryCircleCenter = (pos: { x: number; y: number }): { x: number; y: number } => pos;

/** プレイヤー(矩形)の中心がサークル内か。 */
export const isInArmoryCircle = (
  player: { x: number; y: number; width: number; height: number },
  pos: { x: number; y: number } | null,
): boolean => {
  if (!pos) return false;
  const c = armoryCircleCenter(pos);
  const px = player.x + player.width / 2, py = player.y + player.height / 2;
  return Math.hypot(px - c.x, py - c.y) <= ARMORY_CIRCLE_RADIUS;
};

/**
 * 滞在の進行。サークル内なら加算、外れたら**0へ戻す**(病院と同じ流儀)。
 * 戻り値の done は「このtickで3秒に到達した」= 付与判定(スクラップ支払い)を1回だけ発火させるフラグ。
 * スクラップが足りない場合は呼び出し側(gameStore)が付与しない=このtickの done は消費される。
 */
export const tickArmoryDwell = (
  dwellMs: number, inside: boolean, dtMs: number,
): { dwellMs: number; done: boolean } => {
  if (!inside) return { dwellMs: 0, done: false };
  const next = dwellMs + Math.max(0, dtMs);
  return { dwellMs: Math.min(ARMORY_DWELL_MS, next), done: dwellMs < ARMORY_DWELL_MS && next >= ARMORY_DWELL_MS };
};
