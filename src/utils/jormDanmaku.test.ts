import { describe, it, expect } from 'vitest';
import { distToBandRect } from './geometry';
import {
  jormSlamHitAt, jormSlamReach, jormSlamBand, jormSlamRect, jormBodyRectDist, jormSlamTelegraphProgress,
  jormWaveAngle, jormWaveTheta0, jormWaveParticleGapPx,
  jormRainLandingPoint, jormRainBurstAngles, jormRainLobPos,
} from './jormDanmaku';

describe('叩きつけの時刻表と赤い円(赤い予告の掟②③)', () => {
  it('段ごとに別々の命中時刻', () => {
    expect(jormSlamHitAt(1000, 1, 1000, 650)).toBe(2000);
    expect(jormSlamHitAt(1000, 2, 1000, 650)).toBe(2650);
    expect(jormSlamHitAt(1000, 3, 1000, 650)).toBe(3300);
  });
  it('全段の円が開始と同時に出て、各段はその段の命中時刻に消え切る', () => {
    for (const k of [1, 2, 3]) {
      expect(jormSlamTelegraphProgress(1000, 1000, k, 1000, 650)).toBe(0); // 出る=開始
      const hit = jormSlamHitAt(1000, k, 1000, 650);
      expect(jormSlamTelegraphProgress(hit - 1, 1000, k, 1000, 650)!).toBeGreaterThan(0.99);
      expect(jormSlamTelegraphProgress(hit, 1000, k, 1000, 650)).toBeNull(); // 当たる瞬間に消え切る
    }
    expect(jormSlamTelegraphProgress(999, 1000, 1, 1000, 650)).toBeNull(); // 開始前は出ない
  });
  it('届きは段で決まる(表に無い段は最後の値)', () => {
    expect(jormSlamReach(1, [90, 170, 250])).toBe(90);
    expect(jormSlamReach(3, [90, 170, 250])).toBe(250);
    expect(jormSlamReach(4, [90, 170, 250])).toBe(250);
  });
  it('★判定(帯判定 distToBandRect)=赤い枠(jormSlamRect)と完全に同じ矩形(赤くないのに当たる/赤いのに当たらない、を作らない)', () => {
    const body = { x: 100, y: 200, width: 519, height: 90 };
    for (const reach of [90, 170, 250]) {
      const b = jormSlamBand(body, reach);
      const r = jormSlamRect(body, reach);
      const d = (x: number, y: number) => distToBandRect({ x, y }, { x: b.fx, y: b.fy }, { x: b.tx, y: b.ty }, b.halfWidth);
      // 枠の四隅と四辺の中点は判定の縁ちょうど(距離0)、そのすぐ外は外(距離>0)、すぐ内は内。
      for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h], [r.x + r.w / 2, r.y], [r.x, r.y + r.h / 2]]) {
        expect(d(x, y)).toBeCloseTo(0, 6);
      }
      expect(d(r.x - 1, r.y + r.h / 2)).toBeGreaterThan(0.99);       // 左の外(検収監査 A-1 の再発防止)
      expect(d(r.x + r.w + 1, r.y + r.h / 2)).toBeGreaterThan(0.99); // 右の外
      expect(d(r.x + r.w / 2, r.y - 1)).toBeGreaterThan(0.99);       // 上の外
      expect(d(r.x + 1, r.y + 1)).toBe(0);                            // 内
      // 体の外への届きはどの向きにも reach(体のどこからでも同じ距離で抜けられる)
      expect(body.x - r.x).toBe(reach); expect(r.x + r.w - (body.x + body.width)).toBe(reach);
      expect(body.y - r.y).toBe(reach); expect(r.y + r.h - (body.y + body.height)).toBe(reach);
    }
  });
  it('既定の届きは体の外へ十分(どの段も40px以上)', async () => {
    const { HIDDEN_JORMUNGAND_TUNING } = await import('./hiddenBossScript');
    for (const r of HIDDEN_JORMUNGAND_TUNING.slam.reaches) expect(r).toBeGreaterThanOrEqual(40);
    // 段ごとに大きくなる(=枠の数が入れ子で読める)
    const rs = HIDDEN_JORMUNGAND_TUNING.slam.reaches;
    for (let i = 1; i < rs.length; i++) expect(rs[i]).toBeGreaterThan(rs[i - 1]);
  });
});

