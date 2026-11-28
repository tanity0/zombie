// 鞭: 3段目の後の隙・強個体は着弾で必ず死なない・盾のダメージ・技名の出し分け(社長指示2026-11-26)の純関数。
import { describe, it, expect } from 'vitest';
import {
  whipComboTapAction, whipComboGapMs, whipComboBodyRecover, WHIP_COMBO_INTERVAL_MS, WHIP_COMBO_FINISH_RECOVERY_MS, WHIP_COMBO_FINISH_HOLD_MS,
} from './whipCombo';
import { whipShieldHitDamage, whipShieldHealthFloor, whipThrowExecutesSelf, whipLandTechKind, whipLandStunClearPatch } from './whipSwing';
import { whipBodyPose } from './whipSwingMotion';
import { BRAWLER_TECH_NAMES } from '../data/brawlerTechNames';

describe('3段目の後の隙', () => {
  it('3段目の後は1.0秒(段の間隔0.5秒の倍)・1/2段目は段の間隔のまま', () => {
    expect(WHIP_COMBO_FINISH_RECOVERY_MS).toBe(1000);
    expect(whipComboGapMs(3)).toBe(WHIP_COMBO_FINISH_RECOVERY_MS);
    expect(whipComboGapMs(1)).toBe(WHIP_COMBO_INTERVAL_MS);
    expect(whipComboGapMs(2)).toBe(WHIP_COMBO_INTERVAL_MS);
    expect(whipComboGapMs(3)).toBeGreaterThan(whipComboGapMs(2));
  });
  it('3段目の前隙・隙の間のタップは捨てる(予約しない)。1/2段目の後は今まで通り予約', () => {
    expect(whipComboTapAction(100, 200, false, 3)).toBe('drop');
    expect(whipComboTapAction(250, 200, true, 3)).toBe('drop'); // 3段目の前隙中
    expect(whipComboTapAction(200, 200, false, 3)).toBe('swing'); // 明けたら振れる
    expect(whipComboTapAction(100, 200, false, 2)).toBe('queue');
    expect(whipComboTapAction(100, 200, false, 1)).toBe('queue');
    expect(whipComboTapAction(100, 200, false)).toBe('queue');
  });
  it('体の姿勢: 3段目は振り抜いた底で粘り、隙が明けるまでにゆっくり立ち姿へ戻る(慣性つき)。1/2段目は今の戻り', () => {
    const W = 200;
    expect(whipComboBodyRecover(1, W)).toBeNull();
    expect(whipComboBodyRecover(2, W)).toBeNull();
    const r = whipComboBodyRecover(3, W)!;
    expect(r.holdMs).toBe(WHIP_COMBO_FINISH_HOLD_MS);
    expect(W + r.holdMs + r.recoverMs).toBe(WHIP_COMBO_FINISH_RECOVERY_MS);
    // 粘りの間は底(しゃがみ)のまま
    const bottom = whipBodyPose(W, W, r.recoverMs, r.holdMs);
    expect(bottom.pose).toBe('ready');
    expect(whipBodyPose(W + r.holdMs - 1, W, r.recoverMs, r.holdMs).sqY).toBeCloseTo(bottom.sqY, 9);
    // 戻りは単調で、動き始めと終わりが遅い(加減速)
    const ys: number[] = [];
    for (let t = W + r.holdMs; t < W + r.holdMs + r.recoverMs; t += 10) ys.push(whipBodyPose(t, W, r.recoverMs, r.holdMs).sqY);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1] - 1e-9);
    const d = ys.slice(1).map((y, i) => y - ys[i]);
    const mid = Math.floor(d.length / 2);
    expect(d[0]).toBeLessThan(d[mid]);
    expect(d[d.length - 1]).toBeLessThan(d[mid]);
    // 隙が明けたら立ち姿(差し替えない)
    expect(whipBodyPose(WHIP_COMBO_FINISH_RECOVERY_MS, W, r.recoverMs, r.holdMs).pose).toBeNull();
    // 3段目の姿勢は今の戻り(1/2段目)より長く残る
    expect(whipBodyPose(W + 300, W).pose).toBeNull();
    expect(whipBodyPose(W + 300, W, r.recoverMs, r.holdMs).pose).toBe('ready');
  });
});

describe('着弾で必ず死ぬのは雑魚だけ', () => {
  it('雑魚=処刑・強個体とボス=爆発のダメージだけ', () => {
    expect(whipThrowExecutesSelf('mob')).toBe(true);
    expect(whipThrowExecutesSelf('strong')).toBe(false);
    expect(whipThrowExecutesSelf('boss')).toBe(false);
  });
});

describe('盾のダメージ', () => {
  it('威力=弾の damage(1未満・壊れた値は1)', () => {
    expect(whipShieldHitDamage(37)).toBe(37);
    expect(whipShieldHitDamage(0)).toBe(1);
    expect(whipShieldHitDamage(Number.NaN)).toBe(1);
  });
  it('ボスは体力1で止まる(致命にしない)・雑魚と強個体は止めない', () => {
    expect(whipShieldHealthFloor('boss', 500)).toBe(1);
    expect(whipShieldHealthFloor('boss', 0.5)).toBe(0.5);
    expect(whipShieldHealthFloor('mob', 500)).toBe(0);
    expect(whipShieldHealthFloor('strong', 500)).toBe(0);
  });
});

describe('技名の出し分け', () => {
  it('ボスの叩きつけ=「叩きつけ」(下向き)・投げ=「大車輪」', () => {
    expect(whipLandTechKind('overhead')).toBe('whipoverhead');
    expect(whipLandTechKind('thrown')).toBe('whipslam');
    expect(BRAWLER_TECH_NAMES['tech:whipoverhead']).toEqual({ name: '叩きつけ', dir: 'down' });
    expect(BRAWLER_TECH_NAMES['tech:whipslam'].name).toBe('大車輪');
  });
});

// ★着弾で気絶(クリティカル)を解く(社長指示2026-11-26「一度回したらクリティカル解除して」)。
describe('whipLandStunClearPatch', () => {
  it('黄の気絶は消す・紫は今の時刻で終わらせる・黄色クリの窓は消す', () => {
    expect(whipLandStunClearPatch({ stunUntil: 2000, bossFullStunUntil: 3000, bossSlowUntil: 1500 }, 1000))
      .toEqual({ stunUntil: undefined, bossFullStunUntil: 1000, bossSlowUntil: undefined });
  });
  it('立っていない(終わった)物は書かない・全部無ければ null', () => {
    expect(whipLandStunClearPatch({ stunUntil: 500, bossFullStunUntil: 900 }, 1000)).toBeNull();
    expect(whipLandStunClearPatch({}, 1000)).toBeNull();
    expect(whipLandStunClearPatch({ stunUntil: 2000 }, 1000)).toEqual({ stunUntil: undefined });
  });
});
