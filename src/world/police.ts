// 警察署オブジェクト(PACING_PUZZLE.md §6.24 M48。旧称「研究施設跡」→社長指示v0.25.2352で改名。
// 距離・アリーナ方式・報酬(専用スキル1つランダム)・入場コストは名称変更の前後で不変)。
//
// 仕様:
// - 研究対象区域のほぼ中間(2250)に1つ立つ寄り道POI。4方角のうち、裏ボス/病院/武器庫と
//   被らないセクターへ毎ランランダムに配置される(world/detourPoi.ts が割り当てを決める)。
// - 病院/武器庫と違いサークル+滞在ではなく**既存の囲いイベント(アリーナ)をそのまま流用**する
//   (§6.24 F1)。近づくと囲いが発生 → 全滅させると専用スキルを1つランダム入手。
// - 入手すると警察署はフェードアウトして消える(そのランでは再取得できない)。
//
// この層は renderer-agnostic(PixiJS非依存)。座標・当たり判定・近接判定の純関数だけを置く。
// 描画は pixiScene、アリーナの発生/進行/報酬付与は useGameLoop/gameStore が、ここの値を読んで行う。
import { footRect, resolveAabb, type Rect } from './obstacles';
import { DETOUR_DIST, detourPosForSector } from './detourPoi';

/** 研究対象区域(AREA_THRESHOLDS[0]〜[1])のほぼ中間。§6.24: 警察署方面=2250。 */
export const POLICE_DIST = DETOUR_DIST.police; // = 2250

// 囲いイベント(アリーナ)の半径。既存の ARENA_EVENT_RADIUS(useGameLoop.ts)と同じ値=240(§6.24 F1)。
// useGameLoop.ts 自身も同名の定数をローカルに持つ(playtestDriver.ts が既に同じ値を独立して持つのと
// 同じ既存の慣例=このゲームの「アリーナ半径」は各消費側がリテラルで共有する運用)。
export const POLICE_ARENA_RADIUS = 240;
/** 入手後のフェードアウト時間(ms)。病院/武器庫と同じ。 */
export const POLICE_FADE_MS = 900;

// 素材(社長支給v0.25.2352・public/sprites/police.png・520×472の等角ピクセルアート)。
// 横に広い絵なので**幅基準**で表示サイズを揃える(病院は高さ基準=HOSPITAL_DISPLAY_H)。armory.tsと
// 同じ考え方で幅を合わせる(素材の縦横比が違うので高さは自動的に病院よりわずかに大きくなる)。
// ★実機調整前提の仮値(社長指示v0.25.2352「妥当な値を置いたうえで実機調整前提と明記」)。
export const POLICE_DISPLAY_W = 380;
// 当たり判定=建物の土台だけ(絵より小さい・足元の敷地に合わせた低い箱)。病院の当たり判定と同寸を仮置き。
// ★実機調整前提の仮値。
export const POLICE_HITBOX_W = 260;
export const POLICE_HITBOX_H = 80;

/** 警察署の立ち位置。割り当てられたセクター番号から位置だけを計算する純関数(乱数はここで引かない)。 */
export const policePos = (sector: number): { x: number; y: number } => detourPosForSector('police', sector);

/** 建物の当たり判定(足元基準・obstacles.tsの規約どおり)。 */
export const policeRect = (pos: { x: number; y: number }): Rect =>
  footRect(pos.x, pos.y, POLICE_HITBOX_W, POLICE_HITBOX_H);

/**
 * 警察署の壁で移動を解決する。入手後(taken)は建物ごと消えるので素通り。
 * 遠くに居る時は判定自体を省く(1個しか無いので距離1回で足りる)。
 */
export const resolvePoliceCollision = (
  rect: Rect,
  pos: { x: number; y: number } | null,
  taken: boolean,
): { x: number; y: number } => {
  if (!pos || taken) return { x: rect.x, y: rect.y };
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  if (Math.abs(cx - pos.x) > 600 || Math.abs(cy - pos.y) > 600) return { x: rect.x, y: rect.y };
  return resolveAabb(rect, [policeRect(pos)]);
};

/**
 * プレイヤー(矩形の中心)が警察署アリーナの発生半径内に入ったか。
 * サークル+滞在ではなく「近づいた瞬間にアリーナ発生」なので、しきい値は1つだけ(dwellは無い)。
 */
export const isNearPolice = (
  player: { x: number; y: number; width: number; height: number },
  pos: { x: number; y: number } | null,
  radius: number = POLICE_ARENA_RADIUS,
): boolean => {
  if (!pos) return false;
  const px = player.x + player.width / 2, py = player.y + player.height / 2;
  return Math.hypot(px - pos.x, py - pos.y) <= radius;
};
