import { describe, it, expect } from 'vitest';
import {
  escortPose, escortDownK, escortBarWant, escortDownDotAlpha, escortReviveLitTarget,
  ESCORT_SINK_PX, ESCORT_OVERSHOOT_PX, ESCORT_FALL_MS, ESCORT_FALL_IMPACT_AT, ESCORT_FALL_THUD_K, ESCORT_RISE_MS, ESCORT_RISE_SELF_MS,
  ESCORT_FLASH_MS, ESCORT_FLASH_ALPHA, ESCORT_BLINK_MS, ESCORT_BAR_SHOW_MS, ESCORT_BAR_FADE_MS, ESCORT_BAR_HEAL_SHOW_MS, ESCORT_HIT_CROUCH_MS, ESCORT_BREATH_BOB_PX, ESCORT_DOWN_PULSE_MS,
} from './escortVisual';

const stand = { maxHealth: 78, health: 78 };

describe('escortVisual: 倒れる・起き上がり(位置・影・透明度だけ=歪みなし)', () => {
  it('体力を持たない軍人(M0の随行)は恒等=従来と同じ', () => {
    const p = escortPose({ downedAt: 0, riseAt: 0 }, 1234);
    expect(p).toEqual({ downK: 0, sinkPx: 0, sinkBodyK: 0, sinkExtraPx: 0, alphaMul: 1, shadowW: 1, shadowLen: 1, shadowAlpha: 1, flash: 0, hitCrouch: false });
  });
  it('沈みは本体(0..1・体高比で描く)と上乗せ(基準px)に分かれ、起き上がりの行き過ぎは上乗せ側=体高比に乗らない(R2 A-3)', () => {
    const e = { maxHealth: 100, downedAt: undefined, riseAt: 0, riseKind: 'player' as const, lastHitAt: undefined };
    let minExtra = 0;
    for (let t = 0; t <= 800; t += 10) {
      const p = escortPose(e, t);
      expect(p.sinkBodyK).toBeGreaterThanOrEqual(0); expect(p.sinkBodyK).toBeLessThanOrEqual(1);
      minExtra = Math.min(minExtra, p.sinkExtraPx);
    }
    expect(minExtra).toBeLessThan(0);           // 行き過ぎはある
    expect(minExtra).toBeGreaterThan(-4);       // 数px(基準px)に収まる
  });
  it('倒れる: 重力で加速して落ち(ease-in)→着地で沈みを1.28倍まで食い込み(ドサッ)→1へ落ち着く', () => {
    const e = { ...stand, downedAt: 1000 };
    expect(escortDownK(e, 1000)).toBe(0);
    // 序盤はゆっくり(加速)=線形より小さい
    expect(escortDownK(e, 1000 + ESCORT_FALL_MS * 0.1)).toBeLessThan(0.1);
    // 着地の瞬間に最深(1を超える)
    const land = escortDownK(e, 1000 + ESCORT_FALL_MS * ESCORT_FALL_IMPACT_AT);
    expect(land).toBeCloseTo(ESCORT_FALL_THUD_K);
    expect(land).toBeGreaterThan(1.2);
    // 着地後は1へ減衰(単調に戻る=ease-out)
    const later = escortDownK(e, 1000 + ESCORT_FALL_MS * 0.85);
    expect(later).toBeLessThan(land); expect(later).toBeGreaterThan(1);
    expect(escortDownK(e, 1000 + ESCORT_FALL_MS * 3)).toBe(1);
  });
  it('倒れきると沈みは定数(据え置き7px・呼吸の上下を除く)・影は広く平たく濃くなる(縮まない)', () => {
    const e = { ...stand, downedAt: 0 };
    const t = ESCORT_FALL_MS * 3; // 呼吸の位相0付近ではないので差は呼吸ぶん以内
    const p = escortPose(e, t);
    expect(p.sinkPx).toBeLessThanOrEqual(ESCORT_SINK_PX + 1e-9);
    expect(p.sinkPx).toBeGreaterThanOrEqual(ESCORT_SINK_PX - ESCORT_BREATH_BOB_PX - 1e-9);
    expect(p.shadowW).toBeGreaterThan(1); expect(p.shadowLen).toBeLessThan(1); expect(p.shadowAlpha).toBeGreaterThan(1);
    expect(escortPose(stand, 0)).toMatchObject({ shadowW: 1, shadowLen: 1, shadowAlpha: 1 });
  });
  it('設計書§6: 沈みは6〜8px(据え置き)', () => {
    expect(ESCORT_SINK_PX).toBeGreaterThanOrEqual(6); expect(ESCORT_SINK_PX).toBeLessThanOrEqual(8);
  });
  it('呼吸は透明度ではなく体の上下(位置だけ): 倒れている間 alpha は常に1・上下は約2.4秒周期で0〜1.8px', () => {
    const e = { ...stand, downedAt: 0 };
    const t0 = ESCORT_FALL_MS * 3;
    let lo = 99, hi = -99;
    for (let t = t0; t < t0 + ESCORT_DOWN_PULSE_MS * 2; t += 20) {
      const p = escortPose(e, t);
      expect(p.alphaMul).toBe(1);
      lo = Math.min(lo, p.sinkPx); hi = Math.max(hi, p.sinkPx);
    }
    expect(hi - lo).toBeGreaterThan(ESCORT_BREATH_BOB_PX * 0.9);
    expect(hi - lo).toBeLessThanOrEqual(ESCORT_BREATH_BOB_PX + 1e-9);
  });
  it('起き上がり: 沈みから戻り、体が浮いてから(−3px前後)落ち着く。自力は尺2倍', () => {
    const e = { ...stand, riseAt: 0, riseKind: 'player' as const };
    expect(escortPose(e, 0).sinkPx).toBeCloseTo(ESCORT_SINK_PX);
    let min = 0;
    for (let t = 0; t <= ESCORT_RISE_MS; t += 5) min = Math.min(min, escortPose(e, t).sinkPx);
    expect(min).toBeLessThanOrEqual(-2); expect(min).toBeGreaterThanOrEqual(-4);
    expect(Math.abs(min)).toBeCloseTo(ESCORT_OVERSHOOT_PX, 0);
    expect(escortPose(e, ESCORT_RISE_MS + 1).sinkPx).toBe(0);
    const self = { ...stand, riseAt: 0, riseKind: 'self' as const };
    // 同じ時刻では、自力の方がまだ沈みが深い(ゆっくり戻る=尺2倍)
    expect(escortPose(self, ESCORT_RISE_MS * 0.3).sinkPx).toBeGreaterThan(escortPose(e, ESCORT_RISE_MS * 0.3).sinkPx);
    expect(escortPose(self, ESCORT_RISE_SELF_MS + 1).sinkPx).toBe(0);
  });
  it('起き上がり後の無敵の間は点滅し、振れ幅は尺の終わりへ小さくなって止まる(パッと止めない)', () => {
    const e = { ...stand, riseAt: 0, riseKind: 'player' as const };
    const dip = (from: number, to: number) => { let m = 1; for (let t = from; t < to; t += 10) m = Math.min(m, escortPose(e, t).alphaMul); return m; };
    expect(dip(0, 400)).toBeLessThan(0.6);
    expect(dip(1500, ESCORT_BLINK_MS)).toBeGreaterThan(dip(0, 400));
    expect(escortPose(e, ESCORT_BLINK_MS + 10).alphaMul).toBe(1);
  });
  it('被弾の白フラッシュは敵と同じ強さ(1.0)で短く、減衰して0になる', () => {
    const e = { ...stand, lastHitAt: 500 };
    expect(ESCORT_FLASH_ALPHA).toBe(1);
    expect(escortPose(e, 500).flash).toBeGreaterThan(0.9);
    expect(escortPose(e, 500 + ESCORT_FLASH_MS / 2).flash).toBeLessThan(escortPose(e, 500).flash);
    expect(escortPose(e, 500 + ESCORT_FLASH_MS).flash).toBe(0);
  });
});

