import { describe, it, expect } from 'vitest';
import {
  computeJunkShot,
  JUNK_WEAPON_PELLETS, JUNK_WEAPON_SCRAP_PER_PELLET_BY_LEVEL, JUNK_WEAPON_DAMAGE_PER_SCRAP,
} from './junkWeapon';

describe('junkWeapon 定数(§6.7)', () => {
  it('同時5発・1発あたり消費=Lv1:1/Lv2:2/Lv3:3・1スクラップ=3ダメージ', () => {
    expect(JUNK_WEAPON_PELLETS).toBe(5);
    expect(JUNK_WEAPON_SCRAP_PER_PELLET_BY_LEVEL[1]).toBe(1);
    expect(JUNK_WEAPON_SCRAP_PER_PELLET_BY_LEVEL[2]).toBe(2);
    expect(JUNK_WEAPON_SCRAP_PER_PELLET_BY_LEVEL[3]).toBe(3);
    expect(JUNK_WEAPON_DAMAGE_PER_SCRAP).toBe(3);
  });
});

describe('computeJunkShot', () => {
  it('Lvどおりのフル消費とダメージ(Lv1=5スクラップで3ダメ/Lv2=10で6/Lv3=15で9)', () => {
    expect(computeJunkShot(1, 100)).toEqual({ fire: true, cost: 5, pelletDamage: 3 });
    expect(computeJunkShot(2, 100)).toEqual({ fire: true, cost: 10, pelletDamage: 6 });
    expect(computeJunkShot(3, 100)).toEqual({ fire: true, cost: 15, pelletDamage: 9 });
  });

  it('スクラップ0のみ不発(弾切れ)', () => {
    expect(computeJunkShot(1, 0).fire).toBe(false);
    expect(computeJunkShot(3, 0).fire).toBe(false);
    expect(computeJunkShot(1, 0).cost).toBe(0);
  });

  it('不足時も1スクラップ以上あればフルセット発射・消費=min(フルコスト,所持全部)・ダメージはLv固定(社長裁定v0.25.1693)', () => {
    // 社長例: Lv3で所持7 → 5発発射・7消費・9ダメのまま
    expect(computeJunkShot(3, 7)).toEqual({ fire: true, cost: 7, pelletDamage: 9 });
    // 社長例: Lv3で所持1 → 5発発射・1消費・9ダメのまま
    expect(computeJunkShot(3, 1)).toEqual({ fire: true, cost: 1, pelletDamage: 9 });
    // Lv1で所持3 → 5発発射・3消費・3ダメ
    expect(computeJunkShot(1, 3)).toEqual({ fire: true, cost: 3, pelletDamage: 3 });
  });

  it('所持がフルコスト以上なら消費はフルコストちょうど(全部は取らない)', () => {
    expect(computeJunkShot(2, 10).cost).toBe(10);
    expect(computeJunkShot(2, 11).cost).toBe(10);
  });

  it('レベルは1..3へクランプ(範囲外指定でも壊れない)', () => {
    expect(computeJunkShot(0, 100)).toEqual(computeJunkShot(1, 100));
    expect(computeJunkShot(9, 100)).toEqual(computeJunkShot(3, 100));
  });
});
