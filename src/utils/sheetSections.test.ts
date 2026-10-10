// ★区間割りの核。**コマごとの表示の長さの比(weights)**を足した回(v0.25.4620)の検査。
// 社長指示2026-09-24「**普通に流すと突きがゆったりしてると思います**」への対応で入れた仕組みなので、
// 「等分に落ちる条件」と「区間の境目が動かないこと」を機械で押さえる。
import { describe, it, expect } from 'vitest';
import { sectionFrame, sectionLastFrame, sectionsTotal, type SectionCounts } from './sheetSections';

const C: SectionCounts = [4, 2, 4];   // 合計10コマ

describe('区間割り（重みなし＝従来どおり等分）', () => {
  it('区間の先頭と末尾', () => {
    expect(sectionFrame(C, 0, 0)).toBe(0);
    expect(sectionFrame(C, 0, 0.999)).toBe(3);
    expect(sectionFrame(C, 1, 0)).toBe(4);
    expect(sectionFrame(C, 1, 0.999)).toBe(5);
    expect(sectionFrame(C, 2, 0)).toBe(6);
    expect(sectionFrame(C, 2, 0.999)).toBe(9);
  });

  it('最後の区間を出し切ったら null（途中の区間は末尾のコマで待つ）', () => {
    expect(sectionFrame(C, 2, 1)).toBeNull();
    expect(sectionFrame(C, 0, 1.5)).toBe(3);
    expect(sectionLastFrame(C, 0)).toBe(3);
  });
});

describe('★重み（コマごとの表示の長さの比）', () => {
  // 先頭を極端に短く、末尾を長く。等分なら 0..0.25 が0コマ目だが、重みでは 0..0.05 だけ。
  const W = [1, 3, 8, 8, 1, 1, 1, 1, 1, 1];

  it('短い重みのコマは早く抜ける（＝速く見える）', () => {
    expect(sectionFrame(C, 0, 0.0, W)).toBe(0);
    expect(sectionFrame(C, 0, 0.04, W)).toBe(0);
    expect(sectionFrame(C, 0, 0.10, W)).toBe(1);   // 等分ならまだ0コマ目
    expect(sectionFrame(C, 0, 0.50, W)).toBe(2);
    expect(sectionFrame(C, 0, 0.99, W)).toBe(3);
  });

  it('★★区間の境目は動かない（＝掟③「消え切る時刻＝当たる時刻」を壊さない）', () => {
    for (const w of [undefined, W]) {
      expect(sectionFrame(C, 0, 0.999, w)).toBe(3);
      expect(sectionFrame(C, 1, 0, w)).toBe(4);
      expect(sectionFrame(C, 1, 0.999, w)).toBe(5);
      expect(sectionFrame(C, 2, 0, w)).toBe(6);
      expect(sectionFrame(C, 2, 1, w)).toBeNull();
    }
  });

  it('★どの区間も全コマを1度は通る（重みで飛ばさない）', () => {
    const seen = new Set<number>();
    for (const i of [0, 1, 2] as const) {
      for (let k = 0; k <= 2000; k++) {
        const f = sectionFrame(C, i, k / 2000, W);
        if (f !== null) seen.add(f);
      }
    }
    expect(seen.size).toBe(sectionsTotal(C));
  });

  it('★表を書き間違えても絵が飛ばない（長さ違い・合計0は等分へ落ちる）', () => {
    expect(sectionFrame(C, 0, 0.10, [1, 2, 3])).toBe(0);              // 長さが合わない
    expect(sectionFrame(C, 0, 0.10, new Array(10).fill(0))).toBe(0);  // 合計0
    expect(sectionFrame(C, 0, 0.60, new Array(10).fill(0))).toBe(2);
  });
});
