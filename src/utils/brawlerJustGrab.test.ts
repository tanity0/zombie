// ★ジャスト投げ・弱い構えのジャストの打ち返し(社長指示2026-11-28)の純関数。
import { describe, it, expect } from 'vitest';
import {
  brawlerJustGrabMode, brawlerJustGrabDashPx, brawlerContactShouldWait, brawlerPendingGrabStep, brawlerGuardReflectsProjectile,
  brawlerGrabClass, BRAWLER_JUST_GRAB_GAP_PX,
} from './brawlerJustGrab';
import { BRAWLER_CONTACT_PX } from './brawler';

const base = {
  just: true, counter: true, grabbing: false, throttled: false,
  cls: 'mob' as 'mob' | 'strong' | 'boss' | null | undefined, airborne: false, targetable: true, inReach: true,
};

describe('brawlerJustGrabMode', () => {
  it('ジャストの近接の受け: 雑魚=スープレックス / 強個体・ボス級=サマーソルト(密着の構えと同じ区分)', () => {
    expect(brawlerJustGrabMode(base)).toBe('suplex');
    expect(brawlerJustGrabMode({ ...base, cls: 'strong' })).toBe('flipkick');
    expect(brawlerJustGrabMode({ ...base, cls: 'boss' })).toBe('flipkick');
  });
  it('投げない: ジャストでない・弱い構え・掴みの最中・間引き・弾・光線・持続ダメージ', () => {
    expect(brawlerJustGrabMode({ ...base, just: false })).toBeNull();
    expect(brawlerJustGrabMode({ ...base, counter: false })).toBeNull();
    expect(brawlerJustGrabMode({ ...base, grabbing: true })).toBeNull();
    expect(brawlerJustGrabMode({ ...base, throttled: true })).toBeNull();
    expect(brawlerJustGrabMode({ ...base, projectile: true })).toBeNull();
    expect(brawlerJustGrabMode({ ...base, beam: true })).toBeNull();
    expect(brawlerJustGrabMode({ ...base, dot: true })).toBeNull();
  });
  it('投げない: 相手が分からない・投げられない区分・空中・相手にできない・届かない', () => {
    expect(brawlerJustGrabMode({ ...base, cls: undefined })).toBeNull();
    expect(brawlerJustGrabMode({ ...base, cls: null })).toBeNull();
    expect(brawlerJustGrabMode({ ...base, airborne: true })).toBeNull();
    expect(brawlerJustGrabMode({ ...base, targetable: false })).toBeNull();
    expect(brawlerJustGrabMode({ ...base, inReach: false })).toBeNull();
  });
});

describe('brawlerJustGrabDashPx', () => {
  it('密着の内ならその場で掴む(0)・外なら隙間を少し残して寄る', () => {
    expect(brawlerJustGrabDashPx(0, BRAWLER_CONTACT_PX)).toBe(0);
    expect(brawlerJustGrabDashPx(BRAWLER_CONTACT_PX, BRAWLER_CONTACT_PX)).toBe(0);
    expect(brawlerJustGrabDashPx(60, BRAWLER_CONTACT_PX)).toBe(60 - BRAWLER_JUST_GRAB_GAP_PX);
    // 寄った後の隙間は密着の内に収まる
    expect(BRAWLER_JUST_GRAB_GAP_PX).toBeLessThan(BRAWLER_CONTACT_PX);
  });
});

describe('brawlerContactShouldWait', () => {
  it('密着した相手が攻撃中の時だけ待つ', () => {
    expect(brawlerContactShouldWait(true)).toBe(true);
    expect(brawlerContactShouldWait(false)).toBe(false);
  });
});

describe('brawlerPendingGrabStep', () => {
  const g = { phase: 'tech' as const, tech: 'guard' as const };
  it('待ちが無ければ何もしない', () => {
    expect(brawlerPendingGrabStep({ ...g }, true, 0, 0)).toEqual({ kind: 'keep' });
  });
  it('構えでなくなったら捨てる', () => {
    expect(brawlerPendingGrabStep({ ...g, justGrab: { enemyId: 'a', at: 100 } }, false, 200, 0)).toEqual({ kind: 'drop' });
    expect(brawlerPendingGrabStep({ phase: 'tech', tech: 'stomp', justGrab: { enemyId: 'a', at: 100 } }, true, 200, 0)).toEqual({ kind: 'drop' });
    expect(brawlerPendingGrabStep({ phase: 'idle', tech: null, contactWait: { enemyId: 'a', at: 100 } }, true, 0, 200)).toEqual({ kind: 'drop' });
  });
  it('吸い付き: 時刻(壁時計)と器の期限の遅い方で掴む', () => {
    const s = { ...g, justGrab: { enemyId: 'a', at: 100 } };
    expect(brawlerPendingGrabStep(s, true, 99, 0)).toEqual({ kind: 'keep' });
    expect(brawlerPendingGrabStep(s, true, 100, 0)).toEqual({ kind: 'grab', enemyId: 'a' });
    expect(brawlerPendingGrabStep(s, true, 150, 0, 180)).toEqual({ kind: 'keep' }); // スローで器が延びている
    expect(brawlerPendingGrabStep(s, true, 180, 0, 180)).toEqual({ kind: 'grab', enemyId: 'a' });
  });
  it('密着の待ち: ゲーム内の時刻で窓の終わりに掴む', () => {
    const s = { ...g, contactWait: { enemyId: 'b', at: 500 } };
    expect(brawlerPendingGrabStep(s, true, 99999, 499)).toEqual({ kind: 'keep' });
    expect(brawlerPendingGrabStep(s, true, 0, 500)).toEqual({ kind: 'grab', enemyId: 'b' });
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
