import { describe, it, expect } from 'vitest';
import {
  pickAstroThrow, astroThrowPlan, astroThrowArtFrame, astroRainStep, ASTRO_RAIN_CAP, ASTRO_RAIN_NEAR_PX, ASTRO_RAIN_RING_MIN, ASTRO_RAIN_RING_MAX, ASTRO_RAIN_FIRST_MIN_PX, ASTRO_RAIN_FIRST_MAX_PX, ASTRO_RAIN_WARN_MS, ASTRO_RAIN_GAP_MIN_MS, ASTRO_RAIN_GAP_MAX_MS, ASTRO_RAIN_SINK_MS, astroHitOffsetMs, stepAstroHover, astroLiftPx, stepAstroVelocity, astroArriveSpeed,
  astroPoiCandidates, pickAstroPoi, astroSpawnPick, astroBandPull, astroMeteorShake,
  ASTRO_RELEASE_MS, ASTRO_DEBRIS_COUNT, ASTRO_DEBRIS_SPREAD_PX, ASTRO_DEBRIS_GAP_PX, ASTRO_FLAG_BEYOND_PX, ASTRO_FLAG_MIN_LENGTH, ASTRO_ARRIVE_PX,
  ASTRO_LIFT_PX, ASTRO_HOVER_ALIGN, stepAstroPeriodicLand, ASTRO_PERIODIC_LAND_GAP_MIN_MS, ASTRO_PERIODIC_LAND_GAP_MAX_MS, ASTRO_PERIODIC_LAND_REST_MIN_MS, ASTRO_PERIODIC_LAND_REST_MAX_MS, ASTRO_TURN_RAD_PER_S, ASTRO_ACCEL_S, ASTRO_DECEL_S, type AstroThrowKind, type AstroHoverAnim,
} from './astroScript';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('宇宙飛行群: 投げる物の時刻(§9)', () => {
  it('手を離すのは7コマ目=490ms、命中は設計書の時刻', () => {
    expect(ASTRO_RELEASE_MS).toBe(490);
    expect(astroHitOffsetMs('missile')).toBe(1090);
    expect(astroHitOffsetMs('flag')).toBe(610);
    expect(astroHitOffsetMs('debris', 0)).toBe(790);
    expect(astroHitOffsetMs('debris', 7)).toBe(1630);
    expect(astroHitOffsetMs('meteor')).toBe(4490);
    expect(astroHitOffsetMs('bouquet')).toBe(1190);
  });

  it('予告は全部投げ始めに出て、残骸は8枚が別々の時刻に当たる(多段は段ごと)', () => {
    const plan = astroThrowPlan('debris', 't1', 'e1', { x: 0, y: 0 }, { x: 400, y: 0 }, 1000, Math.random);
    expect(plan).toHaveLength(ASTRO_DEBRIS_COUNT);
    expect(plan.every(p => p.bornAt === 1000)).toBe(true);
    expect(new Set(plan.map(p => p.hitAt)).size).toBe(ASTRO_DEBRIS_COUNT);
    for (const p of plan) expect(Math.hypot(p.x - 400, p.y)).toBeLessThanOrEqual(ASTRO_DEBRIS_SPREAD_PX + 1e-6);
  });
  it('残骸は1枚がプレイヤーの所そのものへ落ち、残りも枚どうし離れる(§12-2)', () => {
    let seed = 7;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let n = 0; n < 50; n++) {
      const plan = astroThrowPlan('debris', 't', 'e', { x: 0, y: 0 }, { x: 400, y: 50 }, 0, rng);
      expect(plan.filter(p => p.x === 400 && p.y === 50)).toHaveLength(1);
      for (let i = 0; i < plan.length; i++) for (let j = i + 1; j < plan.length; j++) expect(Math.hypot(plan[i].x - plan[j].x, plan[i].y - plan[j].y)).toBeGreaterThanOrEqual(ASTRO_DEBRIS_GAP_PX);
    }
  });

  it('国旗の帯は投げ手の位置からプレイヤーの少し後ろまで(起点固定・§12-3)', () => {
    const [f] = astroThrowPlan('flag', 't', 'e', { x: 100, y: 100 }, { x: 100, y: 500 }, 0, Math.random);
    expect(f.capsule).toEqual({ fx: 100, fy: 100, tx: 100, ty: 500 + ASTRO_FLAG_BEYOND_PX, halfWidth: 18 });
    expect(f.hitAt).toBe(610);
    const [g] = astroThrowPlan('flag', 't', 'e', { x: 0, y: 0 }, { x: 30, y: 0 }, 0, Math.random);
    expect(g.capsule!.tx).toBeCloseTo(ASTRO_FLAG_MIN_LENGTH);
  });
});

