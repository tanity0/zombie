// M2の湧き位置(placeLabSpawn)の不変条件。社長指示v0.25.2242「敵は自由移動範囲内でのみスポーン」。
import { describe, it, expect } from 'vitest';
import { placeLabSpawn } from './labSpawn';

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
