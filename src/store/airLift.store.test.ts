// ★格闘以外の浮き(research/BRAWLER.md §14・社長「浮き入れよう。落ちてくるのを爆発のは少しゆっくりに」)をストアで固める。
// ①プレイヤー側の爆発の合流点(playerBlast)が雑魚・強個体を浮かせる(ボス級は浮かない・浮いている間は動けない)
// ②スラッシャーの1回目の追撃で打ち上げ、2回目の追撃は空中の敵に当たる。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll, brawlerAirborne, brawlerLiftHoldNow, BRAWLER_JUGGLE_BUDGET, BRAWLER_JUGGLE_WEIGHT, BRAWLER_GROUND_LAUNCH } from '../utils/brawlerCombo';
import { slasherLiftMove } from '../utils/airLift';
import { BRAWLER_TEMPO_DEFAULT } from '../utils/brawler';

let now = 11_000_000;
const NO = { up: false, down: false, left: false, right: false } as never;
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false } as Enemy;
};
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const step = (ms = 10) => {
  now += ms;
  useGameStore.setState(st => ({ gameTime: st.gameTime + ms }));
  useGameStore.getState().movePlayer(NO, ms / 1000);
  useGameStore.getState().tickBrawler();
  useGameStore.getState().updateEnemies(ms / 1000);
};

beforeEach(() => {
  now = 11_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  setBrawlerTempoAll(1.3);
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({ m0Unlocked: { ...st.m0Unlocked, melee: true, crit: false }, breakableProps: [], player: { ...st.player, health: 9999, maxHealth: 9999 } }));
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT));

