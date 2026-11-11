// ★KOF のようなつながり(research/BRAWLER.md §19・社長承認2026-11-10「繋がってる時はちゃんと繋がって敵は一切動けないように」)。
// 受け入れ条件 §19-4 の 2〜6 を、実際の AI(updateEnemies)を回して固める。純関数(道の表・①の長さ・②の延ばす先)は utils/brawlerRoute.test.ts。
//  2. 道の上の続きは、途中で敵が一度も動かずつながる(雑魚・強個体・ボス級/移動・待ちの相と溜めの相/ボス級は地上のままでも/全体のスロー中でも)
//  3. 待機から出した表の外の技・ステップで取り消した後の技は、前の当たりの固まりの外で当たる。締めの後・大踏み潰しの後(気功なし)は敵が動ける
//  4. 境目(一番遅い時刻で出しても1フレームも動かない・止めの間に出した蹴りの連続・途中から掛かる/明けるスロー)
//  5. 止め続けられない(コンボの後の固まらない時間・ダウンの着地)
//  6. 秘奥義 →↓←↑(取り消しで・先行入力で)
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import {
  setBrawlerTempoAll, brawlerHeldNow, brawlerAirborne, brawlerLockAlive, brawlerComboEndNoHoldNow, brawlerNoHoldNow, brawlerHoldClockAlive,
  BRAWLER_COMBO_END_NO_HOLD_BOSS_MS, BRAWLER_COMBO_END_NO_HOLD_STRONG_MS, brawlerLockHitMs,
} from '../utils/brawlerCombo';
import {
  BRAWLER_TEMPO_DEFAULT, initialBrawlerState, brawlerCancelWindowOpen, brawlerTechAllowed, brawlerPressDecision, brawlerInHitstop,
  brawlerStepAllowed, brawlerStageSpec, BRAWLER_TECHS, BRAWLER_CANCEL_WINDOW_MS, brawlerElapsed, brawlerTotalMs, type BrawlerState,
} from '../utils/brawler';

const NO = { up: false, down: false, left: false, right: false } as never;
let now = 7_000_000;
/**
 * 1フレームの進み(ms): wall=壁時計(Date.now)・game=技の時計(gameTime)。全体のスローは game だけを小さくする。
 * ★既定は 16ms(60fps の1フレーム)。余白34ms(2フレーム)は「続きを出すフレームと敵の更新の順番で1フレーム動ける」のを塞ぐ分なので、
 *   実機のフレームの幅で見る(細かい 10ms 刻みは brawlerChain.store.test.ts と旧来の store テストが見ている)。
 */
const FRAME = 16;
let dtWall = FRAME, dtGame = FRAME;

const setup = (points = 20) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: {
      ...st.player, health: 99999, maxHealth: 99999, invulnerable: false, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 },
      lastDirection: { x: 1, y: 0 }, brawler: { ...initialBrawlerState(), points },
    },
  }));
};
const place = (type: EnemyType, dx: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: p.x + p.width / 2 + dx - e.width / 2, y: p.y + p.height / 2 - e.height / 2, id, health: 9_999_999, maxHealth: 9_999_999, dormant: false, ...extra } as Enemy;
};
const en = () => useGameStore.getState().enemies.find(x => x.id === 'z')!;
const br = (): BrawlerState => useGameStore.getState().player.brawler!;
const gt = () => useGameStore.getState().gameTime;
/** フレームの幅を揺らす時の出どころ(null=一定)。揺らす時は壁時計と技の時計を同じ幅で進める。 */
let jitter: (() => number) | null = null;
const adv = (onStep?: () => void) => {
  const d = jitter ? jitter() : null;
  now += d ?? dtWall;
  // ★実機と同じ入口(setGameTime)で進める=確定の固まりの「1フレーム遅れて明ける」(brawlerLockAlive)がフレームの幅を知る。
  useGameStore.getState().setGameTime(useGameStore.getState().gameTime + (d ?? dtGame));
  useGameStore.getState().movePlayer(NO, dtWall / 1000);
  useGameStore.getState().tickBrawler();
  useGameStore.getState().updateEnemies(dtGame / 1000);
  onStep?.();
};

/** 敵の種類(区分と相)。 */
type Foe = 'zombie-move' | 'driller-windup' | 'hunter-move' | 'hunter-windup';
const FOES: readonly Foe[] = ['zombie-move', 'driller-windup', 'hunter-move', 'hunter-windup'];
/**
 * 敵を置く。zombie-move=寄ってきた雑魚(実際の AI の移動/待ちの相)/driller-windup=強個体の溜めの相/
 * hunter-move=ボス級の追いかけ(浮く)/hunter-windup=ボス級の溜めの相(技の最中=浮かない=地上のまま)。
 */
const spawnFoe = (foe: Foe): void => {
  const g = gt();
  if (foe === 'zombie-move') {
    useGameStore.setState({ enemies: [place('zombie', 140, 'z')] });
    for (let i = 0; i < 600 && !['zrush', 'zpause'].includes(en().aiPhase ?? ''); i++) adv();
    for (let i = 0; i < 300; i++) { const p = useGameStore.getState().player; if (Math.abs(en().x + en().width / 2 - (p.x + p.width / 2)) < 70) break; adv(); }
  } else if (foe === 'driller-windup') {
    useGameStore.setState({ enemies: [place('driller', 60, 'z', { aiPhase: 'driller-thrust-windup', aiPhaseUntil: g + 600, aiStartedAt: g })] });
  } else if (foe === 'hunter-move') {
    useGameStore.setState({ enemies: [place('hunter', 60, 'z')] });
  } else {
    useGameStore.setState({ enemies: [place('hunter', 60, 'z', { aiPhase: 'windup', aiPhaseUntil: g + 600, aiStartedAt: g })] });
  }
};

