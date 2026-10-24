// 木の無効化ゲート(ステージ5=戦場・社長指示2026-07-16)のユニット。
// treesInRegion を world 層で一括ゲートする方式のため、「描画・幹当たり・配置回避が同時に消える」
// ことはこの1点(treesInRegionが空)で保証される(全消費箇所が treesInRegion 経由)。
import { describe, it, expect, afterEach } from 'vitest';
import { treesInRegion, setTreesDisabled, resolveTreeCollision } from './trees';

afterEach(() => setTreesDisabled(false)); // 他テストへ漏らさない

describe('setTreesDisabled(ステージ5=木なし)', () => {
  it('既定では木が生える(広域で非空)', () => {
    expect(treesInRegion(-2000, -2000, 2000, 2000).length).toBeGreaterThan(0);
  });

  it('無効化すると treesInRegion が空になり、幹当たりも素通りになる', () => {
    const trees = treesInRegion(-2000, -2000, 2000, 2000);
    expect(trees.length).toBeGreaterThan(0);
    // 幹に重なる矩形(足元中心付近)を作る → 通常は押し出される
    const t = trees[0];
    const rect = { x: t.footX - 10, y: t.footY - 10, width: 20, height: 20 };
    const pushed = resolveTreeCollision(rect);
    setTreesDisabled(true);
    expect(treesInRegion(-2000, -2000, 2000, 2000)).toEqual([]);
    const passthrough = resolveTreeCollision(rect);
    // 無効化中は入力座標のまま(木が存在しない)
    expect(passthrough.x).toBe(rect.x);
    expect(passthrough.y).toBe(rect.y);
    // 有効時の結果はテスト前提の確認のみ(押し出しの有無は幹サイズ依存なので値は固定しない)
    expect(typeof pushed.x).toBe('number');
  });

  it('再有効化で元どおり生える(ラン跨ぎの復元)', () => {
    setTreesDisabled(true);
    expect(treesInRegion(-2000, -2000, 2000, 2000)).toEqual([]);
    setTreesDisabled(false);
    expect(treesInRegion(-2000, -2000, 2000, 2000).length).toBeGreaterThan(0);
  });
});
