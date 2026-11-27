import { describe, it, expect } from 'vitest';
import {
  blurGhostAlpha, blurFadeK, createBlurTrail, stepBlurTrail, blurGhostsInto, blurBodyAlpha, blurTrailFade, blurTrailVisible, blurStreak,
  enemyBlurActive, whipTipStreakAlpha, radialFlowK, blurSampleAt, blurEnemySpacingMs,
  BLUR_ENEMY_SPACING_MS, BLUR_ENEMY_SPACING_MAX_MS, BLUR_WARP_SPREAD_MS, RADIAL_FLOW_TAPS,
  BLUR_FADE_MS, BLUR_BODY_ALPHA, BLUR_KATANA_GHOSTS, BLUR_KATANA_SPACING_MS, BLUR_BRAWLER_GHOSTS, BLUR_BRAWLER_SPACING_MS, BLUR_ENEMY_GHOSTS, BLUR_ENEMY_MAX, BLUR_ENEMY_START_SPEED,
  BLUR_ENEMY_KEEP_SPEED, BLUR_STREAK_ALPHA, WHIP_TIP_STREAK_LEAD_MS, WHIP_TIP_STREAK_TAIL_MS, RADIAL_FLOW_MS,
  type BlurGhost,
} from './motionBlur';

/** 一定の速さ v(px/ms)で x へ走る列を、16ms のフレームで frames 回進める。 */
const run = (frames: number, v: number, opts: { active?: (f: number) => boolean; stop?: (f: number) => boolean } = {}) => {
  const tr = createBlurTrail();
  let x = 0, gt = 1000;
  stepBlurTrail(tr, { gt, active: false, x, y: 0 });
  for (let f = 0; f < frames; f++) {
    gt += 16;
    const act = opts.active ? opts.active(f) : true;
    const st = opts.stop ? opts.stop(f) : false;
    if (act && !st) x += v * 16;
    stepBlurTrail(tr, { gt, active: act, x, y: 0, stop: st });
  }
  return { tr, x, gt };
};

describe('motionBlur: 残像の濃さ・枚数', () => {
  it('3枚は古い方から 0.18 / 0.32 / 0.46(見本の値)', () => {
    expect(blurGhostAlpha(3, 3)).toBeCloseTo(0.18, 9);
    expect(blurGhostAlpha(2, 3)).toBeCloseTo(0.32, 9);
    expect(blurGhostAlpha(1, 3)).toBeCloseTo(0.46, 9);
  });
  it('2枚は新しい方が濃く、一番古いのは 0.18', () => {
    expect(blurGhostAlpha(2, 2)).toBeCloseTo(0.18, 9);
    expect(blurGhostAlpha(1, 2)).toBeGreaterThan(blurGhostAlpha(2, 2));
    expect(blurGhostAlpha(0, 2)).toBe(0);
    expect(blurGhostAlpha(3, 2)).toBe(0);
  });
  it('刀・格闘は3枚・10msおき、吹き飛ぶ敵も3枚', () => {
    expect(BLUR_KATANA_GHOSTS).toBe(3);
    expect(BLUR_KATANA_SPACING_MS).toBe(10);
    expect(BLUR_BRAWLER_GHOSTS).toBe(3);
    expect(BLUR_BRAWLER_SPACING_MS).toBe(10);
    expect(BLUR_ENEMY_GHOSTS).toBe(3);
  });
});

describe('motionBlur: 消え方', () => {
  it('止まってから 0.14 秒で消える・ease-out(始めに速く薄れ、終わりはゆっくり)', () => {
    expect(BLUR_FADE_MS).toBe(140);
    expect(blurFadeK(0)).toBe(1);
    expect(blurFadeK(BLUR_FADE_MS)).toBe(0);
    expect(blurFadeK(BLUR_FADE_MS / 2)).toBeCloseTo(0.25, 9);
    // 始めの 10% で落ちる量 > 終わりの 10% で落ちる量
    const early = 1 - blurFadeK(14), late = blurFadeK(126) - blurFadeK(140);
    expect(early).toBeGreaterThan(late * 5);
    for (let t = 0; t < BLUR_FADE_MS; t += 5) expect(blurFadeK(t + 5)).toBeLessThanOrEqual(blurFadeK(t));
  });
});

