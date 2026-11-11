import { KATANA_FLICK_MIN_DIST, KATANA_FLICK_WINDOW_MS, KATANA_FLICK_MIN_SPEED } from '../store/gameStore';
import { RHYTHM_FLICK_FIRE_DIST, RHYTHM_FLICK_FIRE_SPEED, RHYTHM_FLICK_FIRE_WINDOW_MS } from '../config/shijin';
import { describe, expect, it } from 'vitest';
import type { Enemy } from '../types/game';
import {
  BRAWLER_STAGES, BRAWLER_TECHS, brawlerPointCap, brawlerAfterAmmoPickup, BRAWLER_AMMO_PICKUP_POINTS, brawlerEndGuardForStomp, BRAWLER_GUARD_QUICK_MS, brawlerTechCost,
  brawlerPalmDashDue, isBrawlerPalmDashing, brawlerKickFlightMs, BRAWLER_KICK_RANGE, BRAWLER_KICK_NO_TARGET_PX, brawlerPassKbDir, BRAWLER_PALM_DASH_MS, sweepResolve, brawlerStandAt, BRAWLER_STAND_STAGE2_KIND, brawlerSecretStep, brawlerSecretDue, brawlerSecretPickMove, brawlerSecretPickTarget, brawlerSecretStart, brawlerSecretEnd, BRAWLER_SECRET_GAP_MS, BRAWLER_SECRET_STRIKES, BRAWLER_SECRET_MOVES, initialBrawlerState, brawlerElapsed, brawlerApplyHitstop,
  brawlerStartAttack, brawlerStartTech, brawlerPressDecision, brawlerAfterResolve, brawlerDueEvent, brawlerFinish,
  brawlerStageForPress, brawlerOnHurt, brawlerCancel, brawlerTechAllowed, brawlerNextKickN, brawlerCanPay,
  classifyBrawlerFlick, detectFlickFromSamples, pickBrawlerTarget, brawlerCircleTargets, brawlerBandTargets,
  brawlerFistTargets, brawlerApproach, accelLungeSpeed, accelLungeFactor, BRAWLER_ACCEL_FRAC, brawlerJumpHeight,
  brawlerLiftHeight, brawlerPoseAt, isBrawlerGuardingAt, brawlerStompShake, BRAWLER_STOMP_SHAKE_PX, BRAWLER_KICK3_RECOVERY_MULT, BRAWLER_KICK_CROUCH_AT, brawlerGlobalStopApplies, BRAWLER_GLOBAL_STOP_MODE, BRAWLER_HIT_PITCH, brawlerStageHitSfx, brawlerKickHitSfx, BRAWLER_GUARD_MS, BRAWLER_KICK_CHAIN_MS,
  brawlerTechCancelOk, brawlerFlowOnHit, brawlerSecretAfterKick, brawlerShouldBufferTech, brawlerLateCarry, brawlerTechBufferDecision, BRAWLER_CANCEL_WINDOW_MS,
  BRAWLER_STOMP_MULT, BRAWLER_KIKO_MULT, BRAWLER_SECRET_LAND_MULT, brawlerKickMult,
  brawlerIsJustGuard, BRAWLER_JUST_MS, brawlerStepAllowed, brawlerStepStart, brawlerBufferStep, brawlerStepBufferDecision, BRAWLER_STEP_BUFFER_MS, brawlerStepFactor, brawlerStepSpeed, BRAWLER_STEP_PX, BRAWLER_STEP_MS,
} from './brawler';
import { setBrawlerTempoAll } from './brawlerCombo';
// ★テンポ係数(§9-68): この表の時刻は係数1.0(今までの値)で書いてある。係数1.3の挙動は brawlerTempo.store.test.ts で固める。
setBrawlerTempoAll(1.0); // 記述時(describe の中で時刻を組む所)より先に効かせる=モジュールの頭で呼ぶ

const foe = (id: string, cx: number, cy: number, over: Partial<Enemy> = {}): Enemy => ({
  id, type: 'boss', x: cx - 20, y: cy - 20, width: 40, height: 40, health: 100, maxHealth: 100,
  ...over,
} as unknown as Enemy);

describe('格闘: 表', () => {
  it('段の表は §2-2 の全体の尺どおり', () => {
    expect(BRAWLER_STAGES.map(s => s.windupMs + s.recoveryMs)).toEqual([200, 200, 350, 450, 500]);
    expect(BRAWLER_STAGES.map(s => s.mult)).toEqual([0.30, 0.40, 0.8, 1.10, 1.60]); // 社長指示2026-11-09「あと通常攻撃は後半ほど高ダメ」(旧 0.35/0.35/0.8/1.0/1.3)
    expect(BRAWLER_STAGES.map(s => s.kb)).toEqual(['small', 'small', 'normal', 'small', 'big']); // 社長指示2026-11-10「どの攻撃も押さない攻撃でも多少押そう」(旧 1・2・4段目は none)
    expect(BRAWLER_STAGES.map(s => s.hitstopMs)).toEqual([90, 90, 150, 150, 220]); // 止めは係数を掛けない表(社長承認2026-11-08: 旧 45/45/80/90/140)
  });
  it('技の倍率(大踏み潰し3.5・気功1.8・飛び蹴り0.7/0.8/1.2=3発目は社長指示2026-11-11・秘奥義の締め3.6)', () => {
    expect([BRAWLER_STOMP_MULT, BRAWLER_KIKO_MULT, BRAWLER_SECRET_LAND_MULT]).toEqual([3.5, 1.8, 3.6]);
    expect([1, 2, 3].map(brawlerKickMult)).toEqual([0.7, 0.8, 1.2]);
    // 3発目だけ後隙が長い(社長指示2026-11-11「技後の隙も少し伸ばして」)。1・2発目は今どおり。
    const k1 = brawlerStartTech(initialBrawlerState(), 'kick', 0, 1), k3 = brawlerStartTech(initialBrawlerState(), 'kick', 0, 3);
    expect(k3.recoveryMs).toBe(Math.round(k1.recoveryMs * BRAWLER_KICK3_RECOVERY_MULT));
    expect(k3.recoveryMs).toBeGreaterThan(k1.recoveryMs);
    expect(brawlerKickMult(0)).toBe(0.7); // 範囲外は端へ寄せる
    expect(brawlerKickMult(9)).toBe(1.2);
  });
  it('試し(?brstop=): 既定は全体を止めない・1=締めだけ・2=全部の当たり', () => {
    expect(BRAWLER_GLOBAL_STOP_MODE).toBe(0);
    expect([brawlerGlobalStopApplies(true, 0), brawlerGlobalStopApplies(false, 0)]).toEqual([false, false]);
    expect([brawlerGlobalStopApplies(true, 1), brawlerGlobalStopApplies(false, 1)]).toEqual([true, false]);
    expect([brawlerGlobalStopApplies(true, 2), brawlerGlobalStopApplies(false, 2)]).toEqual([true, true]);
  });
  it('飛び蹴り: 体がしゃがみの絵に替わったら、蹴りの影は出ていない(社長指示2026-11-11)', () => {
    const k = brawlerStartTech(initialBrawlerState(), 'kick', 0, 1);
    const hitAt = k.startAt + k.windupMs;
    expect(brawlerStandAt(k, hitAt)?.kind).toBe('kick');                       // 当たった瞬間は蹴りの影
    const crouchAt = hitAt + k.recoveryMs * BRAWLER_KICK_CROUCH_AT;
    expect(brawlerPoseAt(k, crouchAt + 1)?.tex).toBe('ready');                  // 体はしゃがみ
    expect(brawlerStandAt(k, crouchAt + 1)).toBeNull();                        // 蹴りの影は消えている
    expect(brawlerStandAt(k, hitAt + k.recoveryMs * 0.9)).toBeNull();
  });
  it('技の時間とポイントは §8-3 / §0 どおり', () => {
    expect(BRAWLER_TECHS.guard.windupMs + BRAWLER_TECHS.guard.recoveryMs).toBe(1000);
    expect(BRAWLER_TECHS.stomp.windupMs + BRAWLER_TECHS.stomp.recoveryMs).toBe(600);
    expect(BRAWLER_TECHS.kiko.windupMs + BRAWLER_TECHS.kiko.recoveryMs).toBe(450);
    expect(BRAWLER_TECHS.kick.windupMs + BRAWLER_TECHS.kick.recoveryMs).toBe(270);
    expect([BRAWLER_TECHS.guard.cost, BRAWLER_TECHS.stomp.cost, BRAWLER_TECHS.kiko.cost, BRAWLER_TECHS.kick.cost]).toEqual([3, 5, 2, 1]);
  });
  it('ポイントの上限はレベルで 5/10/20', () => {
    expect([1, 2, 3].map(brawlerPointCap)).toEqual([5, 10, 20]);
  });
  it('弾を拾うと +1(暫定)・上限で止まり、止まった時は同じ状態を返す(合図を打たない)', () => {
    expect(BRAWLER_AMMO_PICKUP_POINTS).toBe(1);
    const s0 = { ...initialBrawlerState(), points: 4 };
    const s1 = brawlerAfterAmmoPickup(s0, 5, 123);
    expect([s1.points, s1.gainAt]).toEqual([5, 123]);
    expect(brawlerAfterAmmoPickup(s1, 5, 999)).toBe(s1);
  });
  it('血の覚醒中は技の値段が0=技ポイント0でも全部の技を出せる(社長指示2026-11-08)', () => {
    const s0 = { ...initialBrawlerState(), points: 0 };
    for (const k of ['guard', 'stomp', 'kiko', 'kick'] as const) {
      expect(brawlerTechCost(k, true)).toBe(0);
      expect(brawlerCanPay(s0, k, true)).toBe(true);
      expect(brawlerCanPay(s0, k, false)).toBe(false);
    }
  });
  // ★書き換え(社長指示2026-11-10・research/BRAWLER.md §12-3d): 旧「構えのカウンター成立で技ポイントを上限まで全回復(2026-11-08)」は撤去された
  // (全回復の純関数 brawlerAfterGuardCounter ごと削除)。代わりに、雑魚を受けて大踏み潰しへ移る直前の状態を固める=技ポイントも HUD の跳ねも動かない。
  it('構えを受けで終える(大踏み潰しへ移る直前): 受けは切れ・前隙なしはいまから数える・技ポイントと HUD の跳ね(gainAt)は動かない', () => {
    const s0 = { ...brawlerStartTech({ ...initialBrawlerState(), points: 2 }, 'guard', 1000), gainAt: 5 };
    expect(isBrawlerGuardingAt(s0, 1100)).toBe(true);
    const s1 = brawlerEndGuardForStomp(s0, 1100);
    expect(isBrawlerGuardingAt(s1, 1100)).toBe(false);
    expect(s1.quickUntil).toBe(1100 + BRAWLER_GUARD_QUICK_MS);
    expect([s1.points, s1.gainAt]).toEqual([2, 5]);
  });
});

