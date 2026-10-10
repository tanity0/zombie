import { describe, it, expect } from 'vitest';
import type { EscortSoldier } from '../types/game';
import {
  applyEscortHit, stepEscortVitals, escortSlidePosition, escortMaxHealthFor, syncEscortMaxHealth, escortCenter, escortHitbox, escortBodyRect,
  isEscortDowned, isEscortLowHealth, isEscortInvulnerable, canEscortBeHit, isEscortTargetableBody, healEscortFull, escortAdvanceSlowMult,
  escortReviveProgress, clearEscortSlide,
  ESCORT_HP_RATIO, ESCORT_HIT_INVULN_MS, ESCORT_HIT_FIRE_HOLD_MS, ESCORT_REVIVE_RADIUS_PX, ESCORT_REVIVE_NEED_MS, ESCORT_REVIVE_DECAY,
  ESCORT_REVIVE_HEAL_RATIO, ESCORT_SELF_REVIVE_MS, ESCORT_REVIVE_INVULN_MS, ESCORT_LOW_HP_RATIO, ESCORT_SELF_REVIVE_SLOW_MS,
  ESCORT_SELF_REVIVE_SPEED_MULT, ESCORT_KNOCKBACK_PX, ESCORT_DOWN_SLIDE_PX, ESCORT_BODY_SIZE, ESCORT_RETREAT_SPEED_MULT,
} from './escortHealth';

const mk = (over: Partial<EscortSoldier> = {}): EscortSoldier => ({
  id: 'escort-0', baseId: 'base-0', x: 100, y: 200, face: 1, soldierIndex: 0, fireAt: 0, dwellMs: 0,
  health: 72, maxHealth: 72, ...over,
});

describe('体力(§3)', () => {
  it('最大体力=出撃時のプレイヤー最大体力×0.6(四捨五入・最低1)', () => {
    expect(ESCORT_HP_RATIO).toBe(0.6);
    expect(escortMaxHealthFor(120)).toBe(72);
    expect(escortMaxHealthFor(100)).toBe(60);
    expect(escortMaxHealthFor(1)).toBe(1);
    expect(escortMaxHealthFor(0)).toBe(1);
  });
  it('出撃中もプレイヤーの最大体力の伸びに比例する(上がった分は今の体力にも足す・倒れ中は0のまま・下がれば収める)', () => {
    const e = mk({ health: 40, maxHealth: 60 });
    const up = syncEscortMaxHealth(e, 150); // 60→90
    expect(up.maxHealth).toBe(90); expect(up.health).toBe(70);
    expect(syncEscortMaxHealth(e, 100)).toBe(e); // 変化なし=同じ参照
    const down = syncEscortMaxHealth(mk({ health: 60, maxHealth: 60 }), 50); // 60→30
    expect(down.maxHealth).toBe(30); expect(down.health).toBe(30);
    const dn = syncEscortMaxHealth(mk({ health: 0, maxHealth: 60, downedAt: 5 }), 150);
    expect(dn.maxHealth).toBe(90); expect(dn.health).toBe(0);
    const m0 = mk({ health: undefined, maxHealth: undefined });
    expect(syncEscortMaxHealth(m0, 150)).toBe(m0);
  });
  it('M0の随行(maxHealthなし)は体力なし=被弾しない・狙われない(従来どおり)', () => {
    const m0 = mk({ health: undefined, maxHealth: undefined });
    expect(canEscortBeHit(m0, 0)).toBe(false);
    expect(isEscortTargetableBody(m0)).toBe(false);
    const r = applyEscortHit(m0, 50, 1000, 0, 0);
    expect(r.dealt).toBe(0);
    expect(r.next).toBe(m0);
  });
});

