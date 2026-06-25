// Stage-3 (廃都・正午) のランダム散布オブジェクト。社長提供のオブジェクトシートから抽出した
// 瓦礫/石柱/樽/荷車/バリケード/フェンス/消火栓…等を、木と同じく「世界座標の純粋関数」として
// 区画ごとに決定的散布する(エンティティとして保持しない=描画と当たり判定が必ず一致)。
//
// RENDERER-AGNOSTIC: PixiJS を import しない。描画は pixi 側が CITY_PROPS / cityPropsInRegion を
// 読んで Sprite を並べるだけ。当たり判定は store が cityPropRect / resolveCityPropCollision を使う。
// 当たり判定は「大きい物だけ」(社長指示)。decal(血痕/草/小石)は素通り。
import { Rect, footRect, resolveAabb } from './obstacles';
import { isObstacleDestroyed } from './destructibles';

export interface CityPropDef {
  tex: string;       // テクスチャ名(sprites/<tex>.png)
  displayH: number;  // 描画の基準高さ(world px・scale 1)。実スケール = displayH*scale / texHeight
  collide: boolean;  // 当たり判定あり(大きい物)
  decal: boolean;    // true=地面デカール(地面レイヤー・Y-sortなし・当たり無し)
  colW: number;      // 足元当たり矩形の幅(world px・collide時のみ)
  colH: number;      // 同 高さ(=奥行きの薄い帯。底辺が足元)
  weight: number;    // 散布の出やすさ
}

