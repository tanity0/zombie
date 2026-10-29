// ハンターの巡回(research/HUNTER_PATROL.md)の純関数。store も PixiJS も読まない=ヘッドレスでテストする。
// 社長 2026-10-29「ハンターもデンジャーゾーンをxに、巡回」「解放されてない地域のみ巡回」「解放されてる地域はワープしてパス」。
import { sectorIndexForAngle, POI_SECTORS } from '../world/pois';

/** 巡回の速さ(px/s・叩き台「巡回速度は早め」)。 */
export const HUNTER_PATROL_SPEED = 240;
/** 動き出し・止まりの時間(慣性)。 */
export const HUNTER_PATROL_ACCEL_S = 0.4;
/** ワープの薄れて消える/現れる尺(各)。 */
export const HUNTER_WARP_FADE_MS = 350;
/** 出撃から巡回の個体を置くまで(英雄・解放軍群と同じ3秒)。 */
export const HUNTER_PATROL_START_MS = 3000;
/** 区画の入り口から少し内側に現れる(境界の上で行き来しない)。 */
export const HUNTER_SECTOR_ENTRY_MARGIN_RAD = (6 * Math.PI) / 180;
/** 置く所はプレイヤーからこの距離以上(出撃直後に目の前へ置かない)。 */
export const HUNTER_PATROL_SPAWN_MIN_DIST = 2500;

const SECTOR_RAD = (Math.PI * 2) / POI_SECTORS;

/** 点の区画(拠点 i の方角=区画 i)。 */
export const sectorOfPos = (x: number, y: number): number => sectorIndexForAngle(Math.atan2(y, x));

/** 未解放の区画(拠点が captured でない方角)。拠点の位置から区画を引く(並びに依存しない)。 */
export const hunterOpenSectors = (bases: readonly { x: number; y: number; status: string }[]): Set<number> => {
  const out = new Set<number>();
  for (const b of bases) if (b.status !== 'captured') out.add(sectorOfPos(b.x, b.y));
  return out;
};

/**
 * 巡回の向き(画面で見て反時計回り=角度が減る向き・英雄と同じ)で、今の区画の次から数えて最初の未解放の区画の
 * 入り口の角度。未解放が無ければ null。今の区画しか未解放が無い時も、その区画の入り口(一周して戻る)。
 */
export const nextOpenSectorEntryAngle = (curSector: number, open: ReadonlySet<number>): number | null => {
  if (open.size === 0) return null;
  for (let k = 1; k <= POI_SECTORS; k++) {
    const j = (((curSector - k) % POI_SECTORS) + POI_SECTORS) % POI_SECTORS;
    if (open.has(j)) return j * SECTOR_RAD + SECTOR_RAD / 2 - HUNTER_SECTOR_ENTRY_MARGIN_RAD; // 角度が減る向きに入る=上の境界が入り口
  }
  return null;
};

/** 輪の上の点。 */
export const ringPoint = (angle: number, R: number): { x: number; y: number } => ({ x: Math.cos(angle) * R, y: Math.sin(angle) * R });

/**
 * 巡回の個体を置く点: 未解放の区画のどれかの、輪の上の無作為な点(境界の近くは避ける)。
 * プレイヤーから HUNTER_PATROL_SPAWN_MIN_DIST 以上の候補を優先(何度か引き直す)。未解放が無ければ null。
 */
export const hunterPatrolSpawnPoint = (
  open: ReadonlySet<number>, player: { x: number; y: number }, R: number, rng: () => number,
): { x: number; y: number; angle: number } | null => {
  const list = [...open];
  if (list.length === 0) return null;
  let best: { x: number; y: number; angle: number; d: number } | null = null;
  for (let tries = 0; tries < 8; tries++) {
    const j = list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
    const a = j * SECTOR_RAD + (rng() - 0.5) * (SECTOR_RAD - 2 * HUNTER_SECTOR_ENTRY_MARGIN_RAD);
    const p = ringPoint(a, R);
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (!best || d > best.d) best = { ...p, angle: a, d };
    if (d >= HUNTER_PATROL_SPAWN_MIN_DIST) break;
  }
  // 引き直しても近い所しか出なければ、未解放の区画の真ん中のうち一番遠い所(運に任せない)。
  if (best && best.d < HUNTER_PATROL_SPAWN_MIN_DIST) {
    for (const j of list) {
      const a = j * SECTOR_RAD, p = ringPoint(a, R), d = Math.hypot(p.x - player.x, p.y - player.y);
      if (d > best.d) best = { ...p, angle: a, d };
    }
  }
  return best ? { x: best.x, y: best.y, angle: best.angle } : null;
};

/** ワープの見た目の濃さ(0..1)。out=消える側の開始時刻、in=現れる側の開始時刻(どちらも gameTime)。 */
export const hunterWarpAlpha = (gt: number, warpOutAt: number | undefined, warpInAt: number | undefined): number => {
  if (warpInAt !== undefined && gt >= warpInAt) {
    const u = Math.min(1, (gt - warpInAt) / HUNTER_WARP_FADE_MS);
    return u * u * (3 - 2 * u);
  }
  if (warpOutAt !== undefined && gt >= warpOutAt) {
    const u = Math.min(1, (gt - warpOutAt) / HUNTER_WARP_FADE_MS);
    return 1 - u * u * (3 - 2 * u);
  }
  return 1;
};
