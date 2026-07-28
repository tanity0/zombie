// 病院オブジェクト(社長指示v0.25.2331)。
//
// 仕様:
// - 通常ステージに1つだけ立つ廃病院。**未確認汚染エリアのほぼ中間**(5000〜7500の中央=6250)に置く。
// - **拠点を解放するとその方角のマークが出る**(裏ボスと同じ=既存のPOI仕組みに相乗り。`pois.ts`)。
// - 近づくとサークルが出る。**3秒とどまるとワクチンを入手**(既存アイテム=死亡時に一度だけ復活)。
// - 入手すると病院はフェードアウトして消える(そのランでは再取得できない)。
//
// この層は renderer-agnostic(PixiJS非依存)。座標・当たり判定・滞在判定の純関数だけを置く。
// 描画は pixiScene、滞在の進行と付与は gameStore/useGameLoop が、ここの値を読んで行う。
import { footRect, resolveAabb, type Rect } from './obstacles';
import { DETOUR_DIST, DETOUR_CIRCLE_RADIUS, DETOUR_DWELL_MS, detourPosForSector } from './detourPoi';

/** 未確認汚染エリア(AREA_THRESHOLDS[2]〜[3])のほぼ中間。社長指示「未確認のほぼ中間らへんに」。 */
export const HOSPITAL_DIST = DETOUR_DIST.hospital; // = 6250

/** 近づくと出るサークルの半径(px)。帰還サークル(95)と同値=プレイヤーに馴染んだ大きさ。
 * §6.24 M48で武器庫も同じ値(DETOUR_CIRCLE_RADIUS)を共有するようになった=世界に1つの定義に統一。 */
export const HOSPITAL_CIRCLE_RADIUS = DETOUR_CIRCLE_RADIUS;
/** サークルが出はじめる距離(px・中心から)。「近づくとサークル」= これより遠いと描かない。 */
export const HOSPITAL_CIRCLE_REVEAL_DIST = 340;
/** サークル内にとどまる時間(ms)。社長指示「3秒待機」。 */
export const HOSPITAL_DWELL_MS = DETOUR_DWELL_MS;
/** 入手後のフェードアウト時間(ms)。 */
export const HOSPITAL_FADE_MS = 900;

/** 見た目の高さ(px・等倍時)。城(CASTLE_TARGET_HEIGHT=188)より一回り大きい建物として置く。 */
export const HOSPITAL_DISPLAY_H = 300;
/** 当たり判定=建物の土台だけ(絵より小さい)。等角の絵なので、足元の敷地に合わせた低い箱にする。 */
export const HOSPITAL_HITBOX_W = 260;
export const HOSPITAL_HITBOX_H = 80;

/**
 * 病院の立ち位置。**PACING_PUZZLE.md §6.24 M48で変更**: 「裏ボスの真反対で固定」から
 * 「4方角のうち、裏ボスのセクターを除いた残り3つへ毎ランランダムに割り当て」へ。
 * このランで病院に割り当てられたセクター番号(world/detourPoi.ts の assignDetourSectors。
 * gameStore の resetGame が1度だけ乱数を引いて確定させる)を受け取り、位置だけを計算する
 * 純関数(乱数はここでは引かない=呼び出し側と2箇所で結果がズレない)。
 * 距離は未確認汚染の中間(HOSPITAL_DIST)で固定。
 */
export const hospitalPos = (sector: number): { x: number; y: number } => detourPosForSector('hospital', sector);

/** 建物の当たり判定(足元基準・obstacles.tsの規約どおり)。 */
export const hospitalRect = (pos: { x: number; y: number }): Rect =>
  footRect(pos.x, pos.y, HOSPITAL_HITBOX_W, HOSPITAL_HITBOX_H);

/**
 * 病院の壁で移動を解決する。入手後(taken)は建物ごと消えるので素通り。
 * 遠くに居る時は判定自体を省く(1個しか無いので距離1回で足りる)。
 */
export const resolveHospitalCollision = (
  rect: Rect,
  pos: { x: number; y: number } | null,
  taken: boolean,
): { x: number; y: number } => {
  if (!pos || taken) return { x: rect.x, y: rect.y };
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  if (Math.abs(cx - pos.x) > 600 || Math.abs(cy - pos.y) > 600) return { x: rect.x, y: rect.y };
  return resolveAabb(rect, [hospitalRect(pos)]);
};

/** サークルの中心。建物の足元(=絵の下端)に置く。 */
export const hospitalCircleCenter = (pos: { x: number; y: number }): { x: number; y: number } => pos;

/** プレイヤー(矩形)の中心がサークル内か。 */
export const isInHospitalCircle = (
  player: { x: number; y: number; width: number; height: number },
  pos: { x: number; y: number } | null,
): boolean => {
  if (!pos) return false;
  const c = hospitalCircleCenter(pos);
  const px = player.x + player.width / 2, py = player.y + player.height / 2;
  return Math.hypot(px - c.x, py - c.y) <= HOSPITAL_CIRCLE_RADIUS;
};

/**
 * 滞在の進行。サークル内なら加算、外れたら**0へ戻す**(途中で出たらやり直し=拠点制圧と同じ流儀)。
 * 戻り値の done は「このtickで3秒に到達した」= 付与を1回だけ発火させるためのフラグ。
 */
export const tickHospitalDwell = (
  dwellMs: number, inside: boolean, dtMs: number,
): { dwellMs: number; done: boolean } => {
  if (!inside) return { dwellMs: 0, done: false };
  const next = dwellMs + Math.max(0, dtMs);
  return { dwellMs: Math.min(HOSPITAL_DWELL_MS, next), done: dwellMs < HOSPITAL_DWELL_MS && next >= HOSPITAL_DWELL_MS };
};
