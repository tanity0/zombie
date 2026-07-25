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
// 通常帯の縦の広がり。|セル中心Y| がこれを超えると「奥(deep)」=壁だらけ・UV/アイテム無し。
// 縦移動は控えめ(約1画面ぶんずつ)=横移動重視。
export const LAB_DEEP_Y = 1 * LAB_ZONE; // 900
// 連なり壁の間隔(壁バーの中心間隔)。
const WALL_RUN_SPACING = 150;
// 壁バー幅(社長承認 M2_LAB_CORRIDOR_SPEC.md v0.25.2175: 150→90に小型化。奥行22は不変)。
// 役割は通行障害ではなく視線切り遮蔽(横長廊下・上下固定クランプ導入とセット)。
const H_LEN = 90, H_DEPTH = 22;

export const wallRect = (w: PlacedWall): Rect => footRect(w.footX, w.footY, H_LEN, H_DEPTH);
export const WALL_DISPLAY_H = { w: 176, h: 108 };

// 決定的ハッシュ(0..1)。
const hash2 = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const cellCenterY = (cy: number) => cy * LAB_ZONE + LAB_ZONE / 2;
const isDeepCell = (cy: number) => Math.abs(cellCenterY(cy)) > LAB_DEEP_Y;

// 区画(セル)ごとに横連なりの壁ランを1本生成。密度均一化(社長承認 M2_LAB_CORRIDOR_SPEC.md
// v0.25.2175): 旧・通常帯1〜5/奥(deep)6〜13の勾配を廃止し、全域(生成対象セル)で1〜3本に統一。
// 生成対象は「廊下帯の視線に関わる範囲」= isDeepCell が false のセルのみ(セル中心|Y|≤LAB_DEEP_Y)。
// それを超える奥のセルは壁を生成しない(プロップ/UVバーと同じ扱いに統一)。
// ランは footX から右へ WALL_RUN_SPACING 間隔。長いランが左隣セルから領域へ伸びてくるので左に余分に走査。
// 廊下(プレイヤー中心|Y|≤LAB_CORRIDOR_Y_LIMIT_PX=100)を横に完全封鎖しない配置になっているか確認:
// footY は cy*LAB_ZONE を基準に該当セル内の 0.3〜0.7 の範囲(=セル端寄せ)にしか出ないため、
// 壁矩形(footY-H_DEPTH 〜 footY)は cy=0/-1(Y=0に隣接する2セル)でも常に |Y|>=248 に収まり、
// ±100 の廊下帯には物理的に重ならない(役割どおり通行障害ではなく視線切りのみ)。よってこの形状変更で
// 追加のガードは不要と確認済み(この不変条件が崩れる変更をする場合は要再確認)。
// 壁は「歩けるところ」だけに出す(社長指示v0.25.2228)。**方針転換**: v0.25.2175〜2222は廊下帯(±100)の
// **外**に置いて「絶対に通行を塞がない」設計だったが、帯の外は歩けない=そこの壁には隠れられないため、
// 遮蔽として機能していなかった。今後は帯の**中**に置き、代わりに「必ず通り抜けられる隙間」を構造で保証する。
//
// 配置: 帯の中を上下2段に分け、その間に**常に空きレーンを残す**。
//   上段(A): footY ∈ [-70,-35] → 壁矩形 [-92,-35]
//   下段(B): footY ∈ [ 55, 95] → 壁矩形 [ 33, 95]
//   → 中央 [-35, 33] = 68px は常に空く(プレイヤー当たり判定 PLAYER_HITBOX=28 より広い)=詰みが起きない。
// セルの縦(cy)方向のループは廃止(帯は1本しかないため)。id は `lw-cx-0-番号` でセル単位の集計は従来どおり。
const WALL_BAND_A_MIN = -70, WALL_BAND_A_MAX = -35;
const WALL_BAND_B_MIN = 55, WALL_BAND_B_MAX = 95;
// 壁矩形が収まるべき範囲(=歩ける帯)。テストと共有する不変条件。
export const LAB_WALL_Y_LIMIT = 100;
// 中央に必ず残す空きレーン(この上下端の間には壁を置かない)。
export const LAB_WALL_CLEAR_LANE: [number, number] = [WALL_BAND_A_MAX, WALL_BAND_B_MIN - H_DEPTH];

export const labWallsInRegion = (minX: number, minY: number, maxX: number, maxY: number): PlacedWall[] => {
  const out: PlacedWall[] = [];
  // 帯(±LAB_WALL_Y_LIMIT)が問い合わせ範囲と交わらなければ壁は無い(カリングを効かせる)。
  if (maxY < -LAB_WALL_Y_LIMIT || minY > LAB_WALL_Y_LIMIT) return out;
  const cx0 = Math.floor(minX / LAB_ZONE) - 3; // 長いランの左方伸長を取りこぼさない
  const cx1 = Math.floor(maxX / LAB_ZONE) + 1;
  const bands: [number, number][] = [[WALL_BAND_A_MIN, WALL_BAND_A_MAX], [WALL_BAND_B_MIN, WALL_BAND_B_MAX]];
  for (let cx = cx0; cx <= cx1; cx++) {
    let idx = 0;
    for (let r = 0; r < bands.length; r++) {
      const hLen = hash2(cx * 2.1 + 1.3 + r * 13.7, -0.7 - r * 5.3);
      const runLen = 2 + Math.floor(hLen * 3); // ランあたり2〜4本(区画あたり4〜8本=v0.25.2222の密度を維持)
      const baseX = cx * LAB_ZONE + LAB_ZONE * (0.12 + 0.35 * hash2(cx + r * 3.3, -r * 1.7));
      const [lo, hi] = bands[r];
      const footY = lo + (hi - lo) * hash2(cx * 1.7 + 5.2 + r * 2.9, -1.1 + r * 4.1);
      for (let k = 0; k < runLen; k++) {
        const footX = baseX + k * WALL_RUN_SPACING;
        // 帯の中=プレイヤーの通り道なので、スタート地点付近には出さない(開幕で埋もれない)。
        if (Math.hypot(footX, footY) < LAB_START_SAFE_RADIUS) continue;
        out.push({ id: `lw-${cx}-0-${idx++}`, orient: 'h', footX, footY });
      }
    }
  }
  return out;
};

