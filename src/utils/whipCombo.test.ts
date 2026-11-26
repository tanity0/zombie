// 鞭の3連撃のカウンター: 1段目だけ・クールダウンは連撃の終わりから(社長指示2026-11-26「カウンターは一撃目のみで、クールダウンは連撃終わりからです」)。
import { describe, it, expect } from 'vitest';
import {
  whipComboCounterPlan, whipComboCounterCut, whipComboEndAt, WHIP_COMBO_RESET_MS, WHIP_COMBO_INTERVAL_MS, WHIP_COMBO_QUEUE_MAX_MS,
  WHIP_COMBO_FINISH_RECOVERY_MS, WHIP_COMBO_FINISH_STOP_MS, whipComboFinishMoveMult, whipComboGapMs,
  whipComboNextStage, whipComboBodyRecover,
} from './whipCombo';
import { computeEffectiveMoveSpeed } from './playerMoveSpeed';
import { whipBodyPose } from './whipSwingMotion';

const CD = 1040;
const I = WHIP_COMBO_INTERVAL_MS;

describe('whipComboCounterPlan', () => {
  it('1段目だけ窓を開く(2・3段目は開かない)', () => {
    const a = whipComboCounterPlan(1, 1000, 0, false, CD);
    expect(a.open).toBe(true);
    expect(a.comboCounter).toBe(true);
    const b = whipComboCounterPlan(2, 1000 + I, a.readyAt, a.comboCounter, CD);
    expect(b.open).toBe(false);
    const c = whipComboCounterPlan(3, 1000 + 2 * I, b.readyAt, b.comboCounter, CD);
    expect(c.open).toBe(false);
    // 3段目で連撃が終わる=その時点からクールダウン
    expect(c.readyAt).toBe(1000 + 2 * I + CD);
  });
  it('3段目の後、クールダウン明けまで次の1段目は開かない(明ければ開く)', () => {
    const c = whipComboCounterPlan(3, 2000, 0, true, CD);
    const early = whipComboCounterPlan(1, 2000 + I, c.readyAt, c.comboCounter, CD);
    expect(early.open).toBe(false);
    expect(early.comboCounter).toBe(false);
    expect(early.readyAt).toBe(c.readyAt); // 窓を開けなかった連撃はクールダウンを動かさない
    expect(whipComboCounterPlan(1, 2000 + CD, c.readyAt, false, CD).open).toBe(true);
  });
  it('途中で止めた時は、1段目へ戻る時点からクールダウン', () => {
    const a = whipComboCounterPlan(1, 1000, 0, false, CD);
    expect(a.readyAt).toBe(1000 + WHIP_COMBO_RESET_MS + CD);
    const b = whipComboCounterPlan(2, 1000 + I, a.readyAt, true, CD);
    expect(b.readyAt).toBe(1000 + I + WHIP_COMBO_RESET_MS + CD);
    expect(whipComboEndAt(2, 1000 + I)).toBe(1000 + I + WHIP_COMBO_RESET_MS);
  });
  it('連撃が切れた(掴んだ等)時は、その時点から(窓を開いた連撃だけ)', () => {
    expect(whipComboCounterCut(5000, 9999, true, CD)).toEqual({ comboCounter: false, readyAt: 5000 + CD });
    expect(whipComboCounterCut(5000, 1234, false, CD)).toEqual({ comboCounter: false, readyAt: 1234 });
  });
});

describe('段の間隔(社長指示2026-11-26「鞭の連撃、0.5秒間隔にして」)', () => {
  it('間隔は0.5秒。1段目へ戻る時間・予約の寿命は間隔より長い(間隔どおりに押せば次の段が出る)', () => {
    expect(WHIP_COMBO_INTERVAL_MS).toBe(500);
    expect(WHIP_COMBO_RESET_MS).toBeGreaterThan(WHIP_COMBO_INTERVAL_MS);
    expect(WHIP_COMBO_QUEUE_MAX_MS).toBeGreaterThan(WHIP_COMBO_INTERVAL_MS);
  });
});

describe('3段目の後の隙(社長承認2026-11-26「隙を1.0秒・前半0.4秒は歩く速さを半分」)', () => {
  it('隙は1.0秒(段の間の倍)・明けた時には1段目に戻っている', () => {
    expect(WHIP_COMBO_FINISH_RECOVERY_MS).toBe(1000);
    expect(whipComboGapMs(3)).toBe(2 * WHIP_COMBO_INTERVAL_MS);
    expect(WHIP_COMBO_FINISH_RECOVERY_MS).toBeGreaterThan(WHIP_COMBO_RESET_MS);
    expect(whipComboNextStage(3, 0, WHIP_COMBO_FINISH_RECOVERY_MS)).toBe(1);
  });
  it('歩く速さ(社長指示2026-11-26「隙の半分は立ち止まっててほしい」): 隙の半分(0.5秒)は 0、隙の終わり(1.0秒)までに加減速つきで 1。3段目以外は 1', () => {
    expect(WHIP_COMBO_FINISH_STOP_MS).toBe(WHIP_COMBO_FINISH_RECOVERY_MS / 2);
    const m = (since: number) => whipComboFinishMoveMult(3, 5_000, 5_000 + since);
    for (let t = 0; t <= 500; t += 50) expect(m(t)).toBe(0);
    expect(m(750)).toBeCloseTo(0.5);
    expect(m(1000)).toBe(1);
    let prev = 0;
    for (let t = 510; t < 1000; t += 10) { const v = m(t); expect(v).toBeGreaterThanOrEqual(prev); expect(v).toBeLessThan(1); prev = v; }
    expect(m(510)).toBeLessThan(0.01); // 動き出しは緩やか(慣性)
    expect(m(990)).toBeGreaterThan(0.99); // 終わり際も段差にならない
    expect(whipComboFinishMoveMult(2, 5_000, 5_100)).toBe(1);
    expect(whipComboFinishMoveMult(undefined, undefined, 5_100)).toBe(1);
  });
  it('回避(ダッシュ系・スライド)には掛からない。歩き(走りの段を含む)には掛かる', () => {
    const base = { reloading: false, reloadMoveSpeedMult: 0.5, playerSpeed: 100, skaterActive: false, bonusMult: 1.3, rampFrac: 1, trapDebuffed: false, pvpMult: 1, meleeRecoverMult: whipComboFinishMoveMult(3, 1000, 1100) };
    expect(computeEffectiveMoveSpeed({ ...base, dashOverrideSpeed: null, slidingSpeed: null })).toBe(0);
    expect(computeEffectiveMoveSpeed({ ...base, dashOverrideSpeed: 600, slidingSpeed: null })).toBe(600);
    expect(computeEffectiveMoveSpeed({ ...base, dashOverrideSpeed: null, slidingSpeed: 400 })).toBe(400);
  });
  it('体の姿勢: 振り抜いた底で粘ってから、隙の終わり(1.0秒)で立ち姿へ戻り切る', () => {
    const W = 200;
    const r = whipComboBodyRecover(3, W)!;
    expect(W + r.holdMs + r.recoverMs).toBe(WHIP_COMBO_FINISH_RECOVERY_MS);
    expect(whipBodyPose(W + r.holdMs - 1, W, r.recoverMs, r.holdMs).pose).toBe('ready');
    expect(whipBodyPose(WHIP_COMBO_FINISH_RECOVERY_MS - 20, W, r.recoverMs, r.holdMs).pose).toBe('ready');
    expect(whipBodyPose(WHIP_COMBO_FINISH_RECOVERY_MS, W, r.recoverMs, r.holdMs).pose).toBe(null);
  });
});