describe('攻撃を受けた直後のしゃがみ(社長指示2026-10-08)', () => {
  const st = { maxHealth: 100 } as const;
  it('受けてから ESCORT_HIT_CROUCH_MS の間だけしゃがむ。倒れている間・体力なしはしゃがまない', () => {
    expect(escortPose({ ...st, lastHitAt: 1000 }, 1000).hitCrouch).toBe(true);
    expect(escortPose({ ...st, lastHitAt: 1000 }, 1000 + ESCORT_HIT_CROUCH_MS - 1).hitCrouch).toBe(true);
    expect(escortPose({ ...st, lastHitAt: 1000 }, 1000 + ESCORT_HIT_CROUCH_MS).hitCrouch).toBe(false);
    expect(escortPose({ ...st, lastHitAt: 1000, downedAt: 1000 }, 1100).hitCrouch).toBe(false);
    expect(escortPose({ lastHitAt: 1000 }, 1100).hitCrouch).toBe(false);
  });
});

describe('escortBarWant: 体力の線の出し方', () => {
  const base = { maxHealth: 100, health: 100 } as const;
  it('被弾で出て、数秒でフェードして消える', () => {
    const e = { ...base, health: 70, lastHitAt: 1000 };
    expect(escortBarWant(e, 1000)).toBe(1);
    expect(escortBarWant(e, 1000 + ESCORT_BAR_SHOW_MS - 1)).toBe(1);
    const mid = escortBarWant(e, 1000 + ESCORT_BAR_SHOW_MS + ESCORT_BAR_FADE_MS / 2);
    expect(mid).toBeGreaterThan(0.3); expect(mid).toBeLessThan(0.7);
    expect(escortBarWant(e, 1000 + ESCORT_BAR_SHOW_MS + ESCORT_BAR_FADE_MS + 1)).toBe(0);
  });
  it('半分以下は消えない / 倒れている間は常設 / 無傷で何も無ければ出ない', () => {
    expect(escortBarWant({ ...base, health: 49, lastHitAt: 0 }, 1e6)).toBe(1);
    // ちょうど50%(起き上がりの体力)は常設に入れない=起きた全員が線を背負い続けない
    expect(escortBarWant({ ...base, health: 50, lastHitAt: 0 }, 1e6)).toBe(0);
    expect(escortBarWant({ ...base, health: 51, lastHitAt: 0 }, 1e6)).toBe(0);
    expect(escortBarWant({ ...base, health: 0, downedAt: 0 }, 1e6)).toBe(1);
    expect(escortBarWant(base, 1e6)).toBe(0);
  });
  it('全快(拠点確保)・起き上がり直後にも出る。体力なし(M0)は出ない', () => {
    expect(escortBarWant({ ...base, healedAt: 100 }, 200)).toBe(1);
    expect(escortBarWant({ ...base, health: 60, riseAt: 100 }, 200)).toBe(1);
    expect(escortBarWant({ health: 3, lastHitAt: 0 }, 1)).toBe(0);
  });
  it('ついてくる間の回復中は出たまま(healingAt が毎フレーム更新)・止まると消えていく', () => {
    expect(escortBarWant({ ...base, health: 80, healingAt: 1000 }, 1000)).toBe(1);
    expect(escortBarWant({ ...base, health: 80, healingAt: 1000 }, 1000 + ESCORT_BAR_HEAL_SHOW_MS + ESCORT_BAR_FADE_MS + 1)).toBe(0);
  });
});

