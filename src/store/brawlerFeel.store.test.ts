// ★格闘の手触り(research/BRAWLER.md §16): 5段目の飛距離・空中の敵への倍率・ハンティングの範囲・足の速さ・気功は銃の攻撃力に依存。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, playerMoveStatMult } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll, resetAirHits } from '../utils/brawlerCombo';
import { getLastAirMeleeHit, resetAirMeleeHit } from '../utils/playerAirFollow';
import { initialBrawlerState, BRAWLER_STAGES, BRAWLER_PALM_KB_MULT, BRAWLER_BIG_KB_MULT } from '../utils/brawler';
import type { BrawlerStrikeOpts } from './gameStore';
import type { SkillKey, SubWeaponKey } from '../types/game';

setBrawlerTempoAll(1.0);
const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 11_000_000;

const setup = (opts: { skills?: SkillKey[]; levels?: Partial<Record<SkillKey, number>>; subs?: SubWeaponKey[]; subLv?: Partial<Record<SubWeaponKey, number>>; cls?: string } = {}) => {
  useGameStore.getState().resetGame(opts.cls ?? 'warrior');
  resetAirHits();
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: {
      ...st.player, health: 100, maxHealth: 100, invulnerable: false,
      subWeapons: opts.subs ?? ['brawler'], subWeaponLevels: opts.subLv ?? { brawler: 3 },
      skills: opts.skills ?? [], skillLevels: opts.levels ?? {}, lastDirection: { x: 1, y: 0 },
    },
  }));
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const zombieAt = (dx: number, dy: number, id: string, health = 99999) => {
  const c = center();
  const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = health; e.maxHealth = health; e.id = id;
  return e;
};
const advance = (ms: number) => {
  const end = now + ms;
  while (now < end) {
    now += 10;
    useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
    useGameStore.getState().movePlayer(NO_INPUT, 0.01);
    useGameStore.getState().tickBrawler();
  }
};
const enemy = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const hpOf = (id: string) => enemy(id)?.health ?? 0;
const strikeOpts = (id: string, mult: number, move: 's1' | 's5' | 'kiko', extra: Partial<BrawlerStrikeOpts> = {}): BrawlerStrikeOpts => ({
  targetIds: [id], mult, brawler: true, stunMs: 0, kb: { kind: 'none' }, postureMult: 1, pressedAt: now, combo: { move, countRevenge: false }, ...extra,
});

beforeEach(() => {
  now = 11_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('A. 5段目の吹き飛ばしは2倍(約半分)・ほかの big は4倍のまま', () => {
  it('段の表: 5段目だけ kbMult=2。大踏み潰し等は表を持たず BRAWLER_BIG_KB_MULT(4)のまま', () => {
    expect(BRAWLER_PALM_KB_MULT).toBe(2);
    expect(BRAWLER_BIG_KB_MULT).toBe(4);
    expect(BRAWLER_STAGES.map(s => s.kbMult)).toEqual([undefined, undefined, undefined, undefined, 2]);
  });
  it('指定打撃の power: 2倍の押しは4倍の押しの約半分の初速', () => {
    const vx = (power: number | undefined): number => {
      setup();
      useGameStore.setState({ enemies: [zombieAt(40, 0, 'z')] });
      useGameStore.getState().triggerCounter(undefined, strikeOpts('z', 1.6, 's5', { kb: { kind: 'big', dirX: 1, dirY: 0, ...(power !== undefined ? { power } : {}) } }));
      return enemy('z').knockbackVx ?? 0;
    };
    const four = vx(undefined), two = vx(2);
    expect(four).toBeGreaterThan(0);
    expect(two / four).toBeCloseTo(0.5, 5);
  });
});

describe('B. 空中の敵へのダメージ倍率(格闘以外にも)', () => {
  const lift = (id: string, ms = 5000) => useGameStore.setState(st => ({ enemies: st.enemies.map(e => (e.id === id ? { ...e, brLiftUntil: now + ms } : e)) }));
  it('銃・爆発など damageEnemy: 1発目×1.25 → ×1.5 → ×1.75 → ×2.0 → 上限×2.0。着地(地上の当たり)で数え直し', () => {
    setup({ subs: [] });
    useGameStore.setState({ enemies: [zombieAt(300, 0, 'z', 1000)] });
    lift('z');
    const dealt = (): number => { const h0 = hpOf('z'); useGameStore.getState().damageEnemy('z', 10, false, false, false, 'gun'); return h0 - hpOf('z'); };
    expect([dealt(), dealt(), dealt(), dealt(), dealt()]).toEqual([12.5, 15, 17.5, 20, 20]);
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => (e.id === 'z' ? { ...e, brLiftUntil: undefined } : e)) })); // 着地
    expect(dealt()).toBe(10); // 地上の当たり=打ち上げた一撃にも乗らない・数えは捨てる
    lift('z');
    expect(dealt()).toBe(12.5); // 浮き直したらまた1発目から
  });
  it('地上の敵・守護霊・継続ダメージ・プレイヤー起因でない弾には乗らない', () => {
    setup({ subs: [] });
    useGameStore.setState({ enemies: [zombieAt(300, 0, 'z', 1000)] });
    const d = (f: () => void): number => { const h0 = hpOf('z'); f(); return h0 - hpOf('z'); };
    expect(d(() => useGameStore.getState().damageEnemy('z', 10, false, false, false, 'gun'))).toBe(10); // 地上
    lift('z');
    expect(d(() => useGameStore.getState().damageEnemy('z', 10, false, false, false, 'gun', 'ghost'))).toBe(10);
    expect(d(() => useGameStore.getState().damageEnemy('z', 10, false, false, false, 'dot'))).toBe(10);
    expect(d(() => useGameStore.getState().damageEnemy('z', 10, false, false, false, null))).toBe(10);
    expect(d(() => useGameStore.getState().damageEnemy('z', 10, false, false, false, 'gun'))).toBe(12.5); // ここで初めて1発目
  });
  it('ナイフ(triggerCounter)にも乗る', () => {
    setup({ subs: [] });
    useGameStore.setState({ enemies: [zombieAt(40, 0, 'z', 99999)] });
    const hit = (): number => { const h0 = hpOf('z'); useGameStore.setState({ player: { ...useGameStore.getState().player, counterCooldownEnd: 0 } }); useGameStore.getState().triggerCounter(); return h0 - hpOf('z'); };
    const ground = hit();
    expect(ground).toBeGreaterThan(0);
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, brLiftUntil: now + 5000, knockbackUntil: 0, hitStunUntil: 0 })) }));
    expect(hit()).toBeCloseTo(ground * 1.25, 5);
    expect(hit()).toBeCloseTo(ground * 1.5, 5);
  });
  it('格闘の段にも乗る(格闘の長いコンボの補正と並ぶ)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(40, 0, 'z', 99999)] });
    const hit = (): number => { const h0 = hpOf('z'); useGameStore.getState().triggerCounter(undefined, strikeOpts('z', 1, 's1', { combo: undefined })); return h0 - hpOf('z'); };
    const ground = hit();
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, brLiftUntil: now + 5000 })) }));
    expect(hit()).toBeCloseTo(ground * 1.25, 5);
  });
});

