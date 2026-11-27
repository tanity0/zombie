// ★ナイフの当たりの固まりと浮き(社長指示2026-11-12「あと近接でも敵の攻撃が止まる&浮くようにして」・裁定「近接は止めるだけ」)。
// 中身は格闘と同じ(固まり=1段目・浮き=地上は3段目の打ち上げ/空中は2段目の拾い)。実際のストア(triggerCounter → updateEnemies=行動の時計の凍結)で通す。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { SLASHER_FOLLOWUP_INTERVAL_MS } from '../utils/slasherFollowup';
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
/** ★実際の振り方: 近接のクールダウン(counterCooldownEnd=段の間隔・3段目の後の隙)が明けるまで時計を進める(onStep=1刻みごと)。 */
const realSwingWait = (onStep?: () => void) => {
  for (let k = 0; k < 400 && now < useGameStore.getState().player.counterCooldownEnd; k++) step(DT, onStep);
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
  // ★実際の振り方で回す(社長指摘2026-11-27「ナイフってスキルなしで0.8秒おきに振れないんじゃない?」): 近接のクールダウン(counterCooldownEnd)を消さず、
  //   明けた瞬間に振る=1→2→3段目は段の間隔(KNIFE_COMBO_INTERVAL_MS)・3段目の後は隙(KNIFE_COMBO_FINISH_RECOVERY_MS)を挟んで次の1段目。
  //   止めの間は打ち上げも上がり始めない(社長指示2026-11-27「上がる方も止めて」・社長裁定=新しい挙動を正)=浮いている時間は止めの分だけ長い。
  it('実際の間隔(段の間隔・3段目の後の隙)で振り続けても、雑魚には連撃ごとに動ける時間が残る(3段目の後の隙の間)', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z')] });
    const lifted: boolean[] = [];
    const freeBefore: number[] = []; // その振りの前(前の振りから)に、雑魚が固まりも浮きも無く動けた長さ(ms)
    for (let i = 0; i < 12; i++) {
      // 寄ってきて技に入ると浮かない(裁定どおり)ので、毎回、素の状態・同じ場所へ戻してから当てる(浮きと固まりの欄は持ち越す)
      useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...place('zombie', 40, 0, 'z'), brLiftUntil: e.brLiftUntil, liftUntil: e.liftUntil, brawlerLiftAt: e.brawlerLiftAt, brLiftMs: e.brLiftMs, brLiftPeak: e.brLiftPeak, brLiftBudget: e.brLiftBudget, brBlastNoLiftUntil: e.brBlastNoLiftUntil, brBlastAirSince: e.brBlastAirSince, brLockUntil: e.brLockUntil, brLockHits: e.brLockHits, brLiftRiseStopMs: e.brLiftRiseStopMs, brLiftRiseStopAt: e.brLiftRiseStopAt })) }));
      let free = 0;
      realSwingWait(() => { const e = en('z'); if (!brawlerHeldNow(e, gt(), now) && !brawlerAirborne(e, now)) free += DT; });
      const before = en('z').brawlerLiftAt;
      expect(useGameStore.getState().triggerCounter().hit).toBe(true);
      expect(useGameStore.getState().player.knifeComboStage).toBe((i % 3) + 1);
      lifted.push(en('z').brawlerLiftAt !== before && brawlerAirborne(en('z'), now));
      freeBefore.push(free);
    }
    // 連撃ごと(1段目の前=3段目の後の待ち)は毎回動ける時間が残る=止めっぱなしにはならない。段の間(2・3段目の前)は固まり・浮きでつながる。
    // ★3段目の後の次の振りは、体の隙(0.7秒)ではなくカウンター窓が開ける時刻(連撃の終わり+ナイフのクールダウン)まで待つ
    //   (社長指示2026-11-27「カウンター窓開くまで振れるようにはしないで」・utils/knifeCombo の knifeNextSwingAt)。
    for (const i of [3, 6, 9]) expect(freeBefore[i], `${i / 3}回目の連撃の後`).toBeGreaterThan(0);
    expect(freeBefore).toEqual([0, 0, 0, 100, 0, 0, 310, 0, 0, 100, 0, 0]); // 実測(段の間隔0.4秒・3段目の後はカウンター窓が開くまで。隙0.7秒で振れた時は [..0..270..0..]・隙1.0秒の時は [..280..490..280..])
    // 浮き: 地上から打ち上げ→空中で拾い直して3段つながる。着地の後の「地上から浮かない窓」(浮いていた時間と同じ長さ)の中の連撃は浮かない。
    expect(lifted).toEqual([true, true, true, false, false, false, true, true, true, false, false, false]); // 実測(3段目の後はカウンター窓が開くまで=浮く連撃と浮かない連撃が交互・隙1.0秒の時と同じ。隙0.7秒で振れた時は [T,T,T,T,F,F,T,T,T,T,F,F])
  });
  // 固まりの並び(12振り=4回の連撃・実測・段の間隔0.4秒・3段目の後の隙0.7秒→カウンター窓が開くまで待つ形でも並びは同じ): 雑魚=毎回 / 強個体=1・3回目の連撃は3段とも、2・4回目は3段目だけ(隙1.0秒の時は2回目から3段目だけ) / ボス級=1回目の1段目・2回目の2段目・3回目の3段目(4回目は無し)。
  //   (旧 段の間隔0.5秒の時: 強個体=各連撃の1・2段目 / ボス級=各連撃の1段目。コンボの後の固まらない時間(強個体800/ボス級1500ms)と段の間隔の噛み合わせで並びが変わる。)
  const KNIFE_REAL_HELD: Record<string, boolean[]> = {
    zombie: [true, true, true, true, true, true, true, true, true, true, true, true],
    driller: [true, true, true, false, false, true, true, true, true, false, false, true], // 隙0.7秒(社長裁定2026-11-27)。隙1.0秒の時は [T,T,T,F,F,T,F,F,T,F,F,T]
    hunter: [true, false, false, false, true, false, false, false, true, false, false, false],
  };
  for (const type of ['zombie', 'driller', 'hunter'] as EnemyType[]) {
    it(`${type}: 実際の間隔(段の間隔・3段目の後の隙)で振り続けた時の固まり=格闘の仕組み(コンボの後の固まらない時間 強個体800/ボス級1500ms)がそのまま効く`, () => {
      useGameStore.setState({ enemies: [place(type, 50, 0, 'x')] });
      const held: boolean[] = [];
      for (let i = 0; i < 12; i++) {
        realSwingWait();
        // 寄ってきて技に入ったり離れたりするので、毎回同じ場所・素の相へ戻してから当てる(固まり・浮き・固まらない時間の欄は持ち越す)
        const home = place(type, 50, 0, 'x');
        useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, x: home.x, y: home.y, aiPhase: undefined, aiPhaseUntil: undefined, biteAt: undefined, chaffMove: undefined, bossState: undefined, knockbackImmuneUntil: 0 })) }));
        const lock0 = en('x').brLockUntil;
        expect(useGameStore.getState().triggerCounter().hit).toBe(true);
        const e = en('x');
        held.push(e.brLockUntil !== undefined && e.brLockUntil !== lock0 && e.brLockUntil > gt());
      }
      expect(held).toEqual(KNIFE_REAL_HELD[type]);
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
  it('スラッシャー Lv3: 1撃目で浮く→追い打ち(入力なし・0.1秒おき)は空中の敵に当たる・数字は実際に減った量', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z')] });
    withSlasher(3);
    expect(swing().hit).toBe(true);
    expect(brawlerAirborne(en('z'), now)).toBe(true);
    for (let k = 0; k < 3; k++) {
      const hp = en('z').health;
      step(SLASHER_FOLLOWUP_INTERVAL_MS);
      useGameStore.setState(st => ({ realGameTime: st.realGameTime + SLASHER_FOLLOWUP_INTERVAL_MS }));
      useGameStore.getState().pumpSlasherFollowups();
      const z = en('z');
      expect(z.health).toBeLessThan(hp); // 追い打ちが当たった
      const nums = useGameStore.getState().effects.filter(x => x.kind === 'damageNumber');
      expect(nums[nums.length - 1].value).toBe(Math.max(1, Math.ceil(hp - z.health)));
    }
    expect(useGameStore.getState().slasherFollowups).toHaveLength(0);
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
    // ★止めの間は上がり始めない(社長指示2026-11-27「上がる方も止めて」)=カウンターの浮きの始まりはこの振りの止めの明けへ(浮かせ直してはいない)。
    expect(en('z').brawlerLiftAt).toBe(now + ((en('z').hitStunUntil ?? now) - now));
    expect(en('z').brLiftUntil).toBe(en('z').brawlerLiftAt! + 600);
  });
});
