// 技に入る前のためらい(research/ENEMY_HESITATION.md)の純関数: 抽選・動きの1歩・打ち切り・hesOwed。
import { describe, it, expect } from 'vitest';
import {
  rollHesitation, hesitationActive, hesitationInterrupted, hesitationVelocity,
  HES_CLEAR, HES_TECHNIQUE_PATCH, HES_STRAFE_PX, HES_BACKSTEP_PX, HES_STRAFE_SPEED_CAP, HES_BACKSTEP_SPEED_CAP,
  HES_BOSS_ROLL_RANGE_PX, type RollInput, type HesFields,
} from './enemyHesitation';
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';

const seq = (...vals: number[]) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };
const base = (over: Partial<RollInput> = {}): RollInput => ({
  type: 'pumpkin', owed: false, gameTime: 10_000, nowMs: 1_700_000_000_000,
  ecx: 0, ecy: 0, tx: 100, ty: 0, baseSpeed: 100, rand: seq(0), enabled: true, demo: false, ...over,
});

/** 1歩ずつ積分して、ためらい1回ぶんの移動量を測る。 */
const integrate = (h: HesFields, dtMs = 10) => {
  let x = 0, y = 0, vx = 0, vy = 0;
  for (let t = h.hesStartAt!; t < h.hesUntil!; t += dtMs) {
    const v = hesitationVelocity(h, t, vx, vy, dtMs / 1000);
    vx = v.vx; vy = v.vy; x += vx * dtMs / 1000; y += vy * dtMs / 1000;
  }
  return { x, y, vx, vy };
};

describe('rollHesitation(抽選)', () => {
  it('叩き台の割合: attack 55% / strafe 20% / watch 12% / backstep 13%(約45%でためらう)', () => {
    const N = 2000;
    const count = { attack: 0, strafe: 0, watch: 0, backstep: 0 };
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N; // 種類を引く1本目を一様に掃く
      const r = rollHesitation(base({ rand: seq(u, 0.5, 0.5, 0.5) }));
      count[r ? r.hesKind! : 'attack']++;
    }
    expect(count.attack / N).toBeCloseTo(0.55, 2);
    expect(count.strafe / N).toBeCloseTo(0.20, 2);
    expect(count.watch / N).toBeCloseTo(0.12, 2);
    expect(count.backstep / N).toBeCloseTo(0.13, 2);
  });
  it('2回続けて迷わない: 印(hesOwed)があれば必ず技(null)', () => {
    expect(rollHesitation(base({ owed: true, rand: seq(0.99) }))).toBeNull();
    expect(rollHesitation(base({ owed: true, rand: seq(0.99), demo: true }))).toBeNull();
  });
  it('ためらうと印を立てる(次は必ず技)', () => {
    const r = rollHesitation(base({ rand: seq(0.99, 0.5, 0.5) }))!;
    expect(r.hesOwed).toBe(true);
    expect(r.hesStartAt).toBe(10_000);
    expect(r.hesStartNow).toBe(1_700_000_000_000);
  });
  it('雑魚・対象外の型は1bitも変わらない(常に null)', () => {
    for (const type of ['zombie', 'bat', 'skeleton', 'werewolf', 'thor', 'idol', 'reaper', 'bounty-ranged'] as const) {
      expect(rollHesitation(base({ type, rand: seq(0.99, 0.5, 0.5, 0.5), demo: true }))).toBeNull();
    }
  });
  it('?hes=0 相当(enabled=false)なら抽選しない', () => {
    expect(rollHesitation(base({ enabled: false, rand: seq(0.99), demo: true }))).toBeNull();
  });
  it('?hesdemo=1 相当: 1本目がどこでも必ずためらう(割合の比は保つ)', () => {
    for (const u of [0, 0.3, 0.5, 0.99]) expect(rollHesitation(base({ demo: true, rand: seq(u, 0.5, 0.5) }))).not.toBeNull();
    expect(rollHesitation(base({ demo: true, rand: seq(0.1) }))!.hesKind).toBe('strafe');
    expect(rollHesitation(base({ demo: true, rand: seq(0.5) }))!.hesKind).toBe('watch');
    expect(rollHesitation(base({ demo: true, rand: seq(0.9) }))!.hesKind).toBe('backstep');
  });
  it('B のボスは固定の距離より遠いと抽選しない', () => {
    const r = HES_BOSS_ROLL_RANGE_PX.mimir!;
    expect(rollHesitation(base({ type: 'mimir', bossDist: r + 1, demo: true, rand: seq(0.1) }))).toBeNull();
    expect(rollHesitation(base({ type: 'mimir', bossDist: r, demo: true, rand: seq(0.1, 0.5, 0.5, 0.5) }))).not.toBeNull();
  });
  it('長さは叩き台の範囲(strafe 500〜1200 / watch 300〜800 / backstep 250〜400)', () => {
    const d = (u0: number, u1: number) => { const r = rollHesitation(base({ demo: true, rand: seq(u0, u1, 0.5, 0.5) }))!; return r.hesUntil! - r.hesStartAt!; };
    expect(d(0.1, 0)).toBe(500); expect(d(0.1, 1)).toBe(1200);
    expect(d(0.5, 0)).toBe(300); expect(d(0.5, 1)).toBe(800);
    expect(d(0.9, 0)).toBe(250); expect(d(0.9, 1)).toBe(400);
  });
});

