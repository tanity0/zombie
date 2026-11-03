// POIの前の空き地(社長指示2026-11-03「祠含めてPOIの目の前は空き地で」)。
// 寄り道の建物(廃病院・武器庫・警察署)と武将の祠の**正面(+Y=画面下=カメラ側)と左右**に、木・松明・花・
// 街の残骸を置かない矩形を作る。人が作るなら、祀られた場所や入口の前は空けておく(クリエイティブ監査2026-11-03 #15)。
//
// 方式は trees.ts の setTreesDisabled と同じ「world 層のモジュール状態」: gameStore.resetGame がランごとに POI の
// 足元を渡し、各生成関数(treesInRegion / torchesInRegion / forestFlowersInRegion / cityPropsInRegion)が
// ここで足元を弾く。**描画・当たり判定・湧き回避が同じ1点で同時に消える**(見えない幹にぶつからない)。
// RENDERER-AGNOSTIC: PixiJS を import しない。
import type { Rect } from './obstacles';

/** 空き地の左右の半幅(POIの足元のx から)。建物の絵の幅(約200)に木の枝張りぶんを足す。 */
export const POI_CLEARING_HALF_W = 210;
/** 足元より奥(-Y)に空ける深さ。建物の絵の手前に重なる木の根元を拾う程度(奥の木は建物の後ろに描かれるので残す)。 */
export const POI_CLEARING_BACK = 60;
/** 足元より手前(+Y)に空ける深さ。正面から近づく道・祠の円・警察署の囲いの前半まで。 */
export const POI_CLEARING_FRONT = 320;

let clearings: Rect[] = [];

/** その出撃の POI の足元から空き地を作り直す(resetGame が呼ぶ・null は無い POI)。 */
export const setPoiClearings = (feet: readonly ({ x: number; y: number } | null | undefined)[]): void => {
  clearings = [];
  for (const f of feet) if (f) clearings.push(poiClearingRect(f));
};

export const poiClearingRect = (f: { x: number; y: number }): Rect => ({
  x: f.x - POI_CLEARING_HALF_W,
  y: f.y - POI_CLEARING_BACK,
  width: POI_CLEARING_HALF_W * 2,
  height: POI_CLEARING_BACK + POI_CLEARING_FRONT,
});

/** 足元 (x, y) が空き地の中か。空き地が無い出撃(ボスメーカー・研究所等)は常に false=負荷ゼロ。 */
export const isInPoiClearing = (x: number, y: number): boolean => {
  if (clearings.length === 0) return false;
  for (const r of clearings) {
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return true;
  }
  return false;
};
