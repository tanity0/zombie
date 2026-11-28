// 熟練度の**当てはめ**(バッチA-2)の受け入れ条件(research/MASTERY.md v2 §9 の 1・3・4・5・6・7 と v2.1 B 追加13)。
// 純関数は utils/mastery.test.ts、焼き込みは mastery.store.test.ts、呼び口の漏れは utils/masterySites.test.ts。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => { mem.clear(); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;

const { useGameStore } = await import('./gameStore');
const { setSelectedStageId } = await import('../data/progress');
const { GROWING_MASTERY_KEYS } = await import('../data/mastery');
const { saveMastery, masteryNeedFor, masteryMultOf } = await import('../utils/mastery');
const { withMastery, getPendingMastery, getMasteryReport, isMasteryRunIgnored } = await import('../utils/masteryRun');
const { spawnEnemyAt } = await import('../utils/enemyUtils');
const { fireWeapon, createWeapon, projectileMasteryKey, counterMasteryKeyOf, weaponDisplayName } = await import('../utils/weaponUtils');
const { isMeleeMasteryKey } = await import('../utils/masteryView');
const { setBrawlerTempoAll } = await import('../utils/brawlerCombo');
import type { GrowingMasteryKey } from '../data/mastery';

setBrawlerTempoAll(1.0);

const st = () => useGameStore.getState();
const sortie = () => st().resetGame('warrior');
/** 戦士の初期の近接武器(=近接の当たりの熟練度のキー・ナイフ毎)。下の「近接はナイフ毎」で実物と一致を確かめる。 */
const MK = 'hatchet-t2' as const;
/** Lv n までの xp(Lv1→n の必要量の合計)。 */
const xpForLevel = (k: GrowingMasteryKey, lv: number): number => {
  let sum = 0;
  for (let l = 1; l < lv; l++) sum += masteryNeedFor(k, l);
  return sum;
};
/** プレイヤーの目の前(密着)に敵を1体だけ置く。 */
const spawnInFront = (health: number, id = 'z', dx = 4) => {
  const p = st().player;
  const e = spawnEnemyAt('zombie', p.x + p.width / 2 + dx, p.y + p.height / 2, st().gameTime);
  e.health = health; e.maxHealth = Math.max(e.maxHealth, health); e.id = id;
  useGameStore.setState({ enemies: [e] });
  return e;
};
const hpOf = (id: string) => st().enemies.find(e => e.id === id)?.health ?? 0;
/** 近接の振り1回(ナイフ・クリなし)で減った体力。 */
const knifeSwingDamage = (): number => {
  spawnInFront(99999);
  useGameStore.setState(s => ({ player: { ...s.player, counterCooldownEnd: 0, pendingSwingAt: 0 } }));
  st().triggerCounter();
  return 99999 - hpOf('z');
};
const prepareMelee = () => useGameStore.setState(s => ({
  m0Unlocked: { ...s.m0Unlocked, melee: true },
  player: { ...s.player, counterCooldownEnd: 0, pendingSwingAt: 0, health: 100, maxHealth: 100 },
}));

