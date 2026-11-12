// ★ナイフの当たりの固まりと浮き(社長指示2026-11-12「あと近接でも敵の攻撃が止まる&浮くようにして」・裁定「近接は止めるだけ」)。
// 中身は格闘と同じ(固まり=1段目・浮き=地上は3段目の打ち上げ/空中は2段目の拾い)。実際のストア(triggerCounter → updateEnemies=行動の時計の凍結)で通す。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore, SLASHER_CHAIN_CD_MS } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll, brawlerAirborne, brawlerHeldNow, BRAWLER_JUGGLE_BUDGET, BRAWLER_GROUND_LAUNCH, BRAWLER_JUGGLE_PUSH } from '../utils/brawlerCombo';
import { BRAWLER_HOLD_MS, BRAWLER_TEMPO_DEFAULT } from '../utils/brawler';
import { hitStunMsFor } from '../utils/combatFeel';
import { meleeHitStopMul } from '../utils/hitFlinch';
import { preBiteTelegraphLine } from '../utils/biteTelegraph';

let now = 9_000_000;
const DT = 10;
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, health: 999999, maxHealth: 999999, id, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const gt = () => useGameStore.getState().gameTime;
/** ナイフの1振り(PC/ボットの直呼び=前隙なしでその場で当たる)。CD は毎回明けておく。 */
const swing = () => {
  useGameStore.setState(s => ({ player: { ...s.player, counterCooldownEnd: 0, pendingSwingAt: 0 } }));
  return useGameStore.getState().triggerCounter();
};
const step = (ms: number, onStep?: () => void) => {
  const end = now + ms;
  while (now < end) {
    now += DT;
    useGameStore.getState().setGameTime(gt() + DT);
    useGameStore.getState().updateEnemies(DT / 1000);
    onStep?.();
  }
};
/** その当たりでナイフが掛けた止めの長さ(meleeHitStunPatch と同じ式)+1段目の固まり。 */
const lockLen = (e: Enemy) => Math.round(hitStunMsFor(e.type) * meleeHitStopMul(e.lastHitDmg ?? 0, e.maxHealth)) + BRAWLER_HOLD_MS.s1;

beforeEach(() => {
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
  setBrawlerTempoAll(1.3);
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true },
    breakableProps: [],
    player: { ...st.player, health: 99999, maxHealth: 99999, counterCooldownEnd: 0, pendingSwingAt: 0, lastDirection: { x: 1, y: 0 } },
  }));
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT));

