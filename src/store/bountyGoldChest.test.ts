// PACING_PUZZLE.md §6.38 B3(賞金首の金箱)の受け入れ条件を固定するテスト。
// ①賞金首討伐→金箱がプレイアブル帯に落ちる ②開封で中身が実効ランク準拠。
import { describe, it, expect } from 'vitest';
import {
  useGameStore, rollBountyChestReward, bountyChestValueMult, BOUNTY_CHEST_TREASURE_COUNT,
} from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { bountyEffectiveValueMult } from '../utils/bountyTick';
import { LAB_CORRIDOR_Y_LIMIT_PX } from '../world/labWalls';

describe('damageEnemy/grantMeleeKillRewards — 賞金首討伐で金箱(bounty-chest)が1個ドロップする(§6.38 B3①)', () => {
  it('銃/接触/爆発キル経路(damageEnemy)で金箱が1個落ちる', () => {
    useGameStore.getState().resetGame('warrior');
    const gt = useGameStore.getState().gameTime;
    const bounty = spawnEnemyAt('bounty-ranged', 300, 300, gt);
    bounty.health = 1;
    useGameStore.setState({ enemies: [bounty] });

    useGameStore.getState().damageEnemy(bounty.id, 999999, false, false, false, 'other', 'player', null);

    const chests = useGameStore.getState().pickups.filter(p => p.type === 'bounty-chest');
    expect(chests.length).toBe(1);
    expect(chests[0].id).toBe(`pickup-bounty-chest-${bounty.id}`);
  });

  it('近接キル経路(triggerCounterのフィニッシュ)で金箱が1個落ちる', () => {
    useGameStore.getState().resetGame('warrior');
    const gt = useGameStore.getState().gameTime;
    const player = useGameStore.getState().player;
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const bounty = spawnEnemyAt('bounty-melee', pcx + 4, pcy, gt);
    bounty.x = pcx - bounty.width / 2;
    bounty.y = pcy - bounty.height / 2;
    bounty.health = 1;
    useGameStore.setState({ enemies: [bounty] });

    useGameStore.getState().triggerCounter();

    const chests = useGameStore.getState().pickups.filter(p => p.type === 'bounty-chest');
    expect(chests.length).toBe(1);
  });

  it('落ちた金箱はclampRectToPlayableAreaを通る(プレイアブル帯の外には落ちない)', () => {
    useGameStore.getState().resetGame('warrior');
    // ステージ2(研究所)の帯=プレイヤー中心|Y|<=LAB_CORRIDOR_Y_LIMIT_PXへ寄せる制約を有効化し、
    // 帯の外(はるか下)で賞金首を倒す。金箱がaddPickup(=クランプ込み)を経由していれば
    // 帯の内側へ寄せられているはず(経由していなければ帯の外の生の座標のまま残る)。
    useGameStore.setState({ stageTheme: 'lab' });
    const gt = useGameStore.getState().gameTime;
    const farY = LAB_CORRIDOR_Y_LIMIT_PX + 5000;
    const bounty = spawnEnemyAt('bounty-ranged', 0, farY, gt);
    bounty.health = 1;
    useGameStore.setState({ enemies: [bounty] });

    useGameStore.getState().damageEnemy(bounty.id, 999999, false, false, false, 'other', 'player', null);

    const chest = useGameStore.getState().pickups.find(p => p.type === 'bounty-chest');
    expect(chest).toBeDefined();
    // クランプ後は中心yが±LAB_CORRIDOR_Y_LIMIT_PXの範囲(pickupの当たりサイズぶんの余裕を見て緩め)。
    expect(Math.abs(chest!.y)).toBeLessThan(farY);
    expect(Math.abs(chest!.y)).toBeLessThanOrEqual(LAB_CORRIDOR_Y_LIMIT_PX + 32);
  });
});

describe('collectPickup(bounty-chest) — 開封の中身(§6.38 B3②中身が実効ランク準拠)', () => {
  it('開封するとトレジャー2個+スクラップが生成され、武器(weapon-drop/weapon-crate)は出ない', () => {
    useGameStore.getState().resetGame('warrior');
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState({
      pickups: [{ id: 'pickup-bounty-chest-test', x: 100, y: 100, type: 'bounty-chest', value: 0 }],
      gameTime: gt,
    });

    useGameStore.getState().collectPickup('pickup-bounty-chest-test');

    const after = useGameStore.getState().pickups;
    const treasures = after.filter(p => p.type === 'treasure');
    const straps = after.filter(p => p.type === 'strap');
    const weapons = after.filter(p => p.type === 'weapon-drop' || p.type === 'weapon-crate');
    expect(treasures.length).toBe(BOUNTY_CHEST_TREASURE_COUNT);
    expect(straps.length).toBeGreaterThan(0);
    expect(weapons.length).toBe(0); // 武器は入れない(§3・v2 F)
    // トレジャーには金箱由来の位置(pickup.x/y近辺=addPickupの散らばり込み)と妥当なvariant(1..6)が付く。
    for (const t of treasures) {
      expect(Math.abs(t.x - 100)).toBeLessThan(200);
      expect(Math.abs(t.y - 100)).toBeLessThan(200);
      expect(t.variant).toBeGreaterThanOrEqual(1);
      expect(t.variant).toBeLessThanOrEqual(6);
      expect(t.value).toBeGreaterThanOrEqual(1);
    }
  });

  it('中身の価値は実効エリアrank(bountyChestValueMult)に比例してスケールする(実効倍率が高いほど高価値)', () => {
    // danger表の素の価値レンジは3〜6(weightedTreasureValue([[3,40],[4,30],[5,20],[6,10]]))。
    // mult=1なら値はそのまま3〜6。mult=3なら9〜18(round後)に収まるはず(統計的に確認)。
    const N = 300;
    const lowValues: number[] = [];
    const highValues: number[] = [];
    for (let i = 0; i < N; i++) {
      lowValues.push(...rollBountyChestReward(0, 0).treasureValues); // area0・gameTime0=mult最小域
      highValues.push(...rollBountyChestReward(4, 999_999_999).treasureValues); // 深部エリア+時間経過=mult最大域
    }
    const lowMax = Math.max(...lowValues);
    const highMin = Math.min(...highValues);
    // 実効倍率が上がるほど価値が底上げされる=高難易度側の最小値が低難易度側の最大値を下回らない
    // (完全な統計保証ではなく、明確な倍率差が付いていることの目安として緩めに確認)。
    expect(highMin).toBeGreaterThanOrEqual(lowMax);
  });

  it('bountyChestValueMultはbountyTick.bountyEffectiveValueMult(HPスケールと同じ式)と一致し続ける', () => {
    // 循環import回避のためgameStore.ts側に式を複製している(コメント参照)。ドリフト検知用の固定テスト。
    for (const [area, gt] of [[0, 0], [1, 60_000], [2, 240_000], [3, 500_000], [4, 999_999]] as const) {
      expect(bountyChestValueMult(area, gt)).toBeCloseTo(bountyEffectiveValueMult(area, gt), 10);
    }
  });
});
