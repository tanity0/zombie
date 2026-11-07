// B10 血の覚醒(research/THEONE_ROUND2.md §3)の純関数テスト。配線は src/store/bloodAwaken.store.test.ts。
import { describe, it, expect } from 'vitest';
import {
  bloodCapacity, bloodFill, BLOOD_CAP_MIN, bloodGainFor, bloodSizeMul, BLOOD_SIZE_MUL_MAX, bloodDryStep, bloodMeterNow, isBloodAwakening, bloodAwakenMult, bloodAwakenRedAlpha, bloodAwakenGlowAlpha, bloodPulseMult,
  applyBloodGain, bloodAwakenStep, bloodOrbTarget, withoutBlood,
  BLOOD_AWAKEN_MS, BLOOD_AWAKEN_FADE_MS, BLOOD_DRY_DELAY_MS, BLOOD_RED_IN_MS, BLOOD_RED_SETTLE_MS, BLOOD_RED_OVERSHOOT, BLOOD_BODY_LAG_MS, BLOOD_BEAT_PERIOD_MS,
} from './bloodAwaken';

describe('器(社長「体力が低いと…相対的に満タン値が下がってくるので自ずと早まる」)', () => {
  it('器の大きさ=今の体力の割合(下限あり)・体力が無い欄は満タン扱い', () => {
    expect(bloodCapacity({ health: 100, maxHealth: 100 })).toBeCloseTo(1);
    expect(bloodCapacity({ health: 50, maxHealth: 100 })).toBeCloseTo(0.5);
    expect(bloodCapacity({ health: 1, maxHealth: 100 })).toBeCloseTo(BLOOD_CAP_MIN);
    expect(bloodCapacity({})).toBeCloseTo(1);
  });
  it('同じ血でも体力が低いほど赤く染まった割合が大きい(単調)', () => {
    let prev = -1;
    for (let hp = 100; hp >= 0; hp -= 5) {
      const f = bloodFill({ bloodMeter: 0.1, bloodLastGainAt: 0, health: hp, maxHealth: 100 }, 0);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
  it('回復すると薄まる(血の量は変わらず割合が下がる)', () => {
    const low = bloodFill({ bloodMeter: 0.2, bloodLastGainAt: 0, health: 40, maxHealth: 100 }, 0);
    const high = bloodFill({ bloodMeter: 0.2, bloodLastGainAt: 0, health: 80, maxHealth: 100 }, 0);
    expect(high).toBeLessThan(low);
  });
});

describe('bloodGainFor(表 §3-1)', () => {
  it('近接キル: 距離≤120px で +0.06 / それ以上 +0.03(境界は120を含む)', () => {
    expect(bloodGainFor({ kind: 'melee-kill', distPx: 0 })).toBeCloseTo(0.06);
    expect(bloodGainFor({ kind: 'melee-kill', distPx: 120 })).toBeCloseTo(0.06);
    expect(bloodGainFor({ kind: 'melee-kill', distPx: 120.01 })).toBeCloseTo(0.03);
  });
  it('近接ヒットのみ +0.01', () => {
    expect(bloodGainFor({ kind: 'melee-hit', distPx: 0 })).toBeCloseTo(0.01);
  });
  it('銃キル: 距離≤90px だけ +0.03 / それ以上は 0(境界は90を含む)', () => {
    expect(bloodGainFor({ kind: 'gun-kill', distPx: 90 })).toBeCloseTo(0.03);
    expect(bloodGainFor({ kind: 'gun-kill', distPx: 90.01 })).toBe(0);
    expect(bloodGainFor({ kind: 'gun-kill', distPx: 500 })).toBe(0);
  });
  it('★大きい敵ほど浴びる(社長 2026-10-27): ゾンビ=1倍・小さい敵も1倍・上限2倍。キルにだけ掛かり、命中だけには掛からない', () => {
    expect(bloodSizeMul(36, 36)).toBeCloseTo(1);
    expect(bloodSizeMul(26, 26)).toBe(1);                     // 小さい敵は減らさない
    expect(bloodSizeMul(60, 60)).toBeCloseTo(Math.sqrt(60 / 36)); // 城ボス(giantbat)≒1.29
    expect(bloodSizeMul(519, 90)).toBe(BLOOD_SIZE_MUL_MAX);   // 巨体は頭打ち
    expect(bloodSizeMul(0, 0)).toBe(1);
    expect(bloodGainFor({ kind: 'melee-kill', distPx: 0, sizeMul: 2 })).toBeCloseTo(0.12);
    expect(bloodGainFor({ kind: 'gun-kill', distPx: 0, sizeMul: 2 })).toBeCloseTo(0.06);
    expect(bloodGainFor({ kind: 'gun-kill', distPx: 500, sizeMul: 2 })).toBe(0); // 遠い銃キルは大きくても0
    expect(bloodGainFor({ kind: 'melee-hit', distPx: 0, sizeMul: 2 })).toBeCloseTo(0.01);
  });
  it('加算は体力で変わらない(器の方が縮む)', () => {
    expect(bloodGainFor({ kind: 'melee-kill', distPx: 10 })).toBeCloseTo(0.06);
  });
  it('受け入れ(v0.25.5106「早すぎる」で半分に): 満タンHPの密着キル 17回で満ちる / HP2割(器0.2)なら 4回', () => {
    const per = bloodGainFor({ kind: 'melee-kill', distPx: 10 });
    expect(Math.ceil(1 / per - 1e-9)).toBe(17);
    expect(per * 16).toBeLessThan(1);
    expect(Math.ceil(bloodCapacity({ health: 20, maxHealth: 100 }) / per - 1e-9)).toBe(4);
  });
  it('銃だけでは満ちにくい(満タンHPの近距離銃キルでも 34回)', () => {
    expect(Math.ceil(1 / bloodGainFor({ kind: 'gun-kill', distPx: 10 }) - 1e-9)).toBe(34);
  });
});

describe('bloodDryStep(乾き: 4秒後から −0.01/秒・覚醒中は乾かない)', () => {
  it('最後に浴びてから4秒までは乾かない(境界)', () => {
    expect(bloodDryStep(0.5, 1000, 1000 + BLOOD_DRY_DELAY_MS, false)).toBeCloseTo(0.5);
    expect(bloodDryStep(0.5, 1000, 1000 + BLOOD_DRY_DELAY_MS - 1, false)).toBeCloseTo(0.5);
  });
  it('4秒後から1秒ごとに 0.01 ずつ減る', () => {
    expect(bloodDryStep(0.5, 0, BLOOD_DRY_DELAY_MS + 1000, false)).toBeCloseTo(0.49);
    expect(bloodDryStep(0.5, 0, BLOOD_DRY_DELAY_MS + 10_000, false)).toBeCloseTo(0.4);
  });
  it('0で止まる(負にならない)', () => {
    expect(bloodDryStep(0.05, 0, BLOOD_DRY_DELAY_MS + 60_000, false)).toBe(0);
  });
  it('覚醒中は乾かない', () => {
    expect(bloodDryStep(1, 0, 999_999, true)).toBe(1);
  });
  it('単調: 時間が経つほど減る方向にしか動かない', () => {
    let prev = 1;
    for (let t = 0; t <= 60_000; t += 1000) {
      const m = bloodDryStep(0.8, 0, t, false);
      expect(m).toBeLessThanOrEqual(prev + 1e-12);
      prev = m;
    }
  });
});

describe('applyBloodGain / 加算', () => {
  it('乾き込みの量に足して上限1で止める(溢れた分は捨てる)', () => {
    const p = { bloodMeter: 0.95, bloodLastGainAt: 0, bloodAwakenUntil: 0 };
    expect(applyBloodGain(p, 0.12, 100)).toEqual({ bloodMeter: 1, bloodLastGainAt: 100 });
  });
  it('乾いた後に足す: 起点は乾き込みの値', () => {
    const p = { bloodMeter: 0.5, bloodLastGainAt: 0, bloodAwakenUntil: 0 };
    const r = applyBloodGain(p, 0.1, BLOOD_DRY_DELAY_MS + 10_000)!; // 10秒ぶん乾いて 0.4
    expect(r.bloodMeter).toBeCloseTo(0.5);
  });
  it('0以下の加算・覚醒中は書かない(null)', () => {
    expect(applyBloodGain({ bloodMeter: 0.3 }, 0, 0)).toBeNull();
    expect(applyBloodGain({ bloodMeter: 1, bloodAwakenUntil: 5000 }, 0.12, 100)).toBeNull();
  });
});

describe('bloodAwakenStep(満ちたら自動発動・終わりで0へ)', () => {
  it('満ちていなければ何もしない', () => {
    expect(bloodAwakenStep({ bloodMeter: 0.99 }, 100)).toBeNull();
    expect(bloodAwakenStep({}, 100)).toBeNull();
  });
  it('1.0 で自動発動(10秒)。started=true', () => {
    const r = bloodAwakenStep({ bloodMeter: 1 }, 1234)!;
    expect(r.started).toBe(true);
    expect(r.patch.bloodAwakenUntil).toBe(1234 + BLOOD_AWAKEN_MS);
    expect(r.patch.bloodAwakenStartedAt).toBe(1234);
  });
  it('覚醒中は再発動しない(null)・終わる瞬間(gameTime≥until)に血と覚醒が0へ戻る', () => {
    const p = { bloodMeter: 1, bloodAwakenUntil: 11_000, bloodAwakenStartedAt: 1000 };
    expect(bloodAwakenStep(p, 10_999)).toBeNull();
    const end = bloodAwakenStep(p, 11_000)!;
    expect(end.started).toBe(false);
    expect(end.patch.bloodMeter).toBe(0);
    expect(end.patch.bloodAwakenUntil).toBe(0);
  });
  it('終わった直後(血0)は null=また溜め直し', () => {
    expect(bloodAwakenStep({ bloodMeter: 0, bloodAwakenUntil: 0 }, 11_001)).toBeNull();
  });
  it('遷移の通し: 加算で満ちる→発動→10秒後に戻る', () => {
    let p = { bloodMeter: 0.9, bloodLastGainAt: 0, bloodAwakenUntil: 0, bloodAwakenStartedAt: 0 };
    p = { ...p, ...applyBloodGain(p, 0.12, 50)! };
    expect(p.bloodMeter).toBe(1);
    const s = bloodAwakenStep(p, 60)!;
    p = { ...p, ...s.patch };
    expect(isBloodAwakening(p, 61)).toBe(true);
    expect(isBloodAwakening(p, 60 + BLOOD_AWAKEN_MS - 1)).toBe(true);
    const e = bloodAwakenStep(p, 60 + BLOOD_AWAKEN_MS)!;
    p = { ...p, ...e.patch };
    expect(isBloodAwakening(p, 60 + BLOOD_AWAKEN_MS)).toBe(false);
    expect(bloodMeterNow(p, 60 + BLOOD_AWAKEN_MS)).toBe(0);
  });
});

describe('bloodAwakenMult(入り即・終わりの1秒で線形に戻る)', () => {
  const p = { bloodAwakenUntil: 11_000, bloodAwakenStartedAt: 1000 };
  it('覚醒していなければ全部1', () => {
    expect(bloodAwakenMult({}, 0)).toEqual({ boost: 1 });
    expect(bloodAwakenMult(p, 11_000)).toEqual({ boost: 1 });
  });
  it('入りは即: 1.5(被ダメージの倍率は無い)', () => {
    expect(bloodAwakenMult(p, 1000)).toEqual({ boost: 1.5 });
    expect(bloodAwakenMult(p, 5000)).toEqual({ boost: 1.5 });
    expect(bloodAwakenMult(p, 11_000 - BLOOD_AWAKEN_FADE_MS)).toEqual({ boost: 1.5 });
  });
  it('終わりの1秒で線形に 1.5→1.0', () => {
    const m = bloodAwakenMult(p, 11_000 - BLOOD_AWAKEN_FADE_MS / 2);
    expect(m.boost).toBeCloseTo(1.25);
    expect(bloodAwakenMult(p, 10_999).boost).toBeCloseTo(1.0005, 3);
  });
  it('単調(終わりに向かって減るだけ)', () => {
    let prev = 2;
    for (let t = 1000; t < 11_000; t += 50) {
      const m = bloodAwakenMult(p, t);
      expect(m.boost).toBeLessThanOrEqual(prev + 1e-12);
      prev = m.boost;
    }
  });
});

describe('bloodAwakenGlowAlpha / bloodAwakenRedAlpha(光が先・体が遅れて染まる・入りは一度オーバーシュート)', () => {
  const p = { bloodAwakenUntil: 11_000, bloodAwakenStartedAt: 1000 };
  it('覚醒していなければ 0', () => {
    for (const f of [bloodAwakenGlowAlpha, bloodAwakenRedAlpha]) {
      expect(f({}, 0)).toBe(0);
      expect(f(p, 11_000)).toBe(0);
    }
  });
  it('光: 入りは 0 から ease-out で 1.2 へ(パッと出ない)→ 0.5秒で 1.0 へ落ち着く', () => {
    expect(bloodAwakenGlowAlpha(p, 1000)).toBe(0);
    const a1 = bloodAwakenGlowAlpha(p, 1000 + BLOOD_RED_IN_MS / 3);
    const a2 = bloodAwakenGlowAlpha(p, 1000 + (BLOOD_RED_IN_MS * 2) / 3);
    expect(a1).toBeGreaterThan(0);
    expect(a2).toBeGreaterThan(a1);
    expect(a1).toBeGreaterThan(BLOOD_RED_OVERSHOOT / 3); // ease-out=序盤が速い
    expect(bloodAwakenGlowAlpha(p, 1000 + BLOOD_RED_IN_MS)).toBeCloseTo(BLOOD_RED_OVERSHOOT);
    expect(bloodAwakenGlowAlpha(p, 1000 + BLOOD_RED_IN_MS + BLOOD_RED_SETTLE_MS)).toBeCloseTo(1);
    expect(bloodAwakenGlowAlpha(p, 6000)).toBe(1);
  });
  it('オーバーシュート後は単調に 1.0 へ戻る(ピークは 1.2 を超えない)', () => {
    let prev = BLOOD_RED_OVERSHOOT;
    for (let t = BLOOD_RED_IN_MS; t <= BLOOD_RED_IN_MS + BLOOD_RED_SETTLE_MS; t += 10) {
      const a = bloodAwakenGlowAlpha(p, 1000 + t);
      expect(a).toBeLessThanOrEqual(prev + 1e-12);
      expect(a).toBeGreaterThanOrEqual(1 - 1e-12);
      prev = a;
    }
  });
  it('体は光より BLOOD_BODY_LAG_MS 遅れる(位相差 80〜120ms・同じ形を遅らせただけ)', () => {
    expect(BLOOD_BODY_LAG_MS).toBeGreaterThanOrEqual(80);
    expect(BLOOD_BODY_LAG_MS).toBeLessThanOrEqual(120);
    expect(bloodAwakenRedAlpha(p, 1000 + BLOOD_BODY_LAG_MS)).toBe(0);
    for (const dt of [30, 90, 200, 330, 500]) {
      expect(bloodAwakenRedAlpha(p, 1000 + BLOOD_BODY_LAG_MS + dt)).toBeCloseTo(bloodAwakenGlowAlpha(p, 1000 + dt), 6);
      if (dt <= 200) expect(bloodAwakenRedAlpha(p, 1000 + dt)).toBeLessThan(bloodAwakenGlowAlpha(p, 1000 + dt)); // 立ち上がりの間は体が遅れている
    }
    expect(bloodAwakenRedAlpha(p, 6000)).toBe(1);
  });
  it('終わりの1秒で 1→0 へ戻る(単調減少・光と体は同時)', () => {
    for (const f of [bloodAwakenGlowAlpha, bloodAwakenRedAlpha]) {
      let prev = 1;
      for (let t = 10_000; t < 11_000; t += 20) {
        const a = f(p, t);
        expect(a).toBeLessThanOrEqual(prev + 1e-12);
        prev = a;
      }
      expect(f(p, 10_000)).toBeCloseTo(1);
      expect(f(p, 10_999)).toBeLessThan(0.001);
    }
  });
});

describe('bloodPulseMult(覚醒中の鼓動=心拍の形・サイン波ではない)', () => {
  it('範囲は 1-depth..1・拍の頭と休止は底(1-depth)・1拍目の山は 1', () => {
    const depth = 0.3;
    expect(bloodPulseMult(0, depth)).toBeCloseTo(1 - depth);
    expect(bloodPulseMult(55, depth)).toBeCloseTo(1);
    expect(bloodPulseMult(BLOOD_BEAT_PERIOD_MS - 10, depth)).toBeCloseTo(1 - depth); // 休止
    for (let t = 0; t < BLOOD_BEAT_PERIOD_MS * 2; t += 7) {
      const m = bloodPulseMult(t, depth);
      expect(m).toBeGreaterThanOrEqual(1 - depth - 1e-12);
      expect(m).toBeLessThanOrEqual(1 + 1e-12);
    }
  });
  it('二拍(55msと300msに山)・間に谷・休止が長い=サイン波(山が1つ)ではない', () => {
    const d = 0.4;
    const v = (t: number) => bloodPulseMult(t, d);
    expect(v(170)).toBeLessThan(v(55));
    expect(v(170)).toBeLessThan(v(300));
    expect(v(300)).toBeGreaterThan(1 - d + d * 0.6); // 2拍目も山
    expect(v(300)).toBeLessThan(v(55));              // 2拍目は弱い
    expect(v(700)).toBeCloseTo(1 - d);               // 休止
  });
  it('周期でつながる(位相が負でも壊れない)', () => {
    expect(bloodPulseMult(BLOOD_BEAT_PERIOD_MS + 55, 0.3)).toBeCloseTo(bloodPulseMult(55, 0.3));
    expect(Number.isFinite(bloodPulseMult(-100, 0.3))).toBe(true);
  });
});

describe('bloodOrbTarget(オーブの液体の赤み)', () => {
  it('覚醒していない間は乾き込みの血の量', () => {
    expect(bloodOrbTarget({ bloodMeter: 0.5, bloodLastGainAt: 0 }, 100)).toBeCloseTo(0.5);
  });
  it('覚醒中は残り時間の割合(10秒で赤→紫へ戻る)', () => {
    const p = { bloodMeter: 1, bloodAwakenUntil: 11_000, bloodAwakenStartedAt: 1000 };
    expect(bloodOrbTarget(p, 1000)).toBeCloseTo(1);
    expect(bloodOrbTarget(p, 6000)).toBeCloseTo(0.5);
    expect(bloodOrbTarget(p, 10_999)).toBeCloseTo(0, 2);
  });
});

describe('withoutBlood(守護霊・幻影の疑似Playerへ持ち越さない)', () => {
  it('血と覚醒を全部0にして、他の欄はそのまま', () => {
    const live = { bloodMeter: 1, bloodLastGainAt: 5, bloodAwakenUntil: 99_999, bloodAwakenStartedAt: 5, hp: 77 };
    const g = withoutBlood(live);
    expect(g).toEqual({ bloodMeter: 0, bloodLastGainAt: 0, bloodAwakenUntil: 0, bloodAwakenStartedAt: 0, hp: 77 });
    expect(isBloodAwakening(g, 1)).toBe(false);
    expect(bloodAwakenMult(g, 1)).toEqual({ boost: 1 });
    expect(live.bloodAwakenUntil).toBe(99_999); // 元は書き換えない
  });
});