describe('motionBlur: 列と残像の位置', () => {
  it('走っている間: 本体は半分、残像3枚が本体のすぐ後ろへ 10ms ぶんずつ詰めて並ぶ(新しいほど濃い)', () => {
    const v = 0.855; // 一閃の速さ(px/ms)
    const { tr, x } = run(6, v);
    expect(blurBodyAlpha(tr)).toBe(BLUR_BODY_ALPHA);
    const out: BlurGhost[] = [];
    blurGhostsInto(tr, 3, 10, out);
    expect(out).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(out[i].x).toBeCloseTo(x - v * 10 * (i + 1), 6);
      expect(out[i].alpha).toBeCloseTo(blurGhostAlpha(i + 1, 3), 9);
    }
  });
  it('止まると本体は 1 に戻り、残像は本体へ追いつき(列が縮み)ながら 0.14 秒かけて消える', () => {
    const { tr, gt } = run(6, 0.855);
    const before: BlurGhost[] = [];
    blurGhostsInto(tr, 3, 10, before);
    const x = tr.lastX;
    stepBlurTrail(tr, { gt: gt + 16, active: false, x, y: 0 });
    expect(blurBodyAlpha(tr)).toBe(1);
    const a: BlurGhost[] = [];
    blurGhostsInto(tr, 3, 10, a);
    const k = blurFadeK(16);
    for (let i = 0; i < 3; i++) {
      expect(a[i].x).toBeCloseTo(x - 0.855 * 10 * (i + 1) * k, 6); // 間隔が薄れと同じ掛けで縮む
      expect(a[i].x).toBeGreaterThan(before[i].x);
      expect(a[i].x).toBeLessThan(x);
    }
    expect(a[0].alpha).toBeCloseTo(blurGhostAlpha(1, 3) * k, 9);
    // 半ばでは更に本体へ寄る
    stepBlurTrail(tr, { gt: gt + 70, active: false, x, y: 0 });
    const m: BlurGhost[] = [];
    blurGhostsInto(tr, 3, 10, m);
    expect(m[2].x).toBeGreaterThan(a[2].x);
    let t = gt + 16;
    for (let k = 0; k < 9; k++) { t += 16; stepBlurTrail(tr, { gt: t, active: false, x, y: 0 }); }
    expect(blurTrailFade(tr)).toBe(0);
    expect(blurTrailVisible(tr)).toBe(false);
  });
  it('技が終わった後も体が滑っている間は、残像は体のすぐ後ろに付いたまま薄れる(取り残さない)', () => {
    const { tr, gt } = run(6, 0.855);
    let x = tr.lastX;
    for (let k = 1; k <= 3; k++) { x += 5; stepBlurTrail(tr, { gt: gt + k * 16, active: false, x, y: 0 }); }
    const out: BlurGhost[] = [];
    blurGhostsInto(tr, 3, 10, out);
    expect(out[0].x).toBeGreaterThan(x - 5);
    expect(out[0].x).toBeLessThan(x);
    expect(out[0].alpha).toBeLessThan(blurGhostAlpha(1, 3));
  });
  it('止め(stop)の間は残像の時計も止まる=残像はその場で止まり、薄れもしない', () => {
    const { tr, gt } = run(6, 0.855);
    const a: BlurGhost[] = [];
    blurGhostsInto(tr, 3, 10, a);
    const snap = a.map(g => ({ ...g }));
    const x = tr.lastX;
    let t = gt;
    for (let k = 0; k < 10; k++) { t += 16; stepBlurTrail(tr, { gt: t, active: true, x, y: 0, stop: true }); }
    const b: BlurGhost[] = [];
    blurGhostsInto(tr, 3, 10, b);
    expect(b).toEqual(snap);
    // 止まった後の止め(画面全体の止め=ゲーム時間が進まない)では薄れない
    stepBlurTrail(tr, { gt: t + 16, active: false, x, y: 0 });
    const f0 = blurTrailFade(tr);
    for (let k = 0; k < 5; k++) stepBlurTrail(tr, { gt: t + 16, active: false, x, y: 0 });
    expect(blurTrailFade(tr)).toBe(f0);
    // 技の止め(stop)の間も薄れない
    for (let k = 0; k < 5; k++) stepBlurTrail(tr, { gt: t + 32 + k * 16, active: false, x, y: 0, stop: true });
    expect(blurTrailFade(tr)).toBe(f0);
  });
  it('技の最中に体が1pxも動かないフレーム(技の時計の止め)も、残像の時計を止める', () => {
    const { tr, gt } = run(6, 0.855);
    const a: BlurGhost[] = [];
    blurGhostsInto(tr, 3, 10, a);
    const snap = a.map(g => g.x);
    const x = tr.lastX;
    for (let k = 1; k <= 6; k++) stepBlurTrail(tr, { gt: gt + k * 16, active: true, x, y: 0 });
    blurGhostsInto(tr, 3, 10, a);
    expect(a.map(g => g.x)).toEqual(snap);
  });
  it('瞬間移動(ワープ)した瞬間は写しを道のりの 75%/50%/25% に置き、BLUR_WARP_SPREAD_MS で通常の並びへ縮める(ease-out)', () => {
    const tr = createBlurTrail();
    stepBlurTrail(tr, { gt: 0, active: false, x: 0, y: 0 });
    stepBlurTrail(tr, { gt: 16, active: true, x: 200, y: 0, warpFrom: { x: 0, y: 0 }, warpSpeed: 0.855 });
    const out: BlurGhost[] = [];
    blurGhostsInto(tr, 3, 10, out);
    expect(out.map(g => g.x)).toEqual([150, 100, 50]);
    const st = blurStreak(tr);
    expect(st.x0).toBe(0);
    expect(st.x1).toBe(200);
    // 止め(stop)の間は広がりも止まる
    stepBlurTrail(tr, { gt: 32, active: true, x: 200, y: 0, stop: true });
    blurGhostsInto(tr, 3, 10, out);
    expect(out.map(g => g.x)).toEqual([150, 100, 50]);
    // 途中: ease-out で通常の並びへ寄る(半分の時間で 75% 寄る)
    stepBlurTrail(tr, { gt: 32 + BLUR_WARP_SPREAD_MS / 2, active: true, x: 200, y: 0 });
    blurGhostsInto(tr, 3, 10, out);
    const norm = (i: number) => 200 - 0.855 * 10 * (i + 1);
    for (let i = 0; i < 3; i++) {
      const w = 150 - 50 * i;
      expect(out[i].x).toBeCloseTo(w + (norm(i) - w) * 0.75, 6);
    }
    // 縮み切ったら通常の並び
    stepBlurTrail(tr, { gt: 32 + BLUR_WARP_SPREAD_MS + 1, active: true, x: 200, y: 0 });
    blurGhostsInto(tr, 3, 10, out);
    for (let i = 0; i < 3; i++) expect(out[i].x).toBeCloseTo(norm(i), 6);
  });
  it('予告の無い大きな跳び(瞬間移動)は列を切る=跳んだ道に残像を並べない', () => {
    const { tr, gt } = run(4, 0.855);
    stepBlurTrail(tr, { gt: gt + 16, active: true, x: 1000, y: 0 });
    const out: BlurGhost[] = [];
    blurGhostsInto(tr, 3, 10, out);
    for (const g of out) if (g.alpha > 0) expect(g.x).toBeGreaterThan(900);
  });
  it('列が足りない残像は出さない(動き出しの1フレーム目は前の位置の分まで)', () => {
    const tr = createBlurTrail();
    stepBlurTrail(tr, { gt: 0, active: false, x: 0, y: 0 });
    stepBlurTrail(tr, { gt: 16, active: true, x: 13.68, y: 0 });
    const out: BlurGhost[] = [];
    blurGhostsInto(tr, 3, 10, out);
    expect(out[0].alpha).toBeGreaterThan(0); // 10ms 前 = 16ms の間の補間
    expect(out[1].alpha).toBe(0); // 20ms 前は列の外
    expect(out[2].alpha).toBe(0);
  });
  it('通った道の筋: 動き出した点から今の列の先へ・濃さ 0.5 → 止まると薄れる', () => {
    const { tr, gt } = run(6, 0.855);
    const s = blurStreak(tr);
    expect(s.x0).toBe(0);
    expect(s.x1).toBeCloseTo(tr.lastX, 9);
    expect(s.alpha).toBe(BLUR_STREAK_ALPHA);
    stepBlurTrail(tr, { gt: gt + 70 + 16, active: false, x: tr.lastX, y: 0 });
    expect(blurStreak(tr).alpha).toBeLessThan(BLUR_STREAK_ALPHA);
  });
  it('補間: 列の一番古い点より前は null', () => {
    const s = [{ t: 10, x: 0, y: 0, r: 0, h: 0 }, { t: 20, x: 10, y: 0, r: 0, h: 4 }];
    expect(blurSampleAt(s, 5)).toBeNull();
    expect(blurSampleAt(s, 15)!.x).toBeCloseTo(5, 9);
    expect(blurSampleAt(s, 15)!.h).toBeCloseTo(2, 9);
    expect(blurSampleAt(s, 30)!.x).toBe(10);
  });
  it('ゲーム時間が戻ったら(新しいゲーム)やり直し', () => {
    const { tr } = run(6, 0.855);
    stepBlurTrail(tr, { gt: 0, active: true, x: 5, y: 0 });
    expect(tr.active).toBe(false);
    expect(tr.samples).toHaveLength(0);
  });
});

