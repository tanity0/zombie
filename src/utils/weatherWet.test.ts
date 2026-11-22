import { describe, it, expect } from 'vitest';
import {
  buildWetGradeMatrix, applyColorMatrix, WET_GRADE_GAIN, torchStreakDash, TORCH_STREAK_DASHES,
  leafDripSpec, leafDripPose, LEAF_DRIP_H_MIN, LEAF_DRIP_H_MAX,
  parseWeather, weatherWetActive, decideStageWeather, stage1Lap, ripplePose, RIPPLE_MS, RIPPLE_FRAMES, RIPPLE_SCALE_FROM, RIPPLE_SCALE_TO,
  dripHeight, DRIP_FALL_MS, DRIP_FALL_H, glintPose, GLINT_MS,
  rainDropSpec, rainPose, rainNextGapMs, RAIN_FALL_MS_MIN, RAIN_FALL_MS_MAX, RAIN_DROPS_PER_MPX_S, RAIN_MAX,
  landscapeBand, puddleReflection, LANDSCAPE_REFLECT_STRETCH, LANDSCAPE_REF_DEPTH_FRAC, LANDSCAPE_FAR_EDGE_INSET,
  WET_CLOUD_SHADOW_MULT, WET_MOON_SHAFT_MULT, WET_LIGHT_FADE_MS, stepWetLightMix, wetLightMult, lerpRgb,
  rainSegment, makeRainSchedule, advanceRainSchedule, followLag, rainIntensityInSegment,
  RAIN_INTENSITY_HOLD_MS_MIN, RAIN_INTENSITY_HOLD_MS_MAX, RAIN_INTENSITY_MIN, RAIN_INTENSITY_MAX, RAIN_INTENSITY_RAMP_MS,
  RAIN_INTENSITY_LOW_MAX, RAIN_INTENSITY_HIGH_MIN, RAIN_RECHECK_MS, rainNextEvent, puddleRippleRate, PUDDLE_RIPPLE_LEVEL_FLOOR,
  DRIP_LAG_TAU_MS, DRIP_EVERY_MS, DRIP_MAX, TORCH_STREAK_LEN, TORCH_STREAK_W,
  wetSoilTint, wetGlossDrift, shaftLightAt,
  wetCloudShadowMult, WET_CLOUD_SHADOW_MULT_HEAVY,
  wetNightGradeAlpha, wetNightEnvTint, WET_NIGHT_GRADE_ALPHA_MUL, WET_NIGHT_ENV_MUL,
  stage1NightActive, stage1NightTintMul, buildStage1NightGradeMatrix, buildStage1NightSkyMatrix, S1N_NIGHT_GRADE_ALPHA_MUL, S1N_FOG_TINT_MUL, S1N_MOON_HALO_ALPHA_MUL, S1N_MOON_GLOW_ALPHA_MUL,
  S1N_CLOUD_SHADOW_MULT, S1N_MOON_SHAFT_MULT, S1N_TORCH_BACK_ALPHA, TORCH_BACK_ALPHA,
  s1nCloudShadowAlpha, S1N_CLOUD_SHADOW_TEX_GAIN, moonPoolPieces, S1N_MOON_POOL_LAYERS, S1N_MOON_POOL_ALPHA, type ShaftPoly,
} from './weatherWet';

