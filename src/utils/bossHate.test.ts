import { describe, it, expect } from 'vitest';
import {
  addHateDamage, hateTotal, pickHateSide, resolveHateAimTarget, resolveBossHateAim, resolveBossLockedHateAim,
  isHateTrackedBossType, HATE_WINDOW_MS, HATE_BUCKETS, HATE_BUCKET_MS, HATE_STICKY_MULT,
  type HateBucket, type PickHateSideInput,
} from './bossHate';

describe('bossHate 定数(BOT_AND_GHOST.md §2.8 G2.5)', () => {
  it('直近6秒を1秒バケツ×6で近似する', () => {
    expect(HATE_WINDOW_MS).toBe(6000);
    expect(HATE_BUCKETS).toBe(6);
    expect(HATE_BUCKET_MS).toBe(1000);
  });

  it('isHateTrackedBossType: 守護霊と共闘できる全ボスだけtrue', () => {
    expect(isHateTrackedBossType('giantbat')).toBe(true);
    expect(isHateTrackedBossType('idol')).toBe(true);
    for (const t of ['miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel']) {
      expect(isHateTrackedBossType(t)).toBe(true);
    }
    for (const t of ['mimir', 'jormungand', 'skadi', 'thor']) {
      expect(isHateTrackedBossType(t)).toBe(true);
    }
    expect(isHateTrackedBossType('zombie')).toBe(false);
  });
});

describe('addHateDamage / hateTotal(バケツ回転・6秒窓)', () => {
  it('同じ1秒バケツ内の複数回ダメージは合算される', () => {
    let b = addHateDamage(undefined, 100, 10);
    b = addHateDamage(b, 500, 5);
    expect(hateTotal(b, 900)).toBe(15);
  });

  it('dmg<=0は無変化(バケツを増やさない)', () => {
    const b = addHateDamage(undefined, 100, 0);
    expect(hateTotal(b, 100)).toBe(0);
    const b2 = addHateDamage(undefined, 100, -5);
    expect(hateTotal(b2, 100)).toBe(0);
  });

  it('直近6秒(6バケツ)は合算され、窓の外(7秒以上前)は無視される', () => {
    let b: HateBucket[] | undefined = undefined;
    // 0,1000,2000,3000,4000,5000ms に1ダメージずつ(6バケツぶん埋める)。
    for (let i = 0; i < 6; i++) b = addHateDamage(b, i * 1000, 1);
    // 5999ms時点: 0〜5000msの6バケツ全部が窓内(6000ms窓)。
    expect(hateTotal(b, 5999)).toBe(6);
    // 6999ms時点でもidx=0(0ms)のバケツは minIdx=6999/1000|0 - 5 = 1 なのでidx=0は窓外。
    // 6000ms時点: nowIdx=6, minIdx=1 → idx=0(0ms)は窓外に落ちる=合計5。
    expect(hateTotal(b, 6000)).toBe(5);
  });

  it('バケツ数は固定6件(6秒より前のダメージで古いバケツ番号のスロットが上書きされる)', () => {
    // 同じスロット(idx%6)に新しいidxが来ると上書き(=リングバッファ)。
    let b = addHateDamage(undefined, 0, 10);       // idx=0, slot=0
    b = addHateDamage(b, 6000, 7);                 // idx=6, slot=0 → 上書き
    expect(hateTotal(b, 6000)).toBe(7); // 古い10msぶんの10は窓外+スロット上書きの両方で消える
  });

  it('gameTimeが未定義の空配列は0', () => {
    expect(hateTotal(undefined, 1000)).toBe(0);
    expect(hateTotal([], 1000)).toBe(0);
  });
});

