// ステージ1(森)の装飾オブジェクト = 光る花クラスター。社長提供の12枚シートから抽出。
// 木(trees.ts)と同じく「世界座標の純粋関数」として区画ごとに決定的散布する(エンティティとして
// 保持しない=リロードやカメラ移動で位置がブレない)。
//
// RENDERER-AGNOSTIC: PixiJS を import しない。描画は pixi 側が forestFlowersInRegion を読んで
// Sprite を並べるだけ。**当たり判定なし(壁判定無し・素通り)**=社長指示の純粋な飾り。store も触らない。
//
// 配置はステージ1限定(FLOWER_STAGES)。他の森ステージへ広げたい場合は id を追加するだけ。

import type { Rect } from './obstacles';
import { isInPoiClearing, isClearOfHandPlaced } from './poiClearings';
import { treeFootprintsNear } from './trees';
import { torchFootprintsNear } from './torches';
import { cityPropFootprintsNear } from './cityProps';
import { FLOWER_ASPECT, FLOWER_ASPECT_MAX } from './artRects';
import {
  CellMemo, MAX_REROLLS, bumpPropPlacementVersion, cachedCheck, footprintsConflict, placementFarKey, resolveCellLayer, validFirsts,
  type Footprint, type Individual, type NeighborFirst,
} from './propPlacement';

export interface ForestFlower {
  id: string;
  footX: number;   // 足元(Y-sortキー・スプライトのアンカー 0.5,1)
  footY: number;
  scale: number;   // 個体ごとの大小ゆらぎ
  variant: number; // 0..11(flower-<variant>)
}

// 花の種類数(public/sprites/props/flower-0..11.png)。
export const FLOWER_VARIANTS = 12;
// 描画の基準高さ(world px・scale 1)。個体scaleでさらに 0.62〜0.92 倍。
// (社長指示で段階的に拡大: 42→58→74→148 → 少し縮小 128 → さらに少し縮小 112=v0.25.3345「少しだけ全部小さく」)
export const FLOWER_DISPLAY_H = 112;
// 散布する区画サイズ。木(220)より広め=まばらに点在。
export const FLOWER_ZONE = 340;
// スタート地点(原点)付近は空ける安全半径。
export const FLOWER_SAFE_RADIUS = 180;
// 花を散布するステージ(現状ステージ1のみ)。
export const FLOWER_STAGES = new Set<string>(['stage-1']);

const hash2 = (x: number, y: number): number => {
  const s = Math.sin(x * 73.19 + y * 31.41) * 43758.5453;
  return s - Math.floor(s);
};

// stageId が対象なら、可視領域の各区画へ決定的に花を散布。対象外は空配列(=描画no-op)。
// ボスメーカーの部屋(BOSS_MAKER.md §1-1「壁なし・障害物なし・敵は選んだボス1体だけ」)では
// 飾りも出さない。花は判定こそ無いが**Y-sort層に並ぶ大きな絵(128px)**なのでボスの足元に重なり、
// 「いま見えている絵はボスのものか飾りか」を毎回疑う羽目になる(社長指示v0.25.2628)。
// trees.ts の setTreesDisabled と同じ world 層モジュール状態方式=描画側は何も知らないまま消える。
let flowersDisabled = false;
export const setFlowersDisabled = (disabled: boolean): void => {
  if (flowersDisabled !== disabled) bumpPropPlacementVersion(); // 下の層(水たまり)の避け方が変わる
  flowersDisabled = disabled;
};

/** 花の絵の矩形(高さ FLOWER_DISPLAY_H×scale・幅は絵の縦横比・足元から上)。 */
export const flowerArtRect = (f: Pick<ForestFlower, 'footX' | 'footY' | 'scale' | 'variant'>): Rect => {
  const h = FLOWER_DISPLAY_H * f.scale;
  const w = h * (FLOWER_ASPECT[f.variant] ?? 1);
  return { x: f.footX - w / 2, y: f.footY - h, width: w, height: h };
};

type FlowerCand = ForestFlower & Footprint;

const flowerCellCount = (cx: number, cy: number): number => 1 + Math.floor(hash2(cx * 3.7 + 1.1, cy * 2.3 - 0.6) * 3); // 1区画あたり 1〜3 株