describe('被弾(§3・§7)', () => {
  it('被弾で体力が減り、被弾後1秒は無敵(連続ヒットで溶けない)', () => {
    const e = mk();
    const r1 = applyEscortHit(e, 20, 1000, 0, 0);
    expect(r1.dealt).toBe(20);
    expect(r1.next.health).toBe(52);
    expect(ESCORT_HIT_INVULN_MS).toBe(1000);
    expect(isEscortInvulnerable(r1.next, 1999)).toBe(true);
    const r2 = applyEscortHit(r1.next, 20, 1999, 0, 0);
    expect(r2.dealt).toBe(0);
    expect(r2.next.health).toBe(52);
    const r3 = applyEscortHit(r1.next, 20, 2000, 0, 0);
    expect(r3.dealt).toBe(20);
    expect(r3.next.health).toBe(32);
  });
  it('被弾で射撃が300ms止まり、被弾源から離れる向きへ滑る(ease-out)', () => {
    const e = mk();
    // 源=軍人の左(体の中心 (100,186) の左200px) → 右へ滑る
    const r = applyEscortHit(e, 10, 5000, -100, 186);
    expect(r.next.fireHoldUntil).toBe(5000 + ESCORT_HIT_FIRE_HOLD_MS);
    expect(ESCORT_HIT_FIRE_HOLD_MS).toBe(300);
    expect(r.next.lastHitAt).toBe(5000);
    expect(r.next.lastHitDirX).toBeCloseTo(1, 6);
    expect(r.next.slideToX).toBeCloseTo(100 + ESCORT_KNOCKBACK_PX, 6);
    const p0 = escortSlidePosition(r.next, 5000)!;
    const pMid = escortSlidePosition(r.next, 5000 + (r.next.slideUntil! - 5000) / 2)!;
    const pEnd = escortSlidePosition(r.next, r.next.slideUntil! - 1)!;
    expect(p0.x).toBeCloseTo(100, 6);
    // ease-out: 半分の時間で半分より先へ進んでいる(出だしが速く終わりがゆるい=慣性)
    expect(pMid.x - 100).toBeGreaterThan(ESCORT_KNOCKBACK_PX / 2);
    expect(pEnd.x).toBeGreaterThan(pMid.x);
    expect(escortSlidePosition(r.next, r.next.slideUntil!)).toBeNull();
  });
  it('被弾源が無い(位置なし)時は滑らない', () => {
    const r = applyEscortHit(mk(), 10, 0);
    expect(r.next.slideUntil).toBeUndefined();
    expect(r.next.health).toBe(62);
  });
  it('源と重なっている時は後ろ(上)へ滑る', () => {
    const c = escortCenter(mk());
    const r = applyEscortHit(mk(), 10, 0, c.x, c.y);
    expect(r.next.slideToY).toBeLessThan(200);
  });
  it('体力が尽きたら倒れる(死なない)=downedAt・進みは0・大きめの滑り', () => {
    const r = applyEscortHit(mk({ health: 5 }), 30, 7000, 0, 186);
    expect(r.downedNow).toBe(true);
    expect(r.dealt).toBe(5); // 実際に減った量(体力を超えない)
    expect(r.next.health).toBe(0);
    expect(isEscortDowned(r.next)).toBe(true);
    expect(r.next.downedAt).toBe(7000);
    expect(r.next.reviveMs).toBe(0);
    expect(r.next.slideToX! - 100).toBeCloseTo(ESCORT_DOWN_SLIDE_PX, 6);
    expect(ESCORT_DOWN_SLIDE_PX).toBeGreaterThan(ESCORT_KNOCKBACK_PX); // 倒れる滑りは被弾より大きい
  });
  it('倒れている間は当たらない(技も当たらない)', () => {
    const d = applyEscortHit(mk({ health: 1 }), 5, 0, 0, 0).next;
    expect(canEscortBeHit(d, 99999)).toBe(false);
    expect(applyEscortHit(d, 50, 99999, 0, 0).dealt).toBe(0);
  });
  it('当たり箱はプレイヤーと同じ(体28の2/3)・足元から上に立つ', () => {
    const e = mk({ x: 100, y: 200 });
    expect(escortCenter(e)).toEqual({ x: 100, y: 200 - ESCORT_BODY_SIZE / 2 });
    const hb = escortHitbox(e);
    expect(hb.width).toBeCloseTo(ESCORT_BODY_SIZE * 2 / 3, 6);
    expect(hb.x + hb.width / 2).toBeCloseTo(100, 6);
    expect(hb.y + hb.height / 2).toBeCloseTo(200 - ESCORT_BODY_SIZE / 2, 6);
    const body = escortBodyRect(e);
    expect(body.y + body.height).toBe(200); // 足元
  });
  it('clearEscortSlide は滑りのフィールドだけ落とす', () => {
    const r = applyEscortHit(mk(), 10, 0, -100, 186).next;
    const c = clearEscortSlide(r);
    expect(c.slideUntil).toBeUndefined();
    expect(c.health).toBe(r.health);
  });
});

