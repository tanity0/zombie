// 憲法テスト(横断不変条件)。v0.25.2612・社長指示「そして二度と起きない学習」。
//
// 事故: ミーミルの「群体の噛みつき」が**本体の中心**に半径92の円を出していた。ミーミルの当たり判定は
// 248×138(半幅124)なので、**円が体の中に収まり、左右から挑む限り一度も当たらなかった**。
// 原因は「体の大きさを見ずに他所(城ボス系=60×60)の値を流用した」こと。
//
// ここで機械化する不変条件:
//   > **足元の円AoE(本体の中心に出る円)は、そのボスの当たり判定の外へ届かなければならない。**
//
// 新しく足元の円AoEを足す時は BODY_CENTERED_AOES に登録する。登録すれば以後この検算に守られる。
import { describe, it, expect } from 'vitest';
import { MIMIR_BITE_RADIUS, MIN_BODY_AOE_REACH_PX, bodyAoeReachPx, bodyAoeReaches, type BodyCenteredAoe } from './bodyCenteredAoe';
import { ENEMY_STATS } from './enemyUtils';
import { SURIEL_RINGSPIN_RADIUS } from './angelBossTick';
import { GIANT_STOMP_RADIUS } from '../store/gameStore';

/**
 * 現存する「本体の中心に出る円AoE」の全数(v0.25.2612時点)。
 * ※着地点に出る円(トール/ラフィのジャンプ)と、本体から相手へ伸びるカプセル(ヨルムンガンドの薙ぎ・
 *   アイドルの殴り)は**発生点が体の外**なのでこの罠に嵌まらない=対象外。
 */
const BODY_CENTERED_AOES: readonly BodyCenteredAoe[] = [
  { label: 'ミーミル「群体の噛みつき」(bite)', owner: 'mimir', radius: MIMIR_BITE_RADIUS },
  { label: '城ボス「踏み鳴らし」(g-stomp)', owner: 'giantbat', radius: GIANT_STOMP_RADIUS },
  { label: 'スリィエル「環の回転」(ring-spin)', owner: 'suriel', radius: SURIEL_RINGSPIN_RADIUS },
];

describe('憲法: 足元の円AoEは体の外へ届く', () => {
  it.each(BODY_CENTERED_AOES)('$label は体の外へ届く', ({ owner, radius }) => {
    const reach = bodyAoeReachPx(owner, radius);
    // 失敗時に「何px足りないか」が出るようにする(直す時に考えなくて済む)。
    expect(
      reach,
      `体の外へ ${reach.toFixed(0)}px しか届いていない(必要 ${MIN_BODY_AOE_REACH_PX}px 以上）。`
      + ` 判定半径 ${radius} に対し ${owner} の当たり判定は`
      + ` ${ENEMY_STATS[owner].width}×${ENEMY_STATS[owner].height}(基準の半径 ${Math.max(ENEMY_STATS[owner].width, ENEMY_STATS[owner].height) / 2}）。`,
    ).toBeGreaterThanOrEqual(MIN_BODY_AOE_REACH_PX);
  });

  // 事故そのものの再現(直したことの証明・回帰の見張り)。
  it('ミーミルの牙: 旧値92は体の中に収まっていた(=当たらない)', () => {
    expect(bodyAoeReachPx('mimir', 92)).toBeLessThan(0); // 124 - 92 = -32px
    expect(bodyAoeReaches('mimir', 92)).toBe(false);
  });

  it('ミーミルの牙: 現行値は城ボスと同程度の体外リーチを持つ', () => {
    const mimir = bodyAoeReachPx('mimir', MIMIR_BITE_RADIUS);
    const giant = bodyAoeReachPx('giantbat', GIANT_STOMP_RADIUS);
    expect(mimir).toBeGreaterThan(0);
    // 「城ボスと同じ理屈で揃えた」ことを固定する(±30pxの幅は実機調整の余地)。
    expect(Math.abs(mimir - giant)).toBeLessThanOrEqual(30);
  });
});

describe('bodyAoeReachPx: 純関数', () => {
  it('体の長い方の半分を基準にする(どの向きから挑んでも届くことを保証するため)', () => {
    // mimir 248×138 → 基準は 248/2 = 124(高さ側の69ではない)。
    expect(bodyAoeReachPx('mimir', 124)).toBe(0);
    expect(bodyAoeReachPx('mimir', 224)).toBe(100);
  });

  it('未知の型は検算対象外(半径をそのまま返す)', () => {
    expect(bodyAoeReachPx('__nope__' as never, 50)).toBe(50);
  });

  it('しきい値ちょうどは合格側', () => {
    expect(bodyAoeReaches('giantbat', 30 + MIN_BODY_AOE_REACH_PX)).toBe(true);
    expect(bodyAoeReaches('giantbat', 30 + MIN_BODY_AOE_REACH_PX - 1)).toBe(false);
  });
});