describe('weatherWet(雨上がりの決めごと)', () => {
  it('?weather=wet だけで有効・それ以外は null', () => {
    expect(parseWeather('?weather=wet')).toBe('wet');
    expect(parseWeather('?stage=stage-1&weather=wet&smoke=1')).toBe('wet');
    expect(parseWeather('')).toBeNull();
    expect(parseWeather('?weather=clear')).toBe('clear');
    expect(parseWeather('?weather=rain')).toBeNull();
    expect(parseWeather('?weather=')).toBeNull();
  });

  describe('出撃の天候(社長指示2026-11-22「2周目は必ず雨・その後は晴れと雨でランダム」)', () => {
    const base = { stageId: 'stage-1', knob: null, special: false, firstLoopRun: false, stage1Cleared: false, rnd: () => 0.99 };
    it('周回はクリアで進む(1周目=この出撃が1周目/2周目=ステージ1未クリア/3周目以降=クリア済み)', () => {
      expect(stage1Lap({ firstLoopRun: true, stage1Cleared: false })).toBe(1);
      expect(stage1Lap({ firstLoopRun: false, stage1Cleared: false })).toBe(2);
      expect(stage1Lap({ firstLoopRun: false, stage1Cleared: true })).toBe(3);
    });
    it('1周目は晴れ・2周目は乱数に関係なく必ず雨', () => {
      for (const r of [0, 0.3, 0.5, 0.99]) {
        expect(decideStageWeather({ ...base, firstLoopRun: true, rnd: () => r })).toBe('clear');
        expect(decideStageWeather({ ...base, rnd: () => r })).toBe('wet');
      }
    });
    it('3周目以降は乱数1回で半々(出撃の開始に1回だけ引く)', () => {
      let calls = 0;
      const w = decideStageWeather({ ...base, stage1Cleared: true, rnd: () => { calls++; return 0.2; } });
      expect(w).toBe('wet');
      expect(calls).toBe(1);
      expect(decideStageWeather({ ...base, stage1Cleared: true, rnd: () => 0.5 })).toBe('clear');
      let wet = 0;
      let seed = 12345;
      const lcg = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      for (let i = 0; i < 2000; i++) if (decideStageWeather({ ...base, stage1Cleared: true, rnd: lcg }) === 'wet') wet++;
      expect(wet).toBeGreaterThan(900);
      expect(wet).toBeLessThan(1100);
    });
    it('1周目・2周目は乱数を引かない', () => {
      const rnd = () => { throw new Error('引いてはいけない'); };
      expect(decideStageWeather({ ...base, firstLoopRun: true, rnd })).toBe('clear');
      expect(decideStageWeather({ ...base, rnd })).toBe('wet');
    });
    it('周回に数えない出撃・ステージ1以外は晴れ', () => {
      expect(decideStageWeather({ ...base, special: true })).toBe('clear');
      expect(decideStageWeather({ ...base, special: true, stage1Cleared: true, rnd: () => 0 })).toBe('clear');
      expect(decideStageWeather({ ...base, stageId: 'stage-3' })).toBe('clear');
    });
    it('?weather= のツマミが全部に優先する', () => {
      expect(decideStageWeather({ ...base, knob: 'wet', firstLoopRun: true })).toBe('wet');
      expect(decideStageWeather({ ...base, knob: 'wet', special: true })).toBe('wet');
      expect(decideStageWeather({ ...base, knob: 'clear' })).toBe('clear');
      expect(decideStageWeather({ ...base, knob: 'clear', stage1Cleared: true, rnd: () => 0 })).toBe('clear');
    });
  });

  it('ステージ1の屋外だけで効く', () => {
    const base = { weather: 'wet' as const, stageId: 'stage-1', indoor: false, corridor: false };
    expect(weatherWetActive(base)).toBe(true);
    expect(weatherWetActive({ ...base, weather: null })).toBe(false);
    expect(weatherWetActive({ ...base, stageId: 'stage-3' })).toBe(false);
    expect(weatherWetActive({ ...base, indoor: true })).toBe(false);
    expect(weatherWetActive({ ...base, corridor: true })).toBe(false);
  });

  it('波紋: 広がりは単調に増え、減速する(慣性)・出だしと終わりは薄い', () => {
    const p0 = ripplePose(0)!;
    expect(p0.alpha).toBe(0);
    expect(p0.scale).toBeCloseTo(RIPPLE_SCALE_FROM);
    let prev = -1, prevStep = Infinity;
    for (let t = 0; t < RIPPLE_MS; t += 30) {
      const p = ripplePose(t)!;
      expect(p.frame).toBeGreaterThanOrEqual(0);
      expect(p.frame).toBeLessThan(RIPPLE_FRAMES);
      if (prev >= 0) {
        const step = p.scale - prev;
        expect(step).toBeGreaterThanOrEqual(0);
        expect(step).toBeLessThanOrEqual(prevStep + 1e-9); // 減速
        prevStep = step;
      }
      prev = p.scale;
    }
    expect(prev).toBeLessThanOrEqual(RIPPLE_SCALE_TO);
    expect(ripplePose(RIPPLE_MS - 1)!.alpha).toBeLessThan(0.01);
    expect(ripplePose(RIPPLE_MS)).toBeNull();
    expect(ripplePose(-1)).toBeNull();
    // 3コマを全部通る
    const frames = new Set<number>();
    for (let t = 0; t < RIPPLE_MS; t += 10) frames.add(ripplePose(t)!.frame);
    expect(frames.size).toBe(RIPPLE_FRAMES);
  });

  it('雫: 上から落ち、加速する', () => {
    expect(dripHeight(0)).toBeCloseTo(DRIP_FALL_H);
    const a = DRIP_FALL_H - dripHeight(DRIP_FALL_MS * 0.25)!;
    const b = dripHeight(DRIP_FALL_MS * 0.75)! - dripHeight(DRIP_FALL_MS * 0.999)!;
    expect(b).toBeGreaterThan(a * 0.9); // 後半の4分の1の方が前半の4分の1より大きく落ちる
    expect(dripHeight(DRIP_FALL_MS)).toBeNull();
  });

  it('光の線: 端では消えていて、加速→減速で渡る', () => {
    expect(glintPose(0)!.alpha).toBeCloseTo(0);
    expect(glintPose(0)!.pos).toBeCloseTo(-1);
    expect(glintPose(GLINT_MS / 2)!.alpha).toBeCloseTo(1);
    expect(glintPose(GLINT_MS / 2)!.pos).toBeCloseTo(0);
    const early = glintPose(GLINT_MS * 0.05)!.pos - glintPose(0)!.pos;
    const mid = glintPose(GLINT_MS * 0.55)!.pos - glintPose(GLINT_MS * 0.5)!.pos;
    expect(mid).toBeGreaterThan(early);
    expect(glintPose(GLINT_MS)).toBeNull();
  });
});

