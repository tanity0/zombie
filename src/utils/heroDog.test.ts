import { describe, it, expect } from 'vitest';
import {
  heroDogPresence, buildHeroDog, pickHeroDogTarget, stepHeroDog, heroDogCanBite,
  HERO_DOG_HP, HERO_DOG_HUNT_RANGE, HERO_DOG_LEASH, HERO_DOG_HEEL_GAP, HERO_DOG_SPEED, HERO_DOG_ACCEL,
} from './heroDog';
import { spawnEnemyAt } from './enemyUtils';

describe('英雄の犬: 居る/居ない(research/HERO_DOG.md §3)', () => {
  it('英雄が効いていて犬が居なければ現れる', () => {
    expect(heroDogPresence({ heroActive: true, hasDog: false, dogLeaving: false, gameTime: 1000 })).toBe('spawn');
  });
  it('死んでから10秒は現れない(復活待ち)', () => {
    expect(heroDogPresence({ heroActive: true, hasDog: false, dogLeaving: false, respawnAt: 11000, gameTime: 5000 })).toBe('none');
    expect(heroDogPresence({ heroActive: true, hasDog: false, dogLeaving: false, respawnAt: 11000, gameTime: 11000 })).toBe('spawn');
  });
  it('HPが満タンでなくなると去る/去りかけに満タンへ戻れば呼び戻す', () => {
    expect(heroDogPresence({ heroActive: false, hasDog: true, dogLeaving: false, gameTime: 0 })).toBe('leave');
    expect(heroDogPresence({ heroActive: false, hasDog: true, dogLeaving: true, gameTime: 0 })).toBe('none');
    expect(heroDogPresence({ heroActive: true, hasDog: true, dogLeaving: true, gameTime: 0 })).toBe('keep');
  });
  it('英雄が効いていなくて犬も居なければ何もしない', () => {
    expect(heroDogPresence({ heroActive: false, hasDog: false, dogLeaving: false, gameTime: 0 })).toBe('none');
  });
  it('HPは100固定', () => {
    const d = buildHeroDog(0, 0, 0);
    expect(d.health).toBe(HERO_DOG_HP); expect(d.maxHealth).toBe(100); expect(d.kind).toBe('hero-dog');
  });
});

describe('英雄の犬: 狙い(§4)', () => {
  it('主人から HUNT_RANGE 内の敵だけを狙い、犬に一番近いものを選ぶ', () => {
    const near = spawnEnemyAt('zombie', 100, 0, 0);
    const near2 = spawnEnemyAt('zombie', 150, 0, 0);
    const far = spawnEnemyAt('zombie', HERO_DOG_HUNT_RANGE + 200, 0, 0);
    const t = pickHeroDogTarget(160, 0, 0, 0, [near, near2, far]);
    expect(t?.id).toBe(near2.id);
    expect(pickHeroDogTarget(0, 0, 0, 0, [far])).toBeNull();
  });
  it('死体・昇天中の英雄・死神は噛まない', () => {
    const corpse = { ...spawnEnemyAt('zombie', 50, 0, 0), corpseUntil: 1 };
    const reaper = spawnEnemyAt('reaper', 50, 0, 0);
    const hero = spawnEnemyAt('mutant-hero', 50, 0, 0);
    expect(heroDogCanBite(corpse)).toBe(false);
    expect(heroDogCanBite(reaper)).toBe(false);
    expect(heroDogCanBite(hero)).toBe(false);
    expect(heroDogCanBite(spawnEnemyAt('zombie', 50, 0, 0))).toBe(true);
  });
});

