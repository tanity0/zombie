import { describe, it, expect } from 'vitest';
import {
  escortHitFx, escortRiseFx, escortLandFx, resetEscortFxClock,
  ESCORT_BLOOD_LEN, ESCORT_SFX_KEYS, ESCORT_SFX_GAIN, ESCORT_SFX_RATE, ESCORT_HIT_SFX_CD_MS, ESCORT_LAND_DUST, ESCORT_RISE_SFX_CUT_MS,
  type EscortFxApi, type EscortFxView,
} from './escortFx';
import type { EscortSoldier } from '../types/game';

const mk = (o: Partial<EscortSoldier> = {}): EscortSoldier => ({
  id: 'escort-0', baseId: 'base-0', x: 300, y: 300, face: 1, soldierIndex: 0, fireAt: 0, dwellMs: 0, maxHealth: 78, health: 40, ...o,
});
const view: EscortFxView = { playerX: 280, playerY: 290, camera: { x: 0, y: 0 }, gameBounds: { width: 430, height: 932 }, gameTime: 10_000 };
const rec = () => {
  const blood: { x: number; y: number; angle: number; len: number }[] = [];
  const sfx: { key: string; gain: number; rate?: number; ms?: number }[] = [];
  const burst: { x: number; y: number; color: string; count: number }[] = [];
  const api: EscortFxApi = {
    spawnBlood: (x, y, angle, len) => blood.push({ x, y, angle, len }),
    playSfx: (key, gain, opts) => sfx.push({ key, gain, ...opts }),
    spawnBurst: (x, y, color, count) => burst.push({ x, y, color, count }),
  };
  return { api, blood, sfx, burst };
};

describe('escortFx: 血と音と砂埃', () => {
  it('被弾=血は被弾源から離れる向きへ・体の中心から外へ。音は1つ(低く小さく)', () => {
    resetEscortFxClock();
    const r = rec();
    escortHitFx(r.api, mk({ lastHitDirX: 1, lastHitDirY: 0 }), false, view);
    expect(r.blood).toHaveLength(1);
    expect(r.blood[0].angle).toBeCloseTo(0);
    expect(r.blood[0].x).toBeGreaterThan(300); // 体の中心(x=300)より外側
    expect(r.blood[0].len).toBe(ESCORT_BLOOD_LEN.hit);
    expect(r.sfx.map(s => s.key)).toEqual([ESCORT_SFX_KEYS.hit]);
    expect(r.sfx[0].rate).toBe(ESCORT_SFX_RATE.hit);
    expect(ESCORT_SFX_RATE.hit).toBeLessThan(1); // 低く
    expect(r.sfx[0].gain).toBeLessThan(1); // 本人の被弾より小さく
  });
  it('既に意味を持つ音を流用しない(自分の斬撃が当たった音/ボスの大技の音/武器を拾った音)', () => {
    const used: string[] = [ESCORT_SFX_KEYS.hit, ESCORT_SFX_KEYS.down, ESCORT_SFX_KEYS.rise];
    for (const banned of ['slash-damage', 'heavy-impact', 'weapon-pickup']) expect(used).not.toContain(banned);
  });
  it('倒れる瞬間は血がより大きい。倒れる音は被弾では鳴らさず、着地(escortLandFx)で鳴る', () => {
    resetEscortFxClock();
    const r = rec();
    escortHitFx(r.api, mk({ lastHitDirX: 0, lastHitDirY: 1 }), true, view);
    expect(r.blood[0].len).toBe(ESCORT_BLOOD_LEN.down);
    expect(ESCORT_BLOOD_LEN.down).toBeGreaterThan(ESCORT_BLOOD_LEN.hit);
    expect(r.sfx.map(s => s.key)).toEqual([ESCORT_SFX_KEYS.hit]);
  });
  it('着地: 足元に土色の砂埃(判定ゼロの派手さの絵)と、体が着く鈍い音', () => {
    const r = rec();
    escortLandFx(r.api, 300, 300, view);
    expect(r.burst).toHaveLength(ESCORT_LAND_DUST.length);
    expect(r.burst.every(b => Math.abs(b.x - 300) < 1 && b.y <= 300)).toBe(true);
    expect(r.burst.reduce((a, b) => a + b.count, 0)).toBeGreaterThanOrEqual(30);
    expect(r.sfx.map(s => s.key)).toEqual([ESCORT_SFX_KEYS.down]);
    expect(r.sfx[0].rate).toBe(ESCORT_SFX_RATE.down);
  });
  it('着地: 画面外は砂埃だけ(音は距離減衰で0)', () => {
    const r = rec();
    escortLandFx(r.api, 5000, 5000, view);
    expect(r.burst.length).toBeGreaterThan(0);
    expect(r.sfx).toHaveLength(0);
  });
  it('被弾音は共通の間引き: 同時に4人が噛まれても1発・間引き明けは鳴る・新しい出撃(時計の巻き戻り)では間引かない', () => {
    resetEscortFxClock();
    const r = rec();
    for (let i = 0; i < 4; i++) escortHitFx(r.api, mk({ id: `e${i}`, lastHitDirX: 1, lastHitDirY: 0 }), false, { ...view, gameTime: 10_000 + i * 40 });
    expect(r.sfx).toHaveLength(1);
    expect(r.blood).toHaveLength(4); // 血は毎回出る(絵は間引かない)
    escortHitFx(r.api, mk({ lastHitDirX: 1, lastHitDirY: 0 }), false, { ...view, gameTime: 10_000 + ESCORT_HIT_SFX_CD_MS + 200 });
    expect(r.sfx).toHaveLength(2);
    escortHitFx(r.api, mk({ lastHitDirX: 1, lastHitDirY: 0 }), false, { ...view, gameTime: 50 }); // 巻き戻り
    expect(r.sfx).toHaveLength(3);
  });
  it('向きが無い被弾は真上へ噴く', () => {
    resetEscortFxClock();
    const r = rec();
    escortHitFx(r.api, mk({ lastHitDirX: 0, lastHitDirY: 0 }), false, view);
    expect(r.blood[0].angle).toBeCloseTo(-Math.PI / 2);
  });
  it('画面外(距離減衰0)は音を鳴らさないが、血は出す', () => {
    resetEscortFxClock();
    const r = rec();
    escortHitFx(r.api, mk({ x: 5000, y: 5000, lastHitDirX: 1, lastHitDirY: 0 }), true, view);
    expect(r.blood).toHaveLength(1);
    expect(r.sfx).toHaveLength(0);
  });
  it('起き上がり: 起こされた=通常 / 自力=音を小さく。長尺の音源は頭だけで切る', () => {
    const a = rec(); escortRiseFx(a.api, mk(), false, view);
    const b = rec(); escortRiseFx(b.api, mk(), true, view);
    expect(a.sfx[0].key).toBe(ESCORT_SFX_KEYS.rise);
    expect(a.sfx[0].ms).toBe(ESCORT_RISE_SFX_CUT_MS);
    expect(b.sfx[0].gain).toBeLessThan(a.sfx[0].gain);
    expect(b.sfx[0].gain / a.sfx[0].gain).toBeCloseTo(ESCORT_SFX_GAIN.riseSelf / ESCORT_SFX_GAIN.rise);
  });
});
