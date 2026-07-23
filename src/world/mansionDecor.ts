// ステージ6(洋館・corridorMode)の見た目素材の世界配置 = 床の幅と、柱/燭台の反復配置。
// 木(trees.ts)/花(forestDecor.ts)と同じ「世界座標の純粋関数」: エンティティとして保持せず、
// 可視範囲を区画(行)ごとに決定的に列挙する。当たり判定は無し(柱は±クランプの外=プレイヤーは届かない)。
//
// RENDERER-AGNOSTIC: PixiJS を import しない。描画は pixi 側(pixiScene.syncMansionCorridor)が
// mansionPropsInRegion を読んで足元アンカーのスプライトを並べるだけ。store も触らない。
// 数値は全て叩き台=実機調整前提(v0.25.2108「世界配置の素材で作る」方針)。

// 床(mansion/floor.png=中央カーペット+左右石畳)をマップするワールドx半幅。x∈[-230,+230]。
// v0.25.2110: 縦持ちの可視半幅(~202)に壁が入るよう縮小(社長指示「通路感が無い」対応。旧330)。
// プレイヤーの横クランプ(CORRIDOR_LATERAL_CLAMP=260)より広い=カーペット+石畳の上を歩く。
export const MANSION_FLOOR_HALF_W = 230;
// 柱の中心x(±)。床テクスチャの外縁近く・クランプ260の外=プレイヤーは届かない(当たり判定不要)。
export const MANSION_PILLAR_X = 200; // v0.25.2110: 画面内に壁を(旧300)
// 柱の縦の反復間隔(world px)。
export const MANSION_PILLAR_SPACING_Y = 520;
// 柱の表示高さ(world px)。幅は素材アスペクト(291:1399)で従属。
export const MANSION_PILLAR_DISPLAY_H = 340;
// 燭台のyオフセット(柱の足元Y+この値=柱と柱の中間)。
export const MANSION_CANDLE_OFFSET_Y = 260;
// 燭台の表示高さ(world px)。仕様未指定のため叩き台(柱340の半分弱の背丈)。
export const MANSION_CANDLE_DISPLAY_H = 150;

export interface MansionProp {
  id: string;
  kind: 'pillar' | 'candle';
  side: -1 | 1;   // -1=左 / 1=右
  footX: number;  // 足元(アンカー0.5,1・Y-sortキー)
  footY: number;
}

// footY が [minY, maxY] に入る柱/燭台を列挙(決定的・格子配置なのでハッシュ不要)。
// 呼び出し側(描画)は「可視下端 + 表示高さぶんの余白」を maxY に含めてカリングすること
// (足元が画面下の外でも絵は上へ立ち上がるため)。
export const mansionPropsInRegion = (minY: number, maxY: number): MansionProp[] => {
  const out: MansionProp[] = [];
  const k0 = Math.floor((minY - MANSION_CANDLE_OFFSET_Y) / MANSION_PILLAR_SPACING_Y);
  const k1 = Math.ceil(maxY / MANSION_PILLAR_SPACING_Y);
  for (let k = k0; k <= k1; k++) {
    const pillarY = k * MANSION_PILLAR_SPACING_Y;
    const candleY = pillarY + MANSION_CANDLE_OFFSET_Y;
    for (const side of [-1, 1] as const) {
      if (pillarY >= minY && pillarY <= maxY) {
        out.push({ id: `mp-${k}-${side}`, kind: 'pillar', side, footX: side * MANSION_PILLAR_X, footY: pillarY });
      }
      if (candleY >= minY && candleY <= maxY) {
        out.push({ id: `mc-${k}-${side}`, kind: 'candle', side, footX: side * MANSION_PILLAR_X, footY: candleY });
      }
    }
  }
  return out;
};
