import { describe, it, expect } from 'vitest';
import {
  escortTossDecision, escortTossLanding, escortTossProgress, escortTossableType,
  ESCORT_TOSS_CD_MS, ESCORT_TOSS_NEVER, ESCORT_TOSS_MIN_DIST, ESCORT_TOSS_MAX_DIST, ESCORT_TOSS_STOP_PX, ESCORT_TOSS_SWING_DEG,
  escortKickTargetOk, escortKickPoint, escortKickJumpPos, pickEscortKickPair, escortTossSlideDist, escortKickerInPlayerSector,
  ESCORT_KICK_TO_HIT_MS, ESCORT_KICK_STUN_MARGIN_MS, ESCORT_KICK_BEHIND_PX, ESCORT_KICK_CROUCH_MS, ESCORT_KICK_JUMP_MS, ESCORT_TOSS_OVERSHOOT_PX,
} from './escortToss';
import type { EscortTossInput } from './escortToss';
import { poiSectorIndex } from '../world/pois';

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

describe('v3.1 兵士の蹴り飛ばし(純関数)', () => {
  const en = { type: 'zombie' as const, health: 10, x: 300 - 15, y: -15, width: 30, height: 30, stunUntil: 105_000 };
  it('escortKickTargetOk: 画面内・気絶の残り・すぐそばでない・中止記憶', () => {
    expect(escortKickTargetOk(en, 100_000, 0, 0, true, null, 'a')).toBe(true);
    expect(escortKickTargetOk(en, 100_000, 0, 0, false, null, 'a')).toBe(false); // 画面外
    expect(escortKickTargetOk({ ...en, stunUntil: 100_000 + ESCORT_KICK_TO_HIT_MS + ESCORT_KICK_STUN_MARGIN_MS - 1 }, 100_000, 0, 0, true, null, 'a')).toBe(false);
    expect(escortKickTargetOk({ ...en, x: 100 - 15 }, 100_000, 0, 0, true, null, 'a')).toBe(false); // すぐそば
    expect(escortKickTargetOk(en, 100_000, 0, 0, true, { enemyId: 'a', stunUntil: 105_000 }, 'a')).toBe(false); // この気絶中に中止した
    expect(escortKickTargetOk(en, 100_000, 0, 0, true, { enemyId: 'a', stunUntil: 104_000 }, 'a')).toBe(true); // 別の気絶なら可
  });
  it('escortKickPoint: 着地点→敵の延長線上の背中側(蹴る向き=滑る向き)', () => {
    const k = escortKickPoint({ x: 285, y: -15, width: 30, height: 30 }, 72, 0);
    expect(k.dirX).toBeCloseTo(-1, 6);
    expect(k.x).toBeCloseTo(300 + 15 + ESCORT_KICK_BEHIND_PX, 6);
  });
  it('escortKickJumpPos: しゃがみの間は動かず、跳躍は加速→減速、0.5秒で着く', () => {
    const k = { fromX: 0, fromY: 0, toX: 100, toY: 0, startAt: 0 };
    expect(escortKickJumpPos(k, ESCORT_KICK_CROUCH_MS).x).toBe(0);
    expect(escortKickJumpPos(k, ESCORT_KICK_CROUCH_MS + ESCORT_KICK_JUMP_MS / 2).x).toBeCloseTo(50, 6);
    expect(escortKickJumpPos(k, ESCORT_KICK_CROUCH_MS + ESCORT_KICK_JUMP_MS).x).toBe(100);
    expect(ESCORT_KICK_CROUCH_MS + ESCORT_KICK_JUMP_MS).toBe(500); // 社長「0.5秒で背後にジャンプ」
  });
  it('escortKickerInPlayerSector: プレイヤーの区画の担当兵士だけ(拠点が無ければ従来どおり候補)', () => {
    // 拠点は東南西北(原点からの角度で区画が決まる)。東=0 / 南=1 / 西=2 / 北=3(poiSectorIndex と同じ並び)。
    const bases = [
      { id: 'base-0', x: 4800, y: 0 }, { id: 'base-1', x: 0, y: 4800 }, { id: 'base-2', x: -4800, y: 0 }, { id: 'base-3', x: 0, y: -4800 },
    ];
    const east = poiSectorIndex({ x: 1000, y: 10 }), north = poiSectorIndex({ x: 10, y: -1000 });
    expect(east).not.toBe(north);
    expect(escortKickerInPlayerSector({ baseId: 'base-0' }, bases, east)).toBe(true);
    expect(escortKickerInPlayerSector({ baseId: 'base-3' }, bases, east)).toBe(false); // 北の駐留兵は東の敵へ跳ばない
    expect(escortKickerInPlayerSector({ baseId: 'base-3' }, bases, north)).toBe(true);
    expect(escortKickerInPlayerSector({ baseId: 'base-9' }, bases, east)).toBe(true); // 拠点表に無い=通路ステージ等は候補に残す
    expect(escortKickerInPlayerSector({ baseId: 'base-0' }, [], east)).toBe(true);
  });
  it('pickEscortKickPair: 兵士から敵までが一番近い組', () => {
    const p = pickEscortKickPair(
      [{ id: 'e1', x: 0, y: 0, width: 10, height: 10 }, { id: 'e2', x: 500, y: 0, width: 10, height: 10 }],
      [{ id: 's1', x: 480, y: 10 }, { id: 's2', x: 100, y: 10 }],
    );
    expect(p?.enemy.id).toBe('e2');
    expect(p?.escort.id).toBe('s1');
  });
  it('escortTossSlideDist: 行き過ぎて戻り、最後は距離ちょうど', () => {
    const D = 300;
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => escortTossSlideDist(i * 4.2, 0, 420, D)));
    expect(peak).toBeGreaterThan(D);
    expect(peak).toBeLessThanOrEqual(D + ESCORT_TOSS_OVERSHOOT_PX + 1e-6);
    expect(escortTossSlideDist(420, 0, 420, D)).toBeCloseTo(D, 6);
  });
});
