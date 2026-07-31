import { describe, it, expect } from 'vitest';
import {
  zoneForDistance, neutralVerb, stringMaxLen, pickStringScript, restMsFor, punishTrigger,
  fairnessViolations, classMix, counterPressWindowMs,
  MIN_COUNTER_TELEGRAPH_MS, HUMAN_REACTION_MS,
  type ZoneEdges, type NeutralBand, type StringScript, type MoveFairness,
} from './bossSkeleton';
import { minWindupMs } from './bossTelegraph';

const EDGES: ZoneEdges = { meleeMax: 120, nearMax: 300, midMax: 600 };

describe('zoneForDistance — 境界は「上限を含む(<=)」の既存作法', () => {
  it('4ゾーンに正しく割れる', () => {
    expect(zoneForDistance(0, EDGES)).toBe('melee');
    expect(zoneForDistance(120, EDGES)).toBe('melee');
    expect(zoneForDistance(121, EDGES)).toBe('near');
    expect(zoneForDistance(300, EDGES)).toBe('near');
    expect(zoneForDistance(301, EDGES)).toBe('mid');
    expect(zoneForDistance(600, EDGES)).toBe('mid');
    expect(zoneForDistance(601, EDGES)).toBe('far');
  });
  it('遠ゾーンに上限が無い(引き撃ちで安全な距離を作らせない)', () => {
    expect(zoneForDistance(999999, EDGES)).toBe('far');
  });
});

describe('neutralVerb — 主戦帯の維持(ER原則③)', () => {
  const band: NeutralBand = { min: 200, max: 340 };
  it('遠ければ詰める / 近ければ下がる / 帯の中なら並走', () => {
    expect(neutralVerb(500, band, false)).toBe('close');
    expect(neutralVerb(341, band, false)).toBe('close');
    expect(neutralVerb(340, band, false)).toBe('strafe');
    expect(neutralVerb(270, band, false)).toBe('strafe');
    expect(neutralVerb(200, band, false)).toBe('strafe');
    expect(neutralVerb(199, band, false)).toBe('retreat');
    expect(neutralVerb(0, band, false)).toBe('retreat');
  });
  it('休符中は距離に関わらず止まる(ターンを距離で奪わない)', () => {
    for (const d of [0, 200, 340, 900]) expect(neutralVerb(d, band, true)).toBe('hold');
  });
});

