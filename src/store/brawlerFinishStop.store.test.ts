// ★格闘の決め技は止めを長く(research/HITSTOP.md §7・社長指示2026-11-27「KOFを参考に」)を store で実際に回す。
//  ・決め技(抉り打ち・地割り・踵落とし・蹴り飛ばし・5段目・秘奥義の締め)の当たりで、自分と相手の止めが係数の分だけ伸びる。相手の震えも係数の長さ・幅。
//  ・軽い段・つなぎの技(1〜4段・飛び蹴り1/2発目)の止めは今のまま。
//  ・止めが伸びた分、その後の取り消しの受付(地割り→飛び蹴り/気功・踵落とし→地割り)は止めが明けてから数える=受付の長さは削られない。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setKenkiLevelForTest } from '../utils/kenkiLevel';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import {
  BRAWLER_WORLD_STOP, BRAWLER_WORLD_STOP_KICK3, BRAWLER_WORLD_STOP_SELF_MS, BRAWLER_CANCEL_WINDOW_MS, initialBrawlerState, brawlerCancelWindowOpen, brawlerInHitstop, brawlerElapsed, brawlerSelfHeightPx, BRAWLER_AIR_EPS_PX,
} from '../utils/brawler';
import { BRAWLER_GOUGE_CHARGE_MS } from '../utils/brawlerGouge';
import { BRAWLER_FINISH_STOP, brawlerShakeAmpMul } from '../utils/brawlerFinishStop';
import type { Enemy } from '../types/game';

setBrawlerTempoAll(1.0);
let now = 8_000_000;
const NO_INPUT = { up: false, down: false, left: false, right: false } as never;

const setup = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true }, hitstopUntil: 0, swipeDirection: null,
    inputState: { up: false, down: false, left: false, right: false },
    player: {
      ...st.player, health: 99999, maxHealth: 99999, invulnerable: false, skills: [] as never, skillLevels: {}, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 },
      lastDirection: { x: 1, y: 0 }, brawler: { ...initialBrawlerState(), points: 20 },
    },
  }));
};
const zombieAt = (dx: number, dy: number, id: string): Enemy => {
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: p.x + p.width / 2 + dx - e.width / 2, y: p.y + p.height / 2 + dy - e.height / 2, id, health: 999999, maxHealth: 999999, dormant: false } as Enemy;
};
const br = () => useGameStore.getState().player.brawler!;
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const hs = () => useGameStore.getState().hitstopUntil;
const advance = (ms: number) => {
  const end = now + ms;
  while (now < end) {
    now += 10;
    if (now - 10 < hs()) continue;
    useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
    useGameStore.getState().movePlayer(NO_INPUT, 0.01);
    useGameStore.getState().tickBrawler();
  }
};
/** 判定を解く瞬間まで1msずつ進め、その瞬間の相手の止め・自分の止め・震えの長さを返す。 */
const untilResolved = (id = 'z') => {
  for (let i = 0; i < 400 && !br().resolved; i++) advance(10);
  expect(br().resolved).toBe(true);
  const e = en(id);
  return { at: now, stun: (e.hitStunUntil ?? 0) - now, self: br().stopUntil - br().stopFrom, shake: (e.brawlerShakeUntil ?? 0) - now, amp: brawlerShakeAmpMul(e) };
};
const K = BRAWLER_FINISH_STOP;

