import { describe, it, expect, afterEach } from 'vitest';
import {
  addHateDamage, pickHateTarget, resolveBossHateAim, resolveBossLockedHateAim, setHateEscortProvider,
  escortHateSide, escortIdOfSide, hateNearRamp,
  HATE_NEAR_WEIGHT, HATE_NEAR_FAR_PX, HATE_NEAR_FULL_PX, HATE_STICKY_MULT,
  type PickHateTargetInput, type HateEscortCandidate,
} from './bossHate';

const E = (id: string, x: number, y: number): HateEscortCandidate => ({ id, x, y });
const base = (o: Partial<PickHateTargetInput> = {}): PickHateTargetInput => ({
  enemyCenter: { x: 0, y: 0 },
  player: { x: 300, y: 0 },
  ghost: null,
  escorts: [],
  playerHateBuckets: undefined, ghostHateBuckets: undefined, escortHateBuckets: undefined,
  gameTime: 1000, currentTarget: undefined,
  ...o,
});

describe('近さの点(§5): 600pxで0 → 160px以内で1(直線)', () => {
  it('定数と直線', () => {
    expect(HATE_NEAR_WEIGHT).toBe(0.6);
    expect(HATE_NEAR_FAR_PX).toBe(600);
    expect(HATE_NEAR_FULL_PX).toBe(160);
    expect(hateNearRamp(700)).toBe(0);
    expect(hateNearRamp(600)).toBe(0);
    expect(hateNearRamp(160)).toBe(1);
    expect(hateNearRamp(10)).toBe(1);
    expect(hateNearRamp(380)).toBeCloseTo(0.5, 6); // 600→160 の中点
  });
});

describe('escortHateSide / escortIdOfSide', () => {
  it('往復できる・player/ghost は軍人ではない', () => {
    expect(escortHateSide('escort-2')).toBe('escort:escort-2');
    expect(escortIdOfSide('escort:escort-2')).toBe('escort-2');
    expect(escortIdOfSide('player')).toBeUndefined();
    expect(escortIdOfSide('ghost')).toBeUndefined();
    expect(escortIdOfSide(undefined)).toBeUndefined();
  });
});

describe('pickHateTarget(§5・§11)', () => {
  it('守護霊も軍人も居なければ常に player(旧挙動・ヘイト計算しない)', () => {
    expect(pickHateTarget(base({ playerHateBuckets: addHateDamage(undefined, 1000, 99) }))).toBe('player');
  });
  it('全員0ダメージ(開幕)は粘着なしで一番近い相手=今と同じ(軍人も候補)', () => {
    expect(pickHateTarget(base({ escorts: [E('a', 100, 0)] }))).toBe(escortHateSide('a'));
    expect(pickHateTarget(base({ escorts: [E('a', 500, 0)] }))).toBe('player');
    // 守護霊が近ければ守護霊(従来と同じ)
    expect(pickHateTarget(base({ ghost: { x: 50, y: 0 }, escorts: [E('a', 100, 0)] }))).toBe('ghost');
    // 0ダメージでは粘着しない(今の相手がプレイヤーでも、近い軍人へ)
    expect(pickHateTarget(base({ escorts: [E('a', 100, 0)], currentTarget: 'player' }))).toBe(escortHateSide('a'));
  });
  it('同距離はプレイヤー(同点はプレイヤー)', () => {
    expect(pickHateTarget(base({ player: { x: 200, y: 0 }, escorts: [E('a', -200, 0)] }))).toBe('player');
    expect(pickHateTarget(base({ player: { x: 200, y: 0 }, ghost: { x: 0, y: 200 } }))).toBe('player');
  });
  it('攻撃し続けている人がほぼ狙われる(ダメージの割合が支配)', () => {
    const pb = addHateDamage(undefined, 1000, 100);
    expect(pickHateTarget(base({ playerHateBuckets: pb, escorts: [E('a', 100, 0)] }))).toBe('player'); // 遠くから撃つプレイヤー(300px)
    const eb = { a: addHateDamage(undefined, 1000, 100) };
    expect(pickHateTarget(base({ escortHateBuckets: eb, escorts: [E('a', 100, 0)], player: { x: 650, y: 0 } }))).toBe(escortHateSide('a'));
  });
  it('プレイヤーが手を止めると、ボスの近くで撃っている軍人へ向く', () => {
    const eb = { a: addHateDamage(undefined, 1000, 40) };
    // プレイヤーはダメージ0(止まっている)・軍人は撃っている。ダメージ割合: 軍人 1.0 / プレイヤー 0
    expect(pickHateTarget(base({ escortHateBuckets: eb, escorts: [E('a', 200, 0)], player: { x: 250, y: 0 } }))).toBe(escortHateSide('a'));
  });
  it('プレイヤーがボスと軍人の間に立てば、近さで狙いを取り返せる(ダメージ割合の差が近さの重み0.6以内の時)', () => {
    // 軍人 60% / プレイヤー 40% のダメージ割合。プレイヤーが160px以内(近さ1.0)・軍人が600px以遠(近さ0)なら
    // プレイヤー 0.4+0.6=1.0 > 軍人 0.6+0=0.6。
    const pb = addHateDamage(undefined, 1000, 40);
    const eb = { a: addHateDamage(undefined, 1000, 60) };
    expect(pickHateTarget(base({
      playerHateBuckets: pb, escortHateBuckets: eb, player: { x: 100, y: 0 }, escorts: [E('a', 700, 0)],
    }))).toBe('player');
    // 立ち位置が逆(軍人が近い)なら軍人
    expect(pickHateTarget(base({
      playerHateBuckets: pb, escortHateBuckets: eb, player: { x: 700, y: 0 }, escorts: [E('a', 100, 0)],
    }))).toBe(escortHateSide('a'));
  });
  it('今の相手には ×1.3 の粘着(僅差で入れ替わらない)', () => {
    const pb = addHateDamage(undefined, 1000, 50);
    const eb = { a: addHateDamage(undefined, 1000, 52) };
    const common = { playerHateBuckets: pb, escortHateBuckets: eb, player: { x: 300, y: 0 }, escorts: [E('a', 300, 0)] };
    expect(HATE_STICKY_MULT).toBe(1.3);
    expect(pickHateTarget(base({ ...common, currentTarget: 'player' }))).toBe('player');
    expect(pickHateTarget(base({ ...common, currentTarget: escortHateSide('a') }))).toBe(escortHateSide('a'));
  });
  it('窓外(6秒より前)のダメージは数えない', () => {
    const old = { a: addHateDamage(undefined, 0, 999) };
    // 7秒後: 軍人のダメージは窓の外=全員0 → 一番近い相手(プレイヤー 100px)
    expect(pickHateTarget(base({ gameTime: 7000, escortHateBuckets: old, escorts: [E('a', 200, 0)], player: { x: 100, y: 0 } }))).toBe('player');
  });
  it('複数の軍人: 軍人ごとのバケツで比べる・同点は並びの先', () => {
    const eb = { a: addHateDamage(undefined, 1000, 10), b: addHateDamage(undefined, 1000, 30) };
    expect(pickHateTarget(base({ escortHateBuckets: eb, escorts: [E('a', 300, 0), E('b', 300, 0)], player: { x: 900, y: 0 } }))).toBe(escortHateSide('b'));
  });
});

