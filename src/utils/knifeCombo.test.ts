import { describe, it, expect } from 'vitest';
import {
  knifeComboWpnAlpha, knifeComboBodyEndMs,
  knifeComboNextStage, knifeComboGapMs, knifeComboTapAction, knifeComboQueuedAction, knifeComboCounterPlan, knifeNextSwingAt, knifeComboSwingDir,
  knifeComboStepPx, knifeComboBodyT,
  KNIFE_COMBO_INTERVAL_MS, KNIFE_COMBO_RESET_MS, KNIFE_COMBO_FINISH_RECOVERY_MS, KNIFE_COMBO_QUEUE_MAX_MS, KNIFE_COMBO_STEP_FRAC, KNIFE_COMBO_FINISH_STEP_FRAC,
  knifeComboFinishMoveMult, KNIFE_COMBO_FINISH_STOP_MS,
  KNIFE_COMBO_FEEL, knifeComboFeel, knifeComboHitStop, knifeComboSfxLayers, knifeSwingDrawSince,
  KNIFE_COMBO_STAGE_DAMAGE_MULT, knifeStageDamageMult,
} from './knifeCombo';
import { WHIP_COMBO_FEEL, WHIP_COMBO_FINISH_RECOVERY_MS } from './whipCombo';

describe('ナイフの3連撃(純関数)', () => {
  it('段は 1→2→3→1・最後の振りから0.9秒で1段目へ', () => {
    expect(knifeComboNextStage(0, 0, 100)).toBe(1);
    expect(knifeComboNextStage(1, 0, KNIFE_COMBO_INTERVAL_MS)).toBe(2);
    expect(knifeComboNextStage(2, 0, KNIFE_COMBO_INTERVAL_MS)).toBe(3);
    expect(knifeComboNextStage(3, 0, 600)).toBe(1);
    expect(knifeComboNextStage(1, 0, KNIFE_COMBO_RESET_MS + 1)).toBe(1);
    expect(KNIFE_COMBO_RESET_MS).toBe(900);
  });
  it('間隔は0.4秒・3段目の後の隙は0.7秒(社長裁定2026-11-27・鞭とは独立)・隙が明けた時には1段目に戻っている', () => {
    expect(KNIFE_COMBO_INTERVAL_MS).toBe(400);
    expect([1, 2, 3].map(knifeComboGapMs)).toEqual([KNIFE_COMBO_INTERVAL_MS, KNIFE_COMBO_INTERVAL_MS, KNIFE_COMBO_FINISH_RECOVERY_MS]);
    expect(KNIFE_COMBO_FINISH_RECOVERY_MS).toBe(700);
    expect(WHIP_COMBO_FINISH_RECOVERY_MS).toBe(1000); // 鞭は変えない
    // 隙(0.7秒)は段が戻る時間(RESET_MS)より短いが、3段目の次は段の巡りで必ず1段目。
    expect(knifeComboNextStage(3, 0, KNIFE_COMBO_FINISH_RECOVERY_MS)).toBe(1);
    expect(knifeComboNextStage(3, 0, KNIFE_COMBO_RESET_MS + 1)).toBe(1);
  });
  it('3段目の後の歩く速さ(社長指示2026-11-26「隙の半分は立ち止まっててほしい」): 隙の半分は 0・隙の終わりまでに慣性つきで 1(パッと動き出さない)。3段目以外は 1', () => {
    expect(KNIFE_COMBO_FINISH_STOP_MS).toBe(KNIFE_COMBO_FINISH_RECOVERY_MS / 2);
    const m = (since: number) => knifeComboFinishMoveMult(3, 10_000, 10_000 + since);
    const R = KNIFE_COMBO_FINISH_RECOVERY_MS, S = KNIFE_COMBO_FINISH_STOP_MS;
    expect(m(0)).toBe(0);
    expect(m(S)).toBe(0);
    expect(m(R)).toBe(1);
    expect(m(R + 500)).toBe(1);
    let prev = 0;
    for (let t = S + 10; t < R; t += 10) { const v = m(t); expect(v).toBeGreaterThanOrEqual(prev); expect(v).toBeLessThan(1); prev = v; }
    expect(m(R - 10)).toBeGreaterThan(0.98);
    expect(m(S + 10)).toBeLessThan(0.02);
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
    const s2 = knifeComboCounterPlan(2, 1000 + KNIFE_COMBO_INTERVAL_MS, s1.readyAt, s1.comboCounter, cd);
    expect(s2.open).toBe(false);
    expect(s2.readyAt).toBe(1000 + KNIFE_COMBO_INTERVAL_MS + KNIFE_COMBO_RESET_MS + cd);
    const s3 = knifeComboCounterPlan(3, 1000 + 2 * KNIFE_COMBO_INTERVAL_MS, s2.readyAt, s2.comboCounter, cd);
    expect(s3.open).toBe(false);
    expect(s3.readyAt).toBe(1000 + 2 * KNIFE_COMBO_INTERVAL_MS + cd);
    // クールダウン中に始めた1段目は窓を開かず、readyAt を動かさない
    const s1b = knifeComboCounterPlan(1, 2600, s3.readyAt, s3.comboCounter, cd);
    expect(s1b).toEqual({ open: false, comboCounter: false, readyAt: s3.readyAt });
  });
  it('次の振りの時刻: 3段目の後はカウンター窓が開ける時刻まで出さない(体が動ける隙より長ければそちら)・1/2段目は段の間隔のまま', () => {
    for (const mult of [1, 0.9, 0.5]) {
      const cd = 820 * mult;
      const s1 = knifeComboCounterPlan(1, 1000, 0, false, cd);
      const s2 = knifeComboCounterPlan(2, 1400, s1.readyAt, s1.comboCounter, cd);
      const s3 = knifeComboCounterPlan(3, 1800, s2.readyAt, s2.comboCounter, cd);
      const gap3 = KNIFE_COMBO_FINISH_RECOVERY_MS * mult;
      const next = knifeNextSwingAt(3, 1800, gap3, s3.readyAt);
      expect(next).toBe(Math.max(1800 + gap3, 1800 + cd));
      expect(next).toBeGreaterThanOrEqual(1800 + gap3); // 体の隙より前には振れない
      // その時刻に振った1段目は必ずカウンター窓が開く
      expect(knifeComboCounterPlan(1, next, s3.readyAt, s3.comboCounter, cd).open).toBe(true);
      expect(knifeNextSwingAt(1, 1000, 400 * mult, s1.readyAt)).toBe(1000 + 400 * mult);
      expect(knifeNextSwingAt(2, 1400, 400 * mult, s2.readyAt)).toBe(1400 + 400 * mult);
    }
    // 隙の方が長ければ隙のまま
    expect(knifeNextSwingAt(3, 0, 1000, 820)).toBe(1000);
  });
  it('振りの向き: 1段目=振り上げ・2段目=振り下ろし・3段目=振り上げ', () => {
    expect([1, 2, 3].map(knifeComboSwingDir)).toEqual([1, -1, 1]);
  });
  it('踏み込み: 1・2段目=体の幅×0.3(走りの踏み込みの方が大きければそちら)', () => {
    expect(knifeComboStepPx(28, 0, 1)).toBeCloseTo(28 * KNIFE_COMBO_STEP_FRAC);
    expect(knifeComboStepPx(28, 0, 2)).toBeCloseTo(28 * KNIFE_COMBO_STEP_FRAC);
    expect(knifeComboStepPx(28, 30, 1)).toBe(30);
    expect(knifeComboStepPx(28, 30, 2)).toBe(30);
  });
  it('踏み込み: 3段目だけ大きく前へ(体の幅×0.8・走りの踏み込みの方が大きければそちら)', () => {
    expect(KNIFE_COMBO_FINISH_STEP_FRAC).toBeGreaterThan(KNIFE_COMBO_STEP_FRAC);
    expect(knifeComboStepPx(28, 0, 3)).toBeCloseTo(28 * KNIFE_COMBO_FINISH_STEP_FRAC);
    expect(knifeComboStepPx(28, 0, 3)).toBeGreaterThan(knifeComboStepPx(28, 0, 2));
    expect(knifeComboStepPx(28, 30, 3)).toBe(30); // 走り(30) > 22.4
    expect(knifeComboStepPx(28, 10, 3)).toBeCloseTo(28 * KNIFE_COMBO_FINISH_STEP_FRAC); // 段の踏み込みの方が大きい
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

describe('ナイフの3連撃の命中の手応え(段ごと)', () => {
  it('全部同じ強さにしない: 止め・自分の止め・揺れ・粒は 1<2<3', () => {
    const [a, b, c] = [knifeComboFeel(1), knifeComboFeel(2), knifeComboFeel(3)];
    expect(a.stopMs).toBe(60); expect(b.stopMs).toBe(75); expect(c.stopMs).toBe(140);
    expect(a.selfStopMs).toBe(45); expect(b.selfStopMs).toBe(60); expect(c.selfStopMs).toBe(110);
    expect(a.shakeMs).toBe(0); // 1段目は揺れを足さない
    expect(b.shakeMag).toBeLessThan(c.shakeMag);
    expect(a.burst).toBeLessThan(b.burst); expect(b.burst).toBeLessThan(c.burst);
    expect(a.ringR).toBeLessThan(c.ringR);
    expect(c.heavyVol).toBeGreaterThan(0); expect(a.heavyVol).toBe(0);
    expect(a.hitRate).toBeGreaterThan(b.hitRate); expect(b.hitRate).toBeGreaterThan(c.hitRate); // 段で音の高さが変わる
    expect(KNIFE_COMBO_FEEL[3]).toBe(c);
  });
  it('3段目の揺れは鞭の3段目より少し弱い', () => {
    expect(knifeComboFeel(3).shakeMag).toBeLessThan(WHIP_COMBO_FEEL[3].shakeMag);
    expect(knifeComboFeel(3).shakeMs).toBeLessThan(WHIP_COMBO_FEEL[3].shakeMs);
  });
  it('会心は止めと揺れを上乗せ(敵 +40・自分 +30)', () => {
    const n = knifeComboHitStop(1, false), k = knifeComboHitStop(1, true);
    expect(k.enemyMs - n.enemyMs).toBe(40);
    expect(k.selfMs - n.selfMs).toBe(30);
    expect(k.shakeMs).toBeGreaterThan(0); expect(k.shakeMag).toBeGreaterThan(0);
    expect(knifeComboHitStop(3, true).selfMs).toBe(245); // 110×1.5(MELEE_HITSTOP_STRETCH・社長指示2026-11-27)×1.3(3段目=締めの係数・research/HITSTOP.md)+会心30
  });
  it('段の外は1段目', () => {
    expect(knifeComboFeel(0)).toBe(KNIFE_COMBO_FEEL[1]);
  });
  it('命中音の重ねは段の高さを掛ける(揺らぎ ±4%)・段なしはそのまま', () => {
    const base = [{ delayMs: 0, rate: 1, gain: 1 }, { delayMs: 30, rate: 0.86, gain: 0.5 }];
    expect(knifeComboSfxLayers(base, undefined, 0.3)).toEqual(base);
    const mid = knifeComboSfxLayers(base, 3, 0.5);
    expect(mid[0].rate).toBeCloseTo(knifeComboFeel(3).hitRate);
    expect(mid[1].rate).toBeCloseTo(0.86 * knifeComboFeel(3).hitRate);
    const lo = knifeComboSfxLayers(base, 1, 0)[0].rate, hi = knifeComboSfxLayers(base, 1, 1)[0].rate;
    expect(hi / lo).toBeCloseTo(1.04 / 0.96);
    expect(base[0].rate).toBe(1); // 元を書き換えない
  });
});

describe('自分の振りの止め(描画だけ・knifeSwingDrawSince)', () => {
  it('当たるまではそのまま・当たった所で selfMs だけ止まり・明けたら同じ速さで進む', () => {
    expect(knifeSwingDrawSince(150, 200, 110, 200)).toBe(150);
    expect(knifeSwingDrawSince(200, 200, 110, 200)).toBe(200);
    expect(knifeSwingDrawSince(260, 200, 110, 200)).toBe(200);
    expect(knifeSwingDrawSince(310, 200, 110, 200)).toBe(200);
    expect(knifeSwingDrawSince(320, 200, 110, 200)).toBe(210);
  });
  it('入りと明けで値が跳ばない(瞬間移動しない)', () => {
    let prev = knifeSwingDrawSince(0, 205, 60, 200);
    for (let t = 1; t <= 600; t++) {
      const v = knifeSwingDrawSince(t, 205, 60, 200);
      expect(v - prev).toBeGreaterThanOrEqual(0);
      expect(v - prev).toBeLessThanOrEqual(1 + 1e-9);
      prev = v;
    }
  });
  it('前隙なしで振り始めと同時に当たった時も、刃が出た所(minAt)で止める', () => {
    expect(knifeSwingDrawSince(100, 0, 45, 200)).toBe(100);
    expect(knifeSwingDrawSince(230, 0, 45, 200)).toBe(200);
    expect(knifeSwingDrawSince(260, 0, 45, 200)).toBe(215);
  });
  it('この振りの命中でない(負)・止め0 はそのまま', () => {
    expect(knifeSwingDrawSince(300, -50, 110, 200)).toBe(300);
    expect(knifeSwingDrawSince(300, 200, 0, 200)).toBe(300);
  });
});

describe('段ごとのダメージの倍率(knifeStageDamageMult・社長裁定2026-11-27)', () => {
  it('1段目・2段目=0.55・3段目=0.88(締めが一番重い)', () => {
    expect(knifeStageDamageMult(1)).toBe(0.55);
    expect(knifeStageDamageMult(2)).toBe(0.55);
    expect(knifeStageDamageMult(3)).toBe(0.88);
    expect(knifeStageDamageMult(3)).toBeGreaterThan(knifeStageDamageMult(2));
  });
  it('合計 1.98(≒揃える倍率 0.66×3)', () => {
    const sum = KNIFE_COMBO_STAGE_DAMAGE_MULT[1] + KNIFE_COMBO_STAGE_DAMAGE_MULT[2] + KNIFE_COMBO_STAGE_DAMAGE_MULT[3];
    expect(sum).toBeCloseTo(1.98, 9);
    expect(sum / 3).toBeCloseTo(0.66, 9);
  });
  it('時間あたりのダメージが旧の1振り(820msおき)とほぼ揃う(1周=間隔×2+3段目の後の隙)', () => {
    const cycleMs = KNIFE_COMBO_INTERVAL_MS * 2 + Math.max(KNIFE_COMBO_FINISH_RECOVERY_MS, 820);
    const sum = KNIFE_COMBO_STAGE_DAMAGE_MULT[1] + KNIFE_COMBO_STAGE_DAMAGE_MULT[2] + KNIFE_COMBO_STAGE_DAMAGE_MULT[3];
    expect(cycleMs).toBe(1620);
    expect(sum / cycleMs).toBeCloseTo(1 / 820, 4);
  });
  it('段の外(0・未定義・範囲外)は 1', () => {
    expect(knifeStageDamageMult(0)).toBe(1);
    expect(knifeStageDamageMult(undefined)).toBe(1);
    expect(knifeStageDamageMult(4)).toBe(1);
  });
});