describe('弾幕A: 波と粒の境界', () => {
  const spec = { arms: 5, omega0: 1.6, alpha: 0.15 }; // 既定値と同じ(hiddenBossScript の wave)
  it('回転は常に時計回り(角が時間とともに増える・符号を反転しても同じ)', () => {
    const a0 = jormWaveAngle(0, 0, 0, spec), a1 = jormWaveAngle(0, 0, 1000, spec), a2 = jormWaveAngle(0, 0, 2000, spec);
    expect(a1).toBeGreaterThan(a0);
    expect(a2 - a1).toBeGreaterThan(a1 - a0); // 加速している
    expect(jormWaveAngle(0, 0, 2000, { arms: 5, omega0: -1.6, alpha: -0.15 })).toBeCloseTo(a2);
  });
  it('腕は等間隔', () => {
    expect(jormWaveAngle(0, 1, 0, spec) - jormWaveAngle(0, 0, 0, spec)).toBeCloseTo(Math.PI * 2 / 5);
  });
  it('最初は相手が腕と腕の間(相手の方角から最寄りの腕までが腕の間隔の半分)', () => {
    const aim = 1.2;
    const t0 = jormWaveTheta0(aim, 5);
    const dists = [0, 1, 2, 3, 4].map(k => {
      const d = Math.abs(((jormWaveAngle(t0, k, 0, spec) - aim) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      return d;
    });
    expect(Math.min(...dists)).toBeCloseTo(Math.PI / 5);
  });
  it('離れるほど粒の隙間が開く(近いと壁・遠いと抜けられる)', () => {
    const near = jormWaveParticleGapPx(100, 2500, 100, spec);
    const far = jormWaveParticleGapPx(450, 2500, 100, spec);
    expect(near).toBeLessThan(30);
    expect(far).toBeGreaterThan(60);
  });
  it('既定値で: 撃っている間ずっと、口から150pxは壁(隙間<44)・400pxは抜けられる(隙間>55)・弾は400pxより遠くまで届く', async () => {
    const { HIDDEN_JORMUNGAND_TUNING } = await import('./hiddenBossScript');
    const W = HIDDEN_JORMUNGAND_TUNING.wave;
    for (let t = 0; t <= W.durationMs; t += 250) {
      expect(jormWaveParticleGapPx(150, t, W.gapMs, W)).toBeLessThan(44);
      expect(jormWaveParticleGapPx(400, t, W.gapMs, W)).toBeGreaterThan(55);
    }
    expect(W.speed * W.lifeMs / 1000).toBeGreaterThan(700);
  });
});

describe('弾幕B: 降り注ぐ星弓', () => {
  const spec = { rMin: 200, rMax: 560, burstCount: 5, burstSpread: 50 * Math.PI / 180 };
  const body = { x: -260, y: -45, width: 519, height: 90 };
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  it('落下点は体の矩形から rMin〜rMax・相手の足元(avoidR以内)には落ちない', () => {
    const avoid = { x: 0, y: 300 };
    let n = 0;
    for (let i = 0; i < 500; i++) {
      const p = jormRainLandingPoint(body, spec, rand, avoid, 120);
      if (!p) continue;
      n++;
      const d = jormBodyRectDist(p.x, p.y, body).dist;
      expect(d).toBeGreaterThanOrEqual(200 - 1e-6);
      expect(d).toBeLessThanOrEqual(560 + 1e-6);
      expect(Math.hypot(p.x - avoid.x, p.y - avoid.y)).toBeGreaterThanOrEqual(120);
    }
    expect(n).toBeGreaterThan(450); // ほとんど引ける
  });
  it('★安全地帯の不変条件: 撒いた弾は飛んでいる間ずっと、体から rMin より内側へ入らない', () => {
    for (let i = 0; i < 300; i++) {
      const p = jormRainLandingPoint(body, spec, rand);
      if (!p) continue;
      const angs = jormRainBurstAngles(p.x, p.y, body, { ...spec, burstSpread: Math.PI }); // 開きを大きく渡しても丸める
      expect(angs).toHaveLength(5);
      for (const a of angs) {
        for (let d = 0; d <= 900; d += 30) {
          const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
          expect(jormBodyRectDist(x, y, body).dist).toBeGreaterThanOrEqual(200 - 1e-6);
        }
      }
    }
  });
  it('光弾は弧を描いて落下点へ着く', () => {
    const mid = jormRainLobPos(0, 0, 100, 0, 0.5, 160);
    expect(mid.y).toBeCloseTo(-160);
    const end = jormRainLobPos(0, 0, 100, 0, 1, 160);
    expect(end).toEqual({ x: 100, y: 0, groundY: 0 });
  });
});