describe('倒れる→起こす(§6・§13b)', () => {
  const downed = (over: Partial<EscortSoldier> = {}): EscortSoldier => mk({ health: 0, downedAt: 1000, reviveMs: 0, ...over });
  const near = { playerX: 100, playerY: 186 };
  const far = { playerX: 1000, playerY: 186 };

  it('定数: 90px/2秒/離れると1秒で0.5秒/体力50%/自然に30秒/起き上がり後2秒無敵', () => {
    expect(ESCORT_REVIVE_RADIUS_PX).toBe(90);
    expect(ESCORT_REVIVE_NEED_MS).toBe(2000);
    expect(ESCORT_REVIVE_DECAY).toBe(0.5);
    expect(ESCORT_REVIVE_HEAL_RATIO).toBe(0.5);
    expect(ESCORT_SELF_REVIVE_MS).toBe(30000);
    expect(ESCORT_REVIVE_INVULN_MS).toBe(2000);
  });
  it('プレイヤーが90px以内に2秒居ると起き上がる(体力50%・2秒無敵・起こされた扱い)', () => {
    let e = downed();
    let t = 1000;
    let event: string | undefined;
    for (let i = 0; i < 200 && !event; i++) {
      t += 16.7;
      const r = stepEscortVitals(e, { now: t, dtSec: 0.0167, ...near });
      e = r.next; event = r.event;
    }
    expect(event).toBe('revived');
    expect(t - 1000).toBeGreaterThanOrEqual(1990);
    expect(t - 1000).toBeLessThan(2100);
    expect(isEscortDowned(e)).toBe(false);
    expect(e.health).toBe(36); // 72×50%
    expect(e.invulnUntil).toBe(t + ESCORT_REVIVE_INVULN_MS);
    expect(e.riseKind).toBe('player');
    expect(e.riseAt).toBe(t);
    expect(e.slowUntil).toBeUndefined(); // 起こされた時は通常の速さ
  });
  it('半径の外では進まず、離れると1秒で0.5秒ぶん戻る', () => {
    let e = downed({ reviveMs: 1000 });
    e = stepEscortVitals(e, { now: 1100, dtSec: 1, ...far }).next;
    expect(e.reviveMs).toBeCloseTo(500, 6);
    e = stepEscortVitals(e, { now: 1200, dtSec: 5, ...far }).next;
    expect(e.reviveMs).toBe(0);
  });
  it('半径に入った瞬間だけ軍人がプレイヤーの方を向く(縁取りが灯る)', () => {
    const e = downed({ face: 1, reviveNear: false });
    const r = stepEscortVitals(e, { now: 1100, dtSec: 0.016, playerX: 50, playerY: 186 }); // 左側
    expect(r.faceToPlayerNow).toBe(true);
    expect(r.next.face).toBe(-1);
    expect(r.next.reviveNear).toBe(true);
    // 入ったままなら向きは触らない
    const r2 = stepEscortVitals({ ...r.next, face: 1 }, { now: 1200, dtSec: 0.016, playerX: 50, playerY: 186 });
    expect(r2.faceToPlayerNow).toBe(false);
    expect(r2.next.face).toBe(1);
    // 出たら灯りが消える
    const r3 = stepEscortVitals(r2.next, { now: 1300, dtSec: 0.016, ...far });
    expect(r3.next.reviveNear).toBe(false);
  });
  it('誰も起こさなくても30秒で自然に起きる(画面外=プレイヤーが遠くても)・自力は前進×0.5を4秒', () => {
    const e = downed({ downedAt: 1000 });
    const before = stepEscortVitals(e, { now: 1000 + ESCORT_SELF_REVIVE_MS - 1, dtSec: 0.016, ...far });
    expect(isEscortDowned(before.next)).toBe(true);
    const r = stepEscortVitals(e, { now: 1000 + ESCORT_SELF_REVIVE_MS, dtSec: 0.016, ...far });
    expect(r.event).toBe('selfRevived');
    expect(isEscortDowned(r.next)).toBe(false);
    expect(r.next.health).toBe(36);
    expect(r.next.riseKind).toBe('self');
    expect(r.next.invulnUntil).toBe(1000 + ESCORT_SELF_REVIVE_MS + ESCORT_REVIVE_INVULN_MS);
    const t = 1000 + ESCORT_SELF_REVIVE_MS;
    expect(ESCORT_SELF_REVIVE_SLOW_MS).toBe(4000);
    expect(ESCORT_SELF_REVIVE_SPEED_MULT).toBe(0.5);
    expect(escortAdvanceSlowMult(r.next, t + 3999)).toBe(0.5);
    expect(escortAdvanceSlowMult(r.next, t + 4000)).toBe(1);
  });
  it('起こされた直後に2秒無敵=囲まれたまま起きて即また倒れない', () => {
    const e = stepEscortVitals(downed({ reviveMs: 1999 }), { now: 5000, dtSec: 0.1, ...near }).next;
    expect(isEscortDowned(e)).toBe(false);
    expect(applyEscortHit(e, 99, 5001, 0, 0).dealt).toBe(0);
    expect(applyEscortHit(e, 99, 5000 + ESCORT_REVIVE_INVULN_MS, 0, 0).dealt).toBeGreaterThan(0);
  });
  it('立っている軍人・体力なしの軍人の時計は何も起きない(同一参照)', () => {
    const s = mk();
    expect(stepEscortVitals(s, { now: 0, dtSec: 1, ...near }).next).toBe(s);
    const m0 = mk({ maxHealth: undefined, health: undefined });
    expect(stepEscortVitals(m0, { now: 0, dtSec: 1, ...near }).next).toBe(m0);
  });
  it('起こす進み具合は0..1', () => {
    expect(escortReviveProgress(downed({ reviveMs: 1000 }))).toBeCloseTo(0.5, 6);
    expect(escortReviveProgress(downed({ reviveMs: 99999 }))).toBe(1);
    expect(escortReviveProgress(mk())).toBe(0);
  });
});

describe('瀕死・全快(§13b)', () => {
  it('体力が最大の30%未満で瀕死(倒れていない時だけ)・後ずさりの速さは既存の「後方」70%', () => {
    expect(ESCORT_LOW_HP_RATIO).toBe(0.3);
    expect(ESCORT_RETREAT_SPEED_MULT).toBe(0.7);
    expect(isEscortLowHealth(mk({ health: 21 }))).toBe(true);   // 72×0.3=21.6
    expect(isEscortLowHealth(mk({ health: 22 }))).toBe(false);
    expect(isEscortLowHealth(mk({ health: 0, downedAt: 0 }))).toBe(false);
    expect(isEscortLowHealth(mk({ maxHealth: undefined, health: undefined }))).toBe(false);
  });
  it('担当拠点の確保で全快(healedAt が起点)・倒れている軍人は対象外', () => {
    const h = healEscortFull(mk({ health: 10 }), 4000);
    expect(h.health).toBe(72);
    expect(h.healedAt).toBe(4000);
    const full = mk();
    expect(healEscortFull(full, 4000)).toBe(full);
    const d = mk({ health: 0, downedAt: 0 });
    expect(healEscortFull(d, 4000)).toBe(d);
  });
});
