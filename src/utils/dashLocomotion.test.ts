import { describe, it, expect } from 'vitest';
import { emptyDashState, dashStateOf, dashModeAt, dashOverride, dashStep } from './dashLocomotion';

// research/GHOST_PARITY_LEDGER.md 裁定2(刀/ワイヤー=共有方式)の共通部品。
// 不変条件として固定するのは「movePlayer にあった優先順位・速度・目標ベクトルが変わっていないこと」。

describe('dashLocomotion', () => {
  it('初期状態は全ゼロ・モードなし', () => {
    const st = emptyDashState();
    expect(dashModeAt(st, 1000)).toBeNull();
    expect(st.wireAnchored).toBe(false);
    expect(st.wireStuckEnemyId).toBe('');
  });

  it('undefined(まだ一度も使っていない守護霊)は全ゼロへフォールバックする', () => {
    expect(dashStateOf(undefined)).toEqual(emptyDashState());
    const st = { ...emptyDashState(), wireDashUntil: 5 };
    expect(dashStateOf(st)).toBe(st); // 既にある状態はコピーせずそのまま(毎フレーム呼ぶので割当を作らない)
  });

  it('優先順位は wireDash > wireHop > katanaDash > katanaRecovery(movePlayerと同一)', () => {
    const all = {
      ...emptyDashState(),
      wireDashUntil: 100, wireHopUntil: 100, katanaDashUntil: 100, katanaRecoveryUntil: 100,
    };
    expect(dashModeAt(all, 0)).toBe('wire-dash');
    expect(dashModeAt({ ...all, wireDashUntil: 0 }, 0)).toBe('wire-hop');
    expect(dashModeAt({ ...all, wireDashUntil: 0, wireHopUntil: 0 }, 0)).toBe('katana-dash');
    expect(dashModeAt({ ...all, wireDashUntil: 0, wireHopUntil: 0, katanaDashUntil: 0 }, 0)).toBe('katana-recovery');
    // 全部過去 = 上書きなし
    expect(dashModeAt(all, 100)).toBeNull();
  });

  it('ワイヤー高速移動はアンカー地点へのホーミング(毎フレーム向け直す)', () => {
    const st = { ...emptyDashState(), wireDashUntil: 100, wireDashSpeed: 900, wireAnchorX: 300, wireAnchorY: 100 };
    const o = dashOverride(st, 'wire-dash', 100, 100, 855);
    expect(o.speed).toBe(900);
    expect(o.tx).toBe(200);
    expect(o.ty).toBe(0);
  });

  it('ホップは着地点へのホーミング/一閃は固定方向/着地硬直は停止', () => {
    const st = {
      ...emptyDashState(),
      wireHopSpeed: 500, wireHopTargetX: 10, wireHopTargetY: 40,
      katanaDashDirX: 0.6, katanaDashDirY: -0.8,
    };
    const hop = dashOverride(st, 'wire-hop', 10, 10, 855);
    expect(hop).toEqual({ speed: 500, tx: 0, ty: 30 });
    const dash = dashOverride(st, 'katana-dash', 10, 10, 855);
    expect(dash).toEqual({ speed: 855, tx: 0.6, ty: -0.8 });
    const rec = dashOverride(st, 'katana-recovery', 10, 10, 855);
    expect(rec).toEqual({ speed: 0, tx: 0, ty: 0 });
  });

  it('dashStep は「正規化した目標 × 速度 × dt」(プレイヤーの慣性tau=0と同値)', () => {
    const step = dashStep({ speed: 100, tx: 0, ty: 5 }, 0.5);
    expect(step.dx).toBeCloseTo(0);
    expect(step.dy).toBeCloseTo(50);
    // 目標ゼロ(着地硬直)は動かない
    expect(dashStep({ speed: 0, tx: 0, ty: 0 }, 0.5)).toEqual({ dx: 0, dy: 0 });
  });

  it('一閃の移動距離は KATANA_DASH_DISTANCE / KATANA_DASH_MS で 154px/180ms 相当', () => {
    const katanaDashSpeed = 154 / (180 / 1000);
    const st = { ...emptyDashState(), katanaDashDirX: 1, katanaDashDirY: 0 };
    const o = dashOverride(st, 'katana-dash', 0, 0, katanaDashSpeed);
    const total = dashStep(o, 0.18); // 180ms ぶん
    expect(total.dx).toBeCloseTo(154, 6);
  });
});
