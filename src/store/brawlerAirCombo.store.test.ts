// ★research/BRAWLER.md §13(社長指示2026-11-09「攻撃で技も止めたいが、止めすぎるとハメ殺せるのはやめたい」
// 「空中コンボが繋がるような仕組みにしたい」「雑魚→ボスの順 6.5.4回にしよう」)。
// 技の溜めの止め予算・押し切り・予告の位相の停止(出る=溜め開始/消え切る=当たる)・空中コンボの流れ・ボス級4回・ダメージ補正を
// 実際のストア(updateEnemies=行動の時計の凍結を含む)で通す。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import {
  setBrawlerTempoAll, brawlerPhaseKind, brawlerTechHoldApply, brawlerTechHoldResetPatch, brawlerProration, brawlerProrationFor,
  BRAWLER_TECH_HOLD_BUDGET_MS, brawlerAirborne, brawlerJuggleHeightRel,
} from '../utils/brawlerCombo';
import { preBiteTelegraphLine } from '../utils/biteTelegraph';

setBrawlerTempoAll(1.0); // この表の時刻は係数1.0で書く(係数を掛けた予算は brawlerTempo.store.test の表で固める)

let now = 8_000_000;
const DT = 10;
const setup = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: { ...st.player, health: 9999, maxHealth: 9999, invulnerable: false, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 }, lastDirection: { x: 1, y: 0 } },
  }));
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, health: 999999, maxHealth: 999999, id, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const gt = () => useGameStore.getState().gameTime;
type Mv = 's1' | 's2' | 's3' | 's4' | 's5' | 'kick1' | 'kick2' | 'kick3' | 'stomp' | 'kiko' | 'secret';
const STOP: Record<Mv, number> = { s1: 90, s2: 90, s3: 150, s4: 150, s5: 220, kick1: 150, kick2: 150, kick3: 220, stomp: 220, kiko: 0, secret: 90 };
const hit = (id: string, move: Mv, o: { lift?: boolean; mult?: number } = {}) => useGameStore.getState().triggerCounter(undefined, {
  targetIds: [id], mult: o.mult ?? 0.01, brawler: true, stunMs: STOP[move], postureMult: 0.01, pressedAt: Date.now(),
  kb: move === 's5' || move === 'kick3' ? { kind: 'big', dirX: 1, dirY: 0, bossHalf: true }
    : move === 'stomp' ? { kind: 'big', dirX: 1, dirY: 0, bossHalf: true, ignoreImmune: true } : { kind: 'none' },
  ...(o.lift ? { lift: true } : {}), combo: { move: move === 'secret' ? 'secret' : move, ...(move === 'secret' ? { countRevenge: false } : {}) },
});
const step = (ms: number, onStep?: () => void) => {
  const end = now + ms;
  while (now < end) {
    now += DT;
    useGameStore.getState().setGameTime(gt() + DT);
    useGameStore.getState().updateEnemies(DT / 1000);
    onStep?.();
  }
};

