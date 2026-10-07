// 進軍NPC(護衛軍人 EscortSoldier)の体力・被弾・倒れる・起こす(research/ESCORT_TARGETED.md §3・§6・§13b)。
// 純関数だけ(store/Pixiを import しない=renderer非依存)。時計はすべて gameTime(ms)。
// 判定は store/combat 側。描画は EscortSoldier の health/downedAt/… を読むだけ。
//
// 数値はすべて叩き台(設計書§10「実機で絞る」)。ここが唯一の出どころ=他所に数値を書き写さない。
import type { EscortSoldier } from '../types/game';

/** 体力 = 出撃時のプレイヤー最大体力 × この割合(§3)。 */
export const ESCORT_HP_RATIO = 0.6;
/** 被弾後の無敵(プレイヤーの INVULN_MS と同じ考え方=連続ヒットで溶けない)。 */
export const ESCORT_HIT_INVULN_MS = 1000;
/** 被弾で射撃を止める時間(§7 項8)。 */
export const ESCORT_HIT_FIRE_HOLD_MS = 300;
/** 被弾の滑り(§7 項9): 距離と尺。ease-out。 */
export const ESCORT_KNOCKBACK_PX = 52;
export const ESCORT_KNOCKBACK_MS = 280;
/** 倒れる瞬間の滑りは被弾より大きく・長く(§7 項16)。 */
export const ESCORT_DOWN_SLIDE_PX = 70;
export const ESCORT_DOWN_SLIDE_MS = 380;
/** 倒れ込みが地面に着く瞬間(倒れる尺に対する割合)。絵の最深点・着地の砂埃・音が同じ瞬間になるよう1本の出どころ(検収R2 A-1)。 */
export const ESCORT_FALL_IMPACT_FRAC = 0.62;
/** 起こす半径(プレイヤー中心と軍人の体の中心の距離)・必要時間・離れた時の戻り(1秒で0.5秒ぶん)(§6)。 */
export const ESCORT_REVIVE_RADIUS_PX = 90;
export const ESCORT_REVIVE_NEED_MS = 2000;
export const ESCORT_REVIVE_DECAY = 0.5;
/** 起き上がった時の体力(最大体力に対する割合)(§6)。 */
export const ESCORT_REVIVE_HEAL_RATIO = 0.5;
/** 倒れてからこの時間で自然に起きる(画面外でも・社長裁定2026-10-07「自然に起きる」)。 */
export const ESCORT_SELF_REVIVE_MS = 30000;
/** 起き上がった直後の無敵(§6 QA-2 S-2)。 */
export const ESCORT_REVIVE_INVULN_MS = 2000;
/** 瀕死の閾値(最大体力に対する割合)。未満なら撃ちながら後ずさる(§13b-2)。 */
export const ESCORT_LOW_HP_RATIO = 0.3;
/** 瀕死で後ずさる速さ=既存の「後方」ゾーンの倍率(escortAdvance の zoneSpeed('rear')=0.7)。 */
export const ESCORT_RETREAT_SPEED_MULT = 0.7;
/** 自力で起きた後、前進が遅くなる時間と倍率(§13b-4)。 */
export const ESCORT_SELF_REVIVE_SLOW_MS = 4000;
export const ESCORT_SELF_REVIVE_SPEED_MULT = 0.5;
/** 狙っていた軍人が倒れた時、敵が立ち止まる時間(§13b-1)。 */
export const ESCORT_LOST_SIGHT_MS = 1000;

/** 軍人の体の大きさ(プレイヤーの当たり箱 PLAYER_HITBOX=28 と同じ)。足元(x,y)から上へ立つ。 */
export const ESCORT_BODY_SIZE = 28;
/** 当たり箱はプレイヤーと同じく体の 2/3(collisionUtils.playerHitbox と同じ縮め方)。 */
const ESCORT_HIT_SCALE = 2 / 3;

type Box = { x: number; y: number; width: number; height: number };

/** 体の中心(狙いの座標・距離の基準)。足元 (x,y) の真上 BODY/2。 */
export const escortCenter = (e: Pick<EscortSoldier, 'x' | 'y'>): { x: number; y: number } =>
  ({ x: e.x, y: e.y - ESCORT_BODY_SIZE / 2 });

