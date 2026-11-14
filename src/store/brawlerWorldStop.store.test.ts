// ★格闘の当たりの止め(社長指示2026-11-12「格闘の技が当たった時のストップ時間を少し長く」→ 2026-11-14「全体で止めるのではなく、個体の方に変更」)。
//  旧は当たった瞬間に画面全体を BRAWLER_WORLD_STOP の長さだけ止めていた。今は画面全体は止めず(hitstopUntil は立たない)、同じ長さを
//  自分と当たった相手だけに掛ける(相手の止め=壁時計で同じ長さ/自分の止め=同じ長さ+BRAWLER_WORLD_STOP_SELF_MS)。
//  ・当たった技すべて(1〜5段・飛び蹴り3連・踵落とし・大踏み潰し・秘奥義の締め)で、相手の止めが BRAWLER_WORLD_STOP の長さ(蹴り飛ばしは BRAWLER_WORLD_STOP_KICK3)
//  ・外れた時・四神舞の最中(今どおり自分と相手だけの止め=段の表の長さ)・孫悟空(格闘の幻影)の当たりでは、画面全体は止まらない
//  ・止めの最中の入力は覚えて、止めが明けた最初のフレームで出す(旧と同じ)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import {
  BRAWLER_WORLD_STOP, BRAWLER_WORLD_STOP_KICK3, BRAWLER_WORLD_STOP_SELF_MS, BRAWLER_HITSTOP, brawlerWorldStopMs, initialBrawlerState, brawlerInHitstop, brawlerInFreezeStop,
} from '../utils/brawler';
import { runPhantomTick, createPhantomTickState, NOOP_PHANTOM_SFX } from '../utils/phantomTick';
import { setPhantomIdentity } from '../utils/phantomIdentity';
import { uniquePhantomSpec } from '../data/uniquePhantoms';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy, EnemyType } from '../types/game';

setBrawlerTempoAll(1.0);
let now = 7_000_000;
const NO_INPUT = { up: false, down: false, left: false, right: false } as never;

const setup = (points = 20) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true }, hitstopUntil: 0,
    player: {
      ...st.player, health: 99999, maxHealth: 99999, invulnerable: false, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 },
      lastDirection: { x: 1, y: 0 }, brawler: { ...initialBrawlerState(), points },
    },
  }));
};
const zombieAt = (dx: number, dy: number, id: string, type: EnemyType = 'zombie'): Enemy => {
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: p.x + p.width / 2 + dx - e.width / 2, y: p.y + p.height / 2 + dy - e.height / 2, id, health: 999999, maxHealth: 999999, dormant: false } as Enemy;
};
const br = () => useGameStore.getState().player.brawler!;
const hs = () => useGameStore.getState().hitstopUntil;
/** ゲームループ相当(画面全体の止めの間は壁時計だけ進める=実機のループと同じ)。 */
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
/** 判定を解く瞬間まで進め、その瞬間の(壁時計・狙った相手 id の止めの明け(壁時計)・自分の止めの長さ)を返す。画面全体は止まらないことも見る。 */
const untilResolved = (id = 'z'): { at: number; until: number; selfStop: number } => {
  for (let i = 0; i < 400 && !br().resolved; i++) advance(10);
  expect(br().resolved).toBe(true);
  expect(hs(), '画面全体は止めない').toBeLessThanOrEqual(now);
  const e = useGameStore.getState().enemies.find(x => x.id === id);
  return { at: now, until: e?.hitStunUntil ?? 0, selfStop: br().stopUntil - br().stopFrom };
};

beforeEach(() => {
  now = 7_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); setTreesDisabled(false); setTorchesDisabled(false); });

describe('格闘: 当たりの止めの表(旧の画面全体の止めの長さ=今は自分と相手だけに掛ける)', () => {
  it('弱110・強180・締め260(自分と相手だけの止めの表 90/150/220 から引く)。0 は 0', () => {
    expect(BRAWLER_WORLD_STOP).toEqual({ weak: 110, strong: 180, closer: 260 });
    expect(BRAWLER_HITSTOP).toEqual({ weak: 90, strong: 150, closer: 220 });
    expect([BRAWLER_HITSTOP.weak, BRAWLER_HITSTOP.strong, BRAWLER_HITSTOP.closer, 0].map(brawlerWorldStopMs)).toEqual([110, 180, 260, 0]);
  });
});

