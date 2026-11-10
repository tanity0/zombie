// ★5段のつなぎの確定(research/BRAWLER.md §19-3・社長実機報告2026-11-09「通常攻撃で敵の硬直解除に間に合ってない。」)。
// 5段を順番どおりにつないでいる間は、固まりが必ず次の段の当たりまで続く(係数1.0・1.3/雑魚・強個体・ボス級/移動の相・硬直の相・溜めの相)。
// ★§19(2026-11-10)で書き換えた: 旧の「5段の確定」(§9-74: brawlerComboInOrder / brawlerChainGuardMs=減衰の上に被せる下限)は撤去し、
//   「①当てた時は次に動ける時まで固める・②続きを出した瞬間に、その続きが当たるまで延ばす」(brawlerLockOnHit / brawlerLockExtendPatch)に置き換えた。
//   旧の「ハメにならない=減衰と同じ技の罰でいずれ抜ける」は、「同じコンボで2回目の同じ技は固めない」「コンボの後の固まらない時間」で見る。
//   道ぜんぶ(技への取り消し・スロー・境目)は brawlerLink.store.test.ts。ここは5段のつなぎを係数1.0でも固める。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import {
  setBrawlerTempoAll, brawlerHeldNow, brawlerAirborne, brawlerLockAlive, brawlerLockHitMs, brawlerComboEndNoHoldNow,
  BRAWLER_CHAIN_GUARD_MARGIN_MS, BRAWLER_HOLD_FRAME_MARGIN_MS, BRAWLER_COMBO_END_NO_HOLD_BOSS_MS,
} from '../utils/brawlerCombo';
import { BRAWLER_TEMPO_DEFAULT, BRAWLER_CANCEL_WINDOW_MS, brawlerStageSpec } from '../utils/brawler';

const NO = { up: false, down: false, left: false, right: false } as never;
let now = 6_000_000;
const setup = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: { ...st.player, health: 9999, maxHealth: 9999, invulnerable: false, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 }, lastDirection: { x: 1, y: 0 } },
  }));
};
const place = (type: EnemyType, dx: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: p.x + p.width / 2 + dx - e.width / 2, y: p.y + p.height / 2 - e.height / 2, id, health: 999999, maxHealth: 999999, dormant: false, ...extra } as Enemy;
};
const en = () => useGameStore.getState().enemies.find(x => x.id === 'z')!;
const br = () => useGameStore.getState().player.brawler!;
const gt = () => useGameStore.getState().gameTime;
const adv = (onStep?: () => void) => {
  now += 10;
  useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
  useGameStore.getState().movePlayer(NO, 0.01);
  useGameStore.getState().tickBrawler();
  useGameStore.getState().updateEnemies(0.01);
  onStep?.();
};
/**
 * 5段をつなぐ(各段が当たった直後に次を押す=先行入力・あるいは終わってから押す)。当たりの間で敵が固まっていなかった時間(ms)と、
 * 押されていない時の移動量を返す。固まり=確定の固まり(gameTime の欄)か壁時計の欄・浮いている間も動けない(§19-3 ⑧)。
 */
const fiveChain = (pressLate: boolean) => {
  const hits: number[] = [];
  let free = 0, walked = 0, lastHit = en().lastHit, px = en().x, py = en().y;
  const watch = () => {
    const z = en();
    if (z.lastHit !== lastHit) { hits.push(z.lastHit); lastHit = z.lastHit; }
    if (hits.length >= 1 && hits.length < 5) {
      const pushed = now < (z.knockbackUntil ?? 0);
      const air = brawlerAirborne(z, now);
      if (!pushed && !air) walked += Math.hypot(z.x - px, z.y - py);
      if (!brawlerHeldNow(z, gt(), now) && !air) free += 10;
    }
    px = z.x; py = z.y;
  };
  for (let i = 0; i < 5; i++) {
    useGameStore.getState().brawlerPress();
    if (pressLate) { for (let k = 0; k < 150 && br().phase !== 'idle'; k++) adv(watch); }
    else {
      // 先行入力: この段が当たって止めが明けたら、すぐ次を押す(覚えておいて今の段の終わりに出る)
      for (let k = 0; k < 150 && !(br().stage === i + 1 && br().resolved && now >= (br().stopUntil ?? 0) + 20); k++) adv(watch);
    }
  }
  for (let k = 0; k < 150 && br().phase !== 'idle'; k++) adv(watch);
  return { hits, free, walked };
};

