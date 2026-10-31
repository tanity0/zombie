// ステージ1(森)の装飾オブジェクト = 光る花クラスター。社長提供の12枚シートから抽出。
// 木(trees.ts)と同じく「世界座標の純粋関数」として区画ごとに決定的散布する(エンティティとして
// 保持しない=リロードやカメラ移動で位置がブレない)。
//
// RENDERER-AGNOSTIC: PixiJS を import しない。描画は pixi 側が forestFlowersInRegion を読んで
// Sprite を並べるだけ。**当たり判定なし(壁判定無し・素通り)**=社長指示の純粋な飾り。store も触らない。
//
// 配置はステージ1限定(FLOWER_STAGES)。他の森ステージへ広げたい場合は id を追加するだけ。

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
export const setFlowersDisabled = (disabled: boolean): void => { flowersDisabled = disabled; };

export const forestFlowersInRegion = (
  stageId: string, minX: number, minY: number, maxX: number, maxY: number,
): ForestFlower[] => {
  if (flowersDisabled || !FLOWER_STAGES.has(stageId)) return [];
  const out: ForestFlower[] = [];
  const cx0 = Math.floor(minX / FLOWER_ZONE) - 1, cx1 = Math.floor(maxX / FLOWER_ZONE) + 1;
  const cy0 = Math.floor(minY / FLOWER_ZONE) - 1, cy1 = Math.floor(maxY / FLOWER_ZONE) + 1;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      // 1区画あたり 1〜3 株。
      const n = 1 + Math.floor(hash2(cx * 3.7 + 1.1, cy * 2.3 - 0.6) * 3);
      for (let k = 0; k < n; k++) {
        // 2/3 密度: 1/3 をスキップ。
        if (hash2(cx * 8.1 + k * 3.3 + 0.5, cy * 6.7 - k * 2.9 + 1.3) < 1 / 3) continue;
        const footX = cx * FLOWER_ZONE + FLOWER_ZONE * (0.1 + 0.8 * hash2(cx * 1.7 + k * 6.3 + 3.1, cy * 2.1 - k * 4.2 + 5.5));
        const footY = cy * FLOWER_ZONE + FLOWER_ZONE * (0.1 + 0.8 * hash2(cx * 2.9 - k * 4.7 + 8.2, cy * 1.3 + k * 3.1 - 7.7));
        if (Math.hypot(footX, footY) < FLOWER_SAFE_RADIUS) continue;
        const variant = Math.floor(hash2(cx * 5.1 + k * 1.9, cy * 4.3 - k * 2.2) * FLOWER_VARIANTS) % FLOWER_VARIANTS;
        const scale = 0.62 + hash2(cx * 0.8 + k * 3.6, cy * 1.5 - k * 0.9) * 0.30; // 0.62〜0.92
        out.push({ id: `fl-${cx}-${cy}-${k}`, footX, footY, scale, variant });
      }
    }
  }
  return out;
};
