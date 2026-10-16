// B10 血の覚醒(research/THEONE_ROUND2.md §3)の純関数テスト。配線は src/store/bloodAwaken.store.test.ts。
import { describe, it, expect } from 'vitest';
import {
  bloodGainMult, bloodGainFor, bloodDryStep, bloodMeterNow, isBloodAwakening, bloodAwakenMult, bloodAwakenRedAlpha,
  applyBloodGain, bloodAwakenStep, bloodOrbTarget, withoutBlood,
  BLOOD_AWAKEN_MS, BLOOD_AWAKEN_FADE_MS, BLOOD_DRY_DELAY_MS, BLOOD_RED_IN_MS,
} from './bloodAwaken';

describe('bloodGainMult(HPが低いほど早く染まる)', () => {
  it('満タン×1.0 / HP半分×1.75 / HP2割×2.2', () => {
    expect(bloodGainMult(1)).toBeCloseTo(1);
    expect(bloodGainMult(0.5)).toBeCloseTo(1.75);
    expect(bloodGainMult(0.2)).toBeCloseTo(2.2);
  });
  it('単調: HPが減るほど増える(0.05刻みで全域)', () => {
    let prev = bloodGainMult(1);
    for (let hp = 0.95; hp >= -0.0001; hp -= 0.05) {
      const m = bloodGainMult(hp);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });
  it('範囲外は丸める', () => {
    expect(bloodGainMult(2)).toBeCloseTo(1);
    expect(bloodGainMult(-1)).toBeCloseTo(2.5);
  });
});

describe('bloodGainFor(表 §3-1)', () => {
  it('近接キル: 距離≤120px で +0.12 / それ以上 +0.06(境界は120を含む)', () => {
    expect(bloodGainFor({ kind: 'melee-kill', distPx: 0, hpFrac: 1 })).toBeCloseTo(0.12);
    expect(bloodGainFor({ kind: 'melee-kill', distPx: 120, hpFrac: 1 })).toBeCloseTo(0.12);
    expect(bloodGainFor({ kind: 'melee-kill', distPx: 120.01, hpFrac: 1 })).toBeCloseTo(0.06);
  });
  it('近接ヒットのみ +0.02', () => {
    expect(bloodGainFor({ kind: 'melee-hit', distPx: 0, hpFrac: 1 })).toBeCloseTo(0.02);
  });
  it('銃キル: 距離≤90px だけ +0.06 / それ以上は 0(境界は90を含む)', () => {
    expect(bloodGainFor({ kind: 'gun-kill', distPx: 90, hpFrac: 1 })).toBeCloseTo(0.06);
    expect(bloodGainFor({ kind: 'gun-kill', distPx: 90.01, hpFrac: 1 })).toBe(0);
    expect(bloodGainFor({ kind: 'gun-kill', distPx: 500, hpFrac: 0.1 })).toBe(0);
  });
  it('HP補正が掛かる(HP2割の近接キル近距離=0.12×2.2)', () => {
    expect(bloodGainFor({ kind: 'melee-kill', distPx: 10, hpFrac: 0.2 })).toBeCloseTo(0.264);
  });
  it('受け入れ: 満タンHPの密着キル 8〜9回で満ちる / HP2割なら 4回', () => {
    const perFull = bloodGainFor({ kind: 'melee-kill', distPx: 10, hpFrac: 1 });
    expect(Math.ceil(1 / perFull)).toBe(9);
    expect(perFull * 8).toBeGreaterThan(0.95);
    const perLow = bloodGainFor({ kind: 'melee-kill', distPx: 10, hpFrac: 0.2 });
    expect(Math.ceil(1 / perLow)).toBe(4);
  });
  it('銃だけでは満ちにくい(満タンHPの近距離銃キルでも 17回)', () => {
    expect(Math.ceil(1 / bloodGainFor({ kind: 'gun-kill', distPx: 10, hpFrac: 1 }))).toBe(17);
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
    expect(bloodAwakenMult({}, 0)).toEqual({ boost: 1, taken: 1 });
    expect(bloodAwakenMult(p, 11_000)).toEqual({ boost: 1, taken: 1 });
  });
  it('入りは即: 1.5 / 被ダメ 2', () => {
    expect(bloodAwakenMult(p, 1000)).toEqual({ boost: 1.5, taken: 2 });
    expect(bloodAwakenMult(p, 5000)).toEqual({ boost: 1.5, taken: 2 });
    expect(bloodAwakenMult(p, 11_000 - BLOOD_AWAKEN_FADE_MS)).toEqual({ boost: 1.5, taken: 2 });
  });
  it('終わりの1秒で線形に 1.5→1.0 / 2→1', () => {
    const m = bloodAwakenMult(p, 11_000 - BLOOD_AWAKEN_FADE_MS / 2);
    expect(m.boost).toBeCloseTo(1.25);
    expect(m.taken).toBeCloseTo(1.5);
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

describe('bloodAwakenRedAlpha(体の赤・描画用)', () => {
  const p = { bloodAwakenUntil: 11_000, bloodAwakenStartedAt: 1000 };
  it('覚醒していなければ 0', () => {
    expect(bloodAwakenRedAlpha({}, 0)).toBe(0);
    expect(bloodAwakenRedAlpha(p, 11_000)).toBe(0);
  });
  it('入り0.3秒で ease-out に 1 へ(パッと出ない)', () => {
    expect(bloodAwakenRedAlpha(p, 1000)).toBe(0);
    const a1 = bloodAwakenRedAlpha(p, 1000 + BLOOD_RED_IN_MS / 3);
    const a2 = bloodAwakenRedAlpha(p, 1000 + (BLOOD_RED_IN_MS * 2) / 3);
    expect(a1).toBeGreaterThan(0);
    expect(a2).toBeGreaterThan(a1);
    expect(a1).toBeGreaterThan(1 / 3); // ease-out=序盤が速い
    expect(bloodAwakenRedAlpha(p, 1000 + BLOOD_RED_IN_MS)).toBeCloseTo(1);
    expect(bloodAwakenRedAlpha(p, 6000)).toBe(1);
  });
  it('終わりの1秒で 1→0 へ戻る(単調減少)', () => {
    let prev = 1;
    for (let t = 10_000; t < 11_000; t += 20) {
      const a = bloodAwakenRedAlpha(p, t);
      expect(a).toBeLessThanOrEqual(prev + 1e-12);
      prev = a;
    }
    expect(bloodAwakenRedAlpha(p, 10_000)).toBeCloseTo(1);
    expect(bloodAwakenRedAlpha(p, 10_999)).toBeLessThan(0.001);
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
    expect(bloodAwakenMult(g, 1)).toEqual({ boost: 1, taken: 1 });
    expect(live.bloodAwakenUntil).toBe(99_999); // 元は書き換えない
  });
});
