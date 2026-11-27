// ★追尾の原則(research/BRAWLER.md §40-4=正本・§39・社長指示2026-11-27「追尾するのは、敵までの移動方向のみで、移動距離は射程範囲を守る、高さは追わない。
//   高さは規定の高さまで上がる固定の攻撃。格闘ゲームと同じ」+「いまは通常攻撃も勝手に飛んでいくけど、これをやめて」+ 当たる高さは「今の定石が全部つながる値に調整」)。
// 実際のストア(movePlayer・tickBrawler・updateEnemies)を実機の刻み(16ms・係数1.3)で回して固める。
//  - 定石のつながり(雑魚・強個体・ボス級): ①5段 ②飛び蹴り3連 ③踵落とし→地割り ④蹴り上げ→空中投げ ⑤技の後の1〜3段での拾い
//  - ①' 敵の位置・高さが違っても、向きは敵へ・動く距離は上限まで(手前で止まる)・高さは技ごとに同じ
//  - ② 空中蹴り・蹴り上げの後に滞空し、その間に空中で出せる技が決まった動きで出る(地割りは真下へ落ちて割る・気功は一瞬止まって撃ち落ちる)
//  - ③ 地上の技は高く浮いた敵に当たらず、空中の技は当たる(体の大小・スマホ/PC の寸法で同じ)
//  - 通常攻撃で空中の敵に当てても自分は跳ばない / 空中では出せない技(構え・ステップ・3段目以降)は出ない / 空中では移動の入力で動かない
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setKenkiLevelForTest } from '../utils/kenkiLevel';
import { setBrawlerTempoAll, brawlerAirborne, brawlerHeldNow } from '../utils/brawlerCombo';
import {
  BRAWLER_TEMPO_DEFAULT, initialBrawlerState, brawlerSelfHeightPx, brawlerSelfHovering, brawlerDistTo, brawlerInHitstop, BRAWLER_STANDOFF_PX,
  BRAWLER_KICK1_AIR_PX, BRAWLER_KICK2_AIR_PX, BRAWLER_KICKUP_AIR_PX, BRAWLER_PLAYER_KICK_LUNGE_PX, BRAWLER_AIR_HOVER_MS, BRAWLER_TECHS,
  type BrawlerState,
} from '../utils/brawler';
import { brawlerEnemyHitRel, BRAWLER_HIT_REL_GROUND_MAX } from '../utils/brawlerHitHeight';
import { getLastAirMeleeHit, resetAirMeleeHit } from '../utils/playerAirFollow';

const NO = { up: false, down: false, left: false, right: false } as never;
const FRAME = 16;
let now = 7_000_000;
const LOG = false; // 当たった技と高さを出す(調べる時だけ true)

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
/** いまの行動の名札(当てた時の記録用)。 */
const nodeNow = (): string => {
  const b = br();
  if (b.phase === 'attack') return `s${b.stage}`;
  if (b.phase === 'tech' && b.tech === 'kick') return b.kickHeel ? 'heel' : b.kickUp ? 'kickup' : `kick${b.kickN}`;
  return b.phase === 'tech' ? String(b.tech) : 'idle';
};

interface RouteResult { hits: { node: string; rel: number; selfH: number }[]; freeFrames: number; log: string }
/**
 * 道を一番早く出す(前の手が当たった直後=止めの間の先行入力/段は当たった直後の先行入力)。各手が当たったかを、相手の lastHit が変わったことで見る。
 * freeFrames=最初の当たりから最後の当たりまでに、相手が固まりも浮きも押しも無く自由だったフレーム数(つながっていれば0)。
 */