describe('ポツポツ雨(小雨の決めごと)', () => {
  const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

  it('粒の個性: 尺・長さ・濃さ・斜めが範囲に収まり、乱数でばらつく', () => {
    const lo = rainDropSpec(() => 0), hi = rainDropSpec(() => 0.999);
    expect(lo.fallMs).toBeCloseTo(RAIN_FALL_MS_MIN);
    expect(hi.fallMs).toBeLessThanOrEqual(RAIN_FALL_MS_MAX);
    expect(hi.len).toBeGreaterThan(lo.len * 2);
    expect(hi.alpha).toBeGreaterThan(lo.alpha);
    expect(hi.alpha).toBeLessThanOrEqual(0.8);
    expect(lo.slant).toBeGreaterThan(0);
    // 長い粒は少ない(中央値は短い側)
    const mid = rainDropSpec(() => 0.5);
    expect(mid.len - lo.len).toBeLessThan((hi.len - lo.len) / 2);
  });

  it('落下: 少し加速して落ち(初速は0でない)、着いたら null', () => {
    const s = rainDropSpec(seq(0.5));
    const p0 = rainPose(0, s)!;
    expect(p0.h).toBeCloseTo(s.height);
    expect(p0.alpha).toBe(0); // パッと出ない
    const q = s.fallMs / 4;
    const d1 = s.height - rainPose(q, s)!.h;
    const d4 = rainPose(q * 3, s)!.h - rainPose(s.fallMs - 1e-6, s)!.h;
    expect(d1).toBeGreaterThan(0);          // 出だしから動いている(画面外から落ちて来ている)
    expect(d4).toBeGreaterThan(d1 * 1.3);   // 後半ほど速い(加速)
    expect(rainPose(s.fallMs * 0.5, s)!.alpha).toBeCloseTo(1);
    expect(rainPose(s.fallMs - 1, s)!.len).toBeGreaterThan(p0.len); // 速くなるほど尾が伸びる
    expect(rainPose(s.fallMs, s)).toBeNull();
    expect(rainPose(-1, s)).toBeNull();
  });

  it('間隔: 可視域が広いほど詰まり、ばらつく。可視域0なら降らない', () => {
    const area = 1e6;
    const meanGap = 1000 / RAIN_DROPS_PER_MPX_S;
    let sum = 0; const n = 2000;
    for (let i = 0; i < n; i++) sum += rainNextGapMs(area, () => (i + 0.5) / n);
    expect(sum / n).toBeGreaterThan(meanGap * 0.85);
    expect(sum / n).toBeLessThan(meanGap * 1.15);
    expect(rainNextGapMs(area * 6.25, () => 0.5)).toBeCloseTo(rainNextGapMs(area, () => 0.5) / 6.25);
    expect(rainNextGapMs(area, () => 0.1)).toBeLessThan(rainNextGapMs(area, () => 0.9));
    expect(rainNextGapMs(0, () => 0.5)).toBe(Infinity);
  });

  it('小雨の量: 標準の可視域で同時に見える粒は数本・最大引きでも上限で止まる', () => {
    const avgFall = (RAIN_FALL_MS_MIN + RAIN_FALL_MS_MAX) / 2;
    const onScreen = (area: number) => (RAIN_DROPS_PER_MPX_S * area / 1e6) * (avgFall / 1000);
    expect(onScreen(1.1e6)).toBeGreaterThan(3);
    expect(onScreen(1.1e6)).toBeLessThan(12);
    expect(RAIN_MAX).toBeLessThanOrEqual(70);
    // 本降り(強さ最大)でも、最大引き(0.4=可視域 1/0.16 倍)の見込みは上限の内側か、上限で止まる
    expect(onScreen(1.1e6) * RAIN_INTENSITY_MAX).toBeLessThan(RAIN_MAX);
  });
});

