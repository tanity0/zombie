// ★鞭の作り直し: 絡め取り → 振り回し → 投げつけ(research/WHIP_FOLLOWUP.md §8・社長裁定2026-11-25)。
// 判定だけを置く純関数(store にも描画にも依存しない)。数値は叩き台(実機で詰める)。時計は全部 gameTime(ms)。
//  - 絡め取り: 鞭の振りが当たった中でプレイヤーに一番近い掴める1体(雑魚・強個体)。ボス級は掴まない。
//  - 振り回し: プレイヤーを中心に円を描いて回す。掴んだ位置から回り出し、加速して一定の速さへ(慣性)。触れた別の敵へ1周に1回の当たり。
//    壁・木・建物・帯の縁では着弾せず、回す半径を縮めて手前に留める。
//  - 投げつけ: 出だしが一番速く、少しずつ減速して直進。敵・壁・最大距離で着弾=爆発(§6 の爆発の規約)。
import { pickArrowRainCenter } from './arrowRain';

/** 回す半径=鞭の届く距離 × これ。 */
export const WHIP_SWING_RADIUS_MULT = 0.6;
/** 最高の回転の1周の長さ(ms)。 */
export const WHIP_SWING_PERIOD_MS = 450;
/** 掴んでから最高の回転に届くまで(ms)。半径もこの間に掴んだ位置から回す半径へ寄る。 */
export const WHIP_SWING_ACCEL_MS = 250;
/** 振り回しの最長(ms)。過ぎたら自動で投げる。 */
export const WHIP_SWING_MAX_MS = 1500;
/** スラッシャー1Lvごとの最長の上乗せ(ms)。 */
export const WHIP_SWING_SLASHER_MS_PER_LV = 500;
/** 投げの最大距離=鞭の届く距離 × これ。 */
export const WHIP_THROW_DIST_MULT = 2.5;
/** 投げの速さの下限(px/s・回り出してすぐ投げた時でも飛んで見える)。 */
export const WHIP_THROW_MIN_SPEED = 900;
/** 最大距離に着いた時の速さ(出だしの速さに対する割合=少しずつ減速)。 */
export const WHIP_THROW_END_SPEED_FRAC = 0.4;
/** 着弾の爆発の威力=鞭の1撃目 × これ(§6 と同じ)。 */
export const WHIP_THROW_DAMAGE_MULT = 2;
/** 着弾のヒットストップ(ms・今の叩きつけと同じ)。 */
export const WHIP_THROW_HITSTOP_MS = 120;
/** 1フレームでプレイヤーがこれより大きく動いたら瞬間移動(一閃・ワイヤー等)とみなして放す(px)。 */
export const WHIP_SWING_TELEPORT_PX = 140;
/** 壁で半径を縮める時の刻み(px)と、縮める下限(回す半径に対する割合)。 */
export const WHIP_SWING_SHRINK_STEP_PX = 6;
export const WHIP_SWING_MIN_RADIUS_FRAC = 0.2;
/** 投げて飛ぶ間の当たりの見る刻み(px・壁を飛び越さない)。 */
export const WHIP_THROW_SUBSTEP_PX = 12;

/** 振り回しの状態(プレイヤーに1つ・store の GameState.whipSwing)。時計は gameTime。 */
export interface WhipSwingState {
  enemyId: string;
  phase: 'swing' | 'thrown';
  /** 掴んだ時刻。 */
  startAt: number;
  /** 振り回しの最長(ms)。 */
  maxMs: number;
  /** 掴んだ瞬間の角度(プレイヤーの中心から敵の中心・rad)と、その時の距離(px)。 */
  a0: number;
  r0: number;
  /** 回る向き(+1=角度が増える向き)。 */
  dir: 1 | -1;
  /** 回す半径(px・掴んだ時の届く距離から)。 */
  radius: number;
  /** 掴んだ時の鞭の届く距離(ハンティングの伸び込み)。投げの最大距離の元。 */
  reach: number;
  /** 回して当てた敵ごとの最後の当たりの時刻(1周に1回)。 */
  lastHits: Record<string, number>;
  /** 敵の今の中心(死んだ・消えた時の着弾点)。 */
  cx: number;
  cy: number;
  /** 前のフレームのプレイヤーの中心(瞬間移動を見る)。 */
  px: number;
  py: number;
  /** 今の実際の半径(壁で縮めた後)。 */
  rNow: number;
  /** 投げ(phase='thrown' の時だけ)。fromX/fromY=放した時の敵の中心・ux/uy=向き・v0=出だしの速さ(px/s)・maxDist=最大距離。 */
  throwAt?: number;
  fromX?: number;
  fromY?: number;
  ux?: number;
  uy?: number;
  v0?: number;
  maxDist?: number;
  /** 前のフレームまでに飛んだ距離(px)。 */
  dNow?: number;
  /** プレイヤーの入力(近接・フリック)で投げた(自動の投げは false)。技の行を出すのはこの時の着弾だけ。 */
  byInput?: boolean;
  /** 回し終えた周の数(1周ごとの音を鳴らした所まで)。 */
  lap?: number;
}

