import type { Pickup } from '../types/game';
import { isMagnetPickupType } from './collisionUtils';

// スキル「マグネット」= 落ち物の吸い寄せ(社長裁定2026-09-13・案A)。
// 旧: 拾得枠を中心基準で ×1.1/1.2/1.3 に広げるだけ(片側3〜5px=体感ゼロ)。
// 新: 半径内の落ち物が自機へ**滑ってくる**。ドッグ(遠くへ走って回収・往復に時間が掛かる)との役割分担=近くを即座に。
// ドッグは近くの物も拾うままだが、移動速度を半分にした(同裁定)ので、近場はマグネットが先に取る。
// 動きは慣性 MUST: 縁では遅く、近づくほど速く(加速)。止まる時は拾得で消えるので減速は要らない。
// 対象は collisionUtils.isMagnetPickupType の1本(弾薬+コイン。覚醒=アイテム・経験値も)。箸箱・任務品・投擲中の物は動かさない。

/** 吸い寄せ半径(px)。index=スキルLv(0=未取得)。実機で絞る前提で大きめ(CLAUDE.md「動きは大きく」)。 */
export const MAGNET_PULL_RADIUS_BY_LEVEL: readonly number[] = [0, 70, 100, 130];
/** 縁での速さ(px/s)と、触れる直前の速さ(px/s)。 */
export const MAGNET_PULL_EDGE_SPEED = 140;
export const MAGNET_PULL_CORE_SPEED = 900;
/** 拾い物の描画サイズ(collisionUtils と同じ 16×16)。中心=x+8,y+8。 */
const PICKUP_HALF = 8;

const isInFlight = (p: Pickup, nowMs: number): boolean =>
  p.throwStartAt !== undefined && p.throwDuration !== undefined && nowMs - p.throwStartAt < p.throwDuration;

/** 距離 d(0..radius)での速さ。縁=EDGE、中心=CORE を2乗のイージングで結ぶ(近づくほど加速=慣性)。 */
export const magnetPullSpeedAt = (d: number, radius: number): number => {
  const k = Math.max(0, Math.min(1, 1 - d / Math.max(1, radius)));
  return MAGNET_PULL_EDGE_SPEED + (MAGNET_PULL_CORE_SPEED - MAGNET_PULL_EDGE_SPEED) * k * k;
};

export interface MagnetPullResult {
  pickups: Pickup[];
  /** 1つでも動いたか。false なら pickups は入力と同じ参照(store の set を省くため)。 */
  moved: boolean;
}

/**
 * 1フレームぶんの吸い寄せ。cx,cy=自機の中心。radius<=0 なら何もしない。
 * 動かす条件: 半径内・対象種(覚醒フラグ込み)・投擲中でない・守護霊の私物(ownerGhostId)でない。
 * 中心を越えて行き過ぎない(step は距離で打ち切る)。
 */
export const stepMagnetPull = (
  pickups: readonly Pickup[], cx: number, cy: number, radius: number, awaken: boolean, dtSec: number, nowMs: number,
): MagnetPullResult => {
  if (radius <= 0 || dtSec <= 0 || pickups.length === 0) return { pickups: pickups as Pickup[], moved: false };
  let moved = false;
  const out = pickups.map(p => {
    if (p.ownerGhostId !== undefined) return p;
    if (!isMagnetPickupType(p.type, awaken)) return p;
    if (isInFlight(p, nowMs)) return p;
    const px = p.x + PICKUP_HALF, py = p.y + PICKUP_HALF;
    const dx = cx - px, dy = cy - py;
    const d = Math.hypot(dx, dy);
    if (d > radius || d < 0.5) return p;
    const step = Math.min(d, magnetPullSpeedAt(d, radius) * dtSec);
    moved = true;
    return { ...p, x: p.x + (dx / d) * step, y: p.y + (dy / d) * step };
  });
  return moved ? { pickups: out, moved: true } : { pickups: pickups as Pickup[], moved: false };
};
