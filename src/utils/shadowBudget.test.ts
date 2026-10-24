// ★#S-1(社長指摘2026-09-20「32MBの予算なのに49MBまで増えるなら、その予算は現状では厳密な
// 上限として機能していない」)の機械化。
//
// 壊れ方は2つあった(実コードで確認):
//  ①増える側: ベイクは常駐バイト数を**見ずに**毎フレーム焼いていた
//  ②減る側: 退避は**ベイクした時にしか回らず**、しかも使用中は飛ばすので、
//    全部使用中だと「超過を一時許容」して終わっていた
// ⇒ 判断は純関数に出してここで固定する(PixiJSの描画側はテストしない=CLAUDE.md)。
import { describe, it, expect } from 'vitest';
import { canBakeSilhouette, planSilhouetteEviction } from './shadowSlots';
import type { SilhouetteEvictCandidate } from './shadowSlots';

const MB = 1024 * 1024;
const c = (key: string, mb: number, inUse = false): SilhouetteEvictCandidate =>
  ({ key, bytes: mb * MB, inUse });

describe('★#S-1 新規ベイクの歯止め', () => {
  it('予算内なら焼ける', () => {
    expect(canBakeSilhouette(31 * MB, 32 * MB)).toBe(true);
  });
  it('★予算に達したら焼かない(=その絵は接地だけの簡易影で待つ)', () => {
    expect(canBakeSilhouette(32 * MB, 32 * MB)).toBe(false);
    expect(canBakeSilhouette(49 * MB, 32 * MB)).toBe(false);
  });
});

describe('★#S-1 退避の選び方', () => {
  it('予算内なら1枚も捨てない', () => {
    expect(planSilhouetteEviction([c('a', 10), c('b', 10)], 20 * MB, 32 * MB)).toEqual([]);
  });

  it('古い順(=並び順)に、予算を下回るまでだけ捨てる', () => {
    // 40MB → 32MB以下にするには 8MB ぶん。10MBの最古1枚で足りる。
    const got = planSilhouetteEviction([c('a', 10), c('b', 10), c('c', 10), c('d', 10)], 40 * MB, 32 * MB);
    expect(got).toEqual(['a']);
  });

  it('★使用中は絶対に選ばない(可視のメッシュのテクスチャを壊すと影が1フレーム消える)', () => {
    const got = planSilhouetteEviction(
      [c('a', 10, true), c('b', 10, true), c('c', 10), c('d', 10)], 40 * MB, 32 * MB);
    expect(got).toEqual(['c']);
  });

  it('★全部使用中なら1枚も捨てない(=ここで諦める。増える側は canBakeSilhouette が止める)', () => {
    const all = [c('a', 20, true), c('b', 20, true), c('c', 9, true)];
    expect(planSilhouetteEviction(all, 49 * MB, 32 * MB)).toEqual([]);
    // ★この状態こそが社長の指摘した49MB。退避で減らせない以上、**増やさない**のが唯一の歯止め。
    expect(canBakeSilhouette(49 * MB, 32 * MB)).toBe(false);
  });

  it('★焼いたばかりの1枚は対象外(keep)', () => {
    const got = planSilhouetteEviction(
      [c('new', 10), c('b', 10), c('c', 10), c('d', 10)], 40 * MB, 32 * MB, 'new');
    expect(got).toEqual(['b']);
  });

  it('★最後の1枚は残す(全部捨てると次のフレームで必ず焼き直す=空回りになる)', () => {
    const got = planSilhouetteEviction([c('a', 99)], 99 * MB, 32 * MB);
    expect(got).toEqual([]);
  });

  it('★捨てた合計は「超過ぶん」以上・「全部」未満(必要なぶんだけ捨てる)', () => {
    const cands = [c('a', 5), c('b', 5), c('c', 5), c('d', 5), c('e', 5), c('f', 5), c('g', 5), c('h', 5)];
    const got = planSilhouetteEviction(cands, 40 * MB, 32 * MB);
    expect(got.length).toBeGreaterThanOrEqual(2);   // 8MB超過 → 5MB×2枚
    expect(got.length).toBeLessThan(cands.length);
  });
});
