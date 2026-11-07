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
  it('★【回帰・v0.25.3543】目の前の敵を押した時も、押した分だけ必ず踏み込む', () => {
    // 初版(v0.25.3540)は「押した後の距離 − 近接が入る距離」だけで書いていたため、
    // 近接戦の常態(敵が目の前=距離ほぼ0)で常に0を返し、**判定だけ入ってプレイヤーが動かなかった**
    // (社長報告v0.25.3543)。押した量は必ず出ること。
    expect(slasherLungePx(0, FORCE_KB_PX, 60)).toBe(FORCE_KB_PX);
    expect(slasherLungePx(5, FORCE_KB_PX, 60)).toBe(FORCE_KB_PX);
    // Lv3最終段(50px押し)も同じ。
    expect(slasherLungePx(5, FORCE_KB_PX * FINAL_KB_MULT, 60)).toBe(FORCE_KB_PX * FINAL_KB_MULT);
  });

  it('★【不変条件】踏み込みは必ず「押した量」以上(相対距離が開かない)', () => {
    for (const meleeRange of [30, 45, 60, 80, 120]) {
      for (const pushedPx of [10, FORCE_KB_PX, FORCE_KB_PX * FINAL_KB_MULT]) {
        for (const dist of [0, 5, 20, meleeRange * 0.5, meleeRange]) {
          expect(slasherLungePx(dist, pushedPx, meleeRange))
            .toBeGreaterThanOrEqual(Math.min(pushedPx, SLASHER_LUNGE_MAX_PX) - 1e-9);
        }
      }
    }
  });

  it('射程の縁で当てた時は、押した量より深く詰めて内側へ入る', () => {
    // 射程60(着地距離54)、敵は50pxに居て25px押される → 75px → 75-54 = 21px…ではなく、
    // 「押した量25px」の方が大きいので25px。さらに縁(58px)なら 58+25-54 = 29px > 25px で29px。
    expect(slasherLungePx(50, FORCE_KB_PX, 60)).toBe(FORCE_KB_PX);
    expect(slasherLungePx(58, FORCE_KB_PX, 60)).toBeCloseTo(29, 6);
  });

  it('★【不変条件】踏み込んでも押す前より近づきすぎない', () => {
    // 踏み込み後の距離 <= 踏み込み前の距離。前へ出るが、敵を追い越したり潜り込んだりはしない。
    for (const meleeRange of [30, 60, 120]) {
      for (const pushedPx of [10, FORCE_KB_PX, FORCE_KB_PX * FINAL_KB_MULT]) {
        for (const dist of [0, 5, 20, meleeRange * 0.5, meleeRange]) {
          const distAfter = dist + pushedPx - slasherLungePx(dist, pushedPx, meleeRange);
          expect(distAfter).toBeLessThanOrEqual(dist + 1e-9);
          expect(distAfter).toBeGreaterThanOrEqual(-1e-9);
        }
      }
    }
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
    // 押していない=追う相手が動いていないので踏み込まない(v0.25.3400「KBしなかったら前進しない」)。
    expect(slasherLungePx(0, 0, 60)).toBe(0);
    expect(slasherLungePx(0, 0, 0)).toBe(0);
    expect(slasherLungePx(5, 0, 60)).toBe(0);
  });

  it('着地距離は射程の内側(境界ちょうどではない)', () => {
    expect(SLASHER_LUNGE_STANDOFF_FRAC).toBeLessThan(1);
    expect(SLASHER_LUNGE_STANDOFF_FRAC).toBeGreaterThan(0);
  });
});
