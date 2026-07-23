// ステージ6(洋館)・奥行き通路の疑似投影(1/z)+柱の無限循環(社長相談v0.25.2077の設計)。
// レンダラ非依存の純関数: 前進量(travel)と画面サイズから、描画すべき柱の画面座標/スケールを返す。
// プレビュー(MansionCorridorPreview)と将来のPixi本実装が同じ式を共有する。
// 数値は全て叩き台=実機調整前提。

export interface CorridorConfig {
  spacing: number;    // 柱の間隔(前進量world px)
  count: number;      // 片側の同時本数(プール)
  focal: number;      // 焦点距離(大=遠近が緩い)
  horizonYr: number;  // 消失点のY(画面高比)
  footYr: number;     // d=0の柱の足元Y(画面高比・1超=画面外下)
  aisleHalfXr: number;// d=0の柱の中心の横オフセット(画面幅比・0.5超=画面外)
  pillarHr: number;   // d=0の柱の描画高(画面高比)
}

export const CORRIDOR_CFG: CorridorConfig = {
  spacing: 520,
  count: 7,
  focal: 420,
  horizonYr: 0.30, // 消失点は上寄り(社長指示v0.25.2078「もっと上より」・旧0.38)
  footYr: 1.55,
  aisleHalfXr: 0.62,
  pillarHr: 1.5,
};

export interface CorridorPillar {
  side: -1 | 1;   // -1=左 / 1=右
  x: number;      // 柱中心の画面X(px)
  y: number;      // 柱の足元の画面Y(px)
  h: number;      // 描画高(px)。幅は素材アスペクトで従属
  depth: number;  // 現在の奥行き(デバッグ/フェード用)
  fade: number;   // 距離フェード(0=完全に霞む〜1=手前)
}

// 前進量→画面上の柱リスト(奥→手前の描画順)。
// 各柱は d = mod(i*spacing - travel, spacing*count) で循環=無限通路。
export const projectCorridorPillars = (
  travel: number,
  viewW: number,
  viewH: number,
  cfg: CorridorConfig = CORRIDOR_CFG,
): CorridorPillar[] => {
  const loop = cfg.spacing * cfg.count;
  const horizonY = viewH * cfg.horizonYr;
  const footY0 = viewH * cfg.footYr;
  const halfX0 = viewW * cfg.aisleHalfXr;
  const out: CorridorPillar[] = [];
  for (let i = 0; i < cfg.count; i++) {
    const d = ((i * cfg.spacing - travel) % loop + loop) % loop;
    const s = cfg.focal / (cfg.focal + d);            // 1/z: d=0で1・遠いほど0へ
    const y = horizonY + (footY0 - horizonY) * s;      // 足元は消失点から手前へ
    const h = viewH * cfg.pillarHr * s;
    const fade = Math.max(0, Math.min(1, (s - 0.12) / 0.5)); // 奥は闇に沈む(叩き台)
    for (const side of [-1, 1] as const) {
      out.push({ side, x: viewW / 2 + side * halfX0 * s, y, h, depth: d, fade });
    }
  }
  // 奥(depth大)から手前へ=painter's order。
  out.sort((a, b) => b.depth - a.depth);
  return out;
};
