import { describe, it, expect } from 'vitest';
import {
  ALCHEMY_STONE_MAX_STAGE,
  ALCHEMY_STONE_DAMAGE_BY_STAGE,
  ALCHEMY_DETONATE_RADIUS_BY_STAGE,
  nextAlchemyStoneStage,
  alchemyStoneDetonateDamage,
  alchemyStoneDetonateRadius,
  alchemyCycleDps,
} from './alchemyStone';
import { createWeapon, ALCHEMY_WEAPON_KEY } from './weaponUtils';

// UNIQUE_WEAPONS.md §5: 汎用の実効DPS式(既定武器の比較基準。weaponSlot.test.tsのeffectiveDpsと同じ式)。
// ★検収B-8是正: 比較基準もCATALOG(createWeapon経由)から読む——リテラル45.83を直書きしない。
const defaultCycleDps = (w: { damage: number; cooldown: number; count?: number; magSize?: number; reloadMs?: number }): number => {
  const count = w.count ?? 1;
  const magSize = w.magSize ?? 1;
  const effReload = Math.max(250, (w.reloadMs ?? 0) * 2);
  return (w.damage * count * magSize) / (magSize * w.cooldown + effReload) * 1000;
};

describe('nextAlchemyStoneStage', () => {
  it('未所持(undefined)は1段目から始まり、以後+1ずつ、3段で頭打ち', () => {
    expect(nextAlchemyStoneStage(undefined)).toBe(1);
    expect(nextAlchemyStoneStage(1)).toBe(2);
    expect(nextAlchemyStoneStage(2)).toBe(3);
    expect(nextAlchemyStoneStage(3)).toBe(3); // 上限
  });
});

describe('alchemyStoneDetonateDamage', () => {
  it('段階ごとに60/120/200(UNIQUE_WEAPONS.md §16-1)', () => {
    expect(alchemyStoneDetonateDamage(1)).toBe(60);
    expect(alchemyStoneDetonateDamage(2)).toBe(120);
    expect(alchemyStoneDetonateDamage(3)).toBe(200);
    expect(ALCHEMY_STONE_MAX_STAGE).toBe(3);
    expect(ALCHEMY_STONE_DAMAGE_BY_STAGE).toEqual([60, 120, 200]);
  });
});

// UNIQUE_WEAPONS.md §16-5c(バッチD検収A-1是正): 起爆は「範囲攻撃」——段階ごとに半径が増える
// (1段70px/2段90px/3段110px)。監査で指摘された欠落(起爆が石持ち1体だけの単発で、半径は絵にしか
// 使われていなかった)をここで固定する=受け入れ条件4。
describe('alchemyStoneDetonateRadius(UNIQUE_WEAPONS.md §16-5c A-1是正)', () => {
  it('段階ごとに70/90/110pxと、段階が上がるほど厳密に広がる', () => {
    expect(alchemyStoneDetonateRadius(1)).toBe(70);
    expect(alchemyStoneDetonateRadius(2)).toBe(90);
    expect(alchemyStoneDetonateRadius(3)).toBe(110);
    expect(ALCHEMY_DETONATE_RADIUS_BY_STAGE).toEqual([70, 90, 110]);
    // 段階の単調性(半径が増える)そのものを機械的に固定する。
    expect(alchemyStoneDetonateRadius(2)).toBeGreaterThan(alchemyStoneDetonateRadius(1));
    expect(alchemyStoneDetonateRadius(3)).toBeGreaterThan(alchemyStoneDetonateRadius(2));
  });

  it('範囲外の段はクランプする(0以下→1段/4以上→3段)', () => {
    expect(alchemyStoneDetonateRadius(0)).toBe(70);
    expect(alchemyStoneDetonateRadius(4)).toBe(110);
  });
});

describe('alchemyCycleDps(UNIQUE_WEAPONS.md §5-2/§16-1)', () => {
  it('破裂4発+3段起爆のサイクル実効DPSは既定glauncher-t2比+5.8%の帯に入る(CATALOG読み)', () => {
    // ★UNIQUE_WEAPONS.md §16-5検収B-8是正: burstDamage/cooldown/magSize/reloadMsはCATALOG
    // (createWeapon経由)から、起爆ダメージ(3段=満額)はalchemyStoneDetonateDamage(既にテスト済みの
    // 純関数)から読む——リテラル直書きにしない。
    const w = createWeapon(ALCHEMY_WEAPON_KEY);
    const dps = alchemyCycleDps(w.damage, w.cooldown, w.magSize ?? 1, w.reloadMs ?? 0, alchemyStoneDetonateDamage(ALCHEMY_STONE_MAX_STAGE));
    const base = defaultCycleDps(createWeapon('glauncher-t2'));
    expect(dps).toBeCloseTo(48.48, 1);
    expect(base).toBeCloseTo(45.83, 1);
    const ratio = dps / base;
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  });
});