beforeEach(() => {
  mem.clear();
  setSelectedStageId('stage-1');
  st().setBenchmarkRun(false);
  st().setPendingFarBackdrop('');
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
  sortie();
  prepareMelee();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('受け入れ条件1: 保存が空ならステージ1の与ダメは今と同じ', () => {
  it('育つキー・loadout の倍率は全部1(max だけ ×1.9)', () => {
    const p = st().player;
    for (const k of GROWING_MASTERY_KEYS) expect(masteryMultOf(p, k)).toBe(1);
    expect(masteryMultOf(p, 'loadout')).toBe(1);
    expect(masteryMultOf(p, 'none')).toBe(1);
  });
  it('近接の振りの与ダメは、熟練度の欄を消した時(=熟練度が無い時)と1も変わらない', () => {
    const withEmptySave = knifeSwingDamage();
    sortie();
    prepareMelee();
    useGameStore.setState(s => ({ player: { ...s.player, masteryMult: undefined, masteryLoadoutMult: undefined } }));
    const withoutMastery = knifeSwingDamage();
    expect(withEmptySave).toBeGreaterThan(0);
    expect(withEmptySave).toBe(withoutMastery);
  });
});

describe('受け入れ条件3: 銃の段階は武器ごと(社長指示2026-11-13「熟練度が武器毎になってない」)', () => {
  it('ハンドガンの段階を上げると、ハンドガンの弾は倍率どおり・ショットガンの弾と近接は変わらない', () => {
    const base = knifeSwingDamage();
    saveMastery({ xp: { 'handgun-t1': xpForLevel('handgun-t1', 4) } }); // Lv4 = ×1.3
    sortie();
    prepareMelee();
    const p = st().player;
    // 本人の銃の弾は作る所でその銃のキーを持つ(武器ごと。倍率は当たる所で masteryMultOf を掛ける)。
    const hg = { ...createWeapon('handgun-t1'), lastFired: 0, magazine: 99 };
    const sg = { ...createWeapon('shotgun-t1'), lastFired: 0, magazine: 99 };
    const target = spawnInFront(99999, 'z', 60);
    const hgShots = fireWeapon(hg, p, [target]);
    const sgShots = fireWeapon(sg, p, [target]);
    expect(hgShots.length).toBeGreaterThan(0);
    expect(sgShots.length).toBeGreaterThan(0);
    expect(hgShots.every(s => projectileMasteryKey(s) === 'handgun-t1')).toBe(true);
    expect(sgShots.every(s => projectileMasteryKey(s) === 'shotgun-t1')).toBe(true);
    expect(masteryMultOf(p, projectileMasteryKey(hgShots[0]))).toBeCloseTo(1.3, 10);
    expect(masteryMultOf(p, projectileMasteryKey(sgShots[0]))).toBe(1);
    // 同じ種類の別の銃は別の熟練度(武器ごと=ハンドガンの t1 を上げても t2・パイルドライバーは Lv1 のまま)。
    for (const other of ['handgun-t2', 'handgun-t3-piledriver'] as const) {
      const shots = fireWeapon({ ...createWeapon(other), lastFired: 0, magazine: 99 }, p, [target]);
      expect(shots.length, other).toBeGreaterThan(0);
      expect(projectileMasteryKey(shots[0]), other).toBe(other);
      expect(masteryMultOf(p, projectileMasteryKey(shots[0])), other).toBe(1);
    }
    // 近接はハンドガンの段階で増えない。
    expect(knifeSwingDamage()).toBe(base);
  });
  it('ハンドガンの弾の当たり(弾のキーで包む): 与ダメは倍率どおり、貯まるのは割り戻した量', () => {
    saveMastery({ xp: { 'handgun-t1': xpForLevel('handgun-t1', 4) } });
    sortie();
    const p = st().player;
    const target = spawnInFront(99999, 'z', 60);
    const shot = fireWeapon({ ...createWeapon('handgun-t1'), lastFired: 0, magazine: 99 }, p, [target])[0];
    const key = projectileMasteryKey(shot);
    const dmg = shot.damage * masteryMultOf(p, key); // useGameLoop の弾の当たりと同じ掛け方(当たる所で1回)
    withMastery(key, () => st().damageEnemy('z', dmg, false, false, false, 'gun'));
    expect(99999 - hpOf('z')).toBeCloseTo(shot.damage * 1.3, 6);
    expect(getPendingMastery()['handgun-t1']).toBe(Math.round(dmg / 1.3));
  });
  it('同じ種類の別の銃(handgun-t3 とパイルドライバー)は別々に貯まり、別々に掛かる', () => {
    const t3 = 'handgun-t3', pd = 'handgun-t3-piledriver';
    saveMastery({ xp: { [pd]: xpForLevel(pd, 6) } }); // パイルドライバーだけ Lv6 = ×1.5
    sortie();
    const p = st().player;
    expect(masteryMultOf(p, pd)).toBeCloseTo(1.5, 10);
    expect(masteryMultOf(p, t3)).toBe(1);
    const target = spawnInFront(99999, 'z', 60);
    const t3Shot = fireWeapon({ ...createWeapon(t3), lastFired: 0, magazine: 99 }, p, [target])[0];
    const pdShot = fireWeapon({ ...createWeapon(pd), lastFired: 0, magazine: 99 }, p, [target])[0];
    expect(projectileMasteryKey(t3Shot)).toBe(t3);
    expect(projectileMasteryKey(pdShot)).toBe(pd);
    withMastery(t3, () => st().damageEnemy('z', 20, false, false, false, 'gun'));
    withMastery(pd, () => st().damageEnemy('z', 30, false, false, false, 'gun'));
    const pending = getPendingMastery();
    expect(pending[t3]).toBe(20);
    expect(pending[pd]).toBe(Math.round(30 / 1.5));
    expect(pending['handgun-t1']).toBeUndefined();
  });
});

describe('受け入れ条件4: 近接の当たりは近接(格闘は格闘)だけに貯まる', () => {
  it('近接の段階を上げると、近接の振りは倍率どおり増え、貯まるのは割り戻した量(装備している近接武器のキー)', () => {
    const base = knifeSwingDamage();
    sortie();
    prepareMelee();
    expect(getPendingMastery()).toEqual({});
    saveMastery({ xp: { [MK]: xpForLevel(MK, 6) } }); // Lv6 = ×1.5
    sortie();
    prepareMelee();
    const leveled = knifeSwingDamage();
    expect(leveled).toBeCloseTo(base * 1.5, 6);
    expect(getPendingMastery()[MK]).toBe(Math.round(leveled / 1.5));
    expect(getPendingMastery().brawler).toBeUndefined();
  });

  it('格闘を装備中の近接(段)は brawler に貯まり近接武器のキーには貯まらない', () => {
    let now = 7_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    useGameStore.setState(s => ({
      m0Unlocked: { ...s.m0Unlocked, melee: true, crit: true },
      player: {
        ...s.player, health: 100, maxHealth: 100, invulnerable: false,
        subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 }, lastDirection: { x: 1, y: 0 },
      },
    }));
    spawnInFront(99999, 'z', 45);
    expect(st().brawlerPress()).toBe(true);
    const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
    for (let i = 0; i < 30; i++) {
      now += 10;
      useGameStore.setState(s => ({ gameTime: s.gameTime + 10 }));
      st().movePlayer(NO_INPUT, 0.01);
      st().tickBrawler();
    }
    expect(hpOf('z')).toBeLessThan(99999);
    const pending = getPendingMastery();
    expect(pending.brawler ?? 0).toBeGreaterThan(0);
    expect(pending[MK]).toBeUndefined();
  });
});

describe('受け入れ条件5: loadout の当たりは平均の倍率が掛かり、どこにも貯まらない', () => {
  it('loadout で包んだ当たりは pending に何も足さない', () => {
    spawnInFront(99999);
    withMastery('loadout', () => st().damageEnemy('z', 50));
    expect(99999 - hpOf('z')).toBe(50);
    expect(getPendingMastery()).toEqual({});
  });
});

describe('受け入れ条件6: 守護霊・幻影・護衛の与ダメは倍率1・貯まらない', () => {
  it('none で包んだ当たりは貯まらない', () => {
    spawnInFront(99999);
    withMastery('none', () => st().damageEnemy('z', 40, false, false, false, null, 'ghost'));
    expect(getPendingMastery()).toEqual({});
  });
  it('守護霊の火の床から付いた燃焼(none)は、刻みが通っても貯まらない', () => {
    const e = spawnInFront(99999);
    st().spawnGroundFire(e.x + e.width / 2, e.y + e.height / 2, 'ghost-x');
    expect(st().groundFires[0].masteryKey).toBe('none');
    useGameStore.setState(s => ({
      enemies: s.enemies.map(x => ({ ...x, burnUntil: s.gameTime + 5000, burnDpsTick: 7, burnByGhost: true, burnMasteryKey: 'molotov' as const })),
    }));
    useGameStore.setState(s => ({ gameTime: s.gameTime + 1000 }));
    st().tickBurningEnemies();
    expect(hpOf('z')).toBeLessThan(99999);
    expect(getPendingMastery()).toEqual({});
  });
  it('熟練度の欄が空の主語(幻影の疑似プレイヤー・古い記録の守護霊)は倍率1(守護霊の記録の値は masteryGuardian.store.test.ts)', () => {
    saveMastery({ xp: { [MK]: xpForLevel(MK, 10) } });
    sortie();
    const live = st().player;
    expect(masteryMultOf(live, MK)).toBeCloseTo(1.9, 10);
    expect(masteryMultOf({ ...live, masteryMult: {}, masteryLoadoutMult: 1 }, MK)).toBe(1);
  });
});

describe('受け入れ条件7: 無効になった当たりは貯まらない', () => {
  it('空中の無敵(跳び中)・死体への当たりは貯まらない。通った当たりは貯まる', () => {
    const e = spawnInFront(99999);
    useGameStore.setState({ enemies: [{ ...e, aiPhase: 'jump' }] });
    withMastery('handgun-t1', () => st().damageEnemy('z', 30, false, false, false, 'gun'));
    expect(hpOf('z')).toBe(99999);
    expect(getPendingMastery()).toEqual({});
    useGameStore.setState(s => ({ enemies: s.enemies.map(x => ({ ...x, aiPhase: undefined })) }));
    withMastery('handgun-t1', () => st().damageEnemy('z', 30, false, false, false, 'gun'));
    expect(getPendingMastery()['handgun-t1']).toBe(30);
  });
  it('出どころが無い当たり(包まれていない)は貯まらない', () => {
    spawnInFront(99999);
    st().damageEnemy('z', 30);
    expect(getPendingMastery()).toEqual({});
  });
});

describe('無視する出撃(受け入れ条件8の一部)', () => {
  it('ベンチの出撃では pending に貯まらない(報告用の表には数える)', () => {
    st().setBenchmarkRun(true);
    sortie();
    expect(isMasteryRunIgnored()).toBe(true);
    spawnInFront(99999);
    withMastery('rifle-t1', () => st().damageEnemy('z', 25, false, false, false, 'gun'));
    expect(getPendingMastery()).toEqual({});
    expect(getMasteryReport()['rifle-t1']).toBe(25);
    st().setBenchmarkRun(false);
  });
});

describe('追加13: 火炎瓶だけで倒す出撃で molotov が貯まる', () => {
  it('火炎瓶の火の床→燃焼の刻みが molotov に入る', () => {
    const e = spawnInFront(30);
    st().spawnGroundFire(e.x + e.width / 2, e.y + e.height / 2, undefined, undefined, 'molotov');
    st().tickGroundFires();
    const burning = st().enemies.find(x => x.id === 'z')!;
    expect(burning.burnMasteryKey).toBe('molotov');
    for (let i = 0; i < 60 && hpOf('z') > 0; i++) {
      useGameStore.setState(s => ({ gameTime: s.gameTime + 250 }));
      st().tickGroundFires();
      st().tickBurningEnemies();
    }
    expect(st().enemies.find(x => x.id === 'z')?.health ?? 0).toBeLessThanOrEqual(0);
    expect(getPendingMastery().molotov ?? 0).toBeGreaterThan(0);
    expect(Object.keys(getPendingMastery())).toEqual(['molotov']);
  });
});

describe('幻影には熟練度を乗せない(発注者指示「幻影にはこちらの武器も熟練値を乗せない」)', () => {
  /** プレイヤーの目の前に幻影(または雑魚)を1体だけ置く。 */
  const spawnTarget = (type: 'guardian-phantom' | 'zombie', dx = 4) => {
    const p = st().player;
    const e = spawnEnemyAt(type, p.x + p.width / 2 + dx, p.y + p.height / 2, st().gameTime);
    e.health = 99999; e.maxHealth = 99999; e.id = 'z';
    useGameStore.setState({ enemies: [e] });
    return e;
  };
  /** 弾の当たり(ハンドガンのキーで包む・倍率は呼び手が掛ける=useGameLoop と同じ掛け方)。 */
  const gunHit = (type: 'guardian-phantom' | 'zombie') => {
    spawnTarget(type, 60);
    const dmg = 100 * masteryMultOf(st().player, 'handgun-t1');
    withMastery('handgun-t1', () => st().damageEnemy('z', dmg, false, false, false, 'gun'));
    return 99999 - hpOf('z');
  };
  /** 近接の振り1回(ナイフ・クリなし)。 */
  const swingAt = (type: 'guardian-phantom' | 'zombie') => {
    spawnTarget(type);
    useGameStore.setState(s => ({ player: { ...s.player, counterCooldownEnd: 0, pendingSwingAt: 0 } }));
    st().triggerCounter();
    return 99999 - hpOf('z');
  };

  it('(a) 段階を上げた保存でも、幻影への与ダメは熟練度なしの時と同じ(弾・近接)', () => {
    const gunBase = gunHit('guardian-phantom');
    sortie(); prepareMelee();
    const swingBase = swingAt('guardian-phantom');
    expect(gunBase).toBeGreaterThan(0);
    expect(swingBase).toBeGreaterThan(0);
    saveMastery({ xp: { 'handgun-t1': xpForLevel('handgun-t1', 4), [MK]: xpForLevel(MK, 6) } }); // ×1.3 / ×1.5
    sortie(); prepareMelee();
    expect(masteryMultOf(st().player, 'handgun-t1')).toBeCloseTo(1.3, 10);
    expect(gunHit('guardian-phantom')).toBeCloseTo(gunBase, 6);
    sortie(); prepareMelee();
    expect(swingAt('guardian-phantom')).toBeCloseTo(swingBase, 6);
  });

  it('(b) 同じ当たりを幻影でない敵に当てると倍率どおり増える', () => {
    const gunBase = gunHit('zombie');
    sortie(); prepareMelee();
    const swingBase = swingAt('zombie');
    saveMastery({ xp: { 'handgun-t1': xpForLevel('handgun-t1', 4), [MK]: xpForLevel(MK, 6) } });
    sortie(); prepareMelee();
    expect(gunHit('zombie')).toBeCloseTo(gunBase * 1.3, 6);
    sortie(); prepareMelee();
    expect(swingAt('zombie')).toBeCloseTo(swingBase * 1.5, 6);
  });

  it('(c) 幻影に与えた分は、実際に通った量のまま貯まる(割りすぎない)', () => {
    saveMastery({ xp: { 'handgun-t1': xpForLevel('handgun-t1', 4), [MK]: xpForLevel(MK, 6) } });
    sortie(); prepareMelee();
    const gunDealt = gunHit('guardian-phantom');
    expect(getPendingMastery()['handgun-t1']).toBe(Math.round(gunDealt) * 2); // 幻影=ボス級の重み(×2)
    sortie(); prepareMelee();
    const swingDealt = swingAt('guardian-phantom');
    expect(getPendingMastery()[MK]).toBe(Math.round(swingDealt) * 2);
  });
});

// カウンターの反撃は「装備している近接の手段」に貯める(社長裁定2026-11-12「装備してる近接武器に溜まるようにすればブレないのでは?」
// +「近接の括りではない。ナイフ毎の括り」)。本人のカウンターの呼び口(useGameLoop・combatTick・angelBossTick・bountyTick)は
// store から通せないので、呼び口と同じ3行(キーを決める→その倍率を掛ける→そのキーで包む)をここで踏む。
describe('カウンターの反撃: 装備している近接の手段に貯まる', () => {
  /** 呼び口と同じ形でカウンターの反撃を1発入れる。返り値=掛けた倍率。 */
  const counterReply = (base: number): { key: string; mult: number } => {
    const cp = st().player;
    const counterMk = counterMasteryKeyOf(cp);
    const mult = masteryMultOf(cp, counterMk);
    withMastery(counterMk, () => st().damageEnemy('z', base * mult, false, true, false, 'other', 'player', 'counter'));
    return { key: counterMk, mult };
  };
  const knife = (key: string) => [createWeapon(key)];

  it('格闘を装備していれば brawler・それ以外は装備している近接武器・近接武器が無ければ loadout(銃の種類は返さない)', () => {
    expect(counterMasteryKeyOf({ subWeapons: ['brawler'], weapons: knife('knife-t1') })).toBe('brawler');
    expect(counterMasteryKeyOf({ subWeapons: ['drone-boomerang', 'brawler'], weapons: [] })).toBe('brawler');
    expect(counterMasteryKeyOf({ subWeapons: [], weapons: [createWeapon('rifle-t1'), ...knife('machete-t3')] })).toBe('machete-t3');
    expect(counterMasteryKeyOf({ subWeapons: ['drone-boomerang'], weapons: knife('anti-mutant-knife-t5') })).toBe('anti-mutant-knife-t5');
    expect(counterMasteryKeyOf({ subWeapons: [], weapons: [createWeapon('rifle-t1')] })).toBe('loadout');
  });

  it('格闘を装備してカウンター → brawler に貯まり、構えている銃のキー・近接武器のキーには貯まらない。倍率は brawler の倍率', () => {
    saveMastery({ xp: { brawler: xpForLevel('brawler', 10), 'handgun-t1': xpForLevel('handgun-t1', 5), [MK]: xpForLevel(MK, 3) } });
    sortie();
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 } } }));
    spawnInFront(99999);
    const { key, mult } = counterReply(40);
    expect(key).toBe('brawler');
    expect(mult).toBeCloseTo(masteryMultOf(st().player, 'brawler'), 10);
    expect(mult).not.toBeCloseTo(masteryMultOf(st().player, 'handgun-t1'), 3);
    expect(hpOf('z')).toBeLessThan(99999);
    const pending = getPendingMastery();
    expect(pending.brawler ?? 0).toBeGreaterThan(0);
    expect(pending['handgun-t1']).toBeUndefined();
    expect(pending[MK]).toBeUndefined();
  });

  it('格闘なしでカウンター → 装備している近接武器に貯まり、銃・別のナイフには貯まらない。倍率はそのナイフの倍率', () => {
    saveMastery({ xp: { [MK]: xpForLevel(MK, 6), 'knife-t1': xpForLevel('knife-t1', 9), 'handgun-t1': xpForLevel('handgun-t1', 2) } });
    sortie();
    expect(st().player.subWeapons ?? []).not.toContain('brawler');
    spawnInFront(99999);
    const { key, mult } = counterReply(40);
    expect(key).toBe(MK);
    expect(mult).toBeCloseTo(masteryMultOf(st().player, MK), 10);
    expect(mult).toBeCloseTo(1.5, 10);
    const pending = getPendingMastery();
    expect(pending[MK] ?? 0).toBeGreaterThan(0);
    expect(pending['knife-t1']).toBeUndefined();
    expect(pending['handgun-t1']).toBeUndefined();
    expect(pending.brawler).toBeUndefined();
  });
});