/** 見張り(毎フレーム): 当たりの数、当たりと当たりの間に敵が自分で動いた量・相が変わった回数・技の時計が進んだ量・固まっていなかったフレーム。 */
interface Watch {
  hits: number;
  walked: number; phaseChanges: number; clockRan: number; unheld: number;
  /** 当たりの直前のフレームで、確定の固まりが生きていたか/固まっていたか(当たりごと)。 */
  lockedAtHit: boolean[];
  heldAtHit: boolean[];
  /** 当たりごとの、当たる前までに敵が自由だったフレーム数(固まりも浮きも押しも止めも無い)。 */
  freeBeforeHit: number[];
  frame: () => void;
  reset: () => void;
  /** これ以上は数えない(最後の当たりの後)。 */
  stop: () => void;
}
const watcher = (): Watch => {
  let z0 = en();
  let lastHit = z0.lastHit, px = z0.x, py = z0.y, phase = z0.aiPhase, rem = (z0.aiPhaseUntil ?? 0) - gt();
  let lockedPrev = brawlerLockAlive(z0, gt()), heldPrev = brawlerHeldNow(z0, gt(), now), freeRun = 0, on = true;
  const w: Watch = {
    hits: 0, walked: 0, phaseChanges: 0, clockRan: 0, unheld: 0, lockedAtHit: [], heldAtHit: [], freeBeforeHit: [],
    reset: () => { z0 = en(); lastHit = z0.lastHit; px = z0.x; py = z0.y; phase = z0.aiPhase; rem = (z0.aiPhaseUntil ?? 0) - gt(); },
    stop: () => { on = false; },
    frame: () => {
      const z = en();
      const g = gt();
      const hitNow = z.lastHit !== lastHit;
      if (hitNow) { w.hits++; lastHit = z.lastHit; w.lockedAtHit.push(lockedPrev); w.heldAtHit.push(heldPrev); w.freeBeforeHit.push(freeRun); freeRun = 0; }
      const pushed = now < (z.knockbackUntil ?? 0);
      const air = brawlerAirborne(z, now);
      const held = brawlerHeldNow(z, g, now);
      const remNow = (z.aiPhaseUntil ?? 0) - g;
      if (on && w.hits >= 1 && !hitNow) {
        if (!pushed && !air) w.walked += Math.hypot(z.x - px, z.y - py);
        if (z.aiPhase !== phase) w.phaseChanges++;
        if (z.aiPhase === phase && z.aiPhaseUntil !== undefined && rem - remNow > 0.5) w.clockRan += rem - remNow;
        if (!held && !air) w.unheld++;
      }
      if (!held && !air && !pushed && now >= (z.hitStunUntil ?? 0)) freeRun++;
      px = z.x; py = z.y; phase = z.aiPhase; rem = remNow; lockedPrev = brawlerLockAlive(z, g); heldPrev = held;
    },
  };
  return w;
};

type Step = { stage: 1 | 2 | 3 | 4 | 5 } | { tech: 'kick' | 'stomp' | 'kiko' | 'guard' };
const s = (stage: 1 | 2 | 3 | 4 | 5): Step => ({ stage });
const t = (tech: 'kick' | 'stomp' | 'kiko' | 'guard'): Step => ({ tech });
const FLICK: Record<'kick' | 'stomp' | 'kiko' | 'guard', [number, number]> = { kick: [1, 0], stomp: [0, 1], kiko: [-1, 0], guard: [0, -1] };
const doTech = (k: 'kick' | 'stomp' | 'kiko' | 'guard'): boolean => useGameStore.getState().brawlerTech(FLICK[k][0], FLICK[k][1]);
/** いまの行動が、この手か(判定を解いた後)。 */
const running = (st: Step, kickN: number): boolean => {
  const b = br();
  if ('stage' in st) return b.phase === 'attack' && b.stage === st.stage;
  return b.phase === 'tech' && b.tech === st.tech && (st.tech !== 'kick' || b.kickN === kickN);
};
const kickNOf = (steps: readonly Step[], i: number): number => {
  let n = 0;
  for (let j = i; j >= 0; j--) { const x = steps[j]; if ('tech' in x && x.tech === 'kick') n++; else break; }
  return n;
};
/**
 * 道を出す。mode: 'early'=出せる一番早い時(段は当たった直後の先行入力・技は止めの間の先行入力)/
 * 'late'=一番遅い時(段は後隙が終わって待機へ戻ったフレーム・技は取り消しの受付の最後のフレーム)。
 * onIssue(i)=i 番目の手を出す直前に呼ぶ(途中からスローを掛ける/外す・敵を動かす、に使う)。
 */
