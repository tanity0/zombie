// ステージ6(洋館)・奥行き通路の疑似投影(1/z)+柱の無限循環(社長相談v0.25.2077の設計)。
// レンダラ非依存の純関数: 前進量(travel)と画面サイズから、描画すべき柱の画面座標/スケールを返す。
// プレビュー(MansionCorridorPreview)と将来のPixi本実装が同じ式を共有する。
// 数値は全て叩き台=実機調整前提。

export interface CorridorConfig {
  spacing: number;    // 柱の間隔(前進量world px)
  count: number;      // 片側の同時本数(プール)
  focal: number;      // 焦点距離(大=遠近が緩い)
  behind: number;     // カメラ通過後も描き続ける奥行き(パチッと消える対策v0.25.2079。focal未満必須)
  horizonYr: number;  // 消失点のY(画面高比)
  footYr: number;     // d=0の柱の足元Y(画面高比・1超=画面外下)
  aisleHalfXr: number;// d=0の柱の中心の横オフセット(画面幅比・0.5超=画面外)
  pillarHr: number;   // d=0の柱の描画高(画面高比)
}

export const CORRIDOR_CFG: CorridorConfig = {
  spacing: 520,
  count: 7,
  focal: 420,
  // d=-240でscale≒2.3=柱の内側の縁が画面端の外へ抜ける(pillarHr1.75の幅で縦430〜横800比を検算済み)。
  behind: 240,
  horizonYr: 0.30, // 消失点は上寄り(社長指示v0.25.2078「もっと上より」・旧0.38)
  footYr: 1.55,
  // 柱の位置(太さは不変): 柱の中心=床テクスチャの外縁。カーペットの左右の石畳=プレイヤーの
  // 左右移動スペース→柱のラインが移動境界になる(社長指示v0.25.2086)。
  // v0.25.2089「もっと左右に」: 0.80→1.05。壁灯は同じ投影ラインなので自動追従。
  aisleHalfXr: 1.05,
  // 柱の頭が画面上端で消えるくらい上へ(社長指示v0.25.2080・旧1.5)。scale≒0.6以上(手前2ペア相当)で
  // 頭が画面上端の外へ抜ける。足元は床ライン(footYr)のまま=接地は不変。
  pillarHr: 1.75,
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
// 各柱は d = mod(i*spacing - travel + behind, loop) - behind で循環=無限通路。
// dは[-behind, loop-behind)の範囲を動く: カメラ(d=0)を通過しても d=-behind まで描き続けて
// 完全に画面外へ抜けてから最奥へ戻る(巻き戻しの瞬間が見えて「パチッと消える」のを防ぐ・v0.25.2079)。
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
    const d = ((i * cfg.spacing - travel + cfg.behind) % loop + loop) % loop - cfg.behind;
    const s = cfg.focal / (cfg.focal + d);            // 1/z: d=0で1・通過中(d<0)は1超・遠いほど0へ
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

// --- ステージ6(洋館)のゲームロジック用定数 -------------------------------------------------
// (v0.25.2108) エンティティの疑似3D投影(projectCorridorEntity)は社長裁定で廃止した。
// ステージ6は完全にm0(通常ステージ)仕様=通常のトップダウン描画・速度1:1で、洋館の見た目は
// 世界配置の素材(床タイル/柱スプライト/遠景ビスタ)で作る。上の柱投影は ?corridor=1 プレビュー専用。

// 横移動の拘束幅(world px)。プレイヤー中心xを ±この値に拘束=通路の壁(gameStoreが使用)。
export const CORRIDOR_LATERAL_CLAMP = 170; // v0.25.2110: 通路幅の縮小(柱±200)に連動(旧260)
