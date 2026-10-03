import { describe, it, expect } from 'vitest';
import {
  sampleRim, rimBuckets, rimBucketDir, rimFollow, rimFollowDir,
  RIM_BUCKETS, RIM_MIN_DIST, type RimLight,
} from './rimLight';

const L = (x: number, y: number, reach = 200, strength = 1, color = 0xffffff): RimLight =>
  ({ x, y, reach, strength, color });

describe('sampleRim', () => {
  it('光の方を向く(右の光なら +x)', () => {
    const s = sampleRim(0, 0, [L(100, 0)]);
    expect(s).not.toBeNull();
    expect(s!.dx).toBeCloseTo(1, 5);
    expect(s!.dy).toBeCloseTo(0, 5);
  });

  it('光を左右に回すと向きも回る(社長の受け入れ条件2)', () => {
    const r = sampleRim(0, 0, [L(100, 0)])!;
    const l = sampleRim(0, 0, [L(-100, 0)])!;
    expect(Math.sign(r.dx)).toBe(1);
    expect(Math.sign(l.dx)).toBe(-1);
  });

  it('★距離ゼロの光は捨てる(レベルアップ・自己光源で NaN にしない)', () => {
    // レベルアップの強glowはプレイヤー位置ちょうどに出る
    expect(sampleRim(0, 0, [L(0, 0)])).toBeNull();
    expect(sampleRim(0, 0, [L(RIM_MIN_DIST - 1, 0)])).toBeNull();
    const ok = sampleRim(0, 0, [L(RIM_MIN_DIST + 1, 0)]);
    expect(ok).not.toBeNull();
    expect(Number.isFinite(ok!.dx)).toBe(true);
  });

  it('届く距離の外の光は効かない', () => {
    expect(sampleRim(0, 0, [L(300, 0, 200)])).toBeNull();
  });

  it('★逆向き same 強さの2本は打ち消してゼロになる(縁を出さない)', () => {
    expect(sampleRim(0, 0, [L(100, 0), L(-100, 0)])).toBeNull();
  });

  it('★2本の光の間では中間を向く=支配光の入れ替わりで飛ばない', () => {
    // 右と下に等しい光 → 右下(45°)
    const s = sampleRim(0, 0, [L(100, 0), L(0, 100)])!;
    expect(s.dx).toBeCloseTo(Math.SQRT1_2, 3);
    expect(s.dy).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it('色はいちばん寄与の大きい光のものを採る(混ぜない)', () => {
    const near = L(30, 0, 200, 1, 0xff0000);
    const far = L(-190, 0, 200, 1, 0x00ff00);
    expect(sampleRim(0, 0, [near, far])!.color).toBe(0xff0000);
  });

  it('近いほど強い', () => {
    const near = sampleRim(0, 0, [L(30, 0)])!.strength;
    const far = sampleRim(0, 0, [L(150, 0)])!.strength;
    expect(near).toBeGreaterThan(far);
  });

  it('常に単位ベクトルを返す', () => {
    for (const [lx, ly] of [[100, 40], [-70, 90], [20, -150]]) {
      const s = sampleRim(0, 0, [L(lx, ly, 400)])!;
      expect(Math.hypot(s.dx, s.dy)).toBeCloseTo(1, 6);
    }
  });
});

describe('rimBuckets', () => {
  it('全バケツが有効な範囲に入り、混ぜ具合は 0..1', () => {
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2 - Math.PI;
      const b = rimBuckets(Math.cos(a), Math.sin(a));
      expect(b.a).toBeGreaterThanOrEqual(0);
      expect(b.a).toBeLessThan(RIM_BUCKETS);
      expect(b.b).toBe((b.a + 1) % RIM_BUCKETS);
      expect(b.t).toBeGreaterThanOrEqual(0);
      expect(b.t).toBeLessThan(1);
    }
  });

  it('バケツの向きへ丸めると、そのバケツ自身になる(混ぜ具合ゼロ)', () => {
    for (let i = 0; i < RIM_BUCKETS; i++) {
      const d = rimBucketDir(i);
      const b = rimBuckets(d.dx, d.dy);
      expect(b.a).toBe(i);
      expect(b.t).toBeCloseTo(0, 5);
    }
  });

  it('右(+x)は0番', () => {
    expect(rimBuckets(1, 0).a).toBe(0);
  });
});

describe('rimFollow / rimFollowDir(慣性MUST)', () => {
  it('★一足飛びに到達しない(パッと点いてパッと消えるのを禁止)', () => {
    const mid = rimFollow(0, 1, 16, 120);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('時定数ぶん経つと約63%進む(dtに依らない指数追従)', () => {
    expect(rimFollow(0, 1, 120, 120)).toBeCloseTo(1 - Math.exp(-1), 6);
    // 分割して回しても同じ所に来る=フレーム落ちで速度が変わらない
    let v = 0;
    for (let i = 0; i < 10; i++) v = rimFollow(v, 1, 12, 120);
    expect(v).toBeCloseTo(1 - Math.exp(-1), 6);
  });

  it('tau=0 は即到達', () => {
    expect(rimFollow(0, 1, 16, 0)).toBe(1);
  });

  it('初回(前の向きが無い)は即その向き', () => {
    const d = rimFollowDir(0, 0, 0, 1, 16, 120);
    expect(d.dx).toBeCloseTo(0, 6);
    expect(d.dy).toBeCloseTo(1, 6);
  });

  it('★真逆へ回る時も向きが消えない(常に単位ベクトル)', () => {
    let dx = 1, dy = 0;
    for (let i = 0; i < 40; i++) {
      const d = rimFollowDir(dx, dy, -1, 0, 16, 120);
      dx = d.dx; dy = d.dy;
      expect(Math.hypot(dx, dy)).toBeCloseTo(1, 6); // 途中で 0 を通らない
    }
    expect(dx).toBeLessThan(-0.9);
  });

  it('近い方へ回る(+170°ではなく -190° を選ばない)', () => {
    // 現在 179°、目標 -179° → 差は +2°(2°ぶんだけ進む)
    const pa = (179 * Math.PI) / 180, ta = (-179 * Math.PI) / 180;
    const d = rimFollowDir(Math.cos(pa), Math.sin(pa), Math.cos(ta), Math.sin(ta), 1200, 120);
    const got = (Math.atan2(d.dy, d.dx) * 180) / Math.PI;
    expect(Math.abs(Math.abs(got) - 179)).toBeLessThan(1.5);
  });
});
