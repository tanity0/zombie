// M2の湧き位置(placeLabSpawn)の不変条件。社長指示v0.25.2242「敵は自由移動範囲内でのみスポーン」。
import { describe, it, expect } from 'vitest';
import { placeLabSpawn, isAwayFromLabGoal, isLabIdolSide, labEscapeRouteSlots } from './labSpawn';

const LIMIT = 200;   // LAB_CORRIDOR_Y_LIMIT_PX と同値
const HALF_W = 400;
const MARGIN = 60;

describe('placeLabSpawn', () => {
  it('体がまるごと歩ける帯(±200)の中に収まる', () => {
    for (let i = 0; i < 200; i++) {
      const h = 40 + (i % 5) * 10;
      const p = placeLabSpawn(1000, HALF_W, MARGIN, 30, h, LIMIT, null, [], () => (i % 100) / 100)!;
      expect(p.y).toBeGreaterThanOrEqual(-LIMIT);
      expect(p.y + h).toBeLessThanOrEqual(LIMIT);
    }
  });

  it('Xは必ず画面外(左右いずれか)=湧く瞬間が見えない', () => {
    const left = placeLabSpawn(1000, HALF_W, MARGIN, 30, 60, LIMIT, null, [], () => 0.9)!; // 左から
    const right = placeLabSpawn(1000, HALF_W, MARGIN, 30, 60, LIMIT, null, [], () => 0.1)!; // 右から
    expect(right.x).toBeGreaterThanOrEqual(1000 + HALF_W + MARGIN);
    expect(left.x + 30).toBeLessThanOrEqual(1000 - HALF_W - MARGIN);
  });

  it('帯より背が高い敵でも例外にならない(中央へ置く)', () => {
    const tall = placeLabSpawn(0, HALF_W, MARGIN, 30, 900, LIMIT, null, [], () => 0.5)!;
    expect(Number.isFinite(tall.y)).toBe(true);
    expect(tall.y).toBe(-450); // 帯の中央に中心が来る
  });

  it('乱数を振ると上下に散る(1点に固まらない)', () => {
    const ys = new Set<number>();
    for (let i = 0; i < 20; i++) ys.add(placeLabSpawn(0, HALF_W, MARGIN, 30, 60, LIMIT, null, [], () => i / 20)!.y);
    expect(ys.size).toBeGreaterThan(5);
  });
});

// 社長指示v0.25.2244「一度通った道にスポーンしない」。
describe('placeLabSpawn(通った道を避ける)', () => {
  const visited = { minX: 0, maxX: 3000 };

  it('前進中(右端)は右=未踏側からだけ湧く', () => {
    for (const r of [0.1, 0.9]) {
      const p = placeLabSpawn(3000, HALF_W, MARGIN, 30, 60, LIMIT, visited, [], () => r);
      expect(p).not.toBeNull();
      expect(p!.x).toBeGreaterThan(visited.maxX); // 通った道の外
    }
  });

  it('引き返し中(通った道の内側)は湧かない=null', () => {
    const p = placeLabSpawn(1500, HALF_W, MARGIN, 30, 60, LIMIT, visited, [], () => 0.5);
    expect(p).toBeNull();
  });

  it('左端を越えて進む時は左=未踏側から湧く', () => {
    const p = placeLabSpawn(0, HALF_W, MARGIN, 30, 60, LIMIT, visited, [], () => 0.5);
    expect(p).not.toBeNull();
    expect(p!.x + 30).toBeLessThan(visited.minX); // 通った道の外
  });

  // ★2026-10-11(社長「はい」): 通った道=画面に見えていた範囲(歩いた範囲 ± 半画面)。
  it('最前線から少しでも引き返したら、前に見えていた半画面先の帯にも湧かない', () => {
    for (const back of [1, MARGIN - 1, MARGIN + 1, 200, HALF_W]) {
      const p = placeLabSpawn(3000 - back, HALF_W, MARGIN, 30, 60, LIMIT, { minX: 0 - HALF_W * 3, maxX: 3000 }, [], () => 0.5);
      if (p) expect(p.x, `back=${back}`).toBeGreaterThan(3000 + HALF_W); // 置けるなら必ず見えていた範囲の外
    }
    // 余白(MARGIN)より大きく引き返したら、右は見えていた範囲の内側=湧かない(左も通った道)
    expect(placeLabSpawn(3000 - MARGIN - 1, HALF_W, MARGIN, 30, 60, LIMIT, { minX: 0 - HALF_W * 3, maxX: 3000 }, [], () => 0.5)).toBeNull();
  });

  it('visited 未指定なら従来どおり左右ランダム(他ステージ/初期状態)', () => {
    const a = placeLabSpawn(0, HALF_W, MARGIN, 30, 60, LIMIT, null, [], () => 0.1);
    const b = placeLabSpawn(0, HALF_W, MARGIN, 30, 60, LIMIT, null, [], () => 0.9);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.x).not.toBe(b!.x);
  });
});

