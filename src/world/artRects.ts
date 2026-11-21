// ランダムに置く物の「絵の矩形」の台帳(research/PROP_OVERLAP.md §1)。
//
// 絵の矩形 = 足元を下辺の中心にした `{足元x − w/2, 足元y − h, w, h}`(遠近の倍率を掛ける前の基準寸法)。
// 重なりの決まり(world/propPlacement.ts)が、置き物どうし・手置きの物との重なりをこの寸法で測る。
// 寸法は**描画(pixiScene)が実際に出している大きさ**から出す。描画側の箱の定数(木・松明)はここが正本で、
// pixiScene はここから import する=絵の大きさを変えても重なりの判定がずれない。
//
// RENDERER-AGNOSTIC: PixiJS を import しない(素材の縦横は PNG の実寸を表で持つ)。
import type { Rect } from './obstacles';

// ---- 木(描画: pixiScene.syncTrees) ----
/** 木の見た目倍率(社長指示で 1.5倍=1.65→2.475)。幹の当たり判定(trees.ts)とは無関係。 */
export const TREE_VISUAL_SCALE = 1.65 * 1.5;
/** 木の絵を収める箱(scale 1・倍率を掛ける前)。描画は containScale(箱, テクスチャ) で内接させる。 */
export const TREE_BOX_W = 48;
export const TREE_BOX_H = 64;
/** 木のテクスチャの実寸(farBackdrop ごと・syncTrees の出し分けと同じ)。 */
const TREE_TEX: Readonly<Record<string, { w: number; h: number }>> = {
  '': { w: 201, h: 233 },       // 'tree'(atlas-px2/tree.png=枯れ木)
  city: { w: 198, h: 249 },     // 'tree-city'(tree-new2.png)
  snow: { w: 382, h: 515 },     // 'tree-snow'
};
const containSize = (boxW: number, boxH: number, tw: number, th: number): { w: number; h: number } => {
  const k = Math.min(boxW / tw, boxH / th);
  return { w: tw * k, h: th * k };
};
/**
 * 葉付きの木の3本組(社長支給2026-11-21「ステージ1の木を入れ替え 3パターンで、大きめに配置」→ステージ7も揃える/
 * 「ステージ3の木、差し替え3種類 同じく大きめに」)。木の絵の種類キー(treeSkin)がこの表にある出撃だけ3本を使う
 * (他ステージは farBackdrop のキーのまま=枯れ木/雪の木)。どの木がどの絵かは区画で決まる(trees.ts の variant)。
 * tex=素材名 / w・h=PNG の実寸 / footX・footUp=幹の根元(左から・下から・素材px)。px=素材1pxあたりの world px(scale 1)。
 */
export interface LeafyTreeDef { tex: string; w: number; h: number; footX: number; footUp: number }
/** ステージ1・ステージ7の森(苔の大木/うねる幹/細い木)。 */
export const STAGE1_TREE_SKIN = 'stage1';
/** ステージ3の廃都(藤の垂れる大木/中木/細い木)。 */
export const STAGE3_TREE_SKIN = 'city3';
/** ステージ4の雪の封鎖地域(雪をかぶった針葉樹・大/中/小)。 */
export const STAGE4_TREE_SKIN = 'snow4';
export const LEAFY_TREE_SKINS: Readonly<Record<string, { px: number; trees: readonly LeafyTreeDef[] }>> = {
  // 一番大きい木(128px)が枯れ木(約138)の約1.4倍=192。3本の大小は絵の比のまま。
  [STAGE1_TREE_SKIN]: { px: 1.5, trees: [
    { tex: 'tree-forest-a', w: 96, h: 128, footX: 43, footUp: 3 }, // 大(苔の大木)
    { tex: 'tree-forest-b', w: 111, h: 101, footX: 47, footUp: 3 }, // 中(うねる幹・岩)
    { tex: 'tree-forest-c', w: 73, h: 97, footX: 33, footUp: 3 },   // 小(細い木・倒木)
  ] },
  // 3本とも高さ約128px(大中小は幅と茂り)。今の葉付き木(tree-new2・約149)の約1.37倍=205。
  [STAGE3_TREE_SKIN]: { px: 1.6, trees: [
    { tex: 'tree-city-a', w: 116, h: 128, footX: 60, footUp: 3 }, // 大(藤の垂れる大木)
    { tex: 'tree-city-b', w: 99, h: 127, footX: 48, footUp: 3 },  // 中
    { tex: 'tree-city-c', w: 86, h: 127, footX: 41, footUp: 3 },  // 小(細い木)
  ] },
  // 大(1枚もの・128px)が今の雪の木(tree-snow・約158)の約1.38倍=218。中・小は絵の比のまま。
  [STAGE4_TREE_SKIN]: { px: 1.7, trees: [
    { tex: 'tree-snow-a', w: 65, h: 128, footX: 33, footUp: 3 }, // 大
    { tex: 'tree-snow-b', w: 69, h: 118, footX: 38, footUp: 3 }, // 中
    { tex: 'tree-snow-c', w: 62, h: 116, footX: 33, footUp: 3 }, // 小
  ] },
};
/** 葉付きの3本組の1本(variant は 0..2)。表に無い treeSkin は null。 */
export const leafyTreeDef = (treeSkin: string, variant: number): LeafyTreeDef | null => {
  const sk = LEAFY_TREE_SKINS[treeSkin];
  if (!sk) return null;
  const n = sk.trees.length;
  return sk.trees[((variant % n) + n) % n];
};
/** 木の絵の実寸(scale 1)=箱に縮めて収まった大きさ。treeSkin(=farBackdrop、葉付きの3本組の出撃はそのキー)で木の絵が変わる。 */
export const treeArtSize = (treeSkin: string, variant = 0): { w: number; h: number } => {
  const d = leafyTreeDef(treeSkin, variant);
  if (d) { const px = LEAFY_TREE_SKINS[treeSkin].px; return { w: d.w * px, h: d.h * px }; }
  const t = TREE_TEX[treeSkin] ?? TREE_TEX[''];
  return containSize(TREE_BOX_W * TREE_VISUAL_SCALE, TREE_BOX_H * TREE_VISUAL_SCALE, t.w, t.h);
};
/**
 * 木の絵の足元(描画の anchor)。既定は下辺の中心(0.5, 1)。葉付きの3本は幹の根元に合わせる
 * (幹が絵の中心から少しずれている・根元の下に草が数px垂れる)=幹の当たり判定(足元)の上に幹が立つ。
 */
