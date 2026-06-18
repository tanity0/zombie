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
// 中心(スポーン)周辺は空けて閉じ込めない。迷路にはせず、孤立片で「隠れられるカバー」を散らす。
// 横壁(h)のみ使用(縦壁オブジェクトは廃止=社長指示)。
export const STAGE2_WALLS: PlacedWall[] = [
  { id: 'w1',  orient: 'h', footX: -360, footY: -250 },
  { id: 'w2',  orient: 'h', footX: -180, footY: -250 },
  { id: 'w3',  orient: 'h', footX:  270, footY: -300 },
  { id: 'w4',  orient: 'h', footX:  460, footY: -300 },
  { id: 'w5',  orient: 'h', footX: -460, footY:  120 },
  { id: 'w6',  orient: 'h', footX:  430, footY:  130 },
  { id: 'w7',  orient: 'h', footX: -300, footY:  360 },
  { id: 'w8',  orient: 'h', footX:  120, footY:  430 },
  { id: 'w9',  orient: 'h', footX:  320, footY:   70 },
  { id: 'w10', orient: 'h', footX:  -40, footY:  240 },
];

// 松明の代わりに置く研究所UVバー(type:'uv-bar' の破壊可能プロップ)。光源/装飾で、当たり判定は無し
// (移動/弾は通す)。foot 位置(床に立つ基準)を手置き。breakableProp はこの (x,y) から store が組む。
export const STAGE2_UV_BARS: { x: number; y: number }[] = [
  { x: -260, y: -120 },
  { x:  240, y: -120 },
  { x: -120, y:  120 },
  { x:  180, y:  220 },
  { x: -420, y:  300 },
  { x:  420, y: -40 },
  { x:   40, y: -320 },
  { x: -360, y: -40 },
];

// クリア条件の「書類(重要データ)」。探索域に手置き(原点から少し離れた壁の奥)。拾うと勝利。
// type は既存の 'lab-clear-item'(拾うとクリア・取得表示=「重要データ」)を流用。
export const STAGE2_DOCUMENT: { x: number; y: number } = { x: 720, y: -470 };