// 社長裁定2026-11-12「近接の括りではない。ナイフ毎の括り」: 近接の当たりは装備しているナイフにだけ貯まる。
describe('近接はナイフ毎', () => {
  it('戦士の初期の近接武器は MK(このファイルの前提)', () => {
    expect(st().player.weapons.find(w => w.isMelee)?.key).toBe(MK);
  });
  it('近接の振りは装備しているナイフにだけ貯まる(別のナイフ・銃には貯まらない)', () => {
    knifeSwingDamage();
    const pending = getPendingMastery();
    expect(pending[MK] ?? 0).toBeGreaterThan(0);
    for (const k of ['knife-t1', 'machete-t3', 'tactical-knife-t4', 'anti-mutant-knife-t5', 'handgun-t1', 'shotgun-t1'] as const) {
      expect(pending[k], k).toBeUndefined();
    }
  });
  it('ナイフを持ち替えると貯め先と掛かる倍率が変わる', () => {
    saveMastery({ xp: { 'tactical-knife-t4': xpForLevel('tactical-knife-t4', 6) } }); // ×1.5
    sortie(); prepareMelee();
    const base = knifeSwingDamage(); // 戦士の MK(Lv1)
    expect(getPendingMastery()[MK] ?? 0).toBeGreaterThan(0);
    sortie(); prepareMelee();
    useGameStore.setState(s => ({ player: { ...s.player, weapons: s.player.weapons.map(w => (w.isMelee ? createWeapon('tactical-knife-t4') : w)) } }));
    const swapped = knifeSwingDamage();
    const pending = getPendingMastery();
    expect(pending['tactical-knife-t4'] ?? 0).toBeGreaterThan(0);
    expect(pending[MK]).toBeUndefined();
    // タクティカルナイフの素ダメ × 1.5(素ダメの比は武器のダメージの比)
    expect(swapped).toBeGreaterThan(base);
    expect(masteryMultOf(st().player, 'tactical-knife-t4')).toBeCloseTo(1.5, 10);
  });
  it('リザルトの名前は武器の名前(近接はナイフ毎)', () => {
    for (const k of ['knife-t1', 'hatchet-t2', 'machete-t3', 'tactical-knife-t4', 'anti-mutant-knife-t5']) {
      expect(isMeleeMasteryKey(k), k).toBe(true);
      expect(weaponDisplayName(k), k).not.toBe('—');
    }
    expect(weaponDisplayName('knife-t1')).toBe('ナイフ');
    expect(weaponDisplayName('hatchet-t2')).toBe('ダガー');
    expect(isMeleeMasteryKey('handgun-t1')).toBe(false);
    expect(isMeleeMasteryKey('melee')).toBe(false);
  });
});
