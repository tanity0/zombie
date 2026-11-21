// research/NEW_GUNS.md §7(受け入れ条件)の 1〜3・5 を、ストアと utils/newGunsTick.ts を実際に回して固定する。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { createWeapon } from '../utils/weaponUtils';
import { tickNewGuns, getNewGunsView, resetNewGunsTick } from '../utils/newGunsTick';
import { BLOB_WEAPON_KEY, BLOB_TICK_MS, BLOB_LIFE_MS } from '../utils/blobShot';
import { SATELLITE_WEAPON_KEY, SAT_ADD_MS, SAT_RELEASE_IDLE_MS } from '../utils/satelliteOrbit';
import { SCAN_WEAPON_KEY, SCAN_BEAT_MS, SCAN_SWEEP_MS } from '../utils/scanSensor';
import type { Enemy } from '../types/game';

// 音はヘッドレスで鳴らせない(window が無い)ので、倒した時の音だけ黙らせる。
vi.mock('../audio/audioManager', async (orig) => ({ ...(await orig<typeof import('../audio/audioManager')>()), playEnemyDeath: () => {}, playSfx: () => {} }));

let now = 5_000_000;
let gt = 0;

const setupWith = (gunKey?: string) => {
  useGameStore.getState().resetGame('warrior');
  resetNewGunsTick();
  gt = 10_000;
  useGameStore.setState(st => {
    const gun = gunKey ? createWeapon(gunKey) : undefined;
    return {
      gameTime: gt,
      enemies: [],
      player: {
        ...st.player, health: 100, maxHealth: 100,
        ...(gun ? { weapons: [gun, ...st.player.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id } : {}),
        aimX: 1, aimY: 0, lastDirection: { x: 1, y: 0 },
      },
    };
  });
};
const zombieAt = (dx: number, dy: number, id: string): Enemy => {
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt('zombie', 0, 0, gt);
  e.x = p.x + p.width / 2 + dx - e.width / 2; e.y = p.y + p.height / 2 + dy - e.height / 2;
  e.id = id; e.health = 99999; e.maxHealth = 99999; e.speed = 0;
  return e;
};
const hpOf = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)?.health ?? 0;
/** ms だけ時間を進める(store の gameTime と tickNewGuns を同じ値で)。 */
const advance = (ms: number, moveInput = false, step = 16) => {
  for (let t = 0; t < ms; t += step) {
    gt += step; now += step;
    useGameStore.setState({ gameTime: gt });
    tickNewGuns({ gameTime: gt, dtSec: step / 1000, moveInput });
  }
};