// 社長指示v0.25.2245「敵同士が、視界の中に別の敵を沸かせない」。
// 狙い: 視界が重なった敵が並ぶと「片方から隠れるともう片方に見つかる」=忍び込む道が消えるため。
describe('placeLabSpawn(他の敵の視界を避ける)', () => {
  const R = 200; // LAB_VISION_RANGE と同値

  it('湧き位置が既存の敵の視界に入らない', () => {
    // 右の湧き列(x=1000+400+60=1460)を丸ごと覆う視界を置く
    const others = [{ x: 1460 + 15, y: 0, r: 400 }];
    const p = placeLabSpawn(1000, HALF_W, MARGIN, 30, 60, LIMIT, null, others, () => 0.5);
    // 左側は空いているのでそちらに置かれる(=視界の外)
    expect(p).not.toBeNull();
    expect(Math.hypot(p!.x + 15 - others[0].x, p!.y + 30 - others[0].y)).toBeGreaterThanOrEqual(others[0].r);
  });

  it('左右とも既存の視界に覆われていたら湧かせない(null)', () => {
    const others = [
      { x: 1460, y: 0, r: 1000 },
      { x: 1000 - HALF_W - MARGIN, y: 0, r: 1000 },
    ];
    const p = placeLabSpawn(1000, HALF_W, MARGIN, 30, 60, LIMIT, null, others, () => 0.5);
    expect(p).toBeNull();
  });

  it('視界が帯の一部だけを覆う場合は空いているYへ逃がす', () => {
    let i = 0;
    const others = [{ x: 1460 + 15, y: -LIMIT + 40, r: R }]; // 帯の上側だけを覆う
    const p = placeLabSpawn(1000, HALF_W, MARGIN, 30, 60, LIMIT, null, others, () => {
      i++; return i === 1 ? 0.5 : 0.98; // 1回目は上寄り→拒否、2回目は下端へ
    });
    expect(p).not.toBeNull();
    expect(Math.hypot(p!.x + 15 - others[0].x, p!.y + 30 - others[0].y)).toBeGreaterThanOrEqual(R);
  });

  it('others が空なら従来どおり必ず置ける', () => {
    const p = placeLabSpawn(0, HALF_W, MARGIN, 30, 60, LIMIT, null, [], () => 0.5);
    expect(p).not.toBeNull();
  });
});

// 社長指示v0.25.2248「m2のゴールと反対方向に行くと、2/3にする前(3/3)の量の敵配置」。
describe('isAwayFromLabGoal', () => {
  it('ゴールが右(+)なら、原点より左に居る間だけ true', () => {
    expect(isAwayFromLabGoal(-1000, 1)).toBe(true);
    expect(isAwayFromLabGoal(1000, 1)).toBe(false);
  });

  it('ゴールが左(-)なら、原点より右に居る間だけ true', () => {
    expect(isAwayFromLabGoal(1000, -1)).toBe(true);
    expect(isAwayFromLabGoal(-1000, -1)).toBe(false);
  });

  it('原点(出撃直後)は逆側ではない=false(いきなり増やさない)', () => {
    expect(isAwayFromLabGoal(0, 1)).toBe(false);
    expect(isAwayFromLabGoal(0, -1)).toBe(false);
  });

  it('ゴール未確定(side=0)は常に false=従来どおり間引いたまま', () => {
    expect(isAwayFromLabGoal(-5000, 0)).toBe(false);
    expect(isAwayFromLabGoal(5000, 0)).toBe(false);
  });
});

