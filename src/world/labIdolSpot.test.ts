// idol(stage-2隠しボス)の配置(屋外ラボ廊下版)の不変条件。
// labDoc自体は乱数を含むため、資料の座標→idolの座標/向きを返す純関数(labIdolSpotForDoc)を
// 直接テストする(side=+1/-1の両方で点対称であること・向きが原点側を向くことを固定)。
import { describe, it, expect } from 'vitest';
import { labIdolSpotForDoc } from './labIdolSpot';

describe('labIdolSpotForDoc(ゴール資料の真逆位置=原点に対する点対称)', () => {
  it('資料が右側(side=+1)の時、idolは原点を挟んだ左側に厳密な点対称で立つ', () => {
    const doc = { x: 6500, y: 12 };
    const spot = labIdolSpotForDoc(doc);
    expect(spot.x).toBe(-doc.x);
    expect(spot.y).toBe(-doc.y);
    expect(spot.x).toBeLessThan(0);
  });

  it('資料が左側(side=-1)の時、idolは原点を挟んだ右側に厳密な点対称で立つ', () => {
    const doc = { x: -7300, y: -25 };
    const spot = labIdolSpotForDoc(doc);
    expect(spot.x).toBe(-doc.x);
    expect(spot.y).toBe(-doc.y);
    expect(spot.x).toBeGreaterThan(0);
  });

  it('資料の実際のレンジ(6000〜7800px)全体で、原点(0,0)を中心とした点対称が成り立つ', () => {
    for (const side of [1, -1]) {
      for (const extra of [0, 900, 1800]) {
        const doc = { x: side * (6000 + extra), y: -30 + extra % 60 };
        const spot = labIdolSpotForDoc(doc);
        // マップ中心(=原点)に対する点対称: spot = -doc
        expect(spot.x).toBe(-doc.x);
        expect(spot.y).toBe(-doc.y);
        // 中点は厳密に原点
        expect((doc.x + spot.x) / 2).toBe(0);
        expect((doc.y + spot.y) / 2).toBe(0);
      }
    }
  });

  it('向きは常に原点(プレイヤーのスタート地点)側を向く: idolが右側(x>0)なら左向き', () => {
    const spot = labIdolSpotForDoc({ x: -6800, y: 0 }); // 資料が左→idolは右側
    expect(spot.x).toBeGreaterThan(0);
    expect(spot.facingLeft).toBe(true);
  });

  it('向きは常に原点側を向く: idolが左側(x<0)なら右向き', () => {
    const spot = labIdolSpotForDoc({ x: 7100, y: 0 }); // 資料が右→idolは左側
    expect(spot.x).toBeLessThan(0);
    expect(spot.facingLeft).toBe(false);
  });
});
