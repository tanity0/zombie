// Stage-2 (研究所スキン) の手続き生成オブジェクト(壁/UVバー)。
// 無限マップを「1画面区画(LAB_ZONE 四方のセル)」に区切る。設計方針(社長指示):
//  - 横移動を重視。壁は「横方向に連なるラン」で配置(通常帯=1〜5個)。
//  - 縦は約2画面分(LAB_DEEP_Y)が通常帯。そこを超える「奥」は極端に連なった壁が増える。
//  - 奥には 敵以外を置かない(UVバーも無し)。
// RENDERER-AGNOSTIC: PixiJS を import しない(描画は pixi 側が読むだけ)。
import { footRect, type Rect } from './obstacles';

export type WallOrient = 'h' | 'v';

export interface PlacedWall {
  id: string;
  orient: WallOrient; // 横壁(h)のみ
  footX: number;
  footY: number;
}

// 1画面区画のサイズ(px)。この四方ごとに壁ラン1本/UVバー1本(通常帯のみ)。
export const LAB_ZONE = 900;
// スタート地点(原点)付近にはオブジェクト/敵を出さない安全半径。
export const LAB_START_SAFE_RADIUS = 700;
// 通常帯の縦の広がり(約2画面)。|セル中心Y| がこれを超えると「奥(deep)」=壁だらけ・UV/アイテム無し。
export const LAB_DEEP_Y = 2 * LAB_ZONE; // 1800
// 連なり壁の間隔(=壁の当たり幅。縁を接して横バリアになる)。
const WALL_RUN_SPACING = 150;
const H_LEN = 150, H_DEPTH = 22;

export const wallRect = (w: PlacedWall): Rect => footRect(w.footX, w.footY, H_LEN, H_DEPTH);
export const WALL_DISPLAY_H = { w: 176, h: 108 };

// 決定的ハッシュ(0..1)。
const hash2 = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const cellCenterY = (cy: number) => cy * LAB_ZONE + LAB_ZONE / 2;
const isDeepCell = (cy: number) => Math.abs(cellCenterY(cy)) > LAB_DEEP_Y;

// 区画(セル)ごとに横連なりの壁ランを1本生成。通常帯=1〜5個、奥(deep)=6〜13個(極端に連なる)。
// ランは footX から右へ WALL_RUN_SPACING 間隔。長いランが左隣セルから領域へ伸びてくるので左に余分に走査。
export const labWallsInRegion = (minX: number, minY: number, maxX: number, maxY: number): PlacedWall[] => {
  const out: PlacedWall[] = [];
  const cx0 = Math.floor(minX / LAB_ZONE) - 3; // 長いランの左方伸長を取りこぼさない
  const cx1 = Math.floor(maxX / LAB_ZONE) + 1;
  const cy0 = Math.floor(minY / LAB_ZONE) - 1;
  const cy1 = Math.floor(maxY / LAB_ZONE) + 1;
  for (let cy = cy0; cy <= cy1; cy++) {
    const deep = isDeepCell(cy);
    for (let cx = cx0; cx <= cx1; cx++) {
      const hLen = hash2(cx * 2.1 + 1.3, cy * 1.9 - 0.7);
      const runLen = deep ? 6 + Math.floor(hLen * 8) : 1 + Math.floor(hLen * 5); // deep:6〜13 / 通常:1〜5
      const baseX = cx * LAB_ZONE + LAB_ZONE * (0.12 + 0.35 * hash2(cx, cy));
      const footY = cy * LAB_ZONE + LAB_ZONE * (0.3 + 0.4 * hash2(cx * 1.7 + 5.2, cy * 2.3 - 1.1));
      for (let k = 0; k < runLen; k++) {
        out.push({ id: `lw-${cx}-${cy}-${k}`, orient: 'h', footX: baseX + k * WALL_RUN_SPACING, footY });
      }
    }
  }
  return out;
};

// 区画ごとに UV バーを1本(通常帯のみ・奥には置かない)。松明の代わりの光源/装飾。当たり判定なし。
export const labUvBarsInRegion = (minX: number, minY: number, maxX: number, maxY: number): { id: string; x: number; y: number }[] => {
  const out: { id: string; x: number; y: number }[] = [];
  const cx0 = Math.floor(minX / LAB_ZONE) - 1, cx1 = Math.floor(maxX / LAB_ZONE) + 1;
  const cy0 = Math.floor(minY / LAB_ZONE) - 1, cy1 = Math.floor(maxY / LAB_ZONE) + 1;
  for (let cy = cy0; cy <= cy1; cy++) {
    if (isDeepCell(cy)) continue; // 奥は UV バーを置かない
    for (let cx = cx0; cx <= cx1; cx++) {
      const x = cx * LAB_ZONE + LAB_ZONE * (0.2 + 0.6 * hash2(cx + 9.1, cy + 4.7));
      const y = cy * LAB_ZONE + LAB_ZONE * (0.2 + 0.6 * hash2(cx - 3.3, cy + 8.8));
      out.push({ id: `luv-${cx}-${cy}`, x, y });
    }
  }
  return out;
};

// 区画インデックス(敵密度の「1画面区画3体まで」判定用)。
export const labZoneKey = (x: number, y: number): string =>
  `${Math.floor(x / LAB_ZONE)}_${Math.floor(y / LAB_ZONE)}`;

// クリア条件の「書類(重要データ)」。通常帯の探索域に手置き(原点から少し離れた位置)。拾うと勝利。
// type は既存の 'lab-clear-item'(拾うとクリア・取得表示=「重要データ」)を流用。
export const STAGE2_DOCUMENT: { x: number; y: number } = { x: 720, y: -470 };
