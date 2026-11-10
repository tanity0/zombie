// ★格闘の構え(カウンター)の成立の作り直し(research/BRAWLER.md §12-3d・社長指示2026-11-10)をストアで実際に動かして固める。
//  ・構えで受けても技ポイントは増えない(全回復の撤去)
//  ・雑魚を受けた → その瞬間に大踏み潰しが代金なしで出る(構えは終わる・秘奥義の順番に数えない)
//  ・雑魚より上/相手が分からない → 相手と反対へ大きく押される(構えは続く・向きは相手を向いたまま・壁と木で止まる・スロー中も押され切る)
//  ・間引きの受け(140ms)・持続ダメージ → どちらも出ない
//  ・弾の打ち返しは撃ち主の区分で同じ扱い
//  ・光線を受けた → その光線が中断され、持ち主は技の後の休みへ移る(判定と絵の欄=撃っている最中の状態が消える)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, isBrawlerGuarding, takeBrawlerBeamCut } from './gameStore';
import { applyEnemyProjectileHits, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { runIdolTick, createIdolTickState, NOOP_IDOL_SFX } from '../utils/idolTick';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { BRAWLER_GUARD_KNOCK_PX, BRAWLER_GUARD_KNOCK_MS, BRAWLER_GUARD_THROTTLE_MS } from '../utils/brawlerGuard';
import { treesInRegion, trunkRect, setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { computeTimeSlowScale } from '../utils/timeSlowCurve';
import { GAME_SPEED } from '../config/gameSpeed';
import type { Enemy, EnemyType, Projectile } from '../types/game';
// ★テンポ係数: この表の時刻は係数1.0(brawler.store.test.ts と同じ)。
setBrawlerTempoAll(1.0);

const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 7_000_000;

const setup = (opts: { trees?: boolean } = {}) => {
  setTreesDisabled(!opts.trees); setTorchesDisabled(true);
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    enemies: [], projectiles: [], pumpkinBlasts: [],
    player: {
      ...st.player, health: 100, maxHealth: 100, invulnerable: false,
      subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 },
      lastDirection: { x: 1, y: 0 },
    },
  }));
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const enemyAt = (type: EnemyType, dx: number, dy: number, id: string, patch: Partial<Enemy> = {}): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = 99999; e.maxHealth = 99999; e.id = id;
  return Object.assign(e, patch);
};
/**
 * ゲームループ相当(useGameLoop と同じ式): 実時間を 10ms ずつ進め、スローの倍率を掛けた分だけ gameTime を進める。
 * 移動へは「実時間×スローの倍率×ゲームスピード」を渡す。構えで受けると成立のスロー(0.2倍)が必ず掛かるので、スローを式どおりに回す。
 */
const advance = (ms: number) => {
  const end = now + ms;
  while (now < end) {
    now += 10;
    const s = useGameStore.getState();
    const scale = computeTimeSlowScale(now, s.timeSlowStart, s.timeSlowUntil, s.timeSlowScale, s.timeSlowHoldMs);
    useGameStore.setState(st => ({ gameTime: st.gameTime + 10 * scale }));
    useGameStore.getState().movePlayer(NO_INPUT, 0.01 * scale * GAME_SPEED);
    useGameStore.getState().tickBrawler();
  }
};
/** ゲーム内の時間で ms 進める(スローの間は実時間が長く掛かる)。 */
const advanceSim = (ms: number) => { const g0 = useGameStore.getState().gameTime; let guard = 0; while (useGameStore.getState().gameTime - g0 < ms && guard++ < 5000) advance(10); };
/** 押される距離の期待値(ループの移動はゲームスピードが掛かる=格闘のステップ等と同じ)。 */
const KNOCK = BRAWLER_GUARD_KNOCK_PX * GAME_SPEED;
const br = () => useGameStore.getState().player.brawler!;
const pl = () => useGameStore.getState().player;
const guarding = () => isBrawlerGuarding(pl(), useGameStore.getState().gameTime);
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
/** 構えを出す(技ポイントは points を持たせてから。構えの代金3を払った後の残りが返る)。 */
const guardNow = (points = 3): number => {
  useGameStore.getState().brawlerPress(); advance(400);
  useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points, gainAt: 0 } } }));
  expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
  advance(20);
  expect(guarding()).toBe(true);
  return br().points;
};
/** 相手 id の攻撃を受ける(damagePlayer の入口=普通の被弾と同じ道)。 */
const hitBy = (id: string, type: EnemyType, move?: string) => {
  const e = en(id);
  return useGameStore.getState().damagePlayer(30, 'test', e.x + e.width / 2, e.y + e.height / 2, type, false, move, id);
};

