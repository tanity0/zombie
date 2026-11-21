// ランダムに置く物どうしを重ねすぎない決まり(research/PROP_OVERLAP.md)。
//
// - 重なり率 = 2つの絵の矩形の交わりの面積 ÷ 小さい方の面積。0.25 を超える置き方はしない。
// - 判定(壁)を持つ物どうしは、判定の矩形どうしの隙間を 28px 以上空ける。
// - 層の優先順位: 手置き > 木 / 研究所の壁・遮蔽(固定) > 街/雪/ステージ5の置物・研究所の置物 > 松明 > 花 > 水たまり。
//   各層は自分より上の層の最終配置だけを見て避ける(循環しない)。
// - 同じ層の中: 各個体の候補は決まった乱数の列(1番目=今の位置、2〜7番目=選び直し)。区画の中は番号順に先に
//   決まった個体の最終位置を避け、隣の8区画とは相手の「1番目の候補」だけと比べ、ぶつかったら優先値の低い方が選び直す。
//   =各個体の最終位置は「自分の区画+隣8区画の1番目の候補+上の層」だけで決まる(引く範囲によらず同じ答え)。
// - 結果は区画ごとにメモする(上限 512 区画・古い順に捨てる)。空き地・手置き・無効化フラグ・出撃が変わったら捨てる。
//   壊された物を外すのはメモから取り出した後(各生成関数)。
//
// RENDERER-AGNOSTIC: PixiJS を import しない。
import type { Rect } from './obstacles';

/** 重なり率の上限(交わり ÷ 小さい方の面積)。叩き台。 */
export const MAX_ART_OVERLAP = 0.25;
/** 判定を持つ物どうしの最低の隙間(px)=プレイヤーの体幅。叩き台。 */
export const MIN_COLLISION_GAP = 28;
/** 1つの個体を選び直す最大回数。 */
export const MAX_REROLLS = 6;
/** 区画メモの上限(区画数・古い順に捨てる)。 */
export const CELL_MEMO_CAP = 512;

// ---- 版(メモを捨てる合図) ----
let version = 0;
let contextFarKey = '';
/** 配置の材料(空き地・手置き・無効化フラグ・出撃)が変わったら呼ぶ。全ての区画メモが次の参照で捨てられる。 */
export const bumpPropPlacementVersion = (): void => { version++; };
export const propPlacementVersion = (): number => version;
/**
 * 出撃の開始(resetGame が毎回呼ぶ)。farBackdrop=木の絵(枯れ木/葉付き/雪)と、下の層が避ける置物の種類を決める。
 * 出撃の通し番号の代わりに版を上げる=前の出撃のメモは必ず捨てられる。
 */
export const beginPropPlacementSortie = (farKey: string): void => { contextFarKey = farKey; version++; };
/** この出撃の farBackdrop(木の絵の寸法・下の層が避ける置物の種類)。 */
export const placementFarKey = (): string => contextFarKey;

// ---- 手置きの物(拠点の円・城・ボスの場所) ----
export type HandPlacedAnchor =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'circle'; x: number; y: number; r: number };
let anchors: HandPlacedAnchor[] = [];
/**
 * 手置きの物(拠点の円・城の絵・ボスの場所)を渡す。**出撃開始の時点の位置で固定**し、出撃中は変えない
 * (store が位置の変化だけを見て呼ぶ)。POI の建物の絵は poiClearings(setPoiClearings)の足元から作る。
 */
export const setHandPlacedAnchors = (list: readonly HandPlacedAnchor[]): void => {
  anchors = list.slice();
  version++;
};
export const handPlacedAnchors = (): readonly HandPlacedAnchor[] => anchors;

// ---- 矩形の算数 ----
export const rectIntersectArea = (a: Rect, b: Rect): number => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  if (w <= 0) return 0;
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return h <= 0 ? 0 : w * h;
};
/** 重なり率 = 交わり ÷ 小さい方の面積(0..1)。 */
export const artOverlapRatio = (a: Rect, b: Rect): number => {
  const i = rectIntersectArea(a, b);
  if (i <= 0) return 0;
  const s = Math.min(a.width * a.height, b.width * b.height);
  return s > 0 ? i / s : 1;
};
/** 2つの判定の矩形の隙間(縦横のうち広い方。重なっていれば負)。 */
export const collisionGap = (a: Rect, b: Rect): number => Math.max(
  b.x - (a.x + a.width), a.x - (b.x + b.width),
  b.y - (a.y + a.height), a.y - (b.y + b.height),
);
const rectHitsCircle = (r: Rect, cx: number, cy: number, rad: number): boolean => {
  const qx = Math.max(r.x, Math.min(r.x + r.width, cx));
  const qy = Math.max(r.y, Math.min(r.y + r.height, cy));
  return (qx - cx) ** 2 + (qy - cy) ** 2 < rad * rad;
};
/** 絵の矩形が手置きの物(rect=絵 / circle=拠点の円など)に掛かるか(手置きの物には1pxも掛けない)。 */
export const hitsAnchor = (art: Rect, a: HandPlacedAnchor): boolean =>
  a.kind === 'rect' ? rectIntersectArea(art, a.rect) > 0 : rectHitsCircle(art, a.x, a.y, a.r);

