// PACING_PUZZLE.md §6.38 B2b(持ち越し②): 賞金首の討伐(damageEnemyでHP0)でも、退場フェード時
// (bountyTick.clearBountyEscorts)と同じく取り巻き(bountyEscortId一致)を一緒に片付けることを固定する。
// 削除経路が2本(退場/討伐)に割れて片方だけ実装されると「討伐後に取り巻きだけ戦場に残る」実バグになる。
import { describe, it, expect } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';

describe('damageEnemy — 賞金首の討伐で取り巻き(bountyEscortId一致)も一緒に消える(§6.38 B2b)', () => {
  it('賞金首をHP0にすると、bountyEscortIdが一致する敵も同時に消える', () => {
    useGameStore.getState().resetGame('warrior');
    const gt = useGameStore.getState().gameTime;
    const bounty = spawnEnemyAt('bounty-ranged', 0, 0, gt);
    const escort1 = spawnEnemyAt('zombie', 50, 0, gt);
    escort1.bountyEscortId = bounty.id;
    const escort2 = spawnEnemyAt('zombie', -50, 0, gt);
    escort2.bountyEscortId = bounty.id;
    const bystander = spawnEnemyAt('zombie', 500, 500, gt); // 無関係の雑魚(取り巻きではない)
    useGameStore.setState({ enemies: [bounty, escort1, escort2, bystander] });

    useGameStore.getState().damageEnemy(bounty.id, 999999, false, false, false, 'other', 'player', null);

    const survivors = useGameStore.getState().enemies;
    expect(survivors.find(e => e.id === bounty.id)).toBeUndefined(); // 賞金首自身は消える(corpseEligible=false)
    expect(survivors.find(e => e.id === escort1.id)).toBeUndefined(); // 取り巻き1も一緒に消える
    expect(survivors.find(e => e.id === escort2.id)).toBeUndefined(); // 取り巻き2も一緒に消える
    expect(survivors.find(e => e.id === bystander.id)).toBeDefined(); // 無関係の雑魚は残る
  });

  it('取り巻き自身を倒しても賞金首本体や他の取り巻きは消えない(片方向の掃除であることの確認)', () => {
    useGameStore.getState().resetGame('warrior');
    const gt = useGameStore.getState().gameTime;
    const bounty = spawnEnemyAt('bounty-ranged', 0, 0, gt);
    const escort1 = spawnEnemyAt('zombie', 50, 0, gt);
    escort1.bountyEscortId = bounty.id;
    const escort2 = spawnEnemyAt('zombie', -50, 0, gt);
    escort2.bountyEscortId = bounty.id;
    useGameStore.setState({ enemies: [bounty, escort1, escort2] });

    useGameStore.getState().damageEnemy(escort1.id, 999999, false, false, false, 'other', 'player', null);

    // 取り巻き(zombie)はcorpseEligible=trueのため即消滅ではなく死体化するが、ここでの主眼は
    // 「取り巻き1体の死亡が賞金首本体や他の取り巻きを巻き込まない」こと。
    const survivors = useGameStore.getState().enemies;
    expect(survivors.find(e => e.id === bounty.id)).toBeDefined();
    const survivedEscort2 = survivors.find(e => e.id === escort2.id);
    expect(survivedEscort2).toBeDefined();
    expect(survivedEscort2?.health).toBeGreaterThan(0); // 巻き込まれて死体化していない
  });

  it('賞金首以外(即除去される非corpseEligible敵=ボス)の討伐ではbountyEscortId一致条件が誤爆しない', () => {
    // corpseEligible=false(=filter経路を通る)の非賞金首として裏ボス(mimir)を使う。
    // isBountyType(enemy.type)===falseなので追加条件は評価されず、他の敵に影響しないことを確認する。
    useGameStore.getState().resetGame('warrior');
    const gt = useGameStore.getState().gameTime;
    const boss = spawnEnemyAt('mimir', 0, 0, gt);
    const other = spawnEnemyAt('zombie', 500, 500, gt);
    other.bountyEscortId = 'unrelated-id'; // たまたま同名フィールドを持つだけの無関係な敵
    useGameStore.setState({ enemies: [boss, other] });

    useGameStore.getState().damageEnemy(boss.id, 999999, false, false, false, 'other', 'player', null);

    const survivors = useGameStore.getState().enemies;
    expect(survivors.find(e => e.id === boss.id)).toBeUndefined(); // ボス自身は即除去(既存挙動)
    expect(survivors.find(e => e.id === other.id)).toBeDefined(); // 無関係な敵は残る
  });
});
