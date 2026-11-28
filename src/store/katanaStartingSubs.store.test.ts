// 社長指示2026-11-22「刀装備時も、初期装備サブウェポンは活きで」。
// 出撃した時に持っていたサブ(Player.startingSubWeapons = resetGame の runSubs)は、刀/村雨を持っても止めない。
// 出撃の途中で手に入れたサブは今までどおり止める。刀を持っていない時は何も変わらない。守護霊・幻影の疑似プレイヤーも同じ。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, subWeaponBlockedByKatana } from './gameStore';
import { snapshotPlayerBuild } from '../utils/playerBuild';
import { resolveGhostBuild, clearGhostBuildCache } from '../utils/ghostBuild';
import { FIXED_GUARDIANS } from '../data/fixedGuardians';
import { classSubWeaponFor } from '../data/campaign';
import type { Player, SubWeaponKey } from '../types/game';

const st = () => useGameStore.getState();
const fresh = (): Player => { st().resetGame('warrior'); return st().player; };
const withSubs = (p: Player, subs: SubWeaponKey[]): Player => ({
  ...p, subWeapons: subs, subWeaponLevels: Object.fromEntries(subs.map(k => [k, 1])),
});

beforeEach(() => clearGhostBuildCache());

describe('出撃時のサブの控え', () => {
  it('出撃した時の所持サブがそのまま控えになる(戦士=手榴弾)', () => {
    const p = fresh();
    expect(p.startingSubWeapons).toEqual(p.subWeapons);
    expect(p.startingSubWeapons).toContain(classSubWeaponFor('warrior'));
  });
  it('途中で買ったサブは控えに入らない', () => {
    fresh();
    useGameStore.setState(s => ({ unlockedShopSkillCards: { ...s.unlockedShopSkillCards, turret: 1 }, player: { ...s.player, straps: 9999 } }));
    st().buySkillCardFromShop('turret');
    expect(st().player.subWeapons).toContain('turret');
    expect(st().player.startingSubWeapons).not.toContain('turret');
  });
});

describe('刀を持っても出撃時のサブは止まらない', () => {
  for (const sword of ['katana', 'murasame'] as const) {
    it(`${sword}: 出撃時の手榴弾は止まらない・途中で取ったタレットは止まる`, () => {
      const p = withSubs(fresh(), ['heavy-grenade', sword, 'turret']);
      expect(subWeaponBlockedByKatana(p, 'heavy-grenade')).toBe(false);
      expect(subWeaponBlockedByKatana(p, 'turret')).toBe(true);
      expect(subWeaponBlockedByKatana(p, sword)).toBe(false);
      expect(subWeaponBlockedByKatana(p, 'striker-hunting')).toBe(false); // 許可制の枠は今までどおり
    });
  }
  it('途中で刀を買っても、出撃時のサブは外れずに動く(途中で取ったサブは外れる=今までどおり)', () => {
    fresh();
    useGameStore.setState(s => ({
      unlockedShopSkillCards: { ...s.unlockedShopSkillCards, katana: 1 },
      player: { ...s.player, straps: 9999, subWeapons: [...s.player.subWeapons, 'turret'], subWeaponLevels: { ...s.player.subWeaponLevels, turret: 1 } },
    }));
    st().buySkillCardFromShop('katana');
    const p = st().player;
    expect(p.subWeapons).toContain('katana');
    expect(p.subWeapons).toContain('heavy-grenade');
    expect(p.subWeapons).not.toContain('turret');
    expect(subWeaponBlockedByKatana(p, 'heavy-grenade')).toBe(false);
  });
  it('ダンスフロアの排他は今までどおり効く(刀+ダンスフロアでも出撃時のサブは止まる)', () => {
    const p = withSubs(fresh(), ['heavy-grenade', 'katana', 'shijin']);
    expect(subWeaponBlockedByKatana(p, 'heavy-grenade')).toBe(true);
    expect(subWeaponBlockedByKatana(p, 'katana')).toBe(false);
  });
});

describe('刀を持っていない時は何も変わらない', () => {
  it('出撃時のサブも途中のサブも止まらない', () => {
    const p = withSubs(fresh(), ['heavy-grenade', 'turret']);
    expect(subWeaponBlockedByKatana(p, 'heavy-grenade')).toBe(false);
    expect(subWeaponBlockedByKatana(p, 'turret')).toBe(false);
  });
  it('ダンスフロアは出撃時のサブでも止める(今までどおり)', () => {
    const p = withSubs(fresh(), ['heavy-grenade', 'shijin']);
    expect(subWeaponBlockedByKatana(p, 'heavy-grenade')).toBe(true);
    expect(subWeaponBlockedByKatana(p, 'shijin')).toBe(false);
  });
});

describe('守護霊・幻影の疑似プレイヤーも本体と同じ', () => {
  it('記録に控えが入り、刀の霊でも出撃時のサブは止まらない・途中のサブは止まる', () => {
    const run = withSubs(fresh(), ['heavy-grenade', 'katana', 'turret']);
    const snap = snapshotPlayerBuild(run);
    expect(snap.startingSubWeapons).toEqual(run.startingSubWeapons);
    const ghost = resolveGhostBuild(snap, fresh(), { guardian: true }).player;
    expect(subWeaponBlockedByKatana(ghost, 'heavy-grenade')).toBe(false);
    expect(subWeaponBlockedByKatana(ghost, 'turret')).toBe(true);
  });
  it('召喚した本人の控えは霊に乗らない(記録の控えだけを見る)', () => {
    const run = { ...withSubs(fresh(), ['turret', 'katana']), startingSubWeapons: [] as SubWeaponKey[] };
    const live = { ...fresh(), startingSubWeapons: ['turret'] as SubWeaponKey[] };
    const ghost = resolveGhostBuild(snapshotPlayerBuild(run), live).player;
    expect(subWeaponBlockedByKatana(ghost, 'turret')).toBe(true);
  });
  it('固定の守護霊(小烏丸持ち)は職業のサブも最初からの装備=止まらない', () => {
    const g = FIXED_GUARDIANS.find(x => x.profile.snapshot?.subWeapons?.includes('murasame'));
    expect(g).toBeDefined();
    const ghost = resolveGhostBuild(g!.profile.snapshot ?? undefined, fresh(), { guardian: true }).player;
    expect(subWeaponBlockedByKatana(ghost, classSubWeaponFor(g!.classId))).toBe(false);
  });
});
