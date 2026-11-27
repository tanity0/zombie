// ★刀の居合の構えのカウンター=居合一閃(research/KATANA_TSUBAME.md §5・5-5 が正)。判定だけを置く純関数(store にも描画にも依存しない)。数値は叩き台。
// 社長の言葉: 「刀の構え、弾はいまのまま、それ以外は一閃で返すことにする。(赤カウンターも)通常の一閃や、他のカウンターとの違いは、
// 瞬時に敵の前にワープ、後ろに一閃で抜ける。ということ。そこからの燕返しや奥義も出る。」
//   - 入口は store の tryKatanaIaiCounter 1本。各カウンターの成立の所(弾以外で成立の主=敵が居るもの)は
//     「刀の居合の窓ならこの入口へ・それ以外は今のまま」にする(成立の判定・窓の長さは変えない)。
//   - ここはワープ先・抜ける道の長さ・振り分けの計算だけ。

/** 居合一閃の威力の上乗せ(一閃の威力 × これ・5-5 の 4)。 */
export const KATANA_IAI_COUNTER_MULT = 1.5;
/** ワープ先=主の体の縁から この距離 手前(近接の間合い・5-5 の 7)。 */
export const KATANA_IAI_WARP_GAP_PX = 24;
/** ワープできる距離の上限(これを超える主は今のカウンターのまま・5-5 の 7)。 */
export const KATANA_IAI_WARP_MAX_PX = 300;
/** 抜ける道の長さ=max(一閃の距離, 主の体の幅 + これ)(大きいボスでも後ろへ抜ける・5-5 の 8)。 */
export const KATANA_IAI_PASS_MARGIN_PX = 48;
/** ワープ先が行けない所の時、線の上を自分の側へ戻って探す刻み(px)。 */
export const KATANA_IAI_WALKBACK_STEP_PX = 4;
/** 元の位置に残す残像の長さ(ms・瞬間移動の技の例外=縮地と同じ扱い。一瞬で消える)。 */
export const KATANA_IAI_AFTERIMAGE_MS = 160;

export interface IaiRect { x: number; y: number; width: number; height: number }
export interface IaiPoint { x: number; y: number }

/**
 * 点 p から単位ベクトル (ux,uy) の向きへ進んだ時、四角に入る距離(px)。p が中に居れば 0。当たらなければ Infinity。
 */
export const rayRectEntryDist = (p: IaiPoint, ux: number, uy: number, r: IaiRect): number => {
  if (p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height) return 0;
  let tMin = -Infinity, tMax = Infinity;
  const axes: [number, number, number, number][] = [[p.x, ux, r.x, r.x + r.width], [p.y, uy, r.y, r.y + r.height]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return Infinity;
  }
  if (tMax < 0) return Infinity;
  return Math.max(0, tMin);
};

export interface IaiWarpPlan {
  /** ワープ先(プレイヤーの中心)。行けるかどうかはまだ見ていない(iaiWalkBack で解く)。 */
  x: number; y: number;
  /** 抜ける向き(ワープ先→主の中心=自分→主の中心と同じ線)。単位ベクトル。 */
  ux: number; uy: number;
  /** ワープの距離(px)。 */
  dist: number;
}

/**
 * ワープ先(5-5 の 7): 自分→主の中心の線の上で、主の体の縁から KATANA_IAI_WARP_GAP_PX 手前。
 * 既に縁より内側(手前の距離が gap 未満)なら動かない(今の位置)。距離が上限を超えるなら null(ワープせず今のカウンター)。
 * 自分と主の中心が重なっている時は fallbackDir の向き(潰れていれば右)。
 */
export const iaiWarpPlan = (
  self: IaiPoint, target: IaiRect, fallbackDir: IaiPoint = { x: 1, y: 0 },
  gap = KATANA_IAI_WARP_GAP_PX, maxDist = KATANA_IAI_WARP_MAX_PX,
): IaiWarpPlan | null => {
  const cx = target.x + target.width / 2, cy = target.y + target.height / 2;
  let dx = cx - self.x, dy = cy - self.y;
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) {
    const fl = Math.hypot(fallbackDir.x, fallbackDir.y);
    dx = fl > 1e-6 ? fallbackDir.x / fl : 1; dy = fl > 1e-6 ? fallbackDir.y / fl : 0; d = 1;
    return { x: self.x, y: self.y, ux: dx, uy: dy, dist: 0 };
  }
  const ux = dx / d, uy = dy / d;
  const entry = rayRectEntryDist(self, ux, uy, target);
  const edge = Number.isFinite(entry) ? entry : d; // 中心へ向かう線は必ず四角に入る(保険)
  const dist = Math.max(0, edge - gap);
  if (dist > maxDist) return null;
  return { x: self.x + ux * dist, y: self.y + uy * dist, ux, uy, dist };
};

