// §6.24-W(社長裁定「武器庫は武器にして。全部tier3だった場合は返金されて終わり」・v0.25.2533):
// 武器庫の昇格対象カテゴリ列挙の純関数テスト。
import { describe, it, expect } from 'vitest';
import { armoryUpgradableGunCategories, armoryGrantKeys, createWeapon } from './weaponUtils';

describe('armoryUpgradableGunCategories(§6.24-W)', () => {
  it('未所持カテゴリは昇格対象(初期装備ハンドガンt1のみ → 3カテゴリ全部が対象)', () => {
    const weapons = [createWeapon('handgun-t1'), createWeapon('knife-t1')];
    expect(armoryUpgradableGunCategories(weapons)).toEqual(['handgun', 'shotgun', 'rifle']);
  });

  it('Tier3所持カテゴリは対象外・Tier2以下は対象(近接のTierは無関係)', () => {
    const weapons = [
      createWeapon('handgun-t3'),
      createWeapon('shotgun-t2'),
      createWeapon('machete-t3'), // 近接t3が銃の判定に混ざらないこと
    ];
    expect(armoryUpgradableGunCategories(weapons)).toEqual(['shotgun', 'rifle']);
  });

  it('3カテゴリ全てTier3 → 空配列(=返金されて終わりのケース)', () => {
    const weapons = [createWeapon('handgun-t3'), createWeapon('shotgun-t3'), createWeapon('rifle-t3')];
    expect(armoryUpgradableGunCategories(weapons)).toEqual([]);
  });
});

// 社長指示v0.25.3290: グレネードガン(武器庫からのみ排出・第4枠)は1段ずつ昇格。
describe('armoryGrantKeys(v0.25.3290・グレネードガン=1段ずつ)', () => {
  it('未所持なら候補にglauncher-t1が入る(既存3カテゴリのt3と並ぶ)', () => {
    const weapons = [createWeapon('handgun-t1'), createWeapon('knife-t1')];
    expect(armoryGrantKeys(weapons)).toEqual(['handgun-t3', 'shotgun-t3', 'rifle-t3', 'glauncher-t1']);
  });

  it('glauncher-t1所持 → 次はt2(いきなりt3にしない)', () => {
    const weapons = [createWeapon('glauncher-t1')];
    expect(armoryGrantKeys(weapons)).toContain('glauncher-t2');
    expect(armoryGrantKeys(weapons)).not.toContain('glauncher-t3');
  });

  it('全カテゴリt3+glauncher-t3 → 空(返金ケース維持)', () => {
    const weapons = [
      createWeapon('handgun-t3'), createWeapon('shotgun-t3'),
      createWeapon('rifle-t3'), createWeapon('glauncher-t3'),
    ];
    expect(armoryGrantKeys(weapons)).toEqual([]);
  });
});