describe('格闘: 時計とヒットストップ', () => {
  it('止めの間は段の時計が進まず、明けたら続きから進む', () => {
    let s = brawlerStartAttack(initialBrawlerState(), 1, 1000, false);
    expect(brawlerElapsed(s, 1060)).toBe(60);
    s = brawlerApplyHitstop(s, 1060, 45);
    expect(brawlerElapsed(s, 1080)).toBe(60);
    expect(brawlerElapsed(s, 1105)).toBe(60);
    expect(brawlerElapsed(s, 1205)).toBe(160);
  });
  it('止めを2回掛けても前の止めは引かれたまま', () => {
    let s = brawlerStartTech(initialBrawlerState(), 'kick', 0, 1);
    s = brawlerApplyHitstop(s, 100, 50);
    s = brawlerApplyHitstop(s, 300, 50);
    expect(brawlerElapsed(s, 320)).toBe(250);
    expect(brawlerElapsed(s, 400)).toBe(300);
  });
});

describe('格闘: つながり(当たった時だけ次の段)', () => {
  const pt = { pointCap: 5, countPoint: true, hitstopMs: 45 };
  it('当てたら次の段・ポイント+1、外したら1段目', () => {
    let s = brawlerStartAttack(initialBrawlerState(), 1, 0, false);
    expect(brawlerDueEvent(s, 59)).toBeNull();
    expect(brawlerDueEvent(s, 60)).toBe('resolve');
    s = brawlerAfterResolve(s, 60, 1, pt);
    expect(s.nextStage).toBe(2);
    expect(s.points).toBe(1);
    const miss = brawlerAfterResolve(brawlerStartAttack(initialBrawlerState(), 3, 0, false), 120, 0, pt);
    expect(miss.nextStage).toBe(1);
    expect(miss.points).toBe(0);
  });
  it('何体巻き込んでもポイントは1、上限で止まる', () => {
    let s = { ...initialBrawlerState(), points: 4 };
    s = brawlerAfterResolve(brawlerStartAttack(s, 5, 0, false), 150, 6, pt);
    expect(s.points).toBe(5);
    s = brawlerAfterResolve(brawlerStartAttack(s, 1, 1000, false), 1060, 1, pt);
    expect(s.points).toBe(5);
  });
  it('5段目の次は1段目', () => {
    const s = brawlerAfterResolve(brawlerStartAttack(initialBrawlerState(), 5, 0, false), 150, 1, pt);
    expect(s.nextStage).toBe(1);
  });
  it('終わってから 400ms 押さなければ1段目に戻る', () => {
    let s = brawlerAfterResolve(brawlerStartAttack(initialBrawlerState(), 1, 0, false), 60, 1, pt);
    expect(brawlerDueEvent(s, 200)).toBeNull(); // 止め45ms ぶん後ろ
    expect(brawlerDueEvent(s, 245)).toBe('end');
    s = brawlerFinish(s, 245).state;
    expect(brawlerStageForPress(s, 600)).toBe(2);
    expect(brawlerStageForPress(s, 646)).toBe(1);
  });
  it('先行入力: 当たった瞬間から受け付ける・空振りは戻りの終わり150ms前から・1つだけ', () => {
    let s = brawlerStartAttack(initialBrawlerState(), 3, 0, false);
    expect(brawlerPressDecision(s, 50)).toBe('drop');
    s = brawlerAfterResolve(s, 120, 1, pt);
    expect(brawlerPressDecision(s, 125)).toBe('buffer'); // 止めの間も
    s = { ...s, buffered: true };
    expect(brawlerPressDecision(s, 130)).toBe('drop');
    let w = brawlerAfterResolve(brawlerStartAttack(initialBrawlerState(), 3, 0, false), 120, 0, pt);
    expect(brawlerPressDecision(w, 190)).toBe('drop');
    expect(brawlerPressDecision(w, 200)).toBe('buffer');
    w = { ...w, buffered: true };
    const fin = brawlerFinish(w, 350);
    expect(fin.fire).toBe(true);
    expect(fin.state.nextStage).toBe(1);
  });
  it('技の最中の押下は覚えて、技の後は1段目', () => {
    const s = brawlerStartTech({ ...initialBrawlerState(), nextStage: 4, chainUntil: 9999 }, 'kiko', 0);
    expect(brawlerPressDecision(s, 10)).toBe('buffer');
    expect(brawlerStageForPress(s, 10)).toBe(1);
  });
  it('被弾で1段目へ・先行入力を捨てる', () => {
    const s = brawlerOnHurt({ ...initialBrawlerState(), nextStage: 3, chainUntil: 9999, buffered: true });
    expect(s.nextStage).toBe(1);
    expect(s.buffered).toBe(false);
    expect(brawlerCancel({ ...s, phase: 'attack' }).phase).toBe('idle');
  });
  it('受けた直後の1発は前隙なし(1回きり)', () => {
    const s = brawlerStartAttack({ ...initialBrawlerState(), quickUntil: 500 }, 1, 100, true);
    expect(s.windupMs).toBe(0);
    expect(s.quickUntil).toBe(0);
    expect(brawlerDueEvent(s, 100)).toBe('resolve');
  });
});

