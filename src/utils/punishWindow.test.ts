// BOT_AND_GHOST.md §2.18追補(バッチGHOST-CMD-2A): 隙(punish window)の窓判定+票の状態機械。
// 計測(playerTraits)と消費(ghostDriver)が共有する純関数=ここで直接固定する。
import { describe, it, expect } from 'vitest';
import {
  isBossStunnedNow, isBossRecoverNowApprox, isAfterCounterWindow, punishWindowsOpen,
  activePunishContext, createPunishEpisodeState, createPunishTally, stepPunishEpisodes,
  closePunishEpisodes, blendPunishProfile, punishModeStat,
  PUNISH_AFTER_COUNTER_MS, PUNISH_CONTEXTS, PUNISH_DEFAULT_MODE,
} from './punishWindow';
import type { Enemy } from '../types/game';

const boss = (over: Partial<Enemy> = {}): Enemy => ({
  id: 'b', x: 0, y: 0, width: 40, height: 40, speed: 0, health: 100, maxHealth: 100,
  damage: 10, type: 'thor', experienceValue: 0, lastHit: 0, lastShot: 0, ...over,
} as unknown as Enemy);

describe('punishWindow: 窓の判定(既存の述語・語尾流儀の流用)', () => {
  it('stun: 既存の気絶述語と同式(stunUntilが未来の間だけtrue)', () => {
    expect(isBossStunnedNow(boss({ stunUntil: 1000 }), 999)).toBe(true);
    expect(isBossStunnedNow(boss({ stunUntil: 1000 }), 1000)).toBe(false);
    expect(isBossStunnedNow(boss(), 0)).toBe(false);
  });

  it('stun: 完全気絶(紫)も同式で入る(gameStoreがstunUntilを同時に打つため)', () => {
    expect(isBossStunnedNow(boss({ stunUntil: 5000, bossFullStunUntil: 5000 }), 100)).toBe(true);
  });

  it('recover: 語尾 -recover(汎用/城ボスg-*/天使系)と旧来の素の recover を拾う', () => {
    expect(isBossRecoverNowApprox(undefined, 'harai-recover')).toBe(true);
    expect(isBossRecoverNowApprox('g-stomp-recover', undefined)).toBe(true);
    expect(isBossRecoverNowApprox('recover', undefined)).toBe(true);
    expect(isBossRecoverNowApprox('windup', 'harai-windup')).toBe(false);
    expect(isBossRecoverNowApprox(undefined, 'chase')).toBe(false);
  });

  it('afterCounter: 成立から PUNISH_AFTER_COUNTER_MS 未満だけ開く(未成立は常に閉)', () => {
    expect(isAfterCounterWindow(1000, 1000)).toBe(true);
    expect(isAfterCounterWindow(1000, 1000 + PUNISH_AFTER_COUNTER_MS - 1)).toBe(true);
    expect(isAfterCounterWindow(1000, 1000 + PUNISH_AFTER_COUNTER_MS)).toBe(false);
    expect(isAfterCounterWindow(undefined, 5000)).toBe(false);
    expect(isAfterCounterWindow(0, 5000)).toBe(false);
  });

  it('punishWindowsOpen: boss=null なら stun/recover は閉じる(afterCounterは独立)', () => {
    const open = punishWindowsOpen(null, 0, 100, 200);
    expect(open).toEqual({ stun: false, recover: false, afterCounter: true });
  });

  it('activePunishContext: PUNISH_CONTEXTSの順(stun>recover>afterCounter)で1つ選ぶ', () => {
    expect(PUNISH_CONTEXTS).toEqual(['stun', 'recover', 'afterCounter']);
    expect(activePunishContext({ stun: true, recover: true, afterCounter: true })).toBe('stun');
    expect(activePunishContext({ stun: false, recover: true, afterCounter: true })).toBe('recover');
    expect(activePunishContext({ stun: false, recover: false, afterCounter: false })).toBeNull();
  });
});

