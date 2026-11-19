// ★蹴り上げ・構えの技キャンセル・空中投げ(社長指示2026-11-19・research/BRAWLER.md §34)の純関数。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initialBrawlerState, brawlerStartTech, brawlerAfterResolve, brawlerKickUpSlot, brawlerKickUpInput, brawlerKickUpReady, brawlerKickUpCost,
  brawlerHeelCost, brawlerRouteAllows, brawlerRouteNodeOf, brawlerTechAllowed, brawlerTechCancelOk, brawlerHeelInput, brawlerGuardCancelOk,
  brawlerEndGuardForCancel, brawlerTechBufferDecision, brawlerThrowProgress, brawlerThrowMs, BRAWLER_THROW_SPEED, BRAWLER_THROW_ACCEL_FRAC,
  brawlerKickUpStandAt, brawlerStandAt, brawlerPoseAt, brawlerSuplexArch, brawlerFlickDirOf, BRAWLER_KICK3_CHARGE_MS, BRAWLER_TECHS,
  BRAWLER_KICK_HITSTOP_MS, BRAWLER_KICK_CHAIN_MS, BRAWLER_KICKUP_MULT, BRAWLER_HEEL_MULT, BRAWLER_SUPLEX_MULT, BRAWLER_TEMPO_DEFAULT,
  type BrawlerState,
} from './brawler';
import {
  setBrawlerTempoAll, brawlerJugglePush, brawlerJuggleHeightRel, brawlerJuggleTop, brawlerKickMoveKey, brawlerShiftLift,
  BRAWLER_GROUND_LAUNCH, BRAWLER_JUGGLE_PUSH, BRAWLER_JUGGLE_COST, BRAWLER_KICKUP_LIFT_K, BRAWLER_JUGGLE_BUDGET,
} from './brawlerCombo';
import { brawlerAirThrowGrabs, brawlerAirThrowMove } from './brawlerSkills';
import { BRAWLER_TECH_NAMES } from '../data/brawlerTechNames';
import {
  brawlerContactTarget, brawlerContactMode, brawlerStartContactGrab, brawlerFlipSpin, BRAWLER_CONTACT_PX, BRAWLER_CONTACT_GRAB_MS, BRAWLER_FLIPKICK_MS,
  isBrawlerGuardingAt, brawlerDistTo, BRAWLER_SUPLEX_RISE_MS, BRAWLER_SUPLEX_HOLD_MS, BRAWLER_SUPLEX_RETURN_MS, BRAWLER_SUPLEX_ARCH, BRAWLER_GRAB_LEAN,
  brawlerThrowSwing, BRAWLER_THROW_SWING_MS, BRAWLER_THROW_SETTLE_MS, brawlerGrabGlow, brawlerGrabZoom, BRAWLER_GRAB_ZOOM, BRAWLER_GRAB_MS,
  brawlerGuardCancelGlow, brawlerFlipArc, BRAWLER_FLIPKICK_APEX, brawlerSuplexSwing, brawlerSuplexLanding, BRAWLER_SUPLEX_SWING_LIFT_PX,
  brawlerHeelStandAt, brawlerKickUpSnap, brawlerThrowSpin, brawlerThrowSpinAtHit, BRAWLER_THROW_SPIN_TURNS, BRAWLER_KICKUP_ROT_PEAK, BRAWLER_KICKUP_ROT_UP, BRAWLER_KICKUP_ROT_DOWN, BRAWLER_HEEL_ROT_UP, BRAWLER_HEEL_ROT_DOWN,
} from './brawler';
import { spawnEnemyAt } from './enemyUtils';
import { playerSuperArmorActive } from './superArmor';
import type { Enemy } from '../types/game';