describe('resolveBossHateAim / resolveBossLockedHateAim と軍人の提供口', () => {
  const boss = { id: 'boss-1', x: 0, y: 0, width: 40, height: 40 };
  afterEach(() => setHateEscortProvider(null));

  it('提供口が空(未登録)なら従来どおり(守護霊が居なければ player)', () => {
    const aim = resolveBossHateAim(boss, { x: 300, y: 0 }, [], 1000);
    expect(aim.side).toBe('player');
    expect(aim.escort).toBeUndefined();
  });
  it('提供された画面内の軍人が一番近ければ、その軍人の中心座標と速度・足元が返る', () => {
    setHateEscortProvider(() => ({ inView: [{ id: 'escort-1', x: 120, y: 30, vx: 40, vy: -10, footY: 44 }], alive: [] }));
    const aim = resolveBossHateAim(boss, { x: 600, y: 0 }, [], 1000);
    expect(aim.side).toBe('escort:escort-1');
    expect(aim.x).toBe(120);
    expect(aim.y).toBe(30);
    expect(aim.escort).toEqual({ id: 'escort-1', vx: 40, vy: -10, footY: 44 });
  });
  it('明示で渡した軍人の一覧は提供口より優先する', () => {
    setHateEscortProvider(() => ({ inView: [{ id: 'x', x: 1, y: 1 }], alive: [] }));
    const aim = resolveBossHateAim(boss, { x: 600, y: 0 }, [], 1000, { inView: [], alive: [] });
    expect(aim.side).toBe('player');
  });
  it('ボスの軍人バケツ(hateEscortBuckets)が効く', () => {
    setHateEscortProvider(() => ({ inView: [{ id: 'a', x: 300, y: 0 }, { id: 'b', x: 300, y: 0 }], alive: [] }));
    const e = { ...boss, hateEscortBuckets: { b: addHateDamage(undefined, 1000, 77) } };
    expect(resolveBossHateAim(e, { x: 900, y: 0 }, [], 1000).side).toBe('escort:b');
  });
  it('ロック済みの狙いは再評価せず同じ軍人を追う(画面外へ出ても倒れていなければ)', () => {
    setHateEscortProvider(() => ({ inView: [], alive: [{ id: 'a', x: 777, y: 5, vx: 1, vy: 2, footY: 20 }] }));
    const locked = resolveBossLockedHateAim({ ...boss, hateTarget: 'escort:a' }, { x: 0, y: 0 }, []);
    expect(locked.side).toBe('escort:a');
    expect(locked.x).toBe(777);
    expect(locked.escort?.footY).toBe(20);
  });
  it('ロックした軍人が倒れた/居なくなったらプレイヤーへ戻す(守護霊が消えた時と同じ扱い)', () => {
    setHateEscortProvider(() => ({ inView: [], alive: [] }));
    const locked = resolveBossLockedHateAim({ ...boss, hateTarget: 'escort:a' }, { x: 5, y: 6 }, []);
    expect(locked).toEqual({ x: 5, y: 6, side: 'player' });
  });
  it('守護霊のロックは従来どおり(軍人の提供口があっても影響しない)', () => {
    setHateEscortProvider(() => ({ inView: [{ id: 'a', x: 1, y: 1 }], alive: [{ id: 'a', x: 1, y: 1 }] }));
    const ghost = { x: 100, y: 200, width: 20, height: 20, kind: 'ghost-ally', ghostBossId: 'boss-1' };
    expect(resolveBossLockedHateAim({ ...boss, hateTarget: 'ghost' }, { x: 300, y: 0 }, [ghost])).toEqual({ x: 110, y: 210, side: 'ghost' });
  });
});