describe('escortVisual: 点・印', () => {
  it('倒れた印の点(と画面端の印)は 0.5〜1.0 でゆっくり明滅(周期は体の呼吸と同じ)', () => {
    let lo = 1, hi = 0;
    for (let t = 0; t < 5000; t += 20) { const a = escortDownDotAlpha(0, t); lo = Math.min(lo, a); hi = Math.max(hi, a); }
    expect(lo).toBeGreaterThanOrEqual(0.5 - 1e-9); expect(hi).toBeLessThanOrEqual(1 + 1e-9);
    expect(hi - lo).toBeGreaterThan(0.45);
    // 周期=ESCORT_DOWN_PULSE_MS(1周期後に同じ値)・ハンターの印(約1.4秒)より遅い
    expect(escortDownDotAlpha(0, 700)).toBeCloseTo(escortDownDotAlpha(0, 700 + ESCORT_DOWN_PULSE_MS));
    expect(ESCORT_DOWN_PULSE_MS).toBeGreaterThan(1400 * 1.5);
  });
  it('点と呼吸は同じ位相: 倒れた瞬間から同時に動き出す(体の呼吸の山=点の山)', () => {
    const e = { ...stand, downedAt: 0 };
    const t = ESCORT_FALL_MS * 3 + 0; // downK=1
    const breath = (x: number) => ESCORT_SINK_PX - escortPose(e, x).sinkPx; // 浮いた量
    // 点が最大の時(半周期)に体が最も浮く
    const half = ESCORT_DOWN_PULSE_MS / 2;
    expect(breath(half + ESCORT_DOWN_PULSE_MS)).toBeGreaterThan(breath(t));
    expect(escortDownDotAlpha(0, half)).toBeCloseTo(1);
    expect(breath(half)).toBeCloseTo(ESCORT_BREATH_BOB_PX);
  });
  it('縁取りの灯り: 半径内=1 / 離れていて進みが無ければ0 / 離れていても進みが残る間だけ薄く', () => {
    expect(escortReviveLitTarget({ reviveNear: true, reviveMs: 0 })).toBe(1);
    expect(escortReviveLitTarget({ reviveNear: false, reviveMs: 0 })).toBe(0);
    const p = escortReviveLitTarget({ reviveNear: false, reviveMs: 1000 });
    expect(p).toBeGreaterThan(0); expect(p).toBeLessThan(0.5);
  });
});
