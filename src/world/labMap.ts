// 屋内ステージ「研究施設」(ステージ2)= グリッド文字マップ＋パーサ方式(迷路化・拡大・敵ゾーン制)。
// 1文字=1セル(列=CELL_W px・行=CELL_H px の横長セル)。マップを編集すれば迷路が変わる。
//   #=壁 / .=床(通路・部屋) / 空白=外(壁扱い)
//   P=初期位置 / M=武器商人 / K=カードキー / B=ボタン / W=武器箱 / X=クリアアイテム
//   d=武器庫の扉(weaponRoom・ボタンで解錠) / g=ゴールの扉(goal・カードキーで解錠)
//   1/2/3=敵スポーン(Lv1/Lv2/Lv3=スタートから遠いほど高Lv)
// 配線(indoorMode/壁衝突/カメラ/描画 syncLab/ギミック/イベント勝利)は既存をそのまま流用。
import { rectsOverlap, type Rect } from './obstacles';
import type { EnemyType, LabProp } from '../types/game';

// セルは横長・縦短(社長指示: 部屋を横長に、その分縦を短く。縦の廊下は短く、横の廊下は長く)。
// 列方向(x)= CELL_W、行方向(y)= CELL_H。面積は従来(140²)とほぼ同等に保つ。
const CELL_W = 180; // 列幅(px)。大きいほど部屋が横長・横通路が長い。
const CELL_H = 110; // 行高(px)。小さいほど部屋が縦に短い・縦通路が短い。

// 4(列)×3(行)の部屋格子＋曲がり通路。スポーン=左下(P,M) / ゴール=右上(X・最遠・小・敵なし、手前にg+Lv3)。
// 武器庫(W)はボタン(B)で開くd扉の奥(右下)。カードキー(K)は左上の枝部屋。距離で敵Lvを配分。
// 横長レイアウト(PHILL銃=狙って撃つ手動武器のプレイフィール向上のため)。面積は従来とほぼ同等。
// 下段=メインの横通路(左スポーン→右へ進み最奥右のカードキーK)。上段=各部屋(ゴール/ボタン/武器庫/カードキー)。
// 縦移動は若干(下段⇔上段の縦連絡=最大3階層)。ゴールGはスタート近く(左)=必ずパンプキン部屋(PU)を挟む(S→上→PU→g→GO)。
// #=壁 / .=床 / P,M=スポーン / 1,2,3=敵(Lv1/2/3=パンプキン) / B=ボタン / d=武器庫扉 / W=武器箱 / g=ゴール扉 / X=クリア / K=カードキー
const MAP: string[] = [
  '##############################', // 0 外周
  '#.3.##...##2..##2..##2..##3.2#', // 1 上段: PU(パンプキン部屋) / GO / ボタン / 武器庫 / 部屋 / カードキー部屋
  '#....g.X.##.B.##.W.##...##.K.#', // 2 PU→g(ゴール扉)→GO=X / B=ボタン / W=武器箱 / K=カードキー
  '#2.2##...##...##...##..2##...#', // 3
  '##.#########.####.####.####.##', // 4 縦連絡(各バンド)
  '##.#########.####.####.####.##', // 5
  '##.#########.####d####.####.##', // 6 d=武器庫扉(ボタンで解錠)
  '#...##1..##1..##..2##..2##..2#', // 7 下段: スポーン / 部屋… (右ほど高Lv)
  '#.M.......1.........1........#', // 8 メインの横通路(左右に長い射線)+ 廊下敵Lv1×2
  '#.P.##..1##..2##2..##2..##2..#', // 9 P/M=スポーン(左)
  '##############################', // 10
  '##############################', // 11 外周
];

const ROWS = MAP.length;
const COLS = MAP[0].length;
const center = (col: number, row: number) => ({ x: col * CELL_W + CELL_W / 2, y: row * CELL_H + CELL_H / 2 });
const cellRect = (col: number, row: number): Rect => ({ x: col * CELL_W, y: row * CELL_H, width: CELL_W, height: CELL_H });

export const LAB_BOUNDS: Rect = { x: 0, y: 0, width: COLS * CELL_W, height: ROWS * CELL_H };

// 外周の「野外」マージン(端でもプレイヤーが画面中心を保てる)。カメラはこの外周にクランプ。
export const LAB_MARGIN = 720;
export const LAB_OUTER_BOUNDS: Rect = {
  x: LAB_BOUNDS.x - LAB_MARGIN,
  y: LAB_BOUNDS.y - LAB_MARGIN,
  width: LAB_BOUNDS.width + LAB_MARGIN * 2,
  height: LAB_BOUNDS.height + LAB_MARGIN * 2,
};