describe('英雄の犬: 動き(§4・慣性)', () => {
  const dog = () => ({ ...buildHeroDog(0, 0, 0), x: -15, y: -11, vx: 0, vy: 0 });
  it('止まった状態から一気に最高速にはならない(加速する)', () => {
    const s = stepHeroDog(dog(), 0, 0, { cx: 300, cy: 0 }, 1 / 60);
    expect(Math.hypot(s.vx, s.vy)).toBeLessThan(HERO_DOG_SPEED);
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(HERO_DOG_ACCEL / 60, 3);
  });
  it('狙いが無ければ主人の横(背中側の定位置)で止まる(定位置から HEEL_GAP の内側では目標速度0)', async () => {
    const { heroDogHeelPoint } = await import('./heroDog');
    const heel = heroDogHeelPoint(0, 0, 1);
    expect(heel.cx).toBeLessThan(0); // 右向きの主人なら左(後ろ)
    const d = { ...dog(), x: heel.cx + HERO_DOG_HEEL_GAP - 6 - 15, y: heel.cy - 11, vx: 0, vy: 0 };
    const s = stepHeroDog(d, 0, 0, null, 1 / 60, false, null, 1);
    expect(s.vx).toBe(0); expect(s.vy).toBe(0);
  });
  it('拾い物の代行中は綱を無視して拾い物へ走る', () => {
    const d = { ...dog(), x: -15, y: -11, vx: 0, vy: 0 };
    const s = stepHeroDog(d, 0, 0, { cx: 100, cy: 0 }, 1 / 60, false, { cx: HERO_DOG_LEASH + 300, cy: 0 });
    expect(s.vx).toBeGreaterThan(0);
  });
  it('主人から LEASH より離れていたら狙いを捨てて主人へ戻る', () => {
    const d = { ...dog(), x: HERO_DOG_LEASH + 50 - 15, y: -11, vx: 0, vy: 0 };
    const s = stepHeroDog(d, 0, 0, { cx: HERO_DOG_LEASH + 300, cy: 0 }, 1 / 60);
    expect(s.vx).toBeLessThan(0); // 主人(x=0)の方へ
  });
  it('速度を持っていれば滑って止まる(即停止しない)', () => {
    const d = { ...dog(), x: -15, y: -11, vx: HERO_DOG_SPEED, vy: 0 };
    const s = stepHeroDog(d, 0, 0, null, 1 / 60);
    expect(s.vx).toBeGreaterThan(0);
    expect(s.vx).toBeLessThan(HERO_DOG_SPEED);
  });
});

describe('英雄の犬: 監査反映(速度追従・粘着・現れる位置)', () => {
  it('速度は主人の実効速度×1.15 と最低速度の大きい方(上限あり)', async () => {
    const { heroDogSpeedFor, HERO_DOG_SPEED_MAX } = await import('./heroDog');
    expect(heroDogSpeedFor(undefined)).toBe(HERO_DOG_SPEED);
    expect(heroDogSpeedFor(136)).toBeCloseTo(136 * 1.15);
    expect(heroDogSpeedFor(1000)).toBe(HERO_DOG_SPEED_MAX);
  });
  it('噛み始めた相手は綱(LEASH)の内に居る限り変えない(300/380のヒステリシス)', () => {
    const a = spawnEnemyAt('zombie', HERO_DOG_HUNT_RANGE + 40, 0, 0); // 300超・380内
    const b = spawnEnemyAt('zombie', 50, 0, 0);
    expect(pickHeroDogTarget(0, 0, 0, 0, [a, b], a.id)?.id).toBe(a.id);
    expect(pickHeroDogTarget(0, 0, 0, 0, [a, b])?.id).toBe(b.id);
    const far = spawnEnemyAt('zombie', HERO_DOG_LEASH + 100, 0, 0);
    expect(pickHeroDogTarget(0, 0, 0, 0, [far, b], far.id)?.id).toBe(b.id);
  });
  it('現れる位置は主人から離れた所(最寄りの敵と反対側)', async () => {
    const { heroDogEntryPoint, HERO_DOG_ENTRY_DIST } = await import('./heroDog');
    const e = heroDogEntryPoint(0, 0, { cx: 200, cy: 0 });
    expect(e.cx).toBeCloseTo(-HERO_DOG_ENTRY_DIST);
    expect(heroDogEntryPoint(0, 0, null).cx).toBeCloseTo(-HERO_DOG_ENTRY_DIST);
  });
  it('去る時は主人から離れる向きへ走る', () => {
    const d = { ...buildHeroDog(60, 0, 0), vx: 0, vy: 0 };
    const s = stepHeroDog(d, 0, 0, null, 1 / 60, true);
    expect(s.vx).toBeGreaterThan(0);
  });
});
