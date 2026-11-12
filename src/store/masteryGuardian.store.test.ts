// 熟練度: 守護霊に記録した時点の熟練度を乗せる(発注「守護霊に載せます」)。幻影(敵)には乗せない(「幻影にはこちらの武器も熟練値を乗せない」)。
// 純関数(normalizeMasteryRecord 等)は utils/mastery.test.ts。ここは配線(記録→復元→守護霊の当たり・貯めない・幻影の打ち消し)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ボットの出撃の旗は URL から1回だけ読む定数なので、テストでは差し替える(既定=ボットでない)。
const botFlag = vi.hoisted(() => ({ on: false }));
vi.mock('../utils/botFlag', () => ({ BOT_PARAM: null, isBotRun: () => botFlag.on }));

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => { mem.clear(); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;

const { useGameStore, combatActorPlayer, meleeSwingBaseDamage, BOSS_MELEE_STUN_MULT } = await import('./gameStore');
const { setSelectedStageId } = await import('../data/progress');
const { saveMastery, masteryNeedFor, masteryMultOf } = await import('../utils/mastery');
const { withMastery, getPendingMastery, getMasteryReport } = await import('../utils/masteryRun');
const { spawnEnemyAt } = await import('../utils/enemyUtils');
const { clearGhostBuildCache, actorBuildFor, ghostBuildFor } = await import('../utils/ghostBuild');
const { buildPseudoPlayer, snapshotPlayerBuild } = await import('../utils/playerBuild');
const { counterMasteryKeyOf } = await import('../utils/weaponUtils');
const { guardianMasteryMult } = await import('../utils/mastery');
import type { GrowingMasteryKey, MasteryKey } from '../data/mastery';
import type { PlayerBuildSnapshot, Summon } from '../types/game';

const st = () => useGameStore.getState();
const sortie = () => st().resetGame('warrior');
const xpForLevel = (k: GrowingMasteryKey, lv: number): number => {
  let sum = 0;
  for (let l = 1; l < lv; l++) sum += masteryNeedFor(k, l);
  return sum;
};

const GID = 'ghost-mastery';
const GX = 2400, GY = 2400; // プレイヤー(初期位置)から十分離す

const snap = (extra: Partial<PlayerBuildSnapshot> = {}): PlayerBuildSnapshot => ({
  maxHealth: 100, speed: 200, level: 1,
  gunKeys: ['handgun-t1'], activeGunKey: 'handgun-t1', meleeKey: 'knife-t1',
  subWeapons: [], subWeaponLevels: {},
  ...extra,
});
const ghostAt = (build: PlayerBuildSnapshot): Summon => ({
  id: GID, x: GX, y: GY, width: 32, height: 32, speed: 200,
  health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
  createdAt: Date.now(), lastHit: 0, ghostBossId: 'boss-x', ghostBuild: build,
});
const place = (build: PlayerBuildSnapshot) => {
  clearGhostBuildCache();
  useGameStore.setState({ summons: [ghostAt(build)] });
};
/** 守護霊の横に気絶したボス級(giantbat)を1体置く。 */
const putStunnedBoss = () => {
  const gt = st().gameTime;
  const e = { ...spawnEnemyAt('giantbat', GX + 20, GY, 0), id: 'e1', stunUntil: gt + 5000, health: 99999, maxHealth: 99999 };
  useGameStore.setState({ enemies: [e] });
};
/** 守護霊の素の近接(熟練度なし)のフィニッシュ×5 の値。 */
const ghostBossFinishBase = (): number => {
  const actor = combatActorPlayer(GID)!;
  return meleeSwingBaseDamage(actor.weapons.find(w => w.isMelee), actor) * (actor.growthAtkMult ?? 1) * BOSS_MELEE_STUN_MULT;
};
const hpOf = (id: string) => st().enemies.find(e => e.id === id)?.health ?? 0;

beforeEach(() => {
  mem.clear();
  setSelectedStageId('stage-1');
  st().setBenchmarkRun(false);
  st().setPendingFarBackdrop('');
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
  sortie();
});
afterEach(() => { vi.restoreAllMocks(); st().setBenchmarkRun(false); st().setPendingFarBackdrop(''); botFlag.on = false; });

describe('記録(snapshotPlayerBuild)', () => {
  it('記録する時点の本人の焼き値を写す(写し=生きた参照ではない)', () => {
    saveMastery({ xp: { melee: xpForLevel('melee', 6) } }); // ×1.5
    sortie();
    const p = st().player;
    const rec = snapshotPlayerBuild(p);
    expect(rec.masteryMult?.melee).toBeCloseTo(1.5, 10);
    expect(rec.masteryLoadoutMult).toBe(p.masteryLoadoutMult);
    expect(rec.masteryMult).not.toBe(p.masteryMult);
  });
  it('無視する出撃(チュートリアル=練習と同じ扱い)で作った記録は、保存の段階の値(与ダメの焼き値は {}=倍率1のまま)', () => {
    saveMastery({ xp: { melee: xpForLevel('melee', 6) } }); // ×1.5
    st().setPendingFarBackdrop('tutorial');
    sortie();
    const p = st().player;
    expect(p.masteryMult).toEqual({});
    expect(p.masteryLoadoutMult).toBe(1);
    const rec = snapshotPlayerBuild(p);
    expect(rec.masteryMult?.melee).toBeCloseTo(1.5, 10);
    expect(rec.masteryMult?.max).toBeCloseTo(1.9, 10);
    expect(rec.masteryLoadoutMult).toBeGreaterThan(1);
    expect(rec.masteryLoadoutMult).toBeLessThanOrEqual(1.5);
    // その出撃の中の守護霊は今までどおり倍率1(変えるのは記録へ写す値だけ)。
    place(snap({ masteryMult: { melee: 1.5 } }));
    expect(masteryMultOf(combatActorPlayer(GID)!, 'melee')).toBe(1);
  });
  it('ボットの出撃で作った記録は {}/1(記録を汚さない)', () => {
    saveMastery({ xp: { melee: xpForLevel('melee', 10) } });
    botFlag.on = true;
    sortie();
    const rec = snapshotPlayerBuild(st().player);
    expect(rec.masteryMult).toEqual({});
    expect(rec.masteryLoadoutMult).toBe(1);
  });
  it('無視する出撃(ベンチ)で作った記録は {}/1', () => {
    saveMastery({ xp: { melee: xpForLevel('melee', 10) } });
    st().setBenchmarkRun(true);
    sortie();
    const rec = snapshotPlayerBuild(st().player);
    expect(rec.masteryMult).toEqual({});
    expect(rec.masteryLoadoutMult).toBe(1);
  });
});

describe('守護霊の当たり', () => {
  it('(a) 記録に熟練度がある守護霊のフィニッシュは、記録の倍率どおり増える', () => {
    place(snap({ masteryMult: { melee: 1.5 }, masteryLoadoutMult: 1.2 }));
    expect(masteryMultOf(combatActorPlayer(GID)!, 'melee')).toBeCloseTo(1.5, 10);
    expect(masteryMultOf(combatActorPlayer(GID)!, 'loadout')).toBeCloseTo(1.2, 10);
    putStunnedBoss();
    const expected = Math.max(1, Math.round(ghostBossFinishBase() * 1.5));
    const r = st().applyGhostMeleeFinisher(GID, 'e1');
    expect(r?.kind).toBe('boss');
    expect(r?.dmg).toBe(expected);
    expect(99999 - hpOf('e1')).toBe(expected);
  });

  it('(b) 古い記録(欄が無い)の守護霊は今と同じ(倍率1)', () => {
    place(snap());
    const actor = combatActorPlayer(GID)!;
    expect(actor.masteryMult).toEqual({});
    expect(actor.masteryLoadoutMult).toBe(1);
    putStunnedBoss();
    const expected = Math.max(1, Math.round(ghostBossFinishBase()));
    expect(st().applyGhostMeleeFinisher(GID, 'e1')?.dmg).toBe(expected);
  });

  it('(c) 守護霊の与ダメはどの熟練度にも貯まらない(報告用の表にも入らない)', () => {
    place(snap({ masteryMult: { melee: 1.9, 'drone-boomerang': 1.9 }, masteryLoadoutMult: 1.9 }));
    putStunnedBoss();
    st().applyGhostMeleeFinisher(GID, 'e1');
    expect(hpOf('e1')).toBeLessThan(99999);
    expect(getPendingMastery()).toEqual({});
    expect(getMasteryReport()).toEqual({});
  });

  it('(f) 本人の今の熟練度は守護霊に乗らない(記録が空なら、本人が Lv10 でも倍率1)', () => {
    saveMastery({ xp: { melee: xpForLevel('melee', 10) } });
    sortie();
    expect(masteryMultOf(st().player, 'melee')).toBeCloseTo(1.9, 10);
    place(snap());
    expect(masteryMultOf(combatActorPlayer(GID)!, 'melee')).toBe(1);
    putStunnedBoss();
    const expected = Math.max(1, Math.round(ghostBossFinishBase()));
    expect(st().applyGhostMeleeFinisher(GID, 'e1')?.dmg).toBe(expected);
  });

  it('守護霊が作った物(ドローンブーメラン)は、作る所で記録の倍率を持つ・貯めるキーは none', () => {
    place(snap({ subWeapons: ['drone-boomerang'], subWeaponLevels: { 'drone-boomerang': 1 }, masteryMult: { 'drone-boomerang': 1.4 } }));
    expect(st().fireGhostMeleeSwingSubs(GID).boomerang).toBe(true);
    const boom = st().projectiles.find(p => p.weaponType === 'drone-boomerang-projectile')!;
    expect(boom.masteryKey).toBe('none');
    expect(boom.masteryMult).toBeCloseTo(1.4, 10);
  });

  it('無視する出撃(ベンチ)では、守護霊の倍率も1', () => {
    st().setBenchmarkRun(true);
    sortie();
    place(snap({ masteryMult: { melee: 1.5 }, masteryLoadoutMult: 1.5 }));
    expect(masteryMultOf(combatActorPlayer(GID)!, 'melee')).toBe(1);
    expect(masteryMultOf(combatActorPlayer(GID)!, 'loadout')).toBe(1);
  });

  it('守護霊が投げた救急鞄は記録の倍率・貯めない(本人の鞄は本人の倍率で貯まる)', () => {
    const p = st().player;
    const e = { ...spawnEnemyAt('zombie', p.x + 200, p.y, 0), id: 'z', health: 99999, maxHealth: 99999 };
    useGameStore.setState({ enemies: [e] });
    const tgt = { id: 'z', x: e.x + e.width / 2, y: e.y + e.height / 2 };
    st().spawnThrownBag(tgt.x, tgt.y, tgt, 100);
    useGameStore.setState(s => ({ gameTime: s.gameTime + 5000 }));
    st().tickThrownBags();
    const own = 99999 - hpOf('z');
    expect(own).toBeGreaterThan(0);
    expect(getPendingMastery()['first-aid-kit'] ?? 0).toBeGreaterThan(0);

    sortie();
    useGameStore.setState({ enemies: [{ ...e, health: 99999 }] });
    st().spawnThrownBag(tgt.x, tgt.y, tgt, 100, 1.5);
    useGameStore.setState(s => ({ gameTime: s.gameTime + 5000 }));
    st().tickThrownBags();
    expect(99999 - hpOf('z')).toBe(Math.max(1, Math.round(own * 1.5)));
    expect(getPendingMastery()).toEqual({});
  });
});

describe('守護霊の物から出た子は、親の倍率を写し貯めるキーは none', () => {
  const putZombie = () => {
    const p = st().player;
    const e = { ...spawnEnemyAt('zombie', p.x + 200, p.y, 0), id: 'z', health: 99999, maxHealth: 99999 };
    useGameStore.setState({ enemies: [e] });
    return e;
  };
  it('救急鞄のボマーの子: 守護霊の鞄=none と鞄の倍率・本人の鞄=heavy-grenade のまま', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // ボマーを必ず発動させる
    useGameStore.setState(s => ({ player: { ...s.player, skills: [...s.player.skills, 'bomber'], skillLevels: { ...s.player.skillLevels, bomber: 3 } } }));
    const e = putZombie();
    const tgt = { id: 'z', x: e.x + e.width / 2, y: e.y + e.height / 2 };
    const minis = () => st().projectiles.filter(q => q.id.startsWith('proj-bomber-mini-bag-'));
    st().spawnThrownBag(tgt.x, tgt.y, tgt, 100, 1.5);
    useGameStore.setState(s => ({ gameTime: s.gameTime + 5000 }));
    st().tickThrownBags();
    expect(minis().length).toBeGreaterThan(0);
    for (const m of minis()) { expect(m.masteryKey).toBe('none'); expect(m.masteryMult).toBe(1.5); }
    useGameStore.setState({ projectiles: [] });
    st().spawnThrownBag(tgt.x, tgt.y, tgt, 100);
    useGameStore.setState(s => ({ gameTime: s.gameTime + 5000 }));
    st().tickThrownBags();
    expect(minis().length).toBeGreaterThan(0);
    for (const m of minis()) { expect(m.masteryKey).toBe('heavy-grenade'); expect(m.masteryMult).toBeUndefined(); }
  });
  it('守護霊の弾から出た炎床(延焼弾): 燃焼の強さに親の倍率・燃焼にも倍率を持たせ・貯まらない', () => {
    const fireBurn = (mult?: number) => {
      sortie();
      const e = putZombie();
      st().spawnGroundFire(e.x + e.width / 2, e.y + e.height / 2, undefined, undefined, 'none', mult);
      st().tickGroundFires();
      return st().enemies.find(x => x.id === 'z')!;
    };
    const base = fireBurn();
    expect(base.burnMasteryMult).toBeUndefined();
    const ghosted = fireBurn(1.5);
    expect(ghosted.burnMasteryKey).toBe('none');
    expect(ghosted.burnMasteryMult).toBe(1.5);
    expect(ghosted.burnDpsTick).toBe(Math.max(1, Math.round((base.burnDpsTick ?? 0) * 1.5)));
    useGameStore.setState(s => ({ gameTime: s.gameTime + 1000 }));
    st().tickBurningEnemies();
    expect(hpOf('z')).toBeLessThan(99999);
    expect(getPendingMastery()).toEqual({});
  });
});

