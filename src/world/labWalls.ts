// Stage-2 (研究所スキン) の手置き「壁オブジェクト」。
// 旧 procedural 迷路(labMap の LAB_WALLS)は使わず、開けたステージ1規模マップ上に
// 横/縦2種の一枚絵ビルボードを点在させる。迷路/進行ゲートにはしない(区画解放なし)=
// あくまで遮蔽物(カバー)。RENDERER-AGNOSTIC: PixiJS を import しない(描画は pixi 側が読むだけ)。
import { footRect, type Rect } from './obstacles';

export type WallOrient = 'h' | 'v';

// 設置点(足元=床に接する基準。スプライトは足元アンカー 0.5,1 でここから上へ描く)。
export interface PlacedWall {
  id: string;
  orient: WallOrient; // 'h'=横長(左右に伸びる) / 'v'=縦長(画面の上下=奥行きに伸びる)
  footX: number;
  footY: number;
}

// --- 当たり判定フットプリント(見た目とは分離: CLAUDE.md の visual≠hitbox 方針) ---
// 横壁=幅広・薄い帯 / 縦壁=細い・縦長帯。AABB のみ(per-pixel なし)。
const H_LEN = 150, H_DEPTH = 22;
const V_THICK = 22, V_LEN = 150;

export const wallRect = (w: PlacedWall): Rect =>
  w.orient === 'h'
    ? footRect(w.footX, w.footY, H_LEN, H_DEPTH)
    : footRect(w.footX, w.footY, V_THICK, V_LEN);

// 表示サイズ(足元基準ビルボードの収まり箱。containScale で内接)。当たり判定とは独立。
export const WALL_DISPLAY_H = { w: 176, h: 108 };
export const WALL_DISPLAY_V = { w: 108, h: 176 };

// 手置き配置。プレイヤー初期位置(原点付近)を中心に、開けた探索域へ点在。
// 中心(スポーン)周辺は空けて閉じ込めない。迷路にはせず、L字/孤立片で「隠れられるカバー」を散らす。
export const STAGE2_WALLS: PlacedWall[] = [
  { id: 'w1',  orient: 'h', footX: -360, footY: -250 },
  { id: 'w2',  orient: 'h', footX: -190, footY: -250 },
  { id: 'w3',  orient: 'v', footX: -480, footY: -110 },
  { id: 'w4',  orient: 'v', footX:  380, footY: -150 },
  { id: 'w5',  orient: 'h', footX:  270, footY: -300 },
  { id: 'w6',  orient: 'h', footX:  470, footY: -300 },
  { id: 'w7',  orient: 'v', footX: -520, footY:  250 },
  { id: 'w8',  orient: 'h', footX: -300, footY:  360 },
  { id: 'w9',  orient: 'h', footX:  120, footY:  430 },
  { id: 'w10', orient: 'v', footX:  520, footY:  220 },
  { id: 'w11', orient: 'v', footX:  -60, footY: -460 },
  { id: 'w12', orient: 'h', footX:  320, footY:   70 },
  { id: 'w13', orient: 'v', footX: -340, footY:   60 },
  { id: 'w14', orient: 'h', footX:  -40, footY:  240 },
];
