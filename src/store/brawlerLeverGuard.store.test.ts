// ★格闘のレバーガード(research/BRAWLER.md §12-1c・社長指示2026-11-10)をストアで実際に動かして固める。
//  社長の言葉: 「格闘 は、攻撃の方向と逆にレバー入れてる状態で攻撃を食らうと、ガードになる。(ダメージ半減、浮かない、少しノックバック)」
//              「弾もガード可能」「ガード中も赤カウンターは狙えるように」
//  ①相手から離れる向きに入れて食らう → ダメージ半分・小さく押される・怯まない
//  ②逆向き/レバーなし/動作の最中/相手不明/持続ダメージ → 普通に食らう
//  ③打ち上げの技(拳鬼の3・4段目/跳びかかりの着地)をガードすると浮かない
//  ④構えの最中は構えが優先 / 今あるカウンター(窓・構え・打ち返し)が先・レバーガードは後 / 押されている最中に出したカウンターが次の攻撃に成立する
//  ⑤弾=飛んできた向き / 爆発=爆心から離れる向き / 掴み・演出つきの技=半減だけ
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, isBrawlerGuarding, leverGuardCount, type PumpkinBlast } from './gameStore';
import { applyEnemyProjectileHits, applyPumpkinBlastDamage, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { runPhantomTick, createPhantomTickState, NOOP_PHANTOM_SFX } from '../utils/phantomTick';
import { setPhantomIdentity } from '../utils/phantomIdentity';
import { uniquePhantomSpec } from '../data/uniquePhantoms';
import { playerLaunchHeightPx, resetPlayerLaunch } from '../utils/playerAirFollow';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { isHurtMoveLocked } from '../utils/playerHurt';
import {
  BRAWLER_LEVER_GUARD_PUSH_PX, BRAWLER_LEVER_GUARD_PUSH_MS, BRAWLER_LEVER_GUARD_STOP_MS, BRAWLER_LEVER_GUARD_STAND_MS, brawlerLeverGuardDamage,
} from '../utils/brawlerLeverGuard';
import { brawlerStandAt } from '../utils/brawler';
import { treesInRegion, trunkRect, setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { computeTimeSlowScale } from '../utils/timeSlowCurve';
import { GAME_SPEED } from '../config/gameSpeed';
import type { Enemy, EnemyType, Projectile } from '../types/game';
// ★テンポ係数: この表の時刻は係数1.0(brawler.store.test.ts と同じ)。
setBrawlerTempoAll(1.0);

const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 7_000_000;

const setup = (opts: { trees?: boolean; brawler?: boolean } = {}) => {
  setTreesDisabled(!opts.trees); setTorchesDisabled(true);
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    enemies: [], projectiles: [], pumpkinBlasts: [], swipeDirection: null,
    inputState: { up: false, down: false, left: false, right: false },
    player: {
      ...st.player, health: 100, maxHealth: 100, invulnerable: false,
      subWeapons: opts.brawler === false ? [] : ['brawler'], subWeaponLevels: opts.brawler === false ? {} : { brawler: 1 },
      lastDirection: { x: -1, y: 0 },
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
/** ゲームループ相当(useGameLoop と同じ式)。 */
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
const br = () => useGameStore.getState().player.brawler;
const pl = () => useGameStore.getState().player;
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
/** レバー(スティック=タッチ・パッドの左スティックが store へ書く欄)。null=離す。 */
const stick = (x: number, y: number) => useGameStore.getState().setSwipeDirection({ x, y }, 1);
const release = () => useGameStore.getState().setSwipeDirection(null);
/** 相手 id の攻撃を受ける(damagePlayer の入口=体当たりと同じ引数)。 */
const hitBy = (id: string, dmg = 30) => {
  const e = en(id);
  return useGameStore.getState().damagePlayer(dmg, 'test', e.x + e.width / 2, e.y + e.height / 2, undefined, false, undefined, id, id);
};
/** 普通に食らった時の被ダメージ(同じ条件・レバーなしで測る)。 */
const plainDamage = (dmg = 30): number => {
  setup();
  useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
  hitBy('z', dmg);
  return 100 - pl().health;
};
const PUSH = BRAWLER_LEVER_GUARD_PUSH_PX * GAME_SPEED;
/** 爆風1つを積んで、その場で解く(combatTick の爆風の合流点)。 */
const resolveBlast = (b: PumpkinBlast) => {
  useGameStore.setState({ pumpkinBlasts: [b] });
  applyPumpkinBlastDamage(NOOP_COMBAT_EFFECTS, { thorOrbitDist: 300, thorCounterLeapMs: 500 });
};

beforeEach(() => {
  now = 7_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  resetPlayerLaunch();
});
afterEach(() => { vi.restoreAllMocks(); setTreesDisabled(false); setTorchesDisabled(false); });

describe('①相手から離れる向きにレバーを入れて食らう: ガード(§12-1c)', () => {
  it('ダメージ半分(切り上げ)・小さく押される(相手から離れる向き・加速→減速)・怯まない・全体の停止なし・被弾無敵は付く・技ポイント+1', () => {
    const full = plainDamage(31);
    expect(full).toBeGreaterThan(1);
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] }); // 相手は左
    const stop0 = useGameStore.getState().hitstopUntil;
    stick(1, 0); // 右=相手から離れる向き
    const x0 = pl().x, y0 = pl().y;
    expect(hitBy('z', 31)).toBe(false);
    expect(100 - pl().health).toBe(brawlerLeverGuardDamage(full));
    expect(100 - pl().health).toBeLessThan(full);
    expect(leverGuardCount(pl())).toBe(1);
    // 怯まない: しゃがみの時計を書かない・操作不能にならない・元の吹き飛びも付かない・全体の停止も張らない
    expect(pl().lastHurtAt ?? 0).toBe(0);
    expect(isHurtMoveLocked(pl(), now)).toBe(false);
    expect((pl().knockbackUntil ?? 0) > now).toBe(false);
    expect(useGameStore.getState().hitstopUntil).toBe(stop0);
    // 被弾無敵は通常どおり(全体+その敵ごと)
    expect(pl().invulnerable).toBe(true);
    expect(pl().iframeBySource?.z).toBe(now);
    expect(br()!.points).toBe(1); // 食らった時の+1(§12-3c)
    expect(br()!.nextStage).toBe(1); // 段のつながりは被弾と同じく切れる
    // 小さい押し: 踏み込みの器 'push'(向きは変えない)
    expect(pl().lungeShape).toBe('push');
    expect(pl().lungeMs).toBe(BRAWLER_LEVER_GUARD_PUSH_MS);
    expect(pl().lungeVx).toBeGreaterThan(0);
    expect(pl().lastDirection).toEqual({ x: -1, y: 0 });
    release(); // 押しだけを測る(離さなければ押しの後に歩き出す)
    const xs: number[] = [];
    const stopG = useGameStore.getState().hitstopUntil;
    for (let i = 0; i < 26; i++) {
      advance(10); xs.push(pl().x - x0);
      if (i === 14) expect(pl().lastDirection).toEqual({ x: -1, y: 0 }); // 押されている間は相手を向いたまま
    }
    expect(Math.abs(pl().y - y0)).toBeLessThan(0.5);
    // ★受けた瞬間の小さな止め: 最初の約50msは自分の体が動かない(世界全体の停止は張らない)。
    expect(BRAWLER_LEVER_GUARD_STOP_MS).toBeGreaterThanOrEqual(40);
    expect(BRAWLER_LEVER_GUARD_STOP_MS).toBeLessThanOrEqual(60);
    expect(Math.abs(xs[3])).toBeLessThan(0.5);
    expect(useGameStore.getState().hitstopUntil).toBe(stopG);
    // 加速→減速: 止め明けの出だしと終わりの1刻みは、一番速い1刻みより小さい
    const step = (i: number) => xs[i] - (i > 0 ? xs[i - 1] : 0);
    const peak = Math.max(...xs.map((_, i) => step(i)));
    expect(step(6)).toBeLessThan(peak * 0.6);
    expect(step(23)).toBeLessThan(peak * 0.6);
    // 押しの尺(止め50ms+160ms)の後は、歩きの慣性の残りで少し滑って止まる。合計は約40px のまま(止めても距離は変わらない)。
    advance(600);
    const total = pl().x - x0;
    expect(total).toBeGreaterThan(PUSH * 0.9);
    expect(total).toBeLessThan(PUSH * 1.1);
    expect(xs[25]).toBeGreaterThan(total * 0.9); // ほとんどは尺の中で押される
    advance(200);
    expect(Math.abs(pl().x - x0 - total)).toBeLessThan(0.3); // 押しが終われば止まる
  });
  it('移動キー(PC)でも同じ・斜め(左右60°まで)でも成立・61°超は不成立', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')], inputState: { up: false, down: false, left: false, right: true } });
    hitBy('z');
    expect(leverGuardCount(pl())).toBe(1);

    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')], inputState: { up: true, down: false, left: false, right: true } }); // 45°
    hitBy('z');
    expect(leverGuardCount(pl())).toBe(1);

    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    stick(Math.cos((65 * Math.PI) / 180), Math.sin((65 * Math.PI) / 180));
    hitBy('z');
    expect(leverGuardCount(pl())).toBe(0);
  });
  it('1度も殴っていない(格闘の状態がまだ無い)体でも成立する', () => {
    setup();
    expect(br()).toBeUndefined();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    stick(1, 0);
    hitBy('z');
    expect(leverGuardCount(pl())).toBe(1);
  });
  it('最低1: ガードしてもダメージ0にはならない', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    stick(1, 0);
    hitBy('z', 1);
    expect(100 - pl().health).toBe(1);
  });
  it('壁(木)で止まる: 押しの先に木があれば越えない', () => {
    setup({ trees: true });
    const c0 = center();
    const t = treesInRegion(c0.x - 600, c0.y - 600, c0.x + 600, c0.y + 600).map(trunkRect)[0];
    expect(t).toBeDefined();
    // 木の幹のすぐ左へ立ち、左の相手に殴られて右(木の方)へ押される
    useGameStore.setState(st => ({ player: { ...st.player, x: t.x - st.player.width - 6, y: t.y + t.height / 2 - st.player.height / 2 } }));
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    stick(1, 0);
    hitBy('z');
    release();
    advance(300);
    expect(pl().x + pl().width).toBeLessThanOrEqual(t.x + 0.01);
  });
  it('腕で受ける影: 受けた直後だけ、構えの腕ガードの影が相手の方を向いて出る(短く)・絵と音の印が出る', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    stick(1, 0);
    hitBy('z');
    const gt = useGameStore.getState().gameTime;
    const f = brawlerStandAt(br(), gt + 40);
    expect(f?.kind).toBe('guard');
    expect(f?.lever).toBe(true);
    expect(br()!.leverGuardDirX).toBeCloseTo(-1); // 相手(左)の方
    expect(brawlerStandAt(br(), gt + BRAWLER_LEVER_GUARD_STAND_MS)).toBeNull(); // 短い(150〜200ms)
    expect(BRAWLER_LEVER_GUARD_STAND_MS).toBeLessThanOrEqual(200);
    expect(f?.armPush ?? 0).toBeLessThan(0); // 受けた瞬間に体の方へ押し込まれている
    const fx = useGameStore.getState().effects;
    // 受けた面の弧(相手の側だけ)・全周の輪は出さない・散る粒は出さない
    expect(fx.some(e => JSON.stringify(e).includes('fx/slash-arc'))).toBe(true);
    expect(fx.some(e => e.kind === 'ring')).toBe(false);
    expect(fx.some(e => e.kind === 'particle')).toBe(false);
    expect(fx.filter(e => JSON.stringify(e).includes('vfx/spark_04')).length).toBe(1); // 稲妻は1本
    expect(fx.some(e => (e as { text?: string }).text === 'Counter!')).toBe(false); // カウンターの文字は出さない
    expect(fx.some(e => (e as { tex?: string; texture?: string }).tex === 'vfx/spark_04' || (e as { texture?: string }).texture === 'vfx/spark_04' || JSON.stringify(e).includes('vfx/spark_04'))).toBe(true);
    expect(fx.some(e => JSON.stringify(e).includes('fx/dust-puff'))).toBe(true); // 足元は砂埃
    expect(fx.some(e => JSON.stringify(e).includes('fx/dash-wind'))).toBe(false); // 白い筋は使わない
    expect(useGameStore.getState().timeSlowUntil ?? 0).toBeLessThanOrEqual(now); // スローなし
  });
});

