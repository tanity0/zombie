import { describe, it, expect } from 'vitest';
import { biteFxRect, playerArtRect, rectsOverlap } from './biteFxHit';
import { ZOMBIE_BITE_W_PX } from './zombieBiteFx';

const player = (cx: number, footY: number) => ({ x: cx - 14, y: footY - 28, width: 28, height: 28 });

describe('雑魚の技の当たり=エフェクトの絵とキャラの絵の重なり(社長指示2026-10-06)', () => {
  it('対象は3つの技だけ', () => {
    expect(biteFxRect(undefined, 0, 0, true)).toBeNull();
    expect(biteFxRect('lich-blink', 0, 0, true)).toBeNull();
    expect(biteFxRect('zombie-double', 0, 0, true)).not.toBeNull();
  });
  it('エフェクトの出る点に立ったままなら3つとも当たる', () => {
    for (const mv of ['zombie-double', 'skel-bite', 'bat-grab'] as const) {
      const p = player(200, 300);
      const r = biteFxRect(mv, p.x + 14, p.y + 14, true)!;
      expect(rectsOverlap(r, playerArtRect(p))).toBe(true);
    }
  });
  it('絵の幅の外へ出れば外れ、大きさを変えれば判定も同じだけ変わる(幅の半分+キャラの半幅が境目)', () => {
    const r = biteFxRect('zombie-double', 0, 0, true)!;
    expect(r.w).toBeGreaterThan(ZOMBIE_BITE_W_PX * 0.8);
    expect(r.w).toBeLessThanOrEqual(ZOMBIE_BITE_W_PX);
    const art = playerArtRect(player(0, 0));
    const edge = r.x + r.w + art.w / 2; // これより右に中心があれば外れる
    expect(rectsOverlap(r, playerArtRect(player(edge + 1, 14)))).toBe(false);
    expect(rectsOverlap(r, playerArtRect(player(edge - 1, 14)))).toBe(true);
  });
  it('コウモリの叩きつけは当たる点から上へ描かれる(点より下の足元には届かない)', () => {
    const r = biteFxRect('bat-grab', 0, 0, true)!;
    expect(r.y + r.h).toBeCloseTo(0, 5);
    expect(r.y).toBeLessThan(-50);
  });
});
