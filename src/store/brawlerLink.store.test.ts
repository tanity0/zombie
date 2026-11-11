// ★フレームで決まるつながり(research/BRAWLER.md §20・社長指示2026-11-11「隙とか速さとかのフレーム都合でつながらない、みたいな組み方にしたい」)。
// 受け入れ条件 §20-6 の4 を、実際の AI(updateEnemies)を実際の刻みで回して固める。純関数(取り消しの規則・固まりの長さ・つながりの計算)は utils/brawlerRoute.test.ts。
//  - 入る道(1→2→3→4→5 と、すぐ取り消した飛び蹴り・気功・大踏み潰し)は、途中で敵が一度も動かずつながる(雑魚・強個体・ボス級/移動・待ちの相と溜めの相/全体のスロー中でも/フレームの幅が揺れても)
//  - 入らない道(受付の終わり際に取り消した技・後隙の後の大踏み潰し・気功を遠くへ)は、前の当たりの固まりの外で当たる。5段目・締めの後は敵が動ける
//  - 止め続けられない(コンボの減衰・コンボの後の固まらない時間・ダウンの着地)
//  - 秘奥義 →↓←↑(取り消しで・先行入力で)
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
  { name: '1→すぐ大踏み潰し', steps: [s(1), t('stomp')] },
];