describe('②成立しない場面: 普通に食らう', () => {
  const expectPlain = (dmg = 30) => {
    expect(leverGuardCount(pl())).toBe(0);
    expect(pl().lastHurtAt).toBe(now); // 怯む
    expect(pl().lungeShape).not.toBe('push');
    return 100 - pl().health >= dmg * 0.5 + 0.001;
  };
  it('逆向き(相手の方へ入れている)・横向き', () => {
    const full = plainDamage();
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    stick(-1, 0);
    hitBy('z');
    expectPlain();
    expect(100 - pl().health).toBe(full);

    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    stick(0, 1);
    hitBy('z');
    expectPlain();
    expect(100 - pl().health).toBe(full);
  });
  it('レバーなし', () => {
    const full = plainDamage();
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    hitBy('z');
    expectPlain();
    expect(100 - pl().health).toBe(full);
  });
  it('格闘を持っていない', () => {
    setup({ brawler: false });
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    stick(1, 0);
    hitBy('z');
    expect(leverGuardCount(pl())).toBe(0);
    expect(pl().lastHurtAt).toBe(now);
  });
  it('動作の最中(通常攻撃)', () => {
    const full = plainDamage();
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    expect(useGameStore.getState().brawlerPress()).toBe(true);
    advance(20);
    expect(br()!.phase).toBe('attack');
    stick(1, 0);
    hitBy('z');
    expectPlain();
    expect(100 - pl().health).toBe(full);
  });
  it('動作の最中(技=気功)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    useGameStore.getState().brawlerPress(); advance(700);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 5 } } }));
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    advance(10);
    expect(br()!.phase).toBe('tech');
    stick(1, 0);
    hitBy('z');
    expectPlain();
  });
  it('動作の最中(ステップ)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    expect(useGameStore.getState().brawlerStep(1, 0)).toBe(true);
    advance(30);
    stick(1, 0);
    hitBy('z');
    expectPlain();
  });
  it('動作の最中(秘奥義)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    useGameStore.getState().brawlerPress(); advance(700);
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, secret: { phase: 'strike', phaseAt: gt, hits: 1, nextAt: gt + 99999, igniteAt: now } } } }));
    stick(1, 0);
    const hp0 = pl().health;
    hitBy('z');
    expect(leverGuardCount(pl())).toBe(0);
    void hp0;
  });
  it('怯み(しゃがみ)の最中は張れない・ガードの小さい押しの最中は続けて張れる', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z'), enemyAt('zombie', -70, 0, 'z2')] });
    hitBy('z'); // 普通に食らう → 怯み
    expect(isHurtMoveLocked(pl(), now)).toBe(true);
    stick(1, 0);
    hitBy('z2');
    expect(leverGuardCount(pl())).toBe(0);

    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z'), enemyAt('zombie', -70, 0, 'z2')] });
    stick(1, 0);
    hitBy('z');
    advance(50);
    expect((pl().lungeUntil ?? 0) > now).toBe(true); // 押されている最中
    hitBy('z2'); // 別の敵(敵ごとの被弾無敵)
    expect(leverGuardCount(pl())).toBe(2);
  });
  it('相手の位置が分からない被弾', () => {
    const full = plainDamage();
    setup();
    stick(1, 0);
    useGameStore.getState().damagePlayer(30, 'test'); // 向きも相手も無い
    expect(leverGuardCount(pl())).toBe(0);
    expect(100 - pl().health).toBe(full);
    expect(pl().lastHurtAt).toBe(now);

    setup();
    stick(1, 0);
    const c = center();
    useGameStore.getState().damagePlayer(30, 'test', c.x, c.y); // 被弾の点が自分の中心=向きが取れない
    expect(leverGuardCount(pl())).toBe(0);
  });
  it('持続ダメージ(延焼)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    stick(1, 0);
    const e = en('z');
    useGameStore.getState().damagePlayer(30, 'test', e.x + e.width / 2, e.y + e.height / 2, undefined, false, undefined, 'z', undefined, undefined, { dot: true });
    expect(leverGuardCount(pl())).toBe(0);
    expect(pl().lungeShape).not.toBe('push');
    expect(100 - pl().health).toBe(30);
  });
  it('被弾無敵で弾かれた攻撃は、ガードにも数えない(絵も押しも出ない)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    stick(1, 0);
    hitBy('z');
    const hp = pl().health;
    advance(300);
    hitBy('z'); // 同じ敵=1秒の被弾無敵
    expect(pl().health).toBe(hp);
    expect(leverGuardCount(pl())).toBe(1);
  });
});

