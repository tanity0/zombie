// UNIQUE_WEAPONS.md §16-2(バッチC-2・2026-09-07 C-2検収A-1/A-3で確定): コイルショットガン/
// 誘導散弾ショットガンの弾移動tick(gameStore.ts updateProjectiles)の配線テスト。純関数
// (coilLateralOffsetPx/coilConvergeMs/homingPelletTurnRateRadPerSec)そのものは
// coilShotgun.test.ts/homingShotgun.test.tsで検算済みなので、ここでは「store側が正しく
// フィールドを読んで位置/directionを書き換えているか」だけを見る(実装精度の規律4)。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { coilConvergeMs } from '../utils/coilShotgun';
import type { Projectile } from '../types/game';

const buildProjectile = (over: Partial<Projectile>): Projectile => ({
  id: `t-proj-${Math.random().toString(36).slice(2)}`,
  x: 0, y: 0, width: 8, height: 8, speed: 300, damage: 10,
  direction: { x: 1, y: 0 }, weaponType: 'shotgun', weaponKey: 'shotgun-t2-coil',
  duration: 1400, createdAt: Date.now(), passthrough: false, hitEnemies: [],
  hostile: false, reflected: false, ...over,
});

describe('コイルショットガンの軌道(gameStore.updateProjectiles配線・「中心線からの横ズレ」方式)', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('warrior');
  });

  it('中心弾(coilAmplitudePx=0)は横ズレが常に0=狙点方向のまま直進する', () => {
    useGameStore.setState({ gameTime: 1000 });
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 }, speed: 300,
      coilAmplitudePx: 0, coilAimDirX: 1, coilAimDirY: 0, coilLaunchGameTime: 900,
    });
    useGameStore.setState({ projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 60);
    const after = useGameStore.getState().projectiles[0];
    // 中心線=発射点の中心そのもの(x:0,y:0,width/height:8 → 中心y=4)。横ズレ0ならここから動かない。
    expect(after.y + after.height / 2).toBeCloseTo(4, 5);
    expect(after.direction).toEqual({ x: 1, y: 0 });
  });

  it('外側弾(coilAmplitudePx>0)は収束前(t<T)に中心線から外へ膨らむ', () => {
    const convergeMs = coilConvergeMs(300); // speed=300のT
    useGameStore.setState({ gameTime: 1000 });
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 }, speed: 300,
      coilAmplitudePx: 44, coilAimDirX: 1, coilAimDirY: 0, coilLaunchGameTime: 1000 - convergeMs / 4, // t=T/4
    });
    useGameStore.setState({ projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 60);
    const after = useGameStore.getState().projectiles[0];
    // aimDir=(1,0)の垂線は(0,1)なので、横ズレはyへ乗る。t=T/4はsinの立ち上がり側=正=中心線(y=4)より下。
    expect(after.y + after.height / 2).toBeGreaterThan(4);
  });

  it('★受け入れ条件: t=T(収束完了)で全ペレットの横ズレが0になる', () => {
    const convergeMs = coilConvergeMs(300);
    useGameStore.setState({ gameTime: 1000 });
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 }, speed: 300,
      coilAmplitudePx: 44, coilAimDirX: 1, coilAimDirY: 0, coilLaunchGameTime: 1000 - convergeMs, // t=T
    });
    useGameStore.setState({ projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 60);
    const after = useGameStore.getState().projectiles[0];
    expect(after.y + after.height / 2).toBeCloseTo(4, 3);
  });

  it('t>T(収束後)は横ズレ0のまま直進が続く', () => {
    const convergeMs = coilConvergeMs(300);
    useGameStore.setState({ gameTime: 1000 });
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 }, speed: 300,
      coilAmplitudePx: 44, coilAimDirX: 1, coilAimDirY: 0, coilLaunchGameTime: 1000 - convergeMs * 3, // t=3T
    });
    useGameStore.setState({ projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 60);
    const after = useGameStore.getState().projectiles[0];
    expect(after.y + after.height / 2).toBeCloseTo(4, 3);
  });

  it('時計はgameTime(壁時計Date.now()ではない): createdAtだけ進めてもgameTimeが動かなければ横ズレも動かない', () => {
    useGameStore.setState({ gameTime: 1000 });
    const p1 = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 }, speed: 300,
      coilAmplitudePx: 44, coilAimDirX: 1, coilAimDirY: 0, coilLaunchGameTime: 1000, // elapsed(gameTime基準)=0
      createdAt: Date.now() - 500, // 壁時計(duration=1400msの寿命よりは短いズレ)はズラす=coilの計算には無関係のはず
    });
    useGameStore.setState({ projectiles: [p1] });
    useGameStore.getState().updateProjectiles(1 / 60);
    const after = useGameStore.getState().projectiles[0];
    // elapsed(gameTime基準)=0なので横ズレ0のまま(壁時計の食い違いに引きずられない)。
    expect(after.y + after.height / 2).toBeCloseTo(4, 5);
  });
});