beforeEach(() => {
  now = 7_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリ・オーバークロックを出さない
});
afterEach(() => { vi.restoreAllMocks(); setTreesDisabled(false); setTorchesDisabled(false); });

describe('雑魚の攻撃を構えで受けた: 代金なしの大踏み潰し(§12-3d)', () => {
  it('受けた瞬間に大踏み潰しへ移る・構えは終わる・技ポイントは減らない(増えもしない)・相手は気絶し、潰しが当たる', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 60, 0, 'z')] });
    const left = guardNow(3); // 3 − 構えの3 = 0
    expect(left).toBe(0);
    const hp0 = pl().health;
    expect(hitBy('z', 'zombie')).toBe(false);
    expect(pl().health).toBe(hp0);
    expect(br().tech).toBe('stomp');
    expect(br().phase).toBe('tech');
    expect(guarding()).toBe(false);                       // 構えはそこで終わる
    expect(pl().counterWindowEnd).toBeLessThanOrEqual(now); // カウンター窓も閉じる
    expect(br().points).toBe(0);                          // 潰しは本来5ポイント=払っていたら負になる
    expect(br().gainAt ?? 0).toBe(0);                     // HUD の跳ねは出ない
    expect(pl().lastCounterSuccessTime).toBe(now);        // 成立の記録は今どおり
    expect(en('z').stunUntil ?? 0).toBeGreaterThan(useGameStore.getState().gameTime); // 受けた相手の気絶は今どおり
    expect(useGameStore.getState().effects.some(e => (e as { text?: string }).text === 'Counter!')).toBe(true); // 成立の演出は今どおり
    const zhp = en('z').health;
    advanceSim(300); // 潰しの前隙(200)→当たり
    expect(en('z').health).toBeLessThan(zhp); // 潰しの当たりは今の技のまま
    expect(br().points).toBe(0);
    advanceSim(800); // 止め→戻り
    expect(br().phase).toBe('idle');
    expect(br().points).toBe(0);
  });
  it('技ポイントが0でも出る(代金なし)・秘奥義の順番には数えない', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 60, 0, 'z')] });
    guardNow(3);
    // 順番の途中(蹴り→の次=大踏み潰し待ち)だったことにする: 入力で出した潰しなら 2 へ進む。
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, secretProgress: 1, secretLastEndAt: st.gameTime } } }));
    hitBy('z', 'zombie');
    expect(br().tech).toBe('stomp');
    expect(br().secretProgress).toBe(1);
    expect(br().secret).toBeUndefined();
  });
  it('赤い個体(強個体の扱い)の雑魚は潰しではなく、自分が押される', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 60, 0, 'z', { colorTier: 'red' } as Partial<Enemy>)] });
    guardNow(3);
    hitBy('z', 'zombie');
    expect(br().tech).toBe('guard');
    expect(pl().lungeShape).toBe('push');
  });
});

