// 雑魚の個体差+役割(社長指示v0.25.3176・案4+案3)の不変条件。
// ここで固定したいのは「決定的であること」「必ず届くこと」「対象を広げないこと」の3点。
import { describe, it, expect } from 'vitest';
import {
  isChaffType, chaffTraits, chaffHeading, chaffSpeedMult,
  CHAFF_SPEED_JITTER, CHAFF_TURN_TAU_MIN, CHAFF_TURN_TAU_MAX,
  CHAFF_ROLE_STRAIGHT_FRAC, CHAFF_ROLE_FLANK_FRAC,
  CHAFF_FLANK_FULL_PX, CHAFF_LAGGARD_SPEED_MULT, CHAFF_LAGGARD_UNTIL_PX,
  type ChaffRole,
} from './chaffMotion';
import type { EnemyType } from '../types/game';

const ids = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `enemy-bat-${i}-${(i * 7919) % 9973}`);

describe('対象の範囲(広げない)', () => {
  it('チャフ3種だけが対象。邪魔者・特別枠・ボスは触らない', () => {
    for (const t of ['bat', 'skeleton', 'zombie'] as EnemyType[]) expect(isChaffType(t), t).toBe(true);
    for (const t of ['werewolf', 'pumpkin', 'plant', 'ghost', 'lich', 'screamer', 'giantbat', 'hunter', 'mimir'] as EnemyType[]) {
      expect(isChaffType(t), t).toBe(false);
    }
  });
});

describe('決定的であること(乱数を引かない)', () => {
  it('同じidなら何度呼んでも同じ特性(毎フレーム呼んでも揺れない)', () => {
    for (const id of ids(50)) {
      const a = chaffTraits(id);
      const b = chaffTraits(id);
      expect(b).toEqual(a);
    }
  });

  it('idが違えば特性も散る(全員同じ役割/同じ速度にならない)', () => {
    const roles = new Set<ChaffRole>();
    const jitters = new Set<number>();
    for (const id of ids(200)) {
      const t = chaffTraits(id);
      roles.add(t.role);
      jitters.add(t.speedJitter);
    }
    expect(roles.size).toBe(3);
    expect(jitters.size).toBeGreaterThan(50);
  });
});

describe('案4: 個体差の範囲', () => {
  it('速度の個体差は ±CHAFF_SPEED_JITTER の中に収まる', () => {
    for (const id of ids(300)) {
      const { speedJitter } = chaffTraits(id);
      expect(speedJitter).toBeGreaterThanOrEqual(1 - CHAFF_SPEED_JITTER);
      expect(speedJitter).toBeLessThanOrEqual(1 + CHAFF_SPEED_JITTER);
    }
  });

  it('慣性tauの倍率は MIN..MAX の中に収まる(曲がり方の幅)', () => {
    for (const id of ids(300)) {
      const { turnTauMult } = chaffTraits(id);
      expect(turnTauMult).toBeGreaterThanOrEqual(CHAFF_TURN_TAU_MIN);
      expect(turnTauMult).toBeLessThanOrEqual(CHAFF_TURN_TAU_MAX);
    }
  });
});

describe('案3: 役割の配分', () => {
  it('おおむね 直進60% / 回り込み25% / 遅れて来る15%(±8ポイント)', () => {
    const n = 3000;
    const count: Record<ChaffRole, number> = { straight: 0, flank: 0, laggard: 0 };
    for (const id of ids(n)) count[chaffTraits(id).role]++;
    expect(count.straight / n).toBeGreaterThan(CHAFF_ROLE_STRAIGHT_FRAC - 0.08);
    expect(count.straight / n).toBeLessThan(CHAFF_ROLE_STRAIGHT_FRAC + 0.08);
    expect(count.flank / n).toBeGreaterThan(CHAFF_ROLE_FLANK_FRAC - 0.08);
    expect(count.flank / n).toBeLessThan(CHAFF_ROLE_FLANK_FRAC + 0.08);
  });
});

describe('回り込み(flank)は必ず届く', () => {
  const flankId = ids(500).find(id => chaffTraits(id).role === 'flank')!;

  it('★密着では角度0=正面から詰める(いつまでも周回する個体を作らない)', () => {
    const h = chaffHeading(1, 0, chaffTraits(flankId), 0);
    expect(h.x).toBeCloseTo(1, 10);
    expect(h.y).toBeCloseTo(0, 10);
  });

  it('遠いほど横へ膨らむ(角度は距離に対して単調に増える)', () => {
    const t = chaffTraits(flankId);
    const angleAt = (d: number) => Math.abs(Math.atan2(chaffHeading(1, 0, t, d).y, chaffHeading(1, 0, t, d).x));
    expect(angleAt(300)).toBeGreaterThan(angleAt(150));
    expect(angleAt(150)).toBeGreaterThan(angleAt(50));
    // 上限より遠くても角度は増えない(頭打ち)
    expect(angleAt(CHAFF_FLANK_FULL_PX * 3)).toBeCloseTo(angleAt(CHAFF_FLANK_FULL_PX), 10);
  });

  it('向きは単位ベクトルのまま(速さを変えない=速さは別関数の担当)', () => {
    const t = chaffTraits(flankId);
    for (const d of [0, 50, 150, 300, 900]) {
      const h = chaffHeading(0.6, 0.8, t, d);
      expect(Math.hypot(h.x, h.y)).toBeCloseTo(1, 10);
    }
  });

  it('直進/遅れ役の向きは一切曲げない', () => {
    for (const id of ids(400)) {
      const t = chaffTraits(id);
      if (t.role === 'flank') continue;
      const h = chaffHeading(0.6, 0.8, t, 400);
      expect(h.x).toBe(0.6);
      expect(h.y).toBe(0.8);
    }
  });
});

describe('遅れて来る(laggard)は近づけば通常速度へ戻る', () => {
  const lagId = ids(500).find(id => chaffTraits(id).role === 'laggard')!;

  it('遠い間だけ遅い / 近づいたら個体差のみ(置き去りにならない)', () => {
    const t = chaffTraits(lagId);
    const far = chaffSpeedMult(t, CHAFF_LAGGARD_UNTIL_PX + 1);
    const near = chaffSpeedMult(t, CHAFF_LAGGARD_UNTIL_PX - 1);
    expect(far).toBeCloseTo(t.speedJitter * CHAFF_LAGGARD_SPEED_MULT, 10);
    expect(near).toBeCloseTo(t.speedJitter, 10);
    expect(far).toBeLessThan(near);
  });

  it('直進/回り込み役の速さは距離で変わらない(個体差のみ)', () => {
    for (const id of ids(400)) {
      const t = chaffTraits(id);
      if (t.role === 'laggard') continue;
      expect(chaffSpeedMult(t, 900)).toBeCloseTo(t.speedJitter, 10);
      expect(chaffSpeedMult(t, 10)).toBeCloseTo(t.speedJitter, 10);
    }
  });

  it('★どの役割でも速度倍率が0や負にならない(止まる/後退する個体を作らない)', () => {
    for (const id of ids(400)) {
      const t = chaffTraits(id);
      for (const d of [0, 100, 260, 261, 1000]) {
        expect(chaffSpeedMult(t, d)).toBeGreaterThan(0.5);
      }
    }
  });
});