// シートから抽出した素材(木 r0-c0/r0-c2 は tree システム側なので除外)。
export const CITY_PROPS: CityPropDef[] = [
  { tex: 'props/prop2-r0-c1', displayH: 50,  collide: false, decal: false, colW: 0,   colH: 0,  weight: 5 },  // 低木
  { tex: 'props/prop2-r0-c3', displayH: 198, collide: true,  decal: false, colW: 144, colH: 31, weight: 2 },  // 廃墟(角) 132*1.5 / 足元 横96*1.5 縦26*1.2
  { tex: 'props/prop2-r0-c4', displayH: 183, collide: true,  decal: false, colW: 180, colH: 31, weight: 2 },  // 廃墟(壁) 122*1.5 / 足元 横120*1.5 縦26*1.2
  { tex: 'props/prop2-r1-c0', displayH: 80,  collide: true,  decal: false, colW: 108, colH: 22, weight: 5 },  // 瓦礫(横長)
  { tex: 'props/prop2-r1-c1', displayH: 82,  collide: true,  decal: false, colW: 94,  colH: 22, weight: 5 },  // 瓦礫2
  { tex: 'props/prop2-r1-c2', displayH: 96,  collide: true,  decal: false, colW: 40,  colH: 20, weight: 4 },  // 石柱
  { tex: 'props/prop2-r1-c3', displayH: 96,  collide: true,  decal: false, colW: 26,  colH: 14, weight: 2 },  // 旗竿
  { tex: 'props/prop2-r1-c4', displayH: 86,  collide: true,  decal: false, colW: 26,  colH: 14, weight: 2 },  // 標識
  { tex: 'props/prop2-r1-c5', displayH: 60,  collide: true,  decal: false, colW: 34,  colH: 20, weight: 5 },  // 木樽
  { tex: 'props/prop2-r1-c6', displayH: 62,  collide: true,  decal: false, colW: 34,  colH: 20, weight: 5 },  // 金属ドラム
  { tex: 'props/prop2-r2-c0', displayH: 92,  collide: true,  decal: false, colW: 128, colH: 26, weight: 3 },  // 荷車
  { tex: 'props/prop2-r2-c1', displayH: 58,  collide: true,  decal: false, colW: 30,  colH: 18, weight: 3 },  // 車輪
  { tex: 'props/prop2-r2-c2', displayH: 82,  collide: true,  decal: false, colW: 94,  colH: 22, weight: 4 },  // 壊れた荷車
  { tex: 'props/prop2-r2-c3', displayH: 36,  collide: false, decal: true,  colW: 0,   colH: 0,  weight: 7 },  // 瓦礫(小・デカール)
  { tex: 'props/prop2-r2-c4', displayH: 92,  collide: true,  decal: false, colW: 118, colH: 24, weight: 3 },  // バリケード
  { tex: 'props/prop2-r2-c5', displayH: 92,  collide: true,  decal: false, colW: 130, colH: 18, weight: 3 },  // 木柵
  { tex: 'props/prop2-r3-c0', displayH: 82,  collide: true,  decal: false, colW: 70,  colH: 22, weight: 3 },  // ポンプ
  { tex: 'props/prop2-r3-c1', displayH: 98,  collide: true,  decal: false, colW: 24,  colH: 14, weight: 3 },  // 街灯
  { tex: 'props/prop2-r3-c2', displayH: 84,  collide: true,  decal: false, colW: 130, colH: 18, weight: 3 },  // 石の手すり
  { tex: 'props/prop2-r3-c3', displayH: 64,  collide: true,  decal: false, colW: 94,  colH: 22, weight: 4 },  // 土嚢
  { tex: 'props/prop2-r3-c4', displayH: 70,  collide: true,  decal: false, colW: 94,  colH: 22, weight: 3 },  // コンクリ防護壁
  { tex: 'props/prop2-r3-c5', displayH: 92,  collide: true,  decal: false, colW: 130, colH: 16, weight: 3 },  // 金網フェンス
  { tex: 'props/prop2-r4-c0', displayH: 58,  collide: true,  decal: false, colW: 26,  colH: 16, weight: 3 },  // 消火栓
  { tex: 'props/prop2-r4-c1', displayH: 56,  collide: true,  decal: false, colW: 38,  colH: 22, weight: 4 },  // 石ブロック
  { tex: 'props/prop2-r4-c2', displayH: 48,  collide: true,  decal: false, colW: 50,  colH: 20, weight: 4 },  // ブロック群
  { tex: 'props/prop2-r4-c3', displayH: 40,  collide: true,  decal: false, colW: 32,  colH: 18, weight: 4 },  // 小ブロック
  { tex: 'props/prop2-r4-c4', displayH: 34,  collide: true,  decal: false, colW: 30,  colH: 16, weight: 4 },  // 小ブロック2
  { tex: 'props/prop2-r4-c5', displayH: 26,  collide: false, decal: true,  colW: 0,   colH: 0,  weight: 7 },  // 小石(デカール)
  { tex: 'props/prop2-r4-c6', displayH: 22,  collide: false, decal: true,  colW: 0,   colH: 0,  weight: 7 },  // 小石2(デカール)
  { tex: 'props/prop2-r4-c7', displayH: 40,  collide: false, decal: true,  colW: 0,   colH: 0,  weight: 6 },  // 血痕(デカール)
  { tex: 'props/prop2-r4-c8', displayH: 42,  collide: false, decal: false, colW: 0,   colH: 0,  weight: 6 },  // 枯れ草(立ち・素通り)
];

// ステージ4(雪原)の散布オブジェクト(社長提供: 監視塔/廃バス/テント)。焚き火は torch 置き換えなので別管理。
export const SNOW_PROPS: CityPropDef[] = [
  { tex: 'props/stage4-tower', displayH: 150, collide: true, decal: false, colW: 54,  colH: 26, weight: 2 }, // 監視塔(高い)
  { tex: 'props/stage4-bus',   displayH: 96,  collide: true, decal: false, colW: 140, colH: 32, weight: 3 }, // 廃バス(横長)
  { tex: 'props/stage4-tent',  displayH: 86,  collide: true, decal: false, colW: 104, colH: 28, weight: 3 }, // テント
];

// farBackdropキー別の散布カタログ。'' / forest は散布なし(木システムが担当)。
export const STAGE_PROPS: Record<string, CityPropDef[]> = {
  city: CITY_PROPS,
  snow: SNOW_PROPS,
};
// 区画あたりの散布数 [min, 追加レンジ]。大きい物が多いステージは控えめに。
const STAGE_PROP_COUNT: Record<string, [number, number]> = {
  city: [3, 4], // 3〜6
  snow: [1, 2], // 1〜2(塔/バス/テントは大きいのでまばら)
};