/** 体の全身の箱(足元から上へ BODY×BODY)。噛みつきの判定(プレイヤーの全身 collPlayer と同じ大きさ)に使う。 */
export const escortBodyRect = (e: Pick<EscortSoldier, 'x' | 'y'>): Box =>
  ({ x: e.x - ESCORT_BODY_SIZE / 2, y: e.y - ESCORT_BODY_SIZE, width: ESCORT_BODY_SIZE, height: ESCORT_BODY_SIZE });

/** 当たり箱(被弾判定用)。 */
export const escortHitbox = (e: Pick<EscortSoldier, 'x' | 'y'>): Box => {
  const s = ESCORT_BODY_SIZE * ESCORT_HIT_SCALE;
  const c = escortCenter(e);
  return { x: c.x - s / 2, y: c.y - s / 2, width: s, height: s };
};

/** 円(爆風/帯の当たり)に使う体の半径(プレイヤー/守護霊と同じ「長い辺の半分」=BODY/2)。 */
export const ESCORT_BODY_RADIUS = ESCORT_BODY_SIZE / 2;

/** 出撃時のプレイヤー最大体力から軍人の最大体力(§3)。最低1。 */
export const escortMaxHealthFor = (playerMaxHealth: number): number =>
  Math.max(1, Math.round(Math.max(0, playerMaxHealth) * ESCORT_HP_RATIO));

/** 体力を持つ軍人か(M0の随行2人は持たない=従来どおり)。 */
export const escortHasHealth = (e: Pick<EscortSoldier, 'maxHealth'>): boolean => (e.maxHealth ?? 0) > 0;

export const isEscortDowned = (e: Pick<EscortSoldier, 'downedAt'>): boolean => e.downedAt !== undefined;

export const isEscortInvulnerable = (e: Pick<EscortSoldier, 'invulnUntil'>, now: number): boolean =>
  now < (e.invulnUntil ?? 0);

/** 敵の攻撃が当たりうる軍人か(体力あり・倒れていない・無敵でない)。 */
export const canEscortBeHit = (e: EscortSoldier, now: number): boolean =>
  escortHasHealth(e) && !isEscortDowned(e) && !isEscortInvulnerable(e, now);

/** 敵が狙ってよい軍人か(体力あり・倒れていない)。無敵中でも狙える(起き上がり直後に群れが離れる嘘を作らない)。 */
export const isEscortTargetableBody = (e: Pick<EscortSoldier, 'maxHealth' | 'downedAt'>): boolean =>
  escortHasHealth(e) && !isEscortDowned(e);

/** 瀕死か(体力が最大の30%未満・倒れていない)。 */
export const isEscortLowHealth = (e: Pick<EscortSoldier, 'health' | 'maxHealth' | 'downedAt'>): boolean =>
  escortHasHealth(e) && !isEscortDowned(e) && (e.health ?? 0) < (e.maxHealth ?? 0) * ESCORT_LOW_HP_RATIO;

export interface EscortHitResult {
  next: EscortSoldier;
  /** 実際に減った体力(無敵・倒れ中・体力なしは0)。 */
  dealt: number;
  /** この被弾で倒れた。 */
  downedNow: boolean;
}

/** 被弾の滑り終点: 被弾源から離れる向きへ px 進む。源が無い/重なっている時は向きを持たない(0,0)。 */
const slideAway = (e: EscortSoldier, fromX: number | undefined, fromY: number | undefined, px: number): { dx: number; dy: number } => {
  if (fromX === undefined || fromY === undefined) return { dx: 0, dy: 0 };
  const c = escortCenter(e);
  const ddx = c.x - fromX, ddy = c.y - fromY;
  const d = Math.hypot(ddx, ddy);
  if (d < 0.001) return { dx: 0, dy: -px }; // 真上から落ちる=後ろへ(プレイヤーの被弾と同じ規約)
  return { dx: (ddx / d) * px, dy: (ddy / d) * px };
};