describe('雑魚より上の攻撃を構えで受けた: 自分が大きくノックバック(§12-3d)', () => {
  it('ボス級: 相手と反対へ約150px押される(加速→減速)・押されている間も構えは続く・向きは相手を向いたまま・技ポイントはそのまま', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
    const left = guardNow(5);
    const x0 = pl().x, y0 = pl().y;
    expect(hitBy('h', 'hunter')).toBe(false);
    expect(br().tech).toBe('guard');
    expect(guarding()).toBe(true);
    expect(pl().lungeShape).toBe('push');
    expect(pl().lungeVx).toBeLessThan(0); // 相手(右)と反対=左へ
    // 速さの形: 出だしと終わりは遅く、真ん中が速い(慣性)。ゲーム内の 20ms ごとに進んだ距離を並べる(成立のスローの間も同じ形)。
    const g0 = useGameStore.getState().gameTime;
    const xs: number[] = [pl().x];
    for (let i = 0; i < BRAWLER_GUARD_KNOCK_MS / 20; i++) {
      advanceSim(20); xs.push(pl().x);
      expect(guarding(), `押されている間(${i * 20}ms)`).toBe(true);
      expect(pl().direction, `向き(${i * 20}ms)`).not.toBe('left'); // 押される向きへ振り返らない
    }
    const steps = xs.slice(1).map((x, i) => xs[i] - x);
    const mid = Math.max(...steps);
    expect(steps[0]).toBeLessThan(mid * 0.5);
    expect(steps[steps.length - 1]).toBeLessThan(mid * 0.5);
    advanceSim(40);
    expect(x0 - pl().x).toBeGreaterThan(KNOCK - 12);
    expect(x0 - pl().x).toBeLessThan(KNOCK + 12);
    expect(Math.abs(pl().y - y0)).toBeLessThan(1);
    expect(pl().lastDirection).toEqual({ x: 1, y: 0 });
    expect(br().points).toBe(left);
    expect(useGameStore.getState().gameTime - g0).toBeLessThan(600);
    expect(guarding()).toBe(true); // 押され終わった後も、構えは時間いっぱい(ゲーム内の1000ms)続く
    expect(en('h').health).toBe(99999); // 潰しは出ていない
  });
  it('強個体でも同じ・相手が分からない受けも「雑魚より上」として押される(受けた点と反対へ)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('pumpkin', -120, 0, 'p')] });
    guardNow(5);
    const x0 = pl().x;
    hitBy('p', 'pumpkin');
    expect(br().tech).toBe('guard');
    advanceSim(BRAWLER_GUARD_KNOCK_MS + 40);
    expect(pl().x - x0).toBeGreaterThan(KNOCK - 12); // 相手は左=右へ押される

    setup();
    guardNow(5);
    const c = center();
    const x1 = pl().x;
    useGameStore.getState().brawlerGuardReceive(c.x + 30, c.y);
    expect(br().tech).toBe('guard');
    advanceSim(BRAWLER_GUARD_KNOCK_MS + 40);
    expect(x1 - pl().x).toBeGreaterThan(KNOCK - 12);
  });
  it('相手の個体が分からず型だけ届く受け(ミーミルのレーザーの被弾)でも、その型の相手から離れる向きへ押される', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('mimir', 0, -230, 'm', { bossState: 'laser-fire' } as Partial<Enemy>)] });
    guardNow(5);
    const x0 = pl().x, y0 = pl().y;
    const c = center();
    // 受けた点=光線の上の一番近い点=ほぼ自分の中心(向きが取れない)。相手は上=下へ押される。
    useGameStore.getState().damagePlayer(10, 'ミーミルのレーザー', c.x, c.y, undefined, undefined, 'mimir-laser', undefined, undefined, { type: 'mimir' });
    advanceSim(BRAWLER_GUARD_KNOCK_MS + 40);
    expect(pl().y - y0).toBeGreaterThan(KNOCK - 12);
    expect(Math.abs(pl().x - x0)).toBeLessThan(2);
  });
  it('木の幹で止まる(通り抜けない)', () => {
    setup({ trees: true });
    const p0 = pl();
    const trunks = treesInRegion(p0.x - 1200, p0.y - 1200, p0.x + 1200, p0.y + 1200).map(trunkRect);
    expect(trunks.length).toBeGreaterThan(0);
    const t = trunks[0];
    // 幹の右 60px に立ち、右の相手から受ける=左(幹の方)へ押される。
    useGameStore.setState(st => ({ player: { ...st.player, x: t.x + t.width + 60, y: t.y + t.height / 2 - st.player.height / 2 } }));
    useGameStore.setState({ enemies: [enemyAt('hunter', 140, 0, 'h')] });
    guardNow(5);
    const x0 = pl().x;
    hitBy('h', 'hunter');
    advanceSim(BRAWLER_GUARD_KNOCK_MS + 60);
    expect(pl().x).toBeGreaterThanOrEqual(t.x + t.width - 0.5); // 幹の右の面で止まる
    expect(x0 - pl().x).toBeLessThan(KNOCK - 40); // 押され切る前に止められた
    expect(x0 - pl().x).toBeGreaterThan(30);      // 幹までは押された
  });
  it('成立のスロー(0.2倍)の最中でも、決めた距離を押され切る(スローが無い時と同じ距離)', () => {
    const run = (slow: boolean): number => {
      setup();
      useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
      guardNow(5);
      const x0 = pl().x;
      hitBy('h', 'hunter');
      expect(useGameStore.getState().timeSlowUntil).toBeGreaterThan(now); // 受けた瞬間に成立のスローが掛かっている
      if (!slow) useGameStore.setState({ timeSlowUntil: 0 });
      advanceSim(BRAWLER_GUARD_KNOCK_MS + 40);
      return x0 - pl().x;
    };
    const withSlow = run(true), noSlow = run(false);
    expect(noSlow).toBeGreaterThan(KNOCK - 12);
    expect(withSlow).toBeGreaterThan(KNOCK - 12);
    expect(Math.abs(withSlow - noSlow)).toBeLessThan(12);
  });
});

