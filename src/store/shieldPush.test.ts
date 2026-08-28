// B6(盾押し機構・research/AI_HUMANIZE.md §6・裁定済み#8)の配線テスト。
// 純関数(resolveAabb+clampRectToPlayableArea)自体の不変条件は src/world/shieldPush.test.ts が
// 固定するので、ここでは movePlayer 側の**配線**(所有者ゲート・接触判定・実効変位の受け渡し)を見る。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, PLAYER_HITBOX } from './gameStore';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Projectile, Enemy } from '../types/game';

const DT = 1 / 60;
const ORIGIN = 50_000;

const baseShield = (patch: Partial<Projectile> = {}): Projectile => ({
  id: 'proj-shield-test',
  x: ORIGIN + PLAYER_HITBOX, // プレイヤーの右隣(接触)に置く
  y: ORIGIN,
  width: 40,
  height: 20,
  speed: 0,
  damage: 0,
  direction: { x: 1, y: 0 },
  weaponType: 'shield',
  weaponKey: 'sub-shield',
  duration: 5000,
  createdAt: Date.now(),
  passthrough: false,
  hitEnemies: [],
  hostile: false,
  reflected: false,
  shieldHp: 30,
  shieldMaxHp: 30,
  shieldOwnerKind: 'player',
  shieldOwnerId: null,
  ...patch,
});

const placePlayer = () => {
  useGameStore.setState(s => ({
    player: {
      ...s.player, x: ORIGIN, y: ORIGIN, vx: 0, vy: 0,
      speedRampSustainMs: 0, speedRampDirX: 0, speedRampDirY: 0,
    },
    farBackdrop: '', stageTheme: 'forest', indoorMode: false,
    corridorMode: false, corridorRunInActive: false, m0AdvanceLimitX: null,
  }));
};

describe('★B6 盾押し(movePlayerの配線)', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
    placePlayer();
  });

  it('④所有者(プレイヤー)が触れたまま動くと、自分の盾が同じ実効変位ぶん動く', () => {
    useGameStore.setState({ projectiles: [baseShield()] });
    useGameStore.getState().movePlayer({ up: false, down: false, left: false, right: true }, DT);
    const player = useGameStore.getState().player;
    const shield = useGameStore.getState().projectiles.find(p => p.id === 'proj-shield-test')!;
    const playerDx = player.x - ORIGIN;
    expect(playerDx).toBeGreaterThan(0); // 実際に右へ進んだこと(前提の健全性)
    expect(shield.x - (ORIGIN + PLAYER_HITBOX)).toBeCloseTo(playerDx, 5); // 同じ実効変位
    expect(shield.y).toBeCloseTo(ORIGIN); // 直交方向は動かない
  });

  it('④所有者以外(守護霊が置いた盾)には触れても押せない', () => {
    useGameStore.setState({ projectiles: [baseShield({ id: 'proj-shield-ghost', shieldOwnerKind: 'ghost-ally', shieldOwnerId: 'ghost-1' })] });
    useGameStore.getState().movePlayer({ up: false, down: false, left: false, right: true }, DT);
    const shield = useGameStore.getState().projectiles.find(p => p.id === 'proj-shield-ghost')!;
    expect(shield.x).toBe(ORIGIN + PLAYER_HITBOX); // 1px も動かない
    expect(shield.y).toBe(ORIGIN);
  });

  it('④所有者以外(幻影が置いた盾)には触れても押せない', () => {
    useGameStore.setState({ projectiles: [baseShield({ id: 'proj-shield-phantom', shieldOwnerKind: 'phantom', shieldOwnerId: 'gp-1', hostile: true })] });
    useGameStore.getState().movePlayer({ up: false, down: false, left: false, right: true }, DT);
    const shield = useGameStore.getState().projectiles.find(p => p.id === 'proj-shield-phantom')!;
    expect(shield.x).toBe(ORIGIN + PLAYER_HITBOX);
  });

  it('触れていない盾は動かない(接触していない = 押されない)', () => {
    useGameStore.setState({ projectiles: [baseShield({ x: ORIGIN + 5000, y: ORIGIN + 5000 })] });
    useGameStore.getState().movePlayer({ up: false, down: false, left: false, right: true }, DT);
    const shield = useGameStore.getState().projectiles.find(p => p.id === 'proj-shield-test')!;
    expect(shield.x).toBe(ORIGIN + 5000);
    expect(shield.y).toBe(ORIGIN + 5000);
  });

  it('③無入力(押し操作をしない)なら盾は現行どおり動かない', () => {
    useGameStore.setState({ projectiles: [baseShield()] });
    useGameStore.getState().movePlayer({ up: false, down: false, left: false, right: false }, DT);
    const shield = useGameStore.getState().projectiles.find(p => p.id === 'proj-shield-test')!;
    expect(shield.x).toBe(ORIGIN + PLAYER_HITBOX);
    expect(shield.y).toBe(ORIGIN);
  });

  it('②ブルドーザー禁止: 押し先に敵がいると、盾は敵を押し出さず手前で止まる', () => {
    const enemyFields: Partial<Enemy> = {
      id: 'enemy-block', type: 'zombie', x: ORIGIN + PLAYER_HITBOX + 60, y: ORIGIN,
      width: 30, height: 30, health: 10, maxHealth: 10, speed: 0, damage: 1,
      lastHit: 0, lastShot: 0, experienceValue: 0,
    };
    const enemy = enemyFields as Enemy;
    useGameStore.setState({
      projectiles: [baseShield()],
      enemies: [enemy],
    });
    // 何フレームも右へ押し続ける(敵に届くまで)。
    for (let i = 0; i < 30; i++) {
      useGameStore.getState().movePlayer({ up: false, down: false, left: false, right: true }, DT);
    }
    const shield = useGameStore.getState().projectiles.find(p => p.id === 'proj-shield-test')!;
    const stillEnemy = useGameStore.getState().enemies.find(e => e.id === 'enemy-block')!;
    // 敵の座標は1px も変わらない(=押し出されていない)。
    expect(stillEnemy.x).toBe(enemy.x);
    expect(stillEnemy.y).toBe(enemy.y);
    // 盾は敵の手前で止まる(敵の左端を超えて重ならない)。
    expect(shield.x + shield.width).toBeLessThanOrEqual(enemy.x + 0.5);
  });

  it('①クランプ: 行ける帯(M0)の外へは盾を押し出せない', () => {
    useGameStore.setState(s => ({
      farBackdrop: 'tutorial',
      player: { ...s.player, y: -95 }, // 上限(-100)近くに置く
      projectiles: [baseShield({ x: ORIGIN + PLAYER_HITBOX, y: -95 })],
    }));
    for (let i = 0; i < 20; i++) {
      useGameStore.getState().movePlayer({ up: true, down: false, left: false, right: false }, DT);
    }
    const shield = useGameStore.getState().projectiles.find(p => p.id === 'proj-shield-test')!;
    // 帯の上限(中心y=-100)より外へは出ない。
    expect(shield.y + shield.height / 2).toBeGreaterThanOrEqual(-100 - 0.5);
  });
});