describe('宇宙飛行群: 投げる物の抽選', () => {
  it('同じ物は2回続けない', () => {
    for (let i = 0; i < 200; i++) {
      const prev = (['missile', 'flag', 'debris', 'meteor', 'bouquet'] as AstroThrowKind[])[i % 5];
      expect(pickAstroThrow(prev, 0, 1e9, Math.random)).not.toBe(prev);
    }
  });
  it('隕石は間隔の間は選ばない', () => {
    for (let i = 0; i < 300; i++) expect(pickAstroThrow(null, 20000, 10000, Math.random)).not.toBe('meteor');
  });
  it('重みどおりに偏る(ミサイルが一番多い)', () => {
    const n: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) { const k = pickAstroThrow(null, 0, 1, Math.random); n[k] = (n[k] ?? 0) + 1; }
    expect(n.missile).toBeGreaterThan(n.meteor);
    expect(n.missile).toBeGreaterThan(n.bouquet);
  });
});

describe('宇宙飛行群: 浮遊のコマ(§3)', () => {
  it('浮く時は0→10へ順に進み、移動中は8・9・10をピンポン(折り返しで一拍溜める)', () => {
    let a: AstroHoverAnim = { frame: 0, acc: 0, dir: 1 };
    const seq: number[] = [0];
    const held: Record<number, number> = {};
    for (let i = 0; i < 200; i++) {
      a = stepAstroHover(a, true, 10);
      if (seq[seq.length - 1] !== a.frame) seq.push(a.frame);
      if (seq.length > 11) held[a.frame] = (held[a.frame] ?? 0) + 10;
    }
    expect(seq.slice(1, 17)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 9, 10, 9, 8]);
    expect(held[10]).toBeGreaterThan(held[9] / 2); // 10は1回の滞在が9より長い(9は往復で2回通る)
  });
  it('往復の間は体の寄せで固定する(寄せの表は往復のコマだけ)', () => {
    expect(Object.keys(ASTRO_HOVER_ALIGN).map(Number).every(f => f > 8 && f <= 10)).toBe(true);
  });
  it('着地は今のコマから0まで逆にたどる(上でためて、地面が近いほど速い)', () => {
    let a: AstroHoverAnim = { frame: 9, acc: 0, dir: 1 };
    const seq: number[] = [9], at: number[] = [];
    for (let t = 1; t <= 2000 && a.frame > 0; t++) { a = stepAstroHover(a, false, 1); if (seq[seq.length - 1] !== a.frame) { seq.push(a.frame); at.push(t); } }
    expect(seq).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(at[at.length - 1] - at[at.length - 2]).toBeLessThan(at[1] - at[0]);
  });
  it('崩れて落ちる時は通常より速く、地面に近いほど加速する(重力の向き)', () => {
    const timeTo0 = (collapse: boolean) => {
      let a: AstroHoverAnim = { frame: 10, acc: 0, dir: 1 };
      const at: number[] = [];
      for (let t = 1; t <= 2000; t++) { const f0 = a.frame; a = stepAstroHover(a, false, 1, collapse); if (a.frame !== f0) at.push(t); if (a.frame === 0) break; }
      return at;
    };
    const n = timeTo0(false), c = timeTo0(true);
    expect(c[c.length - 1]).toBeLessThan(n[n.length - 1]);
    expect(c[c.length - 1] - c[c.length - 2]).toBeLessThan(c[1] - c[0]);
  });
  it('持ち上げは絵だけ: 0〜2コマは0、浮き切ったら一定(上下に揺らさない)', () => {
    expect(astroLiftPx(0)).toBe(0);
    expect(astroLiftPx(2)).toBe(0);
    expect(astroLiftPx(5)).toBeGreaterThan(0);
    expect(astroLiftPx(5)).toBeLessThan(ASTRO_LIFT_PX);
    expect(astroLiftPx(8)).toBe(ASTRO_LIFT_PX);
    expect(astroLiftPx(10)).toBe(ASTRO_LIFT_PX);
  });
});

