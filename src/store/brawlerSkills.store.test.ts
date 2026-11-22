// ★格闘×スキル(research/BRAWLER.md §15)をストアで実際に動かして固める。格闘以外(ナイフ)の経路が変わらないことも見る。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, strikerMeleeMult, counterMasterAwakenBuffPatch, counterMasterOnCounterSuccess } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { initialBrawlerState } from '../utils/brawler';
import type { BrawlerStrikeOpts } from './gameStore';
import type { SkillKey } from '../types/game';
import { BLOOD_GAIN_BRAWLER_HIT, BLOOD_GAIN_MELEE_HIT } from '../utils/bloodAwaken';

setBrawlerTempoAll(1.0);
let now = 9_000_000;

const setup = (skills: SkillKey[] = [], levels: Partial<Record<SkillKey, number>> = {}, brawler = true) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: {
      ...st.player, health: 100, maxHealth: 100, invulnerable: false,
      subWeapons: brawler ? ['brawler'] : [], subWeaponLevels: brawler ? { brawler: 1 } : {},
      skills, skillLevels: levels, lastDirection: { x: 1, y: 0 },
    },
  }));
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const bodyAt = (type: 'zombie' | 'giantbat', dx: number, dy: number, id: string, health = 99999) => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = health; e.maxHealth = health; e.id = id;
  return e;
};
const hpOf = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)?.health ?? 0;
const strikeOpts = (id: string, mult: number, move: BrawlerStrikeOpts['combo'] extends infer C ? (C extends { move: infer M } ? M : never) : never, extra: Partial<BrawlerStrikeOpts> = {}): BrawlerStrikeOpts => ({
  targetIds: [id], mult, brawler: true, stunMs: 0, kb: { kind: 'none' }, postureMult: 1, pressedAt: now, combo: { move }, ...extra,
});