beforeEach(() => {
  setKenkiLevelForTest(5);
  now = 8_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('決め技の止めと震えが係数の分だけ伸びる(HITSTOP.md §7)', () => {
  it('通常1〜4段は今のまま・5段目は止め ×1.6・震え ×1.3', () => {
    const base = [0, BRAWLER_WORLD_STOP.weak, BRAWLER_WORLD_STOP.weak, BRAWLER_WORLD_STOP.strong, BRAWLER_WORLD_STOP.strong, BRAWLER_WORLD_STOP.closer];
    for (let stage = 1; stage <= 5; stage++) {
      setup();
      useGameStore.setState(st => ({ enemies: [zombieAt(45, 0, 'z')], player: { ...st.player, brawler: { ...st.player.brawler!, nextStage: stage, chainUntil: 9e15 } } }));
      expect(useGameStore.getState().brawlerPress()).toBe(true);
      const r = untilResolved();
      expect(br().connected, `stage ${stage}`).toBe(true);
      const stop = stage === 5 ? Math.round(base[5] * K.palm.stop) : base[stage];
      const shake = stage === 5 ? Math.round(base[5] * K.palm.shakeLen) : base[stage];
      expect(r.stun, `stage ${stage}`).toBe(stop);
      expect(r.self, `stage ${stage}`).toBe(stop + BRAWLER_WORLD_STOP_SELF_MS);
      expect(r.shake, `stage ${stage} shake`).toBe(shake);
      expect(r.amp).toBe(1);
    }
  });
  it('飛び蹴り: 1・2発目は今のまま・3発目(蹴り飛ばし)は ×1.6・踵落としは ×1.5', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(120, 0, 'z')] });
    const got: number[] = [];
    const shakes: number[] = [];
    for (let n = 1; n <= 3; n++) {
      expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true);
      for (let i = 0; i < 80 && br().kickN !== n; i++) advance(10);
      expect(br().kickN).toBe(n);
      const r = untilResolved();
      expect(br().connected).toBe(true);
      got.push(r.stun); shakes.push(r.shake);
      expect(r.self).toBe(r.stun + BRAWLER_WORLD_STOP_SELF_MS);
      advance(10);
    }
    expect(got).toEqual([BRAWLER_WORLD_STOP.strong, BRAWLER_WORLD_STOP.strong, Math.round(BRAWLER_WORLD_STOP_KICK3 * K.kick3.stop)]);
    expect(shakes).toEqual([BRAWLER_WORLD_STOP.strong, BRAWLER_WORLD_STOP.strong, Math.round(BRAWLER_WORLD_STOP_KICK3 * K.kick3.shakeLen)]);
    setup();
    useGameStore.setState({ enemies: [zombieAt(120, 0, 'z')] });
    for (let n = 1; n <= 2; n++) { expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true); for (let i = 0; i < 80 && br().kickN !== n; i++) advance(10); untilResolved(); advance(10); }
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    for (let i = 0; i < 80 && !(br().kickN === 3 && br().kickHeel); i++) advance(10);
    const h = untilResolved();
    expect(br().connected).toBe(true);
    expect(h.stun).toBe(Math.round(BRAWLER_WORLD_STOP.closer * K.heel.stop));
    expect(h.shake).toBe(Math.round(BRAWLER_WORLD_STOP.closer * K.heel.shakeLen));
  });
  it('地割り: 止め ×1.5・震え ×1.2(1体)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(40, 0, 'z')] });
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    const r = untilResolved();
    expect(br().connected).toBe(true);
    expect(r.stun).toBe(Math.round(BRAWLER_WORLD_STOP.closer * K.stomp.stop));
    expect(r.self).toBe(r.stun + BRAWLER_WORLD_STOP_SELF_MS);
    expect(r.shake).toBe(Math.round(BRAWLER_WORLD_STOP.closer * K.stomp.shakeLen));
  });
  it('抉り打ち: 止め ×1.8・震えは同じだけ長く・幅 ×1.6(幅の印は次の普通の当たりで1に戻る)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'z')] });
    useGameStore.getState().brawlerGougePress();
    advance(BRAWLER_GOUGE_CHARGE_MS + 20);
    expect(useGameStore.getState().brawlerGougeRelease()).toBe('gouge');
    useGameStore.getState().brawlerGougeClear();
    const r = untilResolved();
    expect(br().tech).toBe('gouge');
    expect(br().connected).toBe(true);
    expect(r.stun).toBe(Math.round(BRAWLER_WORLD_STOP.strong * K.gouge.stop));
    expect(r.shake).toBe(r.stun);
    expect(r.amp).toBe(1.6);
    // 震えが明けた後に別の(決め技でない)震えが書かれたら、幅は今のまま(1)。
    const e = en('z');
    expect(brawlerShakeAmpMul({ ...e, brawlerShakeUntil: (e.brawlerShakeUntil ?? 0) + 50 })).toBe(1);
  });
});

