// ★社長裁定v0.25.3518「全ボスで、次の技は前の技をキャンセルしない。モーションも合わせて出来るまで
// 次は出ない」の**機械化(実走の網)**。
//
// 判定の定義そのものは moveCancelGuard.test.ts(純関数の単体)。ここは**実際にボスを回して**
// 状態の並びを食わせ、違反が1件も出ないことを固定する=新しい技を足した時にガードを書き忘れたら落ちる。
//
// 現時点の網の範囲(正直に明記する):
//  - **賞金首4種**(bounty-ranged/melee/balance/maiko): `runBountyTick` を直接回せるのでここで見る。
//  - **裏ボス・城ボス**: 状態機械が useGameLoop / gameStore の巨大ループの中にあり、ヘッドレスで
//    ボスを出して長時間回す土台が無い(playtestDriverはボスの湧きまで届かない)。**未カバー**。
//    → `moveCancelGuard` 自体は状態名の規約だけに依存するので、その土台が出来たら同じ観測器を
//      挿すだけで網が広がる(判定を書き直す必要はない)。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { runBountyTick, createBountyTickState } from './bountyTick';
import { createMoveCancelWatch } from './moveCancelGuard';
import type { Enemy, EnemyType } from '../types/game';

const START_GT = 60_000;

/** 1体を実際に回して、毎tickの bossState を観測器へ流す。 */
const runAndWatch = (
  type: EnemyType, offset: { x: number; y: number }, ticks: number, stepMs = 16,
): string[] => {
  const e = spawnEnemyAt(type, 50000, 50000, START_GT);
  e.dormant = false;
  e.homeX = e.x; e.homeY = e.y;
  e.aggroRange = 200;
  e.lastHit = START_GT;
  useGameStore.setState(s => ({
    enemies: [e],
    // HPを厚くして「倒れて観測が止まる」を防ぐ。プレイヤーは動かさない(技の並びだけを見る)。
    player: { ...s.player, x: e.x + offset.x, y: e.y + offset.y, health: 99999, maxHealth: 99999 },
  }));
  const st = createBountyTickState();
  const watch = createMoveCancelWatch();
  let gt = START_GT;
  for (let i = 0; i < ticks; i++) {
    gt += stepMs;
    useGameStore.setState({ gameTime: gt });
    const cur = useGameStore.getState().enemies.find(x => x.id === e.id) as Enemy | undefined;
    if (!cur) break;
    runBountyTick(cur, st, gt, stepMs / 1000, 1, gt);
    const after = useGameStore.getState().enemies.find(x => x.id === e.id);
    watch.observe(e.id, after?.bossState);
  }
  return watch.violations();
};

describe('★「次の技は前の技をキャンセルしない」= 賞金首4種の実走で違反ゼロ', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState({ gameTime: START_GT });
  });

  // 距離を変えて回す=技の選ばれ方(近距離の重み抽選/中距離/遠距離)を一通り踏む。
  const DISTANCES: { label: string; off: { x: number; y: number } }[] = [
    { label: '至近(押しのけ/三段突きの帯)', off: { x: 60, y: 0 } },
    { label: '中距離(三段突き/コンボの帯)', off: { x: 420, y: 0 } },
    { label: '遠距離(レーザー/引き撃ちの帯)', off: { x: 700, y: 0 } },
  ];

  for (const type of ['bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko'] as EnemyType[]) {
    for (const d of DISTANCES) {
      it(`${type} / ${d.label}: 30秒回して違反ゼロ`, () => {
        // 30秒 = 1875tick(16ms)。CD6秒級の技も数周し、近距離の重み抽選も何度も引かれる。
        expect(runAndWatch(type, d.off, 1875)).toEqual([]);
      });
    }
  }

  it('★網が効いていることの確認: わざと割り込ませた並びは検出される(空振りテストでない証明)', () => {
    const watch = createMoveCancelWatch();
    watch.observe('x', 'chase');
    watch.observe('x', 'br-push-windup');
    watch.observe('x', 'br-triple-windup'); // 溜め中に別の技が割り込んだ=違反
    expect(watch.violations()).toHaveLength(1);
  });

  it('乱数を近距離の両側へ固定しても違反は出ない(抽選のどちらを引いても規則は守られる)', () => {
    for (const r of [0.1, 0.9]) {
      const rnd = vi.spyOn(Math, 'random').mockReturnValue(r);
      try {
        expect(runAndWatch('bounty-ranged', { x: 60, y: 0 }, 900), `rand=${r}`).toEqual([]);
      } finally { rnd.mockRestore(); }
    }
  });
});
