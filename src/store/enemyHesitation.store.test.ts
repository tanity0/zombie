// 技に入る前のためらい(research/ENEMY_HESITATION.md)の配線: 代表型(pumpkin・driller・giantbat・bounty-melee)を実際のストアで回す。
// 純関数(抽選・動きの1歩・打ち切り・hesOwed)は src/utils/enemyHesitation.test.ts。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, PUMPKIN_TRIGGER_RANGE } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { setHesitationRandForTest } from '../utils/enemyHesitation';
import { canStartBite } from '../utils/enemyBite';
import { runBountyTick, createBountyTickState } from '../utils/bountyTick';
import type { Enemy } from '../types/game';

const ORIGIN = 50_000;
const GT = 10_000_000;
let gt = GT;
let now = 1_800_000_000_000;

/** 抽選の乱数の並び(種類→長さ→量→左右)。種類: <0.55=技 / 0.55〜0.75=旋回 / 0.75〜0.87=様子見 / 0.87〜=後退。 */
const seq = (...vals: number[]) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };
const STRAFE = () => seq(0.6, 0.5, 1, 0.5);
const WATCH = () => seq(0.8, 0.5);
const BACKSTEP = () => seq(0.95, 1, 1);

const setup = () => {
  useGameStore.getState().resetGame('assault');
  gt = GT;
  useGameStore.setState(s => ({
    gameTime: gt, enemies: [], projectiles: [], pumpkinBlasts: [],
    camera: { x: ORIGIN - 215, y: ORIGIN - 466 }, gameBounds: { width: 430, height: 932 }, viewZoom: 1,
    player: { ...s.player, x: ORIGIN - s.player.width / 2, y: ORIGIN - s.player.height / 2, health: 99999, maxHealth: 99999 },
    escorts: s.escorts.map((e, i) => ({ ...e, x: ORIGIN + 20_000 + i * 500, y: ORIGIN + 20_000 })),
  }));
};
const put = (type: Parameters<typeof spawnEnemyAt>[0], dx: number, dy: number, over: Partial<Enemy> = {}): Enemy => {
  const e = { ...spawnEnemyAt(type, 0, 0, gt), dormant: false, health: 999999, maxHealth: 999999, ...over } as Enemy;
  e.x = ORIGIN + dx - e.width / 2; e.y = ORIGIN + dy - e.height / 2;
  useGameStore.setState(s => ({ enemies: [...s.enemies, e] }));
  return e;
};
const en = (id: string): Enemy => useGameStore.getState().enemies.find(e => e.id === id)!;
const patchEnemy = (id: string, p: Partial<Enemy>) =>
  useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === id ? { ...e, ...p } : e)) }));
const DT = 16;
const tick = () => {
  gt += DT; now += DT;
  useGameStore.getState().setGameTime(gt);
  useGameStore.getState().updateEnemies(DT / 1000);
};
const center = (e: Enemy) => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 });

beforeEach(() => {
  setTreesDisabled(true); setTorchesDisabled(true);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  setup();
});
afterEach(() => { setHesitationRandForTest(null); vi.restoreAllMocks(); });