describe('C. ハンティングの溜まりを格闘の範囲へ', () => {
  const subs: SubWeaponKey[] = ['brawler', 'striker-hunting'];
  const subLv = { brawler: 3, 'striker-hunting': 3 };
  it('溜まっていると届く距離が広がり、一連のコンボの間は溜まりが残り、途切れたら消費される', () => {
    // 相手を 通常の届く距離(74)の少し外・ハンティングLv3(+34)の内側に置く
    setup({ subs, subLv });
    useGameStore.setState(st => ({ enemies: [zombieAt(125, 0, 'z')], player: { ...st.player, huntingCharged: false } }));
    useGameStore.getState().brawlerPress(); advance(400);
    expect(hpOf('z')).toBe(99999); // 溜まっていない=届かない

    setup({ subs, subLv });
    useGameStore.setState(st => ({ enemies: [zombieAt(125, 0, 'z')], player: { ...st.player, huntingCharged: true, huntingChargeStartedAt: 1 } }));
    useGameStore.getState().brawlerPress(); advance(120);
    expect(hpOf('z')).toBeLessThan(99999); // 溜まっている=届く
    expect(useGameStore.getState().player.huntingCharged).toBe(true); // コンボの間は残る
    expect(useGameStore.getState().player.brawler!.huntingCombo).toBe(true);
    advance(200); // 戻りの途中〜受付の中
    expect(useGameStore.getState().player.huntingCharged).toBe(true);
    advance(1500); // つながりが切れる
    expect(useGameStore.getState().player.huntingCharged).toBe(false);
    expect(useGameStore.getState().player.brawler!.huntingCombo).toBe(false);
  });
  it('技(大踏み潰し)の円も溜まっていれば広がる: 半径150の外・+34の内の敵に当たる', () => {
    const stompHit = (charged: boolean): boolean => {
      setup({ subs, subLv });
      useGameStore.setState(st => ({ enemies: [zombieAt(190, 0, 'z')], player: { ...st.player, huntingCharged: charged, huntingChargeStartedAt: charged ? 1 : 0, brawler: { ...initialBrawlerState(), points: 9 } } }));
      expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
      advance(500);
      return hpOf('z') < 99999;
    };
    expect(stompHit(false)).toBe(false);
    expect(stompHit(true)).toBe(true);
  });
});