describe('滞空中の決め技の止め(BRAWLER.md §40-4 の自分の高さと両立)', () => {
  it('空中で出した踵落としは、伸びた止めの間ずっと当てた高さで止まり、止めが明けてから降りる', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(120, 0, 'z')] });
    for (let n = 1; n <= 2; n++) { expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true); for (let i = 0; i < 80 && br().kickN !== n; i++) advance(10); untilResolved(); advance(10); }
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    for (let i = 0; i < 80 && !(br().kickN === 3 && br().kickHeel); i++) advance(10);
    untilResolved();
    expect(br().connected).toBe(true);
    const gt = () => useGameStore.getState().gameTime;
    const h0 = brawlerSelfHeightPx(br(), gt());
    expect(h0).toBeGreaterThan(BRAWLER_AIR_EPS_PX); // 空中で当てた
    const stopEnd = br().stopUntil;
    expect(stopEnd - gt()).toBeGreaterThan(Math.round(BRAWLER_WORLD_STOP.closer * K.heel.stop) - 10);
    const hs0: number[] = [];
    while (gt() + 10 < stopEnd) { advance(10); hs0.push(brawlerSelfHeightPx(br(), gt())); }
    for (const h of hs0) expect(h).toBeCloseTo(h0, 6); // 止めの間は高さが動かない(落ちない)
    advance(200);
    expect(brawlerSelfHeightPx(br(), gt())).toBeLessThan(h0); // 明けてから降りる
  });
});

describe('止めが伸びても取り消しの受付は止めが明けてから数える(削られない)', () => {
  /** 判定を解いてから 1ms ずつ進め、受付が開いていた gameTime の長さと、開いた時に止めが明けていたかを返す。 */
  const measureWindow = (): { openMs: number; openedInStop: boolean; stopLen: number; want: number } => {
    const stopLen = br().stopUntil - br().stopFrom;
    let openMs = 0, openedInStop = false;
    const t0 = useGameStore.getState().gameTime;
    // 判定はループの刻み(10ms)で解くので、解いた時点で受付の時計が少し(over)進んでいることがある=止めとは無関係の分だけ短い。
    const over = Math.max(0, brawlerElapsed(br(), t0) - br().windupMs);
    const want = BRAWLER_CANCEL_WINDOW_MS - over;
    for (let dt = 0; dt < stopLen + BRAWLER_CANCEL_WINDOW_MS + 200; dt++) {
      const s = br();
      const t = t0 + dt;
      if (brawlerCancelWindowOpen(s, t)) { openMs++; if (brawlerInHitstop(s, t)) openedInStop = true; }
    }
    return { openMs, openedInStop, stopLen, want };
  };
  it('地割り(止め ×1.5)の後の受付は止めの間は閉じ、明けてから受付の長さだけ開く', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(40, 0, 'z')] });
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    untilResolved();
    const w = measureWindow();
    expect(w.stopLen).toBe(Math.round(BRAWLER_WORLD_STOP.closer * K.stomp.stop) + BRAWLER_WORLD_STOP_SELF_MS);
    expect(w.openedInStop).toBe(false);
    expect(w.openMs).toBe(w.want);
    expect(w.want).toBeGreaterThan(BRAWLER_CANCEL_WINDOW_MS - 10);
  });
  it('地割りの止めの最中に押した飛び蹴りは止めが明けてから出る(受付の中=取り消しが通る)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(40, 0, 'z'), zombieAt(160, 0, 'far')] });
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    untilResolved();
    const stopEnd = br().stopUntil;
    advance(Math.round((stopEnd - useGameStore.getState().gameTime) / 2 / 10) * 10); // 止めの真ん中
    expect(br().tech).toBe('stomp');
    useGameStore.getState().brawlerTech(1, 0);
    for (let i = 0; i < 80 && br().tech !== 'kick'; i++) advance(10);
    expect(br().tech).toBe('kick');
    expect(useGameStore.getState().gameTime).toBeGreaterThanOrEqual(stopEnd);
  });
  it('踵落とし(止め ×1.5)の後の受付も止めが明けてから受付の長さだけ開く', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(120, 0, 'z')] });
    for (let n = 1; n <= 2; n++) { expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true); for (let i = 0; i < 80 && br().kickN !== n; i++) advance(10); untilResolved(); advance(10); }
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    for (let i = 0; i < 80 && !(br().kickN === 3 && br().kickHeel); i++) advance(10);
    untilResolved();
    expect(br().connected).toBe(true);
    const w = measureWindow();
    expect(w.stopLen).toBe(Math.round(BRAWLER_WORLD_STOP.closer * K.heel.stop) + BRAWLER_WORLD_STOP_SELF_MS);
    expect(w.openedInStop).toBe(false);
    expect(w.openMs).toBe(w.want);
    expect(w.want).toBeGreaterThan(BRAWLER_CANCEL_WINDOW_MS - 10);
  });
});