/** 置き物1つの「場所の形」(絵の矩形+判定の矩形)。 */
export interface Footprint { art: Rect; col: Rect | null; }
/** 2つの置き物が「重なりすぎ」か(絵の重なり率 0.25 超 / 判定どうしの隙間 28px 未満)。 */
export const footprintsConflict = (a: Footprint, b: Footprint): boolean => {
  if (artOverlapRatio(a.art, b.art) > MAX_ART_OVERLAP) return true;
  return !!a.col && !!b.col && collisionGap(a.col, b.col) < MIN_COLLISION_GAP;
};

// ---- 区画メモ(LRU) ----
export class CellMemo<V> {
  private m = new Map<string, V>();
  private ver = -1;
  constructor(private readonly cap = CELL_MEMO_CAP) {}
  get(key: string, compute: () => V): V {
    if (this.ver !== version) { this.m.clear(); this.ver = version; }
    const hit = this.m.get(key);
    if (hit !== undefined) {
      this.m.delete(key); this.m.set(key, hit); // 新しい側へ
      return hit;
    }
    const v = compute();
    // compute の中で版が変わることは無い(配置の材料は store の出撃開始でしか変わらない)が、念のため版を見直す。
    if (this.ver !== version) { this.m.clear(); this.ver = version; }
    this.m.set(key, v);
    if (this.m.size > this.cap) {
      const oldest = this.m.keys().next().value;
      if (oldest !== undefined) this.m.delete(oldest);
    }
    return v;
  }
}

// ---- 同じ層の中の決め方(§2) ----
/** 1つの個体: 候補の列(0=1番目=今の位置。null=その候補は空き地・出撃地点などで置けない)と優先値。 */
export interface Individual<T extends Footprint> {
  cands: readonly (T | null)[];
  /** 隣の区画とぶつかった時の優先値(高い方が1番目のまま)。 */
  prio: number;
  /** 優先値が同じ時の決め手(個体ごとに一意)。 */
  tie: string;
  /** true=選び直してもだめなら1番目のまま置く(研究所の保証の遮蔽用)。 */
  keepIfStuck?: boolean;
}
/** 隣の区画の個体の「1番目の候補」(上の層・空き地・手置きで弾かれる物は含めない)。 */
export interface NeighborFirst<T extends Footprint> { item: T; prio: number; tie: string }

const beats = (aPrio: number, aTie: string, bPrio: number, bTie: string): boolean =>
  aPrio !== bPrio ? aPrio > bPrio : aTie > bTie;

/** 区画の個体の「1番目の候補」のうち、上の層・手置きに当たらない物(隣の区画から見える障害物)。 */
export const validFirsts = <T extends Footprint>(
  inds: readonly Individual<T>[], upperOk: (t: T) => boolean,
): NeighborFirst<T>[] => {
  const out: NeighborFirst<T>[] = [];
  for (const ind of inds) {
    const c = ind.cands[0];
    if (c && upperOk(c)) out.push({ item: c, prio: ind.prio, tie: ind.tie });
  }
  return out;
};

/**
 * 1区画の最終配置を決める(§2)。返り値は個体の並び順に、置けた物だけ。
 * - upperOk: 上の層の最終配置・手置きの物に当たらないか。
 * - neighbors: 隣8区画の個体の1番目の候補(validFirsts)。
 * - conflict: 同じ層どうしの「重なりすぎ」。
 */
export const resolveCellLayer = <T extends Footprint>(
  inds: readonly Individual<T>[],
  neighbors: readonly NeighborFirst<T>[],
  upperOk: (t: T) => boolean,
  conflict: (a: T, b: T) => boolean = footprintsConflict,
): T[] => {
  const placed: T[] = [];
  const clearOfPlaced = (c: T) => placed.every(p => !conflict(c, p));
  for (const ind of inds) {
    const first = ind.cands[0];
    if (!first && !ind.keepIfStuck) {
      // 1番目が空き地・出撃地点で置けない個体は、今と同じく置かない(数を増やさない)。
      continue;
    }
    let chosen: T | null = null;
    if (first && upperOk(first) && clearOfPlaced(first)) {
      let lose = false;
      for (const n of neighbors) {
        if (conflict(first, n.item) && beats(n.prio, n.tie, ind.prio, ind.tie)) { lose = true; break; }
      }
      if (!lose) chosen = first;
    }
    if (!chosen) {
      for (let r = 1; r < ind.cands.length && r <= MAX_REROLLS; r++) {
        const c = ind.cands[r];
        if (!c || !upperOk(c) || !clearOfPlaced(c)) continue;
        if (neighbors.some(n => conflict(c, n.item))) continue;
        chosen = c;
        break;
      }
    }
    if (!chosen && ind.keepIfStuck && first) chosen = first;
    if (chosen) placed.push(chosen);
  }
  return placed;
};

/**
 * 候補ごとに「上の層に当たらないか」の答えを覚える(同じ候補を隣の区画の確かめと自分の区画の決めで2度測らない)。
 * 候補の物は区画メモと一緒に作り直される(版が変わると新しい物)ので、古い答えが残ることは無い。
 */
export const cachedCheck = <T extends object>(fn: (t: T) => boolean): ((t: T) => boolean) => {
  const wm = new WeakMap<T, boolean>();
  return (t: T) => {
    let v = wm.get(t);
    if (v === undefined) { v = fn(t); wm.set(t, v); }
    return v;
  };
};

/** 区画の並び [c0..c1] を引く時に、隣の区画も含めて足元が届く範囲を返す小道具。 */
export const cellRange = (min: number, max: number, cell: number, extra = 1): [number, number] =>
  [Math.floor(min / cell) - extra, Math.floor(max / cell) + extra];
