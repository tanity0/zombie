// research/TELEGRAPH_FIXES.md §3(E11・E12・§6-3 2・E05b): 予告を描く寸法の出どころ=判定の出どころ。
// 判定側の表の欄を一時的に動かし、描く側の値が**同じだけ**動くことで「同じ欄を読んでいる」を固定する
// (既定値がたまたま同じ別の表を読んでいても、ここで落ちる)。
import { describe, it, expect } from 'vitest';
import { TELEGRAPH_DRAW_SOURCES as S } from './telegraphDrawSources';
import {
  ANGEL_RAFI_TUNING as RF_T, ANGEL_URI_TUNING as UR_T, ANGEL_SURIEL_TUNING as SR_T,
  ANGEL_JIBRIL_TUNING as JB_T,
} from './angelScript';
import { HIDDEN_JORMUNGAND_TUNING as HB_JO, HIDDEN_THOR_TUNING as HB_TH } from './hiddenBossScript';

type Holder = Record<string, number>;
const ROWS: readonly { name: string; draw: () => number; hit: Holder; key: string }[] = [
  { name: 'E11 ウリ 振り下ろし', draw: S.uriDownslashHalfWidth, hit: UR_T.downslash as unknown as Holder, key: 'halfWidth' },
  { name: 'E12 ウリ 踏み込み突き', draw: S.uriThrustHalfWidth, hit: UR_T.thrust as unknown as Holder, key: 'halfWidth' },
  { name: 'E10 ウリ 大薙ぎ', draw: S.uriSweepHalfWidth, hit: UR_T.sweep as unknown as Holder, key: 'halfWidth' },
  { name: 'E09 ラフィ 薙ぎ', draw: S.rafiSweepHalfWidth, hit: RF_T.sweep as unknown as Holder, key: 'halfWidth' },
  { name: 'E15 スリィエル 薙ぎ', draw: S.surielSweepHalfWidth, hit: SR_T.sweep as unknown as Holder, key: 'halfWidth' },
  { name: 'C05 ヨルムンガンド うねり', draw: S.jormCoilHalfWidth, hit: HB_JO.coil as unknown as Holder, key: 'halfWidth' },
  { name: 'E05b ジブリル ランタン火', draw: S.jibrilFireRadius, hit: JB_T.fire as unknown as Holder, key: 'radius' },
];

describe('予告を描く寸法=判定の寸法(出どころが同じ欄)', () => {
  for (const r of ROWS) {
    it(`${r.name}: 既定値で一致し、判定の欄を動かすと描く値も同じだけ動く`, () => {
      const orig = r.hit[r.key];
      expect(r.draw()).toBe(orig);
      try {
        r.hit[r.key] = orig + 17;
        expect(r.draw()).toBe(orig + 17);
      } finally {
        r.hit[r.key] = orig;
      }
    });
  }

  it('E11: ウリの振り下ろしの予告はトールの突き(HB_TH.tsuki)を読まない', () => {
    const orig = HB_TH.tsuki.halfWidth;
    try {
      (HB_TH.tsuki as unknown as Holder).halfWidth = orig + 9;
      expect(S.uriDownslashHalfWidth()).toBe(UR_T.downslash.halfWidth);
      expect(S.uriThrustHalfWidth()).toBe(UR_T.thrust.halfWidth);
    } finally {
      (HB_TH.tsuki as unknown as Holder).halfWidth = orig;
    }
  });
});