// 障害物プロップ(パソコン/割れたカプセル等の遮蔽物)。テスト(屋内)ステージで置いていた
// lab-props を、このステージ(研究所スキン・屋外)にも区画ごとにランダム散布する。
// 当たり判定=足元アンカーの矩形(壁と同じ遮蔽物扱い)。奥(deep)/原点付近には置かない。
export interface PlacedProp {
  id: string;
  footX: number;
  footY: number;
  variant: number; // 0..LAB_PROP_VARIANT_COUNT-1(=テクスチャ lab-prop-r{row}-c{col} を選ぶ)
}

// lab-props は r1..r3 × c1..c4 の12種。
export const LAB_PROP_VARIANT_COUNT = 12;
// 表示の基準高さ(px)と足元当たり矩形。壁(176×108)より一回り小さめの遮蔽物。
export const PROP_DISPLAY_H = 92;
const PROP_HIT_W = 46, PROP_HIT_H = 30;

export const propRect = (p: PlacedProp): Rect => footRect(p.footX, p.footY, PROP_HIT_W, PROP_HIT_H);

// 区画(セル)ごとに 3〜6 個のプロップを散布(社長指示v0.25.2222で 2〜4 から増量=「壁とか」の“とか”側)。
// 決定的ハッシュなので描画と当たり判定が必ず一致する。
export const labPropsInRegion = (minX: number, minY: number, maxX: number, maxY: number): PlacedProp[] => {
  const out: PlacedProp[] = [];
  const cx0 = Math.floor(minX / LAB_ZONE) - 1, cx1 = Math.floor(maxX / LAB_ZONE) + 1;
  const cy0 = Math.floor(minY / LAB_ZONE) - 1, cy1 = Math.floor(maxY / LAB_ZONE) + 1;
  for (let cy = cy0; cy <= cy1; cy++) {
    if (isDeepCell(cy)) continue; // 奥は敵以外を置かない(壁/UVバーと同じ方針)
    for (let cx = cx0; cx <= cx1; cx++) {
      const n = 3 + Math.floor(hash2(cx * 3.1 + 0.7, cy * 2.7 - 1.9) * 4); // 3〜6個/区画
      for (let k = 0; k < n; k++) {
        const footX = cx * LAB_ZONE + LAB_ZONE * (0.1 + 0.8 * hash2(cx * 1.3 + k * 7.1 + 2.2, cy * 1.9 - k * 3.3 + 4.4));
        const footY = cy * LAB_ZONE + LAB_ZONE * (0.1 + 0.8 * hash2(cx * 2.7 - k * 5.5 + 9.9, cy * 1.1 + k * 2.2 - 6.6));
        if (Math.hypot(footX, footY) < LAB_START_SAFE_RADIUS) continue; // 原点(スタート)付近は空ける
        const variant = Math.floor(hash2(cx * 5.5 + k * 1.7, cy * 4.4 - k * 2.6) * LAB_PROP_VARIANT_COUNT) % LAB_PROP_VARIANT_COUNT;
        out.push({ id: `lp-${cx}-${cy}-${k}`, footX, footY, variant });
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
      // 2本目(密度UP・社長指示で 約45%→約58%。出過ぎたら 0.42→0.55 に戻す)。
      if (hash2(cx + 2.7, cy - 6.4) > 0.42) {
        const x2 = cx * LAB_ZONE + LAB_ZONE * (0.2 + 0.6 * hash2(cx + 13.3, cy - 2.1));
        const y2 = cy * LAB_ZONE + LAB_ZONE * (0.2 + 0.6 * hash2(cx - 7.7, cy + 3.9));
        out.push({ id: `luv2-${cx}-${cy}`, x: x2, y: y2 });
      }
      // 3本目(密度UP・約20%の区画)。LAB_ZONE は変えず本数で密度を上げる(敵密度に影響させない)。
      if (hash2(cx - 5.5, cy + 1.3) > 0.80) {
        const x3 = cx * LAB_ZONE + LAB_ZONE * (0.2 + 0.6 * hash2(cx + 4.4, cy + 6.6));
        const y3 = cy * LAB_ZONE + LAB_ZONE * (0.2 + 0.6 * hash2(cx - 9.9, cy - 1.2));
        out.push({ id: `luv3-${cx}-${cy}`, x: x3, y: y3 });
      }
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