describe('格闘: 技', () => {
  it('構えは1秒・途中で他の技は出ない', () => {
    const s = brawlerStartTech({ ...initialBrawlerState(), points: 10 }, 'guard', 0);
    expect(isBrawlerGuardingAt(s, BRAWLER_GUARD_MS - 1)).toBe(true);
    expect(isBrawlerGuardingAt(s, BRAWLER_GUARD_MS)).toBe(false);
    expect(brawlerTechAllowed(s, 'kick', 10)).toBe(false);
  });
  it('飛び蹴りは着いた後だけ次が出せる・3発まで・500msで切れる', () => {
    let s = brawlerStartTech(initialBrawlerState(), 'kick', 0, 1);
    expect(brawlerTechAllowed(s, 'kick', 50)).toBe(false);
    s = { ...brawlerAfterResolve(s, 120, 1, { pointCap: 5, countPoint: false, hitstopMs: 80 }), kickChainUntil: 120 + BRAWLER_KICK_CHAIN_MS };
    expect(brawlerTechAllowed(s, 'kick', 130)).toBe(true);
    expect(brawlerTechAllowed(s, 'stomp', 130)).toBe(false);
    expect(brawlerNextKickN(s, 200)).toBe(2);
    expect(brawlerNextKickN(s, 621)).toBe(1);
    expect(brawlerNextKickN({ ...s, kickCount: 3 }, 200)).toBe(1);
  });
  it('ポイント不足は払えない', () => {
    expect(brawlerCanPay({ ...initialBrawlerState(), points: 2 }, 'guard')).toBe(false);
    expect(brawlerCanPay({ ...initialBrawlerState(), points: 3 }, 'guard')).toBe(true); // 上=3(社長指示2026-11-07)
    expect(brawlerCanPay({ ...initialBrawlerState(), points: 4 }, 'stomp')).toBe(false);
    expect(brawlerCanPay({ ...initialBrawlerState(), points: 2 }, 'kiko')).toBe(true);
  });
  it('フリックの4方向: 縦と横の大きい方・同じなら横', () => {
    expect(classifyBrawlerFlick(0, -1)).toBe('guard');
    expect(classifyBrawlerFlick(0.1, 1)).toBe('stomp');
    expect(classifyBrawlerFlick(-1, 0.2)).toBe('kiko');
    expect(classifyBrawlerFlick(1, -0.5)).toBe('kick');
    expect(classifyBrawlerFlick(0.7, 0.7)).toBe('kick');
    expect(classifyBrawlerFlick(-0.7, -0.7)).toBe('kiko');
    expect(classifyBrawlerFlick(0, 0)).toBeNull();
  });
  it('フリック判定は短い窓の距離と速さを見る', () => {
    expect(detectFlickFromSamples([{ x: 0, y: 0, t: 0 }, { x: 60, y: 0, t: 60 }], 120, 30, 0.4)?.x).toBeCloseTo(1);
    expect(detectFlickFromSamples([{ x: 0, y: 0, t: 0 }, { x: 10, y: 0, t: 60 }], 120, 30, 0.4)).toBeNull();
  });
});

describe('格闘: 相手と当たりの形', () => {
  it('一番近い相手(半径の内側・死体と壁の向こうを除く)', () => {
    const es = [foe('a', 100, 0), foe('b', 60, 0), foe('c', 40, 0, { corpseUntil: 1 })];
    expect(pickBrawlerTarget(es, 0, 0, 74)?.id).toBe('b');
    expect(pickBrawlerTarget(es, 0, 0, 1)).toBeNull();
    const wall = { x: 25, y: -50, width: 5, height: 100 };
    expect(pickBrawlerTarget(es, 0, 0, 200, [wall])).toBeNull();
  });
  it('円・帯・拳の周り', () => {
    const es = [foe('a', 100, 0), foe('b', 0, 100), foe('c', 300, 0)];
    expect(brawlerCircleTargets(es, 0, 0, 90).sort()).toEqual(['a', 'b']);
    expect(brawlerBandTargets(es, 0, 0, 1, 0)).toEqual(['a']);
    const near = [foe('t', 50, 0), foe('n', 70, 30)];
    expect(brawlerFistTargets(near, 0, 0, 1, 0, near[0], 74).sort()).toEqual(['n', 't']);
  });
  it('詰めは相手の縁の手前まで・最大距離で頭打ち', () => {
    const t = foe('t', 120, 0);
    const a = brawlerApproach(0, 0, t, 60);
    expect(a.dist).toBe(60);
    expect(a.dx).toBeCloseTo(60);
    expect(brawlerApproach(0, 0, foe('n', 40, 0), 60).dist).toBe(0);
  });
  it('加速の踏み込み: 進む距離が指定どおり・最大速度のまま当たる', () => {
    const v = accelLungeSpeed(60, 60);
    let x = 0;
    const steps = 600;
    for (let i = 0; i < steps; i++) x += v * accelLungeFactor((i + 0.5) / steps) * (0.06 / steps);
    expect(x).toBeCloseTo(60, 0);
    expect(accelLungeFactor(0.99)).toBe(1);
    expect(accelLungeFactor(BRAWLER_ACCEL_FRAC / 2)).toBeCloseTo(0.5);
  });
});

describe('格闘: 絵', () => {
  it('跳び・浮かせは0から始まり0で終わる(慣性)', () => {
    expect(brawlerJumpHeight(0)).toBe(0);
    expect(brawlerJumpHeight(1)).toBe(0);
    expect(brawlerJumpHeight(0.5)).toBeGreaterThan(40);
    expect(brawlerLiftHeight(0.4)).toBeGreaterThan(20);
    expect(brawlerLiftHeight(1)).toBe(0);
  });
  it('連続中は立ち絵に戻さない・切れたら戻す', () => {
    let s = brawlerAfterResolve(brawlerStartAttack(initialBrawlerState(), 1, 0, false), 60, 1, { pointCap: 5, countPoint: true, hitstopMs: 0 });
    s = brawlerFinish(s, 200).state;
    expect(brawlerPoseAt(s, 300)?.tex).toBe('ready');
    expect(brawlerPoseAt(s, 1000)).toBeNull();
    expect(brawlerPoseAt(brawlerStartAttack(s, 3, 2000, false), 2200)?.tex).toBe('swing');
  });
});

