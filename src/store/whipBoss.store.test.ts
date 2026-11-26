// 鞭とボス・パニッシャー(社長指示2026-11-25「鞭はボスに先端を当てると大ダメージで。また、気絶してるボスは掴める。パニッシャーも効かせてる？効かせて」)。
// ①先端(届く距離の外側25%)でボス区分を打つと×WHIP_TIP_BOSS_MULT・根元寄りは等倍 ②気絶で止まっているボスは掴める・明けたら自動で投げる ③パニッシャーが鞭の3つの飛び方で巻き込む。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, enemyMeleeDist, whipSwingReach } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { WHIP_TIP_BOSS_MULT, WHIP_TIP_FRAC, WHIP_SWING_ACCEL_MS, WHIP_OVERHEAD_MS, WHIP_OVERHEAD_RISE_FRAC, whipSwingBodyRadius } from '../utils/whipSwing';
import { clampRectToPlayableArea } from '../world/playableArea';

let now = 15_000_000;
const NO = { up: false, down: false, left: false, right: false } as never;
const st = () => useGameStore.getState();
const center = () => { const p = st().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, st().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => st().enemies.find(e => e.id === id)!;
const ecOf = (id: string) => { const e = en(id); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; };
const step = (ms = 10) => {
  now += ms;
  useGameStore.setState(s => ({ gameTime: s.gameTime + ms, realGameTime: s.realGameTime + ms, hitstopUntil: 0 }));
  st().movePlayer(NO, ms / 1000);
  st().updateEnemies(ms / 1000);
  if (st().whipSwing) st().tickWhipSwing();
};
const run = (ms: number) => { const end = now + ms; while (now < end) step(10); };
const swing = () => {
  useGameStore.setState(s => ({ player: { ...s.player, counterCooldownEnd: 0, pendingSwingAt: 0 } }));
  return st().triggerCounter();
};
const setSkills = (punisherLv: number) => useGameStore.setState(s => ({
  player: { ...s.player, skills: punisherLv > 0 ? ['punisher'] : [], skillLevels: punisherLv > 0 ? { punisher: punisherLv } : {} },
}));
/** 当たりの箱の一番近い点がプレイヤーから dist になる右方向のずれ(dy=0)。 */
const dxForDist = (type: EnemyType, dist: number): number => {
  for (let dx = 0; dx < 600; dx += 0.5) {
    const e = place(type, dx, 0, 'probe');
    const c = center();
    if (enemyMeleeDist(c.x, c.y, e) >= dist) return dx;
  }
  throw new Error('no dx');
};

beforeEach(() => {
  now = 15_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
  st().resetGame('warrior');
  useGameStore.setState(s => ({
    m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false }, breakableProps: [],
    player: { ...s.player, subWeapons: ['whip'], skills: [], skillLevels: {}, whipCharged: false, whipHitCount: 0, counterCooldownEnd: 0, pendingSwingAt: 0, lastDirection: { x: 1, y: 0 }, health: 9999, maxHealth: 9999 },
  }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('①先端でボスを打つと大ダメージ', () => {
  const dmgAt = (type: EnemyType, dist: number): number => {
    useGameStore.setState({ enemies: [place(type, dxForDist(type, dist), 0, 'b')] });
    swing();
    return 99999 - en('b').health;
  };
  it('ボス区分: 外側25%で×WHIP_TIP_BOSS_MULT・根元寄りは等倍', () => {
    const reach = whipSwingReach(st().player);
    const near = dmgAt('hunter', reach * 0.4);
    st().resetGame('warrior');
    useGameStore.setState(s => ({ m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false }, breakableProps: [], player: { ...s.player, subWeapons: ['whip'], skills: [], skillLevels: {}, lastDirection: { x: 1, y: 0 }, health: 9999 } }));
    const tip = dmgAt('hunter', reach * (WHIP_TIP_FRAC + 0.05));
    expect(near).toBeGreaterThan(0);
    expect(tip / near).toBeCloseTo(WHIP_TIP_BOSS_MULT, 2);
  });
  it('境目のすぐ内側は等倍', () => {
    const reach = whipSwingReach(st().player);
    const near = dmgAt('hunter', reach * 0.3);
    st().resetGame('warrior');
    useGameStore.setState(s => ({ m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false }, breakableProps: [], player: { ...s.player, subWeapons: ['whip'], skills: [], skillLevels: {}, lastDirection: { x: 1, y: 0 }, health: 9999 } }));
    const inner = dmgAt('hunter', reach * (WHIP_TIP_FRAC - 0.05));
    expect(inner / near).toBeCloseTo(1, 2);
  });
  it('雑魚は先端でも等倍(ボス区分だけ)', () => {
    const reach = whipSwingReach(st().player);
    const near = dmgAt('zombie', reach * 0.3);
    useGameStore.setState({ whipSwing: null });
    st().resetGame('warrior');
    useGameStore.setState(s => ({ m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false }, breakableProps: [], player: { ...s.player, subWeapons: ['whip'], skills: [], skillLevels: {}, lastDirection: { x: 1, y: 0 }, health: 9999 } }));
    const tip = dmgAt('zombie', reach * 0.85);
    expect(tip / near).toBeCloseTo(1, 2);
  });
});

describe('②気絶しているボスは掴める=頭上を越えて反対側へ叩きつける(社長指示2026-11-26)', () => {
  it('気絶していないボスは掴まない・半減の遅さだけでも掴まない', () => {
    useGameStore.setState({ enemies: [place('hunter', 100, 0, 'h', { bossSlowUntil: st().gameTime + 5000 })] });
    swing();
    expect(st().whipSwing).toBeNull();
  });
  it('気絶中のボスを掴むと振り回さず弧に入り、反対側へ叩きつけ、爆発は本人に満額で非致死', () => {
    const until = st().gameTime + 200; // 弧の途中で気絶が明けても最後まで行く
    useGameStore.setState({ enemies: [place('hunter', 100, 0, 'h', { stunUntil: until })] });
    const c0 = center();
    swing();
    const sw = st().whipSwing!;
    expect(sw.enemyId).toBe('h');
    expect(sw.phase).toBe('overhead');
    expect(en('h').whipHeld).toBe(true);
    expect(en('h').health).toBe(99999); // 掴みに置き換える(5倍の枝は通らない)
    expect((sw.toX ?? 0) - c0.x).toBeLessThan(-60); // 反対側(左)
    // 入力の投げは弧の間は効かない
    expect(st().tryFlickFollowup(1, 0)).toBe(false);
    useGameStore.setState(s => ({ player: { ...s.player, counterCooldownEnd: 0 } }));
    st().triggerCounter();
    expect(st().whipSwing?.phase).toBe('overhead');
    // 途中: 頭上(プレイヤーの中心の近く)を通る
    run(Math.round(WHIP_OVERHEAD_MS * WHIP_OVERHEAD_RISE_FRAC));
    expect(Math.abs(ecOf('h').x - c0.x)).toBeLessThan(12);
    expect(st().whipSwing?.phase).toBe('overhead');
    for (let i = 0; i < 200 && st().whipSwing; i++) step(10);
    expect(st().whipSwing).toBeNull();
    expect(en('h').whipHeld).toBeFalsy();
    expect(ecOf('h').x).toBeCloseTo(sw.toX ?? 0, 0);
    expect(en('h').health).toBeLessThan(99999); // 爆発を満額で受ける
    expect(en('h').health).toBeGreaterThan(0); // ボスは非致死
  });
  it('紫(体勢の崩れ)中のボスも掴んで叩きつける', () => {
    const until = st().gameTime + 5000;
    useGameStore.setState({ enemies: [place('hunter', 100, 0, 'h', { bossFullStunUntil: until, stunUntil: until, bossPosture: 0 })] });
    swing();
    expect(st().whipSwing?.phase).toBe('overhead');
  });
  it('大きなボスは体の大きさ以上離して置き、行ける帯の外へ出さない(弧の間も)', () => {
    const until = st().gameTime + 1400;
    useGameStore.setState({ enemies: [place('mimir', 160, 0, 'm', { stunUntil: until })] });
    swing();
    const sw = st().whipSwing!;
    expect(sw.phase).toBe('overhead');
    const e0 = en('m'), p = st().player, c = center();
    expect(Math.hypot((sw.toX ?? 0) - c.x, (sw.toY ?? 0) - c.y)).toBeGreaterThanOrEqual(whipSwingBodyRadius(e0.width, e0.height, p.width, p.height) - 1e-6);
    for (let i = 0; i < 100 && st().whipSwing; i++) {
      step(10);
      const e = en('m'), s = st();
      const cl = clampRectToPlayableArea(e.x, e.y, e.width, e.height, { farBackdrop: s.farBackdrop, labTheme: s.stageTheme === 'lab', corridorMode: s.corridorMode, m0AdvanceLimitX: s.m0AdvanceLimitX, corridorRunInActive: s.corridorRunInActive, exPlayerBarrier: s.exBarrier }, e.x);
      expect(Math.abs(cl.x - e.x) + Math.abs(cl.y - e.y)).toBeLessThan(1);
    }
    expect(st().whipSwing).toBeNull();
  });
  it('掴んだ瞬間に溜めていた技は取り消される(雑魚の掴みと同じ)', () => {
    const until = st().gameTime + 1000;
    useGameStore.setState({ enemies: [place('hunter', 100, 0, 'h', { stunUntil: until, aiPhase: 'windup', aiStartedAt: st().gameTime } as Partial<Enemy>)] });
    swing();
    expect(st().whipSwing?.enemyId).toBe('h');
    expect(en('h').aiPhase === undefined || en('h').aiPhase !== 'windup').toBe(true);
  });
  it('弧の途中でプレイヤーが死んだら放す(爆発なし)', () => {
    useGameStore.setState({ enemies: [place('hunter', 100, 0, 'h', { stunUntil: st().gameTime + 3000 })] });
    swing();
    run(200);
    useGameStore.setState(s => ({ player: { ...s.player, health: 0 } }));
    step(10);
    expect(st().whipSwing).toBeNull();
    expect(en('h').whipHeld).toBeFalsy();
    expect(en('h').health).toBe(99999);
  });
});

describe('③パニッシャーを鞭に効かせる', () => {
  // 振り回しで弾いた敵 o の外側に v を置く。o が飛んで v に当たるか。
  const caseSwingHit = (lv: number): boolean => {
    setSkills(lv);
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', { stunUntil: 1e12 })] });
    swing();
    run(260);
    const sw = st().whipSwing!;
    const c = center();
    const a = Math.atan2(ecOf('z').y - c.y, ecOf('z').x - c.x) + sw.dir * 0.9;
    const ox = Math.cos(a) * sw.radius, oy = Math.sin(a) * sw.radius;
    const vx = Math.cos(a) * (sw.radius + 46), vy = Math.sin(a) * (sw.radius + 46);
    useGameStore.setState(s => ({ enemies: [...s.enemies, place('zombie', ox, oy, 'o'), place('zombie', vx, vy, 'v')] }));
    let hopped = false;
    for (let i = 0; i < 40; i++) { step(10); if (en('v')?.punisherHopped || en('v')?.punisherPendingAt !== undefined) hopped = true; }
    expect(en('o').health).toBeLessThan(99999); // 回して当てた
    return hopped;
  };
  it('①振り回しで弾いた敵が別の敵にぶつかると巻き込む(所持時だけ)', () => {
    expect(caseSwingHit(1)).toBe(true);
    st().resetGame('warrior');
    useGameStore.setState(s => ({ m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false }, breakableProps: [], player: { ...s.player, subWeapons: ['whip'], lastDirection: { x: 1, y: 0 }, health: 9999 } }));
    expect(caseSwingHit(0)).toBe(false);
  });

  // 投げた敵を t に当てる。t が投げの向きへ飛び、パニッシャーのダメージを受けるか。
  const caseThrow = (lv: number) => {
    setSkills(lv);
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', { stunUntil: 1e12 })] });
    swing();
    run(WHIP_SWING_ACCEL_MS + 100); // 最高の回転まで回してから投げる(回り出しは重い)
    st().tryFlickFollowup(1, 0);
    const sw = st().whipSwing!;
    const tx = (sw.fromX ?? 0) + 150 - center().x, ty = (sw.fromY ?? 0) - center().y;
    useGameStore.setState(s => ({ enemies: [...s.enemies, place('zombie', tx, ty, 't'), place('zombie', tx + 60, ty, 'u')] }));
    for (let i = 0; i < 100 && st().whipSwing; i++) step(10);
    const landed = { ...ecOf('t') };
    const tpend = en('t').punisherPendingAt;
    const hpAfterBlast = en('t').health;
    run(300);
    return { tpend, hpDrop: hpAfterBlast - en('t').health, moved: ecOf('t').x - landed.x, uHopped: en('u').punisherHopDepth };
  };
  it('②投げた敵が当たった敵は同じ勢い(投げの向き)で飛び、パニッシャーのダメージを受ける(所持時だけ)', () => {
    const on = caseThrow(1);
    expect(on.tpend).toBeDefined();
    expect(on.hpDrop).toBeGreaterThan(0);
    expect(on.moved).toBeGreaterThan(20);
    st().resetGame('warrior');
    useGameStore.setState(s => ({ m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false }, breakableProps: [], player: { ...s.player, subWeapons: ['whip'], lastDirection: { x: 1, y: 0 }, health: 9999 } }));
    const off = caseThrow(0);
    expect(off.tpend).toBeUndefined();
    expect(off.hpDrop).toBe(0);
  });
  it('覚醒(Lv3)は巻き込まれた敵がもう1体を巻き込む(2連鎖)', () => {
    const r = caseThrow(3);
    expect(r.tpend).toBeDefined();
    expect(r.uHopped).toBe(2);
  });

  it('③着弾の爆発で飛んだ敵が別の敵にぶつかると巻き込む(所持時だけ)', () => {
    const caseBlast = (lv: number): boolean => {
      setSkills(lv);
      useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', { stunUntil: 1e12 })] });
      swing();
      run(200);
      st().tryFlickFollowup(0, 1); // 下へ投げ、最大距離で着弾させる(敵には当てない)
      let land: { x: number; y: number } | null = null;
      for (let i = 0; i < 200 && st().whipSwing; i++) {
        const sw = st().whipSwing!;
        if (!land && sw.phase === 'thrown') {
          // 着く所の右に b、その右に w を置く(爆発で b が右へ飛び w に当たる)
          const ex = (sw.fromX ?? 0) + (sw.ux ?? 0) * (sw.maxDist ?? 0), ey = (sw.fromY ?? 0) + (sw.uy ?? 0) * (sw.maxDist ?? 0);
          land = { x: ex, y: ey };
          const c = center();
          useGameStore.setState(s => ({ enemies: [...s.enemies, place('zombie', ex - c.x + 46, ey - c.y, 'b'), place('zombie', ex - c.x + 96, ey - c.y, 'w')] }));
        }
        step(10);
      }
      let hop = false;
      for (let i = 0; i < 50; i++) { step(10); if (en('w')?.punisherPendingAt !== undefined || en('w')?.punisherHopped) hop = true; }
      expect(en('b').health).toBeLessThan(99999);
      return hop;
    };
    expect(caseBlast(1)).toBe(true);
    st().resetGame('warrior');
    useGameStore.setState(s => ({ m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false }, breakableProps: [], player: { ...s.player, subWeapons: ['whip'], lastDirection: { x: 1, y: 0 }, health: 9999 } }));
    expect(caseBlast(0)).toBe(false);
  });
});