beforeAll(() => { setBrawlerTempoAll(1.3); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

/** n 発目の蹴りを出して判定を解いた状態(landed=当たった)。 */
const kickHit = (kickN: number, landed: boolean, base: BrawlerState = { ...initialBrawlerState(), points: 10 }, t0 = 1000, up = false) => {
  const a = brawlerStartTech(base, 'kick', t0, kickN, false, false, up);
  const at = t0 + a.windupMs;
  const r = brawlerAfterResolve(a, at, landed ? 1 : 0, { pointCap: 20, countPoint: false, hitstopMs: BRAWLER_KICK_HITSTOP_MS[kickN], landed: landed ? 1 : 0 });
  return { s: { ...r, kickCount: kickN >= 3 ? 0 : kickN, kickChainUntil: kickN >= 3 ? 0 : at + BRAWLER_KICK_CHAIN_MS }, at };
};

describe('§34-1・§34-8 蹴り上げの入力(2発目=空中蹴りの続きの上だけ)', () => {
  it('当たった2発目の後の上は、払えれば蹴り上げ(構えにならない)', () => {
    const { s, at } = kickHit(2, true);
    expect(brawlerKickUpInput(s, 'guard', at + 400, true)).toBe(true);
  });
  it('★§34-8: 1発目の後の上は構え(蹴り上げにならない)=最中も待機の連続の受付の内も', () => {
    const { s, at } = kickHit(1, true);
    expect(brawlerKickUpSlot(s, at + 400)).toBe(false);
    expect(brawlerKickUpInput(s, 'guard', at + 400, true)).toBe(false);
    expect(brawlerKickUpInput({ ...s, phase: 'idle', tech: null }, 'guard', at + 300, true)).toBe(false);
    const pre = brawlerStartTech({ ...initialBrawlerState(), points: 10 }, 'kick', 1000, 1);
    expect(brawlerKickUpInput(pre, 'guard', 1010, true)).toBe(false);
    expect(brawlerRouteAllows('kick1', 'kickup')).toBe(false);
  });
  it('外れた蹴りの後・払えない時の上は今までどおり構え(§34-6 #4)', () => {
    const miss = kickHit(2, false);
    expect(brawlerKickUpInput(miss.s, 'guard', miss.at + 400, true)).toBe(false);
    const hit = kickHit(2, true);
    expect(brawlerKickUpInput(hit.s, 'guard', hit.at + 400, false)).toBe(false);
  });
  it('判定の前(当たるかまだ分からない)は蹴り上げとして覚える=出す瞬間に見直す', () => {
    const a = brawlerStartTech({ ...initialBrawlerState(), points: 10 }, 'kick', 1000, 2);
    expect(brawlerKickUpInput(a, 'guard', 1010, false)).toBe(true);
    expect(brawlerKickUpReady(a, 1010, true)).toBe(false); // まだ当たっていない
  });
  it('待機で連続の受付の内(当たった2発目の後)も蹴り上げ。受付が切れたら構え', () => {
    const { s, at } = kickHit(2, true);
    const idle: BrawlerState = { ...s, phase: 'idle', tech: null };
    expect(brawlerKickUpInput(idle, 'guard', at + 300, true)).toBe(true);
    expect(brawlerKickUpInput(idle, 'guard', at + BRAWLER_KICK_CHAIN_MS + 1, true)).toBe(false);
  });
  it('上以外の入力・3発目・踵落とし・構えの最中は蹴り上げにならない', () => {
    const { s, at } = kickHit(2, true);
    expect(brawlerKickUpInput(s, 'kick', at + 400, true)).toBe(false);
    expect(brawlerKickUpSlot(kickHit(3, true).s, at + 400)).toBe(false);
    const heel = brawlerStartTech({ ...initialBrawlerState(), points: 10 }, 'kick', 1000, 3, false, true);
    expect(brawlerKickUpSlot(heel, 1010)).toBe(false);
    const g = brawlerStartTech({ ...initialBrawlerState(), points: 10 }, 'guard', 1000);
    expect(brawlerKickUpInput(g, 'guard', 1010, true)).toBe(false);
  });
  it('値段=踵落としと同じ(飛び蹴り+1・血の覚醒中は0)・威力も踵落としと同じ', () => {
    expect(brawlerKickUpCost()).toBe(brawlerHeelCost());
    expect(brawlerKickUpCost()).toBe(BRAWLER_TECHS.kick.cost + 1);
    expect(brawlerKickUpCost(true)).toBe(0);
    expect(BRAWLER_KICKUP_MULT).toBe(BRAWLER_HEEL_MULT);
    expect(BRAWLER_SUPLEX_MULT).toBeCloseTo(BRAWLER_HEEL_MULT * 1.5, 10);
  });
  it('出した蹴り上げ: 常に3発目の位置(踵落としと同じ)・踵落としと同じ溜め', () => {
    const u3 = brawlerStartTech(kickHit(2, true).s, 'kick', 2000, 3, false, false, true);
    expect(u3.kickUp).toBe(true);
    expect(u3.kickN).toBe(3);
    expect(u3.kickChargeMs).toBe(BRAWLER_KICK3_CHARGE_MS);
    expect(u3.windupMs).toBe(BRAWLER_TECHS.kick.windupMs + BRAWLER_KICK3_CHARGE_MS);
    expect(brawlerRouteNodeOf(u3)).toBe('kickup');
    // 1・2発目の位置では蹴り上げにならない
    expect(brawlerStartTech(initialBrawlerState(), 'kick', 2000, 1, false, false, true).kickUp).toBe(false);
    expect(brawlerStartTech(initialBrawlerState(), 'kick', 2000, 2, false, false, true).kickUp).toBe(false);
    expect(brawlerKickMoveKey(3, false, true)).toBe('kickup');
    expect(brawlerKickMoveKey(3, true, true)).toBe('heel');
  });
});

describe('§34-1・§34-8 蹴り上げの後の続き', () => {
  it('道: 2発目→蹴り上げ(1発目からは無い) / 蹴り上げ→気功だけ(次の蹴り・大踏み潰しは無い)', () => {
    expect(brawlerRouteAllows('kick1', 'kickup')).toBe(false);
    expect(brawlerRouteAllows('kick2', 'kickup')).toBe(true);
    expect(brawlerRouteAllows('idle', 'kickup')).toBe(false);
    expect(brawlerRouteAllows('kickup', 'kiko')).toBe(true);
    expect(brawlerRouteAllows('kickup', 'stomp')).toBe(false);
    expect(brawlerRouteAllows('kickup', 'kick3')).toBe(false);
  });
  it('蹴り上げで連続は終わる=次の蹴り・踵落とし・もう一度の蹴り上げは出ない・取り消せるのは気功だけ', () => {
    const a = brawlerStartTech(kickHit(2, true).s, 'kick', 2000, 3, false, false, true);
    const at = 2000 + a.windupMs;
    const r = { ...brawlerAfterResolve(a, at, 1, { pointCap: 20, countPoint: false, hitstopMs: BRAWLER_KICK_HITSTOP_MS[3], landed: 1 }), kickCount: 0, kickChainUntil: 0 };
    const t = at + BRAWLER_KICK_HITSTOP_MS[3] + 10;
    expect(brawlerTechAllowed(r, 'kick', t)).toBe(false);
    expect(brawlerKickUpSlot(r, t)).toBe(false);
    expect(brawlerHeelInput(r, 'stomp', t)).toBe(false);
    expect(brawlerTechCancelOk(r, 'kiko', t)).toBe(true);
    expect(brawlerTechCancelOk(r, 'stomp', t)).toBe(false);
  });
  it('掴んだ蹴り上げ(空中投げ・スープレックスへ移った)は締め=続きを持たない', () => {
    const a = brawlerStartTech(kickHit(2, true).s, 'kick', 2000, 3, false, false, true);
    const at = 2000 + a.windupMs;
    const r = { ...brawlerAfterResolve(a, at, 1, { pointCap: 20, countPoint: false, hitstopMs: BRAWLER_KICK_HITSTOP_MS[3], landed: 1 }), kickThrow: true, kickCount: 0, kickChainUntil: 0 };
    const t = at + BRAWLER_KICK_HITSTOP_MS[3] + 10;
    expect(brawlerRouteNodeOf(r)).toBe('kick3');
    expect(brawlerTechAllowed(r, 'kick', t)).toBe(false);
    expect(brawlerTechCancelOk(r, 'kiko', t)).toBe(false);
    expect(brawlerHeelInput(r, 'stomp', t)).toBe(false);
  });
});

describe('§34-1 蹴り上げの浮き(叩き台=飛び蹴り2発目の打ち上げの1.6倍)', () => {
  it('地上の敵を浮かせる・飛び蹴り2発目より高く長く', () => {
    expect(BRAWLER_GROUND_LAUNCH.kickup).toBeCloseTo((BRAWLER_GROUND_LAUNCH.kick2 ?? 0) * BRAWLER_KICKUP_LIFT_K, 10);
    expect(BRAWLER_JUGGLE_PUSH.kickup).toBeCloseTo(BRAWLER_JUGGLE_PUSH.kick2 * BRAWLER_KICKUP_LIFT_K, 10);
    const up = brawlerJugglePush({}, 'mob', 'kickup', 1000)!;
    const k2 = brawlerJugglePush({}, 'mob', 'kick2', 1000)!;
    expect(up.brLiftPeak!).toBeGreaterThan(k2.brLiftPeak!);
    expect(up.brLiftMs!).toBeGreaterThan(k2.brLiftMs!);
  });
  it('空中の敵は今の浮きより高く浮き直す(通常の浮かせ直しより高い)・予算は強い当たり=2', () => {
    const air = brawlerJugglePush({}, 'mob', 's3', 1000)!;
    const now = 1000 + 150;
    const h = brawlerJuggleHeightRel(air, now);
    const up = brawlerJugglePush(air, 'mob', 'kickup', now)!;
    const k2 = brawlerJugglePush(air, 'mob', 'kick2', now)!;
    expect(brawlerJuggleTop(up.brLiftFrom!, up.brLiftPeak!)).toBeGreaterThan(h);
    expect(brawlerJuggleTop(up.brLiftFrom!, up.brLiftPeak!)).toBeGreaterThan(brawlerJuggleTop(k2.brLiftFrom!, k2.brLiftPeak!));
    expect(BRAWLER_JUGGLE_COST.kickup).toBe(2);
    expect(up.brLiftBudget).toBe((air.brLiftBudget ?? 0) - 2);
  });
  it('予算が尽きていれば打ち上げずダウン', () => {
    const air = { ...brawlerJugglePush({}, 'mob', 's3', 1000)!, brLiftBudget: 1 };
    const r = brawlerJugglePush(air, 'mob', 'kickup', 1100)!;
    expect(r.brLiftDown).toBe(true);
    expect(r.brLiftPeak).toBe(0);
  });
});

describe('§34-3・§34-6 #10 スープレックスの浮き(地面バウンドの器・1コンボ1回の数に入れない)', () => {
  it('空中の相手は今の高さから地面へ落ちて小さく跳ね返る・予算2・バウンドの印を使わない', () => {
    const air = { ...brawlerJugglePush({}, 'mob', 's3', 1000)!, brComboStart: 1000, brBounceCombo: 1000 }; // このコンボのバウンドはもう使った
    const r = brawlerJugglePush(air, 'mob', 'suplex', 1100)!;
    expect(r.brLiftDown).toBe(false);
    expect(r.brLiftDropMs).toBeGreaterThan(0);
    expect(r.brLiftPeak).toBeGreaterThan(0);
    expect(r.brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob - 2);
    expect('brBounceCombo' in r).toBe(false); // 1コンボ1回の数に入れない
    // 大踏み潰しは同じ状態で叩き落とし(バウンドはもう使った)
    expect(brawlerJugglePush(air, 'mob', 'stomp', 1100)!.brLiftDown).toBe(true);
  });
  it('予算が尽きていれば浮かずダウン', () => {
    const air = { ...brawlerJugglePush({}, 'mob', 's3', 1000)!, brLiftBudget: 1 };
    expect(brawlerJugglePush(air, 'mob', 'suplex', 1100)!.brLiftDown).toBe(true);
  });
});

describe('§34-2 構えを技で取り消す(全レベル)', () => {
  const g = brawlerStartTech({ ...initialBrawlerState(), points: 10 }, 'guard', 1000);
  it('構えの最中(出だしから戻りの終わりまで)は構え以外の技で取り消せる・構えの再入力は延長(取り消しではない)', () => {
    for (const t of [1000, 1500, g.guardUntil - 1]) {
      for (const k of ['kick', 'kiko', 'stomp'] as const) expect(brawlerGuardCancelOk(g, k, t), `${k}@${t}`).toBe(true);
      expect(brawlerGuardCancelOk(g, 'guard', t)).toBe(false);
    }
    expect(brawlerGuardCancelOk(g, 'kick', g.guardUntil)).toBe(false);
  });
  it('拳鬼も読む道の規則(brawlerTechAllowed)は変えない=構えの間は延長だけ', () => {
    expect(brawlerTechAllowed(g, 'kick', 1200)).toBe(false);
    expect(brawlerTechAllowed(g, 'guard', 1200)).toBe(true);
  });
  it('取り消すと構えの効果(guardUntil)と、まだ撃っていない反撃の気功が切れる', () => {
    const e = brawlerEndGuardForCancel({ ...g, guardKiko: { at: 9999, hitX: 0, hitY: 0 }, guardCancelHeld: true });
    expect(e.guardUntil).toBe(0);
    expect(e.guardKiko).toBeUndefined();
    expect(e.guardCancelHeld).toBe(false);
  });
  it('止めの最中に覚えた技(guardCancelHeld)は、構えの間なら出す・構えが終わっていたら捨てる', () => {
    const held = { ...g, techBuffer: 'kiko' as const, guardCancelHeld: true };
    expect(brawlerTechBufferDecision(held, 1200)).toBe('fire');
    expect(brawlerTechBufferDecision(held, g.guardUntil + 1)).toBe('drop');
  });
});

describe('§34-3 空中投げの決め', () => {
  it('掴むのはパニッシャーあり+雑魚/強個体だけ(ボス級・倒れた・ダウンは掴まない)', () => {
    expect(brawlerAirThrowGrabs({ hasPunisher: true, cls: 'mob', killed: false, down: false })).toBe(true);
    expect(brawlerAirThrowGrabs({ hasPunisher: true, cls: 'strong', killed: false, down: false })).toBe(true);
    expect(brawlerAirThrowGrabs({ hasPunisher: true, cls: 'boss', killed: false, down: false })).toBe(false);
    expect(brawlerAirThrowGrabs({ hasPunisher: false, cls: 'mob', killed: false, down: false })).toBe(false);
    expect(brawlerAirThrowGrabs({ hasPunisher: true, cls: 'mob', killed: true, down: false })).toBe(false);
    expect(brawlerAirThrowGrabs({ hasPunisher: true, cls: 'mob', killed: false, down: true })).toBe(false);
  });
  it('投げ先があれば空中投げ・無ければスープレックス', () => {
    expect(brawlerAirThrowMove('e1')).toBe('airthrow');
    expect(brawlerAirThrowMove(null)).toBe('suplex');
  });
  it('投げの進み: 0から1へ単調・出だしは速さ0から加速(慣性)・その後は最高速で一定', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) { const p = brawlerThrowProgress(i / 100); expect(p).toBeGreaterThanOrEqual(prev); prev = p; }
    expect(brawlerThrowProgress(0)).toBe(0);
    expect(brawlerThrowProgress(1)).toBeCloseTo(1, 10);
    const a = BRAWLER_THROW_ACCEL_FRAC;
    const v0 = (brawlerThrowProgress(0.01) - brawlerThrowProgress(0)) / 0.01;
    const v1 = (brawlerThrowProgress(a + 0.02) - brawlerThrowProgress(a + 0.01)) / 0.01;
    const v2 = (brawlerThrowProgress(0.9) - brawlerThrowProgress(0.89)) / 0.01;
    expect(v0).toBeLessThan(v1 * 0.2);
    expect(v1).toBeCloseTo(v2, 6);
    // 最高速=BRAWLER_THROW_SPEED になる長さ
    const ms = brawlerThrowMs(320);
    expect(v2 * 320 / (ms / 1000)).toBeCloseTo(BRAWLER_THROW_SPEED, -1);
  });
  it('止まっていた間の浮きの時計をずらす(止まり始めに浮いていた敵だけ)', () => {
    expect(brawlerShiftLift({ brawlerLiftAt: 100, brLiftUntil: 900, liftUntil: 900 }, 500, 400)).toEqual({ brawlerLiftAt: 500, brLiftUntil: 1300, liftUntil: 1300 });
    expect(brawlerShiftLift({ brawlerLiftAt: 100, brLiftUntil: 400 }, 500, 400)).toBeNull();
    expect(brawlerShiftLift({ brawlerLiftAt: 100, brLiftUntil: 900, liftUntil: 700 }, 500, 400)).toEqual({ brawlerLiftAt: 500, brLiftUntil: 1300 });
  });
});