describe('幻影(敵として出る記録)', () => {
  it('(d) 幻影の疑似プレイヤーは、記録に熟練度があっても倍率1({}/1)', () => {
    const live = st().player;
    const rec = snap({ masteryMult: { melee: 1.9, handgun: 1.9 }, masteryLoadoutMult: 1.9 });
    const b = actorBuildFor('phantom-x', rec, live)!;
    expect(b.player.masteryMult).toEqual({});
    expect(b.player.masteryLoadoutMult).toBe(1);
    expect(buildPseudoPlayer(rec, live).masteryMult).toEqual({}); // 既定(guardian 省略)も {}
    // 同じ記録を守護霊として呼べば記録の値。
    place(rec);
    const g = ghostBuildFor(st().summons[0], live)!;
    expect(g.player.masteryMult?.melee).toBeCloseTo(1.9, 10);
    expect(g.player.masteryLoadoutMult).toBeCloseTo(1.9, 10);
  });

  it('(e) 相手が幻影なら、守護霊の当たりに掛けた倍率は入口で打ち消される(熟練度なしと同じ)', () => {
    const p = st().player;
    const spawnPhantom = () => {
      const e = spawnEnemyAt('guardian-phantom', p.x + p.width / 2 + 60, p.y + p.height / 2, st().gameTime);
      e.health = 99999; e.maxHealth = 99999; e.id = 'z';
      useGameStore.setState({ enemies: [e] });
    };
    const hit = (dmg: number, mk: MasteryKey, mult?: number) => {
      spawnPhantom();
      withMastery(mk, () => st().damageEnemy('z', dmg, false, false, false, null, 'ghost'), mult !== undefined ? { mult } : undefined);
      return 99999 - hpOf('z');
    };
    const base = hit(100, 'none');
    expect(base).toBeGreaterThan(0);
    sortie();
    expect(hit(150, 'none', 1.5)).toBeCloseTo(base, 6);
    expect(getPendingMastery()).toEqual({});
  });
});