beforeEach(() => {
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('1. 紫の致命の一撃: 段の倍率で報酬が縮まない', () => {
  const dealt = (mult: number, reward: number, brawler: boolean): number => {
    setup([], {}, brawler);
    const e = bodyAt('giantbat', 40, 0, 'b', 100000);
    e.bossFullStunUntil = useGameStore.getState().gameTime + 5000;
    e.stunUntil = e.bossFullStunUntil;
    e.bossBreakRewardRemaining = reward;
    useGameStore.setState({ enemies: [e] });
    if (brawler) useGameStore.getState().triggerCounter(undefined, strikeOpts('b', mult, 's1'));
    else useGameStore.getState().triggerCounter(undefined, { targetId: 'b', mult });
    return 100000 - hpOf('b');
  };
  it('格闘: 報酬2500は段の倍率(0.3 / 1.6)に関わらず満額・5倍の部分だけ段の倍率', () => {
    const lo0 = dealt(0.3, 0, true), lo = dealt(0.3, 2500, true);
    const hi0 = dealt(1.6, 0, true), hi = dealt(1.6, 2500, true);
    expect(lo - lo0).toBeCloseTo(2500, 5);
    expect(hi - hi0).toBeCloseTo(2500, 5);
    expect(hi0 / lo0).toBeCloseTo(1.6 / 0.3, 5);
  });
  it('格闘以外(被弾反撃の×2)は今までどおり報酬ごと掛かる', () => {
    const a0 = dealt(2, 0, false), a = dealt(2, 2500, false);
    expect(a - a0).toBeCloseTo(5000, 5);
  });
});

describe('1b. 気絶中の処刑系にも空中の倍率(5倍の部分だけ・報酬には掛けない)', () => {
  const dealt = (reward: number, lifted: boolean): number => {
    setup([], {}, true);
    const e = bodyAt('giantbat', 40, 0, 'b', 100000);
    e.bossFullStunUntil = useGameStore.getState().gameTime + 5000;
    e.stunUntil = e.bossFullStunUntil;
    e.bossBreakRewardRemaining = reward;
    if (lifted) e.brLiftUntil = now + 5000;
    useGameStore.setState({ enemies: [e] });
    useGameStore.getState().triggerCounter(undefined, strikeOpts('b', 1, 's1'));
    return 100000 - hpOf('b');
  };
  it('空中なら5倍の部分が×1.25・報酬2500は変わらない', () => {
    const g0 = dealt(0, false), a0 = dealt(0, true);
    expect(a0 / g0).toBeCloseTo(1.25, 5);
    expect(dealt(2500, true) - a0).toBeCloseTo(2500, 5);
  });
});

describe('2. カウンターマスターの吹き飛ばしはカウンター成立時だけ(社長指示2026-11-22)', () => {
  const pushedByMelee = (brawler: boolean, move: 's1' | 's5', skill = true): { until: number; vx: number; vy: number } => {
    setup(skill ? ['counter-master'] : [], skill ? { 'counter-master': 1 } : {}, brawler);
    useGameStore.setState({ enemies: [bodyAt('zombie', 40, 0, 'hit'), bodyAt('zombie', 0, 90, 'near')] });
    if (brawler) useGameStore.getState().triggerCounter(undefined, strikeOpts('hit', 0.3, move));
    else useGameStore.getState().triggerCounter();
    const e = useGameStore.getState().enemies.find(x => x.id === 'near')!;
    return { until: e.knockbackUntil ?? 0, vx: e.knockbackVx ?? 0, vy: e.knockbackVy ?? 0 };
  };
  it('近接が当たっただけでは周りの敵は飛ばない(格闘の1段目・5段目)', () => {
    expect(pushedByMelee(true, 's1').until).toBe(0);
    expect(pushedByMelee(true, 's5').until).toBe(0);
  });
  it('ナイフの近接: 周りの敵の飛び方はスキル無しと同じ(ナイフ自身の範囲の押し返しだけ・上乗せが無い)', () => {
    expect(pushedByMelee(false, 's1', true)).toEqual(pushedByMelee(false, 's1', false));
  });
  it('成立の瞬間(counterMasterOnCounterSuccess)に周りの敵が飛ぶ・未所持では飛ばない(格闘以外。格闘では飛ばさない=brawlerCounterMaster.store.test)', () => {
    setup(['counter-master'], { 'counter-master': 1 }, false);
    useGameStore.setState({ enemies: [bodyAt('zombie', 0, 90, 'near'), bodyAt('zombie', 600, 0, 'far')] });
    counterMasterOnCounterSuccess();
    const st = useGameStore.getState();
    expect(st.enemies.find(e => e.id === 'near')!.knockbackUntil ?? 0).toBeGreaterThan(0);
    expect(st.enemies.find(e => e.id === 'far')!.knockbackUntil ?? 0).toBe(0);
    setup([], {}, false);
    useGameStore.setState({ enemies: [bodyAt('zombie', 0, 90, 'near')] });
    counterMasterOnCounterSuccess();
    expect(useGameStore.getState().enemies.find(e => e.id === 'near')!.knockbackUntil ?? 0).toBe(0);
  });
});

describe('3. 吸血Lv3・英雄の回復: 秘奥義の中は1回', () => {
  // stepMs=1発ごとに進める実時間(格闘の拳の吸血覚醒回復は 500ms に1回まで=社長指示2026-11-17)。
  const healAfter = (move: 'secret' | 's1', hits: number, stepMs = 500): number => {
    setup(['vampire'], { vampire: 3 });
    const ignite = now;
    useGameStore.setState(st => ({
      enemies: [bodyAt('zombie', 40, 0, 'z')],
      player: { ...st.player, health: 30, brawler: { ...initialBrawlerState(), secret: { phase: 'strike', phaseAt: 0, hits: 0, nextAt: 0, igniteAt: ignite } } },
    }));
    for (let i = 0; i < hits; i++) { useGameStore.getState().triggerCounter(undefined, strikeOpts('z', 0.3, move, { pressedAt: now })); now += stepMs; }
    return useGameStore.getState().player.health - 30;
  };
  it('通常の段は当たるたび回復(500ms 空ければ毎回)・秘奥義の9連撃は最初の1回だけ', () => {
    const one = healAfter('s1', 1);
    expect(one).toBeGreaterThan(0);
    expect(healAfter('s1', 3)).toBe(one * 3);
    expect(healAfter('secret', 3)).toBe(one);
  });
  it('格闘の拳: 500ms 以内の連打では吸血覚醒の回復は1回だけ', () => {
    const one = healAfter('s1', 1);
    expect(healAfter('s1', 3, 200)).toBe(one); // 0 / 200 / 400ms
    expect(healAfter('s1', 4, 200)).toBe(one * 2); // 600ms の4発目で2回目
  });
});

describe('9. ストライカー: 格闘中は素手=弾切れ扱いで×1.5', () => {
  it('rogue + 格闘は1.5・rogue でも格闘なしで弾があれば1・rogue 以外は1', () => {
    useGameStore.getState().resetGame('rogue');
    useGameStore.setState(st => ({ player: { ...st.player, subWeapons: ['brawler'] } }));
    expect(strikerMeleeMult(useGameStore.getState().player)).toBe(1.5);
    useGameStore.setState(st => ({ player: { ...st.player, subWeapons: [] } }));
    const noBrawler = strikerMeleeMult(useGameStore.getState().player);
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState(st => ({ player: { ...st.player, subWeapons: ['brawler'] } }));
    expect(strikerMeleeMult(useGameStore.getState().player)).toBe(1);
    expect(noBrawler).toBeLessThanOrEqual(1.5);
  });
});

describe('10. カウンターマスター覚醒: 構えの受けでも付く', () => {
  it('Lv3 なら brawlerGuardReceive の成立で3秒のバフ・Lv1 では付かない', () => {
    setup(['counter-master'], { 'counter-master': 3 });
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...initialBrawlerState(), guardUntil: st.gameTime + 1000, guardSince: st.gameTime } } }));
    expect(useGameStore.getState().player.counterMasterBuffUntil ?? 0).toBe(0);
    useGameStore.getState().brawlerGuardReceive(center().x + 30, center().y);
    expect(useGameStore.getState().player.counterMasterBuffUntil).toBe(useGameStore.getState().gameTime + 3000);
    setup(['counter-master'], { 'counter-master': 1 });
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...initialBrawlerState(), guardUntil: st.gameTime + 1000, guardSince: st.gameTime } } }));
    useGameStore.getState().brawlerGuardReceive(center().x + 30, center().y);
    expect(useGameStore.getState().player.counterMasterBuffUntil ?? 0).toBe(0);
    expect(counterMasterAwakenBuffPatch(useGameStore.getState().player, 1)).toEqual({});
  });
});