const runRoute = (steps: readonly In[]): RouteResult => {
  const hits: RouteResult['hits'] = [];
  let free = 0;
  let last = en().lastHit;
  let prevRel = brawlerEnemyHitRel(en(), now);
  const watch = () => {
    const z = en();
    if (!z) return;
    if (z.lastHit !== last) { last = z.lastHit; hits.push({ node: nodeNow(), rel: prevRel, selfH: selfH() }); }
    else if (hits.length > 0 && hits.length < steps.length) {
      const pushed = now < (z.knockbackUntil ?? 0);
      if (!brawlerHeldNow(z, gt(), now) && !brawlerAirborne(z, now) && !pushed && now >= (z.hitStunUntil ?? 0)) free++;
    }
    prevRel = brawlerEnemyHitRel(z, now);
  };
  for (let i = 0; i < steps.length; i++) {
    if (i > 0) {
      // 前の手が当たる(または判定を解く)まで
      const want = i;
      for (let k = 0; k < 400 && hits.length < want && !(br().resolved && br().connected === false && br().phase !== 'idle'); k++) adv(watch);
      // 技の後の通常攻撃は、技が終わって待機へ戻ってから入り直す(§13-2)
      if (steps[i] === 'P' && steps[i - 1] !== 'P') for (let k = 0; k < 400 && br().phase !== 'idle'; k++) adv(watch);
    }
    expect(press(steps[i]), `${steps.join('')}: ${i + 1}手目(${steps[i]})を出せる`).toBe(true);
  }
  for (let k = 0; k < 600 && hits.length < steps.length; k++) adv(watch);
  const log = hits.map(h => `${h.node}(r${h.rel.toFixed(2)} h${h.selfH.toFixed(0)})`).join(' ');
  if (LOG) console.log(`TRACK ${steps.join('')} hits=${hits.length}/${steps.length} free=${free} :: ${log}`);
  return { hits, freeFrames: free, log };
};