// 守護霊の反撃の請求(useGameLoop の setGhostCounterClaim 2か所)と同じ決め方: 主語=守護霊の疑似プレイヤー。
// 守護霊は格闘を使わない(疑似プレイヤーから 'brawler' が外れる)=melee。倍率は記録の melee、貯めるキーは none(ghostCounter.applyGhostCounterEffect)。
describe('守護霊の反撃(カウンター)', () => {
  it('格闘を記録した守護霊でもキーは melee・倍率は記録の melee・どこにも貯まらない', () => {
    place(snap({ subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 }, masteryMult: { melee: 1.5, brawler: 1.8, handgun: 1.3 }, masteryLoadoutMult: 1.2 }));
    const ghostOwner = combatActorPlayer(GID)!;
    expect(ghostOwner.subWeapons ?? []).not.toContain('brawler');
    const key = counterMasteryKeyOf(ghostOwner);
    expect(key).toBe('melee');
    const mm = guardianMasteryMult(ghostOwner, key);
    expect(mm).toBeCloseTo(1.5, 10);
    putStunnedBoss();
    withMastery('none', () => st().damageEnemy('e1', 30 * mm, false, true, false, null, 'ghost', 'counter'), { mult: mm });
    expect(hpOf('e1')).toBeLessThan(99999);
    expect(getPendingMastery()).toEqual({});
    expect(getMasteryReport()).toEqual({});
  });
});