describe('間引きの受け・持続ダメージでは、潰しもノックバックも出さない(§12-3d)', () => {
  it('受けた直後(140msの中)の次の受けは、雑魚でも潰しが出ず、押しも掛け直さない', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 60, 0, 'z')] });
    guardNow(5);
    const c = center();
    useGameStore.getState().brawlerGuardReceive(c.x + 30, c.y); // 相手が分からない受け=押される
    const vx = pl().lungeVx;
    advance(BRAWLER_GUARD_THROTTLE_MS - 60);
    hitBy('z', 'zombie');                                        // 間引きの中=雑魚でも潰しは出ない
    expect(br().tech).toBe('guard');
    const until = pl().lungeUntil;
    useGameStore.getState().brawlerGuardReceive(c.x - 30, c.y); // 反対側からの受けでも押しは掛け直さない
    expect([pl().lungeUntil, pl().lungeVx]).toEqual([until, vx]);
    advance(80);                                                 // 間引きが明けた
    hitBy('z', 'zombie');
    expect(br().tech).toBe('stomp');
  });
  it('持続ダメージ(延焼)は防ぐだけ', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 60, 0, 'z')] });
    guardNow(5);
    const hp0 = pl().health;
    expect(useGameStore.getState().damagePlayer(5, '延焼', undefined, undefined, undefined, undefined, undefined, undefined, undefined, { type: 'zombie', id: 'z' }, { dot: true })).toBe(false);
    expect(pl().health).toBe(hp0);
    expect(br().tech).toBe('guard');
    expect(pl().lungeShape).not.toBe('push');
  });
});