describe('motionBlur: 敵の残像', () => {
  it('候補でない敵は出さない・速さが足りない敵は始めない・上限の数まで', () => {
    expect(enemyBlurActive(false, false, 5, false, 0)).toBe(false);
    expect(enemyBlurActive(false, true, BLUR_ENEMY_START_SPEED - 0.01, false, 0)).toBe(false);
    expect(enemyBlurActive(false, true, BLUR_ENEMY_START_SPEED, false, 0)).toBe(true);
    expect(enemyBlurActive(false, true, 2, false, BLUR_ENEMY_MAX)).toBe(false);
  });
  it('間隔は画素で決める: 離す距離 / 速さ を 10〜28ms に収める', () => {
    expect(BLUR_ENEMY_SPACING_MS).toBe(10);
    expect(BLUR_ENEMY_SPACING_MAX_MS).toBe(28);
    expect(blurEnemySpacingMs(14, 1)).toBeCloseTo(14, 9);
    expect(blurEnemySpacingMs(14, 3)).toBe(10);
    expect(blurEnemySpacingMs(14, 0.2)).toBe(28);
    expect(blurEnemySpacingMs(14, 0)).toBe(28);
    // 速さが変わっても写しどうしの距離は同じ(収まる範囲の中では)
    expect(blurEnemySpacingMs(20, 1) * 1).toBeCloseTo(blurEnemySpacingMs(20, 1.5) * 1.5, 9);
  });
  it('出している敵は、止め(動かない)の間は続け、遅くなったら終わる', () => {
    expect(enemyBlurActive(true, true, 0, true, BLUR_ENEMY_MAX)).toBe(true);
    expect(enemyBlurActive(true, true, BLUR_ENEMY_KEEP_SPEED, false, BLUR_ENEMY_MAX)).toBe(true);
    expect(enemyBlurActive(true, true, BLUR_ENEMY_KEEP_SPEED - 0.01, false, BLUR_ENEMY_MAX)).toBe(false);
    expect(enemyBlurActive(true, false, 3, false, 0)).toBe(false);
  });
});

