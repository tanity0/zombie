// ステージの天候「雨上がり」(research/WEATHER_WET.md §2-2)の水たまりと小物の配置。
//
// 木(trees.ts)・花(forestDecor.ts)と同じ「世界座標の純粋関数」: 区画ごとに決まった乱数で散布する
// (エンティティとして持たない=出撃ごと・カメラ移動で位置がぶれない)。**判定は持たない**(見た目だけ・
// 「ではない」条件=遊びの中身は変えない)。足を踏み入れた時の波紋のために「点が水たまりの中か」だけを返す。
//
// 避ける物: 出撃地点の周り・POI の前の空き地とその建物の絵の下・木の足元と木の絵の下・花の絵の下・松明の足元・
// 拠点の円(呼び出し側が渡す)。
// ★「絵の下」も避ける理由(社長指示2026-11-20「枯れ木などの足元に水たまりが重なる」): 木や花の絵は足元から
//   上(奥)へ立ち上がるので、足元より奥にある水たまりは絵の根元・幹・枝の間から透けて「重なって」見える。
//   足元の周りの楕円だけでは防げないため、絵が立つ範囲(足元から上の矩形)に水たまりの楕円が掛かったら置かない。
// ステージ1には「道」のデータが無い(森の床は1枚の地面)ので、道は避ける対象に無い。
//
// RENDERER-AGNOSTIC: PixiJS を import しない。描画は pixi/weatherWet.ts が読んで並べるだけ。

import type { Rect } from './obstacles';
import { isInPoiClearing, isClearOfHandPlaced } from './poiClearings';
import { treesInRegionRaw } from './trees';
import { torchFootprintsNear } from './torches';
import { forestFlowersInRegion, FLOWER_DISPLAY_H } from './forestDecor';
import { cityPropFootprintsNear } from './cityProps';
import { treeArtSize } from './artRects';
import {
  CellMemo, MAX_REROLLS, artOverlapRatio, cachedCheck, handPlacedAnchors, placementFarKey, resolveCellLayer, validFirsts,
  footprintsConflict, type Footprint, type Individual, type NeighborFirst,
} from './propPlacement';

/** 水たまりの種類(public/sprites/weather/<name>.png と <name>-water.png の対)。 */
export const PUDDLE_VARIANTS = [
  'puddle-r1', 'puddle-r2', 'puddle-r3', 'puddle-r4', 'puddle-r5',
  'puddle-long1', 'puddle-long2', 'puddle-long3',
  'puddle-cluster1', 'puddle-cluster2',
] as const;
export type PuddleVariant = typeof PUDDLE_VARIANTS[number];

/** 絵の寸法(art px・切り出した PNG の実寸)。足を踏み入れた判定の楕円と、避ける距離に使う。 */
export const PUDDLE_ART_SIZE: Readonly<Record<PuddleVariant, { w: number; h: number }>> = {
  'puddle-r1': { w: 19, h: 10 }, 'puddle-r2': { w: 32, h: 17 }, 'puddle-r3': { w: 37, h: 23 },
  'puddle-r4': { w: 44, h: 28 }, 'puddle-r5': { w: 60, h: 32 },
  'puddle-long1': { w: 33, h: 12 }, 'puddle-long2': { w: 35, h: 12 }, 'puddle-long3': { w: 37, h: 13 },
  'puddle-cluster1': { w: 28, h: 14 }, 'puddle-cluster2': { w: 45, h: 13 },
};

/** 水たまりの周りに添える小物(帯2の6つ)。 */
export const DEBRIS_VARIANTS = ['debris-stone', 'debris-log', 'debris-grass', 'debris-leaf', 'debris-twig', 'debris-branch'] as const;
export type DebrisVariant = typeof DEBRIS_VARIANTS[number];

/** 水たまりの絵の1ドットを世界の何pxで出すか。叩き台。2.4→3.6(社長指示2026-11-20「水たまり全体的にもっと大きく」)。 */
export const PUDDLE_ART_SCALE = 3.6;
/** 小物(石・葉・枝)と波紋の絵の倍率=水たまりを大きくする前の値のまま(プレイヤーの立ち絵の倍率 2.3 に近い密度)。 */
export const DEBRIS_ART_SCALE = 2.4;
/** 散布の区画(world px・木の区画 220 とほぼ同じ)。1区画に 0〜2 個。叩き台。 */
export const PUDDLE_CELL = 210;
/** 出撃地点の真上だけは空ける(立ち位置に水たまりが重ならない)。開幕から足元近くに見えるよう、木(150)より小さめ。 */
export const PUDDLE_SAFE_RADIUS = 110;
/** 木の足元からこれ以内には置かない(幹と根元の絵に水が食い込まない)。scale 1 の値。 */
export const PUDDLE_TREE_CLEAR = 70;
/** 松明の足元からこれ以内には置かない。 */
export const PUDDLE_TORCH_CLEAR = 80;
/** 木の絵が地面の上に立つ範囲(scale 1・world px)。描画(pixiScene.syncTrees)の箱 48×64×TREE_VISUAL_SCALE(2.475)に
 *  枯れ木の絵(201×233)を収めた寸法(world/artRects.ts の treeArtSize が正本)。足元から上へ高さぶん・左右へ半幅ぶん。 */