// 壁(# と空白=外)を貪欲法で矩形マージ(右へ→下へ拡張)。矩形数を減らして衝突/描画を軽く。
const buildWalls = (): Rect[] => {
  const isWall = (c: number, r: number) => {
    const ch = MAP[r][c];
    return ch === '#' || ch === ' ';
  };
  const used: boolean[][] = MAP.map(() => new Array(COLS).fill(false));
  const rects: Rect[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isWall(c, r) || used[r][c]) continue;
      let w = 1;
      while (c + w < COLS && isWall(c + w, r) && !used[r][c + w]) w++;
      let h = 1;
      grow: while (r + h < ROWS) {
        for (let k = 0; k < w; k++) {
          if (!isWall(c + k, r + h) || used[r + h][c + k]) break grow;
        }
        h++;
      }
      for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) used[r + dr][c + dc] = true;
      rects.push({ x: c * CELL_W, y: r * CELL_H, width: w * CELL_W, height: h * CELL_H });
    }
  }
  return rects;
};
export const LAB_WALLS: Rect[] = buildWalls();

// グリフ位置の検索。
const findChar = (ch: string): { col: number; row: number } => {
  for (let r = 0; r < ROWS; r++) {
    const c = MAP[r].indexOf(ch);
    if (c >= 0) return { col: c, row: r };
  }
  throw new Error(`labMap: glyph "${ch}" not found`);
};

const pC = findChar('P');
const mC = findChar('M');
const kC = findChar('K');
const wC = findChar('W');
const xC = findChar('X');
const bC = findChar('B');
const dC = findChar('d');
const gC = findChar('g');

export const LAB_PLAYER_SPAWN = center(pC.col, pC.row);
export const LAB_MERCHANT = center(mC.col, mC.row);
export const LAB_CARD_KEY = center(kC.col, kC.row);
export const LAB_WEAPON_CRATE = center(wC.col, wC.row);
export const LAB_CLEAR_ITEM = center(xC.col, xC.row);
export const LAB_BUTTON = {
  id: 'btn-weapon',
  x: center(bC.col, bC.row).x,
  y: center(bC.col, bC.row).y,
  radius: 60,
  opensDoorId: 'weaponRoom',
};

// 可変ドア(解錠で通行可=壁から除外)。閉じている間だけ通行不可。
export const LAB_DOORS: { id: string; rect: Rect }[] = [
  { id: 'weaponRoom', rect: cellRect(dC.col, dC.row) }, // d=ボタンで解錠
  { id: 'goal', rect: cellRect(gC.col, gC.row) },       // g=カードキーで解錠
];

// 部屋の矩形(セル範囲 [colStart,rowStart,colEnd,rowEnd] 包含)。プロップ散布・ゴール区画・UVバー配置に使う。
// 迷路の各部屋に対応(手書きマップと一致させる)。
const ROOM_CELLS: [number, number, number, number][] = [
  // 上段(rows1-3)
  [1, 1, 3, 3],    // PU パンプキン部屋(スタート上)
  [6, 1, 8, 3],    // GO ゴール部屋
  [11, 1, 13, 3],  // ボタン部屋
  [16, 1, 18, 3],  // 武器庫(d扉の奥)
  [21, 1, 23, 3],  // 部屋
  [26, 1, 28, 3],  // カードキー部屋(最奥右)
  // 下段(rows7-9)
  [1, 7, 3, 9],    // S スポーン(左)
  [6, 7, 8, 9],
  [11, 7, 13, 9],
  [16, 7, 18, 9],
  [21, 7, 23, 9],
  [26, 7, 28, 9],
];
const roomRect = ([c0, r0, c1, r1]: [number, number, number, number]): Rect => ({
  x: c0 * CELL_W, y: r0 * CELL_H, width: (c1 - c0 + 1) * CELL_W, height: (r1 - r0 + 1) * CELL_H,
});
export const LAB_ROOMS: { id: string; rect: Rect }[] = ROOM_CELLS.map((rc, i) => ({ id: `room-${i}`, rect: roomRect(rc) }));

// ゴール区画(X を含む部屋)。到達演出/マーカー用。
export const LAB_GOAL_TRIGGER: Rect = (() => {
  const rc = ROOM_CELLS.find(([c0, r0, c1, r1]) => xC.col >= c0 && xC.col <= c1 && xC.row >= r0 && xC.row <= r1);
  return rc ? roomRect(rc) : roomRect([8, 14, 9, 15]);
})();