describe('宇宙飛行群: 定期の着地', () => {
  it('浮き切ってから6〜10秒で降り、着いてから1.5〜2.5秒休んで、また浮く', () => {
    for (let n = 0; n < 30; n++) {
      let p = { nextAt: null as number | null, holdUntil: null as number | null };
      let frame = 10, landStart = -1, groundAt = -1, upAt = -1;
      for (let t = 0; t < 30000 && upAt < 0; t += 16) {
        const r = stepAstroPeriodicLand(p, t, frame, Math.random);
        p = { nextAt: r.nextAt, holdUntil: r.holdUntil };
        if (r.land && landStart < 0) landStart = t;
        if (r.land) frame = Math.max(0, frame - 1); else if (landStart >= 0) frame = Math.min(10, frame + 1);
        if (frame === 0 && groundAt < 0) groundAt = t;
        if (landStart >= 0 && !r.land && upAt < 0) upAt = t;
      }
      expect(landStart).toBeGreaterThanOrEqual(ASTRO_PERIODIC_LAND_GAP_MIN_MS - 16);
      expect(landStart).toBeLessThanOrEqual(ASTRO_PERIODIC_LAND_GAP_MAX_MS + 16);
      expect(upAt - groundAt).toBeGreaterThanOrEqual(ASTRO_PERIODIC_LAND_REST_MIN_MS - 32);
      expect(upAt - groundAt).toBeLessThanOrEqual(ASTRO_PERIODIC_LAND_REST_MAX_MS + 32);
    }
  });
});

describe('宇宙飛行群: 慣性', () => {
  it('最高速までおよそ0.9秒・止まるまでおよそ1.2秒', () => {
    let v = { heading: 0, speed: 0 };
    let t = 0;
    while (v.speed < 70 && t < 5) { v = stepAstroVelocity(v, { heading: 0, speed: 70 }, 70, 1 / 60); t += 1 / 60; }
    expect(t).toBeCloseTo(ASTRO_ACCEL_S, 1);
    t = 0;
    while (v.speed > 0 && t < 5) { v = stepAstroVelocity(v, { heading: 0, speed: 0 }, 70, 1 / 60); t += 1 / 60; }
    expect(t).toBeCloseTo(ASTRO_DECEL_S, 1);
  });
  it('動いている間の曲がりは1秒に70°まで', () => {
    const v = stepAstroVelocity({ heading: 0, speed: 70 }, { heading: Math.PI, speed: 70 }, 70, 0.5);
    expect(Math.abs(v.heading)).toBeCloseTo(ASTRO_TURN_RAD_PER_S * 0.5, 5);
  });
  it('手前で止まり切れる速さに落とす', () => {
    expect(astroArriveSpeed(0, 70)).toBe(0);
    expect(astroArriveSpeed(1e6, 70)).toBe(70);
  });
});

describe('宇宙飛行群: 巡回(§8)', () => {
  it('位置の無い物は除き、2か所未満なら無作為な点で補う', () => {
    const c = astroPoiCandidates([null, { x: 5, y: 5 }, undefined], { x: 0, y: 0 }, 6000, 11000, seq([0.25, 0.5]));
    expect(c).toHaveLength(2);
    const r = Math.hypot(c[1].x, c[1].y);
    expect(r).toBeGreaterThanOrEqual(6000);
    expect(r).toBeLessThanOrEqual(11000);
  });
  it('直前の所は選ばない', () => {
    for (let i = 0; i < 100; i++) expect(pickAstroPoi(4, 2, Math.random)).not.toBe(2);
  });
  it('プレイヤーから離れた候補の、着いた距離ぶん手前に置く(無ければ一番遠い所)', () => {
    const cands = [{ x: 100, y: 0 }, { x: 5000, y: 0 }];
    const p = astroSpawnPick(cands, { x: 0, y: 0 }, 3000, () => 0);
    expect(p.index).toBe(1);
    expect(p.x).toBeCloseTo(5000 - ASTRO_ARRIVE_PX);
    const q = astroSpawnPick([{ x: 100, y: 0 }, { x: 900, y: 0 }], { x: 0, y: 0 }, 3000, () => 0);
    expect(q.index).toBe(1);
  });
  it('交戦の帯: 260〜520の中は0、外は寄る/離れる', () => {
    expect(astroBandPull(400)).toBe(0);
    expect(astroBandPull(100)).toBeLessThan(0);
    expect(astroBandPull(800)).toBeGreaterThan(0);
  });
});

