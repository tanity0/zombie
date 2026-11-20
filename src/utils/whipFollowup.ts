// ★鞭の追加攻撃(research/WHIP_FOLLOWUP.md・社長 2026-11-20「ヒットした瞬間反対にフリックで浮かせつつ引き寄せる /
//   その直後、進行方向にフリックすると、浮いてる敵を再度叩き落とし、2倍ダメージを与える」)。
// 判定だけを置く純関数(store にも描画にも依存しない)。数値は叩き台(実機で詰める)。
//  - 1段目(stage 'hit'): 鞭の振りが1体以上に当たった瞬間から WHIP_FOLLOWUP_WINDOW_MS の間の、振りと反対(120°以上)のフリック
//    =当たった敵を浮かせつつ、プレイヤーの体の縁から WHIP_PULL_GAP_PX 手前まで引き寄せる(速く始まり、着く手前で減速)。
//    進行方向・横のフリックはこの段では何も起きない(1段目を飛ばした叩きつけは無い)。
//  - 2段目(stage 'pulled'): 引き寄せた瞬間から同じ長さの受付の間の、振りの向き(60°以内)のフリック
//    =まだ浮いている引き寄せた敵(ボス級は浮かないので当たっていれば対象)を叩き落とし、鞭の1撃目の2倍のダメージ。
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
/** 叩き落としのダメージの倍率(鞭の1撃目に対して)。 */
export const WHIP_SLAM_DAMAGE_MULT = 2;
/** 引き寄せの途中で壁・帯に押し戻された量がこれを超えたら、そこで止める(途中で止まればそこで止まる)。 */
export const WHIP_PULL_BLOCK_EPS_PX = 3;
/** 引き寄せの砂埃の尾の間隔(ms)。 */
export const WHIP_PULL_DUST_INTERVAL_MS = 45;

export type WhipFollowupKind = 'pull' | 'slam';

/** 受付の窓(store が持つ)=共通の窓+段。dirX/dirY=振りの向き。hitIds=1段目=その振りで当たった敵 / 2段目=引き寄せた敵(とボス級)。 */
export type WhipFollowupStage = 'hit' | 'pulled';
// lockUntil=プレイヤーの位置と向きを止めておく終わり(社長「この動作中はプレイヤーの位置と向きは固定」・Date.now)。
//   引き寄せた瞬間から2段目の受付の終わりまで/叩き落としたらその止めの終わりまで。1段目(当たっただけ)では止めない。
export type WhipFollowupWindow = FlickFollowupWindow & { stage: WhipFollowupStage; lockUntil?: number };

/** 叩き落とした後に位置と向きを止めておく長さ(ms)=叩き落としのヒットストップと同じ。 */
export const WHIP_SLAM_HITSTOP_MS = 120;

/** 追加攻撃の最中か(プレイヤーの位置と向きを止める・振りの向きでフリックを判定する)。 */
export const isWhipFollowupLocked = (w: WhipFollowupWindow | null | undefined, now: number): boolean =>
  !!w && w.lockUntil !== undefined && now < w.lockUntil;

/** 今の段とフリックの向きの帯で、何を出すか(1段目×反対=引き寄せ / 2段目×進行方向=叩き落とし / それ以外=何も起きない)。 */
export const whipFollowupAction = (stage: WhipFollowupStage, kind: WhipFollowupKind | null): WhipFollowupKind | null =>
  stage === 'hit' && kind === 'pull' ? 'pull' : stage === 'pulled' && kind === 'slam' ? 'slam' : null;

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
 * 叩き落としの対象(id の並び)。2段目の受付の敵のうち、生きていて、まだ浮いている敵。ボス級は浮かないので、当たっていれば浮きを問わず対象。
 * 浮きが終わった(着地した)・倒れた敵は外れる=全員外れたら何も起きない。
 */
export const whipSlamTargets = (
  enemies: readonly { id: string; alive: boolean; airborne: boolean; boss: boolean }[], ids: readonly string[],
): string[] => {
  const want = new Set(ids);
  return enemies.filter(e => want.has(e.id) && e.alive && (e.airborne || e.boss)).map(e => e.id);
};