beforeEach(() => {
  now = 7_000_000;
  input = NO;
  setBrawlerTempoAll(1.3);
  setKenkiLevelForTest(5); // 踵落とし・蹴り上げ・土竜を体得した状態(§36-2)
  resetAirMeleeHit();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // 会心を出さない
});
afterEach(() => { vi.restoreAllMocks(); setKenkiLevelForTest(null); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

describe('§40-4 定石は雑魚・強個体・ボス級でつながる(当たる高さの範囲の決め)', () => {
  /**
   * linked=途中で相手が一度も自由にならない(確定でつながる)ことも見る。
   * 見ない物(§40 の前=v0.25.5860 でも同じ・実測): 雑魚の③(踵落としで空中から叩き落とした相手はダウンの着地の後、地割りが当たる前に約17フレーム固まらない=§13-2 のダウン)と、
   * ⑤(技の後の1段目は待機から入り直す=拾いであって確定ではない・§13-2)。
   */
  const ROUTES: { name: string; steps: readonly In[]; linked: (cls: Cls) => boolean }[] = [
    { name: '①5段', steps: ['P', 'P', 'P', 'P', 'P'], linked: () => true },
    { name: '①4段→地割り', steps: ['P', 'P', 'P', 'P', 'D'], linked: () => true },
    { name: '②飛び蹴り3連', steps: ['K', 'K', 'K'], linked: () => true },
    { name: '②1段→飛び蹴り3連', steps: ['P', 'K', 'K', 'K'], linked: () => true },
    { name: '③踵落とし→地割り', steps: ['K', 'K', 'D', 'D'], linked: cls => cls !== 'mob' },
    { name: '⑤2段→気功→1・2・3段で拾う', steps: ['P', 'P', 'L', 'P', 'P', 'P'], linked: () => false },
    { name: '3段→飛び蹴り→地割り→気功', steps: ['P', 'P', 'P', 'K', 'D', 'L'], linked: () => true },
  ];
  for (const cls of CLS) for (const r of ROUTES) {
    it(`${cls}・${r.name}`, () => {
      setup();
      spawnCls(cls);
      const res = runRoute(r.steps);
      expect(res.hits.length, `${cls} ${r.name}: 全部当たる :: ${res.log}`).toBe(r.steps.length);
      if (r.linked(cls)) expect(res.freeFrames, `${cls} ${r.name}: 途中で相手が自由にならない :: ${res.log}`).toBe(0);
    });
  }
  for (const cls of CLS) {
    it(`${cls}・④蹴り上げ→空中投げ(パニッシャー・投げ先が無い=スープレックスで叩きつける。ボス級は掴まない=蹴り上げが当たる)`, () => {
      setup({ skills: ['punisher'] });
      spawnCls(cls);
      const res = runRoute(['K', 'K', 'U']);
      expect(res.hits.length, `${cls} ④: 蹴り上げまで当たる :: ${res.log}`).toBe(3);
      expect(res.freeFrames, `${cls} ④ :: ${res.log}`).toBe(0);
      if (cls === 'boss') { expect(br().grab, 'ボス級は掴まない(§34-3)').toBeUndefined(); return; }
      // 掴んだ=時間停止の間は蹴り上げの決まった高さのまま
      expect(br().grab?.enemyId).toBe('z');
      expect(selfH()).toBeCloseTo(BRAWLER_KICKUP_AIR_PX, 0);
      const before = en().lastHit;
      for (let k = 0; k < 200 && en().lastHit === before; k++) adv();
      expect(en().lastHit, `${cls} ④: スープレックスの叩きつけが当たる`).not.toBe(before);
      if (LOG) console.log(`TRACK ${cls} ④ suplex ok h=${selfH().toFixed(1)}`);
    });
  }
});

describe('§40-4 ①(言い直し): 向きは敵へ・動く距離は上限まで(手前で止まる)・高さは技ごとに同じ', () => {
  const kickPeak = (dx: number, dy: number, lift: Partial<Enemy> = {}): { peak: number; moved: number; dirOk: boolean } => {
    setup();
    useGameStore.setState({ enemies: [place('zombie', dx, 'z', lift, dy)] });
    const c0 = pc();
    expect(press('K')).toBe(true);
    const d = { x: br().dirX, y: br().dirY };
    const tgt = en();
    const tx = tgt.x + tgt.width / 2 - c0.x, ty = tgt.y + tgt.height / 2 - c0.y;
    const dirOk = Math.abs(d.x * ty - d.y * tx) / Math.hypot(tx, ty) < 0.2 && d.x * tx + d.y * ty > 0;
    let peak = 0;
    for (let k = 0; k < 60 && !(br().phase === 'idle'); k++) { adv(); peak = Math.max(peak, selfH()); }
    const c1 = pc();
    return { peak, moved: Math.hypot(c1.x - c0.x, c1.y - c0.y), dirOk };
  };
  it('飛び蹴り(1発目): 近い・遠い・斜め・浮いている相手のどれでも、跳ぶ高さは同じ(28px)・向きは相手へ・動く距離は上限(120)まで', () => {
    const lifted = { brawlerLiftAt: now, brLiftMs: 2000, brLiftPeak: 0.4, brLiftFrom: 0.4, brLiftUntil: now + 2000, liftUntil: now + 2000 } as Partial<Enemy>;
    const cases = [kickPeak(60, 0), kickPeak(150, 0), kickPeak(110, 80), kickPeak(150, 0, lifted)];
    for (const c of cases) {
      expect(c.peak).toBeCloseTo(BRAWLER_KICK1_AIR_PX, 0);
      expect(c.dirOk).toBe(true);
      expect(c.moved).toBeLessThanOrEqual(BRAWLER_PLAYER_KICK_LUNGE_PX.kick1 * 2.2 + 1); // 踏み込みの器は GAME_SPEED が掛かる(定数の約2倍進む=今どおり)
    }
    // 近い相手は手前で止まる(すり抜けない)
    setup();
    useGameStore.setState({ enemies: [place('zombie', 60, 'z')] });
    expect(press('K')).toBe(true);
    for (let k = 0; k < 30 && !br().resolved; k++) adv();
    expect(brawlerDistTo(pc().x, pc().y, en())).toBeGreaterThanOrEqual(BRAWLER_STANDOFF_PX - 2);
  });
  it('相手が居ない時の蹴りは、向いている方へ決まった距離(120)・高さは同じ', () => {
    setup();
    useGameStore.setState({ enemies: [] });
    const x0 = pc().x;
    expect(press('K')).toBe(true);
    let peak = 0;
    for (let k = 0; k < 60 && br().phase !== 'idle'; k++) { adv(); peak = Math.max(peak, selfH()); }
    expect(peak).toBeCloseTo(BRAWLER_KICK1_AIR_PX, 0);
    expect(pc().x - x0).toBeGreaterThan(BRAWLER_PLAYER_KICK_LUNGE_PX.kick1 * 0.9);
  });
  it('空中蹴り(2発目)は相手の高さに依らず 96px まで跳んで蹴る。蹴り上げは 120px', () => {
    for (const peakRel of [0, 0.7, 1.4]) {
      setup();
      const lift = peakRel > 0 ? { brawlerLiftAt: now, brLiftMs: 4000, brLiftPeak: peakRel, brLiftFrom: peakRel, brLiftUntil: now + 4000, liftUntil: now + 4000 } as Partial<Enemy> : {};
      useGameStore.setState({ enemies: [place('zombie', 80, 'z', lift)] });
      expect(press('K')).toBe(true);
      for (let k = 0; k < 60 && !br().resolved; k++) adv();
      expect(press('K')).toBe(true);
      for (let k = 0; k < 60 && !(br().kickN === 2 && br().resolved); k++) adv();
      expect(selfH(), `peak ${peakRel}`).toBeCloseTo(BRAWLER_KICK2_AIR_PX, 0);
    }
  });
});

describe('§40-4 ⑧: 空中蹴り・蹴り上げの後の滞空と、空中で出す技', () => {
  const toHover = (cls: Cls = 'mob', skills: string[] = []) => {
    setup({ skills });
    spawnCls(cls, 80);
    expect(press('K')).toBe(true);
    for (let k = 0; k < 60 && !br().resolved; k++) adv();
    expect(press('K')).toBe(true);
    for (let k = 0; k < 60 && !(br().kickN === 2 && br().resolved); k++) adv();
  };
  it('空中蹴りの後: 決まった高さで止まる(前半は一定・後半わずかに沈む)→ 明けたら重力で落ちて着地する。滞空・落下の間は移動の入力で地面の座標が動かない', () => {
    // 入力あり/なしで同じ動き(蹴った反動の踏み込みの器だけ=入力の分は動かない)
    const trace = (withInput: boolean): { xs: number[]; hs: number[]; hoverFrames: number } => {
      toHover();
      for (let k = 0; k < 20 && brawlerInHitstop(br(), gt()); k++) adv();
      expect(brawlerSelfHovering(br(), gt())).toBe(true);
      input = withInput ? { up: false, down: false, left: false, right: true } as never : NO;
      const xs: number[] = []; const hs: number[] = [];
      let hoverFrames = 0;
      for (let k = 0; k < 120 && (brawlerSelfHovering(br(), gt()) || selfH() > 0); k++) {
        adv(); xs.push(pc().x); hs.push(selfH());
        if (brawlerSelfHovering(br(), gt())) hoverFrames++;
      }
      input = NO;
      return { xs, hs, hoverFrames };
    };
    const a = trace(false), b = trace(true);
    expect(b.xs.length).toBe(a.xs.length);
    b.xs.forEach((x, i) => { if (a.hs[i] > 0) expect(Math.abs((x - b.xs[0]) - (a.xs[i] - a.xs[0])), `frame ${i}`).toBeLessThan(0.01); }); // 着地したフレームからは動ける
    const hover = a.hs.slice(0, a.hoverFrames);
    expect(a.hoverFrames * FRAME).toBeGreaterThanOrEqual(BRAWLER_AIR_HOVER_MS - 3 * FRAME - BRAWLER_TECHS.kick.windupMs);
    expect(hover[0]).toBeCloseTo(BRAWLER_KICK2_AIR_PX, 0);
    expect(Math.min(...hover)).toBeGreaterThan(BRAWLER_KICK2_AIR_PX - 7);
    // 落ちる: 加速して着地(高さが一度に跳ばない)
    const fall = a.hs.slice(a.hoverFrames);
    expect(fall[fall.length - 1]).toBe(0);
    const steps = fall.slice(1).map((h, i) => fall[i] - h).filter(d => d > 0);
    expect(steps[steps.length - 1]).toBeGreaterThan(steps[0]); // 加速
    expect(Math.max(...steps)).toBeLessThan(20);
  });
  it('滞空中に地割り(道の上): 真下へ落ちて着地で割る', () => {
    toHover();
    for (let k = 0; k < 20 && brawlerInHitstop(br(), gt()); k++) adv();
    expect(selfH()).toBeGreaterThan(80);
    expect(press('D')).toBe(true); // 2発目の続きの下=踵落とし(体得済み)
    expect(br().kickHeel).toBe(true);
    // 踵落とし: 出した時の高さ(96)で振り下ろす(相手の高さに合わせない)
    for (let k = 0; k < 60 && !br().resolved; k++) adv();
    expect(selfH()).toBeCloseTo(BRAWLER_KICK2_AIR_PX, 0);
    for (let k = 0; k < 20 && brawlerInHitstop(br(), gt()); k++) adv();
    expect(press('D')).toBe(true); // 踵落とし→地割り
    expect(br().tech).toBe('stomp');
    const h0 = selfH();
    expect(h0).toBeGreaterThan(60);
    let landedBeforeHit = false;
    for (let k = 0; k < 60 && !br().resolved; k++) { adv(); if (selfH() === 0) landedBeforeHit = true; }
    expect(landedBeforeHit, '着地してから割る').toBe(true);
  });
  it('蹴り上げの後に滞空し、空中の気功は撃つ間その高さで止まって撃ち、撃った後は落ちる。着地までどの技・段にも取り消せない', () => {
    toHover();
    for (let k = 0; k < 20 && brawlerInHitstop(br(), gt()); k++) adv();
    expect(press('U')).toBe(true);
    expect(br().kickUp).toBe(true);
    for (let k = 0; k < 60 && !br().resolved; k++) adv();
    expect(selfH()).toBeCloseTo(BRAWLER_KICKUP_AIR_PX, 0);
    for (let k = 0; k < 20 && brawlerInHitstop(br(), gt()); k++) adv();
    expect(brawlerSelfHovering(br(), gt())).toBe(true);
    expect(press('L')).toBe(true); // 蹴り上げ→気功(道の上)
    expect(br().tech).toBe('kiko');
    const hk = selfH();
    expect(hk).toBeGreaterThan(BRAWLER_KICKUP_AIR_PX - 7);
    for (let k = 0; k < 30 && !br().resolved; k++) { adv(); if (!br().resolved) expect(selfH()).toBeCloseTo(hk, 3); }
    expect(useGameStore.getState().brawlerKiko.length, '撃った').toBeGreaterThan(0);
    // 撃った後は落ちる。着地まで取り消せない(空中で押した技・段は気功を断ち切らない)
    let pressedInAir = 0;
    for (let k = 0; k < 80 && selfH() > 0; k++) {
      adv();
      if (selfH() > 0 && br().resolved) { press('K'); press('D'); expect(br().tech, '空中の気功は取り消せない').toBe('kiko'); pressedInAir++; }
    }
    expect(pressedInAir).toBeGreaterThan(0);
    expect(selfH()).toBe(0);
  });
  it('空中で出せない技は出ない(押しは捨てる): 構え・ステップ・3段目以降。空中の1・2段は出る(高さはそのまま)', () => {
    toHover();
    // 滞空が明けて落ちている間に、蹴りの連続の受付が切れた所(=上は蹴り上げにならない)
    for (let k = 0; k < 120 && !(br().phase === 'idle' && gt() > br().kickChainUntil); k++) adv();
    expect(selfH(), 'まだ空中').toBeGreaterThan(10);
    expect(press('U'), '構えは出ない').toBe(false);
    expect(br().phase).toBe('idle');
    expect(useGameStore.getState().brawlerStep(1, 0), 'ステップは出ない').toBe(false);
    const h = selfH();
    expect(press('P'), '空中の1段目は出る').toBe(true);
    expect(br().phase).toBe('attack');
    expect(selfH()).toBeCloseTo(h, 3);
    // 3段目以降は空中では出ない
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, phase: 'idle', tech: null, nextStage: 3, chainUntil: gt() + 1000, airFall: { fromPx: 60, v0: 0, at: gt() } } } }));
    expect(selfH()).toBeGreaterThan(50);
    expect(press('P'), '空中の3段目は出ない').toBe(false);
    expect(br().phase).toBe('idle');
  });
  it('滞空中に食らうと滞空は切れて落ちる', () => {
    toHover();
    for (let k = 0; k < 20 && brawlerInHitstop(br(), gt()); k++) adv();
    expect(brawlerSelfHovering(br(), gt())).toBe(true);
    useGameStore.setState(st => ({ player: { ...st.player, invulnerable: false, invulnerableTime: 0 } }));
    useGameStore.getState().damagePlayer(5);
    expect(br().phase).toBe('idle');
    const h0 = selfH();
    expect(h0).toBeGreaterThan(80);
    for (let k = 0; k < 40; k++) adv(); // 被弾の止めが明けてから落ちる
    expect(selfH()).toBeLessThan(h0 - 10);
  });
});

