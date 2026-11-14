import { describe, it, expect } from 'vitest';
import { stabilizeEscortFace, ESCORT_FACE_HOLD_MS } from './escortFace';

describe('進軍NPCの向きのヒステリシス(社長指摘2026-10-12「右左を高速で向く」)', () => {
  it('振り向いた直後は逆を向かず、保持時間が過ぎたら向ける', () => {
    const a = stabilizeEscortFace(1, undefined, -1, 1000);
    expect(a).toEqual({ face: -1, flipAt: 1000 });
    expect(stabilizeEscortFace(a.face, a.flipAt, 1, 1000 + ESCORT_FACE_HOLD_MS - 1).face).toBe(-1);
    expect(stabilizeEscortFace(a.face, a.flipAt, 1, 1000 + ESCORT_FACE_HOLD_MS)).toEqual({ face: 1, flipAt: 1000 + ESCORT_FACE_HOLD_MS });
  });
  it('毎フレーム左右が入れ替わっても、保持時間あたり1回しか振り向かない', () => {
    let f = { face: 1, flipAt: undefined as number | undefined };
    let flips = 0;
    for (let t = 0; t < 1000; t += 16) {
      const want = (t / 16) % 2 === 0 ? -1 : 1;
      const n = stabilizeEscortFace(f.face, f.flipAt, want, t);
      if (n.face !== f.face) flips++;
      f = n;
    }
    expect(flips).toBeLessThanOrEqual(Math.ceil(1000 / ESCORT_FACE_HOLD_MS) + 1);
  });
  it('近接の振り始め(force)は保持中でも即座に振り向く', () => {
    expect(stabilizeEscortFace(-1, 1000, 1, 1010, true)).toEqual({ face: 1, flipAt: 1010 });
  });
  it('同じ向きのままなら振り向いた時刻は動かない', () => {
    expect(stabilizeEscortFace(1, 500, 1, 2000)).toEqual({ face: 1, flipAt: 500 });
  });
});