describe('宇宙飛行群: 隕石の揺れ', () => {
  it('弱→強、最後の0.5秒が最大', () => {
    expect(astroMeteorShake(4000)).toBeLessThan(astroMeteorShake(2000));
    expect(astroMeteorShake(400)).toBe(1);
    expect(astroMeteorShake(4490)).toBeGreaterThan(0);
  });
});

describe('宇宙飛行群: 投げる物の絵(社長支給の並び)', () => {
  it('左からミサイル/花束/国旗/隕石/残骸8種', () => {
    expect(astroThrowArtFrame('missile')).toBe(0);
    expect(astroThrowArtFrame('bouquet')).toBe(1);
    expect(astroThrowArtFrame('flag')).toBe(2);
    expect(astroThrowArtFrame('meteor')).toBe(3);
    expect(astroThrowArtFrame('debris', 0)).toBe(4);
    expect(astroThrowArtFrame('debris', 7)).toBe(11);
  });
  it('残骸8枚は1回の投げで全部違う絵', () => {
    for (let n = 0; n < 50; n++) {
      const plan = astroThrowPlan('debris', 't', 'e', { x: 0, y: 0 }, { x: 0, y: 0 }, 0, Math.random);
      expect(new Set(plan.map(p => astroThrowArtFrame('debris', p.variant))).size).toBe(8);
    }
  });
});

