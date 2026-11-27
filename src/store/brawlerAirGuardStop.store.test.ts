// ★空中の構えの門(§39)と止めの間の落下(社長指示2026-11-27)。実際のストアを実機の刻み(16ms・係数1.3)で回す(進め方は brawlerTrack.store.test.ts と同じ)。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setKenkiLevelForTest } from '../utils/kenkiLevel';
import { setBrawlerTempoAll, brawlerAirborne, brawlerJuggleHeightRel, brawlerJugglePush, brawlerStopLiftShift } from '../utils/brawlerCombo';
import {
  BRAWLER_TEMPO_DEFAULT, initialBrawlerState, brawlerSelfHeightPx, brawlerInHitstop, BRAWLER_KICK2_AIR_PX, brawlerAirBlocksGuard, brawlerPalmContact,
  BRAWLER_PALM_FIST_REACH_PX, BRAWLER_PALM_PASS_PX, type BrawlerState,
} from '../utils/brawler';
import { resetAirMeleeHit } from '../utils/playerAirFollow';

const NO = { up: false, down: false, left: false, right: false } as never;
const FRAME = 16;
let now = 7_000_000;

const setup = (o: { skills?: string[]; points?: number } = {}) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: {
      ...st.player, health: 99999, maxHealth: 99999, invulnerable: false, skills: (o.skills ?? []) as never, skillLevels: {},
      subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 }, lastDirection: { x: 1, y: 0 }, brawler: { ...initialBrawlerState(), points: o.points ?? 20 },
    },
  }));
};
const pc = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, id: string, extra: Partial<Enemy> = {}, dy = 0): Enemy => {
  const c = pc();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 9_999_999, maxHealth: 9_999_999, dormant: false, ...extra } as Enemy;
};
const en = (id = 'z') => useGameStore.getState().enemies.find(x => x.id === id)!;
const br = (): BrawlerState => useGameStore.getState().player.brawler!;
const gt = () => useGameStore.getState().gameTime;
const selfH = () => brawlerSelfHeightPx(br(), gt());
let input: typeof NO = NO;
const adv = (onStep?: () => void) => {
  now += FRAME;
  if (now < useGameStore.getState().hitstopUntil) { onStep?.(); return; } // 画面全体の止め(掴み)=壁時計だけ進む(実機のループと同じ)
  useGameStore.getState().setGameTime(gt() + FRAME);
  useGameStore.getState().movePlayer(input, FRAME / 1000);
  useGameStore.getState().tickBrawler();
  useGameStore.getState().updateEnemies(FRAME / 1000);
  onStep?.();
};

/** 区分ごとの相手(雑魚=ゾンビ・強個体=削岩型の溜めの相・ボス級=ハンターの溜めの相)。 */
type Cls = 'mob' | 'strong' | 'boss';
const CLS: readonly Cls[] = ['mob', 'strong', 'boss'];
const spawnCls = (cls: Cls, dx = 60): void => {
  const g = gt();
  const e = cls === 'mob' ? place('zombie', dx, 'z')
    : cls === 'strong' ? place('driller', dx, 'z', { aiPhase: 'driller-thrust-windup', aiPhaseUntil: g + 60_000, aiStartedAt: g } as Partial<Enemy>)
      : place('hunter', dx, 'z', { aiPhase: 'windup', aiPhaseUntil: g + 60_000, aiStartedAt: g } as Partial<Enemy>);
  useGameStore.setState({ enemies: [e] });
};

/** 入力。P=通常攻撃 / K=右フリック(飛び蹴り) / D=下(踵落とし・地割り) / U=上(蹴り上げ) / L=左(気功)。 */
type In = 'P' | 'K' | 'D' | 'U' | 'L';
const FL: Record<Exclude<In, 'P'>, [number, number]> = { K: [1, 0], D: [0, 1], U: [0, -1], L: [-1, 0] };
const press = (i: In): boolean => (i === 'P' ? useGameStore.getState().brawlerPress() : useGameStore.getState().brawlerTech(FL[i][0], FL[i][1]));