// 固定敵(休眠→接近で起床)。グリフ 1/2/3 をそのまま配置。aggroRange は updateEnemies 側で×2される。
const ENEMY_BY_GLYPH: Record<string, { type: EnemyType; aggro: number }> = {
  '1': { type: 'lab-zombie-1', aggro: 110 },
  '2': { type: 'lab-zombie-2', aggro: 110 },
  '3': { type: 'lab-zombie-3', aggro: 130 },
};
export const LAB_ENEMIES: { type: EnemyType; x: number; y: number; aggroRange: number }[] = (() => {
  const out: { type: EnemyType; x: number; y: number; aggroRange: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const e = ENEMY_BY_GLYPH[MAP[r][c]];
      if (!e) continue;
      const p = center(c, r);
      out.push({ type: e.type, x: p.x, y: p.y, aggroRange: e.aggro });
    }
  }
  return out;
})();

// UVライトバー(松明と同じ扱い=破壊可能。当たり判定なし)。各部屋の上部中央に1本。
export const LAB_UV_BARS = LAB_ROOMS.map(rm => ({ x: rm.rect.x + rm.rect.width / 2, y: rm.rect.y + 56 }));

// PHILL弾の固定ピックアップ(研究所限定)。通路要所に手置き=ステージ中3箇所のみ(通常ドロップ無し)。
// 1個=6発(AMMO_PICKUP.phill)。近接フィニッシュのドロップは別経路でそのまま。
export const LAB_AMMO_PICKUPS = [
  center(7, 8), center(16, 8), center(25, 8),
];

// 弾/近接の壁判定用: 現在通行不可な壁矩形(固定壁 + 閉ドア)を返す。
export const labBlockingWalls = (openDoorIds: string[]): Rect[] => {
  const closed = LAB_DOORS.filter(d => !openDoorIds.includes(d.id)).map(d => d.rect);
  return [...LAB_WALLS, ...closed];
};

// 障害物プロップ(木の代わり)。テクスチャ名のバリエーション。
export const LAB_PROP_VARIANTS = [
  'lab-props/lab-prop-r1-c1', 'lab-props/lab-prop-r1-c2', 'lab-props/lab-prop-r1-c3', 'lab-props/lab-prop-r1-c4',
  'lab-props/lab-prop-r2-c1', 'lab-props/lab-prop-r2-c2', 'lab-props/lab-prop-r2-c3', 'lab-props/lab-prop-r2-c4',
  'lab-props/lab-prop-r3-c1', 'lab-props/lab-prop-r3-c2', 'lab-props/lab-prop-r3-c3', 'lab-props/lab-prop-r3-c4',
];

// 各部屋に障害物をランダム配置(壁/ドア/スポーン/ギミックを避ける=壁貫通しない & 進路を塞ぎにくい)。
export const generateLabProps = (): LabProp[] => {
  const props: LabProp[] = [];
  const avoid = [LAB_PLAYER_SPAWN, LAB_MERCHANT, LAB_CARD_KEY, { x: LAB_BUTTON.x, y: LAB_BUTTON.y }, LAB_WEAPON_CRATE, LAB_CLEAR_ITEM];
  const blocked = (r: Rect) => LAB_WALLS.some(w => rectsOverlap(r, w)) || LAB_DOORS.some(d => rectsOverlap(r, d.rect));
  let counter = 0;
  for (const room of LAB_ROOMS) {
    const n = 1 + Math.floor(Math.random() * 2); // 1〜2個/部屋
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < 10; t++) {
        const m = 56; // 壁からのマージン
        const cx = room.rect.x + m + Math.random() * Math.max(1, room.rect.width - 2 * m);
        const fy = room.rect.y + m + Math.random() * Math.max(1, room.rect.height - 2 * m);
        const rect: Rect = { x: cx - 14, y: fy - 22, width: 28, height: 22 }; // 足元の当たり判定
        if (blocked(rect)) continue;
        if (avoid.some(a => Math.hypot(a.x - cx, a.y - fy) < 80)) continue; // スポーン/ギミック近くは避ける
        if (props.some(p => rectsOverlap(rect, p.rect))) continue;
        const variant = LAB_PROP_VARIANTS[Math.floor(Math.random() * LAB_PROP_VARIANTS.length)];
        props.push({ id: `labprop-${counter++}`, x: cx, y: fy, variant, rect });
        break;
      }
    }
  }
  return props;
};
