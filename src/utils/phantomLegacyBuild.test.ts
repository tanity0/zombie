// 幻影の持ち物は、共有の正規化の許可リストを広げる前のまま(phantomLegacyBuild.ts・社長の裁定待ち)。
// 「新しい銃・スキル・サブウェポンを含む他人の記録」を幻影の入口(pickPhantomIdentity の remote)に通すと、
// 直す前の正規化を通した時と同じ持ち物になる事を固定する。
// 直す前の正規化の出力 = 「いまの正規化に、広げる前の集合の値だけを入れた記録」を通した出力(今回広げたのは許可リストの中身だけ)。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PlayerProfile } from './playerTraits';

const remoteRef: { profile: PlayerProfile | null } = { profile: null };
vi.mock('./ghostOnline', async (orig) => ({
  ...(await orig<typeof import('./ghostOnline')>()),
  resolveRemoteGhost: () => (remoteRef.profile
    ? { source: 'random', recordId: 'r1', slot: 'thor', poolSize: 1, profile: remoteRef.profile }
    : null),
}));

import { sanitizeSharedProfile, GHOST_PROFILE_DEFAULTS } from '../../shared/ghostSanitize.mjs';
import { pickPhantomIdentity, clearPhantomIdentity } from './phantomIdentity';
import {
  phantomLegacyProfile, phantomLegacySnapshot,
  PHANTOM_LEGACY_GUNS, PHANTOM_LEGACY_SKILLS, PHANTOM_LEGACY_SUB_WEAPONS, PHANTOM_LEGACY_MOVE_KEYS,
} from './phantomLegacyBuild';
import { actorBuildFor, clearGhostBuildCache } from './ghostBuild';
import { useGameStore } from '../store/gameStore';
import { FIXED_GUARDIANS } from '../data/fixedGuardians';
import { UNIQUE_PHANTOMS } from '../data/uniquePhantoms';

const share = (snapshot: Record<string, unknown>, moveReactions: Record<string, unknown>): PlayerProfile => {
  const snap = { maxHealth: 130, speed: 3, level: 5, meleeKey: 'machete-t3', characterClass: 'rogue', ...snapshot };
  const safe = sanitizeSharedProfile({
    v: 1, runs: 1, moveReactions, subStyles: {}, srcName: 'たろう', snapshot: snap,
    bossStyles: { thor: { ...GHOST_PROFILE_DEFAULTS, subStyles: {}, at: 1, snapshot: snap } },
  }, 'thor') as PlayerProfile | null;
  expect(safe).not.toBeNull();
  return safe!;
};
const r = { n: 3, counterRate: 0.5, hitRate: 0.2 };

// 新しい値(今回の是正で通るようになった物)を混ぜた記録。
const mixedSnap = {
  gunKeys: ['glauncher-t1', 'shotgun-t2', 'handgun-t2-handcannon', 'rifle-t1'],
  activeGunKey: 'glauncher-t1',
  skills: ['shukuchi', 'knight', 'super-armor', 'reflex', 'hero'],
  skillLevels: { shukuchi: 2, knight: 3, 'super-armor': 1, reflex: 2, hero: 1 },
  subWeapons: ['gold-ring', 'katana', 'brawler'],
  subWeaponLevels: { 'gold-ring': 3, katana: 2, brawler: 3 },
  avatarId: 'devil-set',
};
const mixedMoves = { 'thor-issen': r, 'thor-dash': r, 'mimir-wheel': r, 'g-stomp': r };
// 同じ記録から、広げる前の集合に無い値を手で抜いた物(=直す前の正規化が残した物)。
const legacySnap = {
  gunKeys: ['shotgun-t2', 'rifle-t1'],
  skills: ['knight', 'reflex'],
  skillLevels: { knight: 3, reflex: 2 },
  subWeapons: ['katana'],
  subWeaponLevels: { katana: 2 },
  avatarId: null,
};
const legacyMoves = { 'thor-issen': r, 'g-stomp': r };

beforeEach(() => { remoteRef.profile = null; clearPhantomIdentity(); clearGhostBuildCache(); });

