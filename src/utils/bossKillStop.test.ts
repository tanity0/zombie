import { describe, it, expect } from 'vitest';
import {
  BOSS_KILL_SLOW, bossKillBySubWeapon, bossKillSlowAfterStop, longerHitstopUntil,
  PLAYER_FATAL_STOP_MS, playerHurtStopUntil, playerDeathTimeline,
} from './bossKillStop';
import { computeTimeSlowScale } from './timeSlowCurve';

describe('ボス撃破のスローの張り直し(止め→スローで等速へ)', () => {
  it('スローの長さ=止め+戻り・保持=止め+今の保持', () => {
    const r = bossKillSlowAfterStop(5000);
    expect(r).toEqual({ scale: 0.35, durationMs: 5000 + BOSS_KILL_SLOW.ms, holdMs: 5000 + BOSS_KILL_SLOW.holdMs });
  });
  it('止めが無ければ今のスロー(0.35×520・保持90)のまま', () => {
    expect(bossKillSlowAfterStop(0)).toEqual({ scale: 0.35, durationMs: 520, holdMs: 90 });
    expect(bossKillSlowAfterStop(-30)).toEqual({ scale: 0.35, durationMs: 520, holdMs: 90 });
  });
  it('止めが明けた瞬間はまだ一番遅い(スローが止めの中で使い切られない)', () => {
    const stop = 5200, t0 = 1000;
    const r = bossKillSlowAfterStop(stop);
    const at = (dt: number) => computeTimeSlowScale(t0 + dt, t0, t0 + r.durationMs, r.scale, r.holdMs);
    expect(at(stop)).toBeCloseTo(0.35, 6);
    expect(at(stop + BOSS_KILL_SLOW.holdMs + BOSS_KILL_SLOW.ms)).toBeCloseTo(1, 6);
  });
  it('走っている止めを縮めない', () => {
    expect(longerHitstopUntil(9000, 2000)).toBe(9000);
    expect(longerHitstopUntil(1000, 2000)).toBe(2000);
  });
});

describe('致命の止め(240ms 以上)', () => {
  const now = 10_000;
  const base = { amount: 30, prevHealth: 20, newHealth: 0, dot: false, leverGuardFull: false, tierStopMs: 190 };
  it('とどめの一撃は 240ms 以上(段の止めより長い方)', () => {
    expect(playerHurtStopUntil(0, now, base)).toBe(now + PLAYER_FATAL_STOP_MS);
    expect(PLAYER_FATAL_STOP_MS).toBe(240);
    expect(playerHurtStopUntil(0, now, { ...base, tierStopMs: 300 })).toBe(now + 300);
  });
  it('継続ダメージで倒れた時も張る', () => {
    expect(playerHurtStopUntil(0, now, { ...base, dot: true })).toBe(now + 240);
  });
  it('走っている長い止めは縮めない', () => {
    expect(playerHurtStopUntil(now + 900, now, base)).toBe(now + 900);
  });
  it('倒れない被弾は今のまま(段の止め・継続ダメージとレバーガードは張らない)', () => {
    const alive = { ...base, newHealth: 5, tierStopMs: 70 };
    expect(playerHurtStopUntil(0, now, alive)).toBe(now + 70);
    expect(playerHurtStopUntil(0, now, { ...alive, dot: true })).toBe(0);
    expect(playerHurtStopUntil(0, now, { ...alive, leverGuardFull: true })).toBe(0);
  });
  it('HP0 の後(死亡演出中)・ダメージ0 には張らない', () => {
    expect(playerHurtStopUntil(0, now, { ...base, prevHealth: 0 })).toBe(0);
    expect(playerHurtStopUntil(0, now, { ...base, amount: 0 })).toBe(0);
  });
});

describe('死亡演出の期限は止めの後から数える(削られない)', () => {
  const base = { zoomMs: 1700, zoomHoldMs: 1150, slowMs: 1700, slowHoldMs: 1150, resultMs: 2000 };
  it('止めの分だけ全部後ろ', () => {
    expect(playerDeathTimeline(240, base)).toEqual({ zoomMs: 1940, zoomHoldMs: 1390, slowMs: 1940, slowHoldMs: 1390, resultMs: 2240 });
  });
  it('止めが無ければ今のまま', () => {
    expect(playerDeathTimeline(0, base)).toEqual(base);
    expect(playerDeathTimeline(-50, base)).toEqual(base);
  });
  it('止めが明けた後の形(保持の残り・戻り・結果画面までの余韻)は今と同じ長さ', () => {
    const s = 240, r = playerDeathTimeline(s, base);
    expect(r.slowHoldMs - s).toBe(base.slowHoldMs);
    expect(r.slowMs - s).toBe(base.slowMs);
    expect(r.resultMs - r.slowMs).toBe(base.resultMs - base.slowMs);
  });
});

describe('ボスを倒した一撃がサブウェポンか(放射状の流れを出さない印・research/BLUR.md §2-5)', () => {
  it('自律して当たるサブウェポン(投げ物・召喚・設置物・矢の雨)は true', () => {
    for (const k of ['heavy-grenade', 'dog', 'turret', 'fire-knife', 'drone-boomerang', 'wire-anchor', 'arrow-rain', 'alchemy', 'molotov', 'sensor-mine', 'support-sniper']) {
      expect(bossKillBySubWeapon(k)).toBe(true);
    }
  });
  it('自分で振る刀・鞭・格闘、銃・近接武器、出どころ無しは false', () => {
    for (const k of ['katana', 'whip', 'brawler', 'handgun-t1', 'rifle-t3', 'knife-t1', 'loadout', 'none', 'max']) {
      expect(bossKillBySubWeapon(k)).toBe(false);
    }
    expect(bossKillBySubWeapon(null)).toBe(false);
    expect(bossKillBySubWeapon(undefined)).toBe(false);
  });
});
