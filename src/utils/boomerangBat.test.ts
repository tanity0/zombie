import { describe, it, expect } from 'vitest';
import { boomerangBatPitch, boomerangBatSparks, boomerangBatCue, DRONE_BOOM_BAT_CUE_MS, DRONE_BOOM_BAT_SPARKS_MAX, DRONE_BOOM_BAT_PITCH_MAX_STEPS, boomerangBatPick, boomerangBatSpeedMult, DRONE_BOOM_BAT_PAD_PX, DRONE_BOOM_BAT_BOOST, DRONE_BOOM_BAT_BOOST_MS, type BatBoomLike } from './boomerangBat';

const boom = (id: string, cx: number, cy: number, o: Partial<BatBoomLike> = {}): BatBoomLike => ({
  id, x: cx - 9, y: cy - 9, width: 18, height: 18,
  weaponType: 'drone-boomerang-projectile', weaponKey: 'sub-drone-boomerang', boomPhase: 'return', ...o,
});

describe('ドローンブーメランの打ち返し(戻ってきた瞬間に近接を当てると飛び直す)', () => {
  it('戻りの最中で、近接の届く距離の内なら打ち返せる', () => {
    expect(boomerangBatPick([boom('b', 60, 0)], false, 0, 0, 74)).toBe('b');
    expect(boomerangBatPick([boom('b', 74 + DRONE_BOOM_BAT_PAD_PX, 0)], false, 0, 0, 74)).toBe('b');
  });
  it('届く距離の外は打ち返せない', () => {
    expect(boomerangBatPick([boom('b', 74 + DRONE_BOOM_BAT_PAD_PX + 1, 0)], false, 0, 0, 74)).toBeNull();
  });
  it('行き・停止中・消える所は打ち返せない(戻ってきた時だけ)', () => {
    for (const ph of ['out', 'stop', 'done'] as const) {
      expect(boomerangBatPick([boom('b', 30, 0, { boomPhase: ph })], false, 0, 0, 74)).toBeNull();
    }
  });
  it('警察署の周回ブーメラン・他の弾は対象外', () => {
    expect(boomerangBatPick([boom('g', 30, 0, { weaponKey: 'poi-guard' })], false, 0, 0, 74)).toBeNull();
    expect(boomerangBatPick([boom('k', 30, 0, { weaponType: 'fire-knife-projectile' })], false, 0, 0, 74)).toBeNull();
  });
  it('持ち主が違うブーメランは打ち返せない(プレイヤー↔守護霊)', () => {
    expect(boomerangBatPick([boom('gh', 30, 0, { ownerGhost: true })], false, 0, 0, 74)).toBeNull();
    expect(boomerangBatPick([boom('gh', 30, 0, { ownerGhost: true })], true, 0, 0, 74)).toBe('gh');
    expect(boomerangBatPick([boom('pl', 30, 0)], true, 0, 0, 74)).toBeNull();
  });
  it('弾かれた勢い: 出だしが一番速く、なめらかに通常の速さへ戻る(その後は1)', () => {
    expect(boomerangBatSpeedMult(0)).toBeCloseTo(DRONE_BOOM_BAT_BOOST, 5);
    const a = boomerangBatSpeedMult(DRONE_BOOM_BAT_BOOST_MS * 0.25), b = boomerangBatSpeedMult(DRONE_BOOM_BAT_BOOST_MS * 0.75);
    expect(a).toBeGreaterThan(b); expect(b).toBeGreaterThan(1);
    expect(boomerangBatSpeedMult(DRONE_BOOM_BAT_BOOST_MS)).toBe(1);
    expect(boomerangBatSpeedMult(99999)).toBe(1);
    expect(boomerangBatSpeedMult(-5)).toBe(1);
  });
  it('続けて打ち返すほど音が半音ずつ上がり、火花が増える(どちらも上限で止まる)', () => {
    expect(boomerangBatPitch(1)).toBe(1);
    expect(boomerangBatPitch(2)).toBeCloseTo(Math.pow(2, 1 / 12), 6);
    expect(boomerangBatPitch(3)).toBeGreaterThan(boomerangBatPitch(2));
    expect(boomerangBatPitch(99)).toBeCloseTo(Math.pow(2, DRONE_BOOM_BAT_PITCH_MAX_STEPS / 12), 6);
    expect(boomerangBatSparks(2)).toBeGreaterThan(boomerangBatSparks(1));
    expect(boomerangBatSparks(99)).toBe(DRONE_BOOM_BAT_SPARKS_MAX);
  });
  it('「今打てる」の光: 届く距離に入った瞬間が一番強く、なめらかに消える', () => {
    expect(boomerangBatCue(0)).toBe(1);
    expect(boomerangBatCue(DRONE_BOOM_BAT_CUE_MS / 2)).toBeGreaterThan(0);
    expect(boomerangBatCue(DRONE_BOOM_BAT_CUE_MS / 2)).toBeLessThan(1);
    expect(boomerangBatCue(DRONE_BOOM_BAT_CUE_MS)).toBe(0);
    expect(boomerangBatCue(-1)).toBe(0);
  });
  it('複数あれば一番近いもの', () => {
    expect(boomerangBatPick([boom('far', 70, 0), boom('near', 20, 0)], false, 0, 0, 74)).toBe('near');
  });
});
