// ジャンプ着地攻撃の共通の一歩(パンプキン/ハンター等と拳鬼の跳びかかり・research/BRAWLER_PHANTOM.md §15)。
import { describe, expect, it } from 'vitest';
import { groundJumpStep, groundJumpStartCrouch, groundBlastCircleHits, type GroundJumpActor } from './groundJump';

const ESM = 1.2;
const at = (gt: number) => (ms: number) => gt + ms / ESM;
const base = (o: Partial<GroundJumpActor> = {}): GroundJumpActor => ({ x: 0, y: 0, width: 40, height: 56, ...o } as GroundJumpActor);
const input = (gt: number, o: Partial<Parameters<typeof groundJumpStep>[1]> = {}) => ({
  gameTime: gt, aimX: 500, aimY: 28, atkUntil: at(gt), attackSpeedMult: ESM, jumpMsRaw: 500, recoverMsRaw: 1000, ...o,
});

describe('ジャンプ着地攻撃の一歩', () => {
  it('溜めの間は動かない・溜めが明けた瞬間のプレイヤーの所が着地点(以後動かない)', () => {
    const c = groundJumpStartCrouch(at(0), 3000);
    expect(c.aiPhase).toBe('crouch');
    expect(c.aiPhaseUntil).toBe(2500);
    expect(groundJumpStep(base({ aiPhase: 'crouch', aiPhaseUntil: 2500 }), input(1000))!.patch).toEqual({ vx: 0, vy: 0 });
    const j = groundJumpStep(base({ aiPhase: 'crouch', aiPhaseUntil: 2500 }), input(2500))!.patch;
    expect(j.aiPhase).toBe('jump');
    expect(j.aiTargetX! + 20).toBe(500); // 着地した体の中心=狙い
    expect(j.aiStartedAt).toBe(2500);
    expect(j.aiPhaseUntil).toBeCloseTo(2500 + 500 / ESM, 6);
  });
  it('着地=滞空(割った後)ちょうどの時刻・爆風の中心=着地した体の中心・空中は途中', () => {
    const e = base({ aiPhase: 'jump', aiStartedAt: 0, aiFromX: 0, aiFromY: 0, aiTargetX: 480, aiTargetY: 0 });
    const land = 500 / ESM;
    const mid = groundJumpStep(e, input(land - 1))!;
    expect(mid.landed).toBeUndefined();
    expect(mid.patch.x!).toBeGreaterThan(0);
    expect(mid.patch.x!).toBeLessThan(480);
    const l = groundJumpStep(e, input(land))!;
    expect(l.landed).toEqual({ x: 500, y: 28 });
    expect(l.patch.aiPhase).toBe('recover');
    expect(l.patch.aiPhaseUntil).toBeCloseTo(land + 1000 / ESM, 6);
  });
  it('盾にぶつかったらその場に落ちる(爆風なし)・頭打ち', () => {
    const e = base({ aiPhase: 'jump', aiStartedAt: 0, aiFromX: 0, aiFromY: 0, aiTargetX: 480, aiTargetY: 0 });
    const b = groundJumpStep(e, input(100, { shieldHit: () => true }))!;
    expect(b.blocked).toBeDefined();
    expect(b.landed).toBeUndefined();
    const c = groundJumpStep(base({ aiPhase: 'crouch', aiPhaseUntil: 0 }), input(0, { clampAim: (cx, cy) => ({ x: cx + 100, y: cy }) }))!.patch;
    expect(c.aiTargetX! + 20).toBe(120);
  });
  it('停止が明けたら done・それ以外の相は null', () => {
    expect(groundJumpStep(base({ aiPhase: 'recover', aiPhaseUntil: 10 }), input(10))!.done).toBe(true);
    expect(groundJumpStep(base({ aiPhase: 'recover', aiPhaseUntil: 10 }), input(5))!.done).toBeUndefined();
    expect(groundJumpStep(base(), input(0))).toBeNull();
  });
  it('円の当たり=爆心からプレイヤーの中心まで 半径+プレイヤーの当たり半径', () => {
    expect(groundBlastCircleHits(100, 0, 28, 0, 0, 72)).toBe(true);
    expect(groundBlastCircleHits(100.1, 0, 28, 0, 0, 72)).toBe(false);
  });
});
