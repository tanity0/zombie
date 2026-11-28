import { describe, expect, it } from 'vitest';
import {
  KATANA_IAI_ENTER_MS, KATANA_IAI_EXIT_MS, KATANA_IAI_SETTLE_MS,
  isKatanaTapSwing, katanaIaiCrouching, katanaIaiDropLift, katanaIaiEquipped, katanaIaiSettle, katanaIaiStanceK,
} from './katanaIaiStance';

const S = 10_000;
const E = S + 300;
const IN = KATANA_IAI_ENTER_MS;
const OUT = KATANA_IAI_EXIT_MS;

describe('katanaIaiStanceK(居合の構えの割合)', () => {
  it('窓が無い・窓の前は 0(背負いのまま)', () => {
    expect(katanaIaiStanceK(S, 0, 0)).toBe(0);
    expect(katanaIaiStanceK(S - 1, S, E)).toBe(0);
    expect(katanaIaiStanceK(S + 50, S, S)).toBe(0);
  });
  it('入りは短く速く(45ms)、戻りは少し重く(90ms)=差がある', () => {
    expect(IN).toBe(45);
    expect(OUT).toBe(90);
    expect(OUT).toBeGreaterThan(IN);
  });
  it('入りは速く出て最後に減速し、入りの時間で 1 に着く', () => {
    expect(katanaIaiStanceK(S, S, E)).toBe(0);
    const q1 = katanaIaiStanceK(S + IN * 0.25, S, E);
    const q3 = katanaIaiStanceK(S + IN * 0.75, S, E);
    expect(katanaIaiStanceK(S + IN * 0.5, S, E)).toBeGreaterThan(0.5);
    expect(q1).toBeGreaterThan(1 - q3);
    expect(katanaIaiStanceK(S + IN, S, E)).toBe(1);
  });
  it('構えに入ったら窓が閉じるまで 1 のまま', () => {
    for (let t = S + IN; t <= E; t += 7) expect(katanaIaiStanceK(t, S, E)).toBe(1);
  });
  it('戻りはゆっくり出てゆっくり止まり、戻りの時間で 0', () => {
    const early = katanaIaiStanceK(E + OUT * 0.1, S, E);
    expect(early).toBeGreaterThan(0.9);           // 出だしは重い
    expect(katanaIaiStanceK(E + OUT * 0.5, S, E)).toBeCloseTo(0.5, 5);
    expect(katanaIaiStanceK(E + OUT, S, E)).toBe(0);
    expect(katanaIaiStanceK(E + 500, S, E)).toBe(0);
  });
  it('単調で跳ばない', () => {
    let prev = 0;
    for (let t = S; t <= E; t += 1) { const k = katanaIaiStanceK(t, S, E); expect(k).toBeGreaterThanOrEqual(prev); prev = k; }
    for (let t = E; t <= E + OUT + 5; t += 1) { const k = katanaIaiStanceK(t, S, E); expect(k).toBeLessThanOrEqual(prev + 1e-12); prev = k; }
  });
  it('窓が入りより短い時は、入りの途中の値から戻り始める', () => {
    const e2 = S + 20;
    const atClose = katanaIaiStanceK(e2, S, e2);
    expect(atClose).toBeGreaterThan(0);
    expect(atClose).toBeLessThan(1);
    expect(Math.abs(katanaIaiStanceK(e2 + 1, S, e2) - atClose)).toBeLessThan(0.05);
  });
});

describe('katanaIaiSettle(収まる所の行き過ぎ)', () => {
  it('入りが終わった直後の短い間だけ山になり、その後は 0(1px も動かない)', () => {
    expect(katanaIaiSettle(S + IN, S, E)).toBe(0);
    expect(katanaIaiSettle(S + IN + KATANA_IAI_SETTLE_MS / 2, S, E)).toBeCloseTo(1, 5);
    expect(katanaIaiSettle(S + IN + KATANA_IAI_SETTLE_MS, S, E)).toBe(0);
    expect(KATANA_IAI_SETTLE_MS).toBeLessThanOrEqual(34); // 1〜2フレーム
    for (let t = S + IN + KATANA_IAI_SETTLE_MS; t <= E; t += 5) expect(katanaIaiSettle(t, S, E)).toBe(0);
    for (let t = S; t <= S + IN; t += 5) expect(katanaIaiSettle(t, S, E)).toBe(0);
  });
  it('窓の外・窓が無い時は 0', () => {
    expect(katanaIaiSettle(S + IN + 10, 0, 0)).toBe(0);
    expect(katanaIaiSettle(S + IN + 10, S, S + IN + 5)).toBe(0);
  });
});

describe('katanaIaiDropLift(体のしゃがみの浮き)', () => {
  it('窓が開いた瞬間は 1、刀が収まる時刻(入りの時間)で 0 に着地し、以後 0', () => {
    expect(katanaIaiDropLift(S, S, E)).toBe(1);
    const a = 1 - katanaIaiDropLift(S + IN / 2, S, E);
    expect(a).toBeLessThan(0.5);                   // 加速しながら落ちる(前半は少ししか落ちない)
    expect(katanaIaiDropLift(S + IN, S, E)).toBe(0);
    expect(katanaIaiStanceK(S + IN, S, E)).toBe(1); // 同じ1点
    for (let t = S + IN; t <= E + OUT; t += 7) expect(katanaIaiDropLift(t, S, E)).toBe(0);
  });
});

describe('katanaIaiCrouching(しゃがみの絵の間)', () => {
  it('窓が開いてから、刀が背中へ戻りきるまで', () => {
    expect(katanaIaiCrouching(S - 1, S, E)).toBe(false);
    expect(katanaIaiCrouching(S, S, E)).toBe(true);
    expect(katanaIaiCrouching(E, S, E)).toBe(true);
    expect(katanaIaiCrouching(E + OUT - 1, S, E)).toBe(true);
    expect(katanaIaiStanceK(E + OUT - 1, S, E)).toBeGreaterThan(0); // 刀が戻りきる前は必ずしゃがみ
    expect(katanaIaiCrouching(E + OUT + 1, S, E)).toBe(false);
    expect(katanaIaiCrouching(S, 0, 0)).toBe(false);
  });
});

describe('isKatanaTapSwing / katanaIaiEquipped', () => {
  it('刀・村雨を持っていて、振りの時計が窓の起点と同じなら刀のタップ', () => {
    expect(isKatanaTapSwing(['katana'], S, S)).toBe(true);
    expect(isKatanaTapSwing(['murasame'], S + 1, S)).toBe(true);
  });
  it('窓の起点と離れた振り(カウンター成立の演出・縮地など)はタップではない', () => {
    expect(isKatanaTapSwing(['katana'], S + 120, S)).toBe(false);
    expect(isKatanaTapSwing(['katana'], 0, 0)).toBe(false);
  });
  it('刀以外(ナイフ・鞭・格闘)は対象外', () => {
    expect(isKatanaTapSwing([], S, S)).toBe(false);
    expect(isKatanaTapSwing(['whip'], S, S)).toBe(false);
    expect(katanaIaiEquipped(undefined)).toBe(false);
    expect(katanaIaiEquipped(['brawler'])).toBe(false);
  });
});
