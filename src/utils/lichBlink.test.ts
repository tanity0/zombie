import { describe, it, expect } from 'vitest';
import {
  LICH_BLINK_TRIGGER_PX, LICH_BLINK_HOLD_MS, LICH_BLINK_BITE_MS, LICH_BLINK_WINDUP_MS,
  LICH_BLINK_DRAW_FRAC, LICH_BLINK_VANISH_MS, LICH_BLINK_CIRCLE_LEAD_MS,
  lichBlinkShouldFire, lichBlinkTargetPoint, lichBlinkBodyPose,
  lichBlinkDestCircleProgress, lichBlinkOriginCircleProgress,
} from './lichBlink';

describe('lichBlink: 定数の整合(C-2b)', () => {
  it('windupMs + biteMs = 総尺(独立した値として持たない)', () => {
    expect(LICH_BLINK_WINDUP_MS + LICH_BLINK_BITE_MS).toBe(LICH_BLINK_HOLD_MS);
  });
  it('総尺は1000ms・現れる幅は200ms(社長裁定b)', () => {
    expect(LICH_BLINK_HOLD_MS).toBe(1000);
    expect(LICH_BLINK_BITE_MS).toBe(200);
  });
  it('drawFracはwindupMs/totalから導く(長く描いて短く消す)', () => {
    expect(LICH_BLINK_DRAW_FRAC).toBeCloseTo(LICH_BLINK_WINDUP_MS / LICH_BLINK_HOLD_MS, 10);
    expect(LICH_BLINK_DRAW_FRAC).toBeGreaterThan(0.5);
  });
});

describe('lichBlinkShouldFire', () => {
  const base = { type: 'lich' as const, biteAt: undefined, chaffMove: undefined, aiPhase: undefined, biteReadyAt: undefined };

  it('140px以内・CD明けなら発火する', () => {
    expect(lichBlinkShouldFire(base, 1000, 140)).toBe(true);
    expect(lichBlinkShouldFire(base, 1000, 50)).toBe(true);
  });
  it('140px超は発火しない', () => {
    expect(lichBlinkShouldFire(base, 1000, 140.01)).toBe(false);
    expect(lichBlinkShouldFire(base, 1000, 300)).toBe(false);
  });
  it('lich以外は発火しない', () => {
    expect(lichBlinkShouldFire({ ...base, type: 'zombie' as unknown as 'lich' }, 1000, 10)).toBe(false);
  });
  it('CD中(biteReadyAt未到来)は発火しない', () => {
    expect(lichBlinkShouldFire({ ...base, biteReadyAt: 2000 }, 1000, 10)).toBe(false);
    expect(lichBlinkShouldFire({ ...base, biteReadyAt: 2000 }, 2000, 10)).toBe(true);
  });
  it('既に噛んでいる/技を構えている個体は再発火しない', () => {
    expect(lichBlinkShouldFire({ ...base, biteAt: 900 }, 1000, 10)).toBe(false);
    expect(lichBlinkShouldFire({ ...base, chaffMove: 'lich-blink' }, 1000, 10)).toBe(false);
    expect(lichBlinkShouldFire({ ...base, aiPhase: 'lich-blink' }, 1000, 10)).toBe(false);
  });
});