describe('水たまりに映る風景(上下反転の写し・水たまりごとに奥の縁へ吊るす)', () => {
  it('帯は遠景の帯ちょうど1本ぶん(伸びの分だけ縦に縮む)', () => {
    const b = landscapeBand(400, 0);
    expect(b.srcH).toBe(400);
    expect(b.bandH).toBeCloseTo(400 * LANDSCAPE_REFLECT_STRETCH);
  });

  it('逆さの稜線の根元は水面の奥の縁(上の縁)のすぐ内側', () => {
    const r = puddleReflection(500, 560, 400);
    expect(r.ridgeY).toBeGreaterThanOrEqual(500);
    expect(r.ridgeY).toBeCloseTo(500 + 60 * LANDSCAPE_FAR_EDGE_INSET, 6);
    expect(r.ridgeY).toBeLessThan(500 + 60 * 0.15);
  });

  it('水面の中に2本目の稜線は出ない(帯は1本・手前の縁で切る)/帯より手前は空だけで手前の縁まで埋まる', () => {
    for (const [far, near, srcH] of [[500, 530, 400], [500, 560, 400], [300, 420, 250], [100, 300, 120], [700, 702, 600]]) {
      const r = puddleReflection(far, near, srcH);
      // 帯(稜線〜空の上端)は水面の中で1回だけ: 見せる帯は帯全体以下
      expect(r.bandVisH).toBeLessThanOrEqual(r.bandH + 1e-9);
      expect(r.bandVisFrac).toBeGreaterThan(0);
      expect(r.bandVisFrac).toBeLessThanOrEqual(1 + 1e-9);
      // 帯の下端の先に稜線をもう一度置く余地は無い: 帯が切れていない時は、残りを空の写しが埋める
      expect(r.skyY).toBeCloseTo(r.ridgeY + r.bandVisH, 9);
      expect(r.skyY + r.skyH).toBeCloseTo(near, 9);
      if (r.skyH > 0) expect(r.bandVisFrac).toBeCloseTo(1, 9); // 空の写しは帯を最後(空の上端)まで出した後だけ
      // 奥の縁より上(水面の外=地面)には何も置かない
      expect(r.ridgeY).toBeGreaterThanOrEqual(far);
    }
  });

  it('小さい(浅い)水たまりほど木は背が低い・大きい水たまりは倍率がそのまま', () => {
    const small = puddleReflection(0, 20, 400);
    const mid = puddleReflection(0, 50, 400);
    const big = puddleReflection(0, 400 * LANDSCAPE_REF_DEPTH_FRAC * 2, 400);
    expect(small.scaleY).toBeLessThan(mid.scaleY);
    expect(mid.scaleY).toBeLessThan(big.scaleY);
    expect(big.scaleY).toBeCloseTo(LANDSCAPE_REFLECT_STRETCH, 9);
    // 深さに比例(上限まで)=引き(0.4)で水たまりが小さく映っても、木と空の割合は同じ
    for (const z of [puddleReflection(0, 50 * 0.4, 400 * 0.4), puddleReflection(0, 50 * 0.4, 400)]) {
      expect(z.bandVisFrac).toBeCloseTo(mid.bandVisFrac, 9);
      expect(z.skyH / 20).toBeCloseTo(mid.skyH / 50, 9);
    }
  });

  it('壊れた入力でも有限の値を返す', () => {
    for (const r of [puddleReflection(0, 0, 0), puddleReflection(10, 5, -3), puddleReflection(0, 1e6, 1)]) {
      for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
      expect(r.skyH).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('雨上がりの雲の影と月明り', () => {
  it('倍率は1より大きい(雲の影は濃く・月明りは明るく)', () => {
    expect(WET_CLOUD_SHADOW_MULT).toBeGreaterThan(1);
    expect(WET_MOON_SHAFT_MULT).toBeGreaterThan(1);
  });
  it('雨上がりでない(mix=0)なら倍率は1=何も変えない', () => {
    expect(wetLightMult(0, WET_CLOUD_SHADOW_MULT)).toBe(1);
    expect(wetLightMult(0, WET_MOON_SHAFT_MULT)).toBe(1);
    expect(stepWetLightMix(0, false, 16)).toBe(0);
  });
  it('効き切ると倍率そのもの・途中は加減速して寄る(慣性)', () => {
    expect(wetLightMult(1, WET_MOON_SHAFT_MULT)).toBeCloseTo(WET_MOON_SHAFT_MULT);
    let m = 0;
    const seen: number[] = [];
    for (let t = 0; t < WET_LIGHT_FADE_MS + 100; t += 100) { m = stepWetLightMix(m, true, 100); seen.push(wetLightMult(m, 2)); }
    expect(m).toBe(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen[1] - seen[0]).toBeLessThan(seen[8] - seen[7]); // 出だしは緩やか
    expect(stepWetLightMix(1, false, WET_LIGHT_FADE_MS)).toBe(0);
  });
});

describe('lerpRgb', () => {
  it('端は元の色・中間は各成分の中間', () => {
    expect(lerpRgb(0xc9d6ff, 0xa6bbff, 0)).toBe(0xc9d6ff);
    expect(lerpRgb(0xc9d6ff, 0xa6bbff, 1)).toBe(0xa6bbff);
    expect(lerpRgb(0x000000, 0xfefefe, 0.5)).toBe(0x7f7f7f);
  });
});

describe('参考画に寄せる(色行列・松明の筋・葉先の雫)', () => {
  it('色行列: 灰色は青へ寄り、赤は落ちる・α列は素通し', () => {
    const m = buildWetGradeMatrix();
    const [r, g, b] = applyColorMatrix(m, 0.5, 0.5, 0.5);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
    expect(m.slice(15)).toEqual([0, 0, 0, 1, 0]);
    // 黒は灰色に浮かない(持ち上げは青だけ少し)
    const k = applyColorMatrix(m, 0, 0, 0);
    expect(Math.max(k[0], k[1])).toBeLessThan(0.03);
    // 彩度は上がる(赤い物の赤と緑の差が広がる=キャラの色が沈まない)
    const sat = applyColorMatrix(m, 0.8, 0.3, 0.3);
    expect(sat[0] - sat[1]).toBeGreaterThan((0.8 - 0.3) * WET_GRADE_GAIN[0] * 0.95);
  });
  it('松明の筋の欠片: 範囲内・遠いほど薄い傾向・決定的', () => {
    const n = TORCH_STREAK_DASHES;
    let nearSum = 0, farSum = 0;
    for (let f = 0; f < 200; f++) {
      const now = f * 37;
      for (let i = 0; i < n; i++) {
        const d = torchStreakDash(i, n, now, 1.3);
        expect(d.t).toBeGreaterThanOrEqual(0); expect(d.t).toBeLessThanOrEqual(1);
        expect(d.w).toBeGreaterThan(0); expect(d.w).toBeLessThanOrEqual(1);
        expect(d.a).toBeGreaterThanOrEqual(0); expect(d.a).toBeLessThanOrEqual(1);
        if (i === 0) nearSum += d.a; if (i === n - 1) farSum += d.a;
      }
    }
    expect(nearSum).toBeGreaterThan(farSum * 2);
    expect(torchStreakDash(2, n, 1234, 0.5)).toEqual(torchStreakDash(2, n, 1234, 0.5));
    // 揺らぎは滑らか(1フレームで大きく跳ばない=慣性)
    const a = torchStreakDash(1, n, 1000, 0.5), b = torchStreakDash(1, n, 1016, 0.5);
    expect(Math.abs(a.w - b.w)).toBeLessThan(0.1);
  });
  it('松明の光だまり: 細長い筋ではなく、縦の広がりは横幅と同じ程度まで', () => {
    expect(TORCH_STREAK_LEN).toBeLessThanOrEqual(TORCH_STREAK_W * 1.2);
  });
  it('濡れた土: 雨上がりでなければ夜の tint のまま・効くと赤と緑が戻り黒は黒のまま', () => {
    const env = 0x9e9e9e;
    expect(wetSoilTint(env, 0)).toBe(env);
    const t = wetSoilTint(env, 1);
    const r = (t >> 16) & 255, g = (t >> 8) & 255, b = t & 255;
    expect(r).toBeGreaterThan(0x9e); expect(g).toBeGreaterThan(0x9e);
    expect(r).toBeLessThanOrEqual(255); expect(b).toBeLessThan(g);
    expect(wetSoilTint(0xffffff, 1)).toBe(0xffffff); // 255 で頭打ち
    expect(r).toBeGreaterThanOrEqual(g); // 温かい土(赤 ≥ 緑 ≥ 青)
    expect(wetSoilTint(0, 1)).toBe(0);
    // 途中は滑らか(効き具合で跳ばない)
    const a = wetSoilTint(env, 0.5), c = wetSoilTint(env, 0.51);
    expect(Math.abs(((a >> 16) & 255) - ((c >> 16) & 255))).toBeLessThanOrEqual(2);
  });
  it('地面の照り: ずれは小さく滑らか・きらめきは 1 前後', () => {
    for (let t = 0; t < 60000; t += 250) {
      const d = wetGlossDrift(t), e = wetGlossDrift(t + 16);
      expect(Math.abs(d.x)).toBeLessThan(25); expect(Math.abs(d.y)).toBeLessThan(10);
      expect(d.shimmer).toBeGreaterThan(0.75); expect(d.shimmer).toBeLessThan(1.25);
      expect(Math.abs(e.x - d.x)).toBeLessThan(0.2);
    }
  });
  it('月明りの量: 筋の中は明るく・外は0・縁は柔らかい', () => {
    const polys = [{ x1: 0, y1: 0, x2: 100, y2: 400, w: 100, a: 1 }];
    // 上端の中心
    expect(shaftLightAt(50, 1, polys)).toBeCloseTo(1, 3);
    expect(shaftLightAt(-5, 1, polys)).toBe(0);
    expect(shaftLightAt(50, -10, polys)).toBe(0);
    expect(shaftLightAt(50, 410, polys)).toBe(0);
    // 下端の中心 = x2 - 0.18w
    expect(shaftLightAt(100 - 18, 399, polys)).toBeGreaterThan(0.95);
    const edge = shaftLightAt(5, 1, polys);
    expect(edge).toBeGreaterThan(0); expect(edge).toBeLessThan(0.6);
    // 弱い筋は弱い
    expect(shaftLightAt(50, 1, [{ ...polys[0], a: 0.5 }])).toBeCloseTo(0.5, 3);
  });
  it('雨の強弱: 間隔はいつも30〜60秒・強さは幅の中・決定的', () => {
    let strong = 0, weak = 0, mid = 0;
    for (let k = 0; k < 400; k++) {
      const g = rainSegment(7.3, k);
      expect(g.len).toBeGreaterThanOrEqual(30000); expect(g.len).toBeLessThanOrEqual(60000);
      expect(g.len).toBeGreaterThanOrEqual(RAIN_INTENSITY_HOLD_MS_MIN); expect(g.len).toBeLessThanOrEqual(RAIN_INTENSITY_HOLD_MS_MAX);
      expect(g.target).toBeGreaterThanOrEqual(RAIN_INTENSITY_MIN); expect(g.target).toBeLessThanOrEqual(RAIN_INTENSITY_MAX);
      if (g.target >= RAIN_INTENSITY_HIGH_MIN) strong++;
      else if (g.target <= RAIN_INTENSITY_LOW_MAX) weak++;
      else mid++;
    }
    // 二つの山: ほとんどが「ほぼ止む」か「はっきり強い」・間はたまにだけ
    expect(strong).toBeGreaterThan(120); expect(weak).toBeGreaterThan(120);
    expect(mid).toBeGreaterThan(5); expect(mid).toBeLessThan(80);
    expect(RAIN_INTENSITY_LOW_MAX).toBeLessThanOrEqual(0.2);
    expect(RAIN_INTENSITY_HIGH_MIN).toBeGreaterThanOrEqual(1.5); // これまでの小雨(1)よりはっきり強い
    expect(rainSegment(3.1, 5)).toEqual(rainSegment(3.1, 5));
    // 間隔が全部同じ(決まった周期)ではない
    const lens = new Set(Array.from({ length: 10 }, (_, k) => Math.round(rainSegment(1.1, k).len / 1000)));
    expect(lens.size).toBeGreaterThan(4);
    expect(RAIN_INTENSITY_RAMP_MS).toBeLessThan(RAIN_INTENSITY_HOLD_MS_MIN); // 区間の終わりには目標に着いている
  });
  it('雨の強弱: 途切れず・跳ばずに移る(慣性)', () => {
    const s = makeRainSchedule(2.2, 0);
    let prev = advanceRainSchedule(s, 0);
    expect(prev).toBeCloseTo(1, 6); // これまでの小雨から始まる
    for (let t = 16; t < 15 * 60000; t += 16) {
      const v = advanceRainSchedule(s, t);
      expect(v).toBeGreaterThanOrEqual(RAIN_INTENSITY_MIN - 1e-9); expect(v).toBeLessThanOrEqual(RAIN_INTENSITY_MAX + 1e-9);
      expect(Math.abs(v - prev)).toBeLessThan(0.01); // 1フレームで跳ばない
      prev = v;
    }
    // 区間の始まりと終わりでは速さ0(加速して減速)
    const a0 = rainIntensityInSegment(0.2, 1, 0), a1 = rainIntensityInSegment(0.2, 1, 16);
    expect(a1 - a0).toBeLessThan(0.001);
    expect(rainIntensityInSegment(0.2, 1, RAIN_INTENSITY_RAMP_MS)).toBeCloseTo(1, 9);
  });
  it('雨の予定: 止みかけ(間隔が長い・強さ0)でも予定は止まらず、見直すだけの予定になる', () => {
    expect(rainNextEvent(120)).toEqual({ dt: 120, spawn: true });
    expect(rainNextEvent(5000)).toEqual({ dt: RAIN_RECHECK_MS, spawn: false });
    expect(rainNextEvent(Infinity)).toEqual({ dt: RAIN_RECHECK_MS, spawn: false });
  });
  it('水たまりの雨の波紋: 止みかけでは0・強いほど・広いほど多い', () => {
    const area = 7000;
    expect(puddleRippleRate(RAIN_INTENSITY_MIN, area)).toBe(0);
    expect(puddleRippleRate(RAIN_INTENSITY_LOW_MAX, area)).toBe(0);
    expect(puddleRippleRate(PUDDLE_RIPPLE_LEVEL_FLOOR, area)).toBe(0);
    const at1 = puddleRippleRate(1, area), atMax = puddleRippleRate(RAIN_INTENSITY_MAX, area);
    expect(at1).toBeGreaterThan(0);
    expect(atMax).toBeGreaterThan(at1 * 2); // 本降りは見て分かるほど忙しい
    expect(atMax * 1000).toBeGreaterThan(3); // 普通の水たまりで1秒に3つ以上=波紋が重なる
    expect(puddleRippleRate(1, area * 2)).toBeCloseTo(at1 * 2, 12);
    expect(puddleRippleRate(1, 0)).toBe(0);
  });
  it('雫は雨の強さに遅れて付いてくる(雨が弱まっても、しばらく落ち続ける)', () => {
    let drip = 1;
    const rainAt = (t: number) => (t < 10000 ? 1 : 0.15);
    let at12 = 0;
    for (let t = 0; t < 30000; t += 16) {
      drip = followLag(drip, rainAt(t), 16, DRIP_LAG_TAU_MS);
      if (Math.abs(t - 12000) < 8) at12 = drip;
    }
    expect(at12).toBeGreaterThan(0.6); // 雨が弱まって2秒後も、雫はまだ多い
    expect(drip).toBeLessThan(0.3); // 20秒後には追いついている
    expect(followLag(0.5, 1, 0, 1000)).toBe(0.5);
  });
  it('雫は雨粒より少ない(強さ1・標準ズームの見込み)', () => {
    // 雨: 1秒の粒数 × 平均の尺(ms)
    // 標準ズームの雨の可視域(実測 約 0.36M px²)で見込む。
    const rainOn = 0.36 * RAIN_DROPS_PER_MPX_S * ((RAIN_FALL_MS_MIN + RAIN_FALL_MS_MAX) / 2) / 1000;
    // 雫: 平均間隔(×1.1=間隔の揺らぎの平均)・ぶら下がり平均760ms+落下 600ms 前後
    const dripOn = Math.min(DRIP_MAX, (1000 / (DRIP_EVERY_MS * 1.1)) * 1.36);
    expect(dripOn).toBeLessThan(rainOn);
  });
  it('葉先の雫: 枝葉の高さで生まれ、木の幅の内側・高いほど長く落ちる', () => {
    const tree = { footX: 100, footY: 200, w: 150, h: 180 };
    for (const r of [0, 0.5, 0.999]) {
      const s = leafDripSpec(tree, () => r);
      expect(s.height).toBeGreaterThanOrEqual(tree.h * LEAF_DRIP_H_MIN - 1e-9);
      expect(s.height).toBeLessThanOrEqual(tree.h * LEAF_DRIP_H_MAX + 1e-9);
      expect(Math.abs(s.x - tree.footX)).toBeLessThanOrEqual(tree.w * 0.5);
    }
    const lo = leafDripSpec(tree, () => 0), hi = leafDripSpec(tree, () => 0.999);
    expect(hi.fallMs).toBeGreaterThan(lo.fallMs);
  });
  it('葉先の雫の姿: ぶら下がり(育つ)→ 加速して落ちる → 着いたら null', () => {
    const s = { x: 0, y: 0, height: 120, hangMs: 600, fallMs: 700 };
    const h0 = leafDripPose(0, s)!, h1 = leafDripPose(300, s)!, h2 = leafDripPose(599, s)!;
    expect(h0.falling).toBe(false);
    expect(h0.swell).toBeLessThan(h1.swell);
    expect(h1.swell).toBeLessThan(h2.swell + 1e-9);
    expect(h0.alpha).toBe(0); // パッと出ない
    const f0 = leafDripPose(600, s)!, f1 = leafDripPose(600 + 350, s)!, f2 = leafDripPose(600 + 690, s)!;
    expect(f0.falling).toBe(true);
    // 後半ほど速い(重力)
    expect(f0.h - f1.h).toBeLessThan(f1.h - f2.h);
    expect(Math.abs(f0.h - h2.h)).toBeLessThan(1); // 千切れる瞬間に位置が跳ばない
    expect(leafDripPose(1300, s)).toBeNull();
    expect(leafDripPose(-1, s)).toBeNull();
  });
});

describe('雨上がりの雲の影は雨の強さに沿う(止みかけ 1.35 → 本降り 1.8)', () => {
  it('止みかけ以下は 1.35・本降り以上は 1.8・間は単調で跳ばない', () => {
    expect(wetCloudShadowMult(0)).toBeCloseTo(WET_CLOUD_SHADOW_MULT, 9);
    expect(wetCloudShadowMult(RAIN_INTENSITY_LOW_MAX)).toBeCloseTo(WET_CLOUD_SHADOW_MULT, 9);
    expect(wetCloudShadowMult(RAIN_INTENSITY_HIGH_MIN)).toBeCloseTo(WET_CLOUD_SHADOW_MULT_HEAVY, 9);
    expect(wetCloudShadowMult(RAIN_INTENSITY_MAX)).toBeCloseTo(WET_CLOUD_SHADOW_MULT_HEAVY, 9);
    expect(WET_CLOUD_SHADOW_MULT_HEAVY).toBe(1.8);
    let prev = wetCloudShadowMult(0);
    for (let r = 0; r <= RAIN_INTENSITY_MAX; r += 0.01) {
      const m = wetCloudShadowMult(r);
      expect(m).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(m - prev).toBeLessThan(0.01); // 強さが 0.01 動いても倍率は跳ばない
      prev = m;
    }
  });

  it('雨上がりでない(mix=0)なら、雨の強さに関わらず倍率は厳密に1', () => {
    for (const r of [0, 1, 3, 4]) expect(wetLightMult(0, wetCloudShadowMult(r))).toBe(1);
    expect(wetLightMult(1, wetCloudShadowMult(4))).toBeCloseTo(1.8, 9);
  });
});

describe('雨上がりの間だけ夜の暗さを弱める', () => {
  it('雨上がりでない(mix=0)なら厳密にそのまま', () => {
    expect(wetNightGradeAlpha(0.4, 0)).toBe(0.4);
    for (const env of [0x9e9e9e, 0x000000, 0xffffff, 0x123456]) expect(wetNightEnvTint(env, 0)).toBe(env);
  });
  it('効き切ると乗算が緩む(黒は黒のまま・255 で頭打ち)', () => {
    expect(WET_NIGHT_GRADE_ALPHA_MUL).toBeLessThan(1);
    expect(WET_NIGHT_ENV_MUL).toBeGreaterThan(1);
    expect(wetNightGradeAlpha(0.4, 1)).toBeCloseTo(0.4 * WET_NIGHT_GRADE_ALPHA_MUL, 9);
    expect(wetNightEnvTint(0x9e9e9e, 1)).toBe(((Math.round(0x9e * WET_NIGHT_ENV_MUL)) * 0x010101));
    expect(wetNightEnvTint(0, 1)).toBe(0);
    expect(wetNightEnvTint(0xffffff, 1)).toBe(0xffffff);
  });
  it('入る/抜ける途中は加減速して連続', () => {
    let prev = wetNightGradeAlpha(0.4, 0);
    for (let m = 0.01; m <= 1.0001; m += 0.01) {
      const a = wetNightGradeAlpha(0.4, m);
      expect(a).toBeLessThanOrEqual(prev + 1e-12);
      expect(prev - a).toBeLessThan(0.01);
      prev = a;
    }
  });
});

describe('晴れた夜のステージ1の森(雨上がりの仕組みを流用・値は別)', () => {
  const base = { stageId: 'stage-1', indoor: false, corridor: false, farKey: 'forest' as string | null, wetActive: false };
  it('ステージ1の森の屋外だけ・雨上がりの間は止まる', () => {
    expect(stage1NightActive(base)).toBe(true);
    for (const stageId of ['stage-0', 'stage-2', 'stage-3', 'stage-4', 'stage-5', 'stage-6', 'stage-7']) {
      expect(stage1NightActive({ ...base, stageId })).toBe(false);
    }
    expect(stage1NightActive({ ...base, indoor: true })).toBe(false);
    expect(stage1NightActive({ ...base, corridor: true })).toBe(false);
    expect(stage1NightActive({ ...base, farKey: 'lab' })).toBe(false);
    expect(stage1NightActive({ ...base, farKey: null })).toBe(false);
    expect(stage1NightActive({ ...base, wetActive: true })).toBe(false);
  });
  it('効き具合0(他ステージ)では全部厳密に1/単位行列', () => {
    expect(wetLightMult(0, S1N_CLOUD_SHADOW_MULT)).toBe(1);
    expect(wetLightMult(0, S1N_MOON_SHAFT_MULT)).toBe(1);
    expect(stage1NightTintMul(S1N_FOG_TINT_MUL, 0)).toEqual({ r: 1, g: 1, b: 1 });
    expect(buildStage1NightGradeMatrix(0)).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
    expect(buildStage1NightSkyMatrix(0)).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
    expect(wetLightMult(0, S1N_NIGHT_GRADE_ALPHA_MUL)).toBe(1);
  });
  it('晴れの夜の向き(霧は色だけ暗く涼しく・月と筋は明るく・影は濃く・黒は深く・青と緑が上がる)', () => {
    expect(S1N_FOG_TINT_MUL.r).toBeLessThan(1);
    expect(S1N_FOG_TINT_MUL.b).toBeLessThanOrEqual(1);
    expect(S1N_FOG_TINT_MUL.r).toBeLessThan(S1N_FOG_TINT_MUL.b);
    expect(S1N_MOON_HALO_ALPHA_MUL).toBeGreaterThan(1);
    expect(S1N_MOON_GLOW_ALPHA_MUL).toBeGreaterThan(1);
    expect(S1N_CLOUD_SHADOW_MULT).toBeGreaterThan(1);
    expect(S1N_MOON_SHAFT_MULT).toBeGreaterThan(1);
    expect(S1N_TORCH_BACK_ALPHA).toBeGreaterThan(0);
    expect(S1N_TORCH_BACK_ALPHA).toBeLessThan(TORCH_BACK_ALPHA);
    const m = buildStage1NightGradeMatrix(1);
    const [r0, g0, b0] = applyColorMatrix(m, 0, 0, 0);
    expect(Math.max(r0, g0, b0)).toBeLessThanOrEqual(0);
    const [r, g, b] = applyColorMatrix(m, 0.5, 0.5, 0.5);
    expect(b).toBeGreaterThan(0.5);
    expect(g).toBeGreaterThan(r);
    expect(r).toBeLessThan(0.5);
  });
  it('入る時は加減速して効く(1フレームで跳ばない)', () => {
    let mix = 0, prev = 1;
    for (let t = 0; t < WET_LIGHT_FADE_MS + 100; t += 16) {
      mix = stepWetLightMix(mix, true, 16);
      const k = stage1NightTintMul(S1N_FOG_TINT_MUL, mix).r;
      expect(Math.abs(prev - k)).toBeLessThan(0.01);
      prev = k;
    }
    expect(prev).toBeCloseTo(S1N_FOG_TINT_MUL.r, 6);
  });
});

describe('晴れた夜のステージ1の森: 月明りの地面(照らされた所は明るく・雲の影は濃く)', () => {
  it('雲の影: 効き具合0では厳密に従来の濃さ・効いた時は従来(α上限1)より濃い', () => {
    for (const b of [0.3, 0.7, 1]) expect(s1nCloudShadowAlpha(b, 0)).toBe(b);
    const base = 0.7;
    // 濃さ=α×絵の暗さの倍率。従来は α=min(1, base×旧1.45)×1
    expect(s1nCloudShadowAlpha(base, 1) * S1N_CLOUD_SHADOW_TEX_GAIN).toBeGreaterThan(Math.min(1, base * 1.45) * 1.2);
    expect(s1nCloudShadowAlpha(base, 1)).toBeLessThanOrEqual(1);
  });
  it('雲の影: 入る間は滑らか(1フレームで跳ばない)', () => {
    let mix = 0, prev = s1nCloudShadowAlpha(0.7, 0.0001) * S1N_CLOUD_SHADOW_TEX_GAIN;
    for (let t = 0; t < WET_LIGHT_FADE_MS + 100; t += 16) {
      mix = stepWetLightMix(mix, true, 16);
      const d = s1nCloudShadowAlpha(0.7, Math.max(mix, 0.0001)) * S1N_CLOUD_SHADOW_TEX_GAIN;
      expect(Math.abs(d - prev)).toBeLessThan(0.02);
      prev = d;
    }
  });
  const q: ShaftPoly = { x1: 0, y1: -100, x2: -800, y2: 1100, w: 120, a: 1 };
  it('月明りの溜まり: 地面の上端より上には描かない・筋の下端/画面の下端で止まる', () => {
    const pcs = moonPoolPieces(q, 300, 900);
    expect(pcs.length).toBeGreaterThan(0);
    for (const p of pcs) {
      for (let i = 1; i < 8; i += 2) { expect(p.pts[i]).toBeGreaterThanOrEqual(300); expect(p.pts[i]).toBeLessThanOrEqual(900); }
      expect(p.a).toBeGreaterThan(0);
      expect(p.a).toBeLessThanOrEqual(1);
    }
    expect(moonPoolPieces(q, 1200, 1400)).toEqual([]);
    expect(moonPoolPieces({ ...q, y2: q.y1 }, 300, 900)).toEqual([]);
  });
  it('月明りの溜まり: 地平の際から立ち上がり(上端の帯ほど薄い)・芯の重ねは足して1・濃さの比が効く', () => {
    const pcs = moonPoolPieces(q, 300, 900);
    const core = pcs.slice(-pcs.length / S1N_MOON_POOL_LAYERS.length);
    for (let i = 1; i < core.length; i++) expect(core[i].a).toBeGreaterThanOrEqual(core[i - 1].a);
    expect(S1N_MOON_POOL_LAYERS.reduce((a, [, w]) => a + w, 0)).toBeCloseTo(1, 6);
    const half = moonPoolPieces({ ...q, a: 0.5 }, 300, 900);
    expect(half[half.length - 1].a).toBeCloseTo(pcs[pcs.length - 1].a * 0.5, 6);
    expect(S1N_MOON_POOL_ALPHA).toBeGreaterThan(0);
  });
});