describe('§34-1 蹴り上げの絵(踵落としの上下逆・慣性)', () => {
  const u = brawlerStartTech(kickHit(2, true).s, 'kick', 2000, 3, false, false, true);
  it('溜めで脚を下げ(回し正・影が沈む)→ 当たる瞬間に上へ振り上げ切る(回し負・影が上がる)', () => {
    const charge = u.kickChargeMs ?? 0;
    const c = brawlerKickUpStandAt(u, charge * 0.6);
    expect(c.rot).toBeGreaterThan(0.3);
    expect(c.lift).toBeLessThan(0);
    const hit = brawlerKickUpStandAt(u, u.windupMs);
    expect(hit.rot).toBeLessThan(-0.4);
    expect(hit.lift).toBeGreaterThan(0);
    // 溜めの頭は0から(跳ばない)・溜め→飛ぶ・飛ぶ→当たるの境目で跳ばない
    expect(Math.abs(brawlerKickUpStandAt(u, 0).rot)).toBeLessThan(1e-9);
    for (const at of [charge, u.windupMs]) {
      const a = brawlerKickUpStandAt(u, at - 0.01), b = brawlerKickUpStandAt(u, at + 0.01);
      expect(Math.abs(a.rot - b.rot)).toBeLessThan(0.02);
      expect(Math.abs(a.lift - b.lift)).toBeLessThan(0.2);
    }
  });
  it('B16: 踵落としの上下逆のまま、振りは鋭く短い(構えが早く・振り上げは終わり際に4乗)・当たる時刻は同じ', () => {
    const h = brawlerStartTech(kickHit(2, true).s, 'kick', 2000, 3, false, true, false);
    expect(h.windupMs).toBe(u.windupMs); // 当たる時刻は踵落としと同じ(判定は変えない)
    const charge = u.kickChargeMs ?? 0;
    // 構え: 溜めの4割で脚を下げ切る(踵落としはまだ途中)
    expect(brawlerKickUpStandAt(u, charge * 0.4).rot).toBeCloseTo(BRAWLER_KICKUP_ROT_PEAK, 6);
    // 振り: 飛ぶ間の半分の時点で、踵落としより振りの進みが小さい(溜めて待ち、終わり際に一気に)
    const mid = charge + (u.windupMs - charge) * 0.5;
    const upFrac = (brawlerKickUpStandAt(u, mid).rot - BRAWLER_KICKUP_ROT_DOWN) / (BRAWLER_KICKUP_ROT_UP - BRAWLER_KICKUP_ROT_DOWN);
    const heelFrac = (brawlerHeelStandAt(h, mid).rot - BRAWLER_HEEL_ROT_UP) / (BRAWLER_HEEL_ROT_DOWN - BRAWLER_HEEL_ROT_UP);
    expect(upFrac).toBeLessThan(heelFrac);
    expect(brawlerKickUpStandAt(u, u.windupMs).rot).toBeCloseTo(BRAWLER_KICKUP_ROT_UP, 6);
    // 振り上げの進みは単調・0→1・終わり際が一番速い
    expect(brawlerKickUpSnap(0)).toBe(0); expect(brawlerKickUpSnap(1)).toBeCloseTo(1, 9);
    let prev = 0, prevD = 0;
    for (let q = 0.05; q <= 1.0001; q += 0.05) { const v = brawlerKickUpSnap(q); expect(v).toBeGreaterThanOrEqual(prev); expect(v - prev).toBeGreaterThanOrEqual(prevD - 1e-12); prevD = v - prev; prev = v; }
  });
  it('影と体は蹴り上げの回しを使う・体の跳びは当たる瞬間が高く、後隙で途切れずに降りる', () => {
    const f = brawlerStandAt(u, 2000 + u.windupMs - 1)!;
    expect(f.rot).toBeDefined();
    const pHit = brawlerPoseAt(u, 2000 + u.windupMs - 0.5)!;
    const r = { ...u, resolved: true, connected: true };
    const pPost = brawlerPoseAt(r, 2000 + u.windupMs + 0.5)!;
    expect(pHit.jump).toBeGreaterThan(20);
    expect(Math.abs(pHit.jump - pPost.jump)).toBeLessThan(1);
    expect(pHit.lean).toBeLessThan(0); // 振り上げで後ろへ反る
  });
  it('スープレックスの反り: 持ち上げて反り切る(頂点=叩きつけ)→ 頂点で留まる → ゆっくり戻る(端で速さ0)', () => {
    expect(brawlerSuplexArch(0)).toBe(0);
    expect(brawlerSuplexArch(1)).toBeLessThan(0.01);
    expect(brawlerSuplexArch(BRAWLER_SUPLEX_RISE_MS)).toBe(1);
    expect(brawlerSuplexArch(BRAWLER_SUPLEX_RISE_MS + BRAWLER_SUPLEX_HOLD_MS - 1)).toBe(1);
    expect(brawlerSuplexArch(BRAWLER_SUPLEX_RISE_MS + BRAWLER_SUPLEX_HOLD_MS + BRAWLER_SUPLEX_RETURN_MS)).toBe(0);
    expect(BRAWLER_SUPLEX_RETURN_MS).toBeGreaterThan(BRAWLER_SUPLEX_RISE_MS * 2); // 戻りは上がりよりゆっくり
  });
  it('密着のスープレックスは掴みの後半で反り始め、掴みの終わり(判定=叩きつけ)が反りの頂点', () => {
    const s = brawlerStartContactGrab(initialBrawlerState(), 1000, 'e', 'suplex');
    expect(s.suplexAt! + BRAWLER_SUPLEX_RISE_MS).toBe(1000 + s.windupMs);
    expect(s.suplexAt).toBe(1000 + BRAWLER_CONTACT_GRAB_MS / 2);
    const peak = brawlerPoseAt(s, 1000 + s.windupMs)!;
    expect(peak.lean).toBeCloseTo(-BRAWLER_SUPLEX_ARCH, 6);
    // 反りに入る瞬間は掴みの前傾と同じ(体が跳ばない)
    const a = brawlerPoseAt(s, s.suplexAt! - 0.01)!, b = brawlerPoseAt(s, s.suplexAt! + 0.01)!;
    expect(Math.abs(a.lean - b.lean)).toBeLessThan(0.01);
  });
  it('空中投げの掴み: 壁時計で寄せて前傾・止まっている間も慣性で入る', () => {
    const k = { ...brawlerStartTech(initialBrawlerState(), 'kick', 1000, 2, false, false, true), resolved: true, grab: { enemyId: 'e', at: 5000, releaseAt: 5400, reachPx: 20 } };
    expect(brawlerPoseAt(k, 2000, 5000)!.lean).toBeCloseTo(0, 6);
    const full = brawlerPoseAt(k, 2000, 5200)!;
    expect(full.lean).toBeCloseTo(BRAWLER_GRAB_LEAN, 6);
    expect(full.push).toBeCloseTo(20, 6);
    expect(full.sqY).toBeCloseTo(0.9, 6);
  });
  it('投げの体の振り: 後ろへ引いて前へ大きく振り抜き、戻る(端で0)', () => {
    expect(brawlerThrowSwing(0).lean).toBeCloseTo(0, 6);
    expect(brawlerThrowSwing(BRAWLER_THROW_SWING_MS * 0.3).lean).toBeLessThan(-0.3);
    const peak = brawlerThrowSwing(BRAWLER_THROW_SWING_MS - 0.01);
    expect(peak.lean).toBeGreaterThan(0.5);
    expect(peak.push).toBeGreaterThan(15);
    expect(brawlerThrowSwing(BRAWLER_THROW_SWING_MS + 0.01).lean).toBeCloseTo(peak.lean, 2);
    expect(brawlerThrowSwing(BRAWLER_THROW_SWING_MS + BRAWLER_THROW_SETTLE_MS).on).toBe(false);
  });
  it('掴みの体の光: 一度膨らんで落ち着く(脈打たない=単調に落ち着く)', () => {
    expect(brawlerGrabGlow(80)).toBeCloseTo(1, 6);
    let prev = brawlerGrabGlow(80);
    for (let t = 90; t <= 400; t += 10) { const v = brawlerGrabGlow(t); expect(v).toBeLessThanOrEqual(prev + 1e-9); prev = v; }
    expect(brawlerGrabGlow(400)).toBeGreaterThan(0.5);
  });
  it('掴みの寄り: 掴みの間にゆっくり寄り、放したら戻る(つなぎ目で跳ばない)', () => {
    expect(brawlerGrabZoom(0, null)).toBe(0);
    expect(brawlerGrabZoom(BRAWLER_GRAB_MS, null)).toBeCloseTo(BRAWLER_GRAB_ZOOM, 6);
    expect(brawlerGrabZoom(BRAWLER_GRAB_MS, 0)).toBeCloseTo(BRAWLER_GRAB_ZOOM, 6);
    expect(brawlerGrabZoom(BRAWLER_GRAB_MS + 400, 400)).toBe(0);
  });
  it('構えの取り消しの光: 一度外へ押して150msで消える', () => {
    expect(brawlerGuardCancelGlow(0, 0.8)).toEqual({ remain: 0.8, pop: 1 });
    expect(brawlerGuardCancelGlow(75, 0.8).remain).toBeGreaterThan(0.4);
    expect(brawlerGuardCancelGlow(150, 0.8)).toEqual({ remain: 0, pop: 0 });
    const g = brawlerStartTech({ ...initialBrawlerState(), points: 10 }, 'guard', 1000);
    const e = brawlerEndGuardForCancel(g, 1500, 7000);
    expect(e.guardCancelAt).toBe(7000);
    expect(e.guardCancelRemain).toBeGreaterThan(0);
  });
  it('覚えた蹴り上げのフリックの向き=上', () => {
    expect(brawlerFlickDirOf('kick', false, true)).toEqual({ x: 0, y: -1 });
    expect(brawlerFlickDirOf('kick')).toEqual({ x: 1, y: 0 });
  });
});