describe('格闘の当たりは自分と相手だけを旧の画面全体の止めと同じ長さだけ止める(社長指示2026-11-14)', () => {
  it('1〜5段: 当たった瞬間に相手は段の強さの長さだけ止まる・自分の止めは同じ長さ+1ms', () => {
    const want = [0, BRAWLER_WORLD_STOP.weak, BRAWLER_WORLD_STOP.weak, BRAWLER_WORLD_STOP.strong, BRAWLER_WORLD_STOP.strong, BRAWLER_WORLD_STOP.closer];
    for (let stage = 1; stage <= 5; stage++) {
      setup();
      useGameStore.setState(st => ({ enemies: [zombieAt(45, 0, 'z')], player: { ...st.player, brawler: { ...st.player.brawler!, nextStage: stage, chainUntil: 9e15 } } }));
      expect(useGameStore.getState().brawlerPress()).toBe(true);
      expect(br().stage).toBe(stage);
      const r = untilResolved();
      expect(br().connected, `stage ${stage}`).toBe(true);
      expect(r.until - r.at, `stage ${stage}`).toBe(want[stage]);
      expect(r.selfStop, `stage ${stage} self stop`).toBe(want[stage] + BRAWLER_WORLD_STOP_SELF_MS);
    }
  });
  it('飛び蹴り3連(1・2発目=強・3発目=蹴り飛ばし専用の長さ=§33-2)と踵落とし(締め)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(120, 0, 'z')] });
    const got: number[] = [];
    for (let n = 1; n <= 3; n++) {
      expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true);
      // 止めの最中に押した次の蹴りは覚えて、止めが明けてから出る(旧の画面全体の止めの間と同じ)
      for (let i = 0; i < 60 && br().kickN !== n; i++) advance(10);
      expect(br().kickN).toBe(n);
      const r = untilResolved();
      expect(br().connected).toBe(true);
      got.push(r.until - r.at);
      expect(r.selfStop).toBe(r.until - r.at + BRAWLER_WORLD_STOP_SELF_MS);
      advance(10);
    }
    expect(got).toEqual([BRAWLER_WORLD_STOP.strong, BRAWLER_WORLD_STOP.strong, BRAWLER_WORLD_STOP_KICK3]);
    expect(BRAWLER_WORLD_STOP_KICK3).toBe(340);
    // 踵落とし(2発目の後の下)
    setup();
    useGameStore.setState({ enemies: [zombieAt(120, 0, 'z')] });
    for (let n = 1; n <= 2; n++) { expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true); for (let i = 0; i < 60 && br().kickN !== n; i++) advance(10); untilResolved(); advance(10); }
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    for (let i = 0; i < 60 && !(br().kickN === 3 && br().kickHeel); i++) advance(10);
    expect(br().kickHeel).toBe(true);
    const h = untilResolved();
    expect(br().connected).toBe(true);
    expect(h.until - h.at).toBe(BRAWLER_WORLD_STOP.closer);
  });
  it('大踏み潰し: 何体に当たっても画面全体は止めず、当たった相手それぞれが締めの長さだけ止まる', () => {
    setup();
    const orig = useGameStore.getState().triggerHitstop;
    const calls: number[] = [];
    useGameStore.setState({ triggerHitstop: (ms: number) => { calls.push(ms); orig(ms); } });
    useGameStore.setState({ enemies: [zombieAt(40, 0, 'a'), zombieAt(-40, 0, 'b'), zombieAt(0, 40, 'c')] });
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    const r = untilResolved('a');
    expect(br().connected).toBe(true);
    expect(r.until - r.at).toBe(BRAWLER_WORLD_STOP.closer);
    expect(calls).toEqual([]); // 画面全体は止めない
    expect(r.selfStop).toBe(BRAWLER_WORLD_STOP.closer + BRAWLER_WORLD_STOP_SELF_MS);
    for (const e of useGameStore.getState().enemies) expect(e.hitStunUntil, e.id).toBe(r.until);
  });
  it('秘奥義の締め(着地): 画面全体は止めず、当たった相手が締めの長さだけ止まる', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(120, 0, 'a'), zombieAt(-90, 30, 'b')], viewZoom: 1 });
    useGameStore.setState(st => ({ camera: { x: st.player.x + st.player.width / 2 - st.gameBounds.width / 2, y: st.player.y + st.player.height / 2 - st.gameBounds.height / 2 } }));
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) { useGameStore.getState().brawlerTech(dx, dy); advance(350); }
    let landAt = -1, landUntil = -1;
    for (let i = 0; i < 1500 && landAt < 0; i++) {
      const before = br().secret?.phase;
      advance(10);
      if (before !== 'land' && br().secret?.phase === 'land') { landAt = now; landUntil = Math.max(...useGameStore.getState().enemies.map(e => e.hitStunUntil ?? 0)); }
    }
    expect(landAt).toBeGreaterThan(0);
    expect(hs()).toBeLessThanOrEqual(landAt);
    expect(landUntil - landAt).toBe(BRAWLER_WORLD_STOP.closer);
  });
  it('外れた時は止まらない(段・飛び蹴り・大踏み潰し)', () => {
    setup();
    useGameStore.setState({ enemies: [] });
    useGameStore.getState().brawlerPress(); untilResolved();
    expect(hs()).toBe(0);
    advance(600);
    useGameStore.getState().brawlerTech(1, 0); untilResolved();
    expect(hs()).toBe(0);
    advance(600);
    useGameStore.getState().brawlerTech(0, 1); untilResolved();
    expect(br().connected).toBe(false);
    expect(hs()).toBe(0);
  });
  it('気功は弾なので止めない(今どおり)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(-200, 0, 'k')] });
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    for (let i = 0; i < 100; i++) advance(10);
    expect(useGameStore.getState().enemies[0].health).toBeLessThan(999999);
    expect(hs()).toBe(0);
  });
  it('四神舞の最中は画面全体を止めない(今どおり自分と相手だけの止め)', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(45, 0, 'z')], rhythm: { ...st.rhythm, active: true } }));
    useGameStore.getState().brawlerPress();
    const r = untilResolved();
    expect(br().connected).toBe(true);
    expect(hs()).toBe(0);
    expect(r.selfStop).toBe(BRAWLER_HITSTOP.weak);
  });
});

