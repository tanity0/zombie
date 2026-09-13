// §6.24-W(社長裁定「武器庫は武器にして。全部tier3だった場合は返金されて終わり」・v0.25.2533):
// 武器庫の昇格対象カテゴリ列挙の純関数テスト。
import { describe, it, expect } from 'vitest';
import { armoryUpgradableGunCategories, armoryGrantKeys, createWeapon } from './weaponUtils';

describe('armoryUpgradableGunCategories(§6.24-W)', () => {
  it('未所持カテゴリは昇格対象(初期装備ハンドガンt1のみ → 4カテゴリ全部が対象・v0.25.3297でglauncher追加)', () => {
    const weapons = [createWeapon('handgun-t1'), createWeapon('knife-t1')];
    expect(armoryUpgradableGunCategories(weapons)).toEqual(['handgun', 'shotgun', 'rifle', 'glauncher']);
  });

  it('Tier3所持カテゴリは対象外・Tier2以下は対象(近接のTierは無関係)', () => {
    const weapons = [
      createWeapon('handgun-t3'),
      createWeapon('shotgun-t2'),
      createWeapon('machete-t3'), // 近接t3が銃の判定に混ざらないこと
    ];
    expect(armoryUpgradableGunCategories(weapons)).toEqual(['shotgun', 'rifle', 'glauncher']);
  });

  it('4カテゴリ全てTier3 → 空配列(=返金されて終わりのケース)', () => {
    const weapons = [createWeapon('handgun-t3'), createWeapon('shotgun-t3'), createWeapon('rifle-t3'), createWeapon('glauncher-t3')];
    expect(armoryUpgradableGunCategories(weapons)).toEqual([]);
  });
});

// 社長訂正v0.25.3297「普通に武器箱から出るようにして」: グレネードガンの通常入手は武器箱/ドロップ。
// 武器庫は従来の「Tier3未満カテゴリのTier3化」のまま、対象にglauncherを含めた4カテゴリ。
describe('armoryGrantKeys(v0.25.3297・4カテゴリのTier3化)', () => {
  it('未所持カテゴリは全てTier3候補(glauncher含む)', () => {
    const weapons = [createWeapon('handgun-t1'), createWeapon('knife-t1')];
    expect(armoryGrantKeys(weapons)).toEqual(['handgun-t3', 'shotgun-t3', 'rifle-t3', 'glauncher-t3']);
  });

  it('glauncher-t3所持ならglauncherは候補から外れる', () => {
    const weapons = [createWeapon('handgun-t1'), createWeapon('glauncher-t3')];
    expect(armoryGrantKeys(weapons)).toEqual(['handgun-t3', 'shotgun-t3', 'rifle-t3']);
  });

  it('4カテゴリ全てt3 → 空(返金ケース維持)', () => {
    const weapons = [
      createWeapon('handgun-t3'), createWeapon('shotgun-t3'),
      createWeapon('rifle-t3'), createWeapon('glauncher-t3'),
    ];
    expect(armoryGrantKeys(weapons)).toEqual([]);
  });
});
