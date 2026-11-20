// ★鞭の追加攻撃(research/WHIP_FOLLOWUP.md・社長 2026-11-20「攻撃を当てた瞬間に反対にフリックすると引き寄せ/進行方向にフリックすると叩きつけ」)。
// 判定だけを置く純関数(store にも描画にも依存しない)。数値は叩き台(実機で詰める)。
//  - 受付: 鞭の振りが1体以上に当たった瞬間から WHIP_FOLLOWUP_WINDOW_MS(実時間=Date.now)。1振りに1回だけ。
//  - 向き: 振りの向きとフリックの向きのなす角 ≤60°=叩きつけ / ≥120°=引き寄せ / その間(横)=何も起きない。
//  - 引き寄せ: 当たった敵をプレイヤーの体の縁から WHIP_PULL_GAP_PX 手前まで(速く始まり、着く手前で減速)。
//  - 叩きつけ: 振りの向きの帯(長さ=鞭の届く距離・幅 WHIP_SLAM_WIDTH_PX)+1撃目の当たりの敵(帯の外でも必ず)。
import { bandBoxOverlap } from './meleeImpact';
import {
  FLICK_FOLLOWUP_WINDOW_MS, FLICK_FOLLOWUP_FORWARD_DEG, FLICK_FOLLOWUP_BACK_DEG, isFlickFollowupOpen, flickBand, type FlickFollowupWindow,
} from './flickFollowup';

/** 受付の長さ・角度の帯は「当てた直後のフリック」の共通部品(utils/flickFollowup)と同じ1本。 */
export const WHIP_FOLLOWUP_WINDOW_MS = FLICK_FOLLOWUP_WINDOW_MS;
export const WHIP_FOLLOWUP_FORWARD_DEG = FLICK_FOLLOWUP_FORWARD_DEG;
export const WHIP_FOLLOWUP_BACK_DEG = FLICK_FOLLOWUP_BACK_DEG;
/** 引き寄せの止まる位置 = プレイヤーの体の縁からこの距離手前(敵の体の縁まで・重ならない)。叩き台。 */
export const WHIP_PULL_GAP_PX = 40;
/** 引き寄せの長さ(ms・実時間)。叩き台。 */
export const WHIP_PULL_MS = 260;
/** 叩きつけの帯の幅(px)。叩き台。 */
export const WHIP_SLAM_WIDTH_PX = 90;
/** 引き寄せの途中で壁・帯に押し戻された量がこれを超えたら、そこで止める(途中で止まればそこで止まる)。 */
export const WHIP_PULL_BLOCK_EPS_PX = 3;
/** 引き寄せの砂埃の尾の間隔(ms)。 */
export const WHIP_PULL_DUST_INTERVAL_MS = 45;

export type WhipFollowupKind = 'pull' | 'slam';

/** 受付の窓(store が持つ)=共通の窓。dirX/dirY=振りの向き。hitIds=その振りで当たった敵。 */
export type WhipFollowupWindow = FlickFollowupWindow;

/** 引き寄せ中の敵の欄(Enemy.whipPull)。座標は敵の左上(x/y)。時刻は Date.now。 */
export interface WhipPullState {
  fromX: number; fromY: number;
  toX: number; toY: number;
  startAt: number; endAt: number;
  /** 砂埃の尾を最後に出した時刻(描画の種・判定なし)。 */
  dustAt?: number;
}

/** 受付が開いているか(当たった瞬間〜+300ms・未使用)。 */
export const isWhipFollowupOpen = isFlickFollowupOpen;

/** 振りの向きとフリックの向きから、どちらの追加攻撃か(進行方向=叩きつけ・反対=引き寄せ・横=null)。 */
export const classifyWhipFlick = (
  swing: { x: number; y: number }, flick: { x: number; y: number },
): WhipFollowupKind | null => {
  const b = flickBand(swing, flick);
  return b === 'forward' ? 'slam' : b === 'back' ? 'pull' : null;
};

interface Box { x: number; y: number; width: number; height: number }

/** 箱の中心から向き u への「縁までの距離」(支持関数)。 */
const halfExtentAlong = (b: Box, ux: number, uy: number): number =>
  (Math.abs(ux) * b.width + Math.abs(uy) * b.height) / 2;

/**
 * 引き寄せの止まる位置(敵の左上)。敵の中心→プレイヤーの中心の線上で、敵の縁がプレイヤーの縁から gap 手前になる所。
 * 既にそれより近い(重なっている/手前にいる)なら null(動かさない)。
 */
export const whipPullTarget = (player: Box, enemy: Box, gap = WHIP_PULL_GAP_PX): { x: number; y: number } | null => {
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
  const dx = ecx - pcx, dy = ecy - pcy;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return null;
  const ux = dx / d, uy = dy / d;
  const stop = halfExtentAlong(player, ux, uy) + gap + halfExtentAlong(enemy, ux, uy);
  if (d <= stop) return null;
  return { x: pcx + ux * stop - enemy.width / 2, y: pcy + uy * stop - enemy.height / 2 };
};

/** 引き寄せの進み(0..1)。速く始まり、着く手前で減速(ease-out の3乗)。 */
export const whipPullProgress = (startAt: number, endAt: number, now: number): number => {
  const span = Math.max(1, endAt - startAt);
  const t = Math.max(0, Math.min(1, (now - startAt) / span));
  return 1 - (1 - t) ** 3;
};

/** 引き寄せの今の位置(敵の左上・壁と帯のクランプの前)。 */
export const whipPullPosAt = (p: WhipPullState, now: number): { x: number; y: number } => {
  const k = whipPullProgress(p.startAt, p.endAt, now);
  return { x: p.fromX + (p.toX - p.fromX) * k, y: p.fromY + (p.toY - p.fromY) * k };
};

/**
 * 叩きつけの対象(id の並び)。帯(起点=プレイヤーの中心・向き=振りの向き・長さ=reach・幅=width)に掛かる敵と、
 * 1撃目で当たった敵(firstHitIds・帯の外でも必ず)。並びは enemies の順・重複なし。除外(死体・ボスの区分など)は呼び手。
 */
export const whipSlamMembers = (
  enemies: readonly (Box & { id: string })[],
  pcx: number, pcy: number, ux: number, uy: number, reach: number,
  firstHitIds: readonly string[], width = WHIP_SLAM_WIDTH_PX,
): string[] => {
  const ul = Math.hypot(ux, uy) || 1;
  const nx = ux / ul, ny = uy / ul;
  const first = new Set(firstHitIds);
  const out: string[] = [];
  for (const e of enemies) {
    if (first.has(e.id) || bandBoxOverlap(pcx, pcy, nx, ny, reach, width / 2, e)) out.push(e.id);
  }
  return out;
};