const runRoute = (steps: readonly Step[], w: Watch, mode: 'early' | 'late', onIssue?: (i: number) => void): void => {
  const f = () => w.frame();
  const issue = (st: Step): boolean => ('stage' in st ? useGameStore.getState().brawlerPress() : doTech(st.tech));
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    if (i === 0) { onIssue?.(i); expect(issue(st), 'first').toBe(true); continue; }
    const prev = steps[i - 1];
    const pk = kickNOf(steps, i - 1);
    // 前の手が判定を解くまで
    for (let k = 0; k < 400 && !(running(prev, pk) && br().resolved); k++) adv(f);
    expect(running(prev, pk) && br().resolved, `step ${i - 1} resolved`).toBe(true);
    expect(br().connected, `step ${i - 1} connected`).toBe(true);
    if ('stage' in st) {
      if (mode === 'early') {
        expect(brawlerPressDecision(br(), gt())).toBe('buffer');
        onIssue?.(i);
        expect(issue(st), `press ${i}`).toBe(true);
      } else {
        for (let k = 0; k < 400 && br().phase !== 'idle'; k++) adv(f);
        onIssue?.(i);
        expect(issue(st), `press ${i}`).toBe(true);
      }
    } else if (mode === 'early') {
      // 止めの間に入れる(技の先行入力=受付が開いた瞬間に出る / 蹴りの連続はその場で出る)
      expect(brawlerInHitstop(br(), gt()), `step ${i} in hitstop`).toBe(true);
      onIssue?.(i);
      expect(issue(st), `tech ${i}`).toBe(true);
    } else {
      // 出せる最後のフレーム: 取り消しの受付の最後(次のフレームには閉じている)か、後隙の最後(次のフレームには行動が終わる)の早い方。
      // (1・2段目は受付195msより後隙182msの方が短い=後隙の最後のフレーム。飛び蹴りの連続は後隙=受付の最後のフレーム。)
      const canNow = (): boolean => brawlerTechAllowed(br(), st.tech, gt());
      const canNext = (): boolean => brawlerTechAllowed(br(), st.tech, gt() + dtGame) && brawlerElapsed(br(), gt() + dtGame) < brawlerTotalMs(br())
        && (prev !== undefined && 'tech' in prev && prev.tech === 'kick' && st.tech === 'kick' ? true : brawlerCancelWindowOpen(br(), gt() + dtGame));
      for (let k = 0; k < 400 && !(canNow() && !canNext()); k++) adv(f);
      expect(running(prev, pk), `step ${i - 1} still running at the window end`).toBe(true);
      expect(brawlerTechAllowed(br(), st.tech, gt()), `tech ${i} allowed at the window end`).toBe(true);
      onIssue?.(i);
      expect(issue(st), `tech ${i}`).toBe(true);
    }
  }
  // 最後の手が当たるまで(気功は弾が届くまで)
  for (let k = 0; k < 600 && w.hits < steps.length; k++) adv(f);
  w.stop();
};
const expectLinked = (w: Watch, n: number, label: string): void => {
  expect(w.hits, `${label}: hits`).toBe(n);
  expect(w.walked, `${label}: walked`).toBeLessThan(0.5);
  expect(w.phaseChanges, `${label}: phase`).toBe(0);
  expect(w.clockRan, `${label}: clock`).toBeLessThan(0.5);
  expect(w.unheld, `${label}: unheld frames`).toBe(0);
};

const ROUTES: { name: string; steps: readonly Step[] }[] = [
  { name: '1→2→3→4→5', steps: [s(1), s(2), s(3), s(4), s(5)] },
  { name: '1→飛び蹴り×3', steps: [s(1), t('kick'), t('kick'), t('kick')] },
  { name: '2→気功', steps: [s(1), s(2), t('kiko')] },
  { name: '3→飛び蹴り→大踏み潰し→気功', steps: [s(1), s(2), s(3), t('kick'), t('stomp'), t('kiko')] },
  { name: '4→大踏み潰し', steps: [s(1), s(2), s(3), s(4), t('stomp')] },
];

beforeEach(() => {
  now = 7_000_000; dtWall = FRAME; dtGame = FRAME;
  setBrawlerTempoAll(1.3);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

describe('§19-4-2 道の上の続きは、途中で敵が一度も動かずつながる(実際の AI)', () => {
  for (const foe of FOES) for (const r of ROUTES) for (const mode of ['early', 'late'] as const) {
    it(`${foe}・${r.name}・${mode === 'early' ? '一番早く出す' : '一番遅く出す(後隙の終わり・受付の最後のフレーム)'}`, () => {
      setup();
      spawnFoe(foe);
      const w = watcher();
      runRoute(r.steps, w, mode);
      expectLinked(w, r.steps.length, `${foe} ${r.name} ${mode}`);
    });
  }
  it('2→気功(届く端): 当てた後に相手が届く端まで離れていても、弾が届くまで動かない(弾の飛ぶ時間込みで延ばす)', () => {
    for (const foe of ['driller-windup', 'hunter-windup'] as const) {
      setup();
      spawnFoe(foe);
      const w = watcher();
      runRoute([s(1), s(2), t('kiko')], w, 'early', i => {
        if (i !== 2) return;
        // 2段目が当たった後(気功を入れる直前)に、固まったままの相手を届く端(約380px 先)へ置き直す
        const p = useGameStore.getState().player;
        useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, x: p.x + p.width / 2 + 380 - e.width / 2, knockbackUntil: 0, knockbackVx: 0, knockbackVy: 0 })) }));
        w.reset();
      });
      expectLinked(w, 3, `${foe} far kiko`);
    }
  });
  for (const foe of ['zombie-move', 'driller-windup', 'hunter-windup'] as const) for (const r of ROUTES) {
    it(`全体のスロー中でも同じ(技の時計が壁時計の約0.3倍): ${foe}・${r.name}`, () => {
      setup();
      spawnFoe(foe);
      dtGame = 5;
      const w = watcher();
      runRoute(r.steps, w, 'late');
      expectLinked(w, r.steps.length, `${foe} ${r.name} slow`);
    });
  }
});