describe('lichBlinkTargetPoint', () => {
  it('プレイヤー中心からLICH_BLINK_LAND_OFFSET_PXだけ、敵の居る方角へ寄った点を返す', () => {
    // 敵が右(+x)に居る: 着地点はプレイヤーから見て右側に少し寄る
    const p = lichBlinkTargetPoint(0, 0, 100, 0);
    expect(p.x).toBeGreaterThan(0);
    expect(p.y).toBeCloseTo(0, 5);
    const dist = Math.hypot(p.x, p.y);
    expect(dist).toBeCloseTo(24, 3); // LICH_BLINK_LAND_OFFSET_PX
  });
  it('密着(距離0)でも壊れない(0除算を避ける)', () => {
    const p = lichBlinkTargetPoint(50, 50, 50, 50);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});

describe('lichBlinkBodyPose', () => {
  const firing = { biteAt: 1000, chaffMove: 'lich-blink' as const };

  it('技を出していない/biteAtが無ければnone', () => {
    expect(lichBlinkBodyPose({ biteAt: undefined, chaffMove: 'lich-blink' }, 1500).where).toBe('none');
    expect(lichBlinkBodyPose({ biteAt: 1000, chaffMove: undefined }, 1500).where).toBe('none');
  });

  it('発火直後は元の場所に等身で立つ(縮みはまだ)', () => {
    const pose = lichBlinkBodyPose(firing, 1000);
    expect(pose.where).toBe('origin');
    expect(pose.scale).toBe(1);
    expect(pose.alpha).toBe(1);
  });

  it('溜めの終盤(vanish窓)は元の場所で縮む', () => {
    const pose = lichBlinkBodyPose(firing, 1000 + LICH_BLINK_WINDUP_MS - LICH_BLINK_VANISH_MS / 2);
    expect(pose.where).toBe('origin');
    expect(pose.scale).toBeLessThan(1);
  });

  it('溜め明け(windup終わり=800ms後)には元の場所は空(赤が消え切る前に消えている)', () => {
    const pose = lichBlinkBodyPose(firing, 1000 + LICH_BLINK_WINDUP_MS - 1);
    expect(pose.where).toBe('origin');
    expect(pose.alpha).toBeLessThan(0.05); // ほぼ透明
  });

  it('windup明け以降(bite区間)は着地点(dest)で現れる', () => {
    const pose = lichBlinkBodyPose(firing, 1000 + LICH_BLINK_WINDUP_MS + 1);
    expect(pose.where).toBe('dest');
  });

  it('行き過ぎの頂点(u=1)が命中の瞬間(=HOLD_MS経過時)と一致する', () => {
    const pose = lichBlinkBodyPose(firing, 1000 + LICH_BLINK_HOLD_MS);
    expect(pose.where).toBe('dest');
    expect(pose.scale).toBeCloseTo(1, 5); // backOut(1) === 1
  });

  it('総尺を過ぎたらnone', () => {
    expect(lichBlinkBodyPose(firing, 1000 + LICH_BLINK_HOLD_MS + 1).where).toBe('none');
  });
});

describe('lichBlinkDestCircleProgress / lichBlinkOriginCircleProgress', () => {
  const firing = { biteAt: 1000, chaffMove: 'lich-blink' as const };

  it('着地陣は体より先(LICH_BLINK_CIRCLE_LEAD_MS)に灯り始める', () => {
    const openAt = LICH_BLINK_WINDUP_MS - LICH_BLINK_CIRCLE_LEAD_MS;
    expect(lichBlinkDestCircleProgress(firing, 1000 + openAt - 1)).toBeNull();
    expect(lichBlinkDestCircleProgress(firing, 1000 + openAt + 1)).not.toBeNull();
  });

  it('着地陣は命中の瞬間(HOLD_MS)まで開き続ける', () => {
    const p = lichBlinkDestCircleProgress(firing, 1000 + LICH_BLINK_HOLD_MS - 1);
    expect(p).not.toBeNull();
    expect(p as number).toBeLessThan(1);
  });

  it('ワープ元の陣はvanish窓の間だけ進む', () => {
    const vanishStart = LICH_BLINK_WINDUP_MS - LICH_BLINK_VANISH_MS;
    expect(lichBlinkOriginCircleProgress(firing, 1000 + vanishStart - 1)).toBeNull();
    expect(lichBlinkOriginCircleProgress(firing, 1000 + vanishStart + 1)).not.toBeNull();
    expect(lichBlinkOriginCircleProgress(firing, 1000 + LICH_BLINK_WINDUP_MS + 1)).toBeNull();
  });
});

describe('LICH_BLINK_TRIGGER_PX', () => {
  it('社長変更どおり140px', () => {
    expect(LICH_BLINK_TRIGGER_PX).toBe(140);
  });
});
