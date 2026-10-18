// research/NEW_GUNS.md 品質監査 #5/#6/#7/#13/#15: 仲間の代わりの銃・弾種の数え方・カウンターの元値・実績の対象。
import { describe, it, expect } from 'vitest';
import { createWeapon, allyFallbackWeapon, ammoBearingGuns } from './weaponUtils';
import { resolveGhostBuild } from './ghostBuild';
import { useGameStore } from '../store/gameStore';
import { FEAT_ALL_WEAPON_KEYS } from '../data/chronicleFeats';
import { BLOB_WEAPON_KEY } from './blobShot';
import { SATELLITE_WEAPON_KEY } from './satelliteOrbit';
import { SCAN_WEAPON_KEY } from './scanSensor';

describe('#6 守護霊・幻影・ボットの代わりの銃', () => {
  it('スキャン=ハンドガンT2 / 塊弾=グレネードガンT2 / 衛星弾=ショットガンT2(id は実体のまま・撃てる銃)', () => {
    for (const [k, fb] of [[SCAN_WEAPON_KEY, 'handgun-t2'], [BLOB_WEAPON_KEY, 'glauncher-t2'], [SATELLITE_WEAPON_KEY, 'shotgun-t2']] as const) {
      const w = createWeapon(k);
      const f = allyFallbackWeapon(w);
      expect(f.key).toBe(fb);
      expect(f.id).toBe(w.id);
      expect(f.nonProjectile).toBeUndefined();
      expect((f.magazine ?? 0)).toBeGreaterThan(0);
    }
  });
  it('対象外の銃はそのまま', () => {
    const w = createWeapon('handgun-t1');
    expect(allyFallbackWeapon(w)).toBe(w);
  });
});

describe('#7 古い守護霊の記録(武器の並び無し)でも代わりの銃が id 照合で引ける', () => {
  it('player.weapons 側も差し替わっていて、gun.id で引くと代わりの銃になる', () => {
    useGameStore.getState().resetGame('warrior');
    const live = useGameStore.getState().player;
    const blob = createWeapon(BLOB_WEAPON_KEY);
    const p = { ...live, weapons: [blob, ...live.weapons.filter(w => w.isMelee)], activeWeaponId: blob.id };
    const build = resolveGhostBuild(undefined, p);
    expect(build.gun?.key).toBe('glauncher-t2');
    const viaId = build.player.weapons.find(w => w.id === build.gun?.id);
    expect(viaId?.key).toBe('glauncher-t2');
  });
});

describe('#5 弾倉の無い銃は弾種選び・弾薬ディレクターに数えない', () => {
  it('ammoBearingGuns はスキャン・衛星弾を除き、塊弾(弾倉あり)は含む', () => {
    useGameStore.getState().resetGame('warrior');
    const p = useGameStore.getState().player;
    const ws = [createWeapon(SCAN_WEAPON_KEY), createWeapon(SATELLITE_WEAPON_KEY), createWeapon(BLOB_WEAPON_KEY), ...p.weapons.filter(w => w.isMelee)];
    const keys = ammoBearingGuns({ ...p, weapons: ws }).map(w => w.key);
    expect(keys).toEqual([BLOB_WEAPON_KEY]);
  });
});

describe('#13 カウンターの元値=同じ枠の標準の銃の damage', () => {
  it('塊弾=グレネードガンT2・衛星弾=ショットガンT2・スキャン=ハンドガンT2(9)', () => {
    expect(createWeapon(BLOB_WEAPON_KEY).damage).toBe(createWeapon('glauncher-t2').damage);
    expect(createWeapon(SATELLITE_WEAPON_KEY).damage).toBe(createWeapon('shotgun-t2').damage);
    expect(createWeapon(SCAN_WEAPON_KEY).damage).toBe(createWeapon('handgun-t2').damage);
  });
});

describe('#15 「全武器開発」の実績の対象に新しい3挺を入れない', () => {
  it('FEAT_ALL_WEAPON_KEYS に含まれない', () => {
    for (const k of [BLOB_WEAPON_KEY, SATELLITE_WEAPON_KEY, SCAN_WEAPON_KEY]) expect(FEAT_ALL_WEAPON_KEYS).not.toContain(k);
  });
});

describe('品質監査2巡目#2: ボットの代わりの銃は、実体を書き換えずにハンドガンT2と同じ間隔で撃ち続ける', () => {
  it('スキャン・衛星弾を持ったボット: 撃った回数が代わりの銃そのものを持った時と同じ・実体の弾倉は undefined のまま', async () => {
    const { vi } = await import('vitest');
    const { spawnEnemyAt } = await import('./enemyUtils');
    const { botAutoFireGunForTest } = await import('./playtestDriver');
    let now = 9_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const run = (key: string): { shots: number; realMag: (number | undefined)[] } => {
      useGameStore.getState().resetGame('warrior');
      const gun = createWeapon(key);
      const st = useGameStore.getState();
      const p = st.player;
      const e = spawnEnemyAt('zombie', 0, 0, st.gameTime);
      e.x = p.x + 60; e.y = p.y; e.health = 1e9; e.maxHealth = 1e9; e.speed = 0; e.id = 'z';
      useGameStore.setState({
        enemies: [e], projectiles: [],
        player: { ...p, weapons: [gun, ...p.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id, ammoHandgun: 9999, ammoShotgun: 9999 },
      });
      let shots = 0;
      const realMag: (number | undefined)[] = [];
      let last = gun.lastFired;
      for (let t = 0; t < 12_000; t += 16) {
        now += 16;
        botAutoFireGunForTest();
        const w = useGameStore.getState().player.weapons.find(x => x.id === gun.id)!;
        if (w.lastFired !== last) { shots++; last = w.lastFired; }
        realMag.push(w.magazine);
      }
      return { shots, realMag };
    };
    const ref = run('handgun-t2');
    expect(ref.shots).toBeGreaterThan(10);
    const scan = run(SCAN_WEAPON_KEY);
    expect(Math.abs(scan.shots - ref.shots)).toBeLessThanOrEqual(1);
    expect(scan.realMag.every(m => m === undefined)).toBe(true);
    const satRef = run('shotgun-t2');
    const sat = run(SATELLITE_WEAPON_KEY);
    expect(Math.abs(sat.shots - satRef.shots)).toBeLessThanOrEqual(1);
    expect(sat.realMag.every(m => m === undefined)).toBe(true);
    spy.mockRestore();
  });
});