describe('格闘: 絵(クリエイティブ監査)', () => {
  it('2段目は絵を反転して逆の手を形で見せる・1段目は反転しない', () => {
    expect(brawlerPoseAt(brawlerStartAttack(initialBrawlerState(), 2, 0, false), 30)?.flip).toBe(true);
    expect(brawlerPoseAt(brawlerStartAttack(initialBrawlerState(), 1, 0, false), 30)?.flip).toBe(false);
  });
  it('気功: 溜め=振り上げ / 放つ=しゃがみ。飛び蹴り: 滞空=しゃがみ / 当たった瞬間=振り上げ', () => {
    const k = brawlerStartTech(initialBrawlerState(), 'kiko', 0);
    expect(brawlerPoseAt(k, 60)?.tex).toBe('swing');
    expect(brawlerPoseAt({ ...k, resolved: true }, 140)?.tex).toBe('ready');
    const f = brawlerStartTech(initialBrawlerState(), 'kick', 0, 1);
    expect(brawlerPoseAt(f, 60)?.tex).toBe('ready');
    expect(brawlerPoseAt({ ...f, resolved: true }, 125)?.tex).toBe('swing');
  });
  it('★大踏み潰しは跳ばない: 溜めの間はその場で震え(始めは弱く・叩く直前が最大)、叩いた瞬間に震えが止まる(社長指示2026-11-08)', () => {
    const st = brawlerStartTech(initialBrawlerState(), 'stomp', 0);
    const w = st.windupMs;
    let early = 0, late = 0;
    for (let t = 0; t < w; t += 2) {
      const ps = brawlerPoseAt(st, t)!;
      expect(ps.jump).toBe(0);
      expect(ps.tex).toBe('swing');
      const amp = Math.abs(ps.shakeX ?? 0);
      if (t < w * 0.3) early = Math.max(early, amp); else if (t > w * 0.8) late = Math.max(late, amp);
    }
    expect(early).toBeLessThan(late * 0.25);
    expect(late).toBeGreaterThan(BRAWLER_STOMP_SHAKE_PX * 0.6);
    expect(brawlerStompShake(0, w).x).toBe(0); // 震え始めは0(慣性)
    const after = brawlerPoseAt({ ...st, resolved: true }, w + 10)!;
    expect(after.tex).toBe('ready');
    expect(after.jump).toBe(0);
    expect(after.shakeX ?? 0).toBe(0);
    expect(after.lean).toBeGreaterThan(0.1); // 前へ倒れ込んで拳を振り下ろす
  });
  it('掌底は抜けた先で伸び切った形のまま一拍止まる(戻りの最初は前傾が最大のまま・§9-26)', () => {
    const s = { ...brawlerStartAttack(initialBrawlerState(), 5, 0, false), resolved: true };
    expect(brawlerPoseAt(s, 260)?.lean).toBe(brawlerPoseAt(s, 330)?.lean);
    expect(brawlerPoseAt(s, 260)!.lean).toBeGreaterThanOrEqual(0.45);
  });
  it('5段目: 溜め(前隙−突き抜け)が終わった時に踏み出す・受けた直後は溜めだけ消える', () => {
    const s = brawlerStartAttack(initialBrawlerState(), 5, 0, false);
    expect(brawlerPalmDashDue(s, 99)).toBe(false);
    expect(brawlerPalmDashDue(s, 100)).toBe(true);
    expect(brawlerPalmDashDue({ ...s, palmFromX: 0, palmFromY: 0 }, 120)).toBe(false);
    expect(isBrawlerPalmDashing({ ...s, palmFromX: 0, palmFromY: 0 })).toBe(true);
    const q = brawlerStartAttack(initialBrawlerState(), 5, 0, true);
    expect(q.windupMs).toBe(BRAWLER_PALM_DASH_MS);
    expect(brawlerPalmDashDue(q, 0)).toBe(true);
  });
  it('5段目の吹き飛ばしは軌跡の横へ外向き+前へ少し(左右に割れる)', () => {
    const up = brawlerPassKbDir(50, -10, 0, 0, 1, 0, 1);
    const dn = brawlerPassKbDir(50, 10, 0, 0, 1, 0, 1);
    expect(up.y).toBeLessThan(0);
    expect(dn.y).toBeGreaterThan(0);
    expect(up.x).toBeGreaterThan(0);
    expect(Math.sign(brawlerPassKbDir(50, 0, 0, 0, 1, 0, -1).y)).toBe(-Math.sign(brawlerPassKbDir(50, 0, 0, 0, 1, 0, 1).y)); // 軌跡の上は side で左右に振り分ける
  });
  it('段ごとの音程は等間隔に下げない', () => {
    const steps = [1, 2, 3, 4].map(i => +(BRAWLER_HIT_PITCH[i] - BRAWLER_HIT_PITCH[i + 1]).toFixed(3));
    expect(new Set(steps).size).toBeGreaterThan(1);
  });
  it('当たりの音(社長支給2026-11-11): 1・2段目=パンチ/3〜5段目=重い打撃・どの段も少し早回し', () => {
    expect([1, 2].map(st => brawlerStageHitSfx(st).key)).toEqual(['brawler-punch', 'brawler-punch']);
    expect([3, 4, 5].map(st => brawlerStageHitSfx(st).key)).toEqual(['brawler-heavy', 'brawler-heavy', 'brawler-heavy']);
    for (const st of [1, 2, 3, 4, 5]) expect(brawlerStageHitSfx(st).rate).toBeGreaterThan(1);
    expect(brawlerKickHitSfx(false).key).toBe('brawler-kick');
    expect(brawlerKickHitSfx(true).gain).toBeGreaterThan(brawlerKickHitSfx(false).gain); // 3発目は大きく
  });
});

describe('格闘: 速い踏み込みの刻み(A-1)と動きの影', () => {
  it('刻みごとに押し出しを通し、押された刻みで止まる', () => {
    // y=20 から下は壁(上へ押し返す)
    const solve = (r: { x: number; y: number; width: number; height: number }) => ({ x: r.x, y: Math.min(r.y, 20 - r.height) });
    const out = sweepResolve(0, 0, 0, 60, 10, 10, 6, solve);
    expect(out.stopped).toBe(true);
    expect(out.y).toBe(10);
    expect(sweepResolve(0, 0, 0, 5, 10, 10, 6, solve).stopped).toBe(false);
  });
  it('影: 前隙で体から前へにじみ出る→当たる瞬間に伸び切る→戻りで前へ抜けながら消える', () => {
    const s = brawlerStartAttack(initialBrawlerState(), 1, 0, false);
    const a = brawlerStandAt(s, 10)!, b = brawlerStandAt(s, 50)!;
    expect(a.kind).toBe('punch');
    expect(b.ext).toBeGreaterThan(a.ext);
    expect(b.ext).toBeLessThan(1);
    const hit = brawlerStandAt({ ...s, resolved: true }, 60)!;
    expect(hit.ext).toBe(1);
    const late = brawlerStandAt({ ...s, resolved: true }, 190)!;
    expect(late.ext).toBeGreaterThan(1);
    expect(late.alpha).toBeLessThan(hit.alpha);
    expect(brawlerStandAt({ ...s, phase: 'idle' }, 60)).toBeNull();
  });
  it('影の割り当て: 2段目=逆の手 / 3段=heavy / 4段・下=slam / 5段=palm / 上=guard / 左=hadou / 右=kick', () => {
    const at = (st: number) => brawlerStandAt(brawlerStartAttack(initialBrawlerState(), st, 0, false), 5)!;
    expect([at(1).kind, at(1).light, at(2).kind, at(2).light, at(3).kind, at(4).kind, at(5).kind]).toEqual(['punch', false, BRAWLER_STAND_STAGE2_KIND, true, 'heavy', 'slam', 'palm']);
    expect(['heavy', 'palm']).toContain(BRAWLER_STAND_STAGE2_KIND); // 社長指示「2段目は強パンチか掌底の絵」
    // 2段目は3段目・5段目より控えめ(薄く・早く消える)
    const s2 = brawlerStartAttack(initialBrawlerState(), 2, 0, false), s3 = brawlerStartAttack(initialBrawlerState(), 3, 0, false);
    expect(brawlerStandAt({ ...s2, resolved: true }, s2.windupMs + 1)!.alpha).toBeLessThan(brawlerStandAt({ ...s3, resolved: true }, s3.windupMs + 1)!.alpha);
    expect(brawlerStandAt({ ...s2, resolved: true }, s2.windupMs + s2.recoveryMs * 0.7)!.alpha).toBe(0);
    const tk = (k: 'guard' | 'stomp' | 'kiko' | 'kick') => brawlerStandAt(brawlerStartTech(initialBrawlerState(), k, 0), 5)!;
    expect([tk('guard').kind, tk('stomp').kind, tk('stomp').big, tk('kiko').kind, tk('kick').kind]).toEqual(['guard', 'slam', true, 'hadou', 'kick']);
  });
});