describe('孫悟空(格闘の幻影)の当たりでは画面全体を止めない(今どおり)', () => {
  it('拳鬼がプレイヤーを殴っても格闘の画面全体の止め(triggerHitstop)は呼ばれない(被弾のストップは今どおり別の仕組み)', () => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('warrior');
    const k = uniquePhantomSpec('brawler');
    setPhantomIdentity({ name: k.name, profile: k.profile, source: 'unique' });
    const START = 10_000_000, O = 50_000;
    const e = spawnEnemyAt('guardian-phantom', O, O, START);
    Object.assign(e, { id: 'kenki', phantomUnique: 'brawler', phantomBuild: k.profile.snapshot, health: 100000, maxHealth: 100000, dormant: false, bossState: 'chase' });
    useGameStore.setState(s => ({
      m0Unlocked: { ...s.m0Unlocked, melee: true, crit: true }, enemies: [e], projectiles: [], gameTime: START, hitstopUntil: 0,
      player: { ...s.player, x: e.x + e.width / 2 + 50 - s.player.width / 2, y: e.y + e.height / 2 - s.player.height / 2, health: 99999, maxHealth: 99999, invulnerable: false, invulnerableTime: 0 },
    }));
    const orig = useGameStore.getState().triggerHitstop;
    const calls: number[] = [];
    useGameStore.setState({ triggerHitstop: (ms: number) => { calls.push(ms); orig(ms); } });
    const st = createPhantomTickState();
    let gt = START;
    for (let i = 0; i < 600 && useGameStore.getState().player.health >= 99999; i++) {
      gt += 16; now += 16;
      useGameStore.setState(s => ({ gameTime: gt, player: { ...s.player, invulnerable: false, invulnerableTime: 0 } }));
      const en = useGameStore.getState().enemies.find(x => x.id === 'kenki');
      if (!en) break;
      runPhantomTick(en, st, gt, 0.016, 1, now, NOOP_PHANTOM_SFX, () => 0.999);
    }
    expect(useGameStore.getState().player.health).toBeLessThan(99999); // 殴られた
    expect(calls).toEqual([]);
  });
});

describe('止めの最中の入力は今どおり覚えて、止めが明けた最初のフレームで出す', () => {
  it('1段目の止め(自分と相手だけ)の最中に押した大踏み潰しは、その場では出ず、止めが明けてから出る', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'z')] });
    useGameStore.getState().brawlerPress();
    untilResolved();
    expect(brawlerInHitstop(br(), useGameStore.getState().gameTime)).toBe(true); // 自分の止め=覚える側へ回す
    expect(brawlerInFreezeStop(br(), useGameStore.getState().gameTime)).toBe(true);
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    expect(br().phase).toBe('attack');      // その場では出ない
    expect(br().techBuffer).toBe('stomp');
    const stopEnd = br().stopUntil;
    advance(BRAWLER_WORLD_STOP.weak + 10);  // 止めが明けた最初のフレーム
    expect(br().tech).toBe('stomp');
    expect(br().startAt).toBeGreaterThanOrEqual(stopEnd);
    expect(br().startAt - stopEnd).toBeLessThanOrEqual(10);
  });
});