// 社長指示2026-10-19「(這う塊を置いたので)アイドル側には雑魚を配置しない」。
describe('アイドル側には湧かせない', () => {
  it('isLabIdolSide: アイドルと同じ符号の側だけ。原点・アイドル無し(0)は対象外', () => {
    expect(isLabIdolSide(500, 1)).toBe(true);
    expect(isLabIdolSide(-500, 1)).toBe(false);
    expect(isLabIdolSide(-500, -1)).toBe(true);
    expect(isLabIdolSide(0, 1)).toBe(false);
    expect(isLabIdolSide(500, 0)).toBe(false);
  });
  it('プレイヤーが原点付近ならアイドル側(右)を捨てて反対側(左)に湧く', () => {
    for (let i = 0; i < 50; i++) {
      const p = placeLabSpawn(0, HALF_W, MARGIN, 30, 60, LIMIT, null, [], () => i / 50, 1)!;
      expect(p.x + 15).toBeLessThan(0);
    }
  });
  it('アイドル側に深く入っていれば(両側ともアイドル側)湧かない', () => {
    expect(placeLabSpawn(3000, HALF_W, MARGIN, 30, 60, LIMIT, null, [], () => 0.3, 1)).toBeNull();
    expect(placeLabSpawn(-3000, HALF_W, MARGIN, 30, 60, LIMIT, null, [], () => 0.3, -1)).toBeNull();
  });
  it('アイドルが居ない出撃(0)は従来どおり両側', () => {
    const r = placeLabSpawn(3000, HALF_W, MARGIN, 30, 60, LIMIT, null, [], () => 0.1, 0)!;
    expect(r.x).toBeGreaterThan(3000);
  });
});

describe('labEscapeRouteSlots(資料の後の逃走経路・社長指示2026-10-20「等間隔に一画面1体くらい」「通路を塞がない」)', () => {
  it('原点の方へ1画面ごとに1体・最初は1画面先・原点の手前で止まる・原点の向こうには置かない', () => {
    const sl = labEscapeRouteSlots(-7000, 430, 200, 60, 700);
    expect(sl[0].cx).toBe(-7000 + 430);
    for (let i = 1; i < sl.length; i++) expect(sl[i].cx - sl[i - 1].cx).toBe(430);
    for (const s0 of sl) { expect(s0.cx).toBeLessThan(-700 + 1e-9); expect(s0.cx).toBeLessThan(0); }
    expect(sl.length).toBe(Math.floor((7000 - 700) / 430));
    const r = labEscapeRouteSlots(6000, 500, 200, 60, 700);
    expect(r[0].cx).toBe(5500);
    for (const s0 of r) expect(s0.cx).toBeGreaterThanOrEqual(700);
  });
  it('上下の縁へ交互(真ん中を空ける)・体は帯の中', () => {
    const sl = labEscapeRouteSlots(-5000, 430, 200, 60, 700);
    for (let i = 0; i < sl.length; i++) {
      expect(Math.abs(sl[i].cy)).toBeGreaterThan(100);
      expect(Math.abs(sl[i].cy) + 30).toBeLessThanOrEqual(200);
      if (i > 0) expect(Math.sign(sl[i].cy)).toBe(-Math.sign(sl[i - 1].cy));
    }
  });
  it('原点ちょうど・間隔0では置かない', () => {
    expect(labEscapeRouteSlots(0, 430, 200, 60, 700)).toEqual([]);
    expect(labEscapeRouteSlots(-5000, 0, 200, 60, 700)).toEqual([]);
  });
});
