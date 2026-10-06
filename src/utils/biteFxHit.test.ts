import { describe, it, expect } from 'vitest';
import { biteFxHitRadius, biteFxHitsPlayer, BITE_FX_HIT_FRAC } from './biteFxHit';
import { ZOMBIE_BITE_W_PX } from './zombieBiteFx';
import { SKEL_CLAW_W_PX } from './skeletonClaw';
import { BAT_SLAM_W_PX } from './batLanternSwing';

describe('雑魚の技の当たり判定=エフェクトの芯(社長指示2026-10-06)', () => {
  it('半径はエフェクトの幅の40%。対象は3つの技だけ', () => {
    expect(biteFxHitRadius('zombie-double')).toBeCloseTo(ZOMBIE_BITE_W_PX * BITE_FX_HIT_FRAC);
    expect(biteFxHitRadius('skel-bite')).toBeCloseTo(SKEL_CLAW_W_PX * BITE_FX_HIT_FRAC);
    expect(biteFxHitRadius('bat-grab')).toBeCloseTo(BAT_SLAM_W_PX * BITE_FX_HIT_FRAC);
    expect(biteFxHitRadius(undefined)).toBeNull();
    expect(biteFxHitRadius('lich-blink')).toBeNull();
  });
  it('エフェクトの出る点に立ったままなら必ず当たる / 半径の外へ出れば外れる', () => {
    const p = { x: 100, y: 100, width: 28, height: 28 };
    expect(biteFxHitsPlayer(114, 114, 30, p)).toBe(true);
    expect(biteFxHitsPlayer(114 + 14 + 30 + 1, 114, 30, p)).toBe(false);
    expect(biteFxHitsPlayer(114 + 14 + 29, 114, 30, p)).toBe(true);
  });
  it('折衷の大きさ: エフェクトは縮めた値(ゾンビ142・爪112・叩きつけ88)', () => {
    expect(ZOMBIE_BITE_W_PX).toBe(142);
    expect(SKEL_CLAW_W_PX).toBe(112);
    expect(BAT_SLAM_W_PX).toBe(88);
  });
});