describe('④今あるカウンターが先・レバーガードは後(社長「ガード中も赤カウンターは狙えるように」)', () => {
  const guardNow = (points = 3) => {
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...(st.player.brawler ?? ({} as never)), points } } }));
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    advance(20);
    expect(isBrawlerGuarding(pl(), useGameStore.getState().gameTime)).toBe(true);
  };
  const shoot = (dirX: number, ownerId?: string, ownerType?: EnemyType) => {
    const c = center();
    const proj = {
      id: `ep-${now}`, x: c.x - 4, y: c.y - 4, width: 8, height: 8, speed: 300, damage: 20,
      direction: { x: dirX, y: 0 }, weaponType: 'handgun', hostile: true, reflected: false, passthrough: false, hitEnemies: [], duration: 5000, createdAt: now, critChance: 0,
      ...(ownerId !== undefined ? { ownerId } : {}), ...(ownerType !== undefined ? { ownerType } : {}),
    } as unknown as Projectile;
    useGameStore.setState({ projectiles: [proj] });
    applyEnemyProjectileHits(now, pl(), false, 0, useGameStore.getState().gameTime, NOOP_COMBAT_EFFECTS, { grenadeBlastRadius: 0, grenadeBlastDamageMult: 0, counterReflectSlowMs: 0 });
  };
  it('構えの最中は構えが優先(ダメージ0・ガードには数えない)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', -60, 0, 'h')] });
    useGameStore.getState().brawlerPress(); advance(700);
    guardNow(3);
    stick(1, 0);
    expect(hitBy('h')).toBe(false);
    expect(pl().health).toBe(100);
    expect(leverGuardCount(pl())).toBe(0);
    expect(pl().lastCounterSuccessTime).toBe(now); // 構えの成立
  });
  it('レバーを後ろへ入れたまま、カウンターの窓の中で赤い攻撃(弾)を受けるとカウンターが成立する(ガードにならない・ダメージ0)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -300, 0, 'z')] });
    stick(1, 0);
    useGameStore.setState(st => ({ player: { ...st.player, counterWindowStart: now, counterWindowEnd: now + 300 } }));
    shoot(1, 'z', 'zombie');
    expect(pl().health).toBe(100);
    expect(leverGuardCount(pl())).toBe(0);
    const p = useGameStore.getState().projectiles[0];
    expect(p?.reflected).toBe(true); // 打ち返した
  });
  it('レバーを後ろへ入れたまま、カウンターの窓の中で赤い攻撃(爆風)を受けるとカウンターが成立する(ガードにならない・ダメージ0)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -40, 0, 'z')] });
    stick(1, 0);
    useGameStore.setState(st => ({ player: { ...st.player, counterWindowStart: now, counterWindowEnd: now + 300 } }));
    const c = center();
    const blast = { enemyId: 'z', x: c.x - 40, y: c.y, radius: 90, damage: 30 } as PumpkinBlast;
    resolveBlast(blast);
    expect(pl().health).toBe(100);
    expect(leverGuardCount(pl())).toBe(0);
  });
  it('ガードで受けてもカウンターの窓は閉じない(普通の被弾は閉じる)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    useGameStore.setState(st => ({ player: { ...st.player, counterWindowStart: now, counterWindowEnd: now + 500 } }));
    stick(1, 0);
    hitBy('z');
    expect(leverGuardCount(pl())).toBe(1);
    expect(pl().counterWindowEnd).toBe(now + 500);

    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    useGameStore.setState(st => ({ player: { ...st.player, counterWindowStart: now, counterWindowEnd: now + 500 } }));
    hitBy('z');
    expect(pl().counterWindowEnd).toBe(0);
  });
  it('ガードで押されている最中に出したカウンター(構え)が、次の攻撃に成立する・押しは止まらず押され切る', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', -60, 0, 'h'), enemyAt('hunter', -80, 0, 'h2')] });
    useGameStore.getState().brawlerPress(); advance(700);
    stick(1, 0);
    const x0 = pl().x;
    hitBy('h');
    expect(leverGuardCount(pl())).toBe(1);
    release();
    advance(40);
    expect((pl().lungeUntil ?? 0) > now).toBe(true); // 押されている最中
    const hp = pl().health;
    guardNow(3); // 押しの最中でも構えを出せる(入力を塞がない)
    expect(pl().lungeShape).toBe('push'); // 構えを出しても押しの器は残る(1フレームで止まらない)
    advance(60);
    hitBy('h2');
    expect(pl().health).toBe(hp); // 次の攻撃は構えで受けた(ダメージ0)
    expect(pl().lastCounterSuccessTime).toBe(now);
    expect(leverGuardCount(pl())).toBe(1); // ガードには数えない
    void x0;
  });
  it('ガードで押されている最中でも通常攻撃を出せる(攻撃の禁止を足さない)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    stick(1, 0);
    hitBy('z');
    release();
    advance(40);
    expect(useGameStore.getState().brawlerPress()).toBe(true);
    advance(10);
    expect(br()!.phase).toBe('attack');
  });
});

