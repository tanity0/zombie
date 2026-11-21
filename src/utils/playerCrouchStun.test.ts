import { describe, it, expect } from 'vitest';
import {
  playerCrouchStunPose, CROUCH_STUN_DROP_MS, CROUCH_STUN_DROP_FRAC, CROUCH_STUN_BOUNCE_MS,
  CROUCH_STUN_BREATH_PX, CROUCH_STUN_WINDUP_AT_MS, CROUCH_STUN_WINDUP_MS, CROUCH_STUN_STANDUP_MS,
} from './playerCrouchStun';
import { chipPvpPosture, freshPvpPosture, pvpAfterFatal, PVP_BREAK_MS, PVP_FATAL_DAZE_MS } from './pvpPosture';

const T0 = 10_000;
const BODY = 66; // 表示中の体の高さ(px)
const broken = () => {
  let s = freshPvpPosture();
  let t = T0 - 1000;
  for (let i = 0; i < 4; i++) { s = chipPvpPosture(s, 'counter', t, 1).next; t += 10; }
  const r = chipPvpPosture(s, 'counter', T0, 1);
  expect(r.broke).toBe(true);
  return r.next;
};
const pose = (s: ReturnType<typeof broken> | undefined, t: number, art = true) => playerCrouchStunPose(s, t, BODY, art);

describe('playerCrouchStunPose', () => {
  it('崩れていない時は絵も位置も替えない', () => {
    expect(pose(undefined, T0)).toEqual({ crouchTex: false, liftPx: 0 });
    expect(pose(freshPvpPosture(), T0)).toEqual({ crouchTex: false, liftPx: 0 });
    const s = chipPvpPosture(freshPvpPosture(), 'counter', T0, 1).next;
    expect(pose(s, T0 + 50)).toEqual({ crouchTex: false, liftPx: 0 });
  });

  it('しゃがみの絵が無い装い(武将フル装備)は窓の間ずっと0', () => {
    const s = broken();
    for (let t = T0; t < T0 + PVP_BREAK_MS; t += 16) expect(pose(s, t, false)).toEqual({ crouchTex: false, liftPx: 0 });
  });

  it('足は下端より下へ行かない(紫・致命の後とも・持ち上げ量は常に0以上)', () => {
    const s = broken();
    const d = pvpAfterFatal(s, T0 + 1500);
    for (let t = T0; t < T0 + PVP_BREAK_MS; t += 4) expect(pose(s, t).liftPx).toBeGreaterThanOrEqual(0);
    for (let t = T0 + 1500; t < T0 + 1500 + PVP_FATAL_DAZE_MS; t += 4) expect(pose(d, t).liftPx).toBeGreaterThanOrEqual(0);
  });

  it('入りはしゃがみの絵で上から落ちて止まり、小さく跳ねる', () => {
    const s = broken();
    const p0 = pose(s, T0);
    expect(p0.crouchTex).toBe(true);
    expect(p0.liftPx).toBeCloseTo(BODY * CROUCH_STUN_DROP_FRAC, 5);
    // 落下は加速(後半ほど1フレームの落ち幅が大きい)
    const early = pose(s, T0).liftPx - pose(s, T0 + 16).liftPx;
    const late = pose(s, T0 + CROUCH_STUN_DROP_MS - 17).liftPx - pose(s, T0 + CROUCH_STUN_DROP_MS - 1).liftPx;
    expect(late).toBeGreaterThan(early);
    expect(pose(s, T0 + CROUCH_STUN_DROP_MS).liftPx).toBeCloseTo(0, 5);
    const bounce = pose(s, T0 + CROUCH_STUN_DROP_MS + CROUCH_STUN_BOUNCE_MS / 2).liftPx;
    expect(bounce).toBeGreaterThan(0.5);
    expect(bounce).toBeLessThanOrEqual(1.0001);
  });

  it('窓の間は息で動き(最大1px)、止まり続けない', () => {
    const s = broken();
    const vals: number[] = [];
    for (let t = T0 + 600; t < T0 + 2200; t += 16) vals.push(pose(s, t).liftPx);
    expect(Math.max(...vals)).toBeLessThanOrEqual(CROUCH_STUN_BREATH_PX + 1e-9);
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.5);
  });

  it('明けの約0.5秒前に予備動作でぐっと持ち上がり、明けは立ち絵で伸び上がって0へ', () => {
    const s = broken();
    const end = T0 + PVP_BREAK_MS;
    const peak = pose(s, end - CROUCH_STUN_WINDUP_AT_MS + CROUCH_STUN_WINDUP_MS / 2);
    expect(peak.crouchTex).toBe(true);
    expect(peak.liftPx).toBeGreaterThan(CROUCH_STUN_BREATH_PX + 1);
    const up = pose(s, end - CROUCH_STUN_STANDUP_MS / 2);
    expect(up.crouchTex).toBe(false);
    expect(up.liftPx).toBeGreaterThan(1);
    expect(pose(s, end - 1).liftPx).toBeLessThan(0.1);
    expect(pose(s, end)).toEqual({ crouchTex: false, liftPx: 0 });
  });

  it('1フレーム(16ms)の跳びが小さい(入りの絵が替わる瞬間だけは除く)', () => {
    const s = broken();
    const fatalAt = T0 + 1500;
    const d = pvpAfterFatal(s, fatalAt);
    const at = (t: number) => (t < fatalAt ? pose(s, t) : pose(d, t));
    let prev = at(T0).liftPx;
    for (let t = T0 + 16; t <= fatalAt + PVP_FATAL_DAZE_MS + 48; t += 16) {
      const k = at(t).liftPx;
      expect(Math.abs(k - prev)).toBeLessThan(1.6);
      prev = k;
    }
  });

  it('窓が通常より長く書かれた状態(確認用に止めた)はしゃがみ・持ち上げは息の範囲', () => {
    const G = 5000;
    const r = playerCrouchStunPose({ posture: 0, recoveryCap: 0, lastChipAt: G, breakUntil: G + 1e9, lockUntil: G + 1e9 }, G, BODY, true);
    expect(r.crouchTex).toBe(true);
    expect(r.liftPx).toBeGreaterThanOrEqual(0);
    expect(r.liftPx).toBeLessThanOrEqual(CROUCH_STUN_BREATH_PX + 1e-9);
  });

  it('致命の後の窓は落下なし(しゃがみの絵・持ち上げは息の範囲)で始まり、明けに0', () => {
    const s = broken();
    const fatalAt = T0 + 1500;
    const d = pvpAfterFatal(s, fatalAt);
    expect(pose(d, fatalAt).crouchTex).toBe(true);
    expect(pose(d, fatalAt).liftPx).toBeLessThan(0.1);
    expect(pose(d, fatalAt + PVP_FATAL_DAZE_MS)).toEqual({ crouchTex: false, liftPx: 0 });
  });
});