describe('格闘: 飛び蹴りの飛距離(社長指示2026-11-07)', () => {
  it('届く距離220・居ない時150。飛ぶ時間は旧の距離(160)まで120ms、その先は最大150ms(最高速は約1割上まで)', () => {
    expect([BRAWLER_KICK_RANGE, BRAWLER_KICK_NO_TARGET_PX]).toEqual([220, 150]);
    expect(brawlerKickFlightMs(80)).toBe(120);
    expect(brawlerKickFlightMs(160)).toBe(120);
    expect(brawlerKickFlightMs(220)).toBe(150);
    const vmax = (d: number) => d / brawlerKickFlightMs(d);
    expect(vmax(220) / vmax(160)).toBeLessThan(1.15);
    expect(vmax(220) / vmax(160)).toBeGreaterThanOrEqual(1);
  });
});

describe('フリックの距離は全方向20px(社長承認2026-11-07・格闘/一閃/ワイヤー/被弾反撃/リズム)', () => {
  const swipe = (dx: number, dy: number, ms = 20) => [{ x: 200, y: 200, t: 0 }, { x: 200 + dx, y: 200 + dy, t: ms }];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  it('格闘・一閃・ワイヤー・被弾反撃(共有の判定と KATANA_FLICK_*): どの向きでも 25px→成立 / 15px→不成立', () => {
    expect(KATANA_FLICK_MIN_DIST).toBe(20);
    for (const [x, y] of dirs) {
      expect(detectFlickFromSamples(swipe(x * 25, y * 25), KATANA_FLICK_WINDOW_MS, KATANA_FLICK_MIN_DIST, KATANA_FLICK_MIN_SPEED)).not.toBeNull();
      expect(detectFlickFromSamples(swipe(x * 15, y * 15), KATANA_FLICK_WINDOW_MS, KATANA_FLICK_MIN_DIST, KATANA_FLICK_MIN_SPEED)).toBeNull();
    }
  });
  it('四神のリズム(RHYTHM_FLICK_*・同じ判定の式): どの向きでも 25px→成立 / 15px→不成立', () => {
    for (const [x, y] of dirs) {
      expect(detectFlickFromSamples(swipe(x * 25, y * 25), RHYTHM_FLICK_FIRE_WINDOW_MS, RHYTHM_FLICK_FIRE_DIST, RHYTHM_FLICK_FIRE_SPEED)).not.toBeNull();
      expect(detectFlickFromSamples(swipe(x * 15, y * 15), RHYTHM_FLICK_FIRE_WINDOW_MS, RHYTHM_FLICK_FIRE_DIST, RHYTHM_FLICK_FIRE_SPEED)).toBeNull();
    }
  });
  it('速さの条件はそのまま(25px でも遅ければ不成立)', () => {
    expect(detectFlickFromSamples(swipe(25, 0, 60), KATANA_FLICK_WINDOW_MS, KATANA_FLICK_MIN_DIST, KATANA_FLICK_MIN_SPEED)).toBeNull();
  });
});

describe('秘奥義(research/BRAWLER.md §10)', () => {
  // 実際に出た技を順に流す。各要素 [技, 蹴りの何発目, 発動時刻, その技の終わりの時刻, (蹴りが当たったか=既定は当たった)]。
  const run = (seq: [string, number, number, number, boolean?][]) => {
    let progress = 0, lastEnd = 0, fired = false;
    for (const [k, n, at, end, hit] of seq) {
      const r = brawlerSecretStep(progress, lastEnd, k as never, n, at);
      progress = r.progress; fired = fired || r.fire;
      if (k === 'kick') progress = brawlerSecretAfterKick(progress, hit !== false); // 蹴りの判定の結果(1手目は当たった時だけ)
      lastEnd = end;
    }
    return { progress, fired };
  };
  it('★1手目の→飛び蹴りは敵に当たった時だけ数える(社長指示2026-11-08「1発目は敵に当たっていること」)', () => {
    expect(run([['kick', 1, 0, 270, false], ['stomp', 0, 500, 1100], ['kiko', 0, 1300, 1750], ['guard', 0, 2100, 3100]]).fired).toBe(false);
    expect(run([['kick', 1, 0, 270, false]]).progress).toBe(0);
    expect(run([['kick', 1, 0, 270, true]]).progress).toBe(1);
    // 1発目が外れても、続きの2発目が当たれば1手目になる
    expect(run([['kick', 1, 0, 270, false], ['kick', 2, 300, 570, true], ['stomp', 0, 700, 1300], ['kiko', 0, 1400, 1850], ['guard', 0, 2000, 3000]]).fired).toBe(true);
    // 出た瞬間は数えない(判定の前に次の技が来ても、判定の結果で決まる)
    expect(brawlerSecretStep(0, 0, 'kick', 1, 0).progress).toBe(0);
    expect(brawlerSecretAfterKick(0, true)).toBe(1);
    expect(brawlerSecretAfterKick(2, true)).toBe(2);
  });
  it('→↓←↑ を、前の技の終わりから400ms以内に続ければ成立', () => {
    expect(run([['kick', 1, 0, 270], ['stomp', 0, 500, 1100], ['kiko', 0, 1300, 1750], ['guard', 0, 2100, 3100]]).fired).toBe(true);
  });
  it('順番違い・間が空いた・最初が→でない、は成立しない', () => {
    expect(run([['stomp', 0, 0, 600], ['kick', 1, 700, 970], ['kiko', 0, 1200, 1650], ['guard', 0, 2000, 3000]]).fired).toBe(false);
    expect(run([['kick', 1, 0, 270], ['stomp', 0, 270 + BRAWLER_SECRET_GAP_MS + 1, 1300], ['kiko', 0, 1400, 1850], ['guard', 0, 2000, 3000]]).fired).toBe(false);
    expect(run([['kick', 1, 0, 270], ['kiko', 0, 400, 850], ['stomp', 0, 900, 1500], ['guard', 0, 1600, 2600]]).fired).toBe(false);
  });
  it('蹴りの2・3発目は数え直さない(最初の→のまま↓を待つ)・間違えたら→から数え直し', () => {
    expect(run([['kick', 1, 0, 270], ['kick', 2, 300, 570], ['kick', 3, 600, 870], ['stomp', 0, 1000, 1600], ['kiko', 0, 1700, 2150], ['guard', 0, 2300, 3300]]).fired).toBe(true);
    expect(run([['kick', 1, 0, 270], ['kiko', 0, 400, 850]]).progress).toBe(0);
    expect(run([['stomp', 0, 0, 600], ['kick', 1, 700, 970]]).progress).toBe(1);
  });
  it('通常攻撃が挟まると数え直し(段の始まり・終わりで進みを0へ)', () => {
    const s0 = { ...initialBrawlerState(), secretProgress: 2, secretLastEndAt: 100 };
    expect(brawlerStartAttack(s0, 1, 200, false).secretProgress).toBe(0);
    expect(brawlerFinish({ ...s0, phase: 'attack', stage: 1 }, 300).state.secretProgress).toBe(0);
    expect(brawlerFinish({ ...s0, phase: 'tech', tech: 'stomp' }, 300).state.secretLastEndAt).toBe(300);
  });
  it('流れ: 起動→9発→落下→着地→終わり。終わりは技ポイント0・段は1段目', () => {
    const s = brawlerSecretStart({ ...initialBrawlerState(), points: 9 }, 0, 0);
    expect(brawlerSecretDue(s.secret!, 599)).toBeNull();
    expect(brawlerSecretDue(s.secret!, 600)).toBe('strike');
    expect(brawlerSecretDue({ ...s.secret!, phase: 'strike', hits: BRAWLER_SECRET_STRIKES - 1, nextAt: 0 }, 1)).toBe('strike');
    expect(brawlerSecretDue({ ...s.secret!, phase: 'strike', hits: BRAWLER_SECRET_STRIKES, nextAt: 0 }, 1)).toBe('fall');
    expect(brawlerSecretDue({ ...s.secret!, phase: 'fall', nextAt: 0 }, 1)).toBe('land');
    expect(brawlerSecretDue({ ...s.secret!, phase: 'land', nextAt: 0 }, 1)).toBe('end');
    const e = brawlerSecretEnd({ ...s, points: 7, nextStage: 4 });
    expect([e.points, e.nextStage, e.secret]).toEqual([0, 1, undefined]);
  });
  it('9連撃の選び方: 技は8種のどれか・相手は画面内の敵から1体・居なければ null(中断)', () => {
    const seen = new Set(Array.from({ length: 80 }, (_, i) => brawlerSecretPickMove(i / 80)));
    expect([...seen].sort()).toEqual([...BRAWLER_SECRET_MOVES].sort());
    expect(brawlerSecretPickMove(0.9999)).toBe('kiko');
    expect(brawlerSecretPickTarget(['a', 'b', 'c'], 0.5)).toBe('b');
    expect(brawlerSecretPickTarget([], 0.5)).toBeNull();
  });
});


