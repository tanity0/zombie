import type { EnemyType } from '../types/game';

// 文脈カメラズーム: 敵が多い/大型がいるほど「少し」引く。当たり/射程は変えないが、スポーンと
// ボスの交戦・離脱・画面外判定は、引いた分の実可視域に合わせる(=同じ target をゲームロジックも読む)。
// この純関数を pixiScene(カメラ)と useGameLoop/store(判定)の両方から使う。
//
// 社長指示の効き幅(私案・実機調整前提):
//  ・引きは「一回り」= 最大 CONTEXT_ZOOM_MIN(0.9)。
//  ・敵数 7体までは固定(引かない)、8体以上で線形に引き、20体で最大。
//  ・通常の大型(reaper/hunter)は従来どおり0.7。正規ボスは体格と距離に応じた専用値を使う。

export const CONTEXT_ZOOM_MIN = 0.8;        // 最大の引き(社長指示で引き幅2倍: 1.0→0.9 の 0.1 → 0.2)
export const CONTEXT_ZOOM_COUNT_FLOOR = 7;  // この体数までは引かない
export const CONTEXT_ZOOM_COUNT_CEIL = 20;  // この体数で最大引き

// 通常戦闘の引き(体数ドリブン=CONTEXT_ZOOM_MIN)は**据え置き**。`?bosszoom=0.65` 等を
// 指定した時は距離/体格プロファイルを固定値で上書きできる(0.3〜1)。指定無しなら下記の既定値。
const BOSS_ZOOM_OVERRIDE: number | null = (() => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('bosszoom');
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0.3 && n <= 1 ? n : null;
})();
export const BOSS_ZOOM_MIN = BOSS_ZOOM_OVERRIDE ?? 0.7;

// Boss camera v2: preserve the close-up scale, then reveal more of the arena as
// the player opens distance. Distances are AABB-edge gaps, not centre-to-centre,
// so a very wide boss does not zoom out merely because its centre is far away.
export const BOSS_DISTANCE_ZOOM_NEAR_PX = 180;
export const BOSS_DISTANCE_ZOOM_FAR_PX = 500;
export const BOSS_DISTANCE_ZOOM_MIN = BOSS_ZOOM_OVERRIDE ?? 0.58;
export const BOSS_DISTANCE_ZOOM_TAU = 0.45;
export const BOSS_DISTANCE_ZOOM_RETURN_TAU = 1.0;

export type BossZoomClass = 'compact' | 'standard' | 'giant';
export interface BossZoomProfile { near: number; far: number }

export const BOSS_ZOOM_PROFILES: Record<BossZoomClass, BossZoomProfile> = {
  compact: { near: 0.72, far: 0.66 },
  standard: { near: 0.70, far: 0.62 },
  giant: { near: 0.70, far: 0.58 },
};

const COMPACT_BOSS_TYPES = new Set<EnemyType>([
  'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel', 'idol',
]);
const GIANT_BOSS_TYPES = new Set<EnemyType>(['mimir', 'jormungand', 'skadi']);

export const bossZoomClassFor = (type: EnemyType, isStoryBoss = false): BossZoomClass => {
  if (type === 'giantbat' && isStoryBoss) return 'giant';
  if (GIANT_BOSS_TYPES.has(type)) return 'giant';
  if (COMPACT_BOSS_TYPES.has(type)) return 'compact';
  return 'standard';
};

export const bossDistanceZoomTarget = (
  type: EnemyType, bodyDistancePx: number, isStoryBoss = false,
): number => {
  if (BOSS_ZOOM_OVERRIDE != null) return BOSS_ZOOM_OVERRIDE;
  const profile = BOSS_ZOOM_PROFILES[bossZoomClassFor(type, isStoryBoss)];
  const rawT = (bodyDistancePx - BOSS_DISTANCE_ZOOM_NEAR_PX)
    / (BOSS_DISTANCE_ZOOM_FAR_PX - BOSS_DISTANCE_ZOOM_NEAR_PX);
  const t = Math.max(0, Math.min(1, rawT));
  const smoothT = t * t * (3 - 2 * t);
  return profile.near + (profile.far - profile.near) * smoothT;
};

export interface Aabb { x: number; y: number; width: number; height: number }
export const aabbGapDistance = (a: Aabb, b: Aabb): number => {
  const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
  const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
  return Math.hypot(dx, dy);
};

/** ズーム後も画面上の距離を一定に保つため、画面pxをワールドpxへ戻す。寄り方向では拡縮しない。 */
export const zoomCompensatedWorldDistance = (screenPx: number, zoom: number): number => {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? Math.min(1, zoom) : 1;
  return screenPx / safeZoom;
};