describe('B15 空中投げで飛ぶ敵の回り(絵だけ)', () => {
  const T = 220;
  it('飛ぶ間: 止まった所から加速して飛ぶ向きへ回る・ぶつかる瞬間に1.5回(逆さま)', () => {
    expect(brawlerThrowSpin(0, T, 1)).toBeCloseTo(0, 9);
    let prev = 0, prevD = 0;
    for (let el = 10; el <= T; el += 10) { const r = brawlerThrowSpin(el, T, 1); expect(r).toBeGreaterThan(prev); expect(r - prev).toBeGreaterThan(prevD - 1e-9); prevD = r - prev; prev = r; }
    expect(brawlerThrowSpin(T, T, 1)).toBeCloseTo(2 * Math.PI * BRAWLER_THROW_SPIN_TURNS, 6);
    expect(brawlerThrowSpin(T, T, -1)).toBeCloseTo(-2 * Math.PI * BRAWLER_THROW_SPIN_TURNS, 6); // 左へ飛ぶ=反時計回り
  });
  it('ぶつかってから爆撃まではその角度のまま・壁で早く止まった時はその時の角度', () => {
    expect(brawlerThrowSpin(T + 300, T, 1, T)).toBeCloseTo(3 * Math.PI, 6);
    const early = brawlerThrowSpin(T * 0.5, T, 1);
    expect(brawlerThrowSpin(T * 0.5 + 200, T, 1, T * 0.5)).toBeCloseTo(early, 9);
  });
  it('爆撃から: ぶつかった時の速さを引き継いで減速し、次の正立で止まる(跳ばない)', () => {
    for (const hit of [T, T * 0.5, T * 0.2]) {
      const h = brawlerThrowSpinAtHit(T, hit);
      const at0 = brawlerThrowSpin(hit + 260, T, 1, hit, 0);
      expect(at0).toBeCloseTo(h.th, 6);
      let prev = at0;
      for (let t = 5; t < h.settleMs; t += 5) { const r = brawlerThrowSpin(hit + 260 + t, T, 1, hit, t); expect(r).toBeGreaterThanOrEqual(prev - 1e-9); prev = r; }
      const last = brawlerThrowSpin(hit + 260 + h.settleMs - 0.01, T, 1, hit, h.settleMs - 0.01);
      expect(Math.abs(Math.sin(last / 2))).toBeLessThan(0.01); // 正立(2πの倍数)の直前
      expect(brawlerThrowSpin(hit + 260 + h.settleMs, T, 1, hit, h.settleMs)).toBe(0);
    }
  });
});