const totalWeightFor = (defs: CityPropDef[]) => defs.reduce((s, d) => s + d.weight, 0);
const pickVariant = (defs: CityPropDef[], h: number): number => {
  let t = h * totalWeightFor(defs);
  for (let i = 0; i < defs.length; i++) { t -= defs[i].weight; if (t <= 0) return i; }
  return defs.length - 1;
};

// 1区画(セル)のサイズ。木(220)より広め=構造物がまばらに点在。
export const CITY_ZONE = 680;
// スタート地点(原点)付近は空ける安全半径。
export const CITY_SAFE_RADIUS = 240;

export interface CityProp {
  id: string;
  footX: number; // 足元(=Y-sortキー / 当たり矩形の中心X・底辺)
  footY: number;
  scale: number;
  variant: number; // 該当カタログ(STAGE_PROPS[farKey])のインデックス
}

const hash2 = (x: number, y: number): number => {
  const s = Math.sin(x * 91.73 + y * 47.31) * 43758.5453;
  return s - Math.floor(s);
};

// farKey の散布カタログを区画ごとに決定的散布。カタログ無し(forest等)は空。
export const cityPropsInRegion = (
  farKey: string, minX: number, minY: number, maxX: number, maxY: number
): CityProp[] => {
  const defs = STAGE_PROPS[farKey];
  if (!defs || defs.length === 0) return [];
  const [cmin, cextra] = STAGE_PROP_COUNT[farKey] ?? [3, 4];
  const out: CityProp[] = [];
  const cx0 = Math.floor(minX / CITY_ZONE) - 1, cx1 = Math.floor(maxX / CITY_ZONE) + 1;
  const cy0 = Math.floor(minY / CITY_ZONE) - 1, cy1 = Math.floor(maxY / CITY_ZONE) + 1;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const n = cmin + Math.floor(hash2(cx * 3.1 + 0.7, cy * 2.7 - 1.9) * (cextra + 1));
      for (let k = 0; k < n; k++) {
        const footX = cx * CITY_ZONE + CITY_ZONE * (0.08 + 0.84 * hash2(cx * 1.3 + k * 7.1 + 2.2, cy * 1.9 - k * 3.3 + 4.4));
        const footY = cy * CITY_ZONE + CITY_ZONE * (0.08 + 0.84 * hash2(cx * 2.7 - k * 5.5 + 9.9, cy * 1.1 + k * 2.2 - 6.6));
        if (Math.hypot(footX, footY) < CITY_SAFE_RADIUS) continue;
        const id = `cp-${cx}-${cy}-${k}`;
        // 裏ボスに破壊されたプロップは欠番(描画・当たり判定とも同時に消える)。
        if (isObstacleDestroyed(id)) continue;
        const variant = pickVariant(defs, hash2(cx * 5.5 + k * 1.7, cy * 4.4 - k * 2.6));
        const scale = 0.85 + hash2(cx * 0.9 + k * 4.2, cy * 1.6 - k * 0.8) * 0.3; // 0.85〜1.15
        out.push({ id, footX, footY, scale, variant });
      }
    }
  }
  return out;
};

// カタログ定義(描画側が tex/displayH/decal を参照)。
export const cityPropDef = (farKey: string, variant: number): CityPropDef | null =>
  STAGE_PROPS[farKey]?.[variant] ?? null;

// 当たり矩形(collide=true のみ)。底辺が足元=描画の足元と一致(obstacles 規約)。
export const cityPropRect = (farKey: string, p: CityProp): Rect | null => {
  const def = STAGE_PROPS[farKey]?.[p.variant];
  if (!def || !def.collide) return null;
  return footRect(p.footX, p.footY, def.colW * p.scale, def.colH * p.scale);
};

// 矩形を近傍の大きいプロップから押し出して補正後の左上を返す(木と同じ AABB 解決)。
export const resolveCityPropCollision = (farKey: string, rect: Rect): { x: number; y: number } => {
  if (!STAGE_PROPS[farKey]) return { x: rect.x, y: rect.y };
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const pad = CITY_ZONE;
  const walls: Rect[] = [];
  for (const p of cityPropsInRegion(farKey, cx - pad, cy - pad, cx + pad, cy + pad)) {
    const r = cityPropRect(farKey, p);
    if (r) walls.push(r);
  }
  return resolveAabb(rect, walls);
};