describe('爆発で浮く(playerBlast)', () => {
  /** 爆発のダメージ(blast=true)を当てた敵だけが浮く。ダメージの処理の代わりにテストで当てる。 */
  const hitBy = (...ids: string[]) => { for (const id of ids) useGameStore.getState().damageEnemy(id, 1, true); };
  it('爆発のダメージが当たった雑魚・強個体が浮く(次の格闘の時計で)・ボス級と当たっていない敵は浮かない', () => {
    useGameStore.setState({ enemies: [place('zombie', 150, 0, 'z'), place('driller', 210, 0, 'd'), place('hunter', 150, 60, 'h'), place('zombie', 420, 0, 'far'), place('zombie', 170, 30, 'miss')] });
    const c = center();
    useGameStore.getState().playerBlast(c.x + 160, c.y, 100);
    hitBy('z', 'd', 'h'); // 'miss' は爆風の中だが当たっていない(壁の向こう・相手を絞る爆発など)
    expect(brawlerAirborne(en('z'), now)).toBe(false); // その場では掛けない(爆発のダメージ・押しの書き込みと混ぜない)
    step();
    expect(en('z').brLiftShape).toBe('blast');
    expect(brawlerLiftHoldNow(en('z'), now)).toBe(true);
    expect(en('z').brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob - 2);
    expect(brawlerAirborne(en('d'), now)).toBe(true);
    expect(en('d').brLiftPeak!).toBeLessThan(en('z').brLiftPeak!); // 強個体は重い(+爆心から遠い)
    expect(en('h').brawlerLiftAt).toBeUndefined(); // ボス級は浮かない
    expect(en('far').brawlerLiftAt).toBeUndefined();
    expect(en('miss').brawlerLiftAt).toBeUndefined(); // ★当たった敵だけ
  });
  it('同じフレームに爆発が重なっても、敵ごとに一番近い1回だけ(予算を重ねて使わない)', () => {
    useGameStore.setState({ enemies: [place('zombie', 150, 0, 'z')] });
    const c = center();
    useGameStore.getState().playerBlast(c.x + 150, c.y, 100); // 爆心
    useGameStore.getState().playerBlast(c.x + 210, c.y, 100); // 縁寄り
    hitBy('z');
    step();
    expect(en('z').brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob - 2);
    expect(en('z').brLiftFrom).toBe(0);
  });
  it('爆発の浮きで着地した敵は、浮いていた時間と同じ長さだけ爆発では浮かない', () => {
    useGameStore.setState({ enemies: [place('zombie', 150, 0, 'z')] });
    const c = center();
    useGameStore.getState().playerBlast(c.x + 150, c.y, 100); hitBy('z'); step();
    const until = en('z').liftUntil!, win = en('z').brBlastNoLiftUntil!;
    while (now < until + 30) step(16);
    useGameStore.getState().playerBlast(c.x + 150, c.y, 100); hitBy('z'); step();
    expect(brawlerAirborne(en('z'), now)).toBe(false); // 窓の中=浮かない(押しとダメージは別)
    while (now < win + 30) step(16);
    // 寄ってきて噛みの構え(技の最中=浮かない)に入っていることがあるので、離れた所の素の状態へ戻してから当てる
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => (e.id === 'z' ? { ...e, ...place('zombie', 150, 0, 'tmp'), id: 'z', aiPhase: undefined, aiPhaseUntil: undefined, biteAt: undefined, brBlastNoLiftUntil: e.brBlastNoLiftUntil } : e)) }));
    const z = en('z'); const zc = { x: z.x + z.width / 2, y: z.y + z.height / 2 };
    useGameStore.getState().playerBlast(zc.x, zc.y, 100); hitBy('z');
    step();
    expect(brawlerAirborne(en('z'), now)).toBe(true); // 窓が明けたらまた浮く
  });
  it('赤い個体は強個体として浮く(重さ0.7)・リセットで待ち行列が消える', () => {
    useGameStore.setState({ enemies: [{ ...place('zombie', 150, 0, 'r'), colorTier: 'red' } as Enemy] });
    const c = center();
    useGameStore.getState().playerBlast(c.x + 150, c.y, 100); hitBy('r'); step();
    expect(en('r').brLiftPeak!).toBeCloseTo(0.75 * 0.6 * 0.7, 5);
    useGameStore.getState().playerBlast(c.x + 150, c.y, 100); hitBy('r');
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState({ enemies: [place('zombie', 150, 0, 'z2')] });
    step();
    expect(en('z2').brawlerLiftAt).toBeUndefined();
  });
  it('格闘の気功の爆発: 地上の雑魚を爆発の浮きで打ち上げる(予算は格闘と共有で2)', () => {
    useGameStore.setState(st => ({ player: { ...st.player, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 }, lastDirection: { x: -1, y: 0 } }, enemies: [place('zombie', -200, 0, 'k')] }));
    useGameStore.getState().brawlerPress(); for (let i = 0; i < 40; i++) step();
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 5 } } }));
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    let lifted = false;
    for (let i = 0; i < 60 && !lifted; i++) { step(); lifted = en('k').brLiftShape === 'blast'; }
    expect(lifted).toBe(true);
    expect(en('k').brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob - 2);
  });
  it('浮いている間は自分では動かない(押されない限り位置が変わらない)・着地したらまた動く', () => {
    useGameStore.setState({ enemies: [place('zombie', 150, 0, 'z')] });
    const c = center();
    useGameStore.getState().playerBlast(c.x + 150, c.y, 100);
    hitBy('z');
    step();
    const x0 = en('z').x, y0 = en('z').y, until = en('z').liftUntil!;
    while (now < until - 20) step(16);
    expect(Math.hypot(en('z').x - x0, en('z').y - y0)).toBeLessThan(0.01);
    for (let i = 0; i < 120; i++) step(16);
    expect(Math.hypot(en('z').x - x0, en('z').y - y0)).toBeGreaterThan(1); // 着地の後はプレイヤーへ向かって動く
  });
});

