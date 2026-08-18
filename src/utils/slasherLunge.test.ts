import { describe, it, expect } from 'vitest';
import {
  slasherLungePx,
  SLASHER_LUNGE_MAX_PX,
  SLASHER_LUNGE_STANDOFF_FRAC,
} from './slasherLunge';

// 実装側の押し量(gameStore.ts)。ここで参照して「2本の数字がズレる」事故を機械的に検出する。
const FORCE_KB_PX = 25;   // SLASHER_FORCE_KB_PX
const FINAL_KB_MULT = 2;  // SLASHER_FINAL_KB_MULT (Lv3最終段)

describe('slasherLungePx — スラッシャー追撃の自動追尾', () => {
  it('射程内に残るなら踏み込まない(0)', () => {
    // 射程60・目の前(5px)で25px押しても、押した後は30px=内側の着地距離(54px)より近い。
    expect(slasherLungePx(5, FORCE_KB_PX, 60)).toBe(0);
  });

  it('押されて射程の外へ出る分だけ踏み込む', () => {
    // 射程60(着地距離54)、敵は50pxに居て25px押される → 75px → 75-54 = 21px 詰める。
    expect(slasherLungePx(50, FORCE_KB_PX, 60)).toBeCloseTo(21, 6);
  });

  it('★【不変条件】どんな押し量でも、踏み込んだ後は必ず「近接が入る距離」以内に着地する', () => {
    // これが v0.25.3538 で見つけた事故(踏み込み20px vs 押し25px=毎撃5pxずつ逃げる)の再発防止。
    // 押し量を将来いじっても(ノックバック減衰など)、この不変条件が破れないことを機械で保証する。
    for (const meleeRange of [30, 45, 60, 80, 120]) {
      for (const pushedPx of [0, 10, FORCE_KB_PX, FORCE_KB_PX * FINAL_KB_MULT, 50]) {
        for (const dist of [0, 5, 20, meleeRange * 0.5, meleeRange]) {
          const lunge = slasherLungePx(dist, pushedPx, meleeRange);
          const distAfter = dist + pushedPx - lunge; // 踏み込み後の敵までの距離
          expect(distAfter).toBeLessThanOrEqual(meleeRange + 1e-9);
        }
      }
    }
  });

  it('★【不変条件】安全上限を超えて踏み込まない(=射程が嘘にならない)', () => {
    // 社長指示v0.25.3540「追撃の範囲は、自分がいま立ってるところからの近接攻撃射程内。
    // じゃないと射程が嘘になるので」。踏み込みが青天井だと、実効射程が伸びて射程が嘘になる。
    expect(slasherLungePx(1000, 999, 60)).toBe(SLASHER_LUNGE_MAX_PX);
    for (const dist of [0, 50, 200, 1000]) {
      expect(slasherLungePx(dist, 999, 60)).toBeLessThanOrEqual(SLASHER_LUNGE_MAX_PX);
    }
  });

  it('★【不変条件】安全上限は押し量の最大(Lv3最終段)を拾えること', () => {
    // 上限が押し量より小さいと、最終段でだけ追いつけない=同じ事故が形を変えて再発する。
    expect(SLASHER_LUNGE_MAX_PX).toBeGreaterThanOrEqual(FORCE_KB_PX * FINAL_KB_MULT);
  });

  it('踏み込みは負にならない(後ろへ下がらない)', () => {
    expect(slasherLungePx(0, 0, 60)).toBe(0);
    expect(slasherLungePx(0, 0, 0)).toBe(0);
  });

  it('着地距離は射程の内側(境界ちょうどではない)', () => {
    expect(SLASHER_LUNGE_STANDOFF_FRAC).toBeLessThan(1);
    expect(SLASHER_LUNGE_STANDOFF_FRAC).toBeGreaterThan(0);
  });
});
