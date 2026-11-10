// research/BRAWLER_PHANTOM.md §7: 拳鬼の報酬と棚の関所(純関数)。
import { describe, expect, it } from 'vitest';
import {
  SUB_BOSS_UNLOCK, SUB_OWNED_ON_GET, UNIQUE_PHANTOM_REWARD, bossSubUnlockKeyFor, bossUnlockSubKeys,
  subBlueprintToastShown, subShelfVisible,
} from './weaponSlots';
import { UNIQUE_PHANTOMS } from './uniquePhantoms';
import { FIXED_GUARDIANS } from './fixedGuardians';
import { equipmentById } from './equipment';

describe('拳鬼の報酬', () => {
  it('印のある幻影(拳鬼)を倒すと格闘', () => {
    expect(bossSubUnlockKeyFor({ type: 'guardian-phantom', phantomUnique: 'brawler' }, 'stage-3')).toBe('brawler');
    expect(UNIQUE_PHANTOM_REWARD.brawler).toBe('brawler');
  });
  it('汎用の幻影(印なし)を倒しても何も出ない', () => {
    for (const st of ['stage-1', 'stage-3', 'stage-ex1', '']) expect(bossSubUnlockKeyFor({ type: 'guardian-phantom' }, st)).toBeUndefined();
    expect(SUB_BOSS_UNLOCK['guardian-phantom']).toBeUndefined(); // 型キーに入れない
  });
  it('既存の撃破解放は今までどおり(金環・矢の雨)', () => {
    expect(bossSubUnlockKeyFor({ type: 'suriel' }, 'stage-6')).toBe('gold-ring');
    expect(bossSubUnlockKeyFor({ type: 'mutant-liberty' }, 'stage-3')).toBe('arrow-rain');
    expect(bossSubUnlockKeyFor({ type: 'giantbat' }, 'stage-3')).toBeUndefined();
  });
  it('格闘は入手と同時に Lv1 を持つ(矢の雨と同じ)', () => {
    expect(SUB_OWNED_ON_GET.has('brawler')).toBe(true);
    expect(SUB_OWNED_ON_GET.has('arrow-rain')).toBe(true);
    expect(SUB_OWNED_ON_GET.has('gold-ring')).toBe(false);
  });
  it('トースト: 新しく立った時だけ・既に買っていた人と全解放中は出さない', () => {
    expect(subBlueprintToastShown({ blueprintNew: true, purchasedBefore: 0, testUnlockAll: false })).toBe(true);
    expect(subBlueprintToastShown({ blueprintNew: false, purchasedBefore: 0, testUnlockAll: false })).toBe(false);
    expect(subBlueprintToastShown({ blueprintNew: true, purchasedBefore: 1, testUnlockAll: false })).toBe(false);
    expect(subBlueprintToastShown({ blueprintNew: true, purchasedBefore: 0, testUnlockAll: true })).toBe(false);
  });
});

describe('棚の関所', () => {
  const gated = bossUnlockSubKeys();
  it('関所の集合 = SUB_BOSS_UNLOCK の値 ∪ 固有の幻影の報酬(格闘が入る)', () => {
    expect(gated.has('brawler')).toBe(true);
    for (const v of Object.values(SUB_BOSS_UNLOCK)) expect(gated.has(v!)).toBe(true);
    expect(gated.has('katana')).toBe(false);
  });
  it('設計図が無ければ並べない・設計図があれば並べる・既に買った人は並べ続ける', () => {
    expect(subShelfVisible('brawler', gated, false, 0)).toBe(false);
    expect(subShelfVisible('brawler', gated, true, 0)).toBe(true);
    expect(subShelfVisible('brawler', gated, false, 1)).toBe(true);
    expect(subShelfVisible('katana', gated, false, 0)).toBe(true); // 関所の外は今までどおり
  });
});

describe('拳鬼の台帳', () => {
  const k = UNIQUE_PHANTOMS.brawler;
  it('名前は固定20人と重ならない(人格のキャッシュが名前で引く)', () => {
    expect(FIXED_GUARDIANS.some(g => g.name === k.name)).toBe(false);
    expect(k.profile.srcName).toBe(k.name);
  });
  it('ストライカー・ファイティングナイフ・3段目の装備・タイムキーパーLv3+オーバークロックLv3・サブは格闘のみ', () => {
    const snap = k.profile.snapshot!;
    expect(snap.characterClass).toBe('rogue');
    expect(snap.meleeKey).toBe('machete-t3');
    expect(snap.equipment).toEqual({ body: 'body-mobility-3', arms: 'arms-firepower-3', accessory: 'accessory-crit-3' });
    for (const [slot, id] of Object.entries(snap.equipment!)) expect(equipmentById(id)?.slot).toBe(slot);
    expect(snap.skills).toEqual(['time-keeper', 'overclock']);
    expect(snap.skillLevels).toEqual({ 'time-keeper': 3, overclock: 3 });
    expect(snap.subWeapons).toEqual(['brawler']);
    expect(snap.subWeaponLevels).toEqual({ brawler: 3 });
    expect(snap.avatarId).toBeUndefined(); // 専用の絵があるので仮のアバターは付けない(社長支給2026-11-10)
  });
  it('固定20人には入れない', () => {
    expect(FIXED_GUARDIANS.some(g => g.profile === k.profile)).toBe(false);
  });
});