describe('§19-4-4 境目', () => {
  it('飛び蹴りの連続を先行入力(止めの間)で出してもつながる・受付の最後のフレームで出してもつながる(ボス級の溜めの相=地上のまま)', () => {
    for (const mode of ['early', 'late'] as const) {
      setup();
      spawnFoe('hunter-windup');
      const w = watcher();
      runRoute([t('kick'), t('kick'), t('kick')], w, mode);
      expectLinked(w, 3, `kick chain ${mode}`);
    }
  });
  it('コンボの途中から全体のスローが掛かっても・明けてもつながる', () => {
    for (const foe of ['driller-windup', 'hunter-windup'] as const) for (const r of ROUTES) for (const [a, b] of [[FRAME, 5], [5, FRAME]] as const) {
      setup();
      spawnFoe(foe);
      dtGame = a;
      const w = watcher();
      // 2手目を出す所から切り替える(前の当たりの固まりが残っている最中)
      runRoute(r.steps, w, 'late', i => { if (i === 2) dtGame = b; });
      expectLinked(w, r.steps.length, `${foe} ${r.name} slow ${a}→${b}`);
    }
  });
  it('固まりは①の長さどおり: 1段目を当てて何も続けなければ、当たりから 319ms(止め90+受付195+余白34)で明ける', () => {
    setup();
    spawnFoe('hunter-windup');
    useGameStore.getState().brawlerPress();
    for (let k = 0; k < 60 && !br().resolved; k++) adv();
    const hitAt = gt();
    expect(en().brLockUntil).toBe(hitAt + brawlerLockHitMs('s1', 90));
    expect(en().brLockUntil! - hitAt).toBe(319);
    expect(en().brHoldUntil ?? 0).toBeLessThanOrEqual(now + 90); // 壁時計の欄は当たりの止めまで(確定の固まりは gameTime の欄)
    let heldFrames = 0;
    for (let k = 0; k < 40; k++) { adv(); if (brawlerHeldNow(en(), gt(), now)) heldFrames++; }
    expect(heldFrames * FRAME).toBeGreaterThanOrEqual(319 - FRAME);
    expect(heldFrames * FRAME).toBeLessThanOrEqual(319 + FRAME);
  });
});

/** 段を1つ当てて、後隙が終わって待機へ戻るまで進める。 */
const hitStages = (n: number, w: Watch): void => {
  for (let i = 1; i <= n; i++) {
    expect(useGameStore.getState().brawlerPress()).toBe(true);
    for (let k = 0; k < 400 && !(br().phase === 'attack' && br().stage === i && br().resolved); k++) adv(() => w.frame());
    expect(br().connected, `stage ${i}`).toBe(true);
    if (i < n) for (let k = 0; k < 400 && br().phase !== 'idle'; k++) adv(() => w.frame());
  }
};

describe('§19-4-4b フレームの幅が揺れてもつながる(コマ落ち・検収2026-11-10)', () => {
  // 続きは「後隙が明けた最初のフレーム」で出る。そのフレームが遅れても(幅16〜50ms=ループの上限)、道の上の続きは切れない。
  // 旧: 余白34msだけで受けていたので、3→4・4→5段目が切れた(ボス級はそこから固まらない時間へ入る)。
  const lcg = (seed: number) => { let x = seed >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; };
  afterEach(() => { jitter = null; });
  for (const foe of ['zombie-move', 'hunter-windup'] as const) {
    it(`${foe}: 1→2→3→4→5 を先行入力で出す(幅16〜50msの揺れ・20本)`, () => {
      // 種 21〜40: 直す前の作りは種25で切れる(雑魚は4px・ボス級は55px 動いた)=このテストが効いている証拠。
      for (let seed = 21; seed <= 40; seed++) {
        setup();
        spawnFoe(foe);
        const r = lcg(seed * 7919);
        jitter = () => 16 + Math.floor(r() * 35);
        const w = watcher();
        runRoute([s(1), s(2), s(3), s(4), s(5)], w, 'early');
        jitter = null;
        expectLinked(w, 5, `${foe} jitter seed ${seed}`);
      }
    });
  }
  it('ボス級の溜めの相: ほかの道も、揺れるフレームでつながる(各4本)', () => {
    for (const rt of ROUTES) for (let seed = 1; seed <= 4; seed++) {
      setup();
      spawnFoe('hunter-windup');
      const r = lcg(seed * 104729 + rt.steps.length);
      jitter = () => 16 + Math.floor(r() * 35);
      const w = watcher();
      runRoute(rt.steps, w, 'early');
      jitter = null;
      expectLinked(w, rt.steps.length, `${rt.name} jitter seed ${seed}`);
    }
  });
});

