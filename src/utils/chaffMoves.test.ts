// PACING_PUZZLE.md §16(雑魚の「詰めさせない技」)の共通部(§16-8b 1〜4)のユニットテスト。
import { describe, it, expect } from 'vitest';
import {
  CHAFF_MOVE_TYPES, CHAFF_MOVE_SLOT_CAP, isChaffSlotHolding, deriveChaffMoveGrants, deferFrozenClocksBy,
} from './chaffMoves';
import type { Enemy, EnemyType } from '../types/game';

const mkE = (id: string, x: number, over: Partial<Enemy> = {}): Enemy =>
  ({ id, x, y: 0, width: 32, height: 32, type: 'bat' as EnemyType, ...over } as unknown as Enemy);

describe('CHAFF_MOVE_TYPES / CHAFF_MOVE_SLOT_CAP(台帳)', () => {
  it('対象はbat/skeleton/zombieの3体だけ(§16-0「1のみ」)', () => {
    expect([...CHAFF_MOVE_TYPES].sort()).toEqual(['bat', 'skeleton', 'zombie']);
    expect(CHAFF_MOVE_TYPES.has('plant')).toBe(false);
    expect(CHAFF_MOVE_TYPES.has('werewolf')).toBe(false); // 自転車=技を足さない(§16-0)
  });
  it('同時に構えられる数は2体(§16-8)', () => {
    expect(CHAFF_MOVE_SLOT_CAP).toBe(2);
  });
});

describe('isChaffSlotHolding(枠の占有)', () => {
  it('技の実行中(orbit/windup/lunge/grab等)は占有している', () => {
    for (const p of ['b-orbit', 'b-windup', 'b-lunge', 'b-grab'] as const) {
      expect(isChaffSlotHolding({ type: 'bat', aiPhase: p })).toBe(true);
    }
    for (const p of ['s-crouch', 's-arc', 's-bite'] as const) {
      expect(isChaffSlotHolding({ type: 'skeleton', aiPhase: p })).toBe(true);
    }
    for (const p of ['z-red-pause', 'z-bite1', 'z-stagger', 'z-bite2'] as const) {
      expect(isChaffSlotHolding({ type: 'zombie', aiPhase: p })).toBe(true);
    }
  });
  it('★硬直・後退(s-recover/s-retreat)とbatの後始末(b-release)は占有しない(社長裁定2026-09-16「s-recoverに入った時点で解放する」)', () => {
    expect(isChaffSlotHolding({ type: 'skeleton', aiPhase: 's-recover' })).toBe(false);
    expect(isChaffSlotHolding({ type: 'skeleton', aiPhase: 's-retreat' })).toBe(false);
    expect(isChaffSlotHolding({ type: 'bat', aiPhase: 'b-release' })).toBe(false);
  });
  it('★技の間合いに届く前(b-approach/z-wait)も占有しない(「取る」は間合いに達した瞬間)', () => {
    expect(isChaffSlotHolding({ type: 'bat', aiPhase: 'b-approach' })).toBe(false);
    expect(isChaffSlotHolding({ type: 'zombie', aiPhase: 'z-wait' })).toBe(false);
  });
  it('対象外の型(werewolf等)は同じ文字列のaiPhaseでも占有しない', () => {
    expect(isChaffSlotHolding({ type: 'werewolf', aiPhase: 'b-orbit' })).toBe(false);
  });
  it('aiPhase未設定は占有しない', () => {
    expect(isChaffSlotHolding({ type: 'bat', aiPhase: undefined })).toBe(false);
  });
});