describe('10b. カウンターマスターの前倒し: 格闘では付けない(社長指示2026-11-22「格闘では変えず技が変更」)', () => {
  it('格闘の構えで受けても、Lv3 でもサブウェポンのCD・リロードは前倒しされない(未所持と同じ)', () => {
    const run = (lv: number) => {
      setup(lv ? ['counter-master'] : [], lv ? { 'counter-master': lv } : {});
      useGameStore.setState(st => ({ player: {
        ...st.player, subWeapons: ['brawler', 'decoy'], subWeaponCooldowns: { decoy: st.gameTime + 5000 },
        reloadingWeaponId: 'w-x', reloadEndsAt: now + 1000,
        brawler: { ...initialBrawlerState(), guardUntil: st.gameTime + 1000, guardSince: st.gameTime },
      } }));
      useGameStore.getState().brawlerGuardReceive(center().x + 30, center().y);
      const st = useGameStore.getState();
      return { cd: (st.player.subWeaponCooldowns.decoy ?? 0) - st.gameTime, reload: st.player.reloadEndsAt - now };
    };
    expect(run(3)).toEqual({ cd: 5000, reload: 1000 });
    expect(run(0)).toEqual({ cd: 5000, reload: 1000 });
  });
});

describe('5. タイムキーパー/オーバークロック: 技の値段', () => {
  const pointsAfterStomp = (skills: SkillKey[], lv: Partial<Record<SkillKey, number>>, rnd = 0.99): number => {
    setup(skills, lv);
    vi.spyOn(Math, 'random').mockReturnValue(rnd);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...initialBrawlerState(), points: 8 } } }));
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    return useGameStore.getState().player.brawler!.points;
  };
  it('スキルなしは5・タイムキーパーLv1で4・オーバークロックが当たれば払った分が戻る', () => {
    expect(pointsAfterStomp([], {})).toBe(3);
    expect(pointsAfterStomp(['time-keeper'], { 'time-keeper': 1 })).toBe(4);
    expect(pointsAfterStomp(['overclock'], { overclock: 1 }, 0.05)).toBe(8);
    expect(pointsAfterStomp(['overclock'], { overclock: 1 }, 0.5)).toBe(3);
  });
});

describe('血の覚醒: 格闘(拳)の命中だけは 0.2%・ナイフは 0.5%(社長指示2026-11-17)', () => {
  const gainAfter = (brawler: boolean): number => {
    setup([], {}, brawler);
    useGameStore.setState(st => ({ enemies: [bodyAt('zombie', 40, 0, 'z')], player: { ...st.player, bloodMeter: 0, bloodLastGainAt: 0 } }));
    if (brawler) useGameStore.getState().triggerCounter(undefined, strikeOpts('z', 0.3, 's1'));
    else useGameStore.getState().triggerCounter(undefined, { targetId: 'z', mult: 1 });
    expect(hpOf('z')).toBeGreaterThan(0); // 倒していない=命中だけ
    return useGameStore.getState().player.bloodMeter ?? 0;
  };
  it('格闘の命中1発 = BLOOD_GAIN_BRAWLER_HIT / ナイフの命中1発 = BLOOD_GAIN_MELEE_HIT', () => {
    expect(gainAfter(true)).toBeCloseTo(BLOOD_GAIN_BRAWLER_HIT, 6);
    expect(gainAfter(false)).toBeCloseTo(BLOOD_GAIN_MELEE_HIT, 6);
  });
});