describe('§19-4-4c 途中の1発が会心(気絶)になっても切れない(実ループの検証2026-11-11)', () => {
  // 会心→気絶→次の1発は「フィニッシュ」(強個体の3倍・ボスの5倍)の分岐へ回り、brawlerHitPatch を通らない。
  // 旧: その1発で確定の固まりが書かれず、前の固まりが切れた所でコンボが終わり、固まらない時間へ入った(=道の上なのに敵が動く)。
  // ほかのテストは乱数を 0.99 に固定している(会心が出ない)ので、ここだけ1段目を会心にする。
  for (const foe of ['driller-windup', 'hunter-windup', 'hunter-move'] as const) {
    it(`${foe}: 1段目が会心 → 2→3→4→5 が最後まで固まったままつながる`, () => {
      setup();
      spawnFoe(foe);
      const rnd = vi.mocked(Math.random);
      rnd.mockReturnValue(0); // 1段目は会心
      const w = watcher();
      runRoute([s(1), s(2), s(3), s(4), s(5)], w, 'early', i => { if (i === 1) rnd.mockReturnValue(0.99); });
      expect(w.hits).toBe(5);
      expect(w.unheld, 'unheld frames').toBe(0);
      expect(w.walked).toBeLessThan(0.5);
    });
  }
});

describe('飛び蹴りの2発目は少し打ち上げる・3発目は少しのノックバック(社長指示2026-11-11)', () => {
  // 旧: 1・2発目=普通の押し(地上からは浮かない)・3発目=吹き飛ばし(big)。
  const kicks = (foe: Foe) => {
    setup();
    spawnFoe(foe);
    const kb: number[] = [], air: boolean[] = [], peak: number[] = [];
    for (let n = 1; n <= 3; n++) {
      expect(doTech('kick'), `kick ${n} issued`).toBe(true);
      for (let k = 0; k < 400 && !(br().phase === 'tech' && br().kickN === n && br().resolved); k++) adv();
      expect(br().connected, `kick ${n} connected`).toBe(true);
      const z = en();
      kb.push(Math.hypot(z.knockbackVx ?? 0, z.knockbackVy ?? 0));
      air.push(brawlerAirborne(z, now));
      peak.push(z.brLiftPeak ?? 0);
    }
    return { kb, air, peak };
  };
  it('雑魚: 1発目では浮かない → 2発目で地上から少し浮く(高さ0.7) → 3発目は1発目の押しを超えない(吹き飛ばさない)', () => {
    const r = kicks('zombie-move');
    expect(r.air[0]).toBe(false);
    expect(r.air[1]).toBe(true);
    expect(r.peak[1]).toBeCloseTo(0.7, 5);
    expect(r.kb[0]).toBeGreaterThan(0);
    expect(r.kb[2]).toBeLessThanOrEqual(r.kb[0] + 1e-6);
  });
  // ★3発目の狙い直し(§19-10): 溜めの間に敵が動いても、溜めが明けた瞬間に飛ぶ先を取り直して当てる。
  //   旧: 溜め始めの敵の位置へ飛んだ(実ループで36本中5本が空振り)。密着から始めた時(踏み込みの器が空)も取り直す(検収の A-2)。
  for (const [label, dx0] of [['離れた所から', 60], ['密着から(踏み込みの器が空)', 26]] as const) {
    it(`3発目: 溜めの間に敵が70px滑っても当たる(${label})`, () => {
      setup();
      useGameStore.setState({ enemies: [place('hunter', dx0, 'z', { aiPhase: 'windup', aiPhaseUntil: gt() + 9000, aiStartedAt: gt() })] });
      for (let n = 1; n <= 3; n++) {
        expect(doTech('kick'), `kick ${n} issued`).toBe(true);
        if (n === 3) {
          // 3発目が始まった所(溜めの頭)で、敵を前へ70px動かす(前の蹴りの押しで滑った分の代わり)。押しの欄は消して、その場に留める。
          for (let k = 0; k < 60 && !(br().phase === 'tech' && br().kickN === 3); k++) adv();
          expect(br().kickN).toBe(3);
          useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, x: e.x + 70, knockbackVx: 0, knockbackVy: 0, knockbackUntil: 0 })) }));
        }
        for (let k = 0; k < 400 && !(br().phase === 'tech' && br().kickN === n && br().resolved); k++) adv();
        expect(br().connected, `kick ${n} connected`).toBe(true);
      }
      expect(br().kickReaimed).toBe(true);
    });
  }
  it('強個体(溜めの相): 2発目で技を取り消して少し浮く(重さ0.7=高さ0.49)', () => {
    const r = kicks('driller-windup');
    expect(r.air[0]).toBe(false);
    expect(r.air[1]).toBe(true);
    expect(r.peak[1]).toBeCloseTo(0.49, 5);
  });
});

