// ★鞭の追加攻撃(research/WHIP_FOLLOWUP.md・社長 2026-11-20「ヒットした瞬間反対にフリックで浮かせつつ引き寄せる /
//   その直後、進行方向にフリックすると、浮いてる敵を再度叩き落とし、2倍ダメージを与える」)。
// 判定だけを置く純関数(store にも描画にも依存しない)。数値は叩き台(実機で詰める)。
//  - 1段目(stage 'hit'): 鞭の振りが1体以上に当たった瞬間から WHIP_FOLLOWUP_WINDOW_MS の間の、振りと反対(120°以上)のフリック
//    =当たった敵を浮かせつつ、プレイヤーの体の縁から WHIP_PULL_GAP_PX 手前まで引き寄せる(速く始まり、着く手前で減速)。
//    進行方向・横のフリックはこの段では何も起きない(1段目を飛ばした叩きつけは無い)。
//  - 2段目(stage 'pulled'): 引き寄せた敵が浮き上がり切った(打ち上げの頂点)瞬間から同じ長さの受付の間の、振りの向き(60°以内)のフリック
//    (社長「鞭の３段目は、敵が浮いたのを見てから入力窓。(早すぎてもだめ)」=頂点より前のフリックは何も起きない・受付も消費しない・覚えない)
//    =まだ浮いている引き寄せた敵(ボス級は浮かないので当たっていれば対象)を叩き落とし、鞭の1撃目の2倍のダメージ。
import {
  FLICK_FOLLOWUP_WINDOW_MS, FLICK_FOLLOWUP_FORWARD_DEG, FLICK_FOLLOWUP_BACK_DEG, isFlickFollowupOpen, flickBand, type FlickFollowupWindow,
} from './flickFollowup';
import { brawlerFallShape, brawlerJugglePush, type BrawlerJuggleFields } from './brawlerCombo';
import { BRAWLER_LIFT_MS, BRAWLER_LIFT_RISE_FRAC, BLAST_LIFT_SHAPE } from './brawler';
import type { BrawlerMoveKey } from './brawlerTypes';

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
// armAt=2段目(stage 'pulled')だけ: 引き寄せた瞬間。叩き落としの受付(hitAt)は浮き上がり切った瞬間に開くので、armAt..hitAt は「早すぎ」の間。
export type WhipFollowupWindow = FlickFollowupWindow & { stage: WhipFollowupStage; lockUntil?: number; armAt?: number };

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

/** 受付が開いているか(当たった瞬間〜+300ms・未使用)。2段目は hitAt=浮き上がり切った瞬間なので、それより前は開いていない。 */
export const isWhipFollowupOpen = isFlickFollowupOpen;

/**
 * 受付の今の相(社長「鞭の３段目は、敵が浮いたのを見てから入力窓。(早すぎてもだめ)」「入力窓の長さは広げない。覚えもしない」)。
 *  - 'open' = 受付の中(hitAt〜+WHIP_FOLLOWUP_WINDOW_MS・未使用)。
 *  - 'early' = 2段目の「早すぎ」の間(引き寄せた瞬間 armAt 〜 浮き上がり切る hitAt の手前)。フリックは何も起こさず、受付も消費しない(覚えもしない)。
 *  - null = それ以外(受付なし・使った・過ぎた・当たりなし)。
 */
export type WhipFollowupPhase = 'early' | 'open';
export const whipFollowupPhase = (w: WhipFollowupWindow | null | undefined, now: number): WhipFollowupPhase | null => {
  if (!w || w.used || w.hitIds.length === 0) return null;
  if (now < w.hitAt) return w.armAt !== undefined && now >= w.armAt ? 'early' : null;
  return isFlickFollowupOpen(w, now) ? 'open' : null;
};

/**
 * 浮きの弧が頂点に達する時刻(Date.now)=浮き上がり切った瞬間。式は描画と同じ弧(utils/brawlerCombo の brawlerJuggleHeightRel・utils/brawler の brawlerLiftArcRel)の
 * 上りの終わり(上りの割合 rise は落ちる部分の伸ばし brLiftFallK・爆発の弧を反映)。地面バウンドは頭の落ちる区間の後の弧の上りの終わり。
 * 押し上げ0(叩き落とし・ダウン)は始まりが一番高い=始まりの時刻。浮いていなければ null。
 */
export const whipLiftApexAt = (e: BrawlerJuggleFields): number | null => {
  if (e.brawlerLiftAt === undefined) return null;
  const ms = e.brLiftMs ?? BRAWLER_LIFT_MS;
  if ((e.brLiftPeak ?? 1) <= 0) return e.brawlerLiftAt;
  const drop = Math.max(0, e.brLiftDropMs ?? 0);
  const shape = brawlerFallShape(e.brLiftFallK ?? 1, drop <= 0 && e.brLiftShape === 'blast' ? BLAST_LIFT_SHAPE : undefined);
  const rise = shape?.rise ?? BRAWLER_LIFT_RISE_FRAC;
  return e.brawlerLiftAt + drop + Math.ceil(Math.max(0, ms - drop) * rise); // 切り上げ=頂点より前には開かない
};

/**
 * 雑魚を地上から move で打ち上げた時(一閃・引き寄せと同じ=落ちる速さの重さの増え方なし)の、打ち上げから頂点までの時間(ms)。ボス級(浮かない)の叩き落としの受付を、雑魚と同じ間合いで開くのに使う。
 * テンポ係数(BRAWLER_TEMPO)が変われば追従する(毎回計算)。
 */
export const whipZakoApexDelayMs = (move: BrawlerMoveKey): number => {
  const jp = brawlerJugglePush({}, 'mob', move, 0, false, false, false);
  const at = jp ? whipLiftApexAt(jp) : null;
  return at === null ? 0 : Math.max(0, at);
};

/**
 * 叩き落とし(2段目)の受付が開く時刻。apexAts=2段目の対象ごとの頂点の時刻(浮かないボス級は null=引き寄せた瞬間+雑魚の頂点までの時間)。
 * 全員が浮き上がり切ってから開く(遅い方)。対象が居なければ引き寄せた瞬間+雑魚の頂点までの時間。
 */
export const whipSlamOpenAt = (pullAt: number, apexAts: readonly (number | null)[], zakoApexDelayMs: number): number => {
  const fallback = pullAt + zakoApexDelayMs;
  let at = apexAts.length === 0 ? fallback : -Infinity;
  for (const a of apexAts) at = Math.max(at, a ?? fallback);
  return Math.max(pullAt, at);
};

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