describe('弾の打ち返しは、撃った相手の区分で同じ扱い(§12-3d)', () => {
  const shoot = (ownerId: string | undefined, ownerType: EnemyType | undefined) => {
    const c = center();
    const proj = {
      id: 'b1', x: c.x - 5, y: c.y - 5, width: 10, height: 10, speed: 0, damage: 10,
      direction: { x: -1, y: 0 }, weaponType: 'handgun', hostile: true, reflected: false, passthrough: false, hitEnemies: [], duration: 5000, createdAt: now, critChance: 0,
      ...(ownerId !== undefined ? { ownerId } : {}), ...(ownerType !== undefined ? { ownerType } : {}),
    } as unknown as Projectile;
    useGameStore.setState({ projectiles: [proj] });
    applyEnemyProjectileHits(now, pl(), false, 0, useGameStore.getState().gameTime, NOOP_COMBAT_EFFECTS, { grenadeBlastRadius: 0, grenadeBlastDamageMult: 0, counterReflectSlowMs: 0 });
  };
  it('雑魚の弾=潰しが出る(撃ち主が遠くても・撃ち主が倒れた後は型で引く)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 400, 0, 'z')] });
    guardNow(3);
    shoot('z', 'zombie');
    expect(br().tech).toBe('stomp');
    expect(br().points).toBe(0);

    setup();
    guardNow(3);
    shoot('gone', 'zombie');
    expect(br().tech).toBe('stomp');
  });
  it('ボス級の弾=撃ち主と反対へ押される / 撃ち主が分からない弾=「雑魚より上」として押される', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 400, 0, 'h')] });
    guardNow(5);
    shoot('h', 'hunter');
    expect(br().tech).toBe('guard');
    expect(pl().lungeShape).toBe('push');
    expect(pl().lungeVx).toBeLessThan(0);

    setup();
    guardNow(5);
    shoot(undefined, undefined);
    expect(br().tech).toBe('guard');
    expect(pl().lungeShape).toBe('push');
  });
});

