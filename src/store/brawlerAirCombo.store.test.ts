// ★research/BRAWLER.md §13(社長指示2026-11-09「攻撃で技も止めたいが、止めすぎるとハメ殺せるのはやめたい」
// 「空中コンボが繋がるような仕組みにしたい」「雑魚→ボスの順 6.5.4回にしよう」)。
// 技の溜めも固まること・予告の位相の停止(出る=溜め開始/消え切る=当たる)・空中コンボの流れ・ボス級4回・ダメージ補正を
// 実際のストア(updateEnemies=行動の時計の凍結を含む)で通す。
// ★§19(2026-11-10): 溜めの止め予算(1回の溜めにつき合計400ms)は撤去した。溜めの相も移動の相と同じ確定の固まり(§19-3 ①)で固まり、
//   歯止めは「同じコンボで2回目の同じ技は固めない」「固まりは次に動ける時まで」「コンボの後の固まらない時間」が受け持つ=予算のテストをその形へ書き換えた。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import {
  setBrawlerTempoAll, brawlerPhaseKind, brawlerLockOnHit, brawlerLockHitMs, brawlerHeldNow, brawlerProration, brawlerProrationFor,
  brawlerAirborne, brawlerJuggleHeightRel,
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
  ...(o.lift ? { lift: true } : {}), combo: { move },
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
    for (const ph of ['charge', 'jump', 'driller-thrust-active', 'logger-sweep-active', 'b-lunge', 'b-grab', 's-bite', 'z-bite1', 'z-bite2', 'g-stomp-windup']) {
      expect(k({ aiPhase: ph as Enemy['aiPhase'] }), ph).toBe('active');
    }
    expect(k({ aiPhase: 'zrush', biteAt: 1500 })).toBe('windup');           // 噛みの構え
    expect(k({ type: 'reaper', biteAt: 1500 })).toBe('active');              // 死神は固めない
    expect(k({ bossState: 'jump-windup' })).toBe('active');                  // ボスの溜めは固めない
    expect(k({ bossState: 'chase' })).toBe('free');
    expect(k({ aiPhase: 'z-red-pause', stunUntil: 2000 })).toBe('free');     // 会心の気絶中
  });
  it('溜めの相も移動の相と同じ長さで固まる(旧の「1回の溜めにつき合計400ms」の予算は撤去)。同じ技の2回目は固めない', () => {
    const o = { stopMs: 90, enemyStopMs: 90, canHold: true, airborneAfter: false };
    const r1 = brawlerLockOnHit({}, 's1', 1000, 9e9, o);
    expect(r1.patch.brLockUntil).toBe(1000 + brawlerLockHitMs('s1', 90));
    expect(brawlerLockHitMs('s1', 90)).toBe(90 + 150 + 34);
    // 固まりの最中かどうかは相の種類で決まる: 溜め(windup)は固まる・攻撃の振り(active)は固まらない
    expect(brawlerHeldNow({ type: 'zombie', aiPhase: 'z-red-pause', ...r1.patch }, 1100, 0)).toBe(true);
    expect(brawlerHeldNow({ type: 'zombie', aiPhase: 'z-bite1', ...r1.patch }, 1100, 0)).toBe(false);
    // 同じ溜めを同じ技で殴り続けても、固まりは延びない
    const r2 = brawlerLockOnHit({ ...r1.patch }, 's1', 1200, 9e9, o);
    expect(r2).toEqual({ patch: {}, held: false, noHold: false });
    // 別の技(道の上の続き)は、当たりの瞬間から新しく固める
    expect(brawlerLockOnHit({ ...r1.patch }, 's2', 1200, 9e9, o).patch.brLockUntil).toBe(1200 + 274);
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
    // ★§19-3 ①: 確定の固まり(gameTime の欄)=止め90+受付150+余白34=274ms(係数1.0)。旧: 止め90+固まり300(予算400の内)。
    const held = en('z').brLockUntil! - gt();
    expect(held).toBe(274);
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
  // ★§19-3 ③ で書き換え: 旧「同じ溜めを殴り続けても合計400msで押し切る」(予算)→ 新「同じコンボで2回目の同じ技は固めない」。
  //   固まりの最中に同じ技を重ねても確定の固まりは延びない(当たりの止めだけ)。固まりが明ければコンボは区切られる
  //   (雑魚は固まらない時間なし=次の当たりから新しいコンボ)。
  it('同じ溜めを同じ技で殴り続けても、固まりは延びない(最初の1回の長さ+当たりの止めだけ=溜めは進む)', () => {
    setup();
    const g0 = gt();
    useGameStore.setState({ enemies: [place('zombie', 70, 0, 'z', { aiPhase: 'z-red-pause', aiStartedAt: g0, aiPhaseUntil: g0 + 2000, chaffMove: 'zombie-double', stanceDirX: -1, stanceDirY: 0 } as Partial<Enemy>)] });
    const deadline0 = en('z').aiPhaseUntil!;
    hit('z', 's1');
    const lock0 = en('z').brLockUntil!;
    expect(lock0 - gt()).toBe(274);
    step(100); hit('z', 's1'); expect(en('z').brLockUntil).toBe(lock0);
    step(100); hit('z', 's1'); expect(en('z').brLockUntil).toBe(lock0);   // 3発目(200ms): 止めは 290ms まで
    step(500);
    const totalShift = en('z').aiPhaseUntil! - deadline0;
    expect(totalShift).toBeGreaterThanOrEqual(274 - 2 * DT);
    expect(totalShift).toBeLessThanOrEqual(290 + 2 * DT);                 // 3発当てても、止まったのは最初の固まり+最後の止めの残りだけ
    expect(en('z').brLockMoves).toBeUndefined();                           // 固まりが明けた=コンボは区切られた
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
    // ボス級(ハンター)で数える(旧: 雑魚は7発で振り払って流れが切れた=振り払いは 2026-11-11 に撤去)。
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