export const treeArtAnchor = (treeSkin: string, variant = 0): { x: number; y: number } => {
  const d = leafyTreeDef(treeSkin, variant);
  if (!d) return { x: 0.5, y: 1 };
  return { x: d.footX / d.w, y: (d.h - d.footUp) / d.h };
};
/** 全ステージの木の絵の最大(scale 1)。 */
export const TREE_ART_MAX = (() => {
  let w = 0, h = 0;
  for (const k of Object.keys(TREE_TEX)) { const s = treeArtSize(k); w = Math.max(w, s.w); h = Math.max(h, s.h); }
  for (const k of Object.keys(LEAFY_TREE_SKINS)) {
    for (let v = 0; v < LEAFY_TREE_SKINS[k].trees.length; v++) { const s = treeArtSize(k, v); w = Math.max(w, s.w); h = Math.max(h, s.h); }
  }
  return { w, h };
})();

// ---- 松明・焚き火(描画: pixiScene の breakable prop。台座を箱に内接させる) ----
export const TORCH_VISUAL_W = 42;
export const TORCH_VISUAL_H = 68;
export const CAMPFIRE_VISUAL_W = 60;
export const CAMPFIRE_VISUAL_H = 34;
/** 松明の絵の箱(scale 1)。ステージ4は焚き火。炎は台座の上に乗るので箱の高さで近似する。 */
export const torchArtSize = (farKey: string): { w: number; h: number } =>
  farKey === 'snow' ? { w: CAMPFIRE_VISUAL_W, h: CAMPFIRE_VISUAL_H } : { w: TORCH_VISUAL_W, h: TORCH_VISUAL_H };
export const TORCH_ART_MAX = { w: Math.max(TORCH_VISUAL_W, CAMPFIRE_VISUAL_W), h: Math.max(TORCH_VISUAL_H, CAMPFIRE_VISUAL_H) };

// ---- 花(描画: pixiScene.syncForestFlowers・高さ FLOWER_DISPLAY_H×scale・幅は絵の縦横比) ----
/** flower-0..11.png の 幅÷高さ。 */
export const FLOWER_ASPECT: readonly number[] = [
  251 / 294, 261 / 290, 298 / 282, 260 / 285, 259 / 286, 256 / 278,
  264 / 286, 262 / 343, 264 / 342, 255 / 342, 250 / 273, 262 / 282,
];
export const FLOWER_ASPECT_MAX = Math.max(...FLOWER_ASPECT);