beforeEach(() => {
  now = 8_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('§13-1 技の溜めも固める(純関数)', () => {
  it('相の種類: 移動・待ち・硬直=free / 溜め=windup / 攻撃の振り=active / ボスの溜めは active(§9-72)', () => {
    const k = (o: Partial<Enemy>) => brawlerPhaseKind(o as Enemy, 1000);
    expect(k({ aiPhase: 'zpause' })).toBe('free');
    expect(k({ aiPhase: 'z-recover' })).toBe('free');
    for (const ph of ['windup', 'scream', 'driller-thrust-windup', 'logger-sweep-windup', 'b-windup', 's-arc', 'z-red-pause', 'z-lunge-in', 'z-stagger', 'lich-blink']) {
      expect(k({ aiPhase: ph as Enemy['aiPhase'] }), ph).toBe('windup');
    }
    for (const ph of ['charge', 'jump', 'driller-thrust-active', 'logger-sweep-active', 'b-lunge', 'b-grab', 's-bite', 'z-bite1', 'z-bite2', 'br-revenge', 'g-stomp-windup']) {
      expect(k({ aiPhase: ph as Enemy['aiPhase'] }), ph).toBe('active');
    }
    expect(k({ aiPhase: 'zrush', biteAt: 1500 })).toBe('windup');           // 噛みの構え
    expect(k({ type: 'reaper', biteAt: 1500 })).toBe('active');              // 死神は固めない
    expect(k({ bossState: 'jump-windup' })).toBe('active');                  // ボスの溜めは固めない
    expect(k({ bossState: 'chase' })).toBe('free');
    expect(k({ aiPhase: 'z-red-pause', stunUntil: 2000 })).toBe('free');     // 会心の気絶中
  });
  it('予算: 1回の溜めにつき合計 400ms まで固める。使い切ったら押し切る(止めは伸びない)。別の溜めに入れば0から', () => {
    expect(BRAWLER_TECH_HOLD_BUDGET_MS).toBe(400);
    let e: Partial<Enemy> = { aiPhase: 'z-red-pause' };
    const r1 = brawlerTechHoldApply(e, 1000 + 390, 1000);
    expect([r1.until, r1.used]).toEqual([1390, 390]);
    e = { ...e, brHoldUntil: r1.until, brTechHoldKey: r1.key, brTechHoldUsed: r1.used };
    const r2 = brawlerTechHoldApply(e, 1200 + 390, 1200);                   // 止めの途中で次の当たり: 伸ばせるのは残り10msだけ
    expect([r2.until, r2.used]).toEqual([1400, 400]);
    e = { ...e, brHoldUntil: r2.until, brTechHoldUsed: r2.used };
    const r3 = brawlerTechHoldApply(e, 1500 + 390, 1500);                   // 使い切った=押し切る
    expect(r3.until).toBeUndefined();
    expect(r3.used).toBe(400);
    const other = brawlerTechHoldApply({ ...e, aiPhase: 'z-stagger' }, 1600 + 390, 1600); // 2発目の溜め=別の技
    expect(other.used).toBe(390);
    // 溜めを抜けたら札を捨てる
    expect(brawlerTechHoldResetPatch({ ...e, aiPhase: 'z-recover' } as Enemy, 0)).toEqual({ brTechHoldKey: undefined, brTechHoldUsed: undefined });
    expect(brawlerTechHoldResetPatch({ ...e } as Enemy, 0)).toBeNull();
  });
  it('ダメージ補正: 10ヒット目から −5%/発・下限50%', () => {
    expect([1, 9, 10, 11, 12, 19, 20, 40].map(brawlerProration)).toEqual([1, 1, 0.95, 0.9, 0.85, 0.5, 0.5, 0.5].map(v => v));
    expect(brawlerProrationFor({ brComboAt: 1000, brFlowHits: 9 }, 1100)).toBeCloseTo(0.95);
    expect(brawlerProrationFor({ brComboAt: 1000, brFlowHits: 30 }, 1000 + 5000)).toBe(1); // 流れが切れていれば1発目から
  });
});

describe('§13-1 技の溜めも固める(ストア・予告の位相)', () => {
  it('ゾンビの構え(z-red-pause)を殴ると溜めが止まり、流星の位相も止まる→明けたら続きから(出る=溜め開始/消え切る=当たる が止めた分だけ後ろへ)', () => {
    setup();
    const g0 = gt();
    // 構え: 溜めの頭 g0、噛みへ移る g0+600(線は chaffBlinkAt/aiPhaseUntil から引く)
    useGameStore.setState({ enemies: [place('zombie', 70, 0, 'z', { aiPhase: 'z-red-pause', aiStartedAt: g0, aiPhaseUntil: g0 + 600, chaffMove: 'zombie-double', stanceDirX: -1, stanceDirY: 0 } as Partial<Enemy>)] });
    const aim = { ...center(), escort: false };
    step(100);
    const l0 = preBiteTelegraphLine(en('z'), gt(), aim)!;
    expect(l0).not.toBeNull();
    const span0 = l0.hitAt - l0.startAt;
    hit('z', 's1');
    const held = en('z').brHoldUntil! - now;
    expect(held).toBe(390); // 止め90+固まり300(予算400の内)
    const progs: number[] = [];
    step(held - 10, () => { const l = preBiteTelegraphLine(en('z'), gt(), aim); if (l) progs.push(l.prog); });
    expect(en('z').aiPhase).toBe('z-red-pause');
    expect(Math.max(...progs) - Math.min(...progs)).toBeLessThan(0.02);     // 位相が止まっている(最大1フレームのずれ)
    const l1 = preBiteTelegraphLine(en('z'), gt(), aim)!;
    expect(l1.hitAt - l1.startAt).toBeCloseTo(span0, 6);                    // 出る〜消え切るの間隔は不変
    expect(l1.startAt - l0.startAt).toBeGreaterThanOrEqual(held - 2 * DT);  // 出る時刻=止めた分だけ後ろへ
    expect(l1.startAt - l0.startAt).toBeLessThanOrEqual(held + DT);
    // 明けたら続きから: 溜めの終わり(=噛みへ移る)は、残りの溜めのぶんだけ後
    const remain = en('z').aiPhaseUntil! - gt();
    let leftAt = -1;
    step(1000, () => { if (leftAt < 0 && en('z').aiPhase !== 'z-red-pause') leftAt = gt(); });
    expect(leftAt - (gt() - 1000)).toBeGreaterThanOrEqual(remain - 2 * DT);
  });
  it('同じ溜めを殴り続けても合計400msで押し切る(その後は殴っても止まらず溜めが進む)', () => {
    setup();
    const g0 = gt();
    useGameStore.setState({ enemies: [place('zombie', 70, 0, 'z', { aiPhase: 'z-red-pause', aiStartedAt: g0, aiPhaseUntil: g0 + 2000, chaffMove: 'zombie-double', stanceDirX: -1, stanceDirY: 0 } as Partial<Enemy>)] });
    const deadline0 = en('z').aiPhaseUntil!;
    let totalShift = 0;
    for (let i = 0; i < 8; i++) { hit('z', 's1'); step(150); }
    totalShift = (en('z').aiPhaseUntil! - deadline0);
    expect(en('z').brTechHoldUsed).toBe(400);
    expect(totalShift).toBeGreaterThanOrEqual(400 - 2 * DT);
    expect(totalShift).toBeLessThanOrEqual(400 + 2 * DT);                   // 止まったのは予算の分だけ
  });
});

describe('§13-2 空中コンボ(ストア)', () => {
  it('雑魚: 1・2・3段→4段→飛び蹴りで拾う→1・2段で空中拾い→大踏み潰しでバウンド→気功で拾う→5段で締め(ダウン)', () => {
    setup();
    useGameStore.setState({ enemies: [place('zombie', 60, 0, 'z')] });
    const log: string[] = [];
    const note = (mv: string) => { const e = en('z'); log.push(`${mv}:${brawlerAirborne(e, now) ? 'air' : 'ground'}:${e.brLiftBudget ?? '-'}:${e.brLiftDown ? 'down' : ''}`); };
    hit('z', 's1'); note('s1'); step(250);
    hit('z', 's2'); note('s2'); step(250);
    hit('z', 's3'); note('s3'); step(200);           // アッパーで浮かせる(予算6)
    hit('z', 's4', { lift: true }); note('s4'); step(200);
    hit('z', 'kick1'); note('kick1'); step(150);
    hit('z', 's1'); note('s1'); step(120);
    hit('z', 's2'); note('s2'); step(120);
    hit('z', 'stomp'); note('stomp');
    const bounce = en('z');
    expect(bounce.brLiftDropMs).toBeGreaterThan(0);  // 地面バウンド
    step(bounce.brLiftDropMs! + 60);
    expect(brawlerJuggleHeightRel(en('z'), now)).toBeGreaterThan(0); // 跳ね返って浮いている
    hit('z', 'kiko'); note('kiko'); step(120);
    hit('z', 's5'); note('s5');
    expect(log).toEqual([
      's1:ground:-:', 's2:ground:-:', 's3:air:6:', 's4:air:5:', 'kick1:air:3:', 's1:air:2:', 's2:air:1:', 'stomp:air:1:', 'kiko:air:0:', 's5:air:0:down',
    ]);
    // ダウン: 着地まで動けない・着地の後しばらく固まらない
    const d = en('z');
    expect(d.liftUntil).toBeGreaterThan(now);
    expect(d.brNoHoldUntil).toBeGreaterThan(d.liftUntil!);
    // 同じ流れで2回目の大踏み潰しは跳ねない(叩き落とし)
    setup();
    useGameStore.setState({ enemies: [place('zombie', 60, 0, 'y')] });
    hit('y', 's3'); step(100); hit('y', 'stomp'); step(400); hit('y', 's1'); step(50);
    expect(brawlerAirborne(en('y'), now)).toBe(true);
    hit('y', 'stomp');
    expect(en('y').brLiftDown).toBe(true);
  });
  it('ボス級(ハンター)は4回拾えて5回目で落ちる', () => {
    setup();
    useGameStore.setState({ enemies: [place('hunter', 60, 0, 'h', { bossState: undefined } as Partial<Enemy>)] });
    hit('h', 's4', { lift: true });
    expect(en('h').brLiftBudget).toBe(4);
    for (let i = 0; i < 4; i++) { step(60); hit('h', 's1'); expect(en('h').brLiftDown, `${i}`).toBe(false); }
    step(60); hit('h', 's1');
    expect(en('h').brLiftDown).toBe(true);
  });
  it('ダメージ補正: 同じ流れの10ヒット目から減る・秘奥義は減らない', () => {
    setup();
    // 雑魚は7発で振り払う(流れが切れる)ので、振り払わないボス級(ハンター)で数える。
    useGameStore.setState({ enemies: [place('hunter', 60, 0, 'z'), place('hunter', -60, 0, 's')] });
    const dmgOf = (id: string, mv: Mv) => { const h0 = en(id).health; hit(id, mv, { mult: 20 }); return h0 - en(id).health; };
    const d: number[] = [];
    for (let i = 0; i < 12; i++) { d.push(dmgOf('z', 's1')); step(100); }
    expect(d[8]).toBe(d[0]);                      // 9発目まで満額
    expect(d[9] / d[0]).toBeCloseTo(0.95, 2);      // 10発目 −5%
    expect(d[11] / d[0]).toBeCloseTo(0.85, 2);
    const ds: number[] = [];
    for (let i = 0; i < 12; i++) { ds.push(dmgOf('s', 'secret')); step(100); }
    expect(ds[11]).toBe(ds[0]);                   // 秘奥義は補正なし
  });
});
