import { describe, it, expect } from 'vitest';
import {
  usesSkeletonClaw, skeletonClawCounterable, skeletonClawTotalMs,
  skelClawFrame, skelClawAlpha, skelClawFxFrame,
  skelClawTexName, skelClawFxTexName,
  SKEL_CLAW_FRAMES, SKEL_CLAW_IMPACT_FRAME, SKEL_CLAW_HOLD_MS,
  SKEL_CLAW_FX_FRAMES, SKEL_CLAW_FX_IMPACT_FRAME, SKEL_CLAW_FX_HOLD_MS,
  SKEL_CLAW_W_PX, SKEL_CLAW_FX_W_PX, SKEL_CLAW_FX_ADDITIVE,
} from './skeletonClaw';

describe('スケルトンの爪: 対象と色', () => {
  it('爪を振るのはスケルトンだけ(区分外の型へ増設しない)', () => {
    expect(usesSkeletonClaw({ type: 'skeleton' })).toBe(true);
    expect(usesSkeletonClaw({ type: 'bat' })).toBe(false);
    expect(usesSkeletonClaw({ type: 'zombie' })).toBe(false);
  });

  it('★色はカウンター可否で決まる(技=赤 / 既定の噛みつき=紫)', () => {
    expect(skeletonClawCounterable({ type: 'skeleton', chaffMove: 'skel-bite' } as never)).toBe(true);
    expect(skeletonClawCounterable({ type: 'skeleton' } as never)).toBe(false);
  });

  it('★赤と紫で別のテクスチャを引く(痕もVFXも)', () => {
    expect(skelClawTexName(2, true)).not.toBe(skelClawTexName(2, false));
    expect(skelClawFxTexName(0, true)).not.toBe(skelClawFxTexName(0, false));
    expect(skelClawTexName(2, true)).toBe('fx/skel-claw-2');
    expect(skelClawFxTexName(0, false)).toBe('fx/skel-claw-fx-p-0');
  });
});

describe('スケルトンの爪: 引っ掻き痕のコマ送り', () => {
  it('★当たる瞬間に痕が出揃う(最後のコマ)', () => {
    expect(skelClawFrame(0)).toBe(SKEL_CLAW_IMPACT_FRAME);
    expect(SKEL_CLAW_IMPACT_FRAME).toBe(SKEL_CLAW_FRAMES - 1);
  });

  it('★当たる前に赤が出ている時間は短い(判定の点に長居させない)', () => {
    const lead = SKEL_CLAW_HOLD_MS.slice(0, SKEL_CLAW_IMPACT_FRAME).reduce((a, b) => a + b, 0);
    expect(lead).toBeLessThanOrEqual(90);
    expect(skelClawFrame(-lead)).toBe(0);
    expect(skelClawFrame(-lead - 1)).toBeNull();
  });

  it('★痕は当たった後に一番長く残る(出揃った絵を見せる)', () => {
    const last = SKEL_CLAW_HOLD_MS[SKEL_CLAW_IMPACT_FRAME];
    for (let i = 0; i < SKEL_CLAW_IMPACT_FRAME; i++) expect(last).toBeGreaterThan(SKEL_CLAW_HOLD_MS[i]);
  });

  it('★痕はパッと消えない(引きが緩い)', () => {
    expect(skelClawAlpha(0)).toBe(1);
    const a1 = skelClawAlpha(80), a2 = skelClawAlpha(120), a3 = skelClawAlpha(149);
    expect(a1).toBeGreaterThan(a2);
    expect(a2).toBeGreaterThan(a3);
    expect(a3).toBeGreaterThan(0);
    expect(skelClawAlpha(150)).toBe(0);
  });

  it('★コマは戻らず最後まで流し切る', () => {
    let prev = -1;
    for (let t = -66; t < 150; t += 2) {
      const f = skelClawFrame(t);
      if (f === null) continue;
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(prev).toBe(SKEL_CLAW_FRAMES - 1);
  });
});

describe('スケルトンの爪: VFX', () => {
  it('★当たる瞬間が一番大きいコマ(先頭)', () => {
    expect(SKEL_CLAW_FX_IMPACT_FRAME).toBe(0);
    expect(skelClawFxFrame(0)).toBe(0);
    expect(skelClawFxFrame(-1)).toBeNull();   // 当たる前にVFXは出さない
  });

  it('★散るほど遅くなる(等間隔にしない)', () => {
    const h = SKEL_CLAW_FX_HOLD_MS;
    expect(h[h.length - 1]).toBeGreaterThan(h[1]);
    expect(h).toHaveLength(SKEL_CLAW_FX_FRAMES);
  });

  it('★最後まで流し切ってから消える', () => {
    const total = SKEL_CLAW_FX_HOLD_MS.reduce((a, b) => a + b, 0);
    expect(skelClawFxFrame(total - 1)).toBe(SKEL_CLAW_FX_FRAMES - 1);
    expect(skelClawFxFrame(total)).toBeNull();
  });

  it('ラッチの寿命は痕とVFXの長い方を覆う', () => {
    const fxTotal = SKEL_CLAW_FX_HOLD_MS.reduce((a, b) => a + b, 0);
    expect(skeletonClawTotalMs()).toBeGreaterThanOrEqual(fxTotal);
  });
});

describe('大きさ(社長指示2026-09-18「もう少し両方大きく出してもいいかも」)', () => {
  it('★痕もVFXも判定(接触36px)より大きい=②派手さの絵', () => {
    expect(SKEL_CLAW_W_PX).toBeGreaterThan(36 * 2);
    expect(SKEL_CLAW_FX_W_PX).toBeGreaterThan(36 * 2);
  });

  it('★VFXは痕より大きく出す(飛沫が痕に埋もれない)', () => {
    expect(SKEL_CLAW_FX_W_PX).toBeGreaterThan(SKEL_CLAW_W_PX);
  });

  it('★VFXは加算合成(黒地のシートを通常合成で置かない=夜景に沈ませない)', () => {
    expect(SKEL_CLAW_FX_ADDITIVE).toBe(true);
  });
});