// ---- 街/雪/ステージ5の置物(描画: pixiScene.syncCityProps・高さ displayH×scale・幅は絵の縦横比) ----
/** 素材の 幅÷高さ(PNG の実寸)。表に無い素材は 1(正方形)とみなす。 */
export const PROP_TEX_ASPECT: Readonly<Record<string, number>> = {
  'props/prop2-r0-c1': 144 / 127, 'props/prop2-r0-c3': 259 / 243, 'props/prop2-r0-c4': 310 / 230,
  'props/prop2-r1-c0': 237 / 158, 'props/prop2-r1-c1': 226 / 157, 'props/prop2-r1-c2': 134 / 189,
  'props/prop2-r1-c3': 113 / 178, 'props/prop2-r1-c4': 99 / 174, 'props/prop2-r1-c5': 103 / 136,
  'props/prop2-r1-c6': 109 / 149, 'props/prop2-r2-c0': 236 / 161, 'props/prop2-r2-c1': 113 / 116,
  'props/prop2-r2-c2': 190 / 153, 'props/prop2-r2-c3': 170 / 122, 'props/prop2-r2-c4': 233 / 159,
  'props/prop2-r2-c5': 208 / 153, 'props/prop2-r3-c0': 191 / 126, 'props/prop2-r3-c1': 85 / 185,
  'props/prop2-r3-c2': 238 / 162, 'props/prop2-r3-c3': 195 / 112, 'props/prop2-r3-c4': 169 / 204,
  'props/prop2-r3-c5': 222 / 191, 'props/prop2-r4-c0': 95 / 135, 'props/prop2-r4-c1': 117 / 127,
  'props/prop2-r4-c2': 151 / 105, 'props/prop2-r4-c3': 85 / 70, 'props/prop2-r4-c4': 75 / 51,
  'props/prop2-r4-c5': 52 / 40, 'props/prop2-r4-c6': 36 / 27, 'props/prop2-r4-c7': 189 / 95,
  'props/prop2-r4-c8': 115 / 117,
  'props/stage4-tower': 335 / 457, 'props/stage4-bus': 508 / 358, 'props/stage4-tent': 506 / 358,
  'stage5-props/prop-r2-c1': 156 / 86, 'stage5-props/prop-r2-c2': 135 / 109, 'stage5-props/prop-r2-c3': 86 / 110,
  'stage5-props/prop-r2-c4': 83 / 85, 'stage5-props/prop-r2-c5': 94 / 111, 'stage5-props/prop-r2-c6': 121 / 119,
  'stage5-props/prop-r2-c7': 108 / 98, 'stage5-props/prop-r2-c8': 51 / 107, 'stage5-props/prop-r2-c9': 103 / 100,
  'stage5-props/prop-r2-c10': 105 / 85, 'stage5-props/prop-r3-c1': 192 / 109, 'stage5-props/prop-r3-c2': 156 / 112,
  'stage5-props/prop-r3-c3': 210 / 108, 'stage5-props/prop-r3-c4': 159 / 79, 'stage5-props/prop-r3-c5': 145 / 99,
  'stage5-props/prop-r3-c6': 141 / 102, 'stage5-props/prop-r3-c7': 207 / 129,
  'stage5-props/prop-r1-c1': 178 / 91, 'stage5-props/prop-r1-c2': 180 / 78, 'stage5-props/prop-r1-c3': 110 / 88,
  'stage5-props/prop-r1-c4': 98 / 68, 'stage5-props/prop-r1-c5': 151 / 62, 'stage5-props/prop-r1-c6': 95 / 61,
  'stage5-props/prop-r1-c7': 113 / 82, 'stage5-props/prop-r1-c8': 172 / 63,
  'stage5-props/prop-r4-c1': 94 / 76, 'stage5-props/prop-r4-c2': 86 / 90, 'stage5-props/prop-r4-c3': 86 / 71,
  'stage5-props/prop-r4-c4': 74 / 78, 'stage5-props/prop-r4-c5': 61 / 77, 'stage5-props/prop-r4-c6': 108 / 84,
  'stage5-props/prop-r4-c7': 109 / 86, 'stage5-props/prop-r4-c8': 107 / 83, 'stage5-props/prop-r4-c9': 101 / 73,
  'stage5-props/prop-r4-c10': 94 / 83,
  'stage5-props/prop-r5-c1': 109 / 100, 'stage5-props/prop-r5-c2': 144 / 99, 'stage5-props/prop-r5-c3': 103 / 89,
  'stage5-props/prop-r5-c4': 86 / 98, 'stage5-props/prop-r5-c5': 113 / 97, 'stage5-props/prop-r5-c6': 122 / 78,
  'stage5-props/prop-r5-c7': 108 / 76, 'stage5-props/prop-r5-c8': 117 / 86,
  'stage5-props/prop-r6-c1': 98 / 71, 'stage5-props/prop-r6-c2': 93 / 71, 'stage5-props/prop-r6-c3': 95 / 70,
  'stage5-props/prop-r6-c4': 69 / 67, 'stage5-props/prop-r6-c5': 99 / 73, 'stage5-props/prop-r6-c6': 99 / 75,
  'stage5-props/prop-r6-c7': 44 / 64, 'stage5-props/prop-r6-c8': 44 / 62, 'stage5-props/prop-r6-c9': 38 / 64,
  'stage5-props/prop-r6-c10': 50 / 43, 'stage5-props/prop-r6-c11': 46 / 43, 'stage5-props/prop-r6-c12': 18 / 53,
  'stage5-props/prop-r6-c13': 114 / 48,
  'stage5-props/prop-r7-c3': 127 / 77, 'stage5-props/prop-r7-c4': 85 / 72, 'stage5-props/prop-r7-c5': 85 / 75,
  'stage5-props/prop-r7-c6': 56 / 73, 'stage5-props/prop-r7-c7': 140 / 82,
  'stage5-props/prop-r8-c1': 89 / 58, 'stage5-props/prop-r8-c2': 71 / 56, 'stage5-props/prop-r8-c3': 102 / 30,
  'stage5-props/prop-r8-c4': 40 / 39, 'stage5-props/prop-r8-c5': 188 / 46,
  'stage5-props/prop-r9-c1': 89 / 32, 'stage5-props/prop-r9-c2': 89 / 35, 'stage5-props/prop-r9-c3': 118 / 48,
  'stage5-props/prop-r9-c4': 124 / 37, 'stage5-props/prop-r9-c5': 46 / 44, 'stage5-props/prop-r9-c6': 112 / 36,
  'stage5-props/prop-r9-c7': 56 / 46, 'stage5-props/prop-r9-c8': 76 / 47, 'stage5-props/prop-r9-c9': 84 / 45,
  'stage5-props/prop-r9-c10': 47 / 40, 'stage5-props/prop-r9-c11': 94 / 48, 'stage5-props/prop-r9-c12': 75 / 39,
};
export const propTexAspect = (tex: string): number => PROP_TEX_ASPECT[tex] ?? 1;