describe('§19-4-3 つながらない物', () => {
  const NOT_ON_ROUTE: { name: string; stages: number; pre?: 'kick'; then: Step }[] = [
    { name: '1段目の後に待機から大踏み潰し', stages: 1, then: t('stomp') },
    { name: '1段目の後に待機から気功', stages: 1, then: t('kiko') },
    { name: '2段目の後に待機から飛び蹴り', stages: 2, then: t('kick') },
    { name: '飛び蹴りの後に待機から1段目', stages: 0, pre: 'kick', then: s(1) },
  ];
  for (const foe of ['zombie-move', 'driller-windup', 'hunter-windup'] as const) for (const c of NOT_ON_ROUTE) {
    it(`${foe}・${c.name}: 前の当たりの固まりの外で当たる(ボス級は当たる前に動ける。雑魚・強個体は押されているだけ=固まってはいない)`, () => {
      setup();
      spawnFoe(foe);
      const w = watcher();
      if (c.pre === 'kick') {
        expect(doTech('kick')).toBe(true);
        for (let k = 0; k < 400 && !(br().phase === 'tech' && br().resolved); k++) adv(() => w.frame());
        expect(br().connected).toBe(true);
      } else hitStages(c.stages, w);
      // 後隙が明けて待機へ戻ってから出す
      for (let k = 0; k < 400 && br().phase !== 'idle'; k++) adv(() => w.frame());
      const before = w.hits;
      expect('stage' in c.then ? (useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, nextStage: 1, chainUntil: 0 } } })), useGameStore.getState().brawlerPress()) : doTech(c.then.tech)).toBe(true);
      for (let k = 0; k < 600 && w.hits === before; k++) adv(() => w.frame());
      expect(w.hits, 'the off-route move still hits').toBe(before + 1);
      expect(w.lockedAtHit[before], 'lock is gone before the hit').toBe(false);
      expect(w.heldAtHit[before], 'not held just before the hit').toBe(false);
      // ボス級(小さい押しは当たりから280msで終わる)は、当たる前に自由なフレームがある。雑魚・強個体は押し(止め+280ms)が続いていることがある。
      if (foe === 'hunter-windup') expect(w.freeBeforeHit[before], 'the boss was free before the hit').toBeGreaterThan(0);
    });
  }
  for (const stage of [3, 4] as const) for (const tech of ['stomp', 'kiko'] as const) {
    it(`${stage}段目からステップで取り消して${tech === 'stomp' ? '大踏み潰し' : '気功'}: 固まりはステップの瞬間に切れる=つながらない(ボス級の溜めの相・雑魚)`, () => {
      for (const foe of ['hunter-windup', 'zombie-move'] as const) {
        setup();
        spawnFoe(foe);
        const w = watcher();
        hitStages(stage, w);
        for (let k = 0; k < 100 && !brawlerStepAllowed(br(), gt()); k++) adv(() => w.frame());
        expect(brawlerLockAlive(en(), gt())).toBe(true);
        expect(useGameStore.getState().brawlerStep(-1, 0)).toBe(true);
        expect(br().phase).toBe('idle');
        expect(brawlerLockAlive(en(), gt()), `${foe}: lock cut at the step`).toBe(false);
        const before = w.hits;
        // ステップの後、相手の方を向き直して技(届かなくてもよい=固まりが切れていることを見る)
        expect(doTech(tech)).toBe(true);
        // 技が出て当たる(か外れる)までの間、確定の固まりは無い(当たった後は、その当たりの規則で書かれることがある=そこで見るのをやめる)
        for (let k = 0; k < 120 && w.hits === before; k++) {
          adv(() => w.frame());
          if (w.hits === before) expect(brawlerLockAlive(en(), gt()), `${foe}: no lock while the tech comes out`).toBe(false);
        }
        if (foe === 'hunter-windup') expect(w.freeBeforeHit[before] ?? 1, 'boss can move before the tech').toBeGreaterThan(0);
      }
    });
  }
  it('締め(5段目・飛び蹴り3発目・気功)の後と、大踏み潰しの後に気功を出さなかった時: ボス級・強個体は、プレイヤーの後隙が明ける前に動ける', () => {
    const CLOSERS: { name: string; steps: readonly Step[] }[] = [
      { name: '5段目', steps: ROUTES[0].steps },
      { name: '飛び蹴り3発目', steps: ROUTES[1].steps },
      { name: '気功', steps: ROUTES[2].steps },
      { name: '大踏み潰し(気功なし)', steps: ROUTES[4].steps },
    ];
    for (const foe of ['driller-windup', 'hunter-windup', 'hunter-move'] as const) for (const c of CLOSERS) {
      setup();
      spawnFoe(foe);
      const w = watcher();
      runRoute(c.steps, w, 'early');
      expect(w.hits, `${foe} ${c.name}`).toBe(c.steps.length);
      // 最後の当たりの後、プレイヤーが待機へ戻るまでに、敵が固まっていないフレーム(固まり・浮き・当たりの止めのどれでもない)がある。
      // 吹き飛ばされている最中(押されているだけ)は固まりではない(§19-3 ④)=数える。
      let free = 0, frames = 0;
      for (let k = 0; k < 400 && br().phase !== 'idle'; k++) {
        adv();
        frames++;
        const z = en();
        if (!brawlerHeldNow(z, gt(), now) && !brawlerAirborne(z, now) && now >= (z.hitStunUntil ?? 0)) free++;
      }
      expect(frames, `${foe} ${c.name}: recovery`).toBeGreaterThan(5);
      expect(free, `${foe} ${c.name}: free frames in the player's recovery`).toBeGreaterThan(0);
      expect(brawlerLockAlive(en(), gt()), `${foe} ${c.name}: no lock left`).toBe(false);
    }
  });
});

