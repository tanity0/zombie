import { describe, it, expect } from 'vitest';
import { distToSegment, distToBandRect, sweptRectHull, dashLineStrikeEnd, dashLineEraseRescale } from './geometry';


// ★v0.25.3496(社長指示「sweep は四角の帯に当たりも戻して」「他にもこの事例が無いかを全技洗って」)。
// 帯の予告は全経路が「始点/終点を halfWidth ぶん軸方向へ伸ばした長方形」で描かれている
// (pixiScene の drawTelegraphBand / drawAngelZoneCapsule / drawGiantCapsuleZone が同じ式)。
// 判定はこの四角そのものでなければ「赤いのに当たらない」が四隅で起きる。
describe('distToBandRect(帯の判定=描いてある四角)', () => {
  const A = { x: 0, y: 0 }, B = { x: 100, y: 0 }, HW = 20;
  it('帯の内側は距離0', () => {
    expect(distToBandRect({ x: 50, y: 0 }, A, B, HW)).toBe(0);
    expect(distToBandRect({ x: 50, y: 19.9 }, A, B, HW)).toBe(0);
  });
  it('★四隅が入る(カプセルでは外れていた点=この修正の本体)', () => {
    // 終点の外側 halfWidth・法線方向にも halfWidth = 四角の角。
    const corner = { x: 100 + HW, y: HW };
    expect(distToBandRect(corner, A, B, HW)).toBe(0);           // 四角なら内側(角)
    expect(distToSegment(corner, A, B)).toBeGreaterThan(HW);    // カプセルでは外
  });
  it('軸方向の端は halfWidth ぶん伸びている(描画と同じ)', () => {
    expect(distToBandRect({ x: 120, y: 0 }, A, B, HW)).toBe(0);
    expect(distToBandRect({ x: -20, y: 0 }, A, B, HW)).toBe(0);
    expect(distToBandRect({ x: 130, y: 0 }, A, B, HW)).toBeCloseTo(10, 6);
  });
  it('法線方向のはみ出しはそのまま距離になる', () => {
    expect(distToBandRect({ x: 50, y: 25 }, A, B, HW)).toBeCloseTo(5, 6);
    expect(distToBandRect({ x: 50, y: -25 }, A, B, HW)).toBeCloseTo(5, 6);
  });
  it('角の外はユークリッド距離(角を丸めない=円との合成は呼び出し側の <= 半径 が担う)', () => {
    expect(distToBandRect({ x: 123, y: 24 }, A, B, HW)).toBeCloseTo(Math.hypot(3, 4), 6);
  });
  it('長さ0の帯は一辺2*halfWidthの正方形(描画と同じ)', () => {
    expect(distToBandRect({ x: 20, y: 20 }, A, A, HW)).toBe(0);
    expect(distToBandRect({ x: 21, y: 0 }, A, A, HW)).toBeCloseTo(1, 6);
  });
  it('斜めの帯でも成立する(回転不変)', () => {
    const a = { x: 0, y: 0 }, b = { x: 70.71, y: 70.71 }; // 45度・長さ100
    // 終点の先 halfWidth ぶん(=軸方向)は内側。
    expect(distToBandRect({ x: 70.71 + 14.14, y: 70.71 + 14.14 }, a, b, HW)).toBe(0);
  });
});