// ---------------------------------------------------------------------------------------------
// ★社長指示2026-11-27「コンボ中に空中で構えが出せちゃってる」: 構えは地上のみ(§39)。空中(跳び・滞空・落下)ではどの経路でも出さない・覚えない。
// ★社長指示2026-11-27「ストップ時、落下が止まってない。なので落ちてから吹っ飛んでる」: 止めの間は落ちない(自分も相手も)。
// ---------------------------------------------------------------------------------------------
beforeEach(() => {
  now = 7_000_000;
  input = NO;
  setBrawlerTempoAll(1.3);
  setKenkiLevelForTest(5);
  resetAirMeleeHit();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); setKenkiLevelForTest(null); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

const isGuard = () => br().phase === 'tech' && br().tech === 'guard';
/** 空中にいる間ずっと構え(と密着の構えの掴み)が出ないこと・着地まで回す。 */
const runToLandNoGuard = (label: string) => {
  for (let k = 0; k < 200 && (br().phase !== 'idle' || selfH() > 0); k++) {
    adv();
    expect(isGuard(), `${label}: 構えは出ない`).toBe(false);
    expect(br().contactGrab, `${label}: 密着の構えも出ない`).toBeUndefined();
  }
  expect(selfH()).toBe(0);
  for (let k = 0; k < 10; k++) { adv(); expect(isGuard(), `${label}: 着地しても覚えた構えは出ない`).toBe(false); }
};
const toHover = (cls: Cls = 'mob') => {
  setup();
  spawnCls(cls, 80);
  expect(press('K')).toBe(true);
  for (let k = 0; k < 60 && !br().resolved; k++) adv();
  expect(press('K')).toBe(true);
  for (let k = 0; k < 60 && !(br().kickN === 2 && br().resolved); k++) adv();
  expect(br().kickN).toBe(2);
};

describe('§39 構えは空中では出ない(どの経路でも・押しは捨てる)', () => {
  it('門の純関数: 空中の構えだけ止める(蹴り上げ・地上の構えは通す)', () => {
    const air = { ...initialBrawlerState(), airFall: { fromPx: 40, v0: 0, at: 1000 } };
    expect(brawlerAirBlocksGuard(air, 1000, 'guard')).toBe(true);
    expect(brawlerAirBlocksGuard(air, 1000, 'guard', true), '蹴り上げは空中で出せる').toBe(false);
    expect(brawlerAirBlocksGuard(air, 1000, 'kick')).toBe(false);
    expect(brawlerAirBlocksGuard(initialBrawlerState(), 1000, 'guard'), '地上').toBe(false);
  });
  for (const cls of CLS) {
    it(`${cls}: 蹴り上げを体得していない時の「空中蹴りの後の上」は何も起きない(滞空中・落下中とも)。着地後の上は今どおり構え`, () => {
      setKenkiLevelForTest(1); // 体得していない(レベル1=踵落とし・蹴り上げ・土竜とも未体得)
      toHover(cls);
      expect(selfH()).toBeGreaterThan(BRAWLER_KICK2_AIR_PX - 10);
      expect(press('U'), '滞空中の上').toBe(false);
      expect(br().techBuffer, '覚えない').toBeUndefined();
      // 滞空が明けて落ちている間
      for (let k = 0; k < 200 && br().phase !== 'idle'; k++) { adv(); expect(isGuard()).toBe(false); }
      expect(selfH(), 'まだ空中(落下中)').toBeGreaterThan(0.5);
      expect(press('U'), '落下中の上').toBe(false);
      expect(br().techBuffer).toBeUndefined();
      runToLandNoGuard(cls);
      expect(press('U'), '着地後の上').toBe(true);
      expect(isGuard() || br().contactGrab !== undefined).toBe(true);
    });
  }
  it('飛び蹴り1発目の跳びの最中に入れた上(判定の前の先行入力・判定の後の覚え)は捨てる=着地しても構えにならない', () => {
    setKenkiLevelForTest(1); // 体得していない(レベル1=踵落とし・蹴り上げ・土竜とも未体得)
    for (const when of ['before', 'after'] as const) {
      setup();
      spawnCls('mob', 80);
      expect(press('K')).toBe(true);
      for (let k = 0; k < 60 && (when === 'before' ? selfH() < 10 : !br().resolved); k++) adv();
      expect(selfH(), when).toBeGreaterThan(0.5);
      expect(press('U'), when).toBe(false);
      expect(br().techBuffer, when).toBeUndefined();
      runToLandNoGuard(`1発目・${when}`);
    }
  });
  it('蹴り上げを体得していても、蹴り上げに成れない空中の上(払えない)は構えにならない', () => {
    setup({ points: 3 });
    spawnCls('mob', 80);
    expect(press('K')).toBe(true);
    for (let k = 0; k < 60 && !br().resolved; k++) adv();
    expect(press('K')).toBe(true);
    for (let k = 0; k < 60 && !(br().kickN === 2 && br().resolved); k++) adv();
    expect(press('U')).toBe(false);
    runToLandNoGuard('払えない上');
  });
  it('蹴り上げ(体得済み・払える)は今どおり空中で出る', () => {
    toHover();
    for (let k = 0; k < 20 && brawlerInHitstop(br(), gt()); k++) adv();
    expect(press('U')).toBe(true);
    expect(br().kickUp).toBe(true);
  });
});

describe('止めの間は落ちない(自分も相手も・明けたら止めた所から続く)', () => {
  /** 止めの間の相手の高さ(倍率)と自分の高さを 16ms おきに記録する。 */
  const traceStop = (label: string) => {
    const z = () => en('z');
    const stopUntil = z().hitStunUntil ?? 0;
    expect(stopUntil, `${label}: 止めが掛かった`).toBeGreaterThan(now);
    const rel0 = brawlerJuggleHeightRel(z(), now);
    const self0 = selfH();
    let frames = 0;
    while (now + FRAME < stopUntil && frames < 40) {
      adv();
      frames++;
      expect(brawlerJuggleHeightRel(z(), now), `${label}: 止めの間に相手の高さが変わらない(${frames}コマ目)`).toBeCloseTo(rel0, 6);
      if (brawlerInHitstop(br(), gt())) expect(selfH(), `${label}: 止めの間は自分の高さも変わらない`).toBeCloseTo(self0, 6);
    }
    expect(frames).toBeGreaterThan(0);
    return rel0;
  };
  it('浮いた雑魚に5段目(叩き落とし)を当てると、止めの間はその高さのまま・明けてから落ちながら吹き飛ぶ', () => {
    setup();
    spawnCls('mob', 60);
    // 相手を4段目の浮きで浮かせた所(頂点の手前)に置き、5段目を出せる状態から5段目を出す。
    const lift = brawlerJugglePush(en('z'), 'mob', 's4', now)!;
    useGameStore.setState(st => ({
      enemies: st.enemies.map(e => ({ ...e, ...lift } as Enemy)),
      player: { ...st.player, brawler: { ...st.player.brawler!, phase: 'idle', tech: null, nextStage: 5, chainUntil: gt() + 5000 } },
    }));
    expect(brawlerAirborne(en('z'), now)).toBe(true);
    expect(press('P')).toBe(true);
    expect(br().stage).toBe(5);
    for (let k = 0; k < 160 && !br().resolved; k++) adv();
    expect(brawlerAirborne(en('z'), now), '5段目は浮いた相手に当たった').toBe(true);
    expect(en('z').brLiftDown).toBe(true);
    const rel0 = traceStop('5段目');
    expect(rel0).toBeGreaterThan(0);
    for (let k = 0; k < 6; k++) adv();
    expect(brawlerJuggleHeightRel(en('z'), now), '明けたら落ちる').toBeLessThan(rel0);
  });
  it('飛び蹴り3連の3発目(蹴り飛ばし)で浮いた相手を叩き落とす時も、止めの間は落ちない', () => {
    toHover();
    for (let k = 0; k < 40 && brawlerInHitstop(br(), gt()); k++) adv();
    expect(press('K')).toBe(true);
    for (let k = 0; k < 60 && !(br().kickN === 3 && br().resolved); k++) adv();
    expect(br().kickN).toBe(3);
    if (brawlerAirborne(en('z'), now)) traceStop('蹴り飛ばし');
  });
  it('空中蹴り(2発目)の当たりの止めの間は、自分の高さも変わらない', () => {
    setup();
    spawnCls('mob', 80);
    expect(press('K')).toBe(true);
    for (let k = 0; k < 60 && !br().resolved; k++) adv();
    expect(press('K')).toBe(true);
    for (let k = 0; k < 60 && !(br().kickN === 2 && br().resolved); k++) adv();
    expect(brawlerInHitstop(br(), gt())).toBe(true);
    const h0 = selfH();
    for (let k = 0; k < 40 && brawlerInHitstop(br(), gt()); k++) { adv(); if (brawlerInHitstop(br(), gt())) expect(selfH()).toBeCloseTo(h0, 6); }
  });
});

describe('止める瞬間=当たった瞬間(5段目: 拳が最初の相手の体に届いた所で止まる・社長指示2026-11-27)', () => {
  it('純関数: 拳の先(進んだ距離+届き)が相手の体の手前の縁に届いた時だけ、一番手前の相手を返す', () => {
    const e = { ...spawnEnemyAt('zombie', 0, 0, 0), id: 'a' } as Enemy;
    const a = { ...e, x: 100 - e.width / 2, y: -e.height / 2 } as Enemy; // 中心(100,0)
    const b = { ...e, id: 'b', x: 160 - e.width / 2, y: -e.height / 2 } as Enemy;
    const edge = 100 - e.width / 2;
    expect(brawlerPalmContact([a, b], ['a', 'b'], 0, 0, 1, 0, edge - BRAWLER_PALM_FIST_REACH_PX - 1)).toBeNull();
    expect(brawlerPalmContact([a, b], ['a', 'b'], 0, 0, 1, 0, edge - BRAWLER_PALM_FIST_REACH_PX)).toBe('a');
    expect(brawlerPalmContact([a, b], ['b'], 0, 0, 1, 0, 300)).toBe('b');
  });
  it('純関数(止めの間の落下): 前から続く浮きは延びた止めの分・この当たりの浮きは止めの全部をずらす。浮いていなければ何もしない', () => {
    const lift = { brawlerLiftAt: 900, brLiftUntil: 1400, liftUntil: 1400 };
    expect(brawlerStopLiftShift(lift, 1000, 1050, 1100)).toEqual({ brawlerLiftAt: 950, brLiftUntil: 1450, liftUntil: 1450 });
    expect(brawlerStopLiftShift({ brawlerLiftAt: 1000, brLiftUntil: 1300, liftUntil: 1300 }, 1000, undefined, 1100)).toEqual({ brawlerLiftAt: 1100, brLiftUntil: 1400, liftUntil: 1400 });
    expect(brawlerStopLiftShift({ brawlerLiftAt: 500, brLiftUntil: 800 }, 1000, undefined, 1100), '着地済み').toBeNull();
    expect(brawlerStopLiftShift(lift, 1000, undefined, 1000), '止めなし').toBeNull();
  });
  for (const lifted of [false, true]) {
    it(`${lifted ? '落ちてくる相手' : '地上の相手'}: 拳が届いた瞬間に自分も相手も止まり、止めの間は進まない・明けたら残りを抜ける(距離は同じ)`, () => {
      setup();
      spawnCls('mob', 110);
      if (lifted) {
        // 4段目の浮きの落ちる途中(当たる高さの帯の内)に置く
        const l0 = brawlerJugglePush(en('z'), 'mob', 's4', now)!;
        const l = brawlerJugglePush(en('z'), 'mob', 's4', now - Math.round((l0.brLiftMs ?? 0) * 0.55))!;
        useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, ...l } as Enemy)) }));
        expect(brawlerAirborne(en('z'), now)).toBe(true);
      }
      useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, phase: 'idle', tech: null, nextStage: 5, chainUntil: gt() + 5000 } } }));
      expect(press('P')).toBe(true);
      for (let k = 0; k < 60 && !br().resolved; k++) adv();
      expect(br().palmContactAt, '拳が届いた瞬間に当たった').toBeDefined();
      const z = en('z');
      const x0 = br().palmFromX!;
      const atHit = pc().x;
      // 拳の先が相手の体の手前の縁にある(通り過ぎていない)
      expect(atHit + BRAWLER_PALM_FIST_REACH_PX).toBeGreaterThanOrEqual(z.x - 1);
      expect(atHit).toBeLessThan(z.x + z.width / 2);
      expect((z.hitStunUntil ?? 0) > now, '相手も止まる').toBe(true);
      const rel0 = brawlerJuggleHeightRel(z, now);
      // 止めの間は自分も進まず、相手の高さも変わらない
      for (let k = 0; k < 40 && brawlerInHitstop(br(), gt()); k++) {
        adv();
        if (now < (useGameStore.getState().player.lungeHoldUntil ?? 0)) expect(pc().x, '止めの間は進まない').toBeCloseTo(atHit, 0);
        if (now < (en('z').hitStunUntil ?? 0)) expect(brawlerJuggleHeightRel(en('z'), now)).toBeCloseTo(rel0, 6);
      }
      // 明けたら残りを抜けて、抜けた距離は今と同じ(140)
      for (let k = 0; k < 60 && br().palmPassRest; k++) adv();
      expect(pc().x - x0).toBeGreaterThan(BRAWLER_PALM_PASS_PX - 4);
      expect(pc().x - x0).toBeLessThan(BRAWLER_PALM_PASS_PX + 17); // 刻み(16ms)の端数=最大速度の1コマぶんまで
    });
  }
});
