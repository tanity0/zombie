// 鞭の作り直し(research/WHIP_FOLLOWUP.md §8): 当てる→絡め取る→回す→投げる→着弾の爆発、をストアを動かして固める。ボス級は掴まない。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, WHIP_GRAB_HITSTOP_MS } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import * as BRC from '../utils/brawlerCombo';
import { WHIP_SWING_ACCEL_MS, WHIP_SWING_MAX_MS, WHIP_SWING_PERIOD_MS } from '../utils/whipSwing';

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
/** 掴めるのは気絶している敵だけ(社長指示2026-11-26「気絶の敵を攻撃すると掴めて、爆撃と共にKILL」)。 */
const STUN = { stunUntil: 1e12 } as Partial<Enemy>;
const ecOf = (id: string) => { const e = en(id); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; };
const step = (ms = 10) => {
  now += ms;
  useGameStore.setState(s => ({ gameTime: s.gameTime + ms, realGameTime: s.realGameTime + ms, hitstopUntil: 0 }));
  st().movePlayer(NO, ms / 1000);
  st().updateEnemies(ms / 1000);
  if (st().whipSwing) st().tickWhipSwing(); // ループと同じく敵の更新の後
};
const run = (ms: number) => { const end = now + ms; while (now < end) step(10); };
const swing = () => {
  useGameStore.setState(s => ({ player: { ...s.player, counterCooldownEnd: 0, pendingSwingAt: 0 } }));
  return st().triggerCounter();
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

describe('当てる→掴む→回す→投げる→爆発', () => {
  it('雑魚に当てると一番近い1体を掴み、加速しながらプレイヤーの周りを回り、触れた敵を1周1回弾き、投げると着弾で爆発する', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', STUN), place('zombie', 140, 0, 'z2', STUN)] });
    swing();
    const sw0 = st().whipSwing!;
    expect(sw0.enemyId).toBe('z'); // 近い方
    expect(sw0.phase).toBe('swing');
    expect(en('z').whipHeld).toBe(true);
    expect(en('z').health).toBe(99999); // 掴んだ敵には打撃を通さない(掴みに置き換える)
    expect(st().enemies.find(e => e.id === 'z2')?.whipHeld).toBeFalsy(); // 掴まなかった気絶の敵は今どおり打撃(処刑)
    useGameStore.setState(s => ({ enemies: s.enemies.filter(e => e.id !== 'z2') }));
    // 回り出し: 掴んだ直後は遅く、加速の後は一定の速さで回る(半径=届く距離×0.6 へ寄る)
    const c = center();
    const angAt = () => { const p = ecOf('z'); return Math.atan2(p.y - c.y, p.x - c.x); };
    run(50);
    const a50 = angAt();
    run(WHIP_SWING_ACCEL_MS);
    const r = Math.hypot(ecOf('z').x - c.x, ecOf('z').y - c.y);
    expect(r).toBeCloseTo(sw0.radius, 0);
    expect(Math.abs(a50)).toBeLessThan(0.6); // 出だしはゆっくり
    // 回る先に別の敵を置く → 1周に1回だけ当たり、外へ弾かれる
    const aNow = angAt();
    const ahead = aNow + sw0.dir * 1.2;
    const ox = Math.cos(ahead) * sw0.radius, oy = Math.sin(ahead) * sw0.radius;
    useGameStore.setState(s => ({ enemies: [...s.enemies.filter(e => e.id !== 'z2'), place('zombie', ox, oy, 'o')] }));
    const hpO = en('o').health;
    run(Math.round(WHIP_SWING_PERIOD_MS * 0.4));
    const hpO1 = en('o').health;
    expect(hpO1).toBeLessThan(hpO);
    const kb = { x: en('o').knockbackVx ?? 0, y: en('o').knockbackVy ?? 0 };
    expect(kb.x * Math.cos(ahead) + kb.y * Math.sin(ahead)).toBeGreaterThan(0); // 外向き
    // 弾かれた敵を回る円の上へ戻しても、1周ぶんの時間が経つまでは二度目は当たらない
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === 'o' ? { ...e, x: c.x + Math.cos(angAt()) * sw0.radius - e.width / 2, y: c.y + Math.sin(angAt()) * sw0.radius - e.height / 2, knockbackVx: 0, knockbackVy: 0, knockbackUntil: now } : e)) }));
    step(10);
    expect(en('o').health).toBe(hpO1);
    // 振り回し中のフリックは受け取って何もしない(社長指示2026-11-26「掴んだ時、任意に投げれるのはやめて」)。投げは最長で自動の投げだけ。
    useGameStore.setState(s => ({ enemies: s.enemies.filter(e => e.id !== 'o') }));
    expect(st().tryFlickFollowup(1, 0)).toBe(true);
    expect(st().whipSwing!.phase).toBe('swing');
    for (let i = 0; i < 400 && st().whipSwing?.phase === 'swing'; i++) step(10);
    const sw1 = st().whipSwing!;
    expect(sw1.phase).toBe('thrown');
    // 飛ぶ先に敵を置く(投げた敵が触れたら着弾)
    const tx = (sw1.fromX ?? 0) + (sw1.ux ?? 1) * 160 - center().x, ty = (sw1.fromY ?? 0) + (sw1.uy ?? 0) * 160 - center().y;
    useGameStore.setState(s => ({ enemies: [...s.enemies, place('zombie', tx, ty, 't')] }));
    const hpZ = en('z').health, hpT = en('t').health;
    let landed = false;
    for (let i = 0; i < 100 && !landed; i++) { step(10); landed = st().whipSwing === null; }
    expect(landed).toBe(true);
    const z = st().enemies.find(e => e.id === 'z');
    expect(!z || z.health <= 0 || z.health < hpZ).toBe(true);
    expect(!z || z.health <= 0).toBe(true); // 掴んだ雑魚は着弾の爆発で必ず死ぬ(KILL)
    expect(en('t').health).toBeLessThan(hpT); // 当たった敵も
  });

  it('ボス級は掴まない(打撃と押しは今のまま)', () => {
    useGameStore.setState({ enemies: [place('hunter', 110, 0, 'h')] });
    swing();
    expect(en('h').health).toBeLessThan(99999);
    expect(st().whipSwing).toBeNull();
    expect(en('h').whipHeld).toBeFalsy();
  });

  it('フリックしないと最長の時間で自動で投げる', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', STUN)] });
    swing();
    run(WHIP_SWING_MAX_MS - 50);
    expect(st().whipSwing?.phase).toBe('swing');
    run(80);
    const sw = st().whipSwing;
    expect(sw === null || sw.phase === 'thrown').toBe(true);
  });

  it('振り回し中の近接は何もしない(投げない・カウンター窓も開かない・通常の振りも出ない)=社長指示2026-11-26「掴んだ時、任意に投げれるのはやめて」', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', STUN)] });
    swing();
    run(200);
    useGameStore.setState(s => ({ player: { ...s.player, lastDirection: { x: 0, y: 1 }, counterCooldownEnd: 0, whipCounterReadyAt: 0, counterWindowEnd: 0, pendingSwingAt: 0 } }));
    expect(st().triggerCounter().swung).toBe(false); // PC/ボットの直呼び
    expect(st().whipSwing!.phase).toBe('swing');
    expect(st().beginMeleeSwing()).toBe(false); // タッチ(指を離す)
    expect(st().whipSwing!.phase).toBe('swing');
    expect(st().player.counterWindowEnd).toBe(0);
    expect(st().player.pendingSwingAt).toBe(0);
    // 最長で自動で投げる
    run(WHIP_SWING_MAX_MS);
    const sw = st().whipSwing;
    expect(sw === null || sw.phase === 'thrown').toBe(true);
  });

  it('掴んだ瞬間は少し長めに止める(止め=WHIP_GRAB_HITSTOP_MS)・寄りの起点(壁時計)と寄り先を持つ', () => {
    expect(WHIP_GRAB_HITSTOP_MS).toBeGreaterThanOrEqual(180);
    expect(WHIP_GRAB_HITSTOP_MS).toBeLessThanOrEqual(220);
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', STUN)], hitstopUntil: 0 });
    const ec = ecOf('z');
    swing();
    expect(st().whipSwing?.phase).toBe('swing');
    expect(st().hitstopUntil - now).toBe(WHIP_GRAB_HITSTOP_MS);
    expect(st().whipSwing!.grabAt).toBe(now);
    expect(st().whipSwing!.grabX).toBeCloseTo(ec.x);
    expect(st().whipSwing!.grabY).toBeCloseTo(ec.y);
  });

  it('技の行(大車輪)は自動の投げの着弾でも1回出る(社長指示2026-11-26)。投げた敵の回りは振り回しの向きを引き継ぐ', () => {
    const techRows = () => st().skillProcFeed.filter(r => r.key === 'tech:whipslam').length;
    const landNow = () => { for (let i = 0; i < 200 && st().whipSwing; i++) step(10); };
    useGameStore.setState({ enemies: [place('zombie', -100, 0, 'y', STUN)], skillProcFeed: [] });
    useGameStore.setState(s => ({ player: { ...s.player, lastDirection: { x: -1, y: 0 } } }));
    swing();
    expect(st().whipSwing?.enemyId).toBe('y');
    const dir = st().whipSwing!.dir;
    for (let i = 0; i < 400 && st().whipSwing?.phase === 'swing'; i++) step(10);
    expect(st().whipSwing?.phase).toBe('thrown');
    expect(en('y').brThrowSpin?.dir).toBe(dir);
    expect(techRows()).toBe(0); // 投げた瞬間はまだ出ない(着弾で出す)
    landNow();
    expect(st().whipSwing).toBeNull();
    expect(techRows()).toBe(1);
  });

  it('生き残った強個体は着弾で気絶が解ける=もう一度当てても掴まない(社長指示2026-11-26「一度回したらクリティカル解除して」)', () => {
    const strong = place('zombie', 100, 0, 's', { stunUntil: 1e12, colorTier: 'red' } as Partial<Enemy>);
    expect(BRC.brawlerEnemyClass(strong)).toBe('strong');
    useGameStore.setState({ enemies: [strong] });
    swing();
    expect(st().whipSwing?.enemyId).toBe('s');
    for (let i = 0; i < 600 && st().whipSwing; i++) step(10);
    expect(st().whipSwing).toBeNull();
    const s1 = en('s');
    expect(s1.health).toBeGreaterThan(0); // 強個体は爆発のダメージだけ(処刑しない)
    expect(s1.stunUntil === undefined || s1.stunUntil <= st().gameTime).toBe(true);
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === 's' ? { ...e, x: center().x + 100 - e.width / 2, y: center().y - e.height / 2 } : e)) }));
    swing();
    expect(st().whipSwing).toBeNull();
  });

  it('掴まれている敵に弾は当たらない・毒などで死んだらその場で着弾(技の行は出さない)', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', STUN)], skillProcFeed: [] });
    swing();
    run(100);
    const hp = en('z').health;
    st().damageEnemy('z', 50, false, false, false, 'gun');
    expect(en('z').health).toBe(hp); // 弾は素通り
    const p = ecOf('z');
    useGameStore.setState(s => ({ enemies: [...s.enemies, place('zombie', p.x - center().x + 30, p.y - center().y, 'n')] }));
    const hpN = en('n').health;
    st().damageEnemy('z', 9_999_999, false, false, false, 'dot');
    step(10);
    expect(st().whipSwing).toBeNull();
    expect(en('n').health).toBeLessThan(hpN); // その場の爆発
    expect(st().skillProcFeed.filter(r => r.key === 'tech:whipslam').length).toBe(0); // 途中で死んだ着弾は大車輪を出さない
  });
});

