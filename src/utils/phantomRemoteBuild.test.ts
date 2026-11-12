// 他人の記録から作る幻影(pickPhantomIdentity の remote)は、記録主の持ち物をそのまま持つ
// (社長裁定「幻影にも新しい銃・スキル・サブウェポンを持たせる」)。旧: 共有の正規化を広げる前の集合へ絞っていた(phantomLegacyBuild.ts・撤去)。
// ここで固定する事:
//  - 新しい銃・スキル・サブウェポン・アバター・技への反応のキーが、幻影の人格と疑似プレイヤーに残る。元の記録(守護霊も使う)は書き換わらない。
//  - 固定の先人守護霊20体・固有の幻影(孫悟空)の入口は今のまま(remote の道を通らない)。
//  - 金環・格闘を持つ他人の幻影は、金環も格闘の台本も出さない(白リスト外・格闘は印 phantomUnique だけで動く)。
//  - 英雄を持つ幻影は、体力50%以上の間だけ与ダメと足の速さに英雄の倍率が乗る(今の式のとおり)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PlayerProfile } from './playerTraits';

const remoteRef: { profile: PlayerProfile | null } = { profile: null };
vi.mock('./ghostOnline', async (orig) => ({
  ...(await orig<typeof import('./ghostOnline')>()),
  resolveRemoteGhost: () => (remoteRef.profile
    ? { source: 'random', recordId: 'r1', slot: 'thor', poolSize: 1, profile: remoteRef.profile }
    : null),
}));

import { sanitizeSharedProfile, GHOST_PROFILE_DEFAULTS } from '../../shared/ghostSanitize.mjs';
import { pickPhantomIdentity, pickFixedPhantom, clearPhantomIdentity, setPhantomIdentity } from './phantomIdentity';
import { actorBuildFor, clearGhostBuildCache } from './ghostBuild';
import { useGameStore, combatActorPlayer, HERO_SKILL_MULT } from '../store/gameStore';
import { FIXED_GUARDIANS } from '../data/fixedGuardians';
import { UNIQUE_PHANTOMS } from '../data/uniquePhantoms';
import { spawnEnemyAt } from './enemyUtils';
import {
  phantomAtkMults, phantomMoveSpeed, phantomSupportsSub, runPhantomTick, createPhantomTickState, NOOP_PHANTOM_SFX,
} from './phantomTick';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy, PlayerBuildSnapshot } from '../types/game';

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

// 広げた許可リストで新しく通るようになった値を混ぜた記録。
const mixedSnap = {
  gunKeys: ['glauncher-t1', 'shotgun-t2', 'handgun-t2-handcannon', 'rifle-t1'],
  activeGunKey: 'glauncher-t1',
  skills: ['shukuchi', 'knight', 'super-armor', 'reflex', 'hero'],
  skillLevels: { shukuchi: 2, knight: 3, 'super-armor': 1, reflex: 2, hero: 1 },
  subWeapons: ['gold-ring', 'katana', 'brawler'],
  subWeaponLevels: { 'gold-ring': 3, katana: 2, brawler: 3 },
  avatarId: 'devil-set',
};
const mixedMoves = { 'thor-issen': r, 'thor-dash': r, 'mimir-wheel': r, 'g-stomp': r, 'phill-meteor': r };

const GT = 10_000_000;
const ORIGIN = 50_000;
const place = (snapshot: PlayerBuildSnapshot, healthFrac = 1): Enemy => {
  const e = spawnEnemyAt('guardian-phantom', ORIGIN, ORIGIN, GT);
  Object.assign(e, { phantomBuild: snapshot, dormant: false, bossState: 'chase', health: 100 * healthFrac, maxHealth: 100 });
  useGameStore.setState(s => ({
    enemies: [e], projectiles: [], goldRings: [], gameTime: GT,
    player: { ...s.player, x: e.x + e.width / 2 + 60, y: e.y + e.height / 2 - s.player.height / 2, health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0 },
  }));
  return e;
};

beforeEach(() => {
  remoteRef.profile = null; clearPhantomIdentity(); clearGhostBuildCache();
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.getState().resetGame('warrior');
});
afterEach(() => { vi.restoreAllMocks(); clearPhantomIdentity(); });

