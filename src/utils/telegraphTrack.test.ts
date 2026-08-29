// §15追尾相パイロット(sweep限定)の純関数テスト。
// 追尾の質の要点だけ固定する: ①対象へ収束する ②振り切り窓なし=大きく通り過ぎない
// ③尺(TELEGRAPH_TRACK_MS)と独立(progress01=1固定・監査A10「後から伸ばすのは容易」の担保)。
import { describe, it, expect } from 'vitest';
import { stepTrackAim, TELEGRAPH_TRACK_MS, SWEEP_TRACK_MAX_PX_S } from './telegraphTrack';
import type { MimirLaserAim } from './mimirLaserTrack';

const run = (aim: MimirLaserAim, tx: number, ty: number, ms: number): MimirLaserAim => {
  let a = aim;
  for (let t = 0; t < ms; t += 16) a = stepTrackAim(a, tx, ty, 0.016);
  return a;
};

describe('§15 追尾相の照準(stepTrackAim)', () => {
  it('既定の追尾相は500ms(window無し環境の既定)', () => {
    expect(TELEGRAPH_TRACK_MS).toBe(500);
  });

  it('静止した対象へ収束する(1秒で5px以内)', () => {
    const a = run({ x: 0, y: 0, vx: 0, vy: 0 }, 120, 0, 1000);
    expect(Math.abs(a.x - 120)).toBeLessThan(5);
    expect(Math.abs(a.y)).toBeLessThan(1);
  });

  it('振り切り窓なし=対象を大きく通り過ぎない(常時到着減速=臨界制動)', () => {
    let a: MimirLaserAim = { x: 0, y: 0, vx: 0, vy: 0 };
    let maxX = 0;
    for (let t = 0; t < 2000; t += 16) { a = stepTrackAim(a, 100, 0, 0.016); maxX = Math.max(maxX, a.x); }
    expect(maxX).toBeLessThan(112); // 行き過ぎは1割強まで(ロックの瞬間に「行き過ぎた位置で焼く」を作らない)
  });

  it('最高速で頭打ち=走り続ける対象は追えるが、瞬間移動はしない', () => {
    const a0: MimirLaserAim = { x: 0, y: 0, vx: 0, vy: 0 };
    const a1 = stepTrackAim(a0, 10000, 0, 0.016);
    expect(Math.hypot(a1.vx, a1.vy)).toBeLessThanOrEqual(SWEEP_TRACK_MAX_PX_S + 1);
  });
});
