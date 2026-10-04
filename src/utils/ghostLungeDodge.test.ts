// research/LUNGE_DODGE.md §3: 守護霊の踏み込み回避(段1=コマの癖どおり / 段2・3=既定の外への抜け)。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  decideGhost, lungeDirForLg, isEscapeLg, GHOST_ESCAPE_LUNGE_LEAD_MS,
  type GhostDriverInput, type GhostSelf, type GhostProfile, type GhostWeapon,
} from './ghostDriver';
import { resetGhostCommandBags } from './commandBag';
import type { Enemy } from '../types/game';
import type { HabitEpisode } from './habitEpisode';

beforeEach(() => resetGhostCommandBags());

const T = 10_000;
const boss = (): Enemy => ({
  id: 'thor-1', type: 'thor', x: 300, y: -20, width: 40, height: 40, speed: 0,
  health: 100, maxHealth: 100, damage: 10, experienceValue: 0, lastHit: 0, lastShot: 0,
  bossState: 'issen-windup', bossStateUntil: T,
  aiFromX: 0, aiFromY: 0, aiTargetX: 600, aiTargetY: 0,
} as unknown as Enemy);
const mkGhost = (o: Partial<GhostSelf> = {}): GhostSelf => ({
  x: 300, y: -300, width: 20, height: 20, maxHealth: 110, facing: 1, lastShotAt: -1e6, lastMeleeAt: -1e6, ...o,
});
const PROFILE: GhostProfile = {
  reactionMs: 200, counterChance: 1, preferredDist: 180, meleeBias: 0, mobility: 1, hitsPerMin: 0, subUsesPerMin: 2,
};
const WEAPON: GhostWeapon = { gunDamage: 10, gunIntervalMs: 300, gunRangePx: 0, meleeDamage: 20 };
const aabb = (cx: number, cy: number, e: Enemy): number => {
  const nx = Math.max(e.x, Math.min(cx, e.x + e.width)), ny = Math.max(e.y, Math.min(cy, e.y + e.height));
  return Math.hypot(cx - nx, cy - ny);
};
const input = (o: Partial<GhostDriverInput>): GhostDriverInput => ({
  ghost: mkGhost(), player: { x: 0, y: 0, width: 20, height: 20 }, enemies: [boss()], projectiles: [],
  meleeDist: aabb, profile: PROFILE, weapon: WEAPON, gameTime: 0, nowMs: 0, rand: () => 0,
  boundBossId: 'thor-1', ...o,
});
const ep = (o: Partial<HabitEpisode>): HabitEpisode => ({ posA: 100, posB: 0, sub: 0, pressOfs: null, ctxHp: 0, ctxHit: 0, seq: 1, ...o });

describe('lungeDirForLg', () => {
  const circle = { kind: 'circle' as const, cx: 0, cy: 0, radius: 100 };
  const R = { x: -10, y: -10, width: 20, height: 20 };
  it('外/横/踏み込まない/内・欠け', () => {
    expect(lungeDirForLg(1, circle, R, 50, 0, 1)).toEqual({ x: 1, y: 0 });
    const side = lungeDirForLg(2, circle, R, 50, 0, 1) as { x: number; y: number };
    expect(side.x).toBeCloseTo(0); expect(Math.abs(side.y)).toBeCloseTo(1);
    expect(lungeDirForLg(0, circle, R, 50, 0, 1)).toBe('none');
    expect(lungeDirForLg(3, circle, R, 50, 0, 1)).toBeUndefined();
    expect(lungeDirForLg(undefined, circle, R, 50, 0, 1)).toBeUndefined();
  });
  it('抜けの記録=外と横だけ', () => {
    expect([0, 1, 2, 3, undefined].map(v => isEscapeLg(v as never))).toEqual([false, true, true, false, false]);
  });
});