describe('D. 足の速さの能力値に比例して格闘の攻撃力が上がる', () => {
  const stage1Damage = (skills: SkillKey[], levels: Partial<Record<SkillKey, number>>, cls = 'warrior'): number => {
    setup({ skills, levels, cls });
    useGameStore.setState({ enemies: [zombieAt(40, 0, 'z')] });
    useGameStore.getState().triggerCounter(undefined, strikeOpts('z', 1, 's1', { combo: undefined }));
    return 99999 - hpOf('z');
  };
  it('ランナーLv3(足+20%)なら格闘のダメージ ×1.2・持っていなければ ×1.0・ナイフは変わらない', () => {
    const base = stage1Damage([], {});
    expect(stage1Damage(['runner'], { runner: 3 })).toBeCloseTo(base * 1.2, 5);
    expect(stage1Damage(['runner'], { runner: 1 })).toBeCloseTo(base * 1.1, 5);
  });
  it('ナイフ(格闘でない)は足が速くても変わらない', () => {
    const knife = (skills: SkillKey[], levels: Partial<Record<SkillKey, number>>): number => {
      setup({ subs: [], skills, levels });
      useGameStore.setState({ enemies: [zombieAt(40, 0, 'z')] });
      useGameStore.getState().triggerCounter();
      return 99999 - hpOf('z');
    };
    expect(knife(['runner'], { runner: 3 })).toBeCloseTo(knife([], {}), 5);
  });
});

describe('E. 気功は銃の攻撃力に依存', () => {
  const kikoDealt = (skills: SkillKey[], levels: Partial<Record<SkillKey, number>>, extra: Partial<ReturnType<typeof useGameStore.getState>['player']> = {}): number => {
    setup({ skills, levels });
    useGameStore.setState(st => ({ enemies: [zombieAt(120, 0, 'z', 1_000_000)], player: { ...st.player, ...extra, brawler: { ...initialBrawlerState(), points: 9 } } }));
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    advance(900);
    return 1_000_000 - hpOf('z');
  };
  it('アタックシューターLv3で ×1.3・アタックドーピングで ×1.2・スナイパーで増える。何も無ければ変わらない', () => {
    const base = kikoDealt([], {});
    expect(base).toBeGreaterThan(0);
    const as3 = kikoDealt(['attack-shooter'], { 'attack-shooter': 3 });
    expect(as3 / base).toBeGreaterThan(1.2); expect(as3 / base).toBeLessThan(1.4);
    const dope = kikoDealt([], {}, { consumableAttackUntil: 1e9 } as never);
    expect(dope / base).toBeGreaterThan(1.1); expect(dope / base).toBeLessThan(1.3);
    expect(kikoDealt(['sniper'], { sniper: 1 })).toBeGreaterThan(base);
  });
});

describe('血の覚醒(社長承認2026-11-09)', () => {
  const awake = { bloodAwakenUntil: 1e9, bloodAwakening: true } as never;
  it('足の速さの能力値に覚醒の足(×1.5)が入る・覚醒でなければ1', () => {
    setup();
    const p0 = useGameStore.getState().player;
    expect(playerMoveStatMult(p0, 0)).toBe(1);
    expect(playerMoveStatMult({ ...p0, ...(awake as object) }, 0)).toBeGreaterThan(1.4);
  });
  it('気功に覚醒の攻撃×1.5が乗る', () => {
    const kiko = (extra: object): number => {
      setup();
      useGameStore.setState(st => ({ enemies: [zombieAt(120, 0, 'z', 1_000_000)], player: { ...st.player, ...extra, brawler: { ...initialBrawlerState(), points: 9 } } }));
      useGameStore.getState().brawlerTech(-1, 0);
      advance(900);
      return 1_000_000 - hpOf('z');
    };
    const base = kiko({});
    expect(kiko(awake) / base).toBeGreaterThan(1.4);
  });
});

describe('空中の敵を近接で殴るとプレイヤーも浮く描画の記録(§18)', () => {
  it('ナイフ・格闘の段は空中の敵への当たりを記録し、地上の敵・銃は記録しない', () => {
    setup({ subs: [] });
    resetAirMeleeHit();
    useGameStore.setState({ enemies: [zombieAt(40, 0, 'z', 99999)] });
    useGameStore.getState().triggerCounter();
    expect(getLastAirMeleeHit()).toBeNull(); // 地上
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, brLiftUntil: now + 5000, brawlerLiftAt: now, brLiftMs: 1000, brLiftPeak: 1, knockbackUntil: 0, hitStunUntil: 0 })) }));
    useGameStore.getState().damageEnemy('z', 5, false, false, false, 'gun');
    expect(getLastAirMeleeHit()).toBeNull(); // 銃は対象外
    useGameStore.setState(st => ({ player: { ...st.player, counterCooldownEnd: 0 } }));
    useGameStore.getState().triggerCounter();
    expect(getLastAirMeleeHit()?.enemyId).toBe('z');
  });
});