// ★慣性(社長「鞭は動きがギクシャクしない様に慣性に従って自然に動く様に注意してね」): 1フレームごとの位置が跳ばない・止まらない。
describe('振り回し→投げ→放すの継ぎ目(1フレームごとの位置)', () => {
  const F = 1000 / 60;
  const track = (frames: number, act: (f: number) => void = () => {}) => {
    const out: { x: number; y: number; phase: string }[] = [];
    for (let f = 0; f < frames; f++) {
      act(f);
      step(F);
      const e = st().enemies.find(x => x.id === 'z');
      if (!e) break;
      out.push({ x: e.x + e.width / 2, y: e.y + e.height / 2, phase: st().whipSwing?.phase ?? 'none' });
    }
    return out;
  };
  const steps = (p: { x: number; y: number }[]) => p.slice(1).map((q, i) => Math.hypot(q.x - p[i].x, q.y - p[i].y));
  it('投げたフレームで止まらない(自動の投げで、放した次のフレームから直進の速さで進む)', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', STUN)] });
    swing();
    const p2 = track(Math.ceil(WHIP_SWING_MAX_MS / F) + 10);
    const s2 = steps(p2);
    const j = p2.findIndex(q => q.phase === 'thrown');
    expect(j).toBeGreaterThan(0);
    expect(Math.min(s2[j - 1], s2[j])).toBeGreaterThan(0.7 * s2[j - 2]);
  });
  it('鞭を外して途中で放す: 回っていた勢いのまま滑って止まる(瞬間停止しない)・止まったら掴みを外す(技の行は出さない)', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', STUN)], skillProcFeed: [] });
    swing();
    const p = track(40, f => { if (f === 25) useGameStore.setState(s => ({ player: { ...s.player, subWeapons: [] } })); });
    const s = steps(p);
    const i = p.findIndex(q => q.phase === 'drop');
    expect(i).toBeGreaterThan(0);
    expect(s[i - 1]).toBeGreaterThan(0.7 * s[i - 2]);
    const k = p.findIndex(q => q.phase === 'none');
    expect(k).toBeGreaterThan(i + 3);
    for (let n = i; n < k; n++) expect(s[n]).toBeLessThanOrEqual(s[n - 1] + 0.5); // 減速だけ
    expect(en('z').whipHeld).toBeFalsy();
    expect(st().skillProcFeed.filter(r => r.key === 'tech:whipslam').length).toBe(0); // 放した(着弾しない)=大車輪を出さない
  });
  it('帯の縁で回す: 半径を縮める時も1フレームで跳ばない', () => {
    useGameStore.setState(s => ({ stageTheme: 'lab' as never, player: { ...s.player, y: -200 + 60 - s.player.height / 2 } }));
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', STUN)] });
    swing();
    const p = track(80);
    const s = steps(p);
    for (let n = 1; n < s.length; n++) if (p[n + 1]?.phase === 'swing' && p[n].phase === 'swing') expect(Math.abs(s[n] - s[n - 1])).toBeLessThan(4);
  });
});
