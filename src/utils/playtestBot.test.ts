import { describe, it, expect } from 'vitest';
import { decideBotInput, wanderDirForSeed, pickupSeekInput, BOT_PERSONAS,
  adjustBotForMines, MINE_AVOID_RADIUS, MINE_SMASH_DIST } from './playtestBot';
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

  it('kiter holds in the gun-range band and approaches when the target is out of range (M26 Step1)', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    // range=200 指定: バンド=[110, 180]。中(150)=静止 / 外(400)=接近 / 近(50)=退避。
    const mid = spawnEnemyAt('zombie', pcx + 150 - 15, pcy - 15, 0); // 中心距離≈150
    expect(decideBotInput('kiter', player, [mid], 0, 0, 0, undefined, 200).input)
      .toEqual({ up: false, down: false, left: false, right: false });
    const far = spawnEnemyAt('zombie', pcx + 400 - 15, pcy - 15, 0);
    expect(decideBotInput('kiter', player, [far], 0, 0, 0, undefined, 200).input.right).toBe(true);
    const near = spawnEnemyAt('zombie', pcx + 50 - 15, pcy - 15, 0);
    expect(decideBotInput('kiter', player, [near], 0, 0, 0, undefined, 200).input.left).toBe(true);
  });
});

describe('pickupSeekInput (M26 Step1: 手空き時の拾い)', () => {
  const IDLE = { up: false, down: false, left: false, right: false };
  it('入力が空いていて近くにピックアップがあれば、そこへ向かう', () => {
    const input = pickupSeekInput('kiter', IDLE, 100, 100, [{ x: 100 + 92, y: 100 - 8 }]); // 中心=+100,右
    expect(input.right).toBe(true);
  });
  it('本来の入力がある時は上書きしない', () => {
    const moving = { up: true, down: false, left: false, right: false };
    expect(pickupSeekInput('kiter', moving, 100, 100, [{ x: 192, y: 92 }])).toBe(moving);
  });
  it('stationary(棒立ちが仕様)は拾いに行かない', () => {
    expect(pickupSeekInput('stationary', IDLE, 100, 100, [{ x: 192, y: 92 }])).toBe(IDLE);
  });
  it('maxDistより遠いピックアップは無視する', () => {
    expect(pickupSeekInput('kiter', IDLE, 0, 0, [{ x: 5000, y: 5000 }])).toEqual(IDLE);
  });
});

// M34(§6.11): 緑卵(地雷)を避ける/叩く(ボット入力のみの後段補正)。
describe('adjustBotForMines (M34: 緑卵を避ける/叩く)', () => {
  const RIGHT = { up: false, down: false, left: false, right: true };
  const STILL = { up: false, down: false, left: false, right: false };

  it('卵が無ければ入力もwantsMeleeも不変(同一参照)', () => {
    const r = adjustBotForMines(RIGHT, false, 0, 0, []);
    expect(r.input).toBe(RIGHT);
    expect(r.wantsMelee).toBe(false);
  });

  it('叩く: 最寄りの卵がMINE_SMASH_DIST(60)以内ならwantsMelee=true・移動入力は不変(叩く優先)', () => {
    const r = adjustBotForMines(RIGHT, false, 0, 0, [{ footX: 50, footY: 0 }]);
    expect(r.wantsMelee).toBe(true);
    expect(r.input).toBe(RIGHT); // 反発合成はしない(叩ける距離なら叩く)
    expect(MINE_SMASH_DIST).toBe(60);
  });

  it('避ける: 前方(進行方向)の卵は反発で進路が曲がる(右進行+右前方の卵→上下成分が付く)', () => {
    // 卵は右65px・SMASH(60)の外・AVOID(70)の内。y をわずかに下へずらし反発が上へ出るように。
    const r = adjustBotForMines(RIGHT, false, 0, 0, [{ footX: 65, footY: 6 }]);
    expect(r.wantsMelee).toBe(false);
    expect(r.input).not.toEqual(RIGHT); // 直進のままではない=曲がった
    expect(r.input.up).toBe(true);      // 卵の下側(footY=+6)を避けて上へ逸れる
    expect(MINE_AVOID_RADIUS).toBe(70);
  });

  it('後方の卵は避けない(既に離れる向き=蛇行しない)', () => {
    const r = adjustBotForMines(RIGHT, false, 0, 0, [{ footX: -65, footY: 0 }]);
    expect(r.input).toBe(RIGHT);
    expect(r.wantsMelee).toBe(false);
  });

  it('静止中(移動入力なし)は動かさない=stationary/バンド内静止のペルソナ判断を尊重(smash距離外)', () => {
    const r = adjustBotForMines(STILL, false, 0, 0, [{ footX: 65, footY: 0 }]);
    expect(r.input).toBe(STILL);
    expect(r.wantsMelee).toBe(false);
  });

  it('真正面の卵でも決定的に逸れる(cross=0は右側扱い→上へ45°)', () => {
    const r = adjustBotForMines(RIGHT, false, 0, 0, [{ footX: 62, footY: 0 }]);
    expect(r.wantsMelee).toBe(false);
    expect(r.input.up).toBe(true);    // 上へ逸れる
    expect(r.input.right).toBe(true); // 前進成分は保つ(45°)
  });

  it('卵が進行の左上側なら下へ逸れる(反対側ステア)', () => {
    const r = adjustBotForMines(RIGHT, false, 0, 0, [{ footX: 62, footY: -10 }]);
    expect(r.input.down).toBe(true);
    expect(r.input.right).toBe(true);
  });

  it('wantsMeleeが元からtrueなら維持される(敵への近接判断を消さない)', () => {
    const r = adjustBotForMines(RIGHT, true, 0, 0, [{ footX: 200, footY: 200 }]);
    expect(r.wantsMelee).toBe(true);
  });
});
