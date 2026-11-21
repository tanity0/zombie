// ステージ5(戦場)の燃える残骸(社長指示2026-11-21「燃える残骸足して」)。
// 散布オブジェクト(cityProps.ts の STAGE5_PROPS)のうち、燃える物(残骸・木箱・テント・木の柵など)の
// 一部を「燃えている」とする。どれが燃えるかは置物の id だけで決まる(決定的・引く範囲に依らない)。
// ★見た目だけ。ダメージも当たり判定も持たない(判定は今までどおり cityPropRect)。
// 壊された置物は cityPropsInRegion が外すので、燃える残骸からも消える。
// RENDERER-AGNOSTIC: PixiJS を import しない。描画は pixi/stage5Battlefield.ts の BurningWreckLayer。

import { cityPropsInRegion, cityPropDef, cityPropArtRect, type CityProp } from './cityProps';
import type { Rect } from './obstacles';

/** 燃える残骸が出る散布カタログ(ステージ5の戦場だけ)。 */
export const BURNING_WRECK_FAR_KEY = 'stage5';

/**
 * 燃え得る置物の絵(STAGE5_PROPS の tex)。石(岩・石柱・アーチ・石壁・城壁)・鉄の柱・地面のデカール・
 * 小物は燃えない。残骸・木・布・機材だけ。
 */
export const BURNABLE_WRECK_TEX: ReadonlySet<string> = new Set([
  'stage5-props/prop-r2-c1',  // 瓦礫の山
  'stage5-props/prop-r3-c2',  // 壊れた臼砲
  'stage5-props/prop-r3-c3',  // 荷車の残骸
  'stage5-props/prop-r3-c4',  // 残骸の山
  'stage5-props/prop-r3-c5',  // 血染めの防壁
  'stage5-props/prop-r3-c6',  // 機材ボックス
  'stage5-props/prop-r3-c7',  // 破れテント
  'stage5-props/prop-r6-c1',  // 木箱
  'stage5-props/prop-r6-c2',  // 木箱2
  'stage5-props/prop-r6-c3',  // 木箱3
  'stage5-props/prop-r6-c5',  // 赤木箱
  'stage5-props/prop-r7-c4',  // 木枠バリケード
  'stage5-props/prop-r7-c7',  // 杭と骨の山
]);

/** 燃え得る置物のうち、実際に燃えている割合(id のハッシュで決める)。 */
export const BURNING_WRECK_FRACTION = 0.3;

/** 文字列の決定的なハッシュ(0..1)。FNV-1a。 */
const idHash01 = (id: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

/** 置物 p(散布カタログ farKey)が燃えているか。id と種類だけで決まる。 */
export const isBurningProp = (farKey: string, p: Pick<CityProp, 'id' | 'variant'>): boolean => {
  if (farKey !== BURNING_WRECK_FAR_KEY) return false;
  const def = cityPropDef(farKey, p.variant);
  if (!def || def.decal || !BURNABLE_WRECK_TEX.has(def.tex)) return false;
  return idHash01(p.id) < BURNING_WRECK_FRACTION;
};

/** 燃えている置物ごとの火の揺らぎの種(0..1・炎の位相や数を個体ごとにずらす)。 */
export const burningSeed01 = (id: string): number => idHash01(id + '#fire');

export interface BurningWreck {
  id: string;
  footX: number;
  footY: number;
  /** 置物の絵の矩形(遠近前・足元から上)。炎の大きさと位置はこれに合わせる。 */
  art: Rect;
  seed: number;
}

/** 範囲に入る燃えている置物(壊された物は除く)。ステージ5以外は空。 */
export const burningWrecksInRegion = (
  farKey: string, minX: number, minY: number, maxX: number, maxY: number,
): BurningWreck[] => {
  if (farKey !== BURNING_WRECK_FAR_KEY) return [];
  const out: BurningWreck[] = [];
  for (const p of cityPropsInRegion(farKey, minX, minY, maxX, maxY)) {
    if (p.footX < minX || p.footX > maxX || p.footY < minY || p.footY > maxY) continue;
    if (!isBurningProp(farKey, p)) continue;
    const art = cityPropArtRect(farKey, p);
    if (!art) continue;
    out.push({ id: p.id, footX: p.footX, footY: p.footY, art, seed: burningSeed01(p.id) });
  }
  return out;
};