/** 掴む相手の候補(当たった敵1体ぶん)。 */
export interface WhipGrabCandidate { id: string; dist: number; grabbable: boolean; alive: boolean }

/** 当たった中でプレイヤーに一番近い、生き残った掴める1体(居なければ null=掴まない)。 */
export const pickWhipGrabTarget = (cands: readonly WhipGrabCandidate[]): string | null => {
  let best: WhipGrabCandidate | null = null;
  for (const c of cands) {
    if (!c.alive || !c.grabbable) continue;
    if (!best || c.dist < best.dist) best = c;
  }
  return best ? best.id : null;
};

/**
 * 回る向き。振りの向き (ux,uy) とプレイヤーから敵 (rx,ry)。鞭の押しは振りの線から外へ(敵がいる側へ)なので、
 * その押しのまま回り出す向き=振りの線のどちら側にいるか(外積の符号)。線の上ちょうどは +1。
 */
export const whipSwingSpinDir = (ux: number, uy: number, rx: number, ry: number): 1 | -1 =>
  ux * ry - uy * rx < 0 ? -1 : 1;

/** 最高の角速度(rad/s)。 */
export const whipSwingMaxAngVel = (periodMs = WHIP_SWING_PERIOD_MS): number => (2 * Math.PI) / (Math.max(1, periodMs) / 1000);

const easeOut = (u: number): number => 1 - (1 - u) * (1 - u);

/** 掴んでから t ms の角速度(rad/s・向きなし)。0 から加速し、加速の終わりで滑らかに一定へ(加速→一定)。 */
export const whipSwingAngVel = (tMs: number, accelMs = WHIP_SWING_ACCEL_MS, periodMs = WHIP_SWING_PERIOD_MS): number => {
  const w = whipSwingMaxAngVel(periodMs);
  if (!(tMs > 0)) return 0;
  if (tMs >= accelMs) return w;
  return w * easeOut(tMs / Math.max(1, accelMs));
};

/** 掴んでから t ms で回った角度(rad・向きなし・whipSwingAngVel の積分)。 */
export const whipSwingTurned = (tMs: number, accelMs = WHIP_SWING_ACCEL_MS, periodMs = WHIP_SWING_PERIOD_MS): number => {
  const w = whipSwingMaxAngVel(periodMs);
  if (!(tMs > 0)) return 0;
  const A = Math.max(1, accelMs) / 1000;
  const t = tMs / 1000;
  // ∫0^u (1-(1-s)^2) ds = u - (1-(1-u)^3)/3
  const G = (u: number): number => u - (1 - (1 - u) ** 3) / 3;
  if (t <= A) return w * A * G(t / A);
  return w * A * G(1) + w * (t - A);
};

/** 掴んでから t ms の半径の目標(掴んだ位置の距離 r0 から回す半径 R へ、加速と同じ尺で寄る)。 */
export const whipSwingRadiusAt = (tMs: number, r0: number, R: number, accelMs = WHIP_SWING_ACCEL_MS): number => {
  const u = Math.max(0, Math.min(1, tMs / Math.max(1, accelMs)));
  return r0 + (R - r0) * easeOut(u);
};

/** 掴んでから t ms で回し終えた周の数(1周ごとの音)。 */
export const whipSwingLaps = (tMs: number): number => Math.floor(whipSwingTurned(tMs) / (2 * Math.PI) + 1e-9);
/** n 周目の音の高さ(回すほど少しずつ上がる・上限あり)。 */
export const whipSwingLapRate = (lap: number): number => Math.min(1.45, 0.92 + 0.09 * Math.max(0, lap - 1));

/** 掴んでから t ms の角度(rad)。 */
export const whipSwingAngle = (s: Pick<WhipSwingState, 'a0' | 'dir'>, tMs: number): number => s.a0 + s.dir * whipSwingTurned(tMs);

