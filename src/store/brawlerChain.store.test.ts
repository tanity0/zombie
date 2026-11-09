// ★5段の確定(research/BRAWLER.md §9-74・社長実機報告2026-11-09「通常攻撃で敵の硬直解除に間に合ってない。」)。
// 5段を順番どおりにつないでいる間は、固まりが必ず次の段の当たりまで続く(係数1.0・1.3/雑魚・強個体・ボス級/移動の相・硬直の相)。
// 順番どおりでない当たり(1段目の連打・5段の後の再開)には減衰と同じ技の罰が効き、いずれ抜けられる(ハメにならない)。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll, brawlerComboInOrder, brawlerChainGuardMs, BRAWLER_CHAIN_GUARD_MARGIN_MS } from '../utils/brawlerCombo';
import { BRAWLER_TEMPO_DEFAULT, brawlerStageSpec } from '../utils/brawler';

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
const adv = (onStep?: () => void) => {
  now += 10;
  useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
  useGameStore.getState().movePlayer(NO, 0.01);
  useGameStore.getState().tickBrawler();
  useGameStore.getState().updateEnemies(0.01);
  onStep?.();
};
/** 5段をつなぐ(各段が終わる少し前に次を押す=先行入力・あるいは終わってから押す)。当たりの間で敵が自由に動けた時間(ms)と、押されていない時の移動量を返す。 */
const fiveChain = (pressLate: boolean) => {
  const hits: number[] = [];
  let free = 0, walked = 0, lastHit = en().lastHit, px = en().x, py = en().y;
  const watch = () => {
    const z = en();
    if (z.lastHit !== lastHit) { hits.push(z.lastHit); lastHit = z.lastHit; }
    if (hits.length >= 1 && hits.length < 5) {
      const pushed = now < (z.knockbackUntil ?? 0);
      if (!pushed) walked += Math.hypot(z.x - px, z.y - py);
      if (now >= (z.brHoldUntil ?? 0) && now >= (z.liftUntil ?? 0) && !pushed) free += 10;
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

describe('5段の確定(純関数)', () => {
  it('順番どおり=新しい流れの1段目・直前が1つ前の段。1段目の連打・5段の後の1段目・技の後の1段目は順番どおりではない', () => {
    setBrawlerTempoAll(1.3);
    expect(brawlerComboInOrder({}, 's1', 1000)).toBe(true);
    expect(brawlerComboInOrder({ brComboAt: 900, brComboLast: 's1' }, 's2', 1000)).toBe(true);
    expect(brawlerComboInOrder({ brComboAt: 900, brComboLast: 's3' }, 's4', 1000)).toBe(true);
    expect(brawlerComboInOrder({ brComboAt: 900, brComboLast: 's1' }, 's1', 1000)).toBe(false); // 連打
    expect(brawlerComboInOrder({ brComboAt: 900, brComboLast: 's5' }, 's1', 1000)).toBe(false); // ループ
    expect(brawlerComboInOrder({ brComboAt: 900, brComboLast: 'kick1' }, 's1', 1000)).toBe(false); // 技の後
    expect(brawlerComboInOrder({ brComboAt: 900, brComboLast: 's2' }, 's4', 1000)).toBe(false); // 飛ばした
    expect(brawlerComboInOrder({ brComboAt: 900, brComboLast: 's4' }, 's5', 1000)).toBe(false); // 5段目は締め
    expect(brawlerComboInOrder({ brComboAt: 900, brComboLast: 's1' }, 's2', 900 + 5000)).toBe(false); // 流れが切れた
  });
  it('続くべき長さ = 止め + 今の段の戻り + 次の段の出だし + 余裕60ms×係数', () => {
    for (const t of [1.0, 1.3]) {
      setBrawlerTempoAll(t);
      expect(BRAWLER_CHAIN_GUARD_MARGIN_MS).toBe(Math.round(60 * t));
      expect(brawlerChainGuardMs('s2', 90)).toBe(90 + brawlerStageSpec(2).recoveryMs + brawlerStageSpec(3).windupMs + Math.round(60 * t));
      expect(brawlerChainGuardMs('s5', 220)).toBe(0);
    }
  });
});

describe('5段の確定(ストア・実際の AI)', () => {
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
    for (let i = 0; i < 600 && !['zrush', 'zpause'].includes(en().aiPhase ?? '') ; i++) adv();
    for (let i = 0; i < 300; i++) { const p = useGameStore.getState().player; if (Math.abs(en().x + en().width / 2 - (p.x + p.width / 2)) < 70) break; adv(); }
    const r = fiveChain(true);
    expect(r.hits.length).toBe(5);
    expect(r.free).toBe(0);
    expect(r.walked).toBeLessThan(0.5);
  });
  it('ハメにならない: 1段目の連打は約4秒以内に抜けられる(減衰と同じ技の罰)・5段の後の再開は減衰が効く', () => {
    setBrawlerTempoAll(1.3);
    setup();
    useGameStore.setState({ enemies: [place('hunter', 60, 'z')] }); // 振り払わないボス級で数える
    let t = 0, firstFreeAt = -1;
    const watch = () => { t += 10; const z = en(); if (z.lastHit > 0 && now >= (z.brHoldUntil ?? 0) && now >= (z.knockbackUntil ?? 0) && now >= (z.liftUntil ?? 0)) { if (firstFreeAt < 0) firstFreeAt = t; } };
    for (let i = 0; i < 30 && t < 4000; i++) {
      // 1段目だけを連打する(つながりの受付が切れるのを待って毎回1段目)
      useGameStore.setState(st => (st.player.brawler ? { player: { ...st.player, brawler: { ...st.player.brawler, nextStage: 1, chainUntil: 0 } } } : {}));
      useGameStore.getState().brawlerPress();
      for (let k = 0; k < 60 && br().phase !== 'idle'; k++) adv(watch);
    }
    expect(firstFreeAt).toBeGreaterThan(0);
    expect(firstFreeAt).toBeLessThan(4000);
    // 5段の後にまた1段目から: 減衰で固まりは短い(確定ではない)
    setup();
    useGameStore.setState({ enemies: [place('hunter', 60, 'z')] });
    fiveChain(true);
    useGameStore.getState().brawlerPress();
    for (let k = 0; k < 60 && !(br().resolved); k++) adv();
    const z = en();
    expect((z.brHoldUntil ?? 0) - z.lastHit).toBeLessThan(brawlerChainGuardMs('s1', 90));
  });
});
