import { describe, it, expect } from 'vitest';
import { resolveDesertTechAmmoType, isDesertTechDry, DESERTTECH_AMMO_PRIORITY } from './desertTechAmmo';

describe('DESERTTECH_AMMO_PRIORITY', () => {
  it('rifle → handgun → shotgun → glauncher の順(phillは含まない)', () => {
    expect(DESERTTECH_AMMO_PRIORITY).toEqual(['rifle', 'handgun', 'shotgun', 'glauncher']);
  });
});

describe('resolveDesertTechAmmoType', () => {
  it('専用弾(rifle)が残っていれば専用弾を使う', () => {
    expect(resolveDesertTechAmmoType({ rifle: 3, handgun: 10, shotgun: 10, glauncher: 10 })).toBe('rifle');
  });

  it('rifleが尽きたらhandgunを代用', () => {
    expect(resolveDesertTechAmmoType({ rifle: 0, handgun: 5, shotgun: 5, glauncher: 5 })).toBe('handgun');
  });

  it('rifle/handgunが尽きたらshotgunを代用', () => {
    expect(resolveDesertTechAmmoType({ rifle: 0, handgun: 0, shotgun: 5, glauncher: 5 })).toBe('shotgun');
  });

  it('rifle/handgun/shotgunが尽きたらglauncherを代用', () => {
    expect(resolveDesertTechAmmoType({ rifle: 0, handgun: 0, shotgun: 0, glauncher: 5 })).toBe('glauncher');
  });

  it('全て0なら専用弾(rifle)を返す(空撃ち/表示の既定)', () => {
    expect(resolveDesertTechAmmoType({ rifle: 0, handgun: 0, shotgun: 0, glauncher: 0 })).toBe('rifle');
  });
});

describe('isDesertTechDry', () => {
  it('どれか1つでも残っていればfalse', () => {
    expect(isDesertTechDry({ rifle: 0, handgun: 0, shotgun: 0, glauncher: 1 })).toBe(false);
  });

  it('全て0ならtrue', () => {
    expect(isDesertTechDry({ rifle: 0, handgun: 0, shotgun: 0, glauncher: 0 })).toBe(true);
  });
});