describe('段1: コマの癖どおりに踏み込む', () => {
  const prof = (lg: 0 | 1 | 2 | 3 | undefined, pressOfs: number): GhostProfile => ({
    ...PROFILE, counterChance: 0,
    moveHabits: { 'thor:issen-windup': [ep({ pressOfs, lg }), ep({ pressOfs, lg }), ep({ pressOfs, lg })] },
  });
  it('外へ抜けた記録は、窓が着弾を覆わなくても振って外へ踏み込む(請求は積まない)', () => {
    const d = decideGhost(input({ profile: prof(1, -1200), gameTime: T - 500, nowMs: T - 500 }));
    expect(d.action).toBe('melee');
    expect(d.meleeIsCounterAttempt).toBe(false);
    const ld = d.lungeDir as { x: number; y: number };
    expect(ld).toBeTypeOf('object');
    expect(ld.x).toBeCloseTo(0); expect(ld.y).toBeCloseTo(-1); // 帯(y=0)の上側にいる=上が外
  });
  it('その場で振った記録は踏み込まない・内/欠けは今どおり(省略)', () => {
    const none = decideGhost(input({ profile: prof(0, -100), gameTime: T - 100, nowMs: T - 100,
      ghost: mkGhost({ microHabitTFrozen: T, microHabitResolved: true, microHabitSwingAt: T - 100, microHabitSwingLg: 0,
        microHabitArmKey: 'thor:issen-windup', counterWillAttempt: true, counterPendingAt: T - 600, counterArmKey: 'issen-windup' }) }));
    expect(none.action).toBe('melee');
    expect(none.lungeDir).toBe('none');
    expect(none.meleeIsCounterAttempt).toBe(true);
    const old = decideGhost(input({ profile: prof(undefined, -100), gameTime: T - 500, nowMs: T - 500 }));
    expect(old.lungeDir).toBeUndefined();
  });
  it('窓が着弾を覆わない「内/欠け」の記録は今どおり振らない(#17)', () => {
    const d = decideGhost(input({ profile: prof(3, -1200), gameTime: T - 500, nowMs: T - 500 }));
    expect(d.action).not.toBe('melee');
  });
});

describe('段2・3: 既定の「当たる直前に外へ一直線」', () => {
  const dodgeProf: GhostProfile = { ...PROFILE, moveReactions: { 'thor-issen': { n: 5, counterRate: 0, hitRate: 0 } } };
  const inside = mkGhost({ x: 300, y: -10 }); // 中心(310,0)=帯の軸の上
  it(`避けるロールで図形の中・着弾${GHOST_ESCAPE_LUNGE_LEAD_MS}ms前なら、外へ踏み込む(請求なし・予告につき1回)`, () => {
    const d = decideGhost(input({ ghost: inside, profile: dodgeProf, gameTime: T - 150, nowMs: T - 150 }));
    expect(d.action).toBe('melee');
    expect(d.meleeIsCounterAttempt).toBe(false);
    const ld = d.lungeDir as { x: number; y: number };
    expect(Math.abs(ld.y)).toBeCloseTo(1);
    const again = decideGhost(input({
      ghost: { ...inside, moveRoll: d.moveRoll, microEscapeArmKey: d.microEscapeArmKey },
      profile: dodgeProf, gameTime: T - 120, nowMs: T - 120,
    }));
    expect(again.action).not.toBe('melee');
  });
  it('着弾まで遠い・図形の外・カウンターのロールでは出さない', () => {
    expect(decideGhost(input({ ghost: inside, profile: dodgeProf, gameTime: T - 400, nowMs: T - 400 })).lungeDir).toBeUndefined();
    const outside = decideGhost(input({ ghost: mkGhost({ x: 300, y: -300 }), profile: dodgeProf, gameTime: T - 150, nowMs: T - 150 }));
    expect(outside.action).not.toBe('melee');
    resetGhostCommandBags(); // 袋はラン単位=別の記録で引き直す
    const counterProf: GhostProfile = { ...PROFILE, moveReactions: { 'thor-issen': { n: 5, counterRate: 1, hitRate: 0 } } };
    const c = decideGhost(input({ ghost: inside, profile: counterProf, gameTime: T - 150, nowMs: T - 150 }));
    expect(c.lungeDir).toBeUndefined();
  });
});