describe('§19-4-5 止め続けられない', () => {
  /** 固まらない時間の間は、固まらず・浮かず・当たりの止めも掛からない(毎フレーム見る)。固まらない時間の合計(ms)を返す。 */
  const noHoldWatch = () => {
    let total = 0, windows = 0, prev = false;
    const frame = () => {
      const z = en(), g = gt();
      const inNoHold = brawlerComboEndNoHoldNow(z, g);
      if (inNoHold) {
        total += dtGame;
        if (!prev) windows++;
        expect(brawlerHoldClockAlive(z, g, now), 'held during the no-hold time').toBe(false);
        expect(brawlerAirborne(z, now), 'airborne during the no-hold time').toBe(false);
        expect(now < (z.hitStunUntil ?? 0), 'hit-stop during the no-hold time').toBe(false);
        expect(z.brLockMoves, 'no combo memory during the no-hold time').toBeUndefined();
      }
      prev = inNoHold;
    };
    return { frame, get total() { return total; }, get windows() { return windows; } };
  };
  for (const [foe, ms] of [['hunter-move', BRAWLER_COMBO_END_NO_HOLD_BOSS_MS], ['hunter-windup', BRAWLER_COMBO_END_NO_HOLD_BOSS_MS], ['driller-windup', BRAWLER_COMBO_END_NO_HOLD_STRONG_MS]] as const) {
    it(`${foe}: 1→2→3 を繰り返しても、コンボの後 ${ms}ms は固まらず浮かない`, () => {
      setup();
      spawnFoe(foe);
      const nh = noHoldWatch();
      let heldMs = 0, elapsed = 0;
      const f = () => { nh.frame(); elapsed += dtGame; if (brawlerHeldNow(en(), gt(), now) || brawlerAirborne(en(), now)) heldMs += dtGame; };
      for (let round = 0; round < 6; round++) {
        for (let i = 1; i <= 3; i++) {
          useGameStore.getState().brawlerPress();
          for (let k = 0; k < 200 && br().phase !== 'idle'; k++) adv(f);
        }
        // つながりを切って、また1段目から
        useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, nextStage: 1, chainUntil: 0 } } }));
      }
      expect(nh.windows).toBeGreaterThanOrEqual(1);
      expect(nh.total).toBeGreaterThanOrEqual(ms - dtGame);
      // 殴り続けても、止まっている時間は全体の一部(コンボ1回ぶん+固まらない時間の繰り返し)
      expect(heldMs).toBeLessThan(elapsed * 0.75);
    });
    it(`${foe}: 飛び蹴りを当て続けても、コンボの後 ${ms}ms は固まらない`, () => {
      setup(20);
      spawnFoe(foe);
      const nh = noHoldWatch();
      for (let i = 0; i < 14; i++) {
        useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 20 } } }));
        doTech('kick');
        for (let k = 0; k < 200 && br().phase !== 'idle'; k++) adv(nh.frame);
      }
      expect(nh.windows).toBeGreaterThanOrEqual(1);
      expect(nh.total).toBeGreaterThanOrEqual(ms - dtGame);
    });
  }
  it('コンボの後に3・4段目で浮かせて拾う、はできない(固まらない時間の間は地上から浮かない)', () => {
    for (const foe of ['hunter-move', 'driller-windup'] as const) {
      setup();
      spawnFoe(foe);
      const nh = noHoldWatch();
      // 1回目: 1→2→3→4(浮かせる)→ 着地してコンボが終わるまで
      for (let i = 1; i <= 4; i++) { useGameStore.getState().brawlerPress(); for (let k = 0; k < 200 && br().phase !== 'idle'; k++) adv(nh.frame); }
      for (let k = 0; k < 300 && !brawlerComboEndNoHoldNow(en(), gt()); k++) adv(nh.frame);
      expect(brawlerComboEndNoHoldNow(en(), gt()), `${foe}: no-hold started`).toBe(true);
      // 固まらない時間の間に、もう一度 1→2→3→4
      useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, nextStage: 1, chainUntil: 0 } } }));
      const hitsBefore = en().lastHit;
      let lifted = false;
      for (let i = 1; i <= 4 && brawlerComboEndNoHoldNow(en(), gt()); i++) {
        useGameStore.getState().brawlerPress();
        for (let k = 0; k < 200 && br().phase !== 'idle'; k++) { adv(nh.frame); if (brawlerComboEndNoHoldNow(en(), gt()) && brawlerAirborne(en(), now)) lifted = true; }
      }
      expect(en().lastHit, `${foe}: the hits still land`).not.toBe(hitsBefore);
      expect(lifted, `${foe}: never lifted during the no-hold time`).toBe(false);
    }
  });
  it('ダウンの着地で固まらない時間が短くならない(ボス級: コンボの後の固まらない時間の間に空中で落とされても、元の終わりまで固まらない)', () => {
    setup();
    spawnFoe('hunter-move');
    const g0 = gt();
    // 固まらない時間の間に(格闘以外で)浮いている所へ、予算切れの当たり=ダウン
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({
      ...e, brLockNoHoldUntil: g0 + 1500, brawlerLiftAt: now, brLiftMs: 600, brLiftPeak: 1, brLiftFrom: 0, brLiftUntil: now + 600, liftUntil: now + 600, brLiftBudget: 0, brLiftDown: false,
    })) }));
    useGameStore.getState().brawlerPress();
    for (let k = 0; k < 60 && !br().resolved; k++) adv();
    expect(en().brLiftDown).toBe(true);
    expect(en().brLockNoHoldUntil).toBe(g0 + 1500);
    const downNoHold = en().brNoHoldUntil!;
    expect(downNoHold).toBeGreaterThan(now); // ダウンの着地の後の固まらない時間(壁時計の欄)も付く
    // 着地の後も、元の終わり(g0+1500)までは固まらない(どちらかの欄が生きている間)
    for (let k = 0; k < 200 && gt() < g0 + 1400; k++) {
      if (br().phase === 'idle') { useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, nextStage: 1, chainUntil: 0 } } })); useGameStore.getState().brawlerPress(); }
      adv();
      expect(brawlerNoHoldNow(en(), gt(), now)).toBe(true);
      expect(brawlerLockAlive(en(), gt())).toBe(false);
    }
    expect(now).toBeGreaterThan(downNoHold); // 壁時計の欄はもう明けている=gameTime の欄が残っている
  });
});