describe('動きの1歩(慣性つき・量で決める)', () => {
  it('旋回: 40〜90px を動き、始めと終わりの速さはほぼ0(ease-in/ease-out)・向きは相手に対して横', () => {
    const h = rollHesitation(base({ demo: true, baseSpeed: 1000, rand: seq(0.1, 0.5, 1, 0.2) }))!; // 量=90px
    expect(h.hesKind).toBe('strafe');
    // 相手は +x。接線は y 方向。
    expect(Math.abs(h.hesDirX!)).toBeLessThan(1e-9);
    const first = hesitationVelocity(h, h.hesStartAt!, 0, 0, 0.01);
    expect(Math.hypot(first.vx, first.vy)).toBeLessThan(1);
    const m = integrate(h);
    expect(Math.hypot(m.x, m.y)).toBeGreaterThan(HES_STRAFE_PX[1] * 0.85);
    expect(Math.hypot(m.x, m.y)).toBeLessThan(HES_STRAFE_PX[1] * 1.05);
    expect(Math.abs(m.x)).toBeLessThan(1e-6); // 相手へ寄らない
    expect(Math.hypot(m.vx, m.vy)).toBeLessThan(h.hesPeak! * 0.2); // 止まりかけで終わる
  });
  it('遅い敵は時間を延ばさず量が減る(素の速さ×1.2 が上限)', () => {
    const h = rollHesitation(base({ demo: true, baseSpeed: 30, rand: seq(0.1, 0, 1, 0.2) }))!; // 500ms で 90px は無理
    expect(h.hesPeak).toBeCloseTo(30 * HES_STRAFE_SPEED_CAP, 6);
    expect(h.hesUntil! - h.hesStartAt!).toBe(500);
  });
  it('後退: 相手から離れる向きに 30〜50px・上限は素の速さ×1.5', () => {
    const h = rollHesitation(base({ demo: true, baseSpeed: 1000, rand: seq(0.9, 0.5, 0) }))!; // 量=30px
    expect(h.hesKind).toBe('backstep');
    expect(h.hesDirX).toBeCloseTo(-1, 9);
    const m = integrate(h, 5);
    expect(m.x).toBeLessThan(-HES_BACKSTEP_PX[0] * 0.8);
    expect(m.x).toBeGreaterThan(-HES_BACKSTEP_PX[0] * 1.1);
    const slow = rollHesitation(base({ demo: true, baseSpeed: 20, rand: seq(0.9, 0, 1) }))!;
    expect(slow.hesPeak).toBeCloseTo(20 * HES_BACKSTEP_SPEED_CAP, 6);
  });
  it('様子見: 入る前の速さから慣性で止まる(パッと止まらない)', () => {
    const h = rollHesitation(base({ demo: true, rand: seq(0.5, 1) }))!;
    expect(h.hesKind).toBe('watch');
    const v1 = hesitationVelocity(h, h.hesStartAt! + 10, 100, 0, 0.01);
    expect(v1.vx).toBeGreaterThan(80); // 1フレームで0にしない
    expect(v1.vx).toBeLessThan(100);
    const m = integrate({ ...h }, 10);
    expect(Math.hypot(m.vx, m.vy)).toBeLessThan(1e-6);
  });
  it('旋回の左右: 接線が上下向きの時は上(奥=y が減る)へ向かわない方を選ぶ', () => {
    // 相手が真横(+x)→ 接線は ±y。乱数がどちらでも下(y+)。
    for (const side of [0.1, 0.9]) {
      const h = rollHesitation(base({ demo: true, rand: seq(0.1, 0.5, 0.5, side) }))!;
      expect(h.hesDirY!).toBeGreaterThan(0.99);
    }
    // 相手が真下(+y)→ 接線は ±x。左右は乱数。
    const l = rollHesitation(base({ demo: true, tx: 0, ty: 100, rand: seq(0.1, 0.5, 0.5, 0.1) }))!;
    const r = rollHesitation(base({ demo: true, tx: 0, ty: 100, rand: seq(0.1, 0.5, 0.5, 0.9) }))!;
    expect(Math.sign(l.hesDirX!)).toBe(-Math.sign(r.hesDirX!));
    expect(Math.abs(l.hesDirY!)).toBeLessThan(1e-9);
  });
  it('旋回・後退で動ける範囲の外へ出ない(移動先を clampRectToPlayableArea に通せば帯の内側)', () => {
    // 回廊(帯の上端が決まっている)で、帯の上端の際から上へ下がる後退を積分しても帯の外へ出ない。
    const ctx: PlayableAreaCtx = { farBackdrop: 'forest', labTheme: true, corridorMode: false, m0AdvanceLimitX: null, corridorRunInActive: false };
    const probe = clampRectToPlayableArea(0, -100000, 40, 40, ctx, 0);
    const topY = probe.y; // 帯の上端(この幅の箱が置ける最上)
    const h = rollHesitation(base({ demo: true, ecx: 20, ecy: topY + 20, tx: 20, ty: topY + 120, baseSpeed: 1000, rand: seq(0.9, 1, 1) }))!;
    expect(h.hesDirY).toBeCloseTo(-1, 9); // 上(奥)へ下がる向き
    let x = 0, y = topY, vx = 0, vy = 0;
    for (let t = h.hesStartAt!; t < h.hesUntil!; t += 10) {
      const v = hesitationVelocity(h, t, vx, vy, 0.01);
      vx = v.vx; vy = v.vy;
      const p = clampRectToPlayableArea(x + vx * 0.01, y + vy * 0.01, 40, 40, ctx, x);
      x = p.x; y = p.y;
      expect(y).toBeGreaterThanOrEqual(topY - 1e-6);
    }
  });
});

