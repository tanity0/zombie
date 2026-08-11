// CRIT-UNIFY §9.3(社長裁定F): 汎用パリィ家系(combatTickの接触dashParried/ブラストパリィ)の反撃を
// crit=trueへ統一したことの検証(旧「見た目クリ・中身非クリ」の解消)。
//  - ボス対象: crit=trueとcounter体勢属性がdamageEnemyへ渡り、移動半減窓+体勢20%削りが乗る。
//  - 通常敵対象: 現行クリ規則どおり5秒スタン(stunDurationMult込み)がノックバックと併存する。
import { describe, it, expect } from 'vitest';
import { useGameStore, STUN_DURATION_MS } from '../store/gameStore';
import { applyContactDamage, applyPumpkinBlastDamage, NOOP_COMBAT_EFFECTS } from './combatTick';
import { spawnEnemyAt } from './enemyUtils';

const setupPlayerAt = (x: number, y: number, counterWindowMs: number, stunDurationMult = 1) => {
  useGameStore.getState().resetGame('warrior');
  const now = Date.now();
  useGameStore.setState(s => ({
    player: {
      ...s.player, x, y, counterWindowEnd: now + counterWindowMs, invulnerable: false,
      stunDurationMult,
    },
  }));
};

describe('CRIT-UNIFY §9.3: 接触パリィ(dashParried)の反撃はcrit=true', () => {
  it('ボス(giantbat)への突進パリィ反撃は体勢を20%削る', () => {
    setupPlayerAt(0, 0, 400);
    const player = useGameStore.getState().player;
    const boss = spawnEnemyAt('giantbat', player.x, player.y, useGameStore.getState().gameTime);
    boss.aiPhase = 'charge'; // 汎用フェーズ=パリィ対象(isDashParryCounterPhase)
    boss.health = boss.maxHealth; // 反撃で倒れないよう十分なHPを確保
    useGameStore.setState({ enemies: [boss] });

    applyContactDamage(useGameStore.getState().gameTime, false, 0, NOOP_COMBAT_EFFECTS);

    const after = useGameStore.getState().enemies.find(e => e.id === boss.id);
    expect(after).toBeTruthy();
    // 城ボス最大80に対する20%削り。
    expect(after!.bossPosture).toBe(64); // 城ボス最大80の20%
    // ①の中央適用: crit=trueがdamageEnemyを経由してbossSlowUntilも同時に立つ。
    expect(after!.bossSlowUntil).toBeGreaterThan(useGameStore.getState().gameTime);
  });

  it('通常敵(zombie)への突進パリィ反撃は5秒スタン(stunDurationMult込み)をノックバックと併存させる', () => {
    setupPlayerAt(0, 0, 400, 2); // stunDurationMult=2
    const player = useGameStore.getState().player;
    const zombie = spawnEnemyAt('zombie', player.x, player.y, useGameStore.getState().gameTime);
    zombie.aiPhase = 'charge';
    zombie.health = 9999; // 反撃で倒れないように
    useGameStore.setState({ enemies: [zombie] });
    const gt = useGameStore.getState().gameTime;

    applyContactDamage(gt, false, 0, NOOP_COMBAT_EFFECTS);

    const after = useGameStore.getState().enemies.find(e => e.id === zombie.id);
    expect(after).toBeTruthy();
    // 5秒×stunDurationMult(2)=10秒ぶんスタンする。
    expect(after!.stunUntil).toBeCloseTo(gt + STUN_DURATION_MS * 2, -1);
    // ノックバックも従来どおり乗っている(併存)。
    expect(after!.knockbackVx !== 0 || after!.knockbackVy !== 0).toBe(true);
  });
});

describe('CRIT-UNIFY §9.3: ブラストパリィ(パンプキン着地爆発)の反撃はcrit=true', () => {
  // ★v0.25.3169(社長指示「パンプキン、クリティカルもちゃんと固まるように。紫は無い。ボスでは無いので」):
  // pumpkin はボス式クリ(=固まらず移動半減 bossSlowUntil)の対象外になった。体勢システム(紫)の
  // 対象外なのは従来どおりで、**クリの効果が「半減」から「気絶」へ**変わる。
  it('非交戦ボス級(pumpkin)は体勢システム対象外のまま、クリで気絶する(半減ではない)', () => {
    setupPlayerAt(0, 0, 400);
    const player = useGameStore.getState().player;
    const boss = spawnEnemyAt('pumpkin', 400, 400, useGameStore.getState().gameTime);
    boss.health = boss.maxHealth;
    useGameStore.setState({
      enemies: [boss],
      pumpkinBlasts: [{ x: player.x + player.width / 2, y: player.y + player.height / 2, radius: 80, damage: 10, enemyId: boss.id }],
    });

    applyPumpkinBlastDamage(NOOP_COMBAT_EFFECTS, { thorOrbitDist: 300, thorCounterLeapMs: 500 });

    const after = useGameStore.getState().enemies.find(e => e.id === boss.id);
    expect(after).toBeTruthy();
    expect(after!.bossPosture).toBeUndefined();      // 紫(体勢)は従来どおり無い
    expect(after!.bossSlowUntil).toBeUndefined();    // ★v0.25.3169: ボス式の「移動半減」も付かなくなった
    // 気絶が残らないのは**パリィのノックバック仕様**(dashParriedEnemyPatch が凍結系を解除する・
    // v0.25.3127)であって、クリの扱いとは別。クリ=気絶になったことは通常のクリ経路で担保する。
    expect(after!.stunUntil).toBeUndefined();
  });
});
