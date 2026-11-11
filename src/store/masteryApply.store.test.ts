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
const { fireWeapon, createWeapon, projectileMasteryKey } = await import('../utils/weaponUtils');
const { setBrawlerTempoAll } = await import('../utils/brawlerCombo');
import type { GrowingMasteryKey } from '../data/mastery';

setBrawlerTempoAll(1.0);

const st = () => useGameStore.getState();
const sortie = () => st().resetGame('warrior');
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

describe('受け入れ条件3: 銃の段階は種類ごと', () => {
  it('ハンドガンの段階を上げると、ハンドガンの弾は倍率どおり・ショットガンの弾と近接は変わらない', () => {
    const base = knifeSwingDamage();
    saveMastery({ xp: { handgun: xpForLevel('handgun', 4) } }); // Lv4 = ×1.3
    sortie();
    prepareMelee();
    const p = st().player;
    // 本人の銃の弾は作る所で銃の種類のキーを持つ(倍率は当たる所で masteryMultOf を掛ける)。
    const hg = { ...createWeapon('handgun-t1'), lastFired: 0, magazine: 99 };
    const sg = { ...createWeapon('shotgun-t1'), lastFired: 0, magazine: 99 };
    const target = spawnInFront(99999, 'z', 60);
    const hgShots = fireWeapon(hg, p, [target]);
    const sgShots = fireWeapon(sg, p, [target]);
    expect(hgShots.length).toBeGreaterThan(0);
    expect(sgShots.length).toBeGreaterThan(0);
    expect(hgShots.every(s => projectileMasteryKey(s) === 'handgun')).toBe(true);
    expect(sgShots.every(s => projectileMasteryKey(s) === 'shotgun')).toBe(true);
    expect(masteryMultOf(p, projectileMasteryKey(hgShots[0]))).toBeCloseTo(1.3, 10);
    expect(masteryMultOf(p, projectileMasteryKey(sgShots[0]))).toBe(1);
    // 同じ種類の別の銃でも同じ倍率(種類ごと=拾い替えても変わらない)。
    const hg2 = fireWeapon({ ...createWeapon('handgun-t2'), lastFired: 0, magazine: 99 }, p, [target]);
    expect(hg2.length).toBeGreaterThan(0);
    expect(masteryMultOf(p, projectileMasteryKey(hg2[0]))).toBeCloseTo(1.3, 10);
    // 近接はハンドガンの段階で増えない。
    expect(knifeSwingDamage()).toBe(base);
  });
  it('ハンドガンの弾の当たり(弾のキーで包む): 与ダメは倍率どおり、貯まるのは割り戻した量', () => {
    saveMastery({ xp: { handgun: xpForLevel('handgun', 4) } });
    sortie();
    const p = st().player;
    const target = spawnInFront(99999, 'z', 60);
    const shot = fireWeapon({ ...createWeapon('handgun-t1'), lastFired: 0, magazine: 99 }, p, [target])[0];
    const key = projectileMasteryKey(shot);
    const dmg = shot.damage * masteryMultOf(p, key); // useGameLoop の弾の当たりと同じ掛け方(当たる所で1回)
    withMastery(key, () => st().damageEnemy('z', dmg, false, false, false, 'gun'));
    expect(99999 - hpOf('z')).toBeCloseTo(shot.damage * 1.3, 6);
    expect(getPendingMastery().handgun).toBe(Math.round(dmg / 1.3));
  });
});

describe('受け入れ条件4: 近接の当たりは近接(格闘は格闘)だけに貯まる', () => {
  it('近接の段階を上げると、近接の振りは倍率どおり増え、貯まるのは割り戻した量(melee)', () => {
    const base = knifeSwingDamage();
    sortie();
    prepareMelee();
    expect(getPendingMastery()).toEqual({});
    saveMastery({ xp: { melee: xpForLevel('melee', 6) } }); // Lv6 = ×1.5
    sortie();
    prepareMelee();
    const leveled = knifeSwingDamage();
    expect(leveled).toBeCloseTo(base * 1.5, 6);
    expect(getPendingMastery().melee).toBe(Math.round(leveled / 1.5));
    expect(getPendingMastery().brawler).toBeUndefined();
  });

  it('格闘を装備中の近接(段)は brawler に貯まり melee には貯まらない', () => {
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
    expect(pending.melee).toBeUndefined();
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
    saveMastery({ xp: { melee: xpForLevel('melee', 10) } });
    sortie();
    const live = st().player;
    expect(masteryMultOf(live, 'melee')).toBeCloseTo(1.9, 10);
    expect(masteryMultOf({ ...live, masteryMult: {}, masteryLoadoutMult: 1 }, 'melee')).toBe(1);
  });
});

describe('受け入れ条件7: 無効になった当たりは貯まらない', () => {
  it('空中の無敵(跳び中)・死体への当たりは貯まらない。通った当たりは貯まる', () => {
    const e = spawnInFront(99999);
    useGameStore.setState({ enemies: [{ ...e, aiPhase: 'jump' }] });
    withMastery('handgun', () => st().damageEnemy('z', 30, false, false, false, 'gun'));
    expect(hpOf('z')).toBe(99999);
    expect(getPendingMastery()).toEqual({});
    useGameStore.setState(s => ({ enemies: s.enemies.map(x => ({ ...x, aiPhase: undefined })) }));
    withMastery('handgun', () => st().damageEnemy('z', 30, false, false, false, 'gun'));
    expect(getPendingMastery().handgun).toBe(30);
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
    withMastery('rifle', () => st().damageEnemy('z', 25, false, false, false, 'gun'));
    expect(getPendingMastery()).toEqual({});
    expect(getMasteryReport().rifle).toBe(25);
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
    const dmg = 100 * masteryMultOf(st().player, 'handgun');
    withMastery('handgun', () => st().damageEnemy('z', dmg, false, false, false, 'gun'));
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
    saveMastery({ xp: { handgun: xpForLevel('handgun', 4), melee: xpForLevel('melee', 6) } }); // ×1.3 / ×1.5
    sortie(); prepareMelee();
    expect(masteryMultOf(st().player, 'handgun')).toBeCloseTo(1.3, 10);
    expect(gunHit('guardian-phantom')).toBeCloseTo(gunBase, 6);
    sortie(); prepareMelee();
    expect(swingAt('guardian-phantom')).toBeCloseTo(swingBase, 6);
  });

  it('(b) 同じ当たりを幻影でない敵に当てると倍率どおり増える', () => {
    const gunBase = gunHit('zombie');
    sortie(); prepareMelee();
    const swingBase = swingAt('zombie');
    saveMastery({ xp: { handgun: xpForLevel('handgun', 4), melee: xpForLevel('melee', 6) } });
    sortie(); prepareMelee();
    expect(gunHit('zombie')).toBeCloseTo(gunBase * 1.3, 6);
    sortie(); prepareMelee();
    expect(swingAt('zombie')).toBeCloseTo(swingBase * 1.5, 6);
  });

  it('(c) 幻影に与えた分は、実際に通った量のまま貯まる(割りすぎない)', () => {
    saveMastery({ xp: { handgun: xpForLevel('handgun', 4), melee: xpForLevel('melee', 6) } });
    sortie(); prepareMelee();
    const gunDealt = gunHit('guardian-phantom');
    expect(getPendingMastery().handgun).toBe(Math.round(gunDealt) * 2); // 幻影=ボス級の重み(×2)
    sortie(); prepareMelee();
    const swingDealt = swingAt('guardian-phantom');
    expect(getPendingMastery().melee).toBe(Math.round(swingDealt) * 2);
  });
});
