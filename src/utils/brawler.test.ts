import { describe, expect, it } from 'vitest';
import type { Enemy } from '../types/game';
import {
  BRAWLER_STAGES, BRAWLER_TECHS, brawlerPointCap, initialBrawlerState, brawlerElapsed, brawlerApplyHitstop,
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
    expect([BRAWLER_TECHS.guard.cost, BRAWLER_TECHS.stomp.cost, BRAWLER_TECHS.kiko.cost, BRAWLER_TECHS.kick.cost]).toEqual([5, 5, 2, 1]);
  });
  it('ポイントの上限はレベルで 5/10/20', () => {
    expect([1, 2, 3].map(brawlerPointCap)).toEqual([5, 10, 20]);
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
    expect(brawlerCanPay({ ...initialBrawlerState(), points: 4 }, 'guard')).toBe(false);
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
  it('掌底は伸び切った形で一拍止まる(戻りの最初は押し出しが最大のまま)', () => {
    const s = { ...brawlerStartAttack(initialBrawlerState(), 5, 0, false), resolved: true };
    expect(brawlerPoseAt(s, 160)?.push).toBe(brawlerPoseAt(s, 250)?.push);
    expect(brawlerPoseAt(s, 160)!.push).toBeGreaterThanOrEqual(44);
  });
  it('段ごとの音程は等間隔に下げない', () => {
    const steps = [1, 2, 3, 4].map(i => +(BRAWLER_HIT_PITCH[i] - BRAWLER_HIT_PITCH[i + 1]).toFixed(3));
    expect(new Set(steps).size).toBeGreaterThan(1);
  });
});