describe('pickHateSide / resolveHateAimTarget', () => {
  const baseInput = (overrides: Partial<PickHateSideInput> = {}): PickHateSideInput => ({
    enemyCenter: { x: 0, y: 0 },
    player: { x: 100, y: 0 },
    ghost: { x: -100, y: 0 },
    playerHateBuckets: undefined,
    ghostHateBuckets: undefined,
    gameTime: 1000,
    currentTarget: undefined,
    ...overrides,
  });

  it('ゴースト不在(null)は常にplayer(仕様5=完全に旧挙動)', () => {
    const input = baseInput({ ghost: null, playerHateBuckets: undefined, ghostHateBuckets: undefined });
    expect(pickHateSide(input)).toBe('player');
    const aim = resolveHateAimTarget(input);
    expect(aim.side).toBe('player');
    expect(aim.x).toBe(100); // playerの座標をそのまま返す
  });

  it('両者ダメージ0(開幕等)は近い方を狙う', () => {
    // ghostがenemyCenterに近い場合。
    const near = baseInput({ enemyCenter: { x: 0, y: 0 }, player: { x: 500, y: 0 }, ghost: { x: 10, y: 0 } });
    expect(pickHateSide(near)).toBe('ghost');
    // playerが近い場合。
    const far = baseInput({ enemyCenter: { x: 0, y: 0 }, player: { x: 10, y: 0 }, ghost: { x: 500, y: 0 } });
    expect(pickHateSide(far)).toBe('player');
  });

  it('直近6秒ダメージが多い方を狙う(粘着なし=currentTarget未設定)', () => {
    const gBuckets = addHateDamage(undefined, 1000, 50);
    const pBuckets = addHateDamage(undefined, 1000, 10);
    const input = baseInput({ playerHateBuckets: pBuckets, ghostHateBuckets: gBuckets, currentTarget: undefined });
    expect(pickHateSide(input)).toBe('ghost');
  });

  it('現ターゲットに×1.3の粘着(僅差の入れ替わりを防ぐ)', () => {
    // ghostのダメージがplayerよりわずかに多い(10 vs 12=1.2倍)が、現在ターゲットがplayerなら
    // player*1.3=13 > ghost12 でplayerのまま(パタパタしない)。
    const pBuckets = addHateDamage(undefined, 1000, 10);
    const gBuckets = addHateDamage(undefined, 1000, 12);
    const stickyToPlayer = baseInput({ playerHateBuckets: pBuckets, ghostHateBuckets: gBuckets, currentTarget: 'player' });
    expect(pickHateSide(stickyToPlayer)).toBe('player');

    // 差が粘着係数を超えて大きければ(ghostが player*1.3 を超える)入れ替わる。
    const gBucketsBig = addHateDamage(undefined, 1000, 20);
    const flips = baseInput({ playerHateBuckets: pBuckets, ghostHateBuckets: gBucketsBig, currentTarget: 'player' });
    expect(pickHateSide(flips)).toBe('ghost');
  });

  it('HATE_STICKY_MULT=1.3固定(仕様値)', () => {
    expect(HATE_STICKY_MULT).toBe(1.3);
  });

  it('resolveHateAimTargetはside=ghostの時ghostの座標を返す', () => {
    const gBuckets = addHateDamage(undefined, 1000, 50);
    const input = baseInput({ ghostHateBuckets: gBuckets, ghost: { x: -42, y: 7 } });
    const aim = resolveHateAimTarget(input);
    expect(aim.side).toBe('ghost');
    expect(aim.x).toBe(-42);
    expect(aim.y).toBe(7);
  });
});

describe('resolveBossHateAim(ボス側の呼び出しヘルパ)', () => {
  const enemy = {
    id: 'boss-1', x: 0, y: 0, width: 40, height: 40,
    hatePlayerBuckets: undefined, hateGhostBuckets: undefined, hateTarget: undefined,
  };

  it('summonsにこのボスへ紐づくghost-allyが居なければ常にplayer', () => {
    const aim = resolveBossHateAim(enemy, { x: 300, y: 0 }, [], 1000);
    expect(aim.side).toBe('player');
    expect(aim.x).toBe(300);
  });

  it('紐づいていない別ボス宛のghost-allyは無視する', () => {
    const otherGhost = { x: 5, y: 0, width: 30, height: 30, kind: 'ghost-ally', ghostBossId: 'boss-2' };
    const aim = resolveBossHateAim(enemy, { x: 300, y: 0 }, [otherGhost], 1000);
    expect(aim.side).toBe('player');
  });

  it('kind!=="ghost-ally"の召喚(通常/レア錬金術)は対象外', () => {
    const normalSummon = { x: 5, y: 0, width: 30, height: 30, kind: 'normal', ghostBossId: 'boss-1' };
    const aim = resolveBossHateAim(enemy, { x: 300, y: 0 }, [normalSummon], 1000);
    expect(aim.side).toBe('player');
  });

  it('紐づくghost-allyが居てダメージ差がghost優位なら中心座標(x+width/2)を返す', () => {
    const ghostAlly = { x: 100, y: 200, width: 20, height: 20, kind: 'ghost-ally', ghostBossId: 'boss-1' };
    const e = { ...enemy, hateGhostBuckets: addHateDamage(undefined, 1000, 999) };
    const aim = resolveBossHateAim(e, { x: 0, y: 0 }, [ghostAlly], 1000);
    expect(aim.side).toBe('ghost');
    expect(aim.x).toBe(110); // 100 + 20/2
    expect(aim.y).toBe(210); // 200 + 20/2
  });

  it('resolveBossLockedHateAimは技途中でヘイトを再評価せず、固定した側だけを追う', () => {
    const ghostAlly = { x: 100, y: 200, width: 20, height: 20, kind: 'ghost-ally', ghostBossId: 'boss-1' };
    const locked = resolveBossLockedHateAim({ ...enemy, hateTarget: 'ghost' }, { x: 300, y: 0 }, [ghostAlly]);
    expect(locked).toEqual({ x: 110, y: 210, side: 'ghost' });

    const fallback = resolveBossLockedHateAim({ ...enemy, hateTarget: 'ghost' }, { x: 300, y: 0 }, []);
    expect(fallback).toEqual({ x: 300, y: 0, side: 'player' });
  });
});
