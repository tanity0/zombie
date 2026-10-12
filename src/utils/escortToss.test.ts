import { describe, it, expect } from 'vitest';
import {
  escortTossDecision, escortTossLanding, escortTossProgress, escortTossableType,
  ESCORT_TOSS_CD_MS, ESCORT_TOSS_NEVER, ESCORT_TOSS_MIN_DIST, ESCORT_TOSS_MAX_DIST, ESCORT_TOSS_STOP_PX, ESCORT_TOSS_SWING_DEG,
} from './escortToss';
import type { EscortTossInput } from './escortToss';

// research/ESCORT_TOSS.md(兵士のトス)の判定と幾何。
const base = (over: Partial<EscortTossInput> = {}, enemy: Partial<EscortTossInput['enemy']> = {}): EscortTossInput => ({
  enemy: { type: 'zombie', health: 10, x: 300 - 15, y: -15, width: 30, height: 30, ...enemy },
  playerCx: 0, playerCy: 0, playerAlive: true, inputLocked: false, gameTime: 100_000, lastTossAt: ESCORT_TOSS_NEVER,
  ...over,
});

describe('escortTossDecision', () => {
  it('条件が揃えば飛ばす', () => {
    expect(escortTossDecision(base())).toBe(true);
  });
  it('8秒以内の2回目は飛ばさない(稀に)', () => {
    expect(escortTossDecision(base({ lastTossAt: 100_000 - ESCORT_TOSS_CD_MS + 1 }))).toBe(false);
    expect(escortTossDecision(base({ lastTossAt: 100_000 - ESCORT_TOSS_CD_MS }))).toBe(true);
  });
  it('距離の範囲外は飛ばさない', () => {
    expect(escortTossDecision(base({}, { x: ESCORT_TOSS_MIN_DIST - 1 - 15 }))).toBe(false);
    expect(escortTossDecision(base({}, { x: ESCORT_TOSS_MAX_DIST + 1 - 15 }))).toBe(false);
  });
  it('対象外: ボス級・使者・パンプキン系・囲いの敵・取り巻き・跳び/突進中・死体・眠り', () => {
    expect(escortTossableType('giantbat')).toBe(false);
    expect(escortTossableType('hangedman')).toBe(false);
    expect(escortTossableType('pumpkin')).toBe(false);
    expect(escortTossDecision(base({}, { fromEvent: true }))).toBe(false);
    expect(escortTossDecision(base({}, { hordeLeaderId: 'L', hordeState: 'follow' }))).toBe(false);
    expect(escortTossDecision(base({}, { aiPhase: 'jump' }))).toBe(false);
    expect(escortTossDecision(base({}, { aiPhase: 'charge' }))).toBe(false);
    expect(escortTossDecision(base({}, { corpseUntil: 1 }))).toBe(false);
    expect(escortTossDecision(base({}, { dormant: true }))).toBe(false);
  });
  it('プレイヤーが倒れている/操作できない時は飛ばさない', () => {
    expect(escortTossDecision(base({ playerAlive: false }))).toBe(false);
    expect(escortTossDecision(base({ inputLocked: true }))).toBe(false);
  });
});

describe('escortTossLanding', () => {
  it('プレイヤーから STOP_PX の所に着く(近接が届く所)', () => {
    const l = escortTossLanding(300, 0, 0, 0, 1, 0);
    expect(Math.hypot(l.x, l.y)).toBeCloseTo(ESCORT_TOSS_STOP_PX, 6);
    expect(l.x).toBeGreaterThan(0);
  });
  it('向いている側へ寄せるが、最大 SWING_DEG まで', () => {
    // 敵は右、プレイヤーは真上を向いている → 右から上へ 35° 回した点
    const l = escortTossLanding(300, 0, 0, 0, 0, -1);
    const deg = (Math.atan2(l.y, l.x) * 180) / Math.PI;
    expect(deg).toBeCloseTo(-ESCORT_TOSS_SWING_DEG, 4);
  });
  it('向きが敵の方なら回さない', () => {
    const l = escortTossLanding(300, 0, 0, 0, 1, 0);
    expect(l.y).toBeCloseTo(0, 6);
  });
});

describe('escortTossProgress', () => {
  it('ease-out: 出だしが速く、着地で1', () => {
    expect(escortTossProgress(0, 0, 420)).toBe(0);
    expect(escortTossProgress(210, 0, 420)).toBeCloseTo(0.75, 6);
    expect(escortTossProgress(420, 0, 420)).toBe(1);
    expect(escortTossProgress(999, 0, 420)).toBe(1);
  });
});
