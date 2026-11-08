import { KATANA_FLICK_MIN_DIST, KATANA_FLICK_WINDOW_MS, KATANA_FLICK_MIN_SPEED } from '../store/gameStore';
import { RHYTHM_FLICK_FIRE_DIST, RHYTHM_FLICK_FIRE_SPEED, RHYTHM_FLICK_FIRE_WINDOW_MS } from '../config/shijin';
import { describe, expect, it } from 'vitest';
import type { Enemy } from '../types/game';
import {
  BRAWLER_STAGES, BRAWLER_TECHS, brawlerPointCap, brawlerAfterAmmoPickup, BRAWLER_AMMO_PICKUP_POINTS, brawlerAfterGuardCounter, brawlerTechCost,
  brawlerPalmDashDue, isBrawlerPalmDashing, brawlerKickFlightMs, BRAWLER_KICK_RANGE, BRAWLER_KICK_NO_TARGET_PX, brawlerPassKbDir, BRAWLER_PALM_DASH_MS, sweepResolve, brawlerStandAt, BRAWLER_STAND_STAGE2_KIND, brawlerSecretStep, brawlerSecretDue, brawlerSecretPickMove, brawlerSecretPickTarget, brawlerSecretStart, brawlerSecretEnd, BRAWLER_SECRET_GAP_MS, BRAWLER_SECRET_STRIKES, BRAWLER_SECRET_MOVES, initialBrawlerState, brawlerElapsed, brawlerApplyHitstop,
  brawlerStartAttack, brawlerStartTech, brawlerPressDecision, brawlerAfterResolve, brawlerDueEvent, brawlerFinish,
  brawlerStageForPress, brawlerOnHurt, brawlerCancel, brawlerTechAllowed, brawlerNextKickN, brawlerCanPay,
  classifyBrawlerFlick, detectFlickFromSamples, pickBrawlerTarget, brawlerCircleTargets, brawlerBandTargets,
  brawlerFistTargets, brawlerApproach, accelLungeSpeed, accelLungeFactor, BRAWLER_ACCEL_FRAC, brawlerJumpHeight,
  brawlerLiftHeight, brawlerPoseAt, isBrawlerGuardingAt, brawlerStompHeight, BRAWLER_JUMP_VIS_PX, BRAWLER_HIT_PITCH, BRAWLER_GUARD_MS, BRAWLER_KICK_CHAIN_MS,
} from './brawler';

const foe = (id: string, cx: number, cy: number, over: Partial<Enemy> = {}): Enemy => ({
  id, type: 'boss', x: cx - 20, y: cy - 20, width: 40, height: 40, health: 100, maxHealth: 100,
  ...over,
} as unknown as Enemy);

describe('格闘: 表', () => {
  it('段の表は §2-2 の全体の尺どおり', () => {
    expect(BRAWLER_STAGES.map(s => s.windupMs + s.recoveryMs)).toEqual([200, 200, 350, 450, 500]);
    expect(BRAWLER_STAGES.map(s => s.mult)).toEqual([0.35, 0.35, 0.8, 1.0, 1.3]);
    expect(BRAWLER_STAGES.map(s => s.kb)).toEqual(['none', 'none', 'normal', 'none', 'big']);
    expect(BRAWLER_STAGES.map(s => s.hitstopMs)).toEqual([45, 45, 80, 90, 140]);
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
  it('構えのカウンター成立で技ポイントを上限まで全回復(社長指示2026-11-08)・上限なら同じ状態を返す', () => {
    const s0 = { ...initialBrawlerState(), points: 0 };
    const s1 = brawlerAfterGuardCounter(s0, 20, 77);
    expect([s1.points, s1.gainAt]).toEqual([20, 77]);
    expect(brawlerAfterGuardCounter(s1, 20, 999)).toBe(s1);
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
  it('大踏み潰しの跳びは4段目より高い', () => {
    let top = 0;
    for (let p = 0; p <= 1; p += 0.01) top = Math.max(top, brawlerStompHeight(p));
    expect(top).toBeGreaterThan(BRAWLER_JUMP_VIS_PX);
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
  // 実際に出た技を順に流す。各要素 [技, 蹴りの何発目, 発動時刻, その技の終わりの時刻]。
  const run = (seq: [string, number, number, number][]) => {
    let progress = 0, lastEnd = 0, fired = false;
    for (const [k, n, at, end] of seq) {
      const r = brawlerSecretStep(progress, lastEnd, k as never, n, at);
      progress = r.progress; fired = fired || r.fire;
      lastEnd = end;
    }
    return { progress, fired };
  };
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