beforeEach(() => {
  now = 7_000_000; dtWall = FRAME; dtGame = FRAME;
  setBrawlerTempoAll(1.3);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

describe('§20-6-4 入る道は、途中で敵が一度も動かずつながる(実際の AI)', () => {
  // 取り消し(止めが明けてすぐ・先行入力)で出した続きは入る。後隙の終わりに待機から出す段のつなぎ(1→2→3→4→5)は、一番遅く出しても入る(余り約50ms)。
  // 取り消しを受付の終わり際まで遅らせた技は入らない(下の「入らない道」)=旧「一番遅く出す」の全部の道は、この規則では入らない。
  const CASES = FOES.flatMap(foe => ROUTES.flatMap(r => (['early', 'late'] as const)
    .filter(mode => mode === 'early' || r.name === '1→2→3→4→5').map(mode => ({ foe, r, mode }))));
  for (const { foe, r, mode } of CASES) {
    it(`${foe}・${r.name}・${mode === 'early' ? '一番早く出す' : '一番遅く出す(後隙の終わりに待機から)'}`, () => {
      setup();
      spawnFoe(foe);
      const w = watcher();
      runRoute(r.steps, w, mode);
      expectLinked(w, r.steps.length, `${foe} ${r.name} ${mode}`);
    });
  }
  it('2→気功(距離で変わる): 当てた後に相手が届く端(約380px 先)まで離れていると、弾が届く前に固まりが明けて入らない(近ければ入る=上の道)', () => {
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
      expect(w.hits, `${foe} far kiko: hits`).toBe(3);
      expect(w.lockedAtHit[2], `${foe} far kiko: the lock is gone before the bullet arrives`).toBe(false);
    }
  });
  for (const foe of ['zombie-move', 'driller-windup', 'hunter-windup'] as const) for (const r of ROUTES) {
    it(`全体のスロー中でも同じ(技の時計が壁時計の約0.3倍): ${foe}・${r.name}`, () => {
      setup();
      spawnFoe(foe);
      dtGame = 5;
      const w = watcher();
      runRoute(r.steps, w, 'early');
      expectLinked(w, r.steps.length, `${foe} ${r.name} slow`);
    });
  }
});

describe('§20-6-4 境目', () => {
  it('飛び蹴りの連続を先行入力(止めの間)で出すとつながる(ボス級の溜めの相=地上のまま)', () => {
    for (const mode of ['early'] as const) {
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
      runRoute(r.steps, w, 'early', i => { if (i === 2) dtGame = b; });
      expectLinked(w, r.steps.length, `${foe} ${r.name} slow ${a}→${b}`);
    }
  });
  it('固まりは §20-4 の長さどおり: 1段目を当てて何も続けなければ、当たりから 480ms(止め90+1段目の固まり390)で明ける', () => {
    setup();
    spawnFoe('hunter-windup');
    useGameStore.getState().brawlerPress();
    for (let k = 0; k < 60 && !br().resolved; k++) adv();
    const hitAt = gt();
    expect(en().brLockUntil).toBe(hitAt + brawlerLockHitMs('s1', 90));
    expect(en().brLockUntil! - hitAt).toBe(480);
    expect(en().brHoldUntil ?? 0).toBeLessThanOrEqual(now + 90); // 壁時計の欄は当たりの止めまで(確定の固まりは gameTime の欄)
    let heldFrames = 0;
    for (let k = 0; k < 40; k++) { adv(); if (brawlerHeldNow(en(), gt(), now)) heldFrames++; }
    expect(heldFrames * FRAME).toBeGreaterThanOrEqual(480 - FRAME);
    expect(heldFrames * FRAME).toBeLessThanOrEqual(480 + FRAME);
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

describe('§20-6-4 フレームの幅が揺れても同じ(コマ落ち・§19-7 と同じ揺らし方)', () => {
  // 続きは「後隙が明けた最初のフレーム」で出る。そのフレームが遅れても(幅16〜50ms=ループの上限)、入る道は切れない(brawlerLockAlive が1フレーム遅れて明ける)。
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

describe('§20-6-4 入らない道・つながらない物', () => {
  // 1段目・2段目の後に、取り消さずに後隙が終わってから大踏み潰し: 当たりは 止め+後隙+260 = 固まり(止め+390)より約50ms後(§20-5)。
  const NOT_ON_ROUTE: { name: string; stages: number; then: Step }[] = [
    { name: '1段目の後に待機から大踏み潰し', stages: 1, then: t('stomp') },
    { name: '2段目の後に待機から大踏み潰し', stages: 2, then: t('stomp') },
  ];
  for (const foe of ['zombie-move', 'driller-windup', 'hunter-windup'] as const) for (const c of NOT_ON_ROUTE) {
    it(`${foe}・${c.name}: 前の当たりの固まりの外で当たる(ボス級は当たる前に動ける。雑魚・強個体は押されているだけ=固まってはいない)`, () => {
      setup();
      spawnFoe(foe);
      const w = watcher();
      hitStages(c.stages, w);
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
  for (const foe of ['zombie-move', 'driller-windup', 'hunter-windup'] as const) {
    it(`${foe}: 1段目を当てて、取り消しの受付の終わり際に大踏み潰し: 当たる前に固まりが明けている(早く取り消せば入る=上の道)`, () => {
      setup();
      spawnFoe(foe);
      const w = watcher();
      hitStages(1, w);
      // 受付の最後のフレーム(次のフレームには閉じている)まで待って出す
      const canNow = (): boolean => brawlerTechAllowed(br(), 'stomp', gt());
      const canNext = (): boolean => brawlerTechAllowed(br(), 'stomp', gt() + dtGame);
      for (let k = 0; k < 400 && !(canNow() && !canNext()); k++) adv(() => w.frame());
      expect(canNow(), 'the window is still open').toBe(true);
      expect(doTech('stomp')).toBe(true);
      for (let k = 0; k < 600 && w.hits < 2; k++) adv(() => w.frame());
      expect(w.hits, 'the stomp still hits').toBe(2);
      expect(w.lockedAtHit[1], 'lock is gone before the late stomp lands').toBe(false);
      expect(w.heldAtHit[1], 'not held just before the late stomp lands').toBe(false);
    });
  }
  it('1段目→気功: 相手が近ければ入り、届く端(300px)まで離れていると弾が届く前に固まりが明ける(距離で変わる)', () => {
    for (const foe of ['driller-windup', 'hunter-windup'] as const) {
      for (const dist of [60, 300] as const) {
        setup();
        spawnFoe(foe);
        const w = watcher();
        hitStages(1, w);
        // 当てた後に、固まったままの相手を dist px 先へ置き直す(近い時は今の位置のまま)
        if (dist > 60) {
          const p = useGameStore.getState().player;
          useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, x: p.x + p.width / 2 + dist - e.width / 2, knockbackUntil: 0, knockbackVx: 0, knockbackVy: 0 })) }));
          w.reset();
        }
        for (let k = 0; k < 100 && !brawlerTechAllowed(br(), 'kiko', gt()); k++) adv(() => w.frame());
        expect(doTech('kiko')).toBe(true);
        for (let k = 0; k < 600 && w.hits < 2; k++) adv(() => w.frame());
        expect(w.hits, `${foe} ${dist}px: the bullet hits`).toBe(2);
        expect(w.lockedAtHit[1], `${foe} ${dist}px`).toBe(dist === 60);
      }
    }
  });
  it('ボス級への大踏み潰しの固まりは、雑魚・強個体と同じ長さ(止め220+固まり299=519ms)', () => {
    const lens: number[] = [];
    for (const foe of ['zombie-move', 'driller-windup', 'hunter-move'] as const) {
      setup();
      spawnFoe(foe);
      expect(doTech('stomp')).toBe(true);
      for (let k = 0; k < 200 && !br().resolved; k++) adv();
      expect(br().connected, `${foe} stomp connected`).toBe(true);
      lens.push(en().brLockUntil! - gt());
    }
    expect(lens).toEqual([519, 519, 519]);
  });
  it('段と飛び蹴りを回し続けても、強個体・ボス級は8発目までに固まりが切れる(コンボの減衰: 飛び蹴り→1段目→飛び蹴り…)', () => {
    for (const foe of ['driller-windup', 'hunter-windup'] as const) {
      setup(20);
      spawnFoe(foe);
      const w = watcher();
      expect(useGameStore.getState().brawlerPress()).toBe(true);
      for (let k = 0; k < 200 && w.hits < 1; k++) adv(() => w.frame());
      for (let n = 0; n < 6 && w.hits >= 1 + n * 2; n++) {
        // 飛び蹴りで取り消す(止めの明けにすぐ)
        for (let k = 0; k < 200 && !brawlerTechAllowed(br(), 'kick', gt()); k++) adv(() => w.frame());
        if (!doTech('kick')) break;
        for (let k = 0; k < 400 && w.hits < 2 + n * 2; k++) adv(() => w.frame());
        // 後隙が終わってから1段目
        for (let k = 0; k < 400 && br().phase !== 'idle'; k++) adv(() => w.frame());
        useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, nextStage: 1, chainUntil: 0 } } }));
        if (!useGameStore.getState().brawlerPress()) break;
        for (let k = 0; k < 400 && w.hits < 3 + n * 2; k++) adv(() => w.frame());
      }
      const brokeAt = w.lockedAtHit.findIndex((v, i) => i >= 1 && !v);
      expect(brokeAt, `${foe}: the lock must run out`).toBeGreaterThanOrEqual(1);
      // 8発目で書いた固まりまでで切れる=切れた後の最初の当たりは9発目以内。7発目は境目(後隙の後の1段目が固まりの終わりより約13ms遅い=1フレーム遅れて明ける分で入る)。
      expect(brokeAt + 1, `${foe}: the first hit after the lock ran out is hit ${brokeAt + 1}`).toBeLessThanOrEqual(9);
      expect(brokeAt + 1, `${foe}: not before the 7th hit`).toBeGreaterThanOrEqual(7);
    }
  });
  // ★§20-8(社長承認2026-11-11): ステップで後隙を取り消しても固まりは切らない。代わりに、ステップの最中は段も技も出せない
  //   (押した物を1つ覚えて、ステップが終わった瞬間に出す)。その遅れの後に入るかは、技ごとの数字で決まる。
  for (const [stage, connects] of [[3, true], [4, true], [1, false]] as const) {
    it(`${stage}段目→ステップ→大踏み潰し: 固まりは切れない・ステップの最中は出ない(覚える)・終わった瞬間に出る。${connects ? '入る' : '入らない(固まりが先に明ける)'}(ボス級の溜めの相)`, () => {
      setup();
      spawnFoe('hunter-windup');
      const w = watcher();
      hitStages(stage, w);
      for (let k = 0; k < 100 && !brawlerStepAllowed(br(), gt()); k++) adv(() => w.frame());
      expect(brawlerLockAlive(en(), gt())).toBe(true);
      expect(useGameStore.getState().brawlerStep(-1, 0)).toBe(true);
      expect(br().phase).toBe('idle');
      expect(brawlerLockAlive(en(), gt()), 'the lock is not cut by the step').toBe(true);
      const stepEnd = br().stepUntil!;
      const before = w.hits;
      // ステップの最中に押した大踏み潰し: 出ない・覚える
      expect(doTech('stomp')).toBe(true);
      expect(br().phase, 'no tech during the step').toBe('idle');
      expect(br().techBuffer).toBe('stomp');
      // ステップが終わるまで待機のまま → 終わった瞬間に出る
      let startedAt = -1;
      for (let k = 0; k < 200 && w.hits === before; k++) {
        adv(() => w.frame());
        if (startedAt < 0 && br().phase === 'tech') startedAt = gt();
      }
      expect(startedAt, 'the buffered tech starts when the step ends').toBeGreaterThanOrEqual(stepEnd);
      expect(startedAt - stepEnd, 'and not later than a couple of frames').toBeLessThanOrEqual(60);
      expect(w.hits, 'the stomp lands').toBe(before + 1);
      // 入る=当たる直前まで固まっていた / 入らない=当たる前に動けた
      if (connects) expect(w.freeBeforeHit[before] ?? 0, 'held until the stomp lands').toBe(0);
      else expect(w.freeBeforeHit[before] ?? 0, 'the boss can move before the stomp lands').toBeGreaterThan(0);
    });
  }
  it('1段目→ステップ→次の段(2段目)は入る(固まり390の内・余り約78ms)。ステップで回り込んでも段の続きがつながる', () => {
    setup();
    spawnFoe('hunter-windup');
    const w = watcher();
    hitStages(1, w);
    for (let k = 0; k < 100 && !brawlerStepAllowed(br(), gt()); k++) adv(() => w.frame());
    expect(useGameStore.getState().brawlerStep(0, -1)).toBe(true);
    const before = w.hits;
    expect(useGameStore.getState().brawlerPress()).toBe(true); // ステップの最中に押す=覚える
    expect(br().phase).toBe('idle');
    for (let k = 0; k < 120 && w.hits === before; k++) adv(() => w.frame());
    expect(w.hits, 'the next stage lands').toBe(before + 1);
    expect(br().stage, 'it is the 2nd stage (the string continues)').toBe(2);
    expect(w.freeBeforeHit[before] ?? 0, 'held until the 2nd stage lands').toBe(0);
  });
  it('ステップの最中に押した通常攻撃は、ステップが終わった時に出せない状態(掴まれている)なら捨てる。解放されても勝手に出ない(検収監査 A-2)', () => {
    setup();
    spawnFoe('hunter-windup');
    expect(useGameStore.getState().brawlerStep(1, 0)).toBe(true);
    expect(useGameStore.getState().brawlerPress()).toBe(true);
    expect(br().buffered).toBe(true);
    // 掴まれる(1.5秒)=関所が閉じる
    useGameStore.setState(st => ({ player: { ...st.player, grabbedUntil: gt() + 1500 } }));
    for (let k = 0; k < 40; k++) adv(() => {}); // ステップが終わる
    expect(br().phase).toBe('idle');
    expect(br().buffered, 'the held press is dropped while the gate is closed').toBe(false);
    for (let k = 0; k < 150; k++) { adv(() => {}); expect(br().phase, 'nothing fires after the release').toBe('idle'); }
  });
  it('ステップの最中に押した通常攻撃は、ステップが終わった瞬間に出る(待機からのステップでも同じ)', () => {
    setup();
    spawnFoe('hunter-windup');
    expect(useGameStore.getState().brawlerStep(1, 0)).toBe(true);
    const stepEnd = br().stepUntil!;
    expect(useGameStore.getState().brawlerPress()).toBe(true);
    expect(br().phase, 'no attack during the step').toBe('idle');
    expect(br().buffered).toBe(true);
    let startedAt = -1;
    for (let k = 0; k < 60 && startedAt < 0; k++) { adv(() => {}); if (br().phase === 'attack') startedAt = gt(); }
    expect(startedAt).toBeGreaterThanOrEqual(stepEnd);
    expect(startedAt - stepEnd).toBeLessThanOrEqual(60);
  });
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

describe('§20-6-4 止め続けられない', () => {
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
        expect(z.brLockHits, 'no combo memory during the no-hold time').toBeUndefined();
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
      expect(heldMs).toBeLessThan(elapsed * 0.9); // §20 で固まりが長くなった分(旧 0.75 は強個体で 0.80 になる)。コンボの後の固まらない時間が残りを空ける
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

describe('§20-6-4 秘奥義 →↓←↑(飛び蹴り→大踏み潰し→気功→構え)', () => {
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