describe('punishWindow: 1エピソード1票の状態機械', () => {
  const closed = { stun: false, recover: false, afterCounter: false };
  const stunOpen = { ...closed, stun: true };

  it('窓中に近接与ダメが増えたら rush・増えなければ shoot(閉じた瞬間に1票)', () => {
    const st = createPunishEpisodeState();
    const tally = createPunishTally();
    stepPunishEpisodes(st, tally, stunOpen, 100);   // 開く
    stepPunishEpisodes(st, tally, stunOpen, 130);   // 窓中に近接30
    expect(tally.stun).toEqual({ rush: 0, shoot: 0 }); // まだ閉じていない=票は入らない
    stepPunishEpisodes(st, tally, closed, 130);      // 閉じる=1票
    expect(tally.stun).toEqual({ rush: 1, shoot: 0 });

    stepPunishEpisodes(st, tally, stunOpen, 130);
    stepPunishEpisodes(st, tally, closed, 130);      // 近接なし
    expect(tally.stun).toEqual({ rush: 1, shoot: 1 });
  });

  it('窓の外で出た近接ダメージは数えない(起点は窓が開いた瞬間の累計)', () => {
    const st = createPunishEpisodeState();
    const tally = createPunishTally();
    stepPunishEpisodes(st, tally, closed, 0);
    stepPunishEpisodes(st, tally, closed, 500);      // 窓の外で500ダメージ
    stepPunishEpisodes(st, tally, stunOpen, 500);    // 開く(起点=500)
    stepPunishEpisodes(st, tally, closed, 500);      // 窓中は0
    expect(tally.stun).toEqual({ rush: 0, shoot: 1 });
  });

  it('文脈ごとに独立(recoverの窓の票はstunに入らない)', () => {
    const st = createPunishEpisodeState();
    const tally = createPunishTally();
    stepPunishEpisodes(st, tally, { ...closed, recover: true }, 0);
    stepPunishEpisodes(st, tally, closed, 40);
    expect(tally.recover).toEqual({ rush: 1, shoot: 0 });
    expect(tally.stun).toEqual({ rush: 0, shoot: 0 });
    expect(tally.afterCounter).toEqual({ rush: 0, shoot: 0 });
  });

  it('closePunishEpisodes: 開いたままの窓もセッション確定時に票になる', () => {
    const st = createPunishEpisodeState();
    const tally = createPunishTally();
    stepPunishEpisodes(st, tally, stunOpen, 0);
    closePunishEpisodes(st, tally, 10);
    expect(tally.stun).toEqual({ rush: 1, shoot: 0 });
  });
});

describe('punishWindow: プロファイル混合(dodgeDirと同じ数式)', () => {
  it('初記録はサンプルそのまま・2回目以降はEMA・nは累計', () => {
    const t1 = createPunishTally();
    t1.stun.rush = 3; t1.stun.shoot = 1;
    const first = blendPunishProfile(undefined, t1, 0.3)!;
    expect(first.stun).toEqual({ n: 4, rushRate: 0.75 });

    const t2 = createPunishTally();
    t2.stun.rush = 0; t2.stun.shoot = 2; // サンプル=0
    const second = blendPunishProfile(first, t2, 0.3)!;
    expect(second.stun!.n).toBe(6);
    expect(second.stun!.rushRate).toBeCloseTo(0.75 * 0.7 + 0 * 0.3, 10);
  });

  it('票が無い文脈は前回値を維持(全文脈0票ならprevをそのまま返す=欠損なら欠損のまま)', () => {
    const prev = { stun: { n: 2, rushRate: 1 } };
    expect(blendPunishProfile(prev, createPunishTally(), 0.3)).toBe(prev);
    expect(blendPunishProfile(undefined, createPunishTally(), 0.3)).toBeUndefined();
    const t = createPunishTally();
    t.recover.shoot = 1;
    const merged = blendPunishProfile(prev, t, 0.3)!;
    expect(merged.stun).toEqual({ n: 2, rushRate: 1 });
    expect(merged.recover).toEqual({ n: 1, rushRate: 0 });
  });

  it('punishModeStat: 消費側の{n, rate}形へ(欠損はundefined=デフォルトへ)', () => {
    expect(punishModeStat({ stun: { n: 5, rushRate: 0.4 } }, 'stun')).toEqual({ n: 5, rate: 0.4 });
    expect(punishModeStat(undefined, 'stun')).toBeUndefined();
    expect(punishModeStat({}, 'recover')).toBeUndefined();
    expect(PUNISH_DEFAULT_MODE).toBe('rush'); // 社長裁定「数値がなければ詰めて叩く」
  });
});
