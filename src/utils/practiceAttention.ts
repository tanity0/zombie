// 変異体対策室(練習ラン)だけ、ボスの出現のアテンションを開始直後に出すための純関数。
// 社長指示2026-11-23「全部のボスでアテンションが出る位置に配置して欲しい(ギリギリ)。その上で、アテンションが最初に」。
// ★本編(練習でない出撃)では全関数が今の値をそのまま返す=挙動は1bitも変えない。
import { zoomedViewportBounds } from './cameraZoom';

/** 中心点を置く位置=画面の縁から内側へこの画面px(叩き台)。 */
export const PRACTICE_EDGE_INSET_SCREEN_PX = 24;

/** 出現→アテンションの遅れ(賞金首・幻影・城ボスの+950ms)。練習だけ0=出現と同時。 */
export const practiceBossAttnDelayMs = (isPractice: boolean, baseMs: number): number => (isPractice ? 0 : baseMs);

/** 開始から出現までの待ち(英雄・解放群・宇宙飛行群・亡霊の3秒)。練習だけ0=最初のフレーム。 */
export const practiceSpawnWaitMs = (isPractice: boolean, baseMs: number): number => (isPractice ? 0 : baseMs);

/**
 * 起点 origin から向き dir の線上を進んで、中心点が「画面(isPointInZoomedViewport と同じ可視域)の縁から内側へ
 * insetScreenPx」の矩形の縁に着くまでの距離(ワールドpx)。起点がその矩形の外(=カメラがまだ合っていない)・
 * 向きが0なら null(呼び出し側は次のフレームで測り直す)。
 */
export const practiceEdgeInsideDistance = (
  origin: { x: number; y: number }, dir: { x: number; y: number },
  camera: { x: number; y: number }, viewport: { width: number; height: number }, zoom: number,
  insetScreenPx = PRACTICE_EDGE_INSET_SCREEN_PX,
): number | null => {
  const len = Math.hypot(dir.x, dir.y);
  if (!(len > 0)) return null;
  const ux = dir.x / len, uy = dir.y / len;
  const b = zoomedViewportBounds(camera, viewport, zoom, -insetScreenPx);
  if (!(b.right > b.left && b.bottom > b.top)) return null;
  if (origin.x < b.left || origin.x > b.right || origin.y < b.top || origin.y > b.bottom) return null;
  let t = Infinity;
  if (ux > 1e-9) t = Math.min(t, (b.right - origin.x) / ux);
  else if (ux < -1e-9) t = Math.min(t, (b.left - origin.x) / ux);
  if (uy > 1e-9) t = Math.min(t, (b.bottom - origin.y) / uy);
  else if (uy < -1e-9) t = Math.min(t, (b.top - origin.y) / uy);
  return Number.isFinite(t) ? Math.max(0, t) : null;
};