export const PUDDLE_TREE_ART_HALF_W = Math.ceil(treeArtSize('').w / 2);
export const PUDDLE_TREE_ART_H = Math.ceil(treeArtSize('').h);
/** 花の絵の幅÷高さ(花の絵はほぼ正方形よりやや縦長)。高さは FLOWER_DISPLAY_H×個体scale。 */
export const PUDDLE_FLOWER_ART_ASPECT = 0.9;
/** 絵の範囲を避ける時の遠近の見込み: 画面の手前の物は遠近で大きく描かれる(最大 1.7 倍)ので、範囲と楕円をこの倍率で広げる。 */
export const PUDDLE_PROP_DEPTH_ALLOW = 1.25;
/** 絵の範囲と水たまりの縁の間に空ける隙間(world px)。 */
export const PUDDLE_PROP_GAP = 12;
/** 水面だけ(縁の絵なし・小物なし)の薄い水の膜になる割合(社長指示2026-11-20「水だけの絵も配置して欲しいかも」)。 */
export const PUDDLE_WATER_ONLY_RATE = 0.35;
/** 1つの水たまりの置き場所を区画の中で何か所まで試すか(避ける物に当たったら次の候補へ)。 */
export const PUDDLE_PLACE_TRIES = 8;
/** 拠点の円の外側へ足す余白(円の縁に水たまりが掛からない)。 */
export const PUDDLE_BASE_PAD = 60;
/** POI の建物の絵(足元より奥)の下にも置かない深さ。空き地(poiClearings)は足元の 60 奥までしか無いため。 */
export const PUDDLE_POI_BACK = 200;

export interface PuddleDebris {
  variant: DebrisVariant;
  x: number; // 足元(=絵の下端の中心)
  y: number;
  flip: boolean;
}

export interface Puddle {
  id: string;
  variant: PuddleVariant;
  /** 中心(world px)。 */
  x: number;
  y: number;
  /** 個体ごとの大小(PUDDLE_ART_SCALE に掛ける)。 */
  scale: number;
  flip: boolean;
  /** 地面上の半径(楕円・world px)。 */
  rx: number;
  ry: number;
  /** true=水面(帯1)だけの薄い水の膜。縁の絵(帯2)も小物も無い。 */
  waterOnly: boolean;
  debris: PuddleDebris[];
}

export interface PuddleAvoid {
  /** 花(forestDecor)を引くステージ。省略時は 'stage-1'(雨上がりはステージ1だけ)。 */
  stageId?: string;
}
// 拠点の円・城・ボスの場所は手置きの物(propPlacement.setHandPlacedAnchors)から引く(research/PROP_OVERLAP.md §3 で一本化)。

/** 足元から上へ立つ絵の範囲(幅 halfW×2・高さ h)に、中心 (x, y)・半径 (rx, ry) の楕円が掛かるか。 */
export const ellipseHitsPropArt = (
  x: number, y: number, rx: number, ry: number,
  footX: number, footY: number, halfW: number, h: number,
): boolean => {
  const A = PUDDLE_PROP_DEPTH_ALLOW;
  const hw = halfW * A, top = footY - h * A;
  const qx = Math.max(footX - hw, Math.min(footX + hw, x));
  const qy = Math.max(top, Math.min(footY, y));
  const ex = (rx + PUDDLE_PROP_GAP) * A, ey = (ry + PUDDLE_PROP_GAP) * A;
  const dx = (x - qx) / ex, dy = (y - qy) / ey;
  return dx * dx + dy * dy < 1;
};

const hash = (x: number, y: number): number => {
  const v = Math.sin(x * 47.613 + y * 19.271) * 61253.917;
  return v - Math.floor(v);
};