describe('光線を構えで受けたら中断させる(社長指示2026-11-10「光線防いだら中断させたい。じゃないと必ず食らって意味ない」)', () => {
  const O = 50_000;
  const START_GT = 10_000_000;
  /** 城ボス(ステージ5)の掃射: 回転の中心 (O,O)・いまの向きが +x。プレイヤーは +x 側 300px(光線の上)。 */
  const sweepSetup = () => {
    setup();
    useGameStore.setState(s => ({ gameTime: START_GT, player: { ...s.player, x: O + 300 - s.player.width / 2, y: O - s.player.height / 2 } }));
    const g = { ...spawnEnemyAt('giantbat', 0, 0, START_GT) };
    g.x = O - g.width / 2; g.y = O - g.height / 2; g.id = 'g'; g.health = 99999; g.maxHealth = 99999;
    Object.assign(g, {
      aiPhase: 'g-sweepbeam-active', aiPhaseUntil: START_GT + 5000, aiStartedAt: START_GT, giantActiveHit: false,
      aiFromX: O, aiFromY: O, aiTargetX: O + Math.cos(Math.PI / 3) * 100, aiTargetY: O + Math.sin(Math.PI / 3) * 100,
    });
    useGameStore.setState({ enemies: [g] });
  };
  const frame = () => { now += 16; useGameStore.getState().updateEnemies(1 / 60); };
  const sweepBlasts = () => useGameStore.getState().pumpkinBlasts.filter(b => b.moveKey === 'g-sweepbeam');

  it('城ボスの掃射: 構えていなければ撃ち続ける / 構えで受けた次のフレームに、撃っている最中の状態(判定と絵の欄)が消えて休みへ移る', () => {
    // 対照: 構えていない=光線は続く。
    sweepSetup();
    frame(); frame();
    expect(en('g').aiPhase).toBe('g-sweepbeam-active');

    // 構えで受ける。
    sweepSetup();
    useGameStore.getState().brawlerPress();
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, phase: 'idle', points: 5 } } }));
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    expect(guarding()).toBe(true);
    const x0 = pl().x;
    frame(); // 光線が体(盾の代わり)に当たる=受けた
    expect(pl().lastCounterSuccessTime).toBe(now);                 // 成立は1回のカウンター
    expect(pl().lungeShape).toBe('push');                          // 城ボス=ボス級: 自分が押される
    expect(pl().lungeVx).toBeGreaterThan(0);                       // 相手(左)と反対=右へ
    useGameStore.setState({ pumpkinBlasts: [] });
    frame(); // 次のフレーム: 中断
    expect(en('g').aiPhase).toBe('g-sweepbeam-recover');           // 普通に終わった時と同じ休み(気絶ではない)
    expect(en('g').stunUntil ?? 0).toBeLessThanOrEqual(useGameStore.getState().gameTime);
    expect(sweepBlasts()).toHaveLength(0);                         // 中断した回は判定を1つも積まない
    expect(pl().x).toBeGreaterThanOrEqual(x0);
    // 以後の受けは起きない(光線が無い)=成立は1回だけ。
    const t1 = pl().lastCounterSuccessTime;
    for (let i = 0; i < 20; i++) frame();
    expect(pl().lastCounterSuccessTime).toBe(t1);
    expect(en('g').aiPhase).not.toBe('g-sweepbeam-active');
  });

  it('アイドルの狙撃: 構えで受けたその更新で、狙撃の線が消えて技の後の休みへ移る', () => {
    setup();
    const idol = spawnEnemyAt('idol', 0, 0, 0);
    idol.fromEvent = true; idol.dormant = false; idol.bossPhase = 1; idol.id = 'idol';
    idol.bossNextActionAt = Number.MAX_SAFE_INTEGER;
    const c = center();
    idol.x = c.x - 300 - idol.width / 2; idol.y = c.y - idol.height / 2;
    const gt0 = useGameStore.getState().gameTime;
    Object.assign(idol, { bossState: 'idol-snipe', bossStateUntil: gt0 + 100_000, aiFromX: c.x - 300, aiFromY: c.y, aiTargetX: c.x + 400, aiTargetY: c.y });
    useGameStore.setState({ enemies: [idol], escorts: [] });
    const st = createIdolTickState();
    const tick = () => {
      now += 16;
      useGameStore.setState(s => ({ gameTime: s.gameTime + 16 }));
      runIdolTick(en('idol'), st, useGameStore.getState().gameTime, 0.016, 1, NOOP_IDOL_SFX, false, () => {});
    };
    // 対照: 構えていなければ被弾し、狙撃は続く。
    const hp0 = pl().health;
    tick();
    expect(pl().health).toBeLessThan(hp0);
    expect(en('idol').bossState).toBe('idol-snipe');
    // 構えで受ける。
    useGameStore.setState(s => ({ player: { ...s.player, health: 100, invulnerable: false, invulnerableTime: 0, knockbackUntil: 0, lastHurtAt: 0 } }));
    now += 2000; // 被弾のしゃがみ・無敵を越える
    useGameStore.getState().brawlerPress();
    useGameStore.setState(s => ({ player: { ...s.player, x: c.x - s.player.width / 2, y: c.y - s.player.height / 2, brawler: { ...s.player.brawler!, phase: 'idle', points: 5 } } }));
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    const hp1 = pl().health;
    tick();
    expect(pl().health).toBe(hp1);
    expect(en('idol').bossState).toBe('idol-snipe-recover'); // 狙撃の線(判定も絵もこの状態を読む)が消え、休みへ
    expect(pl().lungeShape).toBe('push');                    // アイドル=ボス級
    expect(br().tech).toBe('guard');
  });

  it('中断の合図は1度読んだら消える・撃っている最中でない相手には置かれない', () => {
    setup();
    const m = enemyAt('mimir', 300, 0, 'm', { bossState: 'laser-windup' } as Partial<Enemy>);
    useGameStore.setState({ enemies: [m] });
    guardNow(5);
    const gt = useGameStore.getState().gameTime;
    // 溜めの最中に光線の技キーで受けても、中断の合図は置かれない。
    useGameStore.getState().damagePlayer(10, 'test', m.x, m.y, undefined, undefined, 'mimir-laser', undefined, undefined, { type: 'mimir' });
    expect(takeBrawlerBeamCut('m', gt)).toBe(false);
    // 撃っている最中なら置かれる(ミーミルのレーザーの被弾は型だけが届く=同じ型で撃っている1体を引く)。間引きの中でも切る。
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => ({ ...e, bossState: 'laser-fire' as const })) }));
    useGameStore.getState().damagePlayer(10, 'test', m.x, m.y, undefined, undefined, 'mimir-laser', undefined, undefined, { type: 'mimir' });
    expect(takeBrawlerBeamCut('m', gt)).toBe(true);
    expect(takeBrawlerBeamCut('m', gt)).toBe(false);
  });
});