describe('§40-4 ① 当たる高さ: 地上の技は高く浮いた敵に当たらず、空中の技は当たる', () => {
  const high = (): Partial<Enemy> => ({ brawlerLiftAt: now, brLiftMs: 4000, brLiftPeak: 1.12, brLiftFrom: 1.12, brLiftUntil: now + 4000, liftUntil: now + 4000 } as Partial<Enemy>); // r≈0.67=蹴り上げの打ち上げ
  it('地上の1段目は蹴り上げの高さの敵に当たらない(向くだけ・詰めない)/ 空中蹴りは当たる', () => {
    setup();
    useGameStore.setState({ enemies: [place('zombie', 50, 'z', high())] });
    expect(brawlerEnemyHitRel(en(), now)).toBeGreaterThan(BRAWLER_HIT_REL_GROUND_MAX);
    const before = en().lastHit;
    expect(press('P')).toBe(true);
    for (let k = 0; k < 40 && !br().resolved; k++) adv();
    expect(br().connected).toBe(false);
    expect(en().lastHit).toBe(before);
    for (let k = 0; k < 60 && br().phase !== 'idle'; k++) adv();
    // 飛び蹴り→空中蹴り(2発目は高さで分けない)
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, ...high() })) }));
    expect(press('K')).toBe(true);
    for (let k = 0; k < 40 && !br().resolved; k++) adv();
    expect(br().connected, '1発目(低い)は届かない').toBe(false);
    expect(press('K')).toBe(true);
    for (let k = 0; k < 40 && !(br().kickN === 2 && br().resolved); k++) adv();
    expect(br().connected, '空中蹴りは当たる').toBe(true);
  });
  it('体の小さい敵と大きい敵で当たり方が同じ(同じ浮きなら同じ高さの割合)・スマホと PC の寸法で同じ', () => {
    const lift = { brawlerLiftAt: now, brLiftMs: 1000, brLiftPeak: 0.9, brLiftFrom: 0, brLiftUntil: now + 1000, liftUntil: now + 1000 } as Partial<Enemy>;
    const small = { ...spawnEnemyAt('bat', 0, 0, 0), ...lift } as Enemy;
    const big = { ...spawnEnemyAt('hunter', 0, 0, 0), ...lift } as Enemy;
    for (const t of [now + 50, now + 200, now + 600]) expect(brawlerEnemyHitRel(small, t)).toBe(brawlerEnemyHitRel(big, t));
    const run = (w: number, h: number, zoom: number): string => {
      setup();
      useGameStore.setState({ gameBounds: { width: w, height: h }, viewZoom: zoom });
      spawnCls('mob');
      return runRoute(['P', 'P', 'P', 'K', 'D', 'L']).log;
    };
    const phone = run(430, 932, 1);
    expect(run(1920, 1080, 1)).toBe(phone);
    expect(run(1440, 900, 0.4)).toBe(phone);
  });
});

describe('§39: 通常攻撃で空中の敵に当てても自分は跳ばない', () => {
  it('浮いた敵を1・2・3段で殴っても、自分の高さは0のまま(追いの浮きの記録も残らない)', () => {
    setup();
    useGameStore.setState({ enemies: [place('zombie', 50, 'z', { brawlerLiftAt: now, brLiftMs: 3000, brLiftPeak: 0.6, brLiftFrom: 0.6, brLiftUntil: now + 3000, liftUntil: now + 3000 } as Partial<Enemy>)] });
    let maxH = 0;
    let hits = 0;
    let last = en().lastHit;
    for (let i = 0; i < 3; i++) {
      expect(press('P')).toBe(true);
      for (let k = 0; k < 60 && !(br().phase === 'attack' && br().stage === i + 1 && br().resolved); k++) { adv(); maxH = Math.max(maxH, selfH()); }
      if (en().lastHit !== last) { hits++; last = en().lastHit; }
    }
    for (let k = 0; k < 60; k++) { adv(); maxH = Math.max(maxH, selfH()); }
    expect(hits).toBe(3);
    expect(maxH).toBe(0);
    expect(getLastAirMeleeHit()).toBeNull();
  });
});