describe('⑤弾・爆発・掴み', () => {
  const shoot = (dir: { x: number; y: number }, ownerId?: string, ownerType?: EnemyType) => {
    const c = center();
    const proj = {
      id: `ep-${now}`, x: c.x - 4, y: c.y - 4, width: 8, height: 8, speed: 300, damage: 20,
      direction: dir, weaponType: 'handgun', hostile: true, reflected: false, passthrough: false, hitEnemies: [], duration: 5000, createdAt: now, critChance: 0,
      ...(ownerId !== undefined ? { ownerId } : {}), ...(ownerType !== undefined ? { ownerType } : {}),
    } as unknown as Projectile;
    useGameStore.setState({ projectiles: [proj] });
    applyEnemyProjectileHits(now, pl(), false, 0, useGameStore.getState().gameTime, NOOP_COMBAT_EFFECTS, { grenadeBlastRadius: 0, grenadeBlastDamageMult: 0, counterReflectSlowMs: 0 });
  };
  it('弾: 飛んできた向きの逆(=撃ち主の側から離れる向き)に入れていればガード・弾は消える', () => {
    setup();
    shoot({ x: 1, y: 0 }); // 普通に食らう量
    const full = 100 - pl().health;
    expect(full).toBeGreaterThan(1);

    setup();
    stick(1, 0);
    shoot({ x: 1, y: 0 }); // 左から右へ飛んできた弾・レバーは右
    expect(leverGuardCount(pl())).toBe(1);
    expect(100 - pl().health).toBe(brawlerLeverGuardDamage(full));
    expect(pl().lungeShape).toBe('push');
    expect(pl().lungeVx).toBeGreaterThan(0);
    expect(useGameStore.getState().projectiles.length).toBe(0); // 弾は今の被弾と同じく消える
  });
  it('弾: 向きは弾の飛んできた向きで見る(撃ち主が反対側へ回っていても)・弾へ向かって入れていたら食らう', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 300, 0, 'z')] }); // 撃ち主はいま右に居る
    stick(1, 0);
    shoot({ x: 1, y: 0 }, 'z', 'zombie'); // でも弾は左から右へ飛んできた
    expect(leverGuardCount(pl())).toBe(1);

    setup();
    stick(-1, 0);
    shoot({ x: 1, y: 0 });
    expect(leverGuardCount(pl())).toBe(0);
    expect(pl().lastHurtAt).toBe(now);
  });
  it('爆発: 爆心から離れる向きでガード・爆風の大きな吹き飛ばしは小さい押しに置き換わる', () => {
    const blastAt = (dx: number): PumpkinBlast => { const c = center(); return { enemyId: 'z', x: c.x + dx, y: c.y, radius: 120, damage: 30 } as PumpkinBlast; };
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 200, 200, 'z')] });
    resolveBlast(blastAt(-50));
    const full = 100 - pl().health;
    expect((pl().knockbackUntil ?? 0) > now).toBe(true); // 普通は爆風で吹き飛ぶ

    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 200, 200, 'z')] }); // 持ち主は別の所(右下)に居る=向きは爆心で見る
    stick(1, 0);
    resolveBlast(blastAt(-50));
    expect(leverGuardCount(pl())).toBe(1);
    expect(100 - pl().health).toBe(brawlerLeverGuardDamage(full));
    expect((pl().knockbackUntil ?? 0) > now).toBe(false); // 爆風の押し出しは書かれない
    expect(pl().lungeShape).toBe('push');
    expect(pl().lungeVx).toBeGreaterThan(0);
    expect(pl().lastHurtAt ?? 0).toBe(0);

    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 200, 200, 'z')] });
    stick(-1, 0); // 爆心の方へ
    resolveBlast(blastAt(-50));
    expect(leverGuardCount(pl())).toBe(0);
    expect((pl().knockbackUntil ?? 0) > now).toBe(true);
  });
  it('掴み・演出つきの技: 半減だけ(押し・怯みは今どおり)', () => {
    const full = plainDamage();
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    stick(1, 0);
    const e = en('z');
    useGameStore.getState().damagePlayer(30, 'test', e.x + e.width / 2, e.y + e.height / 2, undefined, false, undefined, 'z', 'z', undefined, { leverGuard: 'damageOnly' });
    expect(100 - pl().health).toBe(brawlerLeverGuardDamage(full));
    expect(pl().lastHurtAt).toBe(now);                 // 怯みは今どおり
    expect((pl().knockbackUntil ?? 0) > now).toBe(true); // 元の押しも今どおり
    expect(pl().lungeShape).not.toBe('push');
    expect(leverGuardCount(pl())).toBe(1);             // 受けた絵と音は出す

    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    stick(1, 0);
    const e2 = en('z');
    useGameStore.getState().damagePlayer(30, 'test', e2.x + e2.width / 2, e2.y + e2.height / 2, undefined, false, 'brawler-secret', 'z', 'z'); // 拳鬼の秘奥義
    expect(100 - pl().health).toBe(brawlerLeverGuardDamage(full));
    expect(pl().lastHurtAt).toBe(now);
  });
  it('掴まれている最中は張れない', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', -60, 0, 'z')] });
    useGameStore.setState(st => ({ player: { ...st.player, grabbedUntil: st.gameTime + 1000 } }));
    stick(1, 0);
    hitBy('z');
    expect(leverGuardCount(pl())).toBe(0);
  });
});

