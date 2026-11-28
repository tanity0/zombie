// 変異体対策室の弾の補給(社長指示2026-11-14「変異体対策室では、弾切れになると画面のランダム位置に弾が落ちる様に」)。
import { describe, it, expect } from 'vitest';
import type { Player, Weapon } from '../types/game';
import { createWeapon } from './weaponUtils';
import {
  practiceDryAmmoTypes, practiceAmmoTypesToDrop, pickPracticeAmmoSpot, ammoTypeOfPickup,
  PRACTICE_AMMO_MIN_PLAYER_DIST, PRACTICE_AMMO_PICKUP_SIZE, PRACTICE_AMMO_HORIZON_PAD_PX,
} from './practiceAmmoResupply';
import { renderedViewRect } from './spawnRefill';
import { ZOOM_MIN_ABS } from './cameraZoom';

const gun = (key: string, magazine: number, extra: Partial<Weapon> = {}): Weapon => ({ ...createWeapon(key), magazine, ...extra });
const player = (weapons: Weapon[], pools: Partial<Record<'ammoHandgun' | 'ammoShotgun' | 'ammoRifle' | 'ammoPhill' | 'ammoGlauncher', number>> = {}): Player => ({
  weapons, ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0, ammoPhill: 0, ammoGlauncher: 0, ...pools,
} as unknown as Player);

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('practiceDryAmmoTypes(弾切れの種類)', () => {
  it('弾倉0かつ予備0の銃だけが弾切れ', () => {
    expect(practiceDryAmmoTypes(player([gun('handgun-t1', 0)]))).toEqual(['handgun']);
    expect(practiceDryAmmoTypes(player([gun('handgun-t1', 3)]))).toEqual([]);
    expect(practiceDryAmmoTypes(player([gun('handgun-t1', 0)], { ammoHandgun: 5 }))).toEqual([]);
  });
  it('無限弾・弾倉の無い銃・近接は弾切れにならない', () => {
    expect(practiceDryAmmoTypes(player([gun('handgun-t1', 0, { infiniteAmmo: true })]))).toEqual([]);
    expect(practiceDryAmmoTypes(player([gun('handgun-t1', 0, { noAmmo: true })]))).toEqual([]);
    expect(practiceDryAmmoTypes(player([{ ...createWeapon('knife-t1'), magazine: 0 }]))).toEqual([]);
  });
  it('別の種類は種類ごと・同じ種類は1つにまとめる', () => {
    const p = player([gun('handgun-t1', 0), gun('shotgun-t1', 0), gun('handgun-t2', 0), gun('rifle-t1', 4)]);
    expect(practiceDryAmmoTypes(p)).toEqual(['handgun', 'shotgun']);
  });
});

describe('practiceAmmoTypesToDrop(場に同じ種類があれば落とさない)', () => {
  it('場に同じ種類の弾があると落とさない・別の種類は落とす', () => {
    const field = [{ type: 'ammo-handgun' }, { type: 'experience' }];
    expect(practiceAmmoTypesToDrop(['handgun', 'shotgun'], field)).toEqual(['shotgun']);
    expect(practiceAmmoTypesToDrop(['handgun'], [])).toEqual(['handgun']);
    expect(practiceAmmoTypesToDrop([], field)).toEqual([]);
  });
  it('拾い物の型と弾の種類の対応(5種)', () => {
    expect(['ammo-handgun', 'ammo-shotgun', 'ammo-rifle', 'ammo-glauncher', 'ammo-phill'].map(ammoTypeOfPickup))
      .toEqual(['handgun', 'shotgun', 'rifle', 'glauncher', 'phill']);
    expect(ammoTypeOfPickup('treasure')).toBeUndefined();
  });
});

describe('pickPracticeAmmoSpot(画面内のランダムな位置)', () => {
  const view = { left: 1000, top: 2000, right: 1800, bottom: 2600, horizonY: 2150 };
  const ok = (x: number, y: number) => ({ x, y });

  it('可視域の内側・プレイヤーから離れた所に置く(多数の乱数で)', () => {
    let s = 12345;
    const rng = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    for (let i = 0; i < 300; i++) {
      const r = pickPracticeAmmoSpot({ view, playerCx: 1400, playerCy: 2300, rng, standable: ok });
      expect(r).not.toBeNull();
      expect(r!.x).toBeGreaterThanOrEqual(view.left);
      expect(r!.x + PRACTICE_AMMO_PICKUP_SIZE).toBeLessThanOrEqual(view.right);
      expect(r!.y).toBeGreaterThanOrEqual(view.horizonY + PRACTICE_AMMO_HORIZON_PAD_PX); // 地平線より上(透けて消える所)に置かない
      expect(r!.y + PRACTICE_AMMO_PICKUP_SIZE).toBeLessThanOrEqual(view.bottom);
      const d = Math.hypot(r!.x + 8 - 1400, r!.y + 8 - 2300);
      expect(d).toBeGreaterThanOrEqual(PRACTICE_AMMO_MIN_PLAYER_DIST);
    }
  });

  it('ズームの最大引き(ZOOM_MIN_ABS)でも実際に映る範囲の内側・地平線より下', () => {
    for (const z of [1, 0.7, ZOOM_MIN_ABS]) {
      const wide = renderedViewRect(0, 0, 430, 932, z);
      let s = 99;
      const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0; i < 100; i++) {
        const r = pickPracticeAmmoSpot({ view: wide, playerCx: 215, playerCy: 600, rng, standable: ok });
        expect(r).not.toBeNull();
        expect(r!.x).toBeGreaterThanOrEqual(wide.left);
        expect(r!.x + PRACTICE_AMMO_PICKUP_SIZE).toBeLessThanOrEqual(wide.right);
        expect(r!.y).toBeGreaterThan(wide.horizonY);
        expect(r!.y + PRACTICE_AMMO_PICKUP_SIZE).toBeLessThanOrEqual(wide.bottom);
      }
    }
  });

  it('プレイヤーの真上に当たった乱数は捨てて次を使う', () => {
    // 1回目=中央(プレイヤーの位置)、2回目=右下寄り
    const r = pickPracticeAmmoSpot({ view, playerCx: 1392, playerCy: 2292, rng: seq([0.5, 0.5, 0.95, 0.95]), standable: ok });
    expect(r).not.toBeNull();
    expect(Math.hypot(r!.x + 8 - 1392, r!.y + 8 - 2292)).toBeGreaterThanOrEqual(PRACTICE_AMMO_MIN_PLAYER_DIST);
  });

  it('壁の中・移動可能帯の外(standable が null)には置かない', () => {
    const wallLeftHalf = (x: number, y: number) => (x < 1400 ? null : { x, y });
    let s = 7;
    const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 100; i++) {
      const r = pickPracticeAmmoSpot({ view, playerCx: 1100, playerCy: 2300, rng, standable: wallLeftHalf });
      if (r) expect(r.x).toBeGreaterThanOrEqual(1400);
    }
    expect(pickPracticeAmmoSpot({ view, playerCx: 1100, playerCy: 2300, rng, standable: () => null })).toBeNull();
  });

  it('帯へ寄せた結果が可視域の外へずれたら採らない', () => {
    const pushOut = (_x: number, y: number) => ({ x: 99999, y });
    expect(pickPracticeAmmoSpot({ view, playerCx: 0, playerCy: 0, rng: seq([0.3, 0.7]), standable: pushOut })).toBeNull();
  });
});