/**
 * 被弾を1回適用する(純関数)。無敵(被弾後1秒/起き上がり後2秒)・倒れ中・体力なしは何も起きない(dealt=0)。
 * 体力が尽きたら倒れる(死なない): downedAt を打ち、起こす進みを0にし、大きめの滑りを積む。
 * 滑りの終点は clampRectToPlayableArea を通す必要があるので、ここでは未クランプの生の終点を入れる
 * (呼び手=store が x/y と同じ規約でクランプし直す)。
 */
export const applyEscortHit = (
  e: EscortSoldier, amount: number, now: number, fromX?: number, fromY?: number,
): EscortHitResult => {
  if (!(amount > 0) || !canEscortBeHit(e, now)) return { next: e, dealt: 0, downedNow: false };
  const hp0 = e.health ?? e.maxHealth ?? 0;
  const dealt = Math.min(hp0, amount);
  const hp = hp0 - dealt;
  const downedNow = hp <= 0;
  const px = downedNow ? ESCORT_DOWN_SLIDE_PX : ESCORT_KNOCKBACK_PX;
  const ms = downedNow ? ESCORT_DOWN_SLIDE_MS : ESCORT_KNOCKBACK_MS;
  const away = slideAway(e, fromX, fromY, px);
  const hasSlide = away.dx !== 0 || away.dy !== 0;
  const next: EscortSoldier = {
    ...e,
    health: hp,
    invulnUntil: now + ESCORT_HIT_INVULN_MS,
    lastHitAt: now,
    lastHitDirX: hasSlide ? away.dx / px : 0,
    lastHitDirY: hasSlide ? away.dy / px : 0,
    fireHoldUntil: now + ESCORT_HIT_FIRE_HOLD_MS,
    ...(hasSlide ? {
      slideFromX: e.x, slideFromY: e.y, slideToX: e.x + away.dx, slideToY: e.y + away.dy,
      slideStartAt: now, slideUntil: now + ms,
    } : {}),
    ...(downedNow ? {
      downedAt: now, reviveMs: 0, reviveNear: false, landedFx: undefined,
      // 倒れた直後は被弾無敵を伸ばさない(倒れ中は元々当たらない)。起きた時に改めて2秒を積む。
      riseAt: undefined, riseKind: undefined, slowUntil: undefined,
    } : {}),
  };
  return { next, dealt, downedNow };
};

/** ease-out(2次)。滑りの位置。 */
const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);

/** 滑りの最中か。 */
export const isEscortSliding = (e: Pick<EscortSoldier, 'slideUntil'>, now: number): boolean =>
  e.slideUntil !== undefined && now < e.slideUntil;

/** いまの滑りの位置(滑り中でなければ null)。終点は未クランプ=呼び手が clampRectToPlayableArea に通す。 */
export const escortSlidePosition = (e: EscortSoldier, now: number): { x: number; y: number } | null => {
  if (e.slideUntil === undefined || e.slideStartAt === undefined || now >= e.slideUntil) return null;
  const fx = e.slideFromX, fy = e.slideFromY, tx = e.slideToX, ty = e.slideToY;
  if (fx === undefined || fy === undefined || tx === undefined || ty === undefined) return null;
  const t = Math.max(0, Math.min(1, (now - e.slideStartAt) / Math.max(1, e.slideUntil - e.slideStartAt)));
  const k = easeOutQuad(t);
  return { x: fx + (tx - fx) * k, y: fy + (ty - fy) * k };
};

/** 滑りを終えた後始末(終点に確定してフィールドを落とす)。 */
export const clearEscortSlide = (e: EscortSoldier): EscortSoldier => ({
  ...e, slideFromX: undefined, slideFromY: undefined, slideToX: undefined, slideToY: undefined,
  slideStartAt: undefined, slideUntil: undefined,
});

export type EscortVitalsEvent = 'revived' | 'selfRevived';

export interface EscortVitalsInput {
  now: number;
  dtSec: number;
  /** プレイヤーの体の中心。 */
  playerX: number;
  playerY: number;
}

export interface EscortVitalsResult {
  next: EscortSoldier;
  /** 起き上がった(このフレーム)。 */
  event?: EscortVitalsEvent;
  /** 向きを替えた(プレイヤーが起こす半径に入った瞬間)。 */
  faceToPlayerNow?: boolean;
}

