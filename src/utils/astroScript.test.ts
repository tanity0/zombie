import { describe, it, expect } from 'vitest';
import {
  pickAstroThrow, astroThrowPlan, astroThrowArtFrame, astroScatterStep, ASTRO_SCATTER_COUNT, ASTRO_SCATTER_RADIUS, ASTRO_SCATTER_GAP, astroHitOffsetMs, stepAstroHover, astroLiftPx, stepAstroVelocity, astroArriveSpeed,
  astroPoiCandidates, pickAstroPoi, astroSpawnPick, astroBandPull, astroMeteorShake,
  ASTRO_RELEASE_MS, ASTRO_DEBRIS_COUNT, ASTRO_FLAG_LENGTH, ASTRO_ARRIVE_PX,
  ASTRO_LIFT_PX, ASTRO_BOB_PX, ASTRO_TURN_RAD_PER_S, ASTRO_ACCEL_S, ASTRO_DECEL_S, type AstroThrowKind, type AstroHoverAnim,
} from './astroScript';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('宇宙飛行群: 投げる物の時刻(§9)', () => {
  it('手を離すのは7コマ目=490ms、命中は設計書の時刻', () => {
    expect(ASTRO_RELEASE_MS).toBe(490);
    expect(astroHitOffsetMs('missile')).toBe(1090);
    expect(astroHitOffsetMs('flag')).toBe(610);
    expect(astroHitOffsetMs('debris', 0)).toBe(1190);
    expect(astroHitOffsetMs('debris', 7)).toBe(2240);
    expect(astroHitOffsetMs('meteor')).toBe(4490);
    expect(astroHitOffsetMs('bouquet')).toBe(1190);
  });

  it('予告は全部投げ始めに出て、残骸は8枚が別々の時刻に当たる(多段は段ごと)', () => {
    const plan = astroThrowPlan('debris', 't1', 'e1', { x: 0, y: 0 }, { x: 400, y: 0 }, 1000, Math.random);
    expect(plan).toHaveLength(ASTRO_DEBRIS_COUNT);
    expect(plan.every(p => p.bornAt === 1000)).toBe(true);
    expect(new Set(plan.map(p => p.hitAt)).size).toBe(ASTRO_DEBRIS_COUNT);
    for (const p of plan) expect(Math.hypot(p.x - 400, p.y)).toBeLessThanOrEqual(350 + 1e-6);
  });

  it('国旗の帯は投げ手の位置から狙った向きへ700(起点固定)', () => {
    const [f] = astroThrowPlan('flag', 't', 'e', { x: 100, y: 100 }, { x: 100, y: 300 }, 0, Math.random);
    expect(f.capsule).toEqual({ fx: 100, fy: 100, tx: 100, ty: 100 + ASTRO_FLAG_LENGTH, halfWidth: 18 });
    expect(f.hitAt).toBe(610);
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
  it('持ち上げは絵だけ: 0〜2コマは0、8コマで18、浮遊中は±3の揺れ', () => {
    expect(astroLiftPx(0, 0)).toBe(0);
    expect(astroLiftPx(2, 0)).toBe(0);
    expect(astroLiftPx(5, 0)).toBeGreaterThan(0);
    expect(astroLiftPx(5, 0)).toBeLessThan(ASTRO_LIFT_PX);
    for (let t = 0; t < 5000; t += 37) {
      const v = astroLiftPx(10, t);
      expect(v).toBeGreaterThanOrEqual(ASTRO_LIFT_PX - ASTRO_BOB_PX - 1e-9);
      expect(v).toBeLessThanOrEqual(ASTRO_LIFT_PX + ASTRO_BOB_PX + 1e-9);
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

describe('宇宙飛行群: 周りに散らばる残骸(§11)', () => {
  const far = { left: 1e6, right: 1e6 + 1, top: 1e6, bottom: 1e6 + 1 }; // 画面はずっと遠く=全部「画面の外」
  const ok = () => true;
  it('中心の周りの円の中に決まった数を置き、残骸どうしは離す', () => {
    const seq = { n: 0 };
    const p = astroScatterStep([], { x: 1000, y: 0 }, null, far, ok, 0, Math.random, seq);
    expect(p).toHaveLength(ASTRO_SCATTER_COUNT);
    for (const a of p) expect(Math.hypot(a.x - 1000, a.y)).toBeLessThanOrEqual(ASTRO_SCATTER_RADIUS + 1e-6);
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) expect(Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y)).toBeGreaterThanOrEqual(ASTRO_SCATTER_GAP);
  });
  it('移動して遠くなった残骸は消え、新しい周りへ置き直す', () => {
    const seq = { n: 0 };
    const p0 = astroScatterStep([], { x: 0, y: 0 }, null, far, ok, 0, Math.random, seq);
    const p1 = astroScatterStep(p0, { x: 5000, y: 0 }, null, far, ok, 250, Math.random, seq);
    expect(p1).toHaveLength(ASTRO_SCATTER_COUNT);
    for (const a of p1) expect(Math.hypot(a.x - 5000, a.y)).toBeLessThanOrEqual(ASTRO_SCATTER_RADIUS + 1e-6);
  });
  it('進んでいる時は、行く先の側に多く置く(後ろへ尾を引かない)', () => {
    let ahead = 0, total = 0;
    let seed = 12345;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let n = 0; n < 40; n++) {
      const seq = { n: 0 };
      let p: ReturnType<typeof astroScatterStep> = [];
      for (let k = 0; k < 60; k++) p = astroScatterStep(p, { x: k * 20, y: 0 }, { x: 1, y: 0 }, far, ok, k * 250, rng, seq); // 右へ進み続ける
      for (const a of p) { total++; if (a.x > 59 * 20) ahead++; }
    }
    // 置き直しの規則を直す前は前方が2割を切っていた(品質監査の模擬)。円の半分近くが前にあること。
    expect(ahead / total).toBeGreaterThan(0.4);
  });
  it('画面の中では、上側の霞の帯にだけ置く(目の前で湧かない)。画面の中の物は消さない', () => {
    const seq = { n: 0 };
    const view = { left: -500, right: 500, top: -1000, bottom: 1000 }; // 霞の帯= y < -400
    const p0 = astroScatterStep([], { x: 0, y: 0 }, null, view, ok, 0, Math.random, seq);
    for (const a of p0) if (a.x >= -500 && a.x <= 500 && a.y >= -1000 && a.y <= 1000) { expect(a.y).toBeLessThan(-400); expect(a.haze).toBe(true); }
    const kept = [{ ...p0[0], id: 'v', x: 0, y: 0 }];
    const p1 = astroScatterStep(kept, { x: 9000, y: 0 }, null, view, ok, 250, Math.random, seq);
    expect(p1.some(a => a.id === 'v')).toBe(true);
  });
  it('建物などに埋まる所・本体の足元のすぐ近くには置かない', () => {
    const seq = { n: 0 };
    const p = astroScatterStep([], { x: 0, y: 0 }, null, far, (x) => x < 0, 0, Math.random, seq);
    for (const a of p) { expect(a.x).toBeLessThan(0); expect(Math.hypot(a.x, a.y)).toBeGreaterThanOrEqual(140); }
  });
  it('居なければ新しく置かず、画面の外のものから消える。変わらなければ同じ配列', () => {
    const seq = { n: 0 };
    const p0 = astroScatterStep([], { x: 0, y: 0 }, null, far, ok, 0, Math.random, seq);
    expect(astroScatterStep(p0, { x: 0, y: 0 }, null, far, ok, 250, Math.random, seq)).toBe(p0);
    expect(astroScatterStep(p0, null, null, far, ok, 250, Math.random, seq)).toHaveLength(0);
  });
});