describe('宇宙飛行群: 周りに降り注ぐ残骸(§12-1)', () => {
  const ok = () => true;
  const rng0 = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const run = (astro: { x: number; y: number } | null, player: { x: number; y: number }, ms: number, rng = rng0(3)) => {
    const st = { nextAt: 0, seq: 0 };
    let p: ReturnType<typeof astroRainStep> = [];
    const born: number[] = [];
    for (let t = 0; t <= ms; t += 16) { const q = astroRainStep(p, astro, player, ok, t, rng, st); if (q.length > p.length || q.some(a => !p.includes(a) && !p.some(b => b.id === a.id))) born.push(t); p = q; }
    return { p, born };
  };
  it('プレイヤーが近い間だけ、1〜1.5秒に1枚降る', () => {
    const near = run({ x: 0, y: 0 }, { x: ASTRO_RAIN_NEAR_PX - 10, y: 0 }, 20000);
    expect(near.born.length).toBeGreaterThanOrEqual(Math.floor(20000 / ASTRO_RAIN_GAP_MAX_MS));
    expect(near.born.length).toBeLessThanOrEqual(Math.ceil(20000 / ASTRO_RAIN_GAP_MIN_MS) + 1);
    for (let i = 1; i < near.born.length; i++) expect(near.born[i] - near.born[i - 1]).toBeGreaterThanOrEqual(ASTRO_RAIN_GAP_MIN_MS - 16);
    expect(run({ x: 0, y: 0 }, { x: ASTRO_RAIN_NEAR_PX + 10, y: 0 }, 20000).p).toHaveLength(0);
    expect(run(null, { x: 0, y: 0 }, 20000).p).toHaveLength(0);
  });
  it('近づいた瞬間に1枚目がプレイヤーのそばへ。以後は本体の周りの輪の中。どれも降り始めから決まった尺で刺さる', () => {
    for (let n = 0; n < 30; n++) {
      const st = { nextAt: 0, seq: 0 }, rng = rng0(11 + n);
      let p: ReturnType<typeof astroRainStep> = [];
      // 遠くから近づく: 最初の数フレームは遠い
      for (let t = 0; t < 200; t += 16) p = astroRainStep(p, { x: 0, y: 0 }, { x: 5000, y: 0 }, ok, t, rng, st);
      expect(p).toHaveLength(0);
      const seen: ReturnType<typeof astroRainStep> = [];
      for (let t = 200; t <= 30000; t += 16) { p = astroRainStep(p, { x: 0, y: 0 }, { x: 900, y: 0 }, ok, t, rng, st); for (const a of p) if (!seen.some(b => b.id === a.id)) seen.push(a); }
      expect(seen[0].bornAt).toBe(200); // 入った瞬間
      const d0 = Math.hypot(seen[0].x - 900, seen[0].y);
      expect(d0).toBeGreaterThanOrEqual(ASTRO_RAIN_FIRST_MIN_PX - 1e-6);
      expect(d0).toBeLessThanOrEqual(ASTRO_RAIN_FIRST_MAX_PX + 1e-6);
      for (const a of seen.slice(1)) {
        const d = Math.hypot(a.x, a.y);
        expect(d).toBeGreaterThanOrEqual(ASTRO_RAIN_RING_MIN - 1e-6);
        expect(d).toBeLessThanOrEqual(ASTRO_RAIN_RING_MAX + 1e-6);
      }
      for (const a of seen) { expect(a.landAt - a.bornAt).toBe(ASTRO_RAIN_WARN_MS); expect(a.fallMs).toBeLessThan(ASTRO_RAIN_WARN_MS); }
    }
  });
  it('1000pxの境目を出入りしても、降る間隔は最低の間隔より詰まらない(品質監査 A3)', () => {
    const st = { nextAt: 0, seq: 0 }, rng = rng0(21);
    let p: ReturnType<typeof astroRainStep> = [];
    const born: number[] = [];
    for (let t = 0; t <= 20000; t += 16) {
      const inside = Math.floor(t / 300) % 2 === 0; // 0.3秒ごとに出入り
      const q = astroRainStep(p, { x: 0, y: 0 }, { x: inside ? ASTRO_RAIN_NEAR_PX - 5 : ASTRO_RAIN_NEAR_PX + 5, y: 0 }, ok, t, rng, st);
      for (const a of q) if (!p.some(b => b.id === a.id)) born.push(a.bornAt);
      p = q;
    }
    expect(born.length).toBeGreaterThan(5);
    for (let i = 1; i < born.length; i++) expect(born[i] - born[i - 1]).toBeGreaterThanOrEqual(ASTRO_RAIN_GAP_MIN_MS);
  });
  it('上限を超えたら一番古い物から沈み、沈み切ったら消える(パッと消さない)', () => {
    const st = { nextAt: 0, seq: 0 }, rng = rng0(5);
    let p: ReturnType<typeof astroRainStep> = [];
    let maxLive = 0;
    for (let t = 0; t <= 120000; t += 16) {
      const before = p;
      p = astroRainStep(p, { x: 0, y: 0 }, { x: 600, y: 0 }, ok, t, rng, st);
      maxLive = Math.max(maxLive, p.filter(a => a.sinkAt === undefined).length);
      for (const b of before) if (!p.some(a => a.id === b.id)) { expect(b.sinkAt).toBeDefined(); expect(t - b.sinkAt!).toBeGreaterThanOrEqual(ASTRO_RAIN_SINK_MS); }
      const sinking = p.filter(a => a.sinkAt !== undefined), live = p.filter(a => a.sinkAt === undefined);
      for (const s of sinking) for (const l of live) expect(s.bornAt).toBeLessThanOrEqual(l.bornAt); // 沈むのは古い方
    }
    expect(maxLive).toBe(ASTRO_RAIN_CAP);
  });
  it('埋まる所には落とさない。変わらなければ同じ配列', () => {
    const st = { nextAt: 0, seq: 0 };
    let p: ReturnType<typeof astroRainStep> = [];
    for (let t = 0; t <= 30000; t += 50) p = astroRainStep(p, { x: 0, y: 0 }, { x: 0, y: 600 }, (x) => x < 0, t, rng0(9), st);
    for (const a of p) expect(a.x).toBeLessThan(0);
    const st2 = { nextAt: 1e9, seq: 0 };
    expect(astroRainStep(p.filter(a => a.sinkAt === undefined), null, { x: 0, y: 0 }, ok, 31000, Math.random, st2)).toEqual(p.filter(a => a.sinkAt === undefined));
  });
});