describe('§19-4-6 秘奥義 →↓←↑(飛び蹴り→大踏み潰し→気功→構え)', () => {
  const secretRun = (mode: 'cancel' | 'buffer' | 'idle' | 'late'): boolean => {
    setup(20);
    spawnFoe('hunter-windup');
    const order = ['kick', 'stomp', 'kiko', 'guard'] as const;
    expect(doTech('kick')).toBe(true);
    for (let i = 1; i < order.length; i++) {
      const prev = order[i - 1], next = order[i];
      if (mode === 'buffer') {
        // 出だしに入れる(先行入力)。受付が開いた瞬間に出る
        expect(br().tech).toBe(prev);
        expect(br().resolved).toBe(false);
        expect(doTech(next), `buffer ${next}`).toBe(true);
        expect(br().techBuffer).toBe(next);
        for (let k = 0; k < 400 && !(br().tech === next || br().secret); k++) adv();
      } else if (mode === 'cancel') {
        for (let k = 0; k < 400 && !brawlerTechAllowed(br(), next, gt()); k++) adv();
        expect(br().phase, `cancel ${prev}→${next}`).toBe('tech');
        expect(doTech(next)).toBe(true);
      } else if (mode === 'late') {
        // 取り消しの受付を過ぎた後・後隙の終わりの前に入れる: その場では出ないが覚えていて、待機へ戻った瞬間に出る(秘奥義の入力の持ち越し)
        for (let k = 0; k < 400 && !br().resolved; k++) adv();
        for (let k = 0; k < 400 && (brawlerInHitstop(br(), gt()) || brawlerCancelWindowOpen(br(), gt())); k++) adv();
        if (br().phase === 'idle') { expect(doTech(next), `idle ${next}`).toBe(true); } // 飛び蹴りは受付=後隙なので、過ぎたら待機
        else {
          expect(br().tech, `late ${prev}`).toBe(prev);
          const startAt = br().startAt;
          expect(doTech(next), `late ${next}`).toBe(true);
          expect(br().startAt, 'nothing comes out in the recovery').toBe(startAt);
          expect(br().techBuffer).toBe(next);
          for (let k = 0; k < 400 && br().startAt === startAt && !br().secret; k++) { adv(); if (br().startAt === startAt && !br().secret) expect(br().tech).toBe(prev); }
        }
      } else {
        // 取り消さずに、後隙が終わって待機へ戻ってから出し直す(今どおり順番に数える)
        for (let k = 0; k < 400 && br().phase !== 'idle'; k++) adv();
        expect(doTech(next)).toBe(true);
      }
      if (br().secret) return true;
    }
    return !!br().secret;
  };
  it('取り消しでつないで成立する(構えは気功を撃った後の受付の内)', () => { expect(secretRun('cancel')).toBe(true); });
  it('先行入力で入れても成立する', () => { expect(secretRun('buffer')).toBe(true); });
  it('取り消さずに待機から出し直しても成立する(§10-1 のまま)', () => { expect(secretRun('idle')).toBe(true); });
  it('受付を過ぎた後に入れても成立する(後隙が終わるまでは何も出ず、待機へ戻った瞬間に出る=今どおりの入力の幅)', () => { expect(secretRun('late')).toBe(true); });
  it('1手目の蹴りが当たっていなければ成立しない', () => {
    setup(20);
    useGameStore.setState({ enemies: [] });
    doTech('kick');
    for (const k of ['stomp', 'kiko', 'guard'] as const) { for (let i = 0; i < 400 && br().phase !== 'idle'; i++) adv(); doTech(k); }
    expect(br().secret).toBeUndefined();
  });
  it('気功からの構えは秘奥義の締めの時だけ: 順番が揃っていない気功の後隙からは構えは出ない', () => {
    setup(20);
    spawnFoe('hunter-windup');
    expect(doTech('kiko')).toBe(true);
    for (let k = 0; k < 100 && !br().resolved; k++) adv();
    expect(doTech('guard')).toBe(false);
    expect(br().tech).toBe('kiko');
    // 取り消しの受付の値(定数)も合わせて見る
    expect([BRAWLER_CANCEL_WINDOW_MS, BRAWLER_TECHS.kiko.recoveryMs, brawlerStageSpec(1).recoveryMs]).toEqual([195, 429, 182]);
  });
});