// ★§19(2026-11-10)で書き換えた: 旧「技が当たれば後隙の終わりまで別の技で取り消せる(同じ技以外・各技1回・構えは当たらなくてもいつでも)」は
//   道の表(brawlerRouteAllows)+「当たった時だけ」+取り消しの受付(BRAWLER_CANCEL_WINDOW_MS)に置き換わった。道の表そのものは brawlerRoute.test.ts。
describe('取り消し(research/BRAWLER.md §19-1・§19-2・旧 §11-4 の技→技のキャンセル)', () => {
  /** 技を始めて判定まで進め、当たり(hits)を解いた状態。 */
  const techResolved = (kind: 'stomp' | 'kiko' | 'kick' | 'guard', hits: number, t0 = 0, base = initialBrawlerState(), cancel = false) => {
    const s = brawlerStartTech(base, kind, t0, kind === 'kick' ? 1 : 0, cancel);
    const at = t0 + s.windupMs;
    return { s: brawlerAfterResolve(s, at, hits, { pointCap: 20, countPoint: false, hitstopMs: kind === 'stomp' ? 140 : kind === 'kick' ? 80 : 0 }), at };
  };
  it('当たった技の後隙は、止めが明けてから受付(150ms)の間だけ、道の先の技で取り消せる', () => {
    expect(BRAWLER_CANCEL_WINDOW_MS).toBe(150);
    const { s, at } = techResolved('stomp', 1);
    expect(brawlerTechAllowed(s, 'kiko', at + 50)).toBe(false); // 止めの間
    expect(brawlerTechAllowed(s, 'kiko', at + 141)).toBe(true);
    expect(brawlerTechAllowed(s, 'kick', at + 141)).toBe(true);  // §20-3: 取り消せる技の後は 飛び蹴り・気功(自分と同じ大踏み潰しは出せない・構えも出せない)
    expect(brawlerTechAllowed(s, 'stomp', at + 141)).toBe(false);
    expect(brawlerTechAllowed(s, 'guard', at + 141)).toBe(false);
    expect(brawlerTechAllowed(s, 'kiko', at + 140 + BRAWLER_CANCEL_WINDOW_MS - 1)).toBe(true);
    expect(brawlerTechAllowed(s, 'kiko', at + 140 + BRAWLER_CANCEL_WINDOW_MS)).toBe(false); // 受付の外=後隙が終わるまで何も出せない
    expect(brawlerTechAllowed(s, 'kiko', at + 140 + BRAWLER_TECHS.stomp.recoveryMs - 1)).toBe(false);
  });
  it('当たらなかった技からは取り消せない(構えも後隙からは出せない=殴っている間は守れない)', () => {
    const { s, at } = techResolved('stomp', 0);
    expect(brawlerTechAllowed(s, 'kiko', at + 10)).toBe(false);
    expect(brawlerTechAllowed(s, 'kick', at + 10)).toBe(false);
    expect(brawlerTechAllowed(s, 'guard', at + 10)).toBe(false);
    // 触れたが防がれた当たり(相手のレバーガード=landed 0)も「当たっていない」
    const pre = brawlerStartTech(initialBrawlerState(), 'stomp', 0);
    const guarded = brawlerAfterResolve(pre, pre.windupMs, 1, { pointCap: 20, countPoint: false, hitstopMs: 140, landed: 0 });
    expect(guarded.connected).toBe(true);
    expect(brawlerTechAllowed(guarded, 'kiko', pre.windupMs + 141)).toBe(false);
    // 出る前(前隙)は何も出せない
    expect(brawlerTechAllowed(pre, 'guard', 50)).toBe(false);
    expect(brawlerTechAllowed(pre, 'kiko', 50)).toBe(false);
  });
  it('飛び蹴りの連続は今どおり(判定の後ならいつでも・当たっていなくても)。3発目(締め)からは出せない。蹴り→大踏み潰しは取り消し', () => {
    const k = techResolved('kick', 1);
    expect(brawlerTechAllowed(k.s, 'kick', k.at + 10)).toBe(true);  // 止めの間でも次の蹴り
    expect(brawlerTechAllowed(k.s, 'stomp', k.at + 10)).toBe(false); // 取り消しは止めが明けてから
    expect(brawlerTechAllowed(k.s, 'stomp', k.at + 81)).toBe(true);
    expect(brawlerTechAllowed(k.s, 'kiko', k.at + 81)).toBe(true);   // §20-3: 取り消せる技の後は 大踏み潰し・気功
    expect(brawlerTechAllowed(k.s, 'guard', k.at + 81)).toBe(false);
    const whiff = techResolved('kick', 0);
    expect(brawlerTechAllowed(whiff.s, 'kick', whiff.at + 10)).toBe(true);
    expect(brawlerTechAllowed(whiff.s, 'stomp', whiff.at + 10)).toBe(false);
    const k3 = brawlerAfterResolve(brawlerStartTech(initialBrawlerState(), 'kick', 0, 3), 400, 1, { pointCap: 20, countPoint: false, hitstopMs: 140 });
    expect(brawlerTechAllowed(k3, 'kick', 600)).toBe(false);
    expect(brawlerTechAllowed(k3, 'stomp', 600)).toBe(false);
  });
  it('取り消しで続けた技は流れ(techChain)に並ぶ・取り消しでない技は始め直す・構えからは取り消せない', () => {
    const a = techResolved('stomp', 1);
    const b = techResolved('kiko', 1, a.at + 200, a.s, true);
    expect(b.s.techChain).toEqual(['stomp', 'kiko']);
    const s = brawlerStartTech({ ...initialBrawlerState(), techChain: ['stomp', 'kiko'] }, 'kick', 0, 1);
    expect(s.techChain).toEqual(['kick']);
    expect(brawlerStartTech(s, 'kick', 300, 2).techChain).toEqual(['kick']); // 連続の続きは流れをそのまま
    const g = techResolved('guard', 0);
    expect(brawlerTechCancelOk(g.s, 'kick', 100)).toBe(false);
    expect(brawlerTechAllowed(g.s, 'kick', 100)).toBe(false);
  });
  it('技→通常は取り消せない(技の最中の押下は先行入力で、技が終わってから1段目)', () => {
    const { s, at } = techResolved('stomp', 1);
    expect(brawlerPressDecision(s, at + 200)).toBe('buffer');
    expect(brawlerStartAttack(s, 1, at + 800, false).techChain).toBeUndefined();
  });
  it('秘奥義の条件はキャンセルで繋いでも成立する(キャンセルは0ms扱い=前の技の終わり=いま)', () => {
    // → (当たった)→ ↓ をキャンセル → ← をキャンセル → ↑ をキャンセル。終わりを待たずに繋ぐ。
    let p = 0;
    for (const [k, n, at] of [['kick', 1, 0], ['stomp', 0, 200], ['kiko', 0, 800], ['guard', 0, 1100]] as const) {
      const r = brawlerSecretStep(p, at, k, n, at); // キャンセル=前の技の終わりを「いま」として渡す
      p = k === 'kick' ? brawlerSecretAfterKick(r.progress, true) : r.progress;
      if (k === 'guard') expect(r.fire).toBe(true);
    }
  });
});