describe('他人の記録の幻影は、記録主の持ち物をそのまま持つ', () => {
  it('人格に新しい銃・スキル・サブウェポン・アバター・技への反応のキーが残る/元の記録は書き換わらない', () => {
    remoteRef.profile = share(mixedSnap, mixedMoves);
    const before = structuredClone(remoteRef.profile);
    const id = pickPhantomIdentity('stage-1', () => 0);
    expect(id.source).toBe('remote');
    expect(id.profile.snapshot?.gunKeys).toEqual(mixedSnap.gunKeys);
    expect(id.profile.snapshot?.activeGunKey).toBe('glauncher-t1');
    expect(id.profile.snapshot?.skills).toEqual(mixedSnap.skills);
    expect(id.profile.snapshot?.skillLevels).toEqual(mixedSnap.skillLevels);
    expect(id.profile.snapshot?.subWeapons).toEqual(mixedSnap.subWeapons);
    expect(id.profile.snapshot?.subWeaponLevels).toEqual(mixedSnap.subWeaponLevels);
    expect(id.profile.snapshot?.avatarId).toBe('devil-set');
    expect(Object.keys(id.profile.moveReactions).sort()).toEqual(Object.keys(mixedMoves).sort());
    // 守護霊(味方)も同じ候補を使う=元の記録は1bitも変わらない。
    expect(remoteRef.profile).toEqual(before);
  });

  it('疑似プレイヤー(actorBuildFor)も記録どおり: 新しい銃を構え、新しいスキルを持つ(格闘だけは疑似プレイヤーから外れる)', () => {
    remoteRef.profile = share(mixedSnap, mixedMoves);
    const id = pickPhantomIdentity('stage-1', () => 0);
    const b = actorBuildFor('phantom-remote', id.profile.snapshot, useGameStore.getState().player)!;
    expect(b.gun?.key).toBe('glauncher-t1');
    expect(b.player.weapons.filter(w => !w.isMelee).map(w => w.key)).toEqual(mixedSnap.gunKeys);
    expect(b.player.skills).toEqual(mixedSnap.skills);
    expect(b.player.subWeapons).toEqual(['gold-ring', 'katana']); // brawler は withoutBrawler が外す(今のまま)
  });

  it('固定の先人守護霊20体・孫悟空は remote の道を通らない=記録がそのまま人格になる', () => {
    for (let i = 0; i < FIXED_GUARDIANS.length; i++) {
      const g = FIXED_GUARDIANS[i];
      const id = pickFixedPhantom(() => (i + 0.5) / FIXED_GUARDIANS.length);
      expect(id.source).toBe('fixed');
      expect(id.profile, g.name).toBe(g.profile);
    }
    // オンライン候補が無ければ固定20体へ落ちる(remote の道は通らない)。
    expect(pickPhantomIdentity('stage-1', () => 0).source).toBe('fixed');
    expect(UNIQUE_PHANTOMS.brawler.profile.snapshot?.subWeapons).toEqual(['brawler']);
  });
});

describe('金環・格闘を持つ他人の幻影は、どちらも出さない', () => {
  it('白リストに金環・格闘は無い/疑似プレイヤーに格闘は残らない/tickを回しても金環も格闘の状態も出ない', () => {
    expect(phantomSupportsSub('gold-ring')).toBe(false);
    expect(phantomSupportsSub('brawler')).toBe(false);
    const snap = share(mixedSnap, mixedMoves).snapshot!;
    const e = place(snap);
    expect(combatActorPlayer(e.id)?.subWeapons).not.toContain('brawler');
    const s = createPhantomTickState();
    s.reachEnteredAt = -Infinity;
    let gt = GT;
    for (let i = 0; i < 120; i++) {
      gt += 50;
      useGameStore.setState({ gameTime: gt });
      const cur = useGameStore.getState().enemies.find(x => x.id === e.id);
      if (cur) runPhantomTick(cur, s, gt, 0.05, 1, gt, NOOP_PHANTOM_SFX, () => 0.999);
    }
    expect(useGameStore.getState().goldRings).toHaveLength(0);
    const cur = useGameStore.getState().enemies.find(x => x.id === e.id)!;
    expect(cur.phantomBrawler).toBeUndefined();
    expect(cur.phantomUnique).toBeUndefined();
    expect(s.brawler).toBeUndefined();
  });
});

describe('英雄を持つ幻影(今の式のとおり)', () => {
  const heroSnap = (withHero: boolean): PlayerBuildSnapshot =>
    share({ skills: withHero ? ['hero'] : [], skillLevels: withHero ? { hero: 1 } : {} }, {}).snapshot!;
  const measure = (withHero: boolean, healthFrac: number) => {
    clearGhostBuildCache();
    const e = place(heroSnap(withHero), healthFrac);
    setPhantomIdentity({ name: withHero ? 'hero' : 'plain', profile: share({}, {}), source: 'remote' });
    return { out: phantomAtkMults(e.id, undefined, GT).outgoingMult, speed: phantomMoveSpeed(e, GT) };
  };

  it('体力50%以上の間: 与ダメと足の速さに英雄の倍率が乗る', () => {
    const plain = measure(false, 1);
    const hero = measure(true, 1);
    expect(hero.out / plain.out).toBeCloseTo(HERO_SKILL_MULT, 6);
    expect(hero.speed / plain.speed).toBeCloseTo(HERO_SKILL_MULT, 6);
  });

  it('体力50%未満: 倍率は乗らない', () => {
    const plain = measure(false, 0.4);
    const hero = measure(true, 0.4);
    expect(hero.out).toBeCloseTo(plain.out, 6);
    expect(hero.speed).toBeCloseTo(plain.speed, 6);
  });
});