beforeEach(() => {
  now = 6_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

describe('5段のつなぎの確定(純関数・§19-3 ①②)', () => {
  it('①の長さ = 止め + max(受付, 今の段の後隙) + 余白34ms。次の段はその内(後隙の終わり)に出て、②で「出だしの終わり+余白60ms×係数」まで延びる', () => {
    for (const t of [1.0, 1.3]) {
      setBrawlerTempoAll(t);
      expect(BRAWLER_CHAIN_GUARD_MARGIN_MS).toBe(Math.round(60 * t));
      expect(BRAWLER_HOLD_FRAME_MARGIN_MS).toBe(34);
      for (const n of [1, 2, 3, 4]) {
        const sp = brawlerStageSpec(n);
        const lock = brawlerLockHitMs((['s1', 's2', 's3', 's4'] as const)[n - 1], sp.hitstopMs);
        expect(lock).toBe(sp.hitstopMs + Math.max(BRAWLER_CANCEL_WINDOW_MS, sp.recoveryMs) + 34);
        // 次の段を出す時刻(後隙の終わり)は①の内
        expect(sp.hitstopMs + sp.recoveryMs).toBeLessThan(lock);
      }
      expect(brawlerLockHitMs('s5', 220)).toBe(0); // 5段目は締め(固めない)
    }
  });
});

describe('5段のつなぎの確定(ストア・実際の AI)', () => {
  for (const tempo of [1.0, 1.3]) {
    for (const type of ['zombie', 'driller', 'hunter'] as const) {
      for (const late of [false, true]) {
        it(`係数${tempo}・${type}・${late ? '段が終わってから押す' : '先行入力で押す'}: 1→5段の間で一度も動けない`, () => {
          setBrawlerTempoAll(tempo);
          setup();
          useGameStore.setState({ enemies: [place(type, 60, 'z')] });
          const r = fiveChain(late);
          expect(r.hits.length).toBe(5);
          expect(r.free).toBe(0);
          expect(r.walked).toBeLessThan(0.5);
        });
      }
    }
  }
  it('硬直の相(z-recover)・溜めの相(driller の突きの溜め)の敵にも1→5段がつながる(係数1.3)', () => {
    setBrawlerTempoAll(1.3);
    for (const extra of [{ aiPhase: 'z-recover', aiPhaseUntil: 1e12 }, { aiPhase: 'driller-thrust-windup', aiPhaseUntil: 1e12 }] as Partial<Enemy>[]) {
      setup();
      const g = useGameStore.getState().gameTime;
      const type: EnemyType = extra.aiPhase === 'z-recover' ? 'zombie' : 'driller';
      useGameStore.setState({ enemies: [place(type, 60, 'z', { ...extra, aiPhaseUntil: g + 600, aiStartedAt: g })] });
      const r = fiveChain(true);
      expect(r.hits.length, String(extra.aiPhase)).toBe(5);
      expect(r.free, String(extra.aiPhase)).toBe(0);
    }
  });
  it('寄ってきたゾンビ(実際の AI・zrush/zpause)に5段: 締めまで自分では動かない(押されただけ)', () => {
    setBrawlerTempoAll(1.3);
    setup();
    useGameStore.setState({ enemies: [place('zombie', 140, 'z')] });
    for (let i = 0; i < 600 && !['zrush', 'zpause'].includes(en().aiPhase ?? ''); i++) adv();
    for (let i = 0; i < 300; i++) { const p = useGameStore.getState().player; if (Math.abs(en().x + en().width / 2 - (p.x + p.width / 2)) < 70) break; adv(); }
    const r = fiveChain(true);
    expect(r.hits.length).toBe(5);
    expect(r.free).toBe(0);
    expect(r.walked).toBeLessThan(0.5);
  });
  // ★書き換え: 旧「1段目の連打は約4秒以内に抜けられる(減衰と同じ技の罰)・5段の後の再開は減衰が効く」。
  //   新: 1段目を当てて続けなければ、固まりは①の長さで明ける。その後ボス級は1500ms 固まらない=連打では止め続けられない。5段の後の再開も同じ。
  it('ハメにならない: 1段目の連打ではボス級を止め続けられない(コンボの後1500msは固まらない)・5段の後の再開も固まらない', () => {
    setBrawlerTempoAll(1.3);
    setup();
    useGameStore.setState({ enemies: [place('hunter', 60, 'z', { aiPhase: 'windup', aiPhaseUntil: gt() + 600, aiStartedAt: gt() })] }); // 振り払わないボス級・浮かない相で数える
    let t = 0, firstFreeAt = -1, heldMs = 0, noHoldMs = 0;
    const watch = () => {
      t += 10;
      const z = en();
      const held = brawlerHeldNow(z, gt(), now) || brawlerAirborne(z, now);
      if (held) heldMs += 10;
      if (brawlerComboEndNoHoldNow(z, gt())) { noHoldMs += 10; expect(held).toBe(false); }
      if (z.lastHit > 0 && !held && firstFreeAt < 0) firstFreeAt = t;
    };
    for (let i = 0; i < 12 && t < 4000; i++) {
      // 1段目だけを連打する(つながりの受付を切って毎回1段目)
      useGameStore.setState(st => (st.player.brawler ? { player: { ...st.player, brawler: { ...st.player.brawler, nextStage: 1, chainUntil: 0 } } } : {}));
      useGameStore.getState().brawlerPress();
      for (let k = 0; k < 60 && br().phase !== 'idle'; k++) adv(watch);
    }
    expect(firstFreeAt).toBeGreaterThan(0);
    expect(firstFreeAt).toBeLessThan(500);                       // 最初の固まり(319ms)が明けたら動ける
    expect(noHoldMs).toBeGreaterThanOrEqual(BRAWLER_COMBO_END_NO_HOLD_BOSS_MS - 10);
    expect(heldMs).toBeLessThan(t * 0.4);                        // 殴り続けても、止まっているのは一部だけ
    // 5段の後にまた1段目から: 固まらない時間の間なので、確定の固まりは書かれない
    setup();
    useGameStore.setState({ enemies: [place('hunter', 60, 'z', { aiPhase: 'windup', aiPhaseUntil: gt() + 600, aiStartedAt: gt() })] });
    fiveChain(true);
    for (let k = 0; k < 20; k++) adv();
    expect(brawlerComboEndNoHoldNow(en(), gt())).toBe(true);
    useGameStore.setState(st => (st.player.brawler ? { player: { ...st.player, brawler: { ...st.player.brawler, nextStage: 1, chainUntil: 0 } } } : {}));
    useGameStore.getState().brawlerPress();
    for (let k = 0; k < 60 && !(br().resolved); k++) adv();
    expect(br().connected).toBe(true);
    expect(brawlerLockAlive(en(), gt())).toBe(false);
    expect(en().brLockMoves).toBeUndefined();
  });
});