// 区画の k 番目の花の個体(2/3 密度で欠けた番号は null)。候補0 = 元の式の位置。候補1〜6 = 選び直し(同じ区画の中)。
const flowerIndividual = (cx: number, cy: number, k: number): Individual<FlowerCand> | null => {
  // 2/3 密度: 1/3 をスキップ。
  if (hash2(cx * 8.1 + k * 3.3 + 0.5, cy * 6.7 - k * 2.9 + 1.3) < 1 / 3) return null;
  const id = `fl-${cx}-${cy}-${k}`;
  const variant = Math.floor(hash2(cx * 5.1 + k * 1.9, cy * 4.3 - k * 2.2) * FLOWER_VARIANTS) % FLOWER_VARIANTS;
  const scale = 0.62 + hash2(cx * 0.8 + k * 3.6, cy * 1.5 - k * 0.9) * 0.30; // 0.62〜0.92
  const cands: (FlowerCand | null)[] = [];
  for (let r = 0; r <= MAX_REROLLS; r++) {
    const o = r * 9.73;
    const footX = cx * FLOWER_ZONE + FLOWER_ZONE * (0.1 + 0.8 * hash2(cx * 1.7 + k * 6.3 + 3.1 + o, cy * 2.1 - k * 4.2 + 5.5 - o * 0.8));
    const footY = cy * FLOWER_ZONE + FLOWER_ZONE * (0.1 + 0.8 * hash2(cx * 2.9 - k * 4.7 + 8.2 - o * 1.2, cy * 1.3 + k * 3.1 - 7.7 + o));
    // POIの前は空き地(社長指示2026-11-03)
    if (Math.hypot(footX, footY) < FLOWER_SAFE_RADIUS || isInPoiClearing(footX, footY)) { cands.push(null); continue; }
    const f: ForestFlower = { id, footX, footY, scale, variant };
    cands.push({ ...f, art: flowerArtRect(f), col: null });
  }
  return { cands, prio: hash2(cx * 6.9 - k * 2.1 + 0.9, cy * 7.7 + k * 3.9 - 1.1), tie: id };
};

// 花の上の層 = 手置きの物・木・置物(デカール以外)・松明(RELAX 込みの最大)。
const flowerUpperOk = cachedCheck((c: FlowerCand): boolean => {
  if (!isClearOfHandPlaced(c.art)) return false;
  for (const t of treeFootprintsNear(c.art)) if (footprintsConflict(c, t)) return false;
  for (const p of cityPropFootprintsNear(placementFarKey(), c.art)) if (footprintsConflict(c, p)) return false;
  for (const t of torchFootprintsNear(c.art)) if (footprintsConflict(c, t)) return false;
  return true;
});

// 区画の個体(候補の列)もメモする=隣の区画からの参照と自分の区画の決めで同じ候補の物を使う(上の層の確かめを使い回す)。
const flowerIndMemo = new CellMemo<Individual<FlowerCand>[]>();
const flowerCellIndividuals = (cx: number, cy: number): Individual<FlowerCand>[] =>
  flowerIndMemo.get(`${cx},${cy}`, () => {
    const out: Individual<FlowerCand>[] = [];
    const n = flowerCellCount(cx, cy);
    for (let k = 0; k < n; k++) { const ind = flowerIndividual(cx, cy, k); if (ind) out.push(ind); }
    return out;
  });

const flowerFirstMemo = new CellMemo<NeighborFirst<FlowerCand>[]>();
const flowerFirsts = (cx: number, cy: number): NeighborFirst<FlowerCand>[] =>
  flowerFirstMemo.get(`${cx},${cy}`, () => validFirsts(flowerCellIndividuals(cx, cy), flowerUpperOk));

const flowerCellMemo = new CellMemo<ForestFlower[]>();
const flowerCellFinal = (cx: number, cy: number): ForestFlower[] =>
  flowerCellMemo.get(`${cx},${cy}`, () => {
    const neighbors: NeighborFirst<FlowerCand>[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        neighbors.push(...flowerFirsts(cx + dx, cy + dy));
      }
    }
    return resolveCellLayer(flowerCellIndividuals(cx, cy), neighbors, flowerUpperOk)
      .map(c => ({ id: c.id, footX: c.footX, footY: c.footY, scale: c.scale, variant: c.variant }));
  });

export const forestFlowersInRegion = (
  stageId: string, minX: number, minY: number, maxX: number, maxY: number,
): ForestFlower[] => {
  if (flowersDisabled || !FLOWER_STAGES.has(stageId)) return [];
  const out: ForestFlower[] = [];
  const cx0 = Math.floor(minX / FLOWER_ZONE) - 1, cx1 = Math.floor(maxX / FLOWER_ZONE) + 1;
  const cy0 = Math.floor(minY / FLOWER_ZONE) - 1, cy1 = Math.floor(maxY / FLOWER_ZONE) + 1;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const list = flowerCellFinal(cx, cy);
      for (let i = 0; i < list.length; i++) out.push(list[i]);
    }
  }
  return out;
};

/** 絵の矩形 art に届き得る花(形つき)。下の層(水たまり)が避ける相手。 */
export const flowerFootprintsNear = (stageId: string, art: Rect): (ForestFlower & Footprint)[] => {
  const pad = FLOWER_DISPLAY_H * Math.max(1, FLOWER_ASPECT_MAX);
  return forestFlowersInRegion(stageId, art.x - pad, art.y - pad, art.x + art.width + pad, art.y + art.height + pad)
    .map(f => ({ ...f, art: flowerArtRect(f), col: null }));
};