describe('パンプキン(A の型・射程に入った瞬間)', () => {
  it('抽選が「技」なら今どおりその場で溜めへ(1bitも変わらない)', () => {
    setHesitationRandForTest(() => 0);
    const p = put('pumpkin', 200, 0, { id: 'p' });
    tick();
    expect(en(p.id).aiPhase).toBe('crouch');
    expect(en(p.id).hesKind).toBeUndefined();
    expect(en(p.id).hesOwed).toBeUndefined();
  });
  it('旋回: 溜めに入らず(赤い予告なし)横へ大きく回り込み、明けた瞬間に必ず溜めへ(2回続けて迷わない)', () => {
    setHesitationRandForTest(STRAFE()); // 以後の抽選も旋回側=印がなければ迷い続ける並び
    const p = put('pumpkin', 200, 0, { id: 'p' });
    const c0 = center(en(p.id));
    tick();
    expect(en(p.id).hesKind).toBe('strafe');
    expect(en(p.id).hesOwed).toBe(true);
    const until = en(p.id).hesUntil!;
    while (gt < until) {
      expect(en(p.id).aiPhase).toBeUndefined(); // 予告の出る相に入らない
      expect(canStartBite(en(p.id), gt, now)).toBe(false); // 噛みつきも出ない
      tick();
    }
    const c1 = center(en(p.id));
    // 相手は −x 側=接線は ±y。上(奥)へ向かわない方=y が増える側へ、40〜90px の叩き台(上限=素の速さ×1.2)ぶん。
    expect(c1.y - c0.y).toBeGreaterThan(20);
    expect(Math.abs(c1.x - c0.x)).toBeLessThan(15);
    // 明けたフレームで必ず技(抽選し直さない)。
    for (let i = 0; i < 3 && en(p.id).aiPhase === undefined; i++) tick();
    expect(en(p.id).aiPhase).toBe('crouch');
    expect(en(p.id).hesOwed).toBeUndefined();
  });
  it('後退で射程の外へ→普段の接近で詰め→射程に入った瞬間に技(抽選し直さない)', () => {
    setHesitationRandForTest(BACKSTEP());
    const p = put('pumpkin', PUMPKIN_TRIGGER_RANGE - 5, 0, { id: 'p' });
    tick();
    expect(en(p.id).hesKind).toBe('backstep');
    const until = en(p.id).hesUntil!;
    while (gt < until) tick();
    let maxDist = 0;
    let rolledAgain = false;
    for (let i = 0; i < 600 && en(p.id).aiPhase === undefined; i++) {
      const c = center(en(p.id));
      maxDist = Math.max(maxDist, Math.hypot(c.x - ORIGIN, c.y - ORIGIN));
      tick();
      if (en(p.id).hesKind !== undefined) rolledAgain = true;
    }
    expect(maxDist).toBeGreaterThan(PUMPKIN_TRIGGER_RANGE); // 一度は射程の外へ出た
    expect(rolledAgain).toBe(false);
    expect(en(p.id).aiPhase).toBe('crouch');
    const c = center(en(p.id));
    expect(Math.hypot(c.x - ORIGIN, c.y - ORIGIN)).toBeLessThanOrEqual(PUMPKIN_TRIGGER_RANGE + 1);
  });
  it('銃弾(被弾の止め・銃の押し)を受け続けても打ち切られない', () => {
    setHesitationRandForTest(STRAFE());
    const p = put('pumpkin', 200, 0, { id: 'p' });
    tick();
    const until = en(p.id).hesUntil!;
    while (gt < until - 3 * DT) {
      patchEnemy(p.id, { lastHit: now, hitStunUntil: now + 30, knockbackUntil: now + 60, knockbackVx: 100, knockbackVy: 0 });
      tick();
      expect(en(p.id).hesKind).toBe('strafe');
      expect(en(p.id).aiPhase).toBeUndefined();
    }
  });
  it('近接の被弾で打ち切られ、印が残る=そのまま技へ', () => {
    setHesitationRandForTest(STRAFE());
    const p = put('pumpkin', 200, 0, { id: 'p' });
    tick(); tick();
    expect(en(p.id).hesKind).toBe('strafe');
    patchEnemy(p.id, { meleeHitAt: gt });
    tick();
    expect(en(p.id).hesKind).toBeUndefined();
    expect(en(p.id).aiPhase).toBe('crouch');
  });
  it('気絶で打ち切られ、明けたら技(印は残る)', () => {
    setHesitationRandForTest(STRAFE());
    const p = put('pumpkin', 200, 0, { id: 'p' });
    tick();
    patchEnemy(p.id, { stunUntil: gt + 2000 });
    for (let i = 0; i < 10; i++) tick();
    expect(en(p.id).hesOwed).toBe(true);
    patchEnemy(p.id, { stunUntil: gt, aiReadyAt: 0 });
    tick();
    expect(en(p.id).hesKind).toBeUndefined();
    expect(en(p.id).aiPhase).toBe('crouch');
  });
});