describe('③打ち上げの技をガードすると浮かない(拳鬼の3・4段目/跳びかかりの着地)', () => {
  const START_GT = 10_000_000;
  const ORIGIN = 50_000;
  const kenki = (offsetX: number, lever: boolean) => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('rogue');
    const k = uniquePhantomSpec('brawler');
    setPhantomIdentity({ name: k.name, profile: k.profile, source: 'unique' });
    const e = spawnEnemyAt('guardian-phantom', ORIGIN, ORIGIN, START_GT);
    Object.assign(e, { phantomUnique: 'brawler', phantomBuild: k.profile.snapshot, health: 130, maxHealth: 130, dormant: false, bossState: 'chase' });
    useGameStore.setState(s => ({
      enemies: [e], projectiles: [], gameTime: START_GT, swipeDirection: lever ? { x: 1, y: 0 } : null, swipeStrength: 1,
      inputState: { up: false, down: false, left: false, right: false },
      player: {
        ...s.player, x: e.x + e.width / 2 + offsetX, y: e.y + e.height / 2 - s.player.height / 2, health: 99999, maxHealth: 99999, invulnerable: false, invulnerableTime: 0,
        subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 },
      },
    }));
    let gt = START_GT;
    const st = createPhantomTickState();
    const step = (ms: number): void => {
      gt += ms; now += ms;
      useGameStore.setState({ gameTime: gt });
      const cur = useGameStore.getState().enemies.find(x => x.id === e.id);
      if (cur) runPhantomTick(cur, st, gt, ms / 1000, 1, gt, NOOP_PHANTOM_SFX, () => 0.999);
    };
    // 拳鬼の tick の「いま」(打ち上げの打刻もこの時計)。
    return { id: e.id, step, gt: () => gt, cur: () => useGameStore.getState().enemies.find(x => x.id === e.id)! };
  };
  /** 拳鬼の3段目か4段目が当たるまで回し、その間にプレイヤーの絵が浮いたかを返す。 */
  const runCombo = (lever: boolean) => {
    // ★ガードで防がれた攻撃は「当たっていない」扱い=台本がそこで打ち切られる(検収監査2026-11-10)ので、1・2段目は普通に食らい、
    //   3段目(か4段目)の溜めに入ってからレバーを入れる(怯みが明けて動ける体になった所でガードする、の再現)。
    const h = kenki(40, false); // 拳鬼は左・プレイヤーは右=離れる向きは右
    let launched = false, upperLanded = false;
    for (let i = 0; i < 400 && !upperLanded; i++) {
      const b0 = h.cur().phantomBrawler;
      if (lever && b0 && b0.phase === 'attack' && b0.stage >= 3 && !b0.resolved) {
        useGameStore.setState(st => ({
          swipeDirection: { x: 1, y: 0 }, swipeStrength: 1,
          player: { ...st.player, lastHurtAt: undefined, knockbackUntil: 0 }, // 怯み・吹き飛びは明けている
        }));
      }
      h.step(16);
      const b = h.cur().phantomBrawler;
      if (b0 && b && (b.stage === 3 || b.stage === 4) && !b0.resolved && b.resolved && b.connected) upperLanded = true;
      if (playerLaunchHeightPx(h.gt() + 150, 60) > 0) launched = true;
    }
    return { launched, upperLanded, guards: leverGuardCount(pl()), hp: pl().health };
  };
  it('拳鬼の3・4段目: レバーなしなら絵が浮く / 相手から離れる向きに入れていれば浮かない(体力は半分減る)', () => {
    const plain = runCombo(false);
    expect(plain.upperLanded).toBe(true);
    expect(plain.launched).toBe(true);
    expect(plain.guards).toBe(0);

    resetPlayerLaunch();
    const guarded = runCombo(true);
    expect(guarded.upperLanded).toBe(true);
    expect(guarded.guards).toBeGreaterThan(0);
    expect(guarded.launched).toBe(false);
    expect(guarded.hp).toBeLessThan(99999);     // 体力は減る(半減)
    expect(guarded.hp).toBeGreaterThan(plain.hp); // 普通に食らうより軽い(3段目が半分)
  });
  /** 跳びかかりを着地まで回す。跳んでいる間にプレイヤーを着地点から右へずらす(=爆心から離れる向きが右になる)。 */
  const runLeap = (lever: boolean) => {
    const h = kenki(400, lever);
    h.step(16);
    const gt0 = useGameStore.getState().gameTime;
    useGameStore.setState(s => ({ enemies: s.enemies.map(x => x.id === h.id ? { ...x, aiPhase: 'crouch', aiPhaseUntil: gt0 + 400 } : x) }));
    let guard = 0;
    while (h.cur().aiPhase === 'crouch' && guard++ < 400) h.step(16);
    expect(h.cur().aiPhase).toBe('jump');
    useGameStore.setState(s => ({ player: { ...s.player, x: s.player.x + 40 } }));
    const hp0 = pl().health;
    let launched = false;
    guard = 0;
    while (h.cur().aiPhase === 'jump' && guard++ < 4000) { h.step(4); if (playerLaunchHeightPx(h.gt() + 150, 60) > 0) launched = true; }
    if (playerLaunchHeightPx(h.gt() + 150, 60) > 0) launched = true;
    return { launched, lost: hp0 - pl().health, guards: leverGuardCount(pl()), kb: (pl().knockbackUntil ?? 0) > now };
  };
  it('跳びかかりの着地: レバーなしなら絵が浮く / 着地点から離れる向きに入れていれば浮かない・ダメージ半分・小さい押し', () => {
    const plain = runLeap(false);
    expect(plain.lost).toBeGreaterThan(0);
    expect(plain.launched).toBe(true);

    resetPlayerLaunch();
    const guarded = runLeap(true);
    expect(guarded.guards).toBe(1);
    expect(guarded.lost).toBe(brawlerLeverGuardDamage(plain.lost));
    expect(guarded.launched).toBe(false);
    expect(pl().lungeShape).toBe('push');
    expect(pl().lungeVx).toBeGreaterThan(0);
  });
});