beforeEach(() => {
  now = 5_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('§7-5 3挺を持たない時は store へ1度も書かない', () => {
  it('ハンドガンだけの時、何フレーム回しても state の参照が変わらない', () => {
    setupWith();
    useGameStore.setState({ enemies: [zombieAt(60, 0, 'z')] });
    const before = useGameStore.getState();
    for (let i = 0; i < 200; i++) { gt += 16; tickNewGuns({ gameTime: gt, dtSec: 0.016, moveInput: i % 2 === 0 }); }
    expect(useGameStore.getState()).toBe(before);
    expect(getNewGunsView().blobs.length).toBe(0);
    expect(getNewGunsView().scanFan).toBeNull();
  });
});

describe('§7-1 塊弾', () => {
  it('射程内の敵へ撃つ(弾倉を1つ使う)→ゆっくり進んで触れている敵に200msごとに当たり続ける→寿命で消える', () => {
    setupWith(BLOB_WEAPON_KEY);
    useGameStore.setState({ enemies: [zombieAt(90, 0, 'z')] });
    advance(16);
    const gun = useGameStore.getState().player.weapons.find(w => w.key === BLOB_WEAPON_KEY)!;
    expect(gun.magazine).toBe(2);
    expect(getNewGunsView().blobs.length).toBe(1);
    const hp0 = hpOf('z');
    advance(1500);
    const hp1 = hpOf('z');
    expect(hp1).toBeLessThan(hp0); // 触れて削れた
    advance(BLOB_TICK_MS * 3);
    expect(hpOf('z')).toBeLessThan(hp1); // 当たり続ける
    advance(BLOB_LIFE_MS + 200);
    // 同じ周期で撃ち続けるので、最初の塊は寿命で消えている(場の塊は上限以内)。
    expect(getNewGunsView().blobs.every(b => gt - b.bornAt < BLOB_LIFE_MS)).toBe(true);
  });
});

describe('§7-2 衛星弾', () => {
  it('動くと溜まり、回っている弾が触れた敵に当たり、止まると近い敵へ誘導つきの弾を放つ', () => {
    setupWith(SATELLITE_WEAPON_KEY);
    useGameStore.setState({ enemies: [zombieAt(64, 0, 'touch'), zombieAt(180, 0, 'far')] });
    const hp0 = hpOf('touch');
    advance(SAT_ADD_MS * 4 + 20, true);
    expect(getNewGunsView().orbit?.slots.length).toBe(4);
    expect(hpOf('touch')).toBeLessThan(hp0); // 回っている間も当たる
    expect(useGameStore.getState().projectiles.filter(p => p.weaponKey === SATELLITE_WEAPON_KEY).length).toBe(0);
    advance(SAT_RELEASE_IDLE_MS + 20, false);
    const shots = useGameStore.getState().projectiles.filter(p => p.weaponKey === SATELLITE_WEAPON_KEY);
    expect(shots.length).toBe(4);
    expect(shots.every(p => p.homingPellet && p.targetEnemyId !== undefined)).toBe(true);
    expect(getNewGunsView().orbit?.slots.length).toBe(0);
  });
});

describe('社長決定2026-10-18: 衛星弾は持ち替えても回り続ける', () => {
  const satShots = () => useGameStore.getState().projectiles.filter(p => p.weaponKey === SATELLITE_WEAPON_KEY).length;
  const hold = (key: string) => useGameStore.setState(st => ({
    player: { ...st.player, activeWeaponId: st.player.weapons.find(w => w.key === key)!.id },
  }));
  const setupTwo = () => {
    setupWith(SATELLITE_WEAPON_KEY);
    const hg = createWeapon('handgun-t1');
    useGameStore.setState(st => ({ player: { ...st.player, weapons: [...st.player.weapons, hg] } }));
  };
  it('持ち替えている間: 消えない・増えない・触れた敵に当たり続ける・止まっても放たない', () => {
    setupTwo();
    advance(SAT_ADD_MS * 3 + 20, true);
    expect(getNewGunsView().orbit?.slots.length).toBe(3);
    hold('handgun-t1');
    useGameStore.setState({ enemies: [zombieAt(64, 0, 'touch')] });
    const hp0 = hpOf('touch');
    advance(1500, true); // 動き続けても増えない
    expect(getNewGunsView().orbit?.slots.length).toBe(3);
    expect(hpOf('touch')).toBeLessThan(hp0); // 回っている弾は当たり続ける
    advance(1000, false); // 持ち替えている間に止まっても放たない
    expect(satShots()).toBe(0);
    expect(getNewGunsView().orbit?.slots.length).toBe(3);
    hold(SATELLITE_WEAPON_KEY);
    advance(SAT_RELEASE_IDLE_MS * 4, false); // 持ち直して止まったまま=「止まった瞬間」ではないので放たない
    expect(satShots()).toBe(0);
    advance(48, true); // 衛星弾を持って動いて
    advance(SAT_RELEASE_IDLE_MS + 20, false); // 止まった瞬間に全部放つ
    expect(satShots()).toBe(3);
    expect(getNewGunsView().orbit?.slots.length ?? 0).toBe(0);
  });
  it('銃を撃てない間(掴まれ・刀モード)は、構えていても持ち替えていても回る弾が当たらない(回り続ける)', () => {
    for (const lockKind of ['grab', 'katana'] as const) {
      for (const holdingSat of [true, false]) {
        setupTwo();
        advance(SAT_ADD_MS * 3 + 20, true);
        if (!holdingSat) hold('handgun-t1');
        useGameStore.setState(st => ({
          enemies: [zombieAt(64, 0, 'touch')],
          player: lockKind === 'grab' ? { ...st.player, grabbedUntil: gt + 1_000_000 } : { ...st.player, subWeapons: ['katana'] },
        }));
        const hp0 = hpOf('touch');
        const a0 = getNewGunsView().orbit!.angle;
        advance(1500, true);
        expect(hpOf('touch')).toBe(hp0);
        expect(getNewGunsView().orbit?.slots.length).toBe(3);
        expect(getNewGunsView().orbit!.angle).not.toBeCloseTo(a0, 3); // 回り続けている
      }
    }
  });
  it('寿命は無い(長く持ち替えていても残る)・死亡で消える', () => {
    setupTwo();
    advance(SAT_ADD_MS * 2 + 20, true);
    hold('handgun-t1');
    advance(20_000, false, 100);
    expect(getNewGunsView().orbit?.slots.length).toBe(2);
    useGameStore.setState(st => ({ player: { ...st.player, health: 0 } }));
    advance(32, false);
    expect(getNewGunsView().orbit).toBeNull();
    expect(satShots()).toBe(0);
  });
  it('出撃の終わり(勝利)とランのリセットで消える', () => {
    setupTwo();
    advance(SAT_ADD_MS * 2 + 20, true);
    hold('handgun-t1');
    useGameStore.setState({ gameWon: true });
    advance(32, false);
    expect(getNewGunsView().orbit).toBeNull();
    useGameStore.setState({ gameWon: false });
    hold(SATELLITE_WEAPON_KEY);
    advance(SAT_ADD_MS * 2 + 20, true);
    expect(getNewGunsView().orbit?.slots.length).toBe(2);
    gt = 100; // 新しいラン(gameTime が戻る)
    advance(16, false);
    expect(getNewGunsView().orbit?.slots.length ?? 0).toBe(0);
  });
});

describe('§7-3 スキャンセンサー: 拍に合わせて扇を出し、印を3秒付ける', () => {
  it('扇の中の敵だけに、掃き終わった時に印が付く', () => {
    setupWith(SCAN_WEAPON_KEY);
    useGameStore.setState({ enemies: [zombieAt(150, 0, 'in'), zombieAt(0, 150, 'out')] });
    advance(16); // 拍の基準を取る
    const toBeat = SCAN_BEAT_MS - (gt % SCAN_BEAT_MS) + 1;
    advance(toBeat, false, toBeat);
    expect(getNewGunsView().scanFan).not.toBeNull();
    advance(SCAN_SWEEP_MS / 2);
    expect(useGameStore.getState().enemies.find(e => e.id === 'in')?.scanMarkUntil).toBeUndefined(); // 掃いている途中はまだ付かない
    advance(SCAN_SWEEP_MS);
    const inE = useGameStore.getState().enemies.find(e => e.id === 'in')!;
    const outE = useGameStore.getState().enemies.find(e => e.id === 'out')!;
    expect(inE.scanMarkUntil).toBeGreaterThan(gt);
    expect(inE.scanMarkUntil! - gt).toBeLessThanOrEqual(3000);
    expect(outE.scanMarkUntil).toBeUndefined();
  });
  it('掃き終わる前に持ち替えたら印は付かない', () => {
    setupWith(SCAN_WEAPON_KEY);
    const hg = createWeapon('handgun-t1');
    useGameStore.setState(st => ({ enemies: [zombieAt(150, 0, 'in')], player: { ...st.player, weapons: [...st.player.weapons, hg] } }));
    advance(16);
    const toBeat = SCAN_BEAT_MS - (gt % SCAN_BEAT_MS) + 1;
    advance(toBeat, false, toBeat);
    expect(getNewGunsView().scanFan).not.toBeNull();
    useGameStore.getState().setActiveWeapon(hg.id);
    advance(SCAN_SWEEP_MS + 50);
    expect(useGameStore.getState().enemies.find(e => e.id === 'in')?.scanMarkUntil).toBeUndefined();
  });
  it('拍はスキャンセンサーを構えていない間も回っている(構え直した次の拍で扇が出る)', () => {
    setupWith(SCAN_WEAPON_KEY);
    const hg = createWeapon('handgun-t1');
    useGameStore.setState(st => ({ enemies: [zombieAt(150, 0, 'in')], player: { ...st.player, weapons: [...st.player.weapons, hg], activeWeaponId: hg.id } }));
    advance(SCAN_BEAT_MS * 2);
    expect(getNewGunsView().scanFan).toBeNull();
    const scan = useGameStore.getState().player.weapons.find(w => w.key === SCAN_WEAPON_KEY)!;
    useGameStore.getState().setActiveWeapon(scan.id);
    const toBeat = SCAN_BEAT_MS - (gt % SCAN_BEAT_MS) + 1;
    advance(toBeat, false, toBeat);
    expect(getNewGunsView().scanFan?.startAt).toBe(gt);
    expect(gt % SCAN_BEAT_MS).toBeLessThan(5); // 拍の頭(gameTime の 1.2 秒刻み)
  });
});

describe('品質監査#3: 塊弾の射程はズーム補正しない(約404pxで上限)', () => {
  it('ズーム0.4でも、404pxより遠い相手は撃たない/近い相手は撃つ', () => {
    setupWith(BLOB_WEAPON_KEY);
    useGameStore.setState({ viewZoom: 0.4, enemies: [zombieAt(450, 0, 'far')] } as never);
    advance(16);
    expect(getNewGunsView().blobs.length).toBe(0);
    useGameStore.setState({ enemies: [zombieAt(360, 0, 'near')] });
    advance(16);
    expect(getNewGunsView().blobs.length).toBe(1);
  });
});

describe('品質監査#4: 塊弾で倒した敵は、弾で倒した時と同じドロップ', () => {
  it('倒すと経験値の拾い物が出る(dropGunKillLoot を通る)', () => {
    setupWith(BLOB_WEAPON_KEY);
    const z = zombieAt(60, 0, 'weak'); z.health = 1; z.maxHealth = 1;
    useGameStore.setState({ enemies: [z], pickups: [] });
    advance(1200);
    expect(useGameStore.getState().enemies.find(e => e.id === 'weak' && e.health > 0)).toBeUndefined();
    expect(useGameStore.getState().pickups.some(p => p.id.startsWith('pickup-xp'))).toBe(true);
  });
});
