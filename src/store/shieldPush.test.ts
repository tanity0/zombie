// B6(盾押し機構・research/AI_HUMANIZE.md §6・裁定済み#8)の配線テスト。検収是正版(v0.25.3997)。
// 純関数(clampRectToPlayableArea・足基準クランプ)自体の不変条件は src/world/shieldPush.test.ts が
// 固定するので、ここでは movePlayer 側の**配線**(所有者ゲート・接触判定・実効変位の受け渡し・
// exStageの伝播)を見る。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useGameStore, PLAYER_HITBOX } from './gameStore';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { CORRIDOR_LATERAL_CLAMP } from '../utils/corridorProjection';
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

  it('②ブルドーザー存続(配線・社長裁定2026-08-28で撤回): pushShieldRectは敵を見ないので、敵がいても盾はそこで止まらない', () => {
    // ★実際に「動く盾が敵を押し出す」処理(接触ダメージ・ノックバック込み)は既存の
    // 「設置型シールド処理」(useGameLoop.ts・敵→盾の毎フレームresolveAabb)の役目で、
    // movePlayer(store層)からは呼ばれない。ここで固定できるのは配線側の事実だけ:
    // movePlayerの押し(pushShieldRect)がenemies配列を一切受け取らなくなった=
    // 敵の存在が盾の押し先を1pxも変えない(v0.25.3996の「手前で止まる」が消えたことの配線側の裏付け)。
    const enemyFields: Partial<Enemy> = {
      id: 'enemy-block', type: 'zombie', x: ORIGIN + PLAYER_HITBOX + 60, y: ORIGIN,
      width: 30, height: 30, health: 10, maxHealth: 10, speed: 0, damage: 1,
      lastHit: 0, lastShot: 0, experienceValue: 0,
    };
    const enemy = enemyFields as Enemy;
    // 敵無し基準(プレイヤー位置を揃えてから1手だけ押す)。
    placePlayer();
    useGameStore.setState({ projectiles: [baseShield()], enemies: [] });
    useGameStore.getState().movePlayer({ up: false, down: false, left: false, right: true }, DT);
    const noEnemyShieldX = useGameStore.getState().projectiles.find(p => p.id === 'proj-shield-test')!.x;
    // 同じ条件(プレイヤー位置を揃え直す)で敵ありをやり直す。
    placePlayer();
    useGameStore.setState({ projectiles: [baseShield()], enemies: [enemy] });
    useGameStore.getState().movePlayer({ up: false, down: false, left: false, right: true }, DT);
    const withEnemyShieldX = useGameStore.getState().projectiles.find(p => p.id === 'proj-shield-test')!.x;
    // 敵の有無で盾の押し先が変わらない(=pushShieldRectが敵を見ていないことの配線側の証拠)。
    expect(withEnemyShieldX).toBeCloseTo(noEnemyShieldX, 6);
    // 敵の座標そのものもmovePlayer(プレイヤー・盾の移動処理)では動かない(押し出しは別経路の役目)。
    const stillEnemy = useGameStore.getState().enemies.find(e => e.id === 'enemy-block')!;
    expect(stillEnemy.x).toBe(enemy.x);
  });

  it('①クランプ: 行ける帯(M0)の外へは盾を押し出せない(足=下辺基準・検収監査・中3)', () => {
    useGameStore.setState(s => ({
      farBackdrop: 'tutorial',
      player: { ...s.player, y: -95 }, // 上限(-100)近くに置く
      projectiles: [baseShield({ x: ORIGIN + PLAYER_HITBOX, y: -95 })],
    }));
    for (let i = 0; i < 20; i++) {
      useGameStore.getState().movePlayer({ up: true, down: false, left: false, right: false }, DT);
    }
    const shield = useGameStore.getState().projectiles.find(p => p.id === 'proj-shield-test')!;
    // 帯の上限より外へは出ない。基準は盾の足(下辺=y+height。CLAUDE.mdの足規約・中心基準だと
    // 帯の端でheight/2ぶんずれる=検収監査・中3)。
    expect(shield.y + shield.height).toBeGreaterThanOrEqual(-100 - 0.5);
  });
});

describe('★B6-EX 盾押しのexStage伝播(検収監査・重大1: EX広間で±170へスナップしない)', () => {
  const installLocalStorage = (): void => {
    const map = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() { return map.size; },
    } as Storage;
  };

  beforeEach(() => {
    installLocalStorage();
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
    placePlayer();
  });

  afterEach(async () => {
    const { setSelectedStageId } = await import('../data/progress');
    setSelectedStageId(''); // 他テストへ「stage-ex1選択中」を持ち越さない
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('EXの通路広間(corridorMode)では、盾のクランプにもexStageが伝わり±170(通常通路幅)を越えて押せる', async () => {
    const { setSelectedStageId } = await import('../data/progress');
    setSelectedStageId('stage-ex1'); // isExStageRun()=true
    // スリィエル広間の内部(south-2300〜north-3700・ランプ帯[400px]を避けた深部=t=1・flat・
    // 横クランプ=EX_HALL_LATERAL_CLAMP=340)。盾は既に通常通路幅の上限(170)より外側に置く
    // (=exStageが効いていなければ、押した瞬間に170の内側へ強制スナップされるはずの座標)。
    useGameStore.setState(s => ({
      player: { ...s.player, x: 140, y: -3000, vx: 0, vy: 0, speedRampSustainMs: 0, speedRampDirX: 0, speedRampDirY: 0 },
      farBackdrop: '', stageTheme: 'forest', indoorMode: false,
      corridorMode: true, corridorRunInActive: false, m0AdvanceLimitX: null,
      projectiles: [baseShield({ x: 140 + PLAYER_HITBOX, y: -3000 })], // 中心x=140+28+20=188 > 170
    }));
    useGameStore.getState().movePlayer({ up: false, down: false, left: false, right: true }, DT);
    const shield = useGameStore.getState().projectiles.find(p => p.id === 'proj-shield-test')!;
    // 通常通路幅の上限(CORRIDOR_LATERAL_CLAMP=170)を越えたまま留まる=exStageが盾にも効いている証拠。
    // (exStageが無いバグ版なら、この1手で170の内側へ最大数十px引き戻される=検収監査・重大1)
    expect(shield.x + shield.width / 2).toBeGreaterThan(CORRIDOR_LATERAL_CLAMP);
  });
});