describe('スラッシャーの追撃で打ち上げる', () => {
  const arm = (step0: number) => useGameStore.setState(state => ({
    realGameTime: 4100,
    player: {
      ...state.player,
      skills: state.player.skills.includes('slasher') ? state.player.skills : [...state.player.skills, 'slasher'],
      skillLevels: { ...state.player.skillLevels, slasher: 3 },
      slasherChainReadyAt: 4000, slasherStrikeStep: step0, slasherReach: 74, slasherQueuedTap: false, pendingSwingAt: 0,
      counterCooldownEnd: Date.now() + 700,
    },
  }));
  it('1回目の追撃=3段目と同じ打ち上げ・2回目の追撃は空中の敵に当たって拾う', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z')] });
    arm(0);
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    const z1 = en('z');
    expect(z1.health).toBeLessThan(99999);
    expect(brawlerAirborne(z1, now)).toBe(true);
    expect(z1.brLiftShape).toBeUndefined(); // 格闘の弧
    expect(z1.brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob);
    const hp1 = z1.health;
    step(80);
    // 2回目の追撃(空中の敵)
    useGameStore.setState(state => ({ realGameTime: 6000, player: { ...state.player, slasherChainReadyAt: 5500, counterCooldownEnd: Date.now() + 700, pendingSwingAt: 0 } }));
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    const z2 = en('z');
    expect(z2.health).toBeLessThan(hp1);
    expect(brawlerAirborne(z2, now)).toBe(true);
    expect(z2.brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob - 1); // 2段目の拾い=1
  });
  // 社長裁定2026-11-11「普段は少し重く、気絶中からのコンボは軽く」(v0.25.5480): ボス級は普段 BRAWLER_JUGGLE_WEIGHT.boss
  // (気絶・紫の間に地上から浮かせた時だけ BRAWLER_JUGGLE_WEIGHT_STUN_BOSS)。期待値は定数から作る(数字が変わっても追従する)。
  it('ボス級も格闘と同じ区分の重さで浮く(普段=ボス級の重さぶん雑魚より低い)', () => {
    useGameStore.setState({ enemies: [place('hunter', 50, 0, 'h')] });
    arm(0);
    useGameStore.getState().beginMeleeSwing();
    const h = en('h');
    expect(brawlerAirborne(h, now)).toBe(true);
    const launch = BRAWLER_GROUND_LAUNCH[slasherLiftMove(0, false, false)!]!; // 1回目の追撃=3段目の打ち上げ
    expect(h.brLiftPeak!).toBeCloseTo(launch * BRAWLER_JUGGLE_WEIGHT.boss, 5);
    if (BRAWLER_JUGGLE_WEIGHT.boss < BRAWLER_JUGGLE_WEIGHT.mob) expect(h.brLiftPeak!).toBeLessThan(launch * BRAWLER_JUGGLE_WEIGHT.mob);
  });
});

describe('スラッシャー: 区分の扱い(品質監査の反映)', () => {
  const arm = (step0: number, rgt: number, ready: number) => useGameStore.setState(state => ({
    realGameTime: rgt,
    player: {
      ...state.player,
      skills: state.player.skills.includes('slasher') ? state.player.skills : [...state.player.skills, 'slasher'],
      skillLevels: { ...state.player.skillLevels, slasher: 3 },
      slasherChainReadyAt: ready, slasherStrikeStep: step0, slasherReach: 74, slasherQueuedTap: false, pendingSwingAt: 0,
      counterCooldownEnd: Date.now() + 700,
    },
  }));
  for (const type of ['driller', 'hunter'] as EnemyType[]) {
    it(`${type}: 1回目の打ち上げは追撃の窓(650ms)より短くない=2回目の追撃が空中に間に合う`, () => {
      useGameStore.setState({ enemies: [place(type, 50, 0, 'x')] });
      arm(0, 4100, 4000);
      useGameStore.getState().beginMeleeSwing();
      expect(en('x').brLiftMs!).toBeGreaterThanOrEqual(650);
      for (let i = 0; i < 30; i++) step(16); // チェーンの CD(300ms)+前隙(200ms)近く待って2回目
      arm(1, 6000, 5500);
      useGameStore.getState().beginMeleeSwing();
      expect(brawlerAirborne(en('x'), now)).toBe(true);
    });
  }
  it('終端の死神(深奥チェイサー)は打ち上がらない', () => {
    useGameStore.setState({ enemies: [{ ...place('reaper', 50, 0, 'rp'), reaperChaser: true } as Enemy] });
    arm(0, 4100, 4000);
    useGameStore.getState().beginMeleeSwing();
    expect(en('rp').brawlerLiftAt).toBeUndefined();
  });
});