/**
 * 倒れている軍人の時計(§6): 起こす進み具合・自然に起きる。毎フレーム1回、位置の移動より前に呼ぶ。
 * - 立っている/体力なし: 何もしない(同一参照を返す)。
 * - 倒れ中: プレイヤーが半径 ESCORT_REVIVE_RADIUS_PX 以内なら reviveMs が伸び、離れると毎秒 DECAY で戻る。
 *   NEED(2秒)に届いたら起こされる(体力50%・2秒無敵)。倒れてから 30秒でプレイヤーが居なくても起きる
 *   (自力=体力50%・2秒無敵・前進×0.5を4秒)。起こされる方が先に条件を満たせば起こされた扱い。
 */
export const stepEscortVitals = (e: EscortSoldier, i: EscortVitalsInput): EscortVitalsResult => {
  if (!escortHasHealth(e) || e.downedAt === undefined) return { next: e };
  const c = escortCenter(e);
  const near = Math.hypot(i.playerX - c.x, i.playerY - c.y) <= ESCORT_REVIVE_RADIUS_PX;
  const dtMs = Math.max(0, i.dtSec) * 1000;
  let reviveMs = e.reviveMs ?? 0;
  reviveMs = near ? Math.min(ESCORT_REVIVE_NEED_MS, reviveMs + dtMs) : Math.max(0, reviveMs - dtMs * ESCORT_REVIVE_DECAY);
  const maxHp = e.maxHealth ?? 0;
  const risen = (kind: 'player' | 'self'): EscortSoldier => ({
    ...e,
    downedAt: undefined, reviveMs: 0, reviveNear: false, landedFx: undefined,
    health: Math.max(1, Math.round(maxHp * ESCORT_REVIVE_HEAL_RATIO)),
    invulnUntil: i.now + ESCORT_REVIVE_INVULN_MS,
    riseAt: i.now, riseKind: kind,
    ...(kind === 'self' ? { slowUntil: i.now + ESCORT_SELF_REVIVE_SLOW_MS } : { slowUntil: undefined }),
    // 倒れていた間の滑り・射撃止めは持ち越さない。
    slideFromX: undefined, slideFromY: undefined, slideToX: undefined, slideToY: undefined,
    slideStartAt: undefined, slideUntil: undefined, fireHoldUntil: undefined,
  });
  if (reviveMs >= ESCORT_REVIVE_NEED_MS) return { next: risen('player'), event: 'revived' };
  if (i.now - e.downedAt >= ESCORT_SELF_REVIVE_MS) return { next: risen('self'), event: 'selfRevived' };
  const enteredNow = near && !(e.reviveNear ?? false);
  // 向き: 入った瞬間だけプレイヤーの方へ(以後は触らない)。
  const face = enteredNow && Math.abs(i.playerX - e.x) > 1 ? (i.playerX < e.x ? -1 : 1) : e.face;
  if (reviveMs === (e.reviveMs ?? 0) && near === (e.reviveNear ?? false) && face === e.face) return { next: e };
  return { next: { ...e, reviveMs, reviveNear: near, face }, faceToPlayerNow: enteredNow };
};

/** 起こす進み具合 0..1(描画の縁取り用)。 */
export const escortReviveProgress = (e: Pick<EscortSoldier, 'reviveMs'>): number =>
  Math.max(0, Math.min(1, (e.reviveMs ?? 0) / ESCORT_REVIVE_NEED_MS));

/** 担当拠点の確保で全快(§13b-3)。倒れている軍人は対象外(確保できないが念のため)。 */
export const healEscortFull = (e: EscortSoldier, now: number): EscortSoldier =>
  escortHasHealth(e) && !isEscortDowned(e) && (e.health ?? 0) < (e.maxHealth ?? 0)
    ? { ...e, health: e.maxHealth, healedAt: now }
    : e;

/** 前進の速さ倍率(自力で起きた直後の×0.5)。 */
export const escortAdvanceSlowMult = (e: Pick<EscortSoldier, 'slowUntil'>, now: number): number =>
  now < (e.slowUntil ?? 0) ? ESCORT_SELF_REVIVE_SPEED_MULT : 1;