describe('打ち切り・状態', () => {
  const h = { hesKind: 'strafe' as const, hesStartAt: 5000, hesUntil: 6000, hesStartNow: 9_000_000, hesOwed: true };
  it('hesitationActive は gameTime < hesUntil の間だけ', () => {
    expect(hesitationActive(h, 5999)).toBe(true);
    expect(hesitationActive(h, 6000)).toBe(false);
    expect(hesitationActive({ ...h, ...HES_CLEAR }, 5500)).toBe(false);
  });
  it('近接の被弾・カウンター・気絶・紫の気絶・浮き・押し道具で打ち切る(始まった後に書かれたものだけ)', () => {
    expect(hesitationInterrupted(h)).toBe(false);
    expect(hesitationInterrupted({ ...h, meleeHitAt: 5100 })).toBe(true);
    expect(hesitationInterrupted({ ...h, meleeHitAt: 4900 })).toBe(false);
    expect(hesitationInterrupted({ ...h, lastCounteredAt: 9_000_100 })).toBe(true);
    expect(hesitationInterrupted({ ...h, lastCounteredAt: 8_999_000 })).toBe(false);
    expect(hesitationInterrupted({ ...h, stunUntil: 7000 })).toBe(true);
    expect(hesitationInterrupted({ ...h, stunUntil: 4000 })).toBe(false);
    expect(hesitationInterrupted({ ...h, bossFullStunUntil: 7000 })).toBe(true);
    expect(hesitationInterrupted({ ...h, liftUntil: 9_000_500 })).toBe(true);
    expect(hesitationInterrupted({ ...h, knockbackShoveUntil: 9_000_500 })).toBe(true);
    expect(hesitationInterrupted({ ...h, knockbackShoveUntil: 8_999_000 })).toBe(false);
  });
  it('銃弾(銃の knockbackUntil/hitStunUntil)では打ち切らない', () => {
    const gunHit = { ...h, knockbackUntil: 9_000_300, hitStunUntil: 9_000_100, lastHit: 9_000_050 } as HesFields;
    expect(hesitationInterrupted(gunHit)).toBe(false);
  });
  it('打ち切り(HES_CLEAR)は印を残し、技に入る(HES_TECHNIQUE_PATCH)と印も消える', () => {
    expect({ ...h, ...HES_CLEAR }.hesOwed).toBe(true);
    expect({ ...h, ...HES_TECHNIQUE_PATCH }.hesOwed).toBeUndefined();
    expect({ ...h, ...HES_TECHNIQUE_PATCH }.hesKind).toBeUndefined();
  });
});