describe('幻影の持ち物は広げる前のまま', () => {
  it('他人の守護霊(味方)の記録には新しい値が載っている(前提)', () => {
    const p = share(mixedSnap, mixedMoves);
    expect(p.snapshot?.gunKeys).toEqual(mixedSnap.gunKeys);
    expect(p.snapshot?.skills).toEqual(mixedSnap.skills);
    expect(p.snapshot?.subWeapons).toEqual(mixedSnap.subWeapons);
    expect(p.snapshot?.avatarId).toBe('devil-set');
    expect(Object.keys(p.moveReactions).sort()).toEqual(Object.keys(mixedMoves).sort());
  });

  it('幻影の入口(pickPhantomIdentity の remote)を通すと、直す前の正規化の出力と同じ記録になる', () => {
    remoteRef.profile = share(mixedSnap, mixedMoves);
    const id = pickPhantomIdentity('stage-1', () => 0);
    expect(id.source).toBe('remote');
    const before = share(legacySnap, legacyMoves);
    expect(id.profile.snapshot).toEqual(before.snapshot);
    expect(id.profile.moveReactions).toEqual(before.moveReactions);
    // 味方側が読む元の記録は書き換えない(同じ候補を守護霊も使う)。
    expect(remoteRef.profile.snapshot?.gunKeys).toEqual(mixedSnap.gunKeys);
    expect(Object.keys(remoteRef.profile.moveReactions)).toHaveLength(4);
  });

  it('幻影の疑似プレイヤー(actorBuildFor)も直す前と同じ持ち物', () => {
    remoteRef.profile = share(mixedSnap, mixedMoves);
    const id = pickPhantomIdentity('stage-1', () => 0);
    useGameStore.getState().resetGame('warrior');
    const live = useGameStore.getState().player;
    const now = actorBuildFor('phantom-now', id.profile.snapshot, live)!;
    const before = actorBuildFor('phantom-before', share(legacySnap, legacyMoves).snapshot, live)!;
    const keysOf = (b: typeof now) => b.player.weapons.map(w => w.key);
    expect(keysOf(now)).toEqual(keysOf(before));
    expect(now.gun?.key).toBe(before.gun?.key);
    expect(now.melee?.key).toBe(before.melee?.key);
    expect(now.player.skills).toEqual(before.player.skills);
    expect(now.player.skillLevels).toEqual(before.player.skillLevels);
    expect(now.player.subWeapons).toEqual(before.player.subWeapons);
    expect(now.player.subWeaponLevels).toEqual(before.player.subWeaponLevels);
  });

  it('新しく通る銃だけの記録は、直す前と同じく銃を持たない(gunKeys=[])', () => {
    const p = share({ gunKeys: ['glauncher-t2-blob'], activeGunKey: 'glauncher-t2-blob' }, {});
    const s = phantomLegacySnapshot(p.snapshot!);
    expect(s).toEqual(share({ gunKeys: [] }, {}).snapshot);
    expect(s.gunKeys).toEqual([]);
    expect(s).not.toHaveProperty('activeGunKey');
  });

  it('固定の先人守護霊20体・固有の幻影(拳鬼)は絞る対象ではない(入口は remote だけ)', () => {
    // 固定の20体は広げる前の集合の中だけで組まれている=仮に通しても変わらない(念のための縛り)。
    for (const g of FIXED_GUARDIANS) {
      expect(phantomLegacyProfile(g.profile).snapshot, g.name).toEqual(g.profile.snapshot);
    }
    // 拳鬼は格闘(brawler)を持つ=広げる前の集合に無い。絞ると格闘が消えるので、入口を remote に限っている。
    expect(UNIQUE_PHANTOMS.brawler.profile.snapshot?.subWeapons).toContain('brawler');
    expect(PHANTOM_LEGACY_SUB_WEAPONS.has('brawler')).toBe(false);
  });

  it('広げる前の集合は今の許可リストの部分集合(台帳から消えた値が残っていない)', async () => {
    const m = await import('../../shared/ghostSanitize.mjs');
    for (const [legacy, now] of [
      [PHANTOM_LEGACY_GUNS, m.GHOST_GUN_KEYS], [PHANTOM_LEGACY_SKILLS, m.GHOST_SKILL_KEYS],
      [PHANTOM_LEGACY_SUB_WEAPONS, m.GHOST_SUB_WEAPON_KEYS], [PHANTOM_LEGACY_MOVE_KEYS, m.GHOST_MOVE_KEYS],
    ] as const) {
      for (const k of legacy) expect(now as readonly string[]).toContain(k);
    }
  });
});