describe('誘導散弾ショットガンの旋回(gameStore.updateProjectiles配線・homingPelletフラグ)', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('warrior');
  });

  it('homingPellet+targetEnemyIdを持つ弾は、対象へ向けて旋回する(半径40px相当の専用旋回速度)', () => {
    const target = spawnEnemyAt('zombie', 500, 0, useGameStore.getState().gameTime);
    useGameStore.setState({ enemies: [target] });
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => e.id === target.id ? { ...e, y: 300 } : e),
    }));
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 }, speed: 705,
      weaponKey: 'shotgun-t3-homing', targetEnemyId: target.id, homingPellet: true,
      createdAt: Date.now(),
    });
    useGameStore.setState({ projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 4); // 大きめのdeltaTimeで確実に曲がったことを見る
    const after = useGameStore.getState().projectiles[0];
    // 対象は右下(+y)方向にいるので、旋回すればdirection.yが正になっているはず。
    expect(after.direction.y).toBeGreaterThan(0);
  });

  it('対象が死体(isCorpse=corpseUntil付き)になっていれば、生存している別の敵へ自動的に乗り換える', () => {
    const corpseTarget = spawnEnemyAt('zombie', 500, 0, useGameStore.getState().gameTime);
    const aliveTarget = spawnEnemyAt('zombie', 500, 300, useGameStore.getState().gameTime);
    useGameStore.setState({
      enemies: [
        { ...corpseTarget, health: 0, corpseUntil: useGameStore.getState().gameTime + 5000 },
        aliveTarget,
      ],
    });
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 }, speed: 705,
      weaponKey: 'shotgun-t3-homing', targetEnemyId: corpseTarget.id, homingPellet: true,
      createdAt: Date.now(),
    });
    useGameStore.setState({ projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 4);
    const after = useGameStore.getState().projectiles[0];
    // 死体は追わない=生存対象(aliveTarget)へ乗り換わっているはず。
    expect(after.targetEnemyId).toBe(aliveTarget.id);
  });

  it('対象が消えていれば直進する(homing-missileと同じ「対象が消えたら直進」規則)', () => {
    useGameStore.setState({ enemies: [] });
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 }, speed: 100,
      weaponKey: 'shotgun-t3-homing', targetEnemyId: 'does-not-exist', homingPellet: true,
      createdAt: Date.now(),
    });
    useGameStore.setState({ enemies: [], projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 60);
    const after = useGameStore.getState().projectiles[0];
    expect(after.direction).toEqual({ x: 1, y: 0 });
  });

  it('targetEnemyIdもhomingPelletも持たない通常のshotgun弾は旋回しない(回帰ゼロ)', () => {
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 }, speed: 100,
      weaponKey: 'shotgun-t1', createdAt: Date.now(),
    });
    useGameStore.setState({ enemies: [], projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 60);
    const after = useGameStore.getState().projectiles[0];
    expect(after.direction).toEqual({ x: 1, y: 0 });
  });

  it('誘導ロケット(weaponType===homing-missile)の旋回は既存のHOMING_MISSILE_TURN_RATEのまま(回帰ゼロ)', () => {
    const target = spawnEnemyAt('zombie', 500, 300, useGameStore.getState().gameTime);
    useGameStore.setState({ enemies: [target] });
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 }, speed: 200, // 誘導ロケットの弾速
      weaponType: 'homing-missile', weaponKey: 'homing-rocket', targetEnemyId: target.id,
      createdAt: Date.now(),
    });
    useGameStore.setState({ projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 4);
    const after = useGameStore.getState().projectiles[0];
    expect(after.direction.y).toBeGreaterThan(0);
  });
});