describe('技の行の名前(§34-1・§34-3)', () => {
  it('蹴り上げ・空中投げ・スープレックス(向き=上)', () => {
    expect(BRAWLER_TECH_NAMES['tech:kickup']).toEqual({ name: '蹴り上げ', dir: 'up' });
    expect(BRAWLER_TECH_NAMES['tech:suplex']).toEqual({ name: 'スープレックス', dir: 'up' });
    // 蹴り上げから自動で続く技は向きの印を出さない(続きの印・クリエイティブ監査 #12)
    expect(BRAWLER_TECH_NAMES['tech:airthrow'].dir).toBe('chain');
    expect(BRAWLER_TECH_NAMES['tech:suplexchain']).toEqual({ name: 'スープレックス', dir: 'chain' });
  });
});

describe('§34-7 密着の構え(掴み→スープレックス/蹴りバク宙)', () => {
  /** 中心 (0,0) のプレイヤー(半幅14)から、敵の帯の縁まで gap px の所に右へ置いた敵。 */
  const at = (gap: number, id: string, type: Parameters<typeof spawnEnemyAt>[0] = 'zombie'): Enemy => {
    const e = spawnEnemyAt(type, 0, 0, 0);
    e.id = id; e.health = 100; e.maxHealth = 100;
    e.x = 14 + gap; e.y = -e.height / 2;
    e.x += gap - (brawlerDistTo(0, 0, e) - 14); // 帯(当たりの箱)の縁までの距離をちょうど gap にする
    return e;
  };
  const none = () => false;
  it('体の縁どうしが24px以内の一番近い1体だけ(遠い・死体・空中は対象外)', () => {
    const near = at(10, 'near'), far = at(BRAWLER_CONTACT_PX + 6, 'far'), nearer = at(2, 'nearer');
    expect(brawlerContactTarget([near, far], 0, 0, 14, none)?.id).toBe('near');
    expect(brawlerContactTarget([near, nearer], 0, 0, 14, none)?.id).toBe('nearer');
    expect(brawlerContactTarget([far], 0, 0, 14, none)).toBeNull();
    expect(brawlerContactTarget([at(BRAWLER_CONTACT_PX, 'edge')], 0, 0, 14, none)?.id).toBe('edge');
    expect(brawlerContactTarget([{ ...near, health: 0 }], 0, 0, 14, none)).toBeNull();
    expect(brawlerContactTarget([near], 0, 0, 14, e => e.id === 'near')).toBeNull(); // 空中=空中投げの領分
    expect(brawlerContactTarget([{ ...near, brThrown: true }], 0, 0, 14, none)).toBeNull(); // 投げられて飛んでいる敵
  });
  it('雑魚=スープレックス / 強個体・ボス級=蹴りバク宙', () => {
    expect(brawlerContactMode('mob')).toBe('suplex');
    expect(brawlerContactMode('strong')).toBe('flipkick');
    expect(brawlerContactMode('boss')).toBe('flipkick');
  });
  it('掴んだ状態: 構えではない(窓・被害の無効なし)・締め(続きなし)・前隙=掴み・バク宙の後隙=下がる間', () => {
    const g = brawlerStartTech({ ...initialBrawlerState(), points: 10 }, 'guard', 1000);
    const s = brawlerStartContactGrab(g, 1000, 'e', 'suplex');
    expect(isBrawlerGuardingAt(s, 1100)).toBe(false);
    expect(s.windupMs).toBe(BRAWLER_CONTACT_GRAB_MS);
    expect(s.contactGrab).toEqual({ enemyId: 'e', mode: 'suplex' });
    expect(brawlerRouteNodeOf(s)).toBe('kick3');
    expect(brawlerTechAllowed({ ...s, resolved: true }, 'kick', 1300)).toBe(false);
    expect(brawlerGuardCancelOk(s, 'kick', 1100)).toBe(false); // 構えの技キャンセルは掛からない
    const f = brawlerStartContactGrab(g, 1000, 'e', 'flipkick');
    expect(f.recoveryMs).toBe(BRAWLER_FLIPKICK_MS);
  });
  it('掴みから行動の終わりまでスーパーアーマー(ダメージ量・スキルを問わない)・終われば外れる', () => {
    const s = brawlerStartContactGrab(initialBrawlerState(), 1000, 'e', 'flipkick');
    expect(playerSuperArmorActive({ brawler: s }, 999, 0, 1000, 300)).toBe(true);
    expect(playerSuperArmorActive({ brawler: { ...s, phase: 'idle' } }, 999, 0, 1000, 300)).toBe(false);
    expect(playerSuperArmorActive({ brawler: initialBrawlerState() }, 999, 0, 1000, 300)).toBe(false);
  });
  it('蹴りバク宙の回転: 1回転・端で止まる(減速)', () => {
    expect(brawlerFlipSpin(0)).toBeCloseTo(0, 10);
    expect(brawlerFlipSpin(1)).toBeCloseTo(-2 * Math.PI, 10);
    expect(Math.abs(brawlerFlipSpin(1) - brawlerFlipSpin(0.99))).toBeLessThan(0.002);
    expect(brawlerFlipSpin(BRAWLER_FLIPKICK_APEX)).toBeLessThan(-Math.PI); // 頂点の前に半分以上回る
  });
  it('蹴りバク宙の跳び: 速く上がって重く落ちる(頂点が前寄り・着地の瞬間が一番速い)', () => {
    expect(brawlerFlipArc(0)).toBe(0);
    expect(brawlerFlipArc(BRAWLER_FLIPKICK_APEX)).toBeCloseTo(1, 6);
    expect(brawlerFlipArc(1)).toBeCloseTo(0, 6);
    const vEnd = brawlerFlipArc(0.99) - brawlerFlipArc(1);
    const vStart = brawlerFlipArc(0.01) - brawlerFlipArc(0);
    expect(vEnd).toBeGreaterThan(0); expect(vStart).toBeGreaterThan(0);
    expect(Math.abs(brawlerFlipArc(BRAWLER_FLIPKICK_APEX + 0.01) - brawlerFlipArc(BRAWLER_FLIPKICK_APEX))).toBeLessThan(0.001);
  });
  it('地上の雑魚へのスープレックスも跳ね上がる(予算2を使う)', () => {
    const r = brawlerJugglePush({}, 'mob', 'suplex', 1000)!;
    expect(r.brLiftPeak).toBeGreaterThan(0);
    expect(r.brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob - 2);
  });
  it('スープレックスの投げ越し(絵だけ): 頭の上を越えて背中側へ・頂点で逆さまに叩きつけ・起き上がりながら元の位置へ', () => {
    const mx = -80, my = 0;
    expect(brawlerSuplexSwing(-1, mx, my)).toBeNull();
    const a = brawlerSuplexSwing(0, mx, my)!;
    expect(a.dx).toBeCloseTo(0, 6); expect(a.rot).toBeCloseTo(0, 6);
    const mid = brawlerSuplexSwing(BRAWLER_SUPLEX_RISE_MS * Math.SQRT1_2, mx, my)!; // 運ぶ量の半分=頭の真上
    expect(mid.lift).toBeCloseTo(BRAWLER_SUPLEX_SWING_LIFT_PX, 6);
    expect(mid.dx).toBeCloseTo(mx / 2, 6);
    const slam = brawlerSuplexSwing(BRAWLER_SUPLEX_RISE_MS, mx, my)!;
    expect(slam.dx).toBeCloseTo(mx, 6); expect(slam.lift).toBeCloseTo(0, 6); expect(Math.abs(slam.rot)).toBeCloseTo(Math.PI, 6);
    expect(slam.rot).toBeLessThan(0); // 左へ運ぶ=反時計回り
    const end = BRAWLER_SUPLEX_RISE_MS + BRAWLER_SUPLEX_HOLD_MS + BRAWLER_SUPLEX_RETURN_MS;
    const last = brawlerSuplexSwing(end - 0.01, mx, my)!;
    expect(last.dx).toBeCloseTo(0, 2); expect(Math.abs(last.rot)).toBeCloseTo(2 * Math.PI, 2);
    expect(brawlerSuplexSwing(end, mx, my)).toBeNull();
  });
  it('投げ越しの着地点=プレイヤーの背中側(相手の反対・30〜90px)', () => {
    const r = brawlerSuplexLanding(0, 0, 40, 0, 1);
    expect(r.mx).toBeCloseTo(-80, 6); expect(r.my).toBeCloseTo(0, 6);
    const far = brawlerSuplexLanding(0, 0, 200, 0, 1);
    expect(far.mx).toBeCloseTo(-290, 6);
    const same = brawlerSuplexLanding(0, 0, 0, 0, 1);
    expect(same.mx).toBeCloseTo(-30, 6);
  });
  it('技の行: サマーソルト(向き=上・社長命名2026-11-19)', () => {
    expect(BRAWLER_TECH_NAMES['tech:flipkick']).toEqual({ name: 'サマーソルト', dir: 'up' });
  });
});