// 丸い小〜大・細長・群れの出やすさ(水たまりとして読める中〜大を多めに)。合計1。
const VARIANT_WEIGHTS: readonly number[] = [0.06, 0.1, 0.14, 0.14, 0.12, 0.1, 0.1, 0.08, 0.08, 0.08];
const pickVariant = (u: number): PuddleVariant => {
  let acc = 0;
  for (let i = 0; i < PUDDLE_VARIANTS.length; i++) {
    acc += VARIANT_WEIGHTS[i];
    if (u < acc) return PUDDLE_VARIANTS[i];
  }
  return PUDDLE_VARIANTS[PUDDLE_VARIANTS.length - 1];
};

/** 水たまりの絵の矩形(楕円の外接矩形・中心アンカー)。 */
const puddleArtRect = (x: number, y: number, rx: number, ry: number): Rect => ({ x: x - rx, y: y - ry, width: rx * 2, height: ry * 2 });

// 水たまりの上の層(出撃地点・空き地・手置きの物・木・置物・松明(RELAX 込みの最大)・花)。木・置物・松明は壊される前の配置で見る。
const blocked = (x: number, y: number, rx: number, ry: number, stageId: string): boolean => {
  if (Math.hypot(x, y) < PUDDLE_SAFE_RADIUS + rx) return true;
  if (isInPoiClearing(x, y) || isInPoiClearing(x, y + PUDDLE_POI_BACK)) return true;
  const art = puddleArtRect(x, y, rx, ry);
  // 手置きの物: 拠点の円は縁に余白(PUDDLE_BASE_PAD)を足して避ける。城・POI の建物の絵には掛けない。
  for (const a of handPlacedAnchors()) {
    if (a.kind === 'circle' && Math.hypot(a.x - x, a.y - y) < a.r + PUDDLE_BASE_PAD + rx) return true;
  }
  if (!isClearOfHandPlaced(art)) return true;
  // 木: treesInRegionRaw は「区画の原点」で引く(足元は原点から最大 1区画+32×scale 先)ので、1区画ぶん広く引く。
  const tPadX = (rx + PUDDLE_PROP_GAP + PUDDLE_TREE_ART_HALF_W * 1.25) * PUDDLE_PROP_DEPTH_ALLOW + 220;
  const tPadY = (ry + PUDDLE_PROP_GAP + PUDDLE_TREE_ART_H * 1.25) * PUDDLE_PROP_DEPTH_ALLOW + 260;
  const farKey = placementFarKey();
  const ta = treeArtSize(farKey);
  for (const t of treesInRegionRaw(x - tPadX, y - tPadY, x + tPadX, y + tPadY)) {
    if (Math.hypot(t.footX - x, (t.footY - y) * 1.6) < rx + PUDDLE_TREE_CLEAR * t.scale) return true;
    if (ellipseHitsPropArt(x, y, rx, ry, t.footX, t.footY, PUDDLE_TREE_ART_HALF_W * t.scale, PUDDLE_TREE_ART_H * t.scale)) return true;
    if (artOverlapRatio(art, { x: t.footX - (ta.w * t.scale) / 2, y: t.footY - ta.h * t.scale, width: ta.w * t.scale, height: ta.h * t.scale }) > 0.25) return true;
  }
  // 花(ステージ1の光る花): 足元から上へ立つ絵の範囲を避ける。
  const fPad = (Math.max(rx, ry) + PUDDLE_PROP_GAP + FLOWER_DISPLAY_H) * PUDDLE_PROP_DEPTH_ALLOW;
  for (const f of forestFlowersInRegion(stageId, x - fPad, y - fPad, x + fPad, y + fPad)) {
    const fh = FLOWER_DISPLAY_H * f.scale;
    if (ellipseHitsPropArt(x, y, rx, ry, f.footX, f.footY, fh * PUDDLE_FLOWER_ART_ASPECT * 0.5, fh)) return true;
  }
  const self: Footprint = { art, col: null };
  for (const p of cityPropFootprintsNear(farKey, art)) if (footprintsConflict(self, p)) return true;
  const tp = rx + PUDDLE_TORCH_CLEAR;
  for (const t of torchFootprintsNear({ x: x - tp, y: y - tp, width: tp * 2, height: tp * 2 })) {
    if (Math.hypot(t.footX - x, (t.footY - y) * 1.6) < rx + PUDDLE_TORCH_CLEAR) return true;
    if (footprintsConflict(self, t)) return true;
  }
  return false;
};

interface PuddleCand extends Footprint {
  /** true=上の層に当たらないことを確かめ済み(1番目の候補)。 */
  firstOk?: boolean;
  id: string; cell: string; stageId: string; variant: PuddleVariant; x: number; y: number; scale: number; rx: number; ry: number;
}
/**
 * 同じ層どうしの「重なりすぎ」: 絵の重なり率 0.25 超(全体の決まり)。同じ区画の中だけは、元の「2つ目を捨てる」距離
 * (楕円どうしが近すぎる)も重なりとみなす=今の見え方を保ったまま、捨てずに選び直す(research/PROP_OVERLAP.md §2)。
 */