describe('stringMaxLen / pickStringScript — 連段(ER §1-2)', () => {
  type M = 'a' | 'b' | 'c' | 'd';
  const scripts: StringScript<M>[] = [
    { zone: 'near', weight: 60, moves: ['a', 'b', 'c', 'd'] },
    { zone: 'near', weight: 40, moves: ['b', 'a', 'd', 'c'] },
    { zone: 'far', weight: 100, moves: ['c', 'c', 'a', 'b'] },
  ];
  const len = { p1: 3, p2: 4 };
  const allReady: Record<M, boolean> = { a: true, b: true, c: true, d: true };

  it('P1は3段・P2は4段', () => {
    expect(stringMaxLen(1, len)).toBe(3);
    expect(stringMaxLen(2, len)).toBe(4);
    expect(pickStringScript(scripts, 'near', 1, len, allReady, () => 0)).toEqual(['a', 'b', 'c']);
    expect(pickStringScript(scripts, 'near', 2, len, allReady, () => 0)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('ゾーンが違う台本は選ばれない', () => {
    expect(pickStringScript(scripts, 'far', 1, len, allReady, () => 0)).toEqual(['c', 'c', 'a']);
    expect(pickStringScript(scripts, 'mid', 1, len, allReady, () => 0)).toBeNull();
  });
  it('重み比例で選ぶ(60/40の境界)', () => {
    expect(pickStringScript(scripts, 'near', 1, len, allReady, () => 0.5)?.[0]).toBe('a');
    expect(pickStringScript(scripts, 'near', 1, len, allReady, () => 0.7)?.[0]).toBe('b');
  });
  it('1段目が使えない台本は候補から外れる(出だしで空振りしない)', () => {
    const ready: Record<M, boolean> = { a: false, b: true, c: true, d: true };
    for (let i = 0; i < 50; i++) {
      expect(pickStringScript(scripts, 'near', 1, len, ready)?.[0]).toBe('b');
    }
  });
  it('全部使えなければnull', () => {
    const none: Record<M, boolean> = { a: false, b: false, c: false, d: false };
    expect(pickStringScript(scripts, 'near', 1, len, none)).toBeNull();
  });
});

describe('restMsFor — 休符は絶対に0にしない(プレイヤーのターン)', () => {
  it('フェーズ別に返す', () => {
    expect(restMsFor(1, { p1: 1700, p2: 900 })).toBe(1700);
    expect(restMsFor(2, { p1: 1700, p2: 900 })).toBe(900);
    expect(restMsFor(3, { p1: 1700, p2: 900 })).toBe(900);
  });
});

describe('punishTrigger — 懲罰の規則化(ER原則⑤)', () => {
  const cfg = { farMs: 2000, farMove: 'snipe' as const, meleeMs: 3000, meleeMove: 'roll' as const, sameAngleMs: 4000 };
  it('閾値未満では何も起きない', () => {
    expect(punishTrigger({ farMs: 1999, meleeMs: 2999, sameAngleMs: 3999 }, cfg)).toEqual({ move: null, flipStrafe: false });
  });
  it('遠距離の長居 → 追う技', () => {
    expect(punishTrigger({ farMs: 2000, meleeMs: 0, sameAngleMs: 0 }, cfg).move).toBe('snipe');
  });
  it('密着の居座り → 剥がす技', () => {
    expect(punishTrigger({ farMs: 0, meleeMs: 3000, sameAngleMs: 0 }, cfg).move).toBe('roll');
  });
  it('同角度の長居 → 旋回反転(技の発火とは独立に立つ)', () => {
    expect(punishTrigger({ farMs: 0, meleeMs: 0, sameAngleMs: 4000 }, cfg)).toEqual({ move: null, flipStrafe: true });
    expect(punishTrigger({ farMs: 2000, meleeMs: 0, sameAngleMs: 4000 }, cfg)).toEqual({ move: 'snipe', flipStrafe: true });
  });
});

// ==== 公平性の歯止め(社長指示「MAXは密度で作る。読めなさで作らない」) ====
describe('fairnessViolations — C分類は必ず決断の時刻より前にヒントが出ている', () => {
  it('導出どおり: 550ms以上で「押してよい幅」が300ms以上になる', () => {
    expect(counterPressWindowMs(MIN_COUNTER_TELEGRAPH_MS)).toBeGreaterThanOrEqual(300);
    expect(counterPressWindowMs(MIN_COUNTER_TELEGRAPH_MS - 1)).toBeLessThan(300);
    expect(counterPressWindowMs(650)).toBe(400); // 650以上は常に窓400msぶん
    expect(counterPressWindowMs(HUMAN_REACTION_MS)).toBe(0); // 反応時間ちょうどでは押せない
  });
  it('C分類: 予告が下限未満なら違反として挙がる', () => {
    const bad: MoveFairness[] = [{ key: 'x', cls: 'C', telegraphMs: 400 }];
    expect(fairnessViolations(bad)).toHaveLength(1);
    expect(fairnessViolations(bad)[0]).toContain('x(C)');
  });
  it('C分類: 下限以上なら通る', () => {
    expect(fairnessViolations([{ key: 'x', cls: 'C', telegraphMs: MIN_COUNTER_TELEGRAPH_MS }])).toEqual([]);
  });
  it('A/B分類: 予告 >= 歩いて出るのに要る時間', () => {
    const px = 56;
    const need = minWindupMs(px);
    expect(fairnessViolations([{ key: 'y', cls: 'B', telegraphMs: Math.ceil(need) + 1, escapePx: px }])).toEqual([]);
    expect(fairnessViolations([{ key: 'y', cls: 'B', telegraphMs: Math.floor(need) - 1, escapePx: px }])).toHaveLength(1);
  });
  it('A/B分類でescapePxを書き忘れたら違反(検算できない技を通さない)', () => {
    expect(fairnessViolations([{ key: 'z', cls: 'A', telegraphMs: 9999 }])).toHaveLength(1);
  });
});

describe('classMix — A/B/Cの配分を数字で確認できる', () => {
  it('本数を数える', () => {
    expect(classMix([
      { key: 'a', cls: 'A', telegraphMs: 1, escapePx: 1 },
      { key: 'b', cls: 'C', telegraphMs: 1 },
      { key: 'c', cls: 'C', telegraphMs: 1 },
    ])).toEqual({ A: 1, B: 0, C: 2 });
  });
});
