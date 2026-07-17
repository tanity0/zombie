// 松明の無効化ゲート(チュートリアル=アイテム/プロップ無し・社長指示2026-07-17)のユニット。
// torchesInRegion を world 層で一括ゲートする方式のため、「描画・当たり判定・資材ドロップ源が
// 同時に消える」ことはこの1点(torchesInRegionが空)で保証される(全消費箇所が torchesInRegion 経由)。
import { describe, it, expect, afterEach } from 'vitest';
import { torchesInRegion, setTorchesDisabled, resolveTorchCollision } from './torches';

afterEach(() => setTorchesDisabled(false)); // 他テストへ漏らさない

describe('setTorchesDisabled(チュートリアル=松明なし)', () => {
  it('既定では松明が生える(広域で非空)', () => {
    expect(torchesInRegion(-4000, -4000, 4000, 4000).length).toBeGreaterThan(0);
  });

  it('無効化すると torchesInRegion が空になり、当たりも素通りになる', () => {
    const torches = torchesInRegion(-4000, -4000, 4000, 4000);
    expect(torches.length).toBeGreaterThan(0);
    const t = torches[0];
    const rect = { x: t.footX - 8, y: t.footY - 8, width: 16, height: 16 };
    setTorchesDisabled(true);
    expect(torchesInRegion(-4000, -4000, 4000, 4000)).toEqual([]);
    // 松明リストが空なら resolveTorchCollision は素通り(入力座標のまま)
    const passthrough = resolveTorchCollision(rect, torchesInRegion(-4000, -4000, 4000, 4000));
    expect(passthrough.x).toBe(rect.x);
    expect(passthrough.y).toBe(rect.y);
  });

  it('再有効化で元どおり生える(ラン跨ぎの復元)', () => {
    setTorchesDisabled(true);
    expect(torchesInRegion(-4000, -4000, 4000, 4000)).toEqual([]);
    setTorchesDisabled(false);
    expect(torchesInRegion(-4000, -4000, 4000, 4000).length).toBeGreaterThan(0);
  });
});