describe('motionBlur: 鞭の先端の筋', () => {
  it('伸び切る瞬間に一番濃く、前はすぐ出て、後は 75ms の ease-out で消える', () => {
    expect(WHIP_TIP_STREAK_TAIL_MS).toBeGreaterThanOrEqual(70);
    expect(WHIP_TIP_STREAK_TAIL_MS).toBeLessThanOrEqual(80);
    const W = 200;
    expect(whipTipStreakAlpha(W - WHIP_TIP_STREAK_LEAD_MS - 1, W)).toBe(0);
    expect(whipTipStreakAlpha(W, W)).toBe(1);
    expect(whipTipStreakAlpha(W - WHIP_TIP_STREAK_LEAD_MS / 2, W)).toBeGreaterThan(0.5);
    expect(whipTipStreakAlpha(W + WHIP_TIP_STREAK_TAIL_MS, W)).toBe(0);
    expect(whipTipStreakAlpha(W + WHIP_TIP_STREAK_TAIL_MS / 2, W)).toBeCloseTo(0.25, 9);
  });
});

describe('motionBlur: 画面全体の放射状の流れ', () => {
  it('0.2 秒で立ち上がって戻る(範囲の外は 0)・戻りは ease-in(最後の 30% で急に戻る)', () => {
    expect(RADIAL_FLOW_MS).toBe(200);
    expect(radialFlowK(-1)).toBe(0);
    expect(radialFlowK(0)).toBe(0);
    expect(radialFlowK(50)).toBeCloseTo(1, 9);
    expect(radialFlowK(RADIAL_FLOW_MS)).toBe(0);
    expect(radialFlowK(25)).toBeGreaterThan(0.5); // 速く立ち上がる
    for (let t = 50; t < RADIAL_FLOW_MS; t += 10) expect(radialFlowK(t + 10)).toBeLessThanOrEqual(radialFlowK(t));
    expect(radialFlowK(139)).toBeGreaterThan(0.85); // 最後の 30% の前はまだ強い
    // 戻りの 30% の中: 前半で落ちる量 < 後半で落ちる量(ease-in)
    const a = radialFlowK(140), b = radialFlowK(170), c = radialFlowK(199.999);
    expect(a - b).toBeLessThan(b - c);
  });
  it('写しは3回・重み 0.55/0.28/0.17(和 1)', () => {
    expect(RADIAL_FLOW_TAPS.map(t => t[0])).toEqual([0.33, 0.66, 1.0]);
    expect(RADIAL_FLOW_TAPS.reduce((s, t) => s + t[1], 0)).toBeCloseTo(1, 9);
  });
});
