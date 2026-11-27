// ★被弾反撃の浮きの強制(社長指示2026-11-16「赤文字のカウンター」=被弾反撃は「強制的に浮かない状況でも浮かせる」・research/HIT_RETALIATION.md)。
// resolveRetaliateStrike の一撃が当たって相手が生きている時だけ、今まで浮かなかった場面でも 4段目の打ち上げ(COUNTER_LIFT_MOVE)で浮かせる。
// 格闘の構え(3段目の指定打撃)・ナイフ/刀(近接の命中)の両方。赤い予告へのカウンター(damageEnemy の 'counter')と普通の近接は今どおり。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { brawlerAirborne, brawlerJugglePush } from '../utils/brawlerCombo';
import { initialBrawlerState } from '../utils/brawler';
import { COUNTER_LIFT_MOVE, KNIFE_LIFT_HEIGHT_MULT, knifeLiftMove } from '../utils/airLift';

let now = 9_000_000;
const setup = (brawler = false) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true },
    player: {
      ...st.player, health: 99999, maxHealth: 99999, invulnerable: false, counterCooldownEnd: 0, pendingSwingAt: 0, lastDirection: { x: 1, y: 0 },
      ...(brawler ? { subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 }, brawler: initialBrawlerState() } : {}),
    },
  }));
};
/** プレイヤーのすぐ右に置く(反撃の届く距離)。 */
const place = (type: EnemyType, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: p.x + p.width / 2 + 20 - e.width / 2, y: p.y + p.height / 2 - e.height / 2, id, health: 9_999_999, maxHealth: 9_999_999, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id);
/** 飛び込みの着地の瞬間を作って反撃の一撃を解決する。 */
const strike = (id: string) => {
  useGameStore.setState(st => ({ player: { ...st.player, retaliateStrikeAt: now, retaliateTargetId: id } }));
  return useGameStore.getState().resolveRetaliateStrike();
};
const groundS4Peak = (cls: 'mob' | 'strong' | 'boss') => brawlerJugglePush({}, cls, COUNTER_LIFT_MOVE, now)!.brLiftPeak!;
const gt = () => useGameStore.getState().gameTime;

beforeEach(() => {
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });

describe.each([['ナイフ', false], ['格闘', true]] as const)('被弾反撃の浮きの強制(%s)', (_name, brawler) => {
  it('技の最中の雑魚: 技を取り消して 4段目の打ち上げで浮かせる', () => {
    setup(brawler);
    useGameStore.setState({ enemies: [place('zombie', 'z', { aiPhase: 'windup', aiPhaseUntil: gt() + 99999 } as Partial<Enemy>)] });
    expect(strike('z')?.hit).toBe(true);
    const z = en('z')!;
    expect(z.aiPhase).toBeUndefined();
    expect(z.biteRecoverUntil).toBeUndefined();
    expect(z.lastCounteredAt).toBe(now);
    const stop = (z.hitStunUntil ?? now) - now; // ★止めの間は上がり始めない(社長指示2026-11-27「上がる方も止めて」)=浮きは止めの明けから
    expect(stop).toBeGreaterThan(0);
    expect(z.brawlerLiftAt).toBe(now + stop);
    expect(z.brLiftPeak).toBeCloseTo(groundS4Peak('mob'));
    expect(brawlerAirborne(z, now + 1)).toBe(true);
  });
  it('技の最中のボス級(aiPhase の技): 技を取り消して浮かせる', () => {
    setup(brawler);
    useGameStore.setState({ enemies: [place('giantbat', 'b', { aiPhase: 'g-slam-windup', aiPhaseUntil: gt() + 99999 } as Partial<Enemy>)] });
    expect(strike('b')?.hit).toBe(true);
    const b = en('b')!;
    expect(b.aiPhase).toBeUndefined();
    expect(b.brawlerLiftAt).toBe(now);
    expect(brawlerAirborne(b, now + 1)).toBe(true);
  });
  it('bossState の技の最中のボス: 技は取り消さず浮きだけ乗せる', () => {
    setup(brawler);
    useGameStore.setState({ enemies: [place('thor', 't', { bossState: 'thor-dash-windup' } as Partial<Enemy>)] });
    expect(strike('t')?.hit).toBe(true);
    const t = en('t')!;
    expect(t.bossState).toBe('thor-dash-windup');
    expect(t.lastCounteredAt).toBeUndefined();
    expect(t.brawlerLiftAt).toBe(now);
  });
  it('技の最中でない雑魚も、普通の命中の浮きを 4段目の打ち上げで置き換える', () => {
    setup(brawler);
    useGameStore.setState({ enemies: [place('zombie', 'z')] });
    expect(strike('z')?.hit).toBe(true);
    const z = en('z')!;
    expect(z.brawlerLiftAt).toBe(now + ((z.hitStunUntil ?? now) - now)); // ★止めの間は上がり始めない(社長指示2026-11-27)
    expect(z.brLiftPeak).toBeCloseTo(groundS4Peak('mob'));
    expect(z.lastCounteredAt).toBeUndefined(); // 取り消していない=技の絵の破棄の打刻は書かない
  });
  it('空中で予算切れ・ダウン中でも浮かせ直す', () => {
    setup(brawler);
    const up = { ...place('zombie', 'a'), ...brawlerJugglePush({}, 'mob', COUNTER_LIFT_MOVE, now - 60) } as Enemy;
    useGameStore.setState({ enemies: [{ ...up, id: 'a', brLiftBudget: 0 }] });
    expect(strike('a')?.hit).toBe(true);
    useGameStore.setState(st => ({ enemies: [...st.enemies, { ...up, id: 'd', brLiftBudget: 0, brLiftDown: true }] }));
    expect(strike('d')?.hit).toBe(true);
    for (const id of ['a', 'd']) {
      const e = en(id)!;
      expect(e.brLiftDown, id).toBe(false);
      expect(e.brawlerLiftAt, id).toBe(now + ((e.hitStunUntil ?? now) - now)); // ★止めの間は上がり始めない(社長指示2026-11-27)
      expect((e.brLiftPeak ?? 0) > 0, id).toBe(true);
      expect(e.brLiftBudget, id).toBe(0);
    }
  });
  it('ボス級の止めの減衰が完全耐性でも浮かせる', () => {
    setup(brawler);
    useGameStore.setState({ enemies: [place('thor', 't', { bossStopDrImmuneUntil: now + 3000 } as Partial<Enemy>)] });
    expect(strike('t')?.hit).toBe(true);
    const t = en('t')!;
    expect(t.brawlerLiftAt).toBe(now);
    expect(brawlerAirborne(t, now + 1)).toBe(true);
  });
  it('浮かせないまま: 倒した一撃・終端の死神・尻尾の叩きつけ', () => {
    setup(brawler);
    useGameStore.setState({ enemies: [place('zombie', 'w', { health: 1, maxHealth: 1 })] });
    expect(strike('w')?.hit).toBe(true);
    const w = en('w');
    expect(w === undefined || w.health <= 0).toBe(true);
    expect(w?.brawlerLiftAt).toBeUndefined();

    setup(brawler);
    useGameStore.setState({ enemies: [place('reaper', 'rp', { reaperChaser: true })] });
    expect(strike('rp')?.hit).toBe(true);
    expect(en('rp')?.brawlerLiftAt).toBeUndefined();

    setup(brawler);
    useGameStore.setState({ enemies: [place('giantbat', 'tl', { aiPhase: 'g-tailslam-active', aiPhaseUntil: gt() + 99999 } as Partial<Enemy>)] });
    strike('tl');
    expect(en('tl')?.aiPhase).toBe('g-tailslam-active');
    expect(en('tl')?.brawlerLiftAt).toBeUndefined();
  });
});

describe('被弾反撃でない攻撃は今どおり', () => {
  it('普通のナイフの振り: 技の最中の雑魚は浮かず技も残る・技の最中でない雑魚は今のナイフの浮き(3段目の打ち上げ)', () => {
    setup(false);
    useGameStore.setState({ enemies: [place('zombie', 'z', { aiPhase: 'windup', aiPhaseUntil: gt() + 99999 } as Partial<Enemy>)] });
    useGameStore.getState().triggerCounter();
    expect(en('z')!.health).toBeLessThan(9_999_999);
    expect(en('z')!.aiPhase).toBe('windup');
    expect(en('z')!.brawlerLiftAt).toBeUndefined();

    setup(false);
    useGameStore.setState({ enemies: [place('zombie', 'z')] });
    useGameStore.getState().triggerCounter();
    const z = en('z')!;
    expect(z.brawlerLiftAt).toBe(now + ((z.hitStunUntil ?? now) - now)); // ★止めの間は上がり始めない(社長指示2026-11-27「上がる方も止めて」)
    expect(z.brLiftPeak).toBeCloseTo(brawlerJugglePush({}, 'mob', knifeLiftMove(false), now, false, false, false, KNIFE_LIFT_HEIGHT_MULT)!.brLiftPeak!);
  });
  it('赤い予告へのカウンター(damageEnemy の counter): 技の最中のまま残っている敵は浮かない(今どおり)', () => {
    setup(false);
    useGameStore.setState({ enemies: [place('zombie', 'b', { aiPhase: 'windup', aiPhaseUntil: gt() + 99999 } as Partial<Enemy>)] });
    useGameStore.getState().damageEnemy('b', 10, false, true, false, 'other', 'player', 'counter');
    expect(en('b')!.brawlerLiftAt).toBeUndefined();
    expect(en('b')!.aiPhase).toBe('windup');
  });
});
