import { describe, it, expect } from 'vitest';
import {
  knifeComboWpnAlpha, knifeComboBodyEndMs,
  knifeComboNextStage, knifeComboGapMs, knifeComboTapAction, knifeComboQueuedAction, knifeComboCounterPlan, knifeComboSwingDir,
  knifeComboStepPx, knifeComboBodyT,
  KNIFE_COMBO_INTERVAL_MS, KNIFE_COMBO_RESET_MS, KNIFE_COMBO_FINISH_RECOVERY_MS, KNIFE_COMBO_QUEUE_MAX_MS, KNIFE_COMBO_STEP_FRAC,
  knifeComboFinishMoveMult, KNIFE_COMBO_FINISH_STOP_MS,
} from './knifeCombo';

describe('ナイフの3連撃(純関数)', () => {
  it('段は 1→2→3→1・最後の振りから0.9秒で1段目へ', () => {
    expect(knifeComboNextStage(0, 0, 100)).toBe(1);
    expect(knifeComboNextStage(1, 0, 500)).toBe(2);
    expect(knifeComboNextStage(2, 0, 500)).toBe(3);
    expect(knifeComboNextStage(3, 0, 600)).toBe(1);
    expect(knifeComboNextStage(1, 0, KNIFE_COMBO_RESET_MS + 1)).toBe(1);
    expect(KNIFE_COMBO_RESET_MS).toBe(900);
  });
  it('間隔は0.5秒・3段目の後の隙は1.0秒(段の間の倍)・隙が明けた時には1段目に戻っている', () => {
    expect(KNIFE_COMBO_INTERVAL_MS).toBe(500);
    expect([1, 2, 3].map(knifeComboGapMs)).toEqual([500, 500, KNIFE_COMBO_FINISH_RECOVERY_MS]);
    expect(KNIFE_COMBO_FINISH_RECOVERY_MS).toBe(1000);
    expect(KNIFE_COMBO_FINISH_RECOVERY_MS).toBeGreaterThan(KNIFE_COMBO_RESET_MS);
    expect(knifeComboNextStage(3, 0, KNIFE_COMBO_FINISH_RECOVERY_MS)).toBe(1);
  });
  it('3段目の後の歩く速さ(社長指示2026-11-26「隙の半分は立ち止まっててほしい」): 隙の半分は 0・隙の終わりまでに慣性つきで 1(パッと動き出さない)。3段目以外は 1', () => {
    expect(KNIFE_COMBO_FINISH_STOP_MS).toBe(KNIFE_COMBO_FINISH_RECOVERY_MS / 2);
    const m = (since: number) => knifeComboFinishMoveMult(3, 10_000, 10_000 + since);
    expect(m(0)).toBe(0);
    expect(m(500)).toBe(0);
    expect(m(1000)).toBe(1);
    expect(m(1500)).toBe(1);
    let prev = 0;
    for (let t = 510; t < 1000; t += 10) { const v = m(t); expect(v).toBeGreaterThanOrEqual(prev); expect(v).toBeLessThan(1); prev = v; }
    expect(m(990)).toBeGreaterThan(0.99);
    expect(m(510)).toBeLessThan(0.01);
    expect(knifeComboFinishMoveMult(1, 10_000, 10_100)).toBe(1);
    expect(knifeComboFinishMoveMult(2, 10_000, 10_100)).toBe(1);
    expect(knifeComboFinishMoveMult(3, 0, 100)).toBe(1); // まだ振っていない
  });
  it('早いタップは予約・3段目の後(と3段目の前隙中)は捨てる・予約は古すぎたら捨てる', () => {
    expect(knifeComboTapAction(1000, 900, false, 1)).toBe('swing');
    expect(knifeComboTapAction(1000, 1200, false, 1)).toBe('queue');
    expect(knifeComboTapAction(1000, 900, true, 2)).toBe('queue');
    expect(knifeComboTapAction(1000, 1200, false, 3)).toBe('drop');
    expect(knifeComboQueuedAction(1000, 900, 1200, false)).toBe('wait');
    expect(knifeComboQueuedAction(1300, 900, 1200, false)).toBe('fire');
    expect(knifeComboQueuedAction(1300, 900, 1200, true)).toBe('wait');
    expect(knifeComboQueuedAction(900 + KNIFE_COMBO_QUEUE_MAX_MS + 1, 900, 1200, false)).toBe('drop');
  });
  it('カウンター窓は1段目だけ・クールダウンは連撃の終わりから', () => {
    const cd = 820;
    const s1 = knifeComboCounterPlan(1, 1000, 0, false, cd);
    expect(s1).toEqual({ open: true, comboCounter: true, readyAt: 1000 + KNIFE_COMBO_RESET_MS + cd });
    const s2 = knifeComboCounterPlan(2, 1500, s1.readyAt, s1.comboCounter, cd);
    expect(s2.open).toBe(false);
    expect(s2.readyAt).toBe(1500 + KNIFE_COMBO_RESET_MS + cd);
    const s3 = knifeComboCounterPlan(3, 2000, s2.readyAt, s2.comboCounter, cd);
    expect(s3.open).toBe(false);
    expect(s3.readyAt).toBe(2000 + cd);
    // クールダウン中に始めた1段目は窓を開かず、readyAt を動かさない
    const s1b = knifeComboCounterPlan(1, 2600, s3.readyAt, s3.comboCounter, cd);
    expect(s1b).toEqual({ open: false, comboCounter: false, readyAt: s3.readyAt });
  });
  it('振りの向き: 1段目=振り上げ・2段目=振り下ろし・3段目=振り上げ', () => {
    expect([1, 2, 3].map(knifeComboSwingDir)).toEqual([1, -1, 1]);
  });
  it('踏み込み: 体の幅×0.3(走りの踏み込みの方が大きければそちら)', () => {
    expect(knifeComboStepPx(28, 0)).toBeCloseTo(28 * KNIFE_COMBO_STEP_FRAC);
    expect(knifeComboStepPx(28, 30)).toBe(30);
  });
  it('体の動き: 1・2段目はいつもどおり、3段目は頂点で粘ってから隙が明けるまでに減速して戻る', () => {
    expect(knifeComboBodyT(140, 280, 1)).toEqual({ t: 0.5, active: true });
    expect(knifeComboBodyT(300, 280, 2).active).toBe(false);
    expect(knifeComboBodyT(140, 280, 3).t).toBeCloseTo(0.5);
    expect(knifeComboBodyT(200, 280, 3).t).toBeCloseTo(0.5); // 粘り
    const a = knifeComboBodyT(350, 280, 3), b = knifeComboBodyT(450, 280, 3);
    expect(a.active && b.active).toBe(true);
    expect(b.t).toBeGreaterThan(a.t);
    expect(knifeComboBodyT(KNIFE_COMBO_FINISH_RECOVERY_MS, 280, 3).active).toBe(false);
  });
});