describe('deriveChaffMoveGrants(枠の前段・毎フレーム導出)', () => {
  const wantsAll = () => true;
  const wantsNone = () => false;

  it('空きが無ければ、既に占有中の2体だけが枠を持つ', () => {
    const enemies = [
      mkE('a', 0, { type: 'bat', aiPhase: 'b-orbit' }),
      mkE('b', 10, { type: 'skeleton', aiPhase: 's-crouch' }),
      mkE('c', 20, { type: 'zombie' }),
    ];
    const grants = deriveChaffMoveGrants(enemies, 0, 0, wantsAll);
    expect(grants.has('a')).toBe(true);
    expect(grants.has('b')).toBe(true);
    expect(grants.has('c')).toBe(false); // 枠が無い=旧挙動のまま歩いて詰める
  });

  it('空きがあれば、プレイヤーに近い順に配る(配列順ではない)', () => {
    const enemies = [
      mkE('far', 500, { type: 'bat' }),
      mkE('near', 10, { type: 'skeleton' }),
      mkE('mid', 100, { type: 'zombie' }),
    ];
    // 枠は2、誰も占有していない=空き2。近い順=near, mid が入り far は落ちる。
    const grants = deriveChaffMoveGrants(enemies, 0, 0, wantsAll);
    expect(grants.has('near')).toBe(true);
    expect(grants.has('mid')).toBe(true);
    expect(grants.has('far')).toBe(false);
  });

  it('型をまたいで数える(bat/skeleton/ゾンビが1つの枠を共有する)', () => {
    const enemies = [
      mkE('bat1', 0, { type: 'bat', aiPhase: 'b-windup' }),
      mkE('skel1', 10, { type: 'skeleton', aiPhase: 's-bite' }),
      mkE('zom1', 20, { type: 'zombie' }),
    ];
    const grants = deriveChaffMoveGrants(enemies, 0, 0, wantsAll);
    // 既に bat1/skel1 の2体が占有 → zom1 は型が違っても枠が無い。
    expect(grants.size).toBe(2);
    expect(grants.has('zom1')).toBe(false);
  });

  it('wantsSlotがfalseの個体は候補にならない(=まだ間合いに届いていない)', () => {
    const enemies = [mkE('a', 10, { type: 'bat' }), mkE('b', 20, { type: 'skeleton' })];
    const grants = deriveChaffMoveGrants(enemies, 0, 0, wantsNone);
    expect(grants.size).toBe(0);
  });

  it('対象外の型は候補にならない(plant/werewolf等)', () => {
    const enemies = [mkE('p', 10, { type: 'plant' }), mkE('w', 20, { type: 'werewolf' })];
    const grants = deriveChaffMoveGrants(enemies, 0, 0, wantsAll);
    expect(grants.size).toBe(0);
  });

  it('毎回enemiesから作り直す(状態を持ち回さない=呼ぶたびに独立)', () => {
    const enemies = [mkE('a', 10, { type: 'bat' })];
    const g1 = deriveChaffMoveGrants(enemies, 0, 0, wantsAll);
    const g2 = deriveChaffMoveGrants([], 0, 0, wantsAll); // 死亡/画面外で消えた想定
    expect(g1.has('a')).toBe(true);
    expect(g2.size).toBe(0); // 前回の枠を引きずらない
  });
});

describe('deferFrozenClocksBy(凍結dtの繰り下げ・穴4)', () => {
  const base: Enemy = mkE('e', 0, {
    type: 'bat', biteAt: 1000, chaffMoveAt: 900, aiPhaseUntil: 1500, chaffMoveCdUntil: 7000,
    chaffMove: 'bat-grab',
  });

  it('§16の技(chaffMove定義)は凍結ぶん絶対時刻フィールドを繰り下げる', () => {
    const patched = deferFrozenClocksBy(base, 200);
    expect(patched.biteAt).toBe(1200);
    expect(patched.chaffMoveAt).toBe(1100);
    expect(patched.aiPhaseUntil).toBe(1700);
    expect(patched.chaffMoveCdUntil).toBe(7200);
  });

  it('dtMs<=0 なら何もしない(同じ参照を返す)', () => {
    expect(deferFrozenClocksBy(base, 0)).toBe(base);
    expect(deferFrozenClocksBy(base, -5)).toBe(base);
  });

  it('★§12の噛みつき(chaffMove未定義)は1bitも変えない(§16の「ではない」条件)', () => {
    const bite12 = mkE('e2', 0, { type: 'zombie', biteAt: 1000, aiPhaseUntil: 1500, chaffMove: undefined });
    expect(deferFrozenClocksBy(bite12, 200)).toBe(bite12); // 同じ参照=無変更
  });

  it('biteAtが0/未発火なら繰り下げない(構えていない)', () => {
    const idle = mkE('e3', 0, { type: 'bat', chaffMove: 'bat-grab', biteAt: 0, chaffMoveAt: undefined, aiPhaseUntil: undefined, chaffMoveCdUntil: undefined });
    const patched = deferFrozenClocksBy(idle, 200);
    expect(patched.biteAt).toBe(0);
  });
});
