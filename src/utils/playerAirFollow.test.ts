import { describe, it, expect, beforeEach } from 'vitest';
import {
  stepPlayerAir, playerAirTargetPx, playerAirLandSquashY, noteAirMeleeHit, getLastAirMeleeHit, resetAirMeleeHit,
  PLAYER_AIR_HOVER_MS, PLAYER_AIR_LAND_MS, PLAYER_AIR_LAND_SQUASH, PLAYER_AIR_FOLLOW_K,
} from './playerAirFollow';

const run = (s0: { h: number; vy: number }, target: number | null, sinceFrom: number, ms: number, dt = 10) => {
  let s = s0; const hs: number[] = [s.h]; let landedAt = -1;
  for (let t = 0; t < ms; t += dt) {
    const r = stepPlayerAir(s, target, sinceFrom + t, dt);
    s = r.state; hs.push(s.h);
    if (r.landed && landedAt < 0) landedAt = t + dt;
  }
  return { s, hs, landedAt };
};

describe('高さの目標', () => {
  it('敵の高さの0.8倍・上限はプレイヤーの体の高さ・負や0は0', () => {
    expect(playerAirTargetPx(1, 50, 100)).toBeCloseTo(50 * PLAYER_AIR_FOLLOW_K, 6);
    expect(playerAirTargetPx(2, 50, 60)).toBe(60);
    expect(playerAirTargetPx(0, 50, 60)).toBe(0);
    expect(playerAirTargetPx(-1, 50, 60)).toBe(0);
  });
});

describe('高さの曲線(慣性)', () => {
  it('上がりは ease-out: 120〜160ms で目標の9割に届き、最初のフレームが一番大きく、頭打ちの速度は滑らかに0へ寄る', () => {
    const { hs } = run({ h: 0, vy: 0 }, 40, 0, 200);
    const at = (ms: number) => hs[Math.round(ms / 10)];
    expect(at(120)).toBeGreaterThan(40 * 0.9);
    expect(at(160)).toBeGreaterThan(40 * 0.95);
    const d = hs.slice(1).map((v, i) => v - hs[i]);
    for (let i = 1; i < 12; i++) expect(d[i]).toBeLessThanOrEqual(d[i - 1] + 1e-9); // 増分が減り続ける=減速して止まる
    expect(Math.max(...hs)).toBeLessThanOrEqual(40);
  });
  it('漂い: 最後の当たりから約250msは頂点付近(ゆっくり沈むだけ)・敵が下がっても追って下がらない', () => {
    const top = run({ h: 0, vy: 0 }, 40, 0, 100).s;
    const hover = run(top, 5, 100, PLAYER_AIR_HOVER_MS - 100, 10);
    expect(hover.s.h).toBeGreaterThan(top.h - 4);
    expect(hover.s.h).toBeLessThanOrEqual(top.h);
  });
  it('落下: 漂いの後は重力で加速しながら落ち、着地で1回だけ landed(250ms前後で着く)', () => {
    const top = { h: 40, vy: 0 };
    const { hs, landedAt } = run(top, null, PLAYER_AIR_HOVER_MS + 1, 600);
    const d = hs.slice(1).map((v, i) => hs[i] - v).filter(v => v > 0);
    for (let i = 1; i < Math.min(d.length, 10); i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1] - 1e-9); // 落ちる速さが増える
    expect(landedAt).toBeGreaterThan(200);
    expect(landedAt).toBeLessThan(330);
    expect(hs[hs.length - 1]).toBe(0);
  });
  it('落ちている途中で再び当たったら、その高さから途切れずに上がり直す', () => {
    const falling = run({ h: 40, vy: 0 }, null, PLAYER_AIR_HOVER_MS + 1, 100).s;
    expect(falling.h).toBeLessThan(40); expect(falling.vy).toBeGreaterThan(0);
    const r = stepPlayerAir(falling, 40, 0, 10);
    expect(r.state.vy).toBe(0);
    expect(r.state.h).toBeGreaterThan(falling.h); // 跳ね飛ばず、そこから上がる
    expect(r.state.h - falling.h).toBeLessThan(10);
    expect(r.landed).toBe(false);
  });
  it('地上(h=0)で記録が無ければ動かない・長い dt でも飛ばない', () => {
    expect(stepPlayerAir({ h: 0, vy: 0 }, null, Infinity, 10).state.h).toBe(0);
    expect(stepPlayerAir({ h: 0, vy: 0 }, 40, 0, 5000).state.h).toBeLessThan(40 * 1.0001);
  });
});

describe('着地の沈み', () => {
  it('0で始まり速く沈んで戻る・過ぎたら1・負は1', () => {
    expect(playerAirLandSquashY(-1)).toBe(1);
    expect(playerAirLandSquashY(PLAYER_AIR_LAND_MS)).toBe(1);
    const mid = playerAirLandSquashY(PLAYER_AIR_LAND_MS * 0.3);
    expect(mid).toBeLessThan(1 - PLAYER_AIR_LAND_SQUASH * 0.8);
    expect(playerAirLandSquashY(PLAYER_AIR_LAND_MS * 0.95)).toBeGreaterThan(mid);
  });
});

describe('最後に空中の敵へ当てた記録', () => {
  beforeEach(() => resetAirMeleeHit());
  it('浮いている敵にだけ記録し、地上の敵には記録しない', () => {
    noteAirMeleeHit({ id: 'g' }, 1000);
    expect(getLastAirMeleeHit()).toBeNull();
    noteAirMeleeHit({ id: 'a', brLiftUntil: 3000, brawlerLiftAt: 900, brLiftMs: 1000, brLiftPeak: 1 }, 1000);
    expect(getLastAirMeleeHit()?.enemyId).toBe('a');
    expect(getLastAirMeleeHit()?.at).toBe(1000);
    expect(getLastAirMeleeHit()!.rel).toBeGreaterThan(0);
  });
});
