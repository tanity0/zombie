// 救急鞄: 投げた空鞄が爆発(着弾)した瞬間に、持ち主の鞄の中身が全部補充される(社長指示2026-11-25
// 「救急鞄は爆発の後、補充される様にしよう」)。純関数は utils/firstAidKit.test.ts、ここは配線
// (spawnThrownBag → tickThrownBags の爆発で store.firstAidKitState / 守護霊の ghostFirstAidKit が戻る)。
import { describe, it, expect, beforeEach, vi } from 'vitest';

const botFlag = vi.hoisted(() => ({ on: false }));
vi.mock('../utils/botFlag', () => ({ BOT_PARAM: null, isBotRun: () => botFlag.on }));

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => { mem.clear(); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;

const { useGameStore, THROWN_BAG_FLIGHT_MS } = await import('./gameStore');
const { spawnEnemyAt } = await import('../utils/enemyUtils');
const { createFirstAidKitState, refillFirstAidKit, computeFirstAidKitTick, isFirstAidKitEmpty, createGhostFirstAidKitState } = await import('../utils/firstAidKit');
import type { FirstAidKitState } from '../utils/firstAidKit';
import type { Summon } from '../types/game';

const st = () => useGameStore.getState();
const emptyThrown: FirstAidKitState = {
  ...createFirstAidKitState(),
  ammoHandgunDispensed: true, ammoShotgunDispensed: true, ammoRifleDispensed: true,
  healDispensed: true, bombDispensed: true, thrown: true, anyDispensed: true,
};

describe('救急鞄: 爆発で補充', () => {
  beforeEach(() => { st().resetGame('warrior'); });

  const throwAt = (opts: { ghostId?: string; targetAlive: boolean }) => {
    const p = st().player;
    const e = { ...spawnEnemyAt('zombie', p.x + 200, p.y, 0), id: 'z', health: 99999, maxHealth: 99999 };
    useGameStore.setState({ enemies: opts.targetAlive ? [e] : [] });
    const tgt = { id: 'z', x: e.x + e.width / 2, y: e.y + e.height / 2 };
    st().spawnThrownBag(p.x, p.y, tgt, 5, opts.ghostId ? 1 : undefined, opts.ghostId);
  };

  it('プレイヤーの鞄: 飛んでいる間は空のまま、爆発した瞬間に初期状態へ戻る', () => {
    useGameStore.setState({ firstAidKitState: emptyThrown });
    throwAt({ targetAlive: true });
    useGameStore.setState(s => ({ gameTime: s.gameTime + THROWN_BAG_FLIGHT_MS - 1 }));
    st().tickThrownBags();
    expect(st().firstAidKitState).toEqual(emptyThrown);
    useGameStore.setState(s => ({ gameTime: s.gameTime + 1 }));
    st().tickThrownBags();
    expect(st().firstAidKitState).toEqual(refillFirstAidKit('player'));
    expect(st().thrownBags).toHaveLength(0);
  });

  it('対象が着弾前に消えていても(記録した足元で爆発)補充される', () => {
    useGameStore.setState({ firstAidKitState: emptyThrown });
    throwAt({ targetAlive: false });
    useGameStore.setState(s => ({ gameTime: s.gameTime + THROWN_BAG_FLIGHT_MS }));
    st().tickThrownBags();
    expect(st().firstAidKitState).toEqual(refillFirstAidKit('player'));
  });

  it('守護霊の鞄: その守護霊の在庫だけが守護霊の初期在庫へ戻り、プレイヤーの鞄は触らない', () => {
    const ghost = { id: 'g1', ghostFirstAidKit: emptyThrown } as unknown as Summon;
    const other = { id: 'g2', ghostFirstAidKit: emptyThrown } as unknown as Summon;
    useGameStore.setState({ summons: [ghost, other], firstAidKitState: emptyThrown });
    throwAt({ ghostId: 'g1', targetAlive: true });
    useGameStore.setState(s => ({ gameTime: s.gameTime + THROWN_BAG_FLIGHT_MS }));
    st().tickThrownBags();
    const g1 = st().summons.find(s => s.id === 'g1');
    const g2 = st().summons.find(s => s.id === 'g2');
    expect(g1?.ghostFirstAidKit).toEqual(refillFirstAidKit('ghost'));
    expect(g2?.ghostFirstAidKit).toEqual(emptyThrown);
    expect(st().firstAidKitState).toEqual(emptyThrown);
  });
});

// useGameLoop の救急鞄ブロック(プレイヤー/守護霊)と同じ配線を1フレームずつ回す(useGameLoop はテストから
// 直接回せないため、同じ純関数と同じ store アクションを同じ順で呼ぶ)。払い出された弾は拾わない=予備弾0のまま。
describe('救急鞄: 補充の後は条件が新しく起きた時だけ(社長裁定2026-11-25)', () => {
  beforeEach(() => { st().resetGame('warrior'); });
  const FRAME_MS = 16;

  const placeEnemy = () => {
    const p = st().player;
    const e = { ...spawnEnemyAt('zombie', p.x + 200, p.y, 0), id: 'z', health: 99999, maxHealth: 99999 };
    useGameStore.setState({ enemies: [e] });
    return { id: 'z', x: e.x + e.width / 2, y: e.y + e.height / 2 };
  };

  it('プレイヤー: 銃3種の予備弾0のまま拾わずに数秒回しても、払い出し3回(各銃種1回)と投擲1回しか起きない', () => {
    const tgt = placeEnemy();
    let dispenses = 0;
    let throws = 0;
    for (let f = 0; f < Math.ceil(5000 / FRAME_MS); f++) {
      useGameStore.setState(s => ({ gameTime: s.gameTime + FRAME_MS }));
      st().tickThrownBags();
      const now = st().firstAidKitState;
      const r = computeFirstAidKitTick({
        level: 1, ammoTypesUsed: ['handgun', 'shotgun', 'rifle'],
        ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0,
        health: 100, maxHealth: 100, onScreenEnemyCount: 0, state: now,
      });
      if (r.nextState !== now) st().setFirstAidKitState(r.nextState);
      if (r.dispense) dispenses++;
      if (!r.nextState.thrown && isFirstAidKitEmpty(r.nextState, 1)) {
        st().spawnThrownBag(0, 0, tgt, 5);
        st().setFirstAidKitState({ ...r.nextState, thrown: true });
        throws++;
      }
    }
    expect(dispenses).toBe(3);
    expect(throws).toBe(1);
    // 爆発で補充されたが、弾0のまま一度も解けていない=立ち上がり待ちで止まっている
    expect(st().firstAidKitState.thrown).toBe(false);
    expect(st().firstAidKitState.anyDispensed).toBe(false);
    expect(st().thrownBags).toHaveLength(0);
  });

  it('守護霊Lv1: 敵がいる間ずっと回しても鞄を投げない(出撃開始時も)', () => {
    const tgt = placeEnemy();
    useGameStore.setState({ summons: [{ id: 'g1', ghostFirstAidKit: createGhostFirstAidKitState() } as unknown as Summon] });
    let throws = 0;
    for (let f = 0; f < Math.ceil(5000 / FRAME_MS); f++) {
      useGameStore.setState(s => ({ gameTime: s.gameTime + FRAME_MS }));
      st().tickThrownBags();
      const kit = st().summons[0].ghostFirstAidKit!;
      const r = computeFirstAidKitTick({
        level: 1, ammoTypesUsed: [], ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0,
        health: 10, maxHealth: 100, onScreenEnemyCount: 0, state: kit,
      });
      if (!r.nextState.thrown && isFirstAidKitEmpty(r.nextState, 1)) {
        st().spawnThrownBag(0, 0, tgt, 5, 1, 'g1');
        throws++;
      }
    }
    expect(throws).toBe(0);
    expect(st().thrownBags).toHaveLength(0);
  });
});