const puddlesConflict = (a: PuddleCand, b: PuddleCand): boolean =>
  artOverlapRatio(a.art, b.art) > 0.25
  || (a.cell === b.cell && Math.hypot(a.x - b.x, (a.y - b.y) * 1.6) < a.rx + b.rx + 20);

const puddleCellCount = (cx: number, cy: number): number => {
  const u = hash(cx * 5.3 + 0.7, cy * 8.9 - 1.3);
  return u < 0.12 ? 0 : u < 0.55 ? 1 : 2;
};

// 区画の k 番目の水たまりの個体。候補0 = 今の位置(区画の中の PUDDLE_PLACE_TRIES か所のうち、上の層に当たらない最初の所)。
// 候補1〜6 = 同じ層どうしで重なった時の選び直し(同じ区画の続きの乱数)。
const puddleIndividual = (cx: number, cy: number, k: number, stageId: string): Individual<PuddleCand> => {
  const variant = pickVariant(hash(cx * 2.3 + k * 7.1, cy * 3.9 - k * 1.7));
  const scale = 0.85 + hash(cx * 0.7 - k * 2.2, cy * 1.9 + k * 4.4) * 0.35; // 0.85〜1.2
  const art = PUDDLE_ART_SIZE[variant];
  const rx = (art.w / 2) * PUDDLE_ART_SCALE * scale;
  const ry = (art.h / 2) * PUDDLE_ART_SCALE * scale;
  const id = `pd-${cx}-${cy}-${k}`;
  const cell = `${cx},${cy}`;
  const at = (a: number): PuddleCand => {
    const o = a * 13.37;
    const x = cx * PUDDLE_CELL + PUDDLE_CELL * (0.1 + 0.8 * hash(cx * 1.3 + k * 5.7 + 2.1 + o, cy * 2.7 - k * 3.3 + 0.4 - o * 0.7));
    const y = cy * PUDDLE_CELL + PUDDLE_CELL * (0.1 + 0.8 * hash(cx * 3.1 - k * 4.1 + 6.6 - o * 1.3, cy * 1.1 + k * 2.6 - 3.8 + o));
    return { id, cell, stageId, variant, x, y, scale, rx, ry, art: puddleArtRect(x, y, rx, ry), col: null };
  };
  // 置き場所は区画の中で最大 PUDDLE_PLACE_TRIES か所を順に試す(1つ目は元の式のまま=避ける物が無ければ位置は変わらない)。
  // 木や花の絵を避けると1か所だけでは半数近くが弾かれて水たまりがまばらになるため、空いた所へずらして数を保つ。
  let first: PuddleCand | null = null;
  for (let a = 0; a < PUDDLE_PLACE_TRIES && !first; a++) {
    const c = at(a);
    if (!blocked(c.x, c.y, rx, ry, stageId)) { c.firstOk = true; first = c; }
  }
  const cands: (PuddleCand | null)[] = [first];
  for (let r = 1; r <= MAX_REROLLS; r++) cands.push(first ? at(PUDDLE_PLACE_TRIES - 1 + r) : null);
  return { cands, prio: hash(cx * 4.9 - k * 3.1 + 0.2, cy * 7.3 + k * 1.9 - 0.8), tie: id };
};

// 1番目の候補は作る時に上の層を確かめ済み(同じ確かめを2度しない)。
const puddleUpperOk = cachedCheck((c: PuddleCand): boolean => c.firstOk === true || !blocked(c.x, c.y, c.rx, c.ry, c.stageId));

// 区画の個体(候補の列)もメモする=隣の区画から「1番目の候補」を引く時と、自分の区画を決める時で作り直さない。
const puddleIndMemo = new CellMemo<Individual<PuddleCand>[]>();
const puddleCellIndividuals = (cx: number, cy: number, stageId: string): Individual<PuddleCand>[] =>
  puddleIndMemo.get(`${stageId}|${cx},${cy}`, () => {
    const out: Individual<PuddleCand>[] = [];
    const n = puddleCellCount(cx, cy);
    for (let k = 0; k < n; k++) out.push(puddleIndividual(cx, cy, k, stageId));
    return out;
  });

const puddleFirstMemo = new CellMemo<NeighborFirst<PuddleCand>[]>();
const puddleFirsts = (cx: number, cy: number, stageId: string): NeighborFirst<PuddleCand>[] =>
  // 1番目の候補は上の層に当たらない所を選んである(validFirsts の確かめは同じ答えになる)。
  puddleFirstMemo.get(`${stageId}|${cx},${cy}`, () => validFirsts(puddleCellIndividuals(cx, cy, stageId), () => true));

