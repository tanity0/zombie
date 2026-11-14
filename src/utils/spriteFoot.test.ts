// 「花が浮く」は3回再発している(素材の余白 / 薄いゴースト画素 / 取り残された不透明な断片)。
// 実測で確認した不変条件をここに固定して、4回目を止める。
import { describe, it, expect } from 'vitest';
import { spriteFootRow, spriteTopRow, spriteLeftCol, spriteRightCol } from './spriteFoot';

/** 行ごとの不透明画素数を組み立てるヘルパ。[開始行, 行数, 1行あたりの画素数] の並びで指定する。 */
const rows = (height: number, blocks: [start: number, len: number, px: number][]): number[] => {
  const r = new Array<number>(height).fill(0);
  for (const [start, len, px] of blocks) for (let i = 0; i < len; i++) r[start + i] = px;
  return r;
};

describe('spriteFootRow: 絵の足元', () => {
  it('連続した本体だけなら、その下端を返す', () => {
    expect(spriteFootRow(rows(300, [[100, 150, 40]]))).toBe(249);
  });

  it('中身が無ければ -1', () => {
    expect(spriteFootRow(rows(100, []))).toBe(-1);
    expect(spriteFootRow([])).toBe(-1);
  });

  it('下端の空白は無視する(足元は絵の下端であってテクスチャの下端ではない)', () => {
    expect(spriteFootRow(rows(300, [[0, 100, 30]]))).toBe(99);
  });

  // ★実測: flower-5.png(262x343) 本体 y〜284 / 空白50行 / y336-342 に 46画素の紫の塊
  it('★flower-5 相当: 50行の空白の下にある46画素の断片を足元に数えない', () => {
    const r = rows(343, [[60, 225, 120], [336, 7, 7]]); // 本体は y284 まで / 断片は計49画素
    expect(spriteFootRow(r)).toBe(284);
  });

  // ★実測: flower-6.png(264x342) 本体 y〜286 / 空白51行 / y338-341 に 7画素の塊
  it('★flower-6 相当: 51行の空白の下にある7画素の断片を足元に数えない', () => {
    const r = rows(342, [[60, 227, 120], [338, 4, 2]]); // 本体は y286 まで / 断片は計8画素
    expect(spriteFootRow(r)).toBe(286);
  });

  // ★これが無いと prop2-r3-c4 等(絵として正当な縦の空きを持つ素材)の足元が200px飛ぶ
  it('★離れていても「大きい」塊は捨てない(絵の一部なので)', () => {
    const r = rows(300, [[0, 100, 50], [200, 60, 50]]); // 下の塊は3000画素=全体の約37%
    expect(spriteFootRow(r)).toBe(259);
  });

  it('★近ければ「小さく」ても捨てない(空白がしきい値未満)', () => {
    // 高さ300 ⇒ 必要な空白は max(8, 15)=15行。空白を10行にすると捨てない。
    const r = rows(300, [[100, 100, 50], [210, 3, 2]]);
    expect(spriteFootRow(r)).toBe(212);
  });

  it('しきい値の境界: 空白がちょうど必要行数なら捨てる / 1行足りなければ捨てない', () => {
    const body: [number, number, number] = [0, 100, 100];
    const gapNeed = Math.max(8, Math.round(300 * 0.05)); // = 15
    const justEnough = rows(300, [body, [100 + gapNeed, 2, 3]]);
    expect(spriteFootRow(justEnough)).toBe(99);
    const oneShort = rows(300, [body, [100 + gapNeed - 1, 2, 3]]);
    expect(spriteFootRow(oneShort)).toBe(100 + gapNeed);
  });

  it('断片が複数あっても、本体まで遡って足元を返す', () => {
    const r = rows(400, [[0, 150, 100], [200, 3, 2], [300, 3, 2]]);
    expect(spriteFootRow(r)).toBe(149);
  });

  it('★全部が小さな断片なら捨てない(捨てると足元が消えるため)', () => {
    const r = rows(300, [[10, 2, 1], [200, 2, 1]]);
    expect(spriteFootRow(r)).toBe(201);
  });
});

describe('spriteTopRow: 絵の上端', () => {
  it('最初に不透明画素が現れる行を返す', () => {
    expect(spriteTopRow(rows(300, [[40, 100, 10]]))).toBe(40);
  });
  it('中身が無ければ -1', () => {
    expect(spriteTopRow(rows(50, []))).toBe(-1);
  });
  it('上端は断片を飛ばさない(足元合わせに使わないので素直に最初の行)', () => {
    expect(spriteTopRow(rows(300, [[5, 1, 1], [100, 100, 50]]))).toBe(5);
  });
});

// ★D-2b: 横方向(左右)。spriteTopRow と同じ「単純な最初/最後の非空列」でよい(§D-2b実装コメント参照)。
// `rows()` ヘルパをそのまま列カウント配列としても使える(1次元配列に意味を持たせているだけ)。
describe('spriteLeftCol / spriteRightCol: 絵の左右端', () => {
  it('最初/最後に不透明画素が現れる列を返す', () => {
    expect(spriteLeftCol(rows(300, [[40, 100, 10]]))).toBe(40);
    expect(spriteRightCol(rows(300, [[40, 100, 10]]))).toBe(139);
  });

  it('中身が無ければ -1', () => {
    expect(spriteLeftCol(rows(50, []))).toBe(-1);
    expect(spriteRightCol(rows(50, []))).toBe(-1);
  });

  it('★jormungand相当: 左右端いっぱいまで絵がある(=左右の余白は0)', () => {
    const r = rows(1024, [[0, 1024, 24]]); // 実測どおり列0〜1023すべてに実体
    expect(spriteLeftCol(r)).toBe(0);
    expect(spriteRightCol(r)).toBe(1023);
  });

  it('断片(離れた小さな塊)も飛ばさない(横は縦と違って再発報告が無いため単純な最外周でよい)', () => {
    expect(spriteLeftCol(rows(300, [[5, 1, 1], [100, 100, 50]]))).toBe(5);
    expect(spriteRightCol(rows(300, [[5, 1, 1], [100, 100, 50]]))).toBe(199);
  });
});
