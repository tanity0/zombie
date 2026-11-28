// ★密着のスープレックスのジャスト(密着の構えの待ち)・ジャストカウンターの弾の打ち返し・掴みの区分(社長指示2026-11-28)の純関数。
import { describe, it, expect } from 'vitest';
import {
  brawlerContactShouldWait, brawlerContactWaitStep, brawlerGuardReflectsProjectile, brawlerJustStompReflects, brawlerGrabClass,
} from './brawlerJustGrab';

describe('brawlerContactShouldWait', () => {
  it('密着した相手が攻撃中の時だけ待つ', () => {
    expect(brawlerContactShouldWait(true)).toBe(true);
    expect(brawlerContactShouldWait(false)).toBe(false);
  });
});

describe('brawlerContactWaitStep', () => {
  const g = { phase: 'tech' as const, tech: 'guard' as const };
  it('待ちが無ければ何もしない', () => {
    expect(brawlerContactWaitStep({ ...g }, true, 0)).toEqual({ kind: 'keep' });
  });
  it('構えでなくなったら捨てる', () => {
    expect(brawlerContactWaitStep({ ...g, contactWait: { enemyId: 'a', at: 100 } }, false, 0)).toEqual({ kind: 'drop' });
    expect(brawlerContactWaitStep({ phase: 'tech', tech: 'stomp', contactWait: { enemyId: 'a', at: 100 } }, true, 0)).toEqual({ kind: 'drop' });
    expect(brawlerContactWaitStep({ phase: 'idle', tech: null, contactWait: { enemyId: 'a', at: 100 } }, true, 200)).toEqual({ kind: 'drop' });
  });
  it('ゲーム内の時刻で窓の終わりに掴む', () => {
    const s = { ...g, contactWait: { enemyId: 'b', at: 500 } };
    expect(brawlerContactWaitStep(s, true, 499)).toEqual({ kind: 'keep' });
    expect(brawlerContactWaitStep(s, true, 500)).toEqual({ kind: 'grab', enemyId: 'b' });
  });
});

describe('brawlerGrabClass', () => {
  it('幻影(汎用・孫悟空)は雑魚として掴む / それ以外は区分のまま', () => {
    expect(brawlerGrabClass({ type: 'guardian-phantom' }, 'boss')).toBe('mob');
    expect(brawlerGrabClass({ type: 'hunter' }, 'boss')).toBe('boss');
    expect(brawlerGrabClass({ type: 'zombie' }, 'strong')).toBe('strong');
  });
});

describe('brawlerGuardReflectsProjectile', () => {
  it('払った構え=全部打ち返す / 弱い構え=ジャストの窓の内だけ / 構えでなければ打ち返さない', () => {
    expect(brawlerGuardReflectsProjectile({ guarding: true, weak: false, just: false })).toBe(true);
    expect(brawlerGuardReflectsProjectile({ guarding: true, weak: false, just: true })).toBe(true);
    expect(brawlerGuardReflectsProjectile({ guarding: true, weak: true, just: true })).toBe(true);
    expect(brawlerGuardReflectsProjectile({ guarding: true, weak: true, just: false })).toBe(false);
    expect(brawlerGuardReflectsProjectile({ guarding: false, weak: false, just: true })).toBe(false);
  });
});

describe('brawlerJustStompReflects', () => {
  it('ジャストで出た地割りの最中だけ true', () => {
    expect(brawlerJustStompReflects({ phase: 'tech', tech: 'stomp', justStomp: true })).toBe(true);
    expect(brawlerJustStompReflects({ phase: 'tech', tech: 'stomp' })).toBe(false);
    expect(brawlerJustStompReflects({ phase: 'idle', tech: null, justStomp: true })).toBe(false);
    expect(brawlerJustStompReflects({ phase: 'tech', tech: 'kick', justStomp: true })).toBe(false);
    expect(brawlerJustStompReflects(undefined)).toBe(false);
  });
});