/** 回して当てる: 同じ敵へは1周ぶんの時間ごとに1回。 */
export const whipSwingHitDue = (lastAt: number | undefined, now: number, periodMs = WHIP_SWING_PERIOD_MS): boolean =>
  lastAt === undefined || now - lastAt >= periodMs;

/** 箱どうしの重なり(左上 x,y と大きさ)。 */
export interface Box { x: number; y: number; width: number; height: number }
export const boxesOverlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * 壁・木・建物・帯の縁で、回す半径を縮めて手前に留める。want=目標の半径・free(r)=その半径の位置に居られるか。
 * 目標から刻みで縮め、最初に居られる半径を返す。下限まで縮めても居られなければ下限(呼び手が行ける帯へ寄せる)。
 */
export const whipSwingClampRadius = (
  want: number, free: (r: number) => boolean, minR: number, stepPx = WHIP_SWING_SHRINK_STEP_PX,
): number => {
  const lo = Math.max(0, Math.min(want, minR));
  for (let r = want; r > lo; r -= Math.max(1, stepPx)) if (free(r)) return r;
  return lo;
};

/** 最長の振り回し(ms)。スラッシャーの Lv ぶん伸びる。 */
export const whipSwingMaxMs = (slasherLv: number): number =>
  WHIP_SWING_MAX_MS + WHIP_SWING_SLASHER_MS_PER_LV * Math.max(0, Math.min(3, Math.floor(slasherLv || 0)));

/** 自動で投げる時刻が来たか。 */
export const whipSwingAutoThrowDue = (s: Pick<WhipSwingState, 'startAt' | 'maxMs' | 'phase'>, now: number): boolean =>
  s.phase === 'swing' && now - s.startAt >= s.maxMs;

/** 接線の向き(回る向き)。角度 a・向き dir。 */
export const whipSwingTangent = (a: number, dir: 1 | -1): { x: number; y: number } => ({ x: -Math.sin(a) * dir, y: Math.cos(a) * dir });

/**
 * 自動で投げる向き: 掴んでいる本人の位置から、最大距離の内側・見通しが通る敵の中で「最も固まっている場所」(矢の雨の狙いと同じ物差し)。
 * 掴んでいる本人は外す。候補が無ければ接線の向き。
 */
export const pickWhipAutoThrowDir = (
  ox: number, oy: number, targets: readonly { id: string; x: number; y: number }[], heldId: string, maxDist: number,
  visible: (x: number, y: number) => boolean, tangent: { x: number; y: number },
): { x: number; y: number } => {
  const near = targets.filter(t => t.id !== heldId && Math.hypot(t.x - ox, t.y - oy) <= maxDist && Math.hypot(t.x - ox, t.y - oy) > 1e-6 && visible(t.x, t.y));
  const c = pickArrowRainCenter(ox, oy, near);
  if (c) {
    const d = Math.hypot(c.x - ox, c.y - oy);
    if (d > 1e-6) return { x: (c.x - ox) / d, y: (c.y - oy) / d };
  }
  const tl = Math.hypot(tangent.x, tangent.y) || 1;
  return { x: tangent.x / tl, y: tangent.y / tl };
};

/** 投げの減速(px/s²)。出だし v0 から最大距離で v0×終わりの割合まで、一定の割合で減る。 */
export const whipThrowDecel = (v0: number, maxDist: number, endFrac = WHIP_THROW_END_SPEED_FRAC): number =>
  (v0 * v0 * (1 - endFrac * endFrac)) / (2 * Math.max(1, maxDist));
/** 最大距離に着くまで(ms)。 */
export const whipThrowDurationMs = (v0: number, maxDist: number, endFrac = WHIP_THROW_END_SPEED_FRAC): number => {
  const a = whipThrowDecel(v0, maxDist, endFrac);
  return a > 0 ? ((v0 * (1 - endFrac)) / a) * 1000 : 0;
};
/** 放してから t ms で進んだ距離(px)。出だしが一番速く少しずつ減速・最大距離で止める。 */
export const whipThrowDist = (tMs: number, v0: number, maxDist: number, endFrac = WHIP_THROW_END_SPEED_FRAC): number => {
  if (!(tMs > 0)) return 0;
  const T = whipThrowDurationMs(v0, maxDist, endFrac);
  if (tMs >= T) return maxDist;
  const a = whipThrowDecel(v0, maxDist, endFrac);
  const t = tMs / 1000;
  return Math.min(maxDist, v0 * t - 0.5 * a * t * t);
};
/** 放してから t ms の速さ(px/s)。 */
export const whipThrowSpeed = (tMs: number, v0: number, maxDist: number, endFrac = WHIP_THROW_END_SPEED_FRAC): number => {
  const a = whipThrowDecel(v0, maxDist, endFrac);
  const T = whipThrowDurationMs(v0, maxDist, endFrac);
  return v0 - a * Math.min(Math.max(0, tMs), T) / 1000;
};
/** 投げの出だしの速さ=放した時の接線の速さ(角速度×半径)・下限あり。 */
export const whipThrowStartSpeed = (angVel: number, radius: number): number =>
  Math.max(WHIP_THROW_MIN_SPEED, Math.abs(angVel) * Math.max(0, radius));