/** 抜ける道の長さ(5-5 の 8)。issenDist=今の一閃の距離(ハンティングで伸びていればその長さ)。 */
export const iaiStrikeLength = (issenDist: number, targetWidth: number, margin = KATANA_IAI_PASS_MARGIN_PX): number =>
  Math.max(issenDist, Math.max(0, targetWidth) + margin);

/**
 * ワープ先が行けない所(壁・行ける帯の外)なら、その線の上を自分の側へ戻って一番近い行ける所(5-5 の 7)。
 * standable(中心の x,y)=そこに立てるか。どこも立てなければ自分の位置(=動かない)。
 */
export const iaiWalkBack = (
  self: IaiPoint, warp: IaiPoint, standable: (x: number, y: number) => boolean, step = KATANA_IAI_WALKBACK_STEP_PX,
): IaiPoint => {
  const dx = self.x - warp.x, dy = self.y - warp.y;
  const d = Math.hypot(dx, dy);
  if (standable(warp.x, warp.y)) return { x: warp.x, y: warp.y };
  if (d < 1e-6) return { x: self.x, y: self.y };
  const ux = dx / d, uy = dy / d;
  for (let s = step; s < d; s += step) {
    const x = warp.x + ux * s, y = warp.y + uy * s;
    if (standable(x, y)) return { x, y };
  }
  return { x: self.x, y: self.y };
};

/** 振り分けの材料(store が組む)。 */
export interface IaiRouteInput {
  /** 刀(村雨を含む)を持ったプレイヤー本人か(守護霊・分身などの疑似の主語は false)。 */
  katanaPlayer: boolean;
  /** カウンターの窓が今開いているか(居合の構えの窓)。 */
  windowOpen: boolean;
  /** 成立の主(敵)が居るか(弾・主の居ない弾き・刃のパリィは false)。 */
  hasSubject: boolean;
  /** 主に触れられるか(死体・倒れた・isUntouchable・空中で触れない状態は false)。 */
  subjectTouchable: boolean;
  /** ワープ先が上限の内か(iaiWarpPlan が null でない)。 */
  withinWarpRange: boolean;
  /** 殺陣・行動不能など、居合一閃を出せない状態か。 */
  blocked: boolean;
}

/** 'iai'=居合一閃で返す / 'normal'=今のカウンターのまま(5-5 の 3・7・10)。 */
export const iaiCounterRoute = (i: IaiRouteInput): 'iai' | 'normal' =>
  i.katanaPlayer && i.windowOpen && i.hasSubject && i.subjectTouchable && i.withinWarpRange && !i.blocked ? 'iai' : 'normal';

/**
 * 同じ成立の中で主が複数の時、居合一閃の相手=一番近い主(中心どうしの距離・5-5 の 6)。空なら null。
 */
export const pickIaiSubject = <T extends { id: string; x: number; y: number; width: number; height: number }>(
  subjects: readonly T[], self: IaiPoint,
): T | null => {
  let best: T | null = null, bd = Infinity;
  for (const e of subjects) {
    const d = Math.hypot(e.x + e.width / 2 - self.x, e.y + e.height / 2 - self.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
};

/** 居合一閃を出した後のカウンターの窓(1回の構えで1回=出た瞬間に閉じる・5-5 の 6)。開始は残し、終わりを now の手前へ。 */
export const iaiClosedWindowEnd = (windowEnd: number, now: number): number => Math.min(windowEnd, now - 1);

/**
 * カウンターの演出のスロー(倍率 scale<1)の間に、走りが進まなかった実時間(ms)。simDtSec=この刻みのゲーム内の秒(スロー後)。
 * 居合一閃の走りの期限(実時間)をこの分だけ後ろへずらす=スローの間も道の長さを走り切る(ゲーム内の速さ・距離は一閃と同じ)。
 */
export const iaiSlowLostMs = (simDtSec: number, scale: number): number =>
  scale >= 1 || !(scale > 0) ? 0 : Math.max(0, simDtSec) * 1000 * (1 / scale - 1);

/** 残像の濃さ(0..1)。出た瞬間が一番濃く、減速しながら消える(慣性)。at=ワープした時刻。 */
export const iaiAfterimageAlpha = (at: number | undefined, now: number, ms = KATANA_IAI_AFTERIMAGE_MS): number => {
  if (!at || now < at) return 0;
  const t = (now - at) / Math.max(1, ms);
  if (t >= 1) return 0;
  const u = 1 - t;
  return u * u;
};