const withDebris = (c: PuddleCand, cx: number, cy: number, k: number): Puddle => {
  const { x, y, rx, ry } = c;
  const flip = hash(cx * 9.1 + k, cy * 0.3 - k) < 0.5;
  const waterOnly = hash(cx * 7.7 - k * 3.9 + 1.7, cy * 4.1 + k * 6.3 - 2.9) < PUDDLE_WATER_ONLY_RATE;
  // 小物: 0〜2個を水たまりの縁の外側へ(下側=手前寄りに多め)。水面だけの膜には添えない。
  const debris: PuddleDebris[] = [];
  const nd = waterOnly ? 0 : Math.floor(hash(cx * 4.4 + k * 0.9, cy * 6.2 - k * 1.3) * 3);
  for (let j = 0; j < nd; j++) {
    const a = hash(cx * 1.9 + j * 3.7 + k, cy * 2.8 - j * 1.1 - k) * Math.PI * 2;
    const r = 1.05 + hash(cx * 3.3 - j * 2.2, cy * 0.9 + j * 5.1 + k) * 0.35;
    const dv = DEBRIS_VARIANTS[Math.floor(hash(cx * 6.6 + j * 2.9, cy * 5.5 - j * 4.4 + k) * DEBRIS_VARIANTS.length) % DEBRIS_VARIANTS.length];
    debris.push({ variant: dv, x: x + Math.cos(a) * rx * r, y: y + Math.sin(a) * ry * r + 3, flip: hash(j + cx, k - cy) < 0.5 });
  }
  return { id: c.id, variant: c.variant, x, y, scale: c.scale, flip, rx, ry, waterOnly, debris };
};

const puddleCellMemo = new CellMemo<Puddle[]>();
const puddleCellFinal = (cx: number, cy: number, stageId: string): Puddle[] =>
  puddleCellMemo.get(`${stageId}|${cx},${cy}`, () => {
    const neighbors: NeighborFirst<PuddleCand>[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        neighbors.push(...puddleFirsts(cx + dx, cy + dy, stageId));
      }
    }
    return resolveCellLayer(puddleCellIndividuals(cx, cy, stageId), neighbors, puddleUpperOk, puddlesConflict)
      .map(c => withDebris(c, cx, cy, Number(c.id.slice(c.id.lastIndexOf('-') + 1))));
  });

/**
 * 可視域(+余白)の水たまり。区画ごとに 0〜2 個(約1割の区画は空・木や松明に弾かれる分はさらに減る)。決まった乱数=同じ場所には毎回同じ水たまり。
 * 同じ層どうしで重なる時は、区画の中は番号順・隣の区画とは優先値で、選び直す(research/PROP_OVERLAP.md §2)。
 */
export const puddlesInRegion = (
  minX: number, minY: number, maxX: number, maxY: number, avoid: PuddleAvoid = {},
): Puddle[] => {
  const stageId = avoid.stageId ?? 'stage-1';
  const out: Puddle[] = [];
  const cx0 = Math.floor(minX / PUDDLE_CELL) - 1, cx1 = Math.floor(maxX / PUDDLE_CELL) + 1;
  const cy0 = Math.floor(minY / PUDDLE_CELL) - 1, cy1 = Math.floor(maxY / PUDDLE_CELL) + 1;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const list = puddleCellFinal(cx, cy, stageId);
      for (let i = 0; i < list.length; i++) out.push(list[i]);
    }
  }
  return out;
};

/** 点 (x, y) が水たまりの水面(縁つきは楕円の内側 80%・水面だけの膜は縁が無いので 90%)に入っているか。踏んだ時の波紋に使う。 */
export const isInPuddle = (p: Pick<Puddle, 'x' | 'y' | 'rx' | 'ry'> & { waterOnly?: boolean }, x: number, y: number): boolean => {
  const k = p.waterOnly ? 0.9 : 0.8;
  const dx = (x - p.x) / (p.rx * k);
  const dy = (y - p.y) / (p.ry * k);
  return dx * dx + dy * dy <= 1;
};

/** 水たまりの一覧から、点 (x, y) が入っている最初の1つ(無ければ null)。 */
export const puddleAt = <T extends Pick<Puddle, 'x' | 'y' | 'rx' | 'ry'> & { waterOnly?: boolean }>(puddles: readonly T[], x: number, y: number): T | null => {
  for (const p of puddles) if (isInPuddle(p, x, y)) return p;
  return null;
};