describe('手のナイフの絵(社長指示2026-11-26「ナイフは最後まで表示しといて欲しい」)', () => {
  const W = 368;
  it('体の振りの姿勢が続く間は出ている(3段目=隙が明けて立ち姿に戻るまで・1/2段目=振りの表示の終わりまで)', () => {
    expect(knifeComboBodyEndMs(W, 3)).toBe(KNIFE_COMBO_FINISH_RECOVERY_MS);
    expect(knifeComboBodyEndMs(W, 1)).toBe(W);
    for (const st of [1, 2, 3]) {
      const end = knifeComboBodyEndMs(W, st);
      // 体の姿勢が切れる所と一致する
      expect(knifeComboBodyT(end - 1, W, st).active).toBe(true);
      expect(knifeComboBodyT(end, W, st).active).toBe(false);
      for (let t = 0; t < end - 80; t += 20) expect(knifeComboWpnAlpha(t, W, st)).toBe(1);
      expect(knifeComboWpnAlpha(end, W, st)).toBe(0);
      // 引きは単調に減り、パッと消えない
      let prev = 1;
      for (let t = end - 80; t < end; t += 5) { const a = knifeComboWpnAlpha(t, W, st); expect(a).toBeLessThanOrEqual(prev); expect(a).toBeGreaterThan(0); prev = a; }
      expect(knifeComboWpnAlpha(end - 2, W, st)).toBeLessThan(0.01);
    }
  });
});