/**
 * 投げて飛ぶ1フレームの当たり。前の距離 d0 から今の距離 d1 まで、刻みで進めて最初に止まる所を返す。
 * hitsEnemy(x,y)=その中心の位置で別の敵に触れるか・blocked(x,y)=その中心の位置に居られないか(壁・木・建物・帯の縁)。
 * 戻り値: kind='enemy'|'wall'|'max'|null(まだ飛ぶ)・x,y=着弾点(壁の時は手前の居られる所)。
 */
export const whipThrowStep = (
  fromX: number, fromY: number, ux: number, uy: number, d0: number, d1: number, maxDist: number,
  hitsEnemy: (x: number, y: number) => boolean, blocked: (x: number, y: number) => boolean,
  substep = WHIP_THROW_SUBSTEP_PX,
): { kind: 'enemy' | 'wall' | 'max' | null; x: number; y: number } => {
  const span = Math.max(0, d1 - d0);
  const n = Math.max(1, Math.ceil(span / Math.max(1, substep)));
  let lastX = fromX + ux * d0, lastY = fromY + uy * d0;
  for (let i = 1; i <= n; i++) {
    const d = d0 + (span * i) / n;
    const x = fromX + ux * d, y = fromY + uy * d;
    if (blocked(x, y)) return { kind: 'wall', x: lastX, y: lastY };
    if (hitsEnemy(x, y)) return { kind: 'enemy', x, y };
    lastX = x; lastY = y;
  }
  if (d1 >= maxDist - 1e-6) return { kind: 'max', x: lastX, y: lastY };
  return { kind: null, x: lastX, y: lastY };
};

/** 途中で放す理由(着弾なし・その場に落ちる)。どれでもなければ null。 */
export type WhipReleaseReason = 'dead' | 'lock' | 'teleport' | 'weapon';
export const whipSwingReleaseReason = (o: {
  playerAlive: boolean; locked: boolean; whipEquipped: boolean; movedPx: number;
}): WhipReleaseReason | null => {
  if (!o.playerAlive) return 'dead';
  if (o.locked) return 'lock';
  if (!o.whipEquipped) return 'weapon';
  if (o.movedPx > WHIP_SWING_TELEPORT_PX) return 'teleport';
  return null;
};

// ---- 着弾の爆発(§6 の爆発の規約・§8-4「投げた敵自身にも爆発の満額」) ----
/** 距離による減り(手榴弾と同じ=爆心1・縁0.55)。 */
export const whipBlastFalloff = (dist: number, radius: number): number =>
  0.55 + (1 - Math.min(1, Math.max(0, dist) / Math.max(1, radius))) * 0.45;

export interface WhipBlastHit { targetId: string; dist: number; scale: number }
/**
 * 着弾の爆発の当たりの並び。爆心 (cx,cy)・投げた敵 selfId(自分の爆発を満額で受ける=距離0・壁越しの判定なし)。
 * ほかの敵は anchor(爆心から見た当たりの点)までが半径以内で、壁越しでなければ当たる(scale=距離の減り)。
 */
export const whipThrowBlastPlan = (
  cx: number, cy: number, selfId: string | null,
  targets: readonly { id: string; anchor: (cx: number, cy: number) => { x: number; y: number }; blocked?: (cx: number, cy: number, x: number, y: number) => boolean }[],
  radius: number,
): WhipBlastHit[] => {
  const out: WhipBlastHit[] = [];
  for (const t of targets) {
    if (t.id === selfId) { out.push({ targetId: t.id, dist: 0, scale: 1 }); continue; }
    const a = t.anchor(cx, cy);
    const d = Math.hypot(a.x - cx, a.y - cy);
    if (d > radius) continue;
    if (t.blocked?.(cx, cy, a.x, a.y)) continue;
    out.push({ targetId: t.id, dist: d, scale: whipBlastFalloff(d, radius) });
  }
  return out;
};