/**
 * 置物の絵の矩形。回転なし=足元が下辺の中心(anchor 0.5,1)。回転あり=描画は中心アンカー(足元が絵の中心)なので、
 * 回転後の外接矩形を足元を中心に取る。
 */
export const propArtRect = (footX: number, footY: number, w: number, h: number, rotation = 0): Rect => {
  if (rotation === 0) return { x: footX - w / 2, y: footY - h, width: w, height: h };
  const c = Math.abs(Math.cos(rotation)), s = Math.abs(Math.sin(rotation));
  const bw = w * c + h * s, bh = w * s + h * c;
  return { x: footX - bw / 2, y: footY - bh / 2, width: bw, height: bh };
};

// ---- 研究所(描画: pixiScene.makeLabWallView / makeLabPropView) ----
/** lab-prop2-r{row}-c{col}.png の実寸(variant = (row-1)*4 + (col-1))。描画は 92×92 の箱に内接。 */
export const LAB_PROP_TEX: readonly { w: number; h: number }[] = [
  { w: 310, h: 356 }, { w: 315, h: 360 }, { w: 299, h: 302 }, { w: 226, h: 368 },
  { w: 333, h: 373 }, { w: 290, h: 316 }, { w: 277, h: 366 }, { w: 288, h: 335 },
  { w: 256, h: 337 }, { w: 306, h: 371 }, { w: 265, h: 348 }, { w: 265, h: 360 },
];
export const labPropArtSize = (variant: number, displayH: number): { w: number; h: number } => {
  const t = LAB_PROP_TEX[variant] ?? { w: 1, h: 1 };
  return containSize(displayH, displayH, t.w, t.h);
};
/** 研究所の壁の素材(lab-wall-obj-h.png)の実寸。描画は WALL_DISPLAY_H の箱に内接。 */
export const LAB_WALL_TEX = { w: 256, h: 153 };
export const labWallArtSize = (box: { w: number; h: number }): { w: number; h: number } =>
  containSize(box.w, box.h, LAB_WALL_TEX.w, LAB_WALL_TEX.h);

// ---- 手置きの物の絵(描画: pixiScene の建物・城) ----
/** POI の建物の絵(足元から上・左右)。病院/武器庫/警察署(高さ 188・最大幅 約240)・祠(170)・隠しPOI(150・幅 約200)を覆う。 */
export const POI_ART_HALF_W = 125;
export const POI_ART_H = 200;
/** 城の絵(高さ 188・幅は素材の縦横比で 186〜205)。足元 = 城の y + 38。 */
export const CASTLE_ART_HALF_W = 105;
export const CASTLE_ART_H = 190;
export const CASTLE_FOOT_OFFSET_Y = 38;
