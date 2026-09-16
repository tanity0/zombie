// PACING_PUZZLE.md §16(雑魚の「詰めさせない技」)の共通部(§16-8b 1〜4)のユニットテスト。
import { describe, it, expect } from 'vitest';
import {
  CHAFF_MOVE_TYPES, CHAFF_MOVE_SLOT_CAP, isChaffSlotHolding, deriveChaffMoveGrants, deferFrozenClocksBy,
  endChaffMove, zombieRedWaitMs, zombieWantsChaffRedSlot, zombieRedTriggerPx,
  ZOMBIE_RED_WAIT_MIN_MS, ZOMBIE_RED_WAIT_MAX_MS,
  ZOMBIE_RED_TRIGGER_MIN_PX, ZOMBIE_RED_TRIGGER_MAX_PX,
  zombieLungeRampMul, ZOMBIE_LUNGE_RAMP_MS, zombieRedGlowStrength, ZOMBIE_RECOVER_MS,
  ZOMBIE_STAGGER_MS, ZOMBIE_RED_DECAY_MS,
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

describe('zombieRedWaitMs(§16-3「待ちの尺」・id由来の決定的な値)', () => {
  it('300〜2800msの範囲に収まる', () => {
    for (const id of ['a', 'b', 'c', 'zombie-1', 'zombie-2', 'xxxxxxxx']) {
      const ms = zombieRedWaitMs(id);
      expect(ms).toBeGreaterThanOrEqual(ZOMBIE_RED_WAIT_MIN_MS);
      expect(ms).toBeLessThanOrEqual(ZOMBIE_RED_WAIT_MAX_MS);
    }
  });
  it('同じidは常に同じ値(決定的=乱数を引かない)', () => {
    expect(zombieRedWaitMs('same-id')).toBe(zombieRedWaitMs('same-id'));
  });
  it('idが違えば(高確率で)値も散る=抽選ではなく尺を散らす狙いが機能している', () => {
    const vals = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(zombieRedWaitMs));
    expect(vals.size).toBeGreaterThan(1);
  });
});

describe('zombieWantsChaffRedSlot(§16-3「赤が先」の枠の申告・帯の内縁=ZOMBIE_BAND_INNER_PX)', () => {
  const base = { id: 'zw1', type: 'zombie' as EnemyType, aiPhase: 'z-wait' as const, aiPhaseUntil: 2000, chaffMoveCdUntil: undefined, x: 0, y: 0, width: 36, height: 36 };
  // ★§16-3z「内縁の引き金に幅」: 距離の引き金はidごとに88〜118pxへ散る(ZOMBIE_BAND_INNER_PX固定ではない)。
  const trig = zombieRedTriggerPx(base.id);
  it('尺切れ(gameTime>=aiPhaseUntil)なら距離に関係なく申告する', () => {
    expect(zombieWantsChaffRedSlot(base, 2000, 100000, 100000)).toBe(true); // 遠く離れていても尺切れなら true
  });
  it('尺は残っているがこの個体の引き金距離に達していれば申告する', () => {
    const ecx = 18, ecy = 18; // (0,0,36,36)の中心
    expect(zombieWantsChaffRedSlot(base, 1000, ecx + trig, ecy)).toBe(true);
  });
  it('尺も残り引き金距離にも届いていなければ申告しない(素通り)', () => {
    const ecx = 18, ecy = 18;
    expect(zombieWantsChaffRedSlot(base, 1000, ecx + trig + 1, ecy)).toBe(false);
  });
  it('z-wait以外(z-red-pause等)は申告しない(枠は間合いに達した瞬間だけ取る)', () => {
    expect(zombieWantsChaffRedSlot({ ...base, aiPhase: 'z-red-pause' }, 2000, 0, 0)).toBe(false);
  });
  it('ゾンビ以外の型は申告しない', () => {
    expect(zombieWantsChaffRedSlot({ ...base, type: 'bat' }, 2000, 0, 0)).toBe(false);
  });
  it('★赤の技後CD中は申告しない(§16-3「CD中は紫の停止にも入らない」の土台)', () => {
    expect(zombieWantsChaffRedSlot({ ...base, chaffMoveCdUntil: 3000 }, 2000, 0, 0)).toBe(false);
  });
  it('技後CDが過ぎていれば申告できる', () => {
    expect(zombieWantsChaffRedSlot({ ...base, chaffMoveCdUntil: 1500 }, 2000, 0, 0)).toBe(true);
  });
});

describe('zombieRedTriggerPx(§16-3z「内縁の引き金に幅」・id由来の決定的なばらつき)', () => {
  it('88〜118pxの範囲に収まる', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const v = zombieRedTriggerPx(id);
      expect(v).toBeGreaterThanOrEqual(ZOMBIE_RED_TRIGGER_MIN_PX);
      expect(v).toBeLessThanOrEqual(ZOMBIE_RED_TRIGGER_MAX_PX);
    }
  });
  it('同じidは常に同じ値(決定的=乱数を引かない)', () => {
    expect(zombieRedTriggerPx('same-id')).toBe(zombieRedTriggerPx('same-id'));
  });
  it('idが違えば(高確率で)値も散る=100pxちょうどの線への整列を壊す', () => {
    const vals = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(zombieRedTriggerPx));
    expect(vals.size).toBeGreaterThan(1);
  });
});

