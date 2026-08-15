import { describe, it, expect } from 'vitest';
import { distToSegment, distToBandRect } from './geometry';


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