describe('流れの当たりの数(拳鬼のダメージ補正が読む。プレイヤーの「N HIT」は brawlerCombo の brawlerLinkDisplay=§23)', () => {
  it('当たりを足す・流れが切れていたら数え直す', () => {
    let s = brawlerFlowOnHit(initialBrawlerState(), 1);
    expect(s.flowHits).toBe(1);
    s = brawlerFlowOnHit(s, 2);
    expect(s.flowHits).toBe(3);
    s = { ...s, flowBrokenAt: 500 };
    s = brawlerFlowOnHit(s, 1);
    expect([s.flowHits, s.flowBrokenAt]).toEqual([1, 0]);
    expect(brawlerFlowOnHit(s, 0)).toBe(s);
  });
});

describe('技の先行入力(社長指示2026-11-08「技の先行入力だけ採用」・§9-60・§19-2)', () => {
  it('行動の最中で今は出せない技を覚える: 判定の前は「道の上の技」だけ(道に無い技・自分と同じ技は覚えない)/ 判定の後(後隙)に押した技は道の外・空振りでも1つ覚える(§25)', () => {
    const s = brawlerStartTech(initialBrawlerState(), 'stomp', 0);
    expect(brawlerShouldBufferTech(s, 'kiko', 50)).toBe(true);            // 前隙・道の上(大踏み潰し→気功)
    expect(brawlerShouldBufferTech(s, 'kick', 50)).toBe(true);            // §20-3: 大踏み潰し→飛び蹴りも取り消せる
    expect(brawlerShouldBufferTech(s, 'stomp', 50)).toBe(false);          // 道に無い(自分と同じ技)
    expect(brawlerShouldBufferTech(s, 'guard', 50)).toBe(false);
    const hit = brawlerAfterResolve(s, 200, 1, { pointCap: 20, countPoint: false, hitstopMs: 140 });
    expect(brawlerShouldBufferTech(hit, 'kiko', 250)).toBe(true);         // 止めの間(受付が開く前)
    expect(brawlerShouldBufferTech(hit, 'kiko', 360)).toBe(false);        // 受付の内=取り消しで即座に出る
    expect(brawlerShouldBufferTech(hit, 'kiko', 200 + 140 + BRAWLER_CANCEL_WINDOW_MS + 10)).toBe(true);  // 受付を過ぎた後隙=§25 で覚える(後隙の終わりに待機から出す)
    expect(brawlerLateCarry(hit, 'kiko', 200 + 140 + BRAWLER_CANCEL_WINDOW_MS + 10)).toBe(true);
    expect(brawlerLateCarry(hit, 'kiko', 360)).toBe(false);               // 受付の内は出せる=覚えるのではなく即座に出る
    expect(brawlerLateCarry(s, 'kiko', 50)).toBe(false);                  // 判定の前(出だし)は後隙ではない
    const miss = brawlerAfterResolve(s, 200, 0, { pointCap: 20, countPoint: false, hitstopMs: 140 });
    expect(brawlerShouldBufferTech(miss, 'kiko', 250)).toBe(true);        // 空振りの後隙=§25 で覚える(当たりを問わない)
    expect(brawlerShouldBufferTech(miss, 'stomp', 250)).toBe(true);       // 道の外の技(自分と同じ技)でも後隙なら覚える
    const g = brawlerStartTech(initialBrawlerState(), 'guard', 0);
    expect(brawlerShouldBufferTech(g, 'guard', 100)).toBe(false);         // 構えの延長
    expect(brawlerShouldBufferTech(g, 'kick', 100)).toBe(false);          // 構えの間の他の技は覚えない(旧: 構えの後に出していた)
    expect(brawlerShouldBufferTech(initialBrawlerState(), 'kick', 0)).toBe(false); // 待機中は即座に出る
    // 通常攻撃の最中: 道の上の技(1段目→飛び蹴り)は出だしで覚える・道に無い技は覚えない(旧: 通常攻撃のどこからでも即座に出た)
    const a1 = brawlerStartAttack(initialBrawlerState(), 1, 0, false);
    expect(brawlerShouldBufferTech(a1, 'kick', 30)).toBe(true);
    expect(brawlerShouldBufferTech(a1, 'stomp', 30)).toBe(true);          // §20-3: 通常の段からは 飛び蹴り・大踏み潰し・気功
    expect(brawlerShouldBufferTech(a1, 'guard', 30)).toBe(false);         // 構えは待機からだけ
    expect(brawlerTechAllowed(a1, 'kick', 30)).toBe(false);
    // 飛び蹴りの連続: 判定の前に入れた次の蹴りは覚える(今どおり)
    const k1 = brawlerStartTech(initialBrawlerState(), 'kick', 0, 1);
    expect(brawlerShouldBufferTech(k1, 'kick', 30)).toBe(true);
    expect(brawlerShouldBufferTech(k1, 'stomp', 30)).toBe(true);          // 蹴り→大踏み潰しも道の上
  });
  it('覚えた技の扱い: 受付が開いたら出す・当たらなかった/待機へ戻ったら捨てる(後隙の終わりに勝手に出さない)', () => {
    const s = { ...brawlerStartTech(initialBrawlerState(), 'stomp', 0), techBuffer: 'kiko' as const };
    expect(brawlerTechBufferDecision(initialBrawlerState(), 0)).toBeNull();
    expect(brawlerTechBufferDecision(s, 50)).toBe('wait');
    const hit = { ...brawlerAfterResolve(s, 200, 1, { pointCap: 20, countPoint: false, hitstopMs: 140 }), techBuffer: 'kiko' as const };
    expect(brawlerTechBufferDecision(hit, 250)).toBe('wait');
    expect(brawlerTechBufferDecision(hit, 341)).toBe('fire');
    const miss = { ...brawlerAfterResolve(s, 200, 0, { pointCap: 20, countPoint: false, hitstopMs: 140 }), techBuffer: 'kiko' as const };
    expect(brawlerTechBufferDecision(miss, 201)).toBe('drop');
    expect(brawlerTechBufferDecision({ ...brawlerFinish(miss, 600).state, techBuffer: 'kiko' }, 600)).toBe('drop');
    // 飛び蹴りの連続は今どおり: 判定を解いた瞬間に(当たっていなくても)出す
    const k = { ...brawlerStartTech(initialBrawlerState(), 'kick', 0, 1), techBuffer: 'kick' as const };
    expect(brawlerTechBufferDecision(k, 30)).toBe('wait');
    const kw = { ...brawlerAfterResolve(k, 120, 0, { pointCap: 20, countPoint: false, hitstopMs: 80 }), kickCount: 1, techBuffer: 'kick' as const };
    expect(brawlerTechBufferDecision(kw, 121)).toBe('fire');
  });
  it('被弾・取り消しで捨てる / 技を出したら消える', () => {
    const s = { ...brawlerStartTech(initialBrawlerState(), 'stomp', 0), techBuffer: 'kiko' as const };
    expect(brawlerOnHurt(s).techBuffer).toBeUndefined();
    expect(brawlerCancel(s).techBuffer).toBeUndefined();
    expect(brawlerStartTech(s, 'kiko', 600).techBuffer).toBeUndefined();
  });
});