describe('endChaffMove(技の終わり・§16-8b手順5「ゾンビが初めて呼ぶ」)', () => {
  const e = { id: 'z1', type: 'zombie' as EnemyType, chaffMove: 'zombie-double' as const, aiPhase: 'z-bite2' as const };
  it('chaffMoveを消し、技後CD(recoverMs=4000・±12%)を書く', () => {
    const patch = endChaffMove(e, 10000);
    expect(patch.chaffMove).toBeUndefined();
    expect(patch.chaffMoveCdUntil).toBeGreaterThanOrEqual(10000 + 4000 * 0.88);
    expect(patch.chaffMoveCdUntil).toBeLessThanOrEqual(10000 + 4000 * 1.12);
  });
  it('同じidは常に同じCD(決定的)', () => {
    const p1 = endChaffMove(e, 10000);
    const p2 = endChaffMove(e, 10000);
    expect(p1.chaffMoveCdUntil).toBe(p2.chaffMoveCdUntil);
  });
});

describe('zombieLungeRampMul(§16-3z②「立ち上がり360msの加速」・0→満速の1フレーム段差を消す)', () => {
  it('入り口(0ms)は0(満速で始まらない)', () => {
    expect(zombieLungeRampMul(1000, 1000)).toBe(0);
  });
  it(`${ZOMBIE_LUNGE_RAMP_MS}ms経過で満速(1)`, () => {
    expect(zombieLungeRampMul(1000, 1000 + ZOMBIE_LUNGE_RAMP_MS)).toBeCloseTo(1, 5);
  });
  it('それ以降は1のまま(1を超えない)', () => {
    expect(zombieLungeRampMul(1000, 1000 + ZOMBIE_LUNGE_RAMP_MS + 5000)).toBe(1);
  });
  it('★単調増加(段差なし=慣性MUSTの検知器)', () => {
    let prev = -1;
    for (let t = 0; t <= ZOMBIE_LUNGE_RAMP_MS; t += 10) {
      const v = zombieLungeRampMul(1000, 1000 + t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('chaffMoveAtが未定義なら1(踏み込み以外の呼び手を壊さない安全側デフォルト)', () => {
    expect(zombieLungeRampMul(undefined, 1000)).toBe(1);
  });
});

describe('zombieRedGlowStrength(§16-3z①「赤の脈は状態で駆動する」・1発目で立ち/よろけで落ち/2発目で立つ)', () => {
  const base = { type: 'zombie' as EnemyType, chaffMove: 'zombie-double' as const };

  it('§16の技を持たない個体(chaffMove未定義)は常に0(§12の噛みつきに色は付かない)', () => {
    expect(zombieRedGlowStrength({ type: 'zombie', chaffMove: undefined, aiPhase: 'z-bite1' }, 1000)).toBe(0);
  });
  it('ゾンビ以外の型は常に0', () => {
    expect(zombieRedGlowStrength({ ...base, type: 'bat', aiPhase: 'z-bite1' }, 1000)).toBe(0);
  });
  it('保持(構え)には色が無い(§16-5「構えている間は色を出さない」): z-wait/z-red-pauseは0', () => {
    expect(zombieRedGlowStrength({ ...base, aiPhase: 'z-wait' }, 1000)).toBe(0);
    expect(zombieRedGlowStrength({ ...base, aiPhase: 'z-red-pause' }, 1000)).toBe(0);
  });
  it('技が動き出したら最大(z-lunge-in/z-bite1は1)', () => {
    expect(zombieRedGlowStrength({ ...base, aiPhase: 'z-lunge-in' }, 1000)).toBe(1);
    expect(zombieRedGlowStrength({ ...base, aiPhase: 'z-bite1' }, 1000)).toBe(1);
  });
  it('よろけ(z-stagger)で落ちる: 頭は高いまま、明けにかけて下がる(0未満にはならない)', () => {
    const e = { ...base, aiPhase: 'z-stagger' as const, aiPhaseUntil: 1000 + ZOMBIE_STAGGER_MS };
    const head = zombieRedGlowStrength(e, 1000);
    const mid = zombieRedGlowStrength(e, 1000 + ZOMBIE_STAGGER_MS / 2);
    const tail = zombieRedGlowStrength(e, 1000 + ZOMBIE_STAGGER_MS);
    expect(head).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(tail);
    expect(tail).toBeGreaterThan(0); // 床がある(0まで落とさない=消えたように見せない)
  });
  it('2発目(z-bite2)で立つ: 開始直後は床付近、進むにつれ最大へ戻る', () => {
    const e = { ...base, aiPhase: 'z-bite2' as const, biteAt: 1000 };
    const head = zombieRedGlowStrength(e, 1000);
    const tail = zombieRedGlowStrength(e, 1500); // 十分に経過
    expect(tail).toBeGreaterThan(head);
    expect(tail).toBe(1);
  });
  it('★決着後は1フレーム消灯にしない: z-recoverの頭からZOMBIE_RED_DECAY_MSで0へ減衰する', () => {
    const e = { ...base, aiPhase: 'z-recover' as const, aiPhaseUntil: 1000 + ZOMBIE_RECOVER_MS };
    const head = zombieRedGlowStrength(e, 1000); // z-recoverに入った瞬間
    expect(head).toBeCloseTo(1, 5); // 1フレームで消えない
    const mid = zombieRedGlowStrength(e, 1000 + ZOMBIE_RED_DECAY_MS / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    const after = zombieRedGlowStrength(e, 1000 + ZOMBIE_RED_DECAY_MS);
    expect(after).toBe(0);
  });
  it('硬直の残りは0のまま(減衰後は色なし)', () => {
    const e = { ...base, aiPhase: 'z-recover' as const, aiPhaseUntil: 1000 + ZOMBIE_RECOVER_MS };
    expect(zombieRedGlowStrength(e, 1000 + ZOMBIE_RECOVER_MS)).toBe(0);
  });
});
