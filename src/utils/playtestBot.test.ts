import { describe, it, expect } from 'vitest';
import { decideBotInput, wanderDirForSeed, BOT_PERSONAS } from './playtestBot';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';

const freshPlayer = () => {
  useGameStore.getState().resetGame('warrior');
  return useGameStore.getState().player;
};

describe('decideBotInput', () => {
  it('lists exactly the 5 spec\'d personas', () => {
    expect(BOT_PERSONAS).toEqual(['standard', 'kiter', 'stationary', 'boar', 'wanderer']);
  });

  it('wanderer ignores enemies and always returns its seeded fixed direction, never melees', () => {
    const player = freshPlayer();
    const enemy = spawnEnemyAt('zombie', player.x + 10, player.y, 0);
    const d0 = decideBotInput('wanderer', player, [enemy], 0, 0, 0);
    const d1 = decideBotInput('wanderer', player, [enemy], 0, 500, 0);
    expect(d0.input).toEqual(wanderDirForSeed(0));
    expect(d1.input).toEqual(wanderDirForSeed(0)); // same seed → same direction regardless of tick
    expect(d0.wantsMelee).toBe(false);
    expect(d1.wantsMelee).toBe(false);
  });

  it('stationary never moves but melees an enemy within engage range', () => {
    const player = freshPlayer();
    const close = spawnEnemyAt('zombie', player.x + player.width / 2 + 20, player.y + player.height / 2, 0);
    const d = decideBotInput('stationary', player, [close], 0, 0, 0);
    expect(d.input).toEqual({ up: false, down: false, left: false, right: false });
    expect(d.wantsMelee).toBe(true);
  });

  it('stationary does not melee when nothing is in range', () => {
    const player = freshPlayer();
    const far = spawnEnemyAt('zombie', player.x + 900, player.y + 900, 0);
    const d = decideBotInput('stationary', player, [far], 0, 0, 0);
    expect(d.wantsMelee).toBe(false);
  });

  it('kiter always moves away from the nearest enemy and never melees', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const enemy = spawnEnemyAt('zombie', pcx + 50, pcy, 0);
    const d = decideBotInput('kiter', player, [enemy], 0, 0, 0);
    expect(d.input.left).toBe(true);  // enemy is to the right → kite left
    expect(d.input.right).toBe(false);
    expect(d.wantsMelee).toBe(false);
  });

  it('boar always rushes the nearest enemy and melees once in range', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const far = spawnEnemyAt('zombie', pcx + 500, pcy, 0);
    const dFar = decideBotInput('boar', player, [far], 0, 0, 0);
    expect(dFar.input.right).toBe(true); // approaches
    expect(dFar.wantsMelee).toBe(false); // still out of melee range

    const close = spawnEnemyAt('zombie', pcx + 20, pcy, 0);
    const dClose = decideBotInput('boar', player, [close], 0, 0, 0);
    expect(dClose.wantsMelee).toBe(true);
  });

  it('standard retreats when surrounded by >=3 nearby enemies instead of approaching', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const ring = [
      spawnEnemyAt('zombie', pcx + 60, pcy, 0),
      spawnEnemyAt('zombie', pcx - 60, pcy, 0),
      spawnEnemyAt('zombie', pcx, pcy + 60, 0),
    ];
    const d = decideBotInput('standard', player, ring, 0, 0, 0);
    // nearest target is to the right (first in list ties by insertion) → retreating means moving left
    expect(d.input.left || d.input.up || d.input.down).toBe(true);
  });

  it('standard prioritizes a stunned enemy over a closer non-stunned one for melee targeting', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const closeHealthy = spawnEnemyAt('zombie', pcx + 30, pcy, 0);
    const fartherStunned = { ...spawnEnemyAt('zombie', pcx + 200, pcy, 0), stunUntil: 5000 };
    const d = decideBotInput('standard', player, [closeHealthy, fartherStunned], 1000, 0, 0);
    // stunned target is farther than melee range → bot should approach (not stand still on the closer one)
    expect(d.input.right).toBe(true);
    expect(d.wantsMelee).toBe(false);
  });

  it('standard does nothing when no enemies are present, but still cycles weapon periodically', () => {
    const player = freshPlayer();
    const d1 = decideBotInput('standard', player, [], 0, 1, 0);
    expect(d1.input).toEqual({ up: false, down: false, left: false, right: false });
    expect(d1.wantsWeaponSwitch).toBe(false);
    const d1200 = decideBotInput('standard', player, [], 0, 1200, 0);
    expect(d1200.wantsWeaponSwitch).toBe(true);
  });
});