describe('ジャスト構え(research/BRAWLER.md §12-2)', () => {
  it('構え(または延長)から120ms以内の受けがジャスト(境目を含む)', () => {
    const g = brawlerStartTech(initialBrawlerState(), 'guard', 1000);
    expect(brawlerIsJustGuard(g, 1000)).toBe(true);
    expect(brawlerIsJustGuard(g, 1000 + BRAWLER_JUST_MS)).toBe(true);
    expect(brawlerIsJustGuard(g, 1000 + BRAWLER_JUST_MS + 1)).toBe(false);
    expect(brawlerIsJustGuard(initialBrawlerState(), 1000)).toBe(false); // 構えていない
  });
});

describe('ステップ(research/BRAWLER.md §12-3)', () => {
  it('距離100px・180ms・加速→減速(出だしと終わりが0)', () => {
    expect([BRAWLER_STEP_PX, BRAWLER_STEP_MS]).toEqual([100, 180]);
    expect(brawlerStepFactor(0)).toBe(0);
    expect(brawlerStepFactor(1)).toBe(0);
    expect(brawlerStepFactor(0.5)).toBeCloseTo(1);
    const v = brawlerStepSpeed(BRAWLER_STEP_PX, BRAWLER_STEP_MS);
    let d = 0;
    for (let i = 0; i < 1800; i++) d += v * brawlerStepFactor((i + 0.5) / 1800) * (BRAWLER_STEP_MS / 1000 / 1800);
    expect(d).toBeCloseTo(BRAWLER_STEP_PX, 0);
  });
  it('待機と、当たった1〜4段目の後隙からは出せる。前隙・止めの間・構え・ステップの最中・空振り・5段目・技の後隙は出せない(§19-1)', () => {
    expect(brawlerStepAllowed(initialBrawlerState(), 0)).toBe(true);
    const a = brawlerStartAttack(initialBrawlerState(), 1, 0, false);
    expect(brawlerStepAllowed(a, 30)).toBe(false);                       // 前隙
    const hit = brawlerAfterResolve(a, 60, 1, { pointCap: 5, countPoint: true, hitstopMs: 45 });
    expect(brawlerStepAllowed(hit, 80)).toBe(false);                     // 止めの間
    expect(brawlerStepAllowed(hit, 110)).toBe(true);                     // 後隙=取り消せる
    // ★§19-1: 空振り・防がれた当たり・5段目・技の後隙は取り消せない(旧: 判定の後ならどれでも取り消せた)
    expect(brawlerStepAllowed(brawlerAfterResolve(a, 60, 0, { pointCap: 5, countPoint: true, hitstopMs: 45 }), 110)).toBe(false);
    expect(brawlerStepAllowed(brawlerAfterResolve(a, 60, 1, { pointCap: 5, countPoint: true, hitstopMs: 45, landed: 0 }), 110)).toBe(false);
    for (const st of [2, 3, 4]) {
      const x = brawlerStartAttack(initialBrawlerState(), st, 0, false);
      expect(brawlerStepAllowed(brawlerAfterResolve(x, x.windupMs, 1, { pointCap: 5, countPoint: true, hitstopMs: 45 }), x.windupMs + 50)).toBe(true);
    }
    const a5 = brawlerStartAttack(initialBrawlerState(), 5, 0, false);
    expect(brawlerStepAllowed(brawlerAfterResolve(a5, a5.windupMs, 1, { pointCap: 5, countPoint: true, hitstopMs: 45 }), a5.windupMs + 50)).toBe(false);
    for (const k of ['kick', 'stomp', 'kiko'] as const) {
      const x = brawlerStartTech(initialBrawlerState(), k, 0, k === 'kick' ? 1 : 0);
      expect(brawlerStepAllowed(brawlerAfterResolve(x, x.windupMs, 1, { pointCap: 5, countPoint: false, hitstopMs: 45 }), x.windupMs + 50)).toBe(false);
    }
    const g = brawlerStartTech(initialBrawlerState(), 'guard', 0);
    expect(brawlerStepAllowed(g, 100)).toBe(false);                      // 構え
    const st = brawlerStepStart(hit, 110, 0);
    expect(st.phase).toBe('idle');
    expect(st.nextStage).toBe(2);                                        // 段のつながりは残る
    expect(brawlerStepAllowed(st, 200)).toBe(false);                     // ステップの最中
    expect(brawlerStepAllowed(st, 110 + BRAWLER_STEP_MS)).toBe(true);
  });  it('先行の覚え(§12-3b): 受け付けない時間に成立したステップは、受け付けられるようになった瞬間に出す(成立から200ms以内・1つだけ)', () => {
    expect(BRAWLER_STEP_BUFFER_MS).toBe(200);
    expect(brawlerStepBufferDecision(initialBrawlerState(), 0)).toBeNull(); // 覚えていない
    const a = brawlerStartAttack(initialBrawlerState(), 1, 0, false);
    const hit = brawlerAfterResolve(a, 60, 1, { pointCap: 5, countPoint: true, hitstopMs: 45 });
    // 止めの間(t=70)に成立 → 止めが明けた t=110 で出す
    const b = brawlerBufferStep(hit, -1, 0, 70);
    expect(b.stepBuffer).toEqual({ x: -1, y: 0, at: 70 });
    expect(brawlerStepBufferDecision(b, 80)).toBe('wait');
    expect(brawlerStepBufferDecision(b, 110)).toBe('fire');
    // 前隙の頭(t=0)に成立 → 200ms ちょうどまでは出せる・それを過ぎたら捨てる
    const late = brawlerBufferStep(brawlerStartTech(initialBrawlerState(), 'guard', 0), 1, 0, 0);
    expect(brawlerStepBufferDecision(late, BRAWLER_STEP_BUFFER_MS)).toBe('wait');   // 構えの最中はまだ
    expect(brawlerStepBufferDecision(late, BRAWLER_STEP_BUFFER_MS + 1)).toBe('expire');
    const idle = brawlerBufferStep(initialBrawlerState(), 1, 0, 0);
    expect(brawlerStepBufferDecision(idle, BRAWLER_STEP_BUFFER_MS)).toBe('fire');
    expect(brawlerStepBufferDecision(idle, BRAWLER_STEP_BUFFER_MS + 1)).toBe('expire');
    expect(brawlerStepBufferDecision(idle, -1)).toBe('expire');                    // 時計が戻った
    // 1つだけ(上書き)・他の先行入力は捨てる(最後の入力を優先)
    const two = brawlerBufferStep({ ...b, buffered: true, techBuffer: 'kick' }, 0, 1, 90);
    expect(two.stepBuffer).toEqual({ x: 0, y: 1, at: 90 });
    expect(two.buffered).toBe(false);
    expect(two.techBuffer).toBeUndefined();
    // 出した・取り消した・通常攻撃/技を始めた時は消える
    expect(brawlerStepStart(b, 110, 0).stepBuffer).toBeUndefined();
    expect(brawlerCancel(b).stepBuffer).toBeUndefined();
    expect(brawlerStartAttack(idle, 1, 10, false).stepBuffer).toBeUndefined();
    expect(brawlerStartTech(idle, 'kick', 10).stepBuffer).toBeUndefined();
  });
});