describe('削岩型(A の型)', () => {
  it('様子見: 立ち止まる(慣性で減速)→明けたら突きの溜めへ', () => {
    setHesitationRandForTest(WATCH());
    const d = put('driller', 150, 0, { id: 'd', vx: -60, vy: 0 });
    tick();
    expect(en(d.id).hesKind).toBe('watch');
    expect(Math.abs(en(d.id).vx!)).toBeGreaterThan(30); // パッと止まらない
    const until = en(d.id).hesUntil!;
    while (gt < until) { expect(en(d.id).aiPhase).toBeUndefined(); tick(); }
    expect(Math.abs(en(d.id).vx ?? 0)).toBeLessThan(5);
    for (let i = 0; i < 3 && en(d.id).aiPhase === undefined; i++) tick();
    expect(en(d.id).aiPhase).toBe('driller-thrust-windup');
    expect(en(d.id).aiStartedAt).toBe(gt); // 溜めの開始=予告の開始(今どおり)
  });
  it('離脱(retreat)が始まったら打ち切る(印は残す)', () => {
    setHesitationRandForTest(WATCH());
    const d = put('driller', 150, 0, { id: 'd' });
    tick();
    expect(en(d.id).hesKind).toBe('watch');
    patchEnemy(d.id, { drillerRetreatUntil: gt + 2000 });
    tick();
    expect(en(d.id).hesKind).toBeUndefined();
    expect(en(d.id).hesOwed).toBe(true);
    expect(en(d.id).aiPhase).toBeUndefined(); // 離脱中は突かない(今どおり)
  });
});

describe('城ボス(B の型・抽選の明け)', () => {
  it('300px 以内で技が選ばれた時だけためらい、明けたら技へ。台本の続きが残っている時はためらわない', () => {
    setHesitationRandForTest(STRAFE());
    const g = put('giantbat', 200, 0, { id: 'g', aiReadyAt: 0 });
    tick();
    expect(en(g.id).hesKind).toBe('strafe');
    expect(en(g.id).aiPhase).toBeUndefined();
    const until = en(g.id).hesUntil!;
    while (gt < until) { expect(en(g.id).aiPhase).toBeUndefined(); tick(); }
    for (let i = 0; i < 3 && en(g.id).aiPhase === undefined; i++) tick();
    expect(en(g.id).aiPhase?.startsWith('g-')).toBe(true);
    expect(en(g.id).hesOwed).toBeUndefined();

    setup();
    setHesitationRandForTest(STRAFE());
    const g2 = put('giantbat', 200, 0, { id: 'g2', aiReadyAt: 0, bossScriptQueue: ['stomp'] });
    tick();
    expect(en(g2.id).hesKind).toBeUndefined();
    expect(en(g2.id).aiPhase?.startsWith('g-')).toBe(true);
  });
  it('遠い時(300px 超)は今どおり(ためらわない)', () => {
    setHesitationRandForTest(STRAFE());
    const g = put('giantbat', 450, 0, { id: 'g', aiReadyAt: 0 });
    tick();
    expect(en(g.id).hesKind).toBeUndefined();
  });
});

describe('馬乗り(bounty-melee・コンボの入口だけ)', () => {
  it('様子見→明けたら3段コンボ。突進(タイマーの技)はためらわない', () => {
    setHesitationRandForTest(WATCH());
    const e = spawnEnemyAt('bounty-melee', 2000, 2000, GT);
    Object.assign(e, { dormant: false, homeX: e.x, homeY: e.y, aggroRange: 200, lastHit: GT });
    useGameStore.setState(s => ({
      enemies: [e], gameTime: GT,
      player: { ...s.player, x: e.x + 80, y: e.y, health: 9999, maxHealth: 9999 },
    }));
    let t = GT;
    const s = createBountyTickState();
    const step = (ms: number) => {
      t += ms; now += ms;
      useGameStore.setState({ gameTime: t });
      const cur = useGameStore.getState().enemies.find(x => x.id === e.id);
      if (cur) runBountyTick(cur, s, t, ms / 1000, 1, now);
    };
    step(16);
    const b1 = useGameStore.getState().enemies[0];
    expect(b1.hesKind).toBe('watch');
    expect(b1.bossState ?? 'chase').toBe('chase');
    const until = b1.hesUntil!;
    while (t < until) { expect(useGameStore.getState().enemies[0].bossState ?? 'chase').toBe('chase'); step(16); }
    for (let i = 0; i < 3 && (useGameStore.getState().enemies[0].bossState ?? 'chase') === 'chase'; i++) step(16);
    expect(useGameStore.getState().enemies[0].bossState).toBe('bm-combo1-windup');
    expect(useGameStore.getState().enemies[0].hesOwed).toBeUndefined();
  });
});