describe('ナイフの当たり: 固まりと浮き', () => {
  it('地上の雑魚に当てると、1段目の固まり(止め+固まり)と3段目の打ち上げが立つ・押しはナイフのまま', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z')] });
    expect(swing().hit).toBe(true);
    const z = en('z');
    expect(z.brLockUntil! - gt()).toBe(lockLen(z));
    expect(brawlerAirborne(z, now)).toBe(true);
    expect(z.brLiftPeak).toBeCloseTo(BRAWLER_GROUND_LAUNCH.s3!, 6);
    expect(z.brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob);
    expect(z.brBlastNoLiftUntil).toBe(z.brLiftUntil! + (z.brLiftUntil! - now)); // 着地の後、浮いていた時間と同じ長さは地上から浮かない
    expect(Math.hypot(z.knockbackVx ?? 0, z.knockbackVy ?? 0)).toBeGreaterThan(0); // ナイフの押し(押されながら浮く)
  });
  it('空中の敵は2段目の拾い(予算1)', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z')] });
    swing();
    const b0 = en('z').brLiftBudget!;
    step(100);
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, knockbackImmuneUntil: 0 })) }));
    swing();
    expect(brawlerAirborne(en('z'), now)).toBe(true);
    expect(en('z').brLiftBudget).toBe(b0 - 1);
    expect(BRAWLER_JUGGLE_PUSH.s2).toBeGreaterThan(0);
  });
  it('溜め(z-red-pause)の雑魚は止まって続きから(取り消さない・浮かせない)・流星の位相も止まり、消え切る時刻は止めた分だけ後ろへ', () => {
    const g0 = gt();
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z', { aiPhase: 'z-red-pause', aiStartedAt: g0, aiPhaseUntil: g0 + 900, chaffMove: 'zombie-double', stanceDirX: -1, stanceDirY: 0 } as Partial<Enemy>)] });
    const aim = { ...center(), escort: false };
    step(100);
    const l0 = preBiteTelegraphLine(en('z'), gt(), aim)!;
    expect(l0).not.toBeNull();
    const span0 = l0.hitAt - l0.startAt;
    swing();
    const z = en('z');
    expect(z.aiPhase).toBe('z-red-pause');               // 取り消さない
    expect(z.brawlerLiftAt).toBeUndefined();             // 浮かせない
    const held = z.brLockUntil! - gt();
    expect(held).toBe(lockLen(z));
    const progs: number[] = [];
    step(held - 10, () => { const l = preBiteTelegraphLine(en('z'), gt(), aim); if (l) progs.push(l.prog); });
    expect(en('z').aiPhase).toBe('z-red-pause');
    expect(Math.max(...progs) - Math.min(...progs)).toBeLessThan(0.02); // 位相が止まっている
    const l1 = preBiteTelegraphLine(en('z'), gt(), aim)!;
    expect(l1.hitAt - l1.startAt).toBeCloseTo(span0, 6);                 // 出る〜消え切るの間隔は不変
    expect(l1.startAt - l0.startAt).toBeGreaterThanOrEqual(held - 2 * DT); // 止めた分だけ後ろへ
    expect(l1.startAt - l0.startAt).toBeLessThanOrEqual(held + DT);
    const remain = en('z').aiPhaseUntil! - gt();
    let leftAt = -1;
    step(1200, () => { if (leftAt < 0 && en('z').aiPhase !== 'z-red-pause') leftAt = gt(); });
    expect(leftAt - (gt() - 1200)).toBeGreaterThanOrEqual(remain - 2 * DT); // 明けたら残りの溜めのぶんだけ進む
  });
  it('攻撃の振りの最中の雑魚は止めない・浮かせない', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z', { aiPhase: 'z-bite1', aiStartedAt: gt(), aiPhaseUntil: gt() + 300, chaffMove: 'zombie-double' } as Partial<Enemy>)] });
    swing();
    const z = en('z');
    expect(brawlerHeldNow(z, gt(), now)).toBe(false);
    expect(z.brawlerLiftAt).toBeUndefined();
  });
  it('ボスの技の最中(bossState)は止まらない・浮かない', () => {
    useGameStore.setState({ enemies: [place('hunter', 50, 0, 'h', { bossState: 'jump-windup' } as Partial<Enemy>)] });
    swing();
    const h = en('h');
    expect(h.health).toBeLessThan(999999);
    expect(brawlerHeldNow(h, gt(), now)).toBe(false);
    expect(h.brawlerLiftAt).toBeUndefined();
  });
  it('約820ms の間隔で振り続けても、雑魚には毎回動ける時間が残る・浮かせられるのは1振りおき', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z')] });
    const lifted: boolean[] = [];
    let freeEachCycle = true;
    for (let i = 0; i < 6; i++) {
      // 寄ってきて技に入ると浮かない(裁定どおり)ので、毎回、素の状態・同じ場所へ戻してから当てる(浮きと固まりの欄は持ち越す)
      useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...place('zombie', 40, 0, 'z'), brLiftUntil: e.brLiftUntil, liftUntil: e.liftUntil, brawlerLiftAt: e.brawlerLiftAt, brLiftMs: e.brLiftMs, brLiftPeak: e.brLiftPeak, brLiftBudget: e.brLiftBudget, brBlastNoLiftUntil: e.brBlastNoLiftUntil, brBlastAirSince: e.brBlastAirSince, brLockUntil: e.brLockUntil, brLockHits: e.brLockHits })) }));
      const before = en('z').brawlerLiftAt;
      swing();
      lifted.push(en('z').brawlerLiftAt !== before && brawlerAirborne(en('z'), now));
      let free = false;
      step(820, () => { const e = en('z'); if (!brawlerHeldNow(e, gt(), now) && !brawlerAirborne(e, now)) free = true; });
      freeEachCycle = freeEachCycle && free;
    }
    expect(freeEachCycle).toBe(true);
    expect(lifted).toEqual([true, false, true, false, true, false]);
  });
  for (const [type, want] of [['zombie', [true, true, true, true, true, true]], ['driller', [true, false, true, false, true, false]], ['hunter', [true, false, false, true, false, false]]] as [EnemyType, boolean[]][]) {
    it(`${type}: 約820ms の間隔で振り続けた時の固まり=格闘の仕組み(コンボの後の固まらない時間 強個体800/ボス級1500ms)がそのまま効く`, () => {
      useGameStore.setState({ enemies: [place(type, 50, 0, 'x')] });
      const held: boolean[] = [];
      for (let i = 0; i < 6; i++) {
        // 寄ってきて技に入ったり離れたりするので、毎回同じ場所・素の相へ戻してから当てる(固まり・浮き・固まらない時間の欄は持ち越す)
        const home = place(type, 50, 0, 'x');
        useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, x: home.x, y: home.y, aiPhase: undefined, aiPhaseUntil: undefined, biteAt: undefined, chaffMove: undefined, bossState: undefined, knockbackImmuneUntil: 0 })) }));
        const lock0 = en('x').brLockUntil;
        swing();
        const e = en('x');
        held.push(e.brLockUntil !== undefined && e.brLockUntil !== lock0 && e.brLockUntil > gt());
        step(820);
      }
      expect(held).toEqual(want);
    });
  }
  it('終端の死神(深奥チェイサー)は浮かない', () => {
    useGameStore.setState({ enemies: [{ ...place('reaper', 50, 0, 'rp'), reaperChaser: true } as Enemy] });
    swing();
    expect(en('rp').health).toBeLessThan(999999);
    expect(en('rp').brawlerLiftAt).toBeUndefined();
  });
  // ★社長指示2026-11-12「スラッシャーは1撃目から浮かせてほしい。空中コンボできるように」: スラッシャー所持でも振りの1撃目から浮く。
  const withSlasher = (lv: number) => useGameStore.setState(st => ({ player: { ...st.player, skills: [...st.player.skills, 'slasher'], skillLevels: { ...st.player.skillLevels, slasher: lv } } }));
  it('スラッシャーを持っている時も振りの1撃目で浮く(地上=3段目の打ち上げ・固まりも入る)', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z')] });
    withSlasher(1);
    swing();
    const z = en('z');
    expect(z.health).toBeLessThan(999999);
    expect(z.brLockUntil).toBeDefined();
    expect(brawlerAirborne(z, now)).toBe(true);
    expect(z.brLiftPeak).toBeCloseTo(BRAWLER_GROUND_LAUNCH.s3!, 6);
    expect(z.brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob);
  });
  it('スラッシャーを持っている時は、止めっぱなしにしない窓(brBlastNoLiftUntil)の中でも1撃目は浮く(持たない時は浮かない)', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z', { brBlastNoLiftUntil: now + 5000 })] });
    swing();
    expect(brawlerAirborne(en('z'), now)).toBe(false); // スラッシャー無し=窓の中は地上から浮かない(今どおり)
    useGameStore.setState(st => ({ enemies: [place('zombie', 40, 0, 'z2', { brBlastNoLiftUntil: now + 5000 })], player: { ...st.player, counterCooldownEnd: 0 } }));
    withSlasher(1);
    swing();
    expect(brawlerAirborne(en('z2'), now)).toBe(true);
  });
  it('スラッシャー Lv3: 1撃目で浮く→追撃は空中の敵に当たって拾う(最後の大きな押しの前にダウンしない)', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z')] });
    withSlasher(3);
    expect(swing().hit).toBe(true);
    expect(brawlerAirborne(en('z'), now)).toBe(true);
    const budgets: number[] = [en('z').brLiftBudget!];
    const c = center();
    for (let k = 0; k < 3; k++) {
      const ready = useGameStore.getState().player.slasherChainReadyAt;
      expect(ready).toBeGreaterThan(0);
      step(SLASHER_CHAIN_CD_MS + 20);
      // 押しで離れた分は戻す(距離ではなく浮きだけを見る)
      useGameStore.setState(st => ({
        realGameTime: Math.max(st.realGameTime, ready + 10),
        enemies: st.enemies.map(x => (x.id === 'z' ? { ...x, x: c.x + 40 - x.width / 2, y: c.y - x.height / 2, knockbackVx: 0, knockbackVy: 0, knockbackUntil: 0 } : x)),
        player: { ...st.player, pendingSwingAt: 0 },
      }));
      const hp = en('z').health;
      useGameStore.getState().triggerCounter();
      const z = en('z');
      expect(z.health).toBeLessThan(hp); // 追撃が当たった
      expect(brawlerAirborne(z, now)).toBe(true); // 空中のまま(拾い・最後は叩き落としで落ちている途中)
      if (k < 2) expect(z.brLiftDown).toBe(false); // 最後の大きな押し(5段目)の前にダウンしない
      budgets.push(z.brLiftBudget!);
    }
    // 1撃目(地上の打ち上げ=予算満タン)→ 追撃1回目(空中の3段目=2)→ 2回目(2段目=1)→ 3回目(5段目=叩き落とし)
    expect(budgets.slice(0, 3)).toEqual([BRAWLER_JUGGLE_BUDGET.mob, BRAWLER_JUGGLE_BUDGET.mob - 2, BRAWLER_JUGGLE_BUDGET.mob - 3]);
    expect(en('z').brLiftDown).toBe(true);
  });
  it('気絶した強個体へのとどめは今までどおり(跳ねだけ・格闘の浮き/固まりは書かない)', () => {
    useGameStore.setState({ enemies: [place('driller', 50, 0, 'd', { stunUntil: gt() + 3000 })] });
    swing();
    const d = en('d');
    expect(d.health).toBeLessThan(999999);
    expect(d.liftUntil).toBeGreaterThan(now);
    expect(d.brLiftUntil).toBeUndefined();
    expect(d.brLockUntil).toBeUndefined();
  });
  it('この振りで先にカウンターの浮きが掛かった敵は浮かせ直さない(予算を2回使わない)', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z', { lastCounteredAt: now, brawlerLiftAt: now, brLiftUntil: now + 600, liftUntil: now + 600, brLiftMs: 600, brLiftPeak: 1, brLiftBudget: BRAWLER_JUGGLE_BUDGET.mob })] });
    swing();
    expect(en('z').health).toBeLessThan(999999);
    expect(en('z').brLockUntil).toBeDefined(); // 固まりは入る
    expect(en('z').brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob);
    expect(en('z').brawlerLiftAt).toBe(now);
  });
});