export interface ZoomedViewportBounds { left: number; top: number; right: number; bottom: number }

/** 引きズーム後に実際に見えるワールド矩形。余白は画面pxの見た目を保ったまま換算する。 */
export const zoomedViewportBounds = (
  camera: { x: number; y: number }, viewport: { width: number; height: number },
  zoom: number, marginScreenPx = 0,
): ZoomedViewportBounds => {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? Math.min(1, zoom) : 1;
  const visibleW = viewport.width / safeZoom;
  const visibleH = viewport.height / safeZoom;
  const extraX = (visibleW - viewport.width) / 2;
  const extraY = (visibleH - viewport.height) / 2;
  const marginWorld = marginScreenPx / safeZoom;
  return {
    left: camera.x - extraX - marginWorld,
    top: camera.y - extraY - marginWorld,
    right: camera.x + viewport.width + extraX + marginWorld,
    bottom: camera.y + viewport.height + extraY + marginWorld,
  };
};

export const isPointInZoomedViewport = (
  x: number, y: number,
  camera: { x: number; y: number }, viewport: { width: number; height: number },
  zoom: number, marginScreenPx = 0,
): boolean => {
  const b = zoomedViewportBounds(camera, viewport, zoom, marginScreenPx);
  return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
};

// ★**安全マージンの基準はこの絶対最小値**(v0.25.2412)。
// 背景のオーバースキャン(ZOOM_OVERSCAN)・敵の回収/湧き距離・カリングは「**一番引いた時でも
// 破綻しない**」ことが条件なので、`CONTEXT_ZOOM_MIN` ではなく必ずこちらを見ること。
// CLAUDE.md の「ズーム引き考慮(必須)」で言及している v0.25.1324/1325 の潜伏バグは、
// 引きの値とマージンの基準がズレると再発する(レイヤーごとに漏れて潜伏するので気づきにくい)。
export const ZOOM_MIN_ABS = Math.min(CONTEXT_ZOOM_MIN, BOSS_ZOOM_MIN, BOSS_DISTANCE_ZOOM_MIN);

// 大型敵(即・最大引き対象)。パンプキン/screamer は含めない(社長指示)。
const LARGE_ZOOM_TYPES = new Set<string>(['reaper', 'giantbat', 'mimir', 'jormungand', 'skadi', 'thor', 'hunter']);
export const isLargeForZoom = (type: string): boolean => LARGE_ZOOM_TYPES.has(type);

// デバッグ: ?zoomlock=1 で常時最大引き(CONTEXT_ZOOM_MIN)に固定、?zoomlock=0.9 等の数値でその倍率に固定。
// ズーム引き対応漏れ(v0.25.1324/1325で修正した潜伏バグの類)を意図的に炙り出すための開発用フラグ。
// 描画(pixiScene)と湧き/回収(useGameLoop)の両方が contextZoomTarget を読むため、ここで固定すれば
// 全系統が一貫する。通常プレイ(パラメータ無し)は完全に従来どおり(社長承認 v0.25.1331)。
const ZOOM_LOCK: number | null = (() => {
  if (typeof window === 'undefined') return null; // ヘッドレス(テスト)では常に無効
  const v = new URLSearchParams(window.location.search).get('zoomlock');
  if (v == null) return null;
  if (v === '1') return CONTEXT_ZOOM_MIN;
  const n = Number(v);
  return Number.isFinite(n) && n > 0.3 && n <= 1 ? n : CONTEXT_ZOOM_MIN;
})();

// 目標ズーム(1.0=等倍)。敵数・大型・交戦中ボスのうち「最も深い引き」を採用。
export const contextZoomTarget = (
  enemyCount: number, hasLarge: boolean, engagedBossTarget: number | null = null,
): number => {
  if (ZOOM_LOCK != null) return ZOOM_LOCK;
  const t = Math.min(1, (enemyCount - CONTEXT_ZOOM_COUNT_FLOOR) / (CONTEXT_ZOOM_COUNT_CEIL - CONTEXT_ZOOM_COUNT_FLOOR));
  const crowdTarget = enemyCount <= CONTEXT_ZOOM_COUNT_FLOOR
    ? 1
    : 1 + (CONTEXT_ZOOM_MIN - 1) * t;
  return Math.min(crowdTarget, hasLarge ? BOSS_ZOOM_MIN : 1, engagedBossTarget ?? 1);
};