// =================================================================================================
// ★v0.25.3818(社長裁定 §9-6「突進の走行中の体当たり」=(B)「当てる」の条件①「体幅ぶんの赤い帯を描く」)。
// 走行中の接触ダメージは帯ではなく **AABB どうしの重なり**(combatTick.applyContactDamage)なので、
// 絵を帯プリミティブで描くと斜め移動で幅がズレ、両端に帯のキャップぶん余分が付く。
// 「AABB が直線移動した掃過領域=始点矩形と終点矩形の凸包」を**厳密に**返すのがこの関数。
// =================================================================================================
describe('sweptRectHull(AABB の掃過領域=赤い帯の形。判定と厳密一致)', () => {
  const poly = (a: number[]): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i < a.length; i += 2) out.push([a[i], a[i + 1]]);
    return out;
  };
  /** 凸多角形の内外判定(全辺で同じ側に居るか)。凸包なので符号の一致だけ見ればよい。 */
  const inside = (a: number[], x: number, y: number): boolean => {
    const p = poly(a);
    let neg = false, pos = false;
    for (let i = 0; i < p.length; i++) {
      const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length];
      const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (c < -1e-9) neg = true;
      if (c > 1e-9) pos = true;
    }
    return !(neg && pos);
  };

  it('★水平移動は長方形(高さ=矩形の高さ・長さ=移動+幅)', () => {
    // トールの実寸(140×70)で右へ300px。左端0・右端300+140=440・上下0〜70。
    expect(poly(sweptRectHull(0, 0, 140, 70, 300, 0)))
      .toEqual([[0, 0], [440, 0], [440, 70], [0, 70]]);
  });

  it('★垂直移動は長方形(幅=矩形の幅・長さ=移動+高さ)', () => {
    expect(poly(sweptRectHull(0, 0, 140, 70, 0, 200)))
      .toEqual([[0, 0], [140, 0], [140, 270], [0, 270]]);
  });

  it('★斜め移動は六角形(帯の長方形では表せない形=ここが「厳密に一致」の肝)', () => {
    const h = poly(sweptRectHull(0, 0, 140, 70, 200, 200));
    expect(h.length).toBe(6);
    expect(h).toEqual([[0, 0], [140, 0], [340, 200], [340, 270], [200, 270], [0, 70]]);
  });

  it('動かない(始点=終点)なら矩形そのもの', () => {
    expect(poly(sweptRectHull(10, 20, 140, 70, 10, 20)))
      .toEqual([[10, 20], [150, 20], [150, 90], [10, 90]]);
  });

  it('★掃過の途中どのコマの矩形も、四隅すべてが帯の内側にある(=「赤くないのに当たる」が出ない)', () => {
    const x0 = -30, y0 = 15, w = 140, h = 70, x1 = 260, y1 = 190;
    const hull = sweptRectHull(x0, y0, w, h, x1, y1);
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      for (const [dx, dy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
        expect(inside(hull, cx + dx, cy + dy), `t=${t} の角 (${dx},${dy}) が帯の外`).toBe(true);
      }
    }
  });

  it('★帯の外の点は本当に外(内外判定が「常にtrue」ではないことの証明)', () => {
    const hull = sweptRectHull(0, 0, 140, 70, 300, 0);
    expect(inside(hull, 500, 35)).toBe(false); // 進行方向のさらに先
    expect(inside(hull, 200, -50)).toBe(false); // 帯の上
  });
});

// =================================================================================================
// ★v0.25.3818(社長裁定 §9-5「突進の赤い線と斬り抜けのズレ」=(a)「赤い線を斬り抜けの終端まで延ばす」)。
// =================================================================================================
describe('dashLineStrikeEnd(赤い流星ラインの終点を斬り抜けの終端へ)', () => {
  it('★進行方向へ strikeRange ぶん伸びる(トールの 310px)', () => {
    expect(dashLineStrikeEnd(0, 0, 200, 0, 310)).toEqual({ x: 510, y: 0 });
  });
  it('斜めでも「到達点から進行方向へ range」(長さが range ぶん増える)', () => {
    const e = dashLineStrikeEnd(0, 0, 30, 40, 100); // 到達点まで50px
    expect(Math.hypot(e.x, e.y)).toBeCloseTo(150, 9);
    expect(e).toEqual({ x: 90, y: 120 });
  });
  it('方向が作れない(始点=到達点)なら到達点をそのまま返す=線が伸びない', () => {
    expect(dashLineStrikeEnd(7, 9, 7, 9, 310)).toEqual({ x: 7, y: 9 });
  });
});

describe('dashLineEraseRescale(線を伸ばしても「走者が食った先端」が動かない)', () => {
  it('★同じ世界座標を指す割合へ縮む(到達点まで200・伸ばし100 → 2/3倍)', () => {
    expect(dashLineEraseRescale(0.6, 200, 100)).toBeCloseTo(0.4, 9);
    // 元の線で 0.6(=120px 地点)/ 伸ばした線(300px)で 0.4 = 120px 地点。一致している。
    expect(0.6 * 200).toBeCloseTo(dashLineEraseRescale(0.6, 200, 100) * 300, 9);
  });
  it('伸ばさない(range=0)なら素通し', () => {
    expect(dashLineEraseRescale(0.42, 200, 0)).toBeCloseTo(0.42, 9);
  });
  it('長さゼロ(0除算)でも素通しで返す', () => {
    expect(dashLineEraseRescale(0.5, 0, 0)).toBe(0.5);
  });
});
