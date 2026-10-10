// PACING_PUZZLE.md §16(雑魚の「詰めさせない技」)の共通部(§16-8b 1〜4)のユニットテスト。
import { describe, it, expect } from 'vitest';
import * as chaffMovesModule from './chaffMoves';
import {
  CHAFF_MOVE_TYPES, CHAFF_MOVE_SLOT_CAP, isChaffSlotHolding, deriveChaffMoveGrants,
  endChaffMove, zombieRedWaitMs, zombieWantsChaffRedSlot, zombieRedTriggerPx,
  ZOMBIE_RED_WAIT_MIN_MS, ZOMBIE_RED_WAIT_MAX_MS,
  ZOMBIE_RED_TRIGGER_MIN_PX, ZOMBIE_RED_TRIGGER_MAX_PX,
  zombieLungeRampMul, ZOMBIE_LUNGE_RAMP_MS, chaffMoveBlinkStrength,
  CHAFF_BLINK_ON_MS, CHAFF_BLINK_OFF_MS, CHAFF_BLINK_COUNT,
  zombieRecoverWalkRampMul, ZOMBIE_RECOVER_WALK_RAMP_MS,
  zombieRedPauseMs, ZOMBIE_RED_PAUSE_MS, ZOMBIE_RED_PAUSE_JITTER,
  ZOMBIE_RP_STUMBLE_FRAC, ZOMBIE_RP_RISE_FRAC, ZOMBIE_RP_TREMBLE_FRAC,
  zombieBite2AngleRad, ZOMBIE_BITE2_ANGLE_OFFSET_RAD, ZOMBIE_BITE2_ANGLE_JITTER,
  // bat(§16-1)
  batWantsChaffSlot, batOrbitDurationMs, batStrafeMs, batHoldMs, batOrbitSpin, batStrafeAngularMul,
  BAT_ORBIT_MIN_MS, BAT_ORBIT_MAX_MS, BAT_STRAFE_MIN_MS, BAT_STRAFE_MAX_MS,
  BAT_HOLD_MIN_MS, BAT_HOLD_MAX_MS, BAT_GRAB_HOLD_MS,
  // skeleton(§16-2)
  skeletonWantsChaffSlot, skeletonArcPoint,
  SKELETON_TRIGGER_PX, SKELETON_CROUCH_MS, SKELETON_ARC_MS, SKELETON_RECOVER_MS, SKELETON_RETREAT_SPEED_MULT,
  SKELETON_ARC_DEPTH,
  // プレイヤーの拘束
  isPlayerGrabbed,
  // 赤の合図(一般化版)
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

// ★PACING_PUZZLE.md §16-H H-8: 旧「deferFrozenClocksBy(凍結dtの繰り下げ)」の節は**規則が反転した**
// ので書き換えた。旧規則=「凍結ぶん時計を後ろへ足す」/ 新規則=「凍結中は時計が1msも進まず、
// 明けた瞬間にその時点を0としてCDが始まる」。関数そのものを破棄したので、ここでは
// **加算方式が復活していないこと**だけを見る(実ループでの受け入れ条件は
// src/store/enemyClockFreeze.test.ts が持つ=§16-H H-7「storeの実ループを回して測る」)。
describe('★凍結dtの繰り下げ(旧・穴4)は破棄された(§16-H H-8)', () => {
  it('chaffMoves から加算方式の輸出が消えている(復活の検知器)', () => {
    expect(Object.keys(chaffMovesModule)).not.toContain('deferFrozenClocksBy');
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
    // ★zombieRedWaitMsは2引数(id, spawnedAt)になったため、Array#mapへ直接渡すとindexが
    // spawnedAtとして誤って渡ってしまう。idだけを渡す形に包む。
    const vals = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => zombieRedWaitMs(id)));
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
    const vals = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => zombieRedTriggerPx(id)));
    expect(vals.size).toBeGreaterThan(1);
  });
  it('★クリエイティブ監査#9是正: spawnedAt未設定でも落ちない・idだけと一致(フォールバック)', () => {
    expect(() => zombieRedTriggerPx('id1')).not.toThrow();
    expect(zombieRedTriggerPx('id1')).toBe(zombieRedTriggerPx('id1', undefined));
  });
  it('★クリエイティブ監査#9是正: 同idでもspawnedAtが違えば(高確率で)値が変わる(他3値と揃った)', () => {
    const vals = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(s => zombieRedTriggerPx('same-id', s * 6151)));
    expect(vals.size).toBeGreaterThan(1);
  });
});

describe('endChaffMove(技の終わり・§16-8b手順5「ゾンビが初めて呼ぶ」)', () => {
  const e = { id: 'z1', type: 'zombie' as EnemyType, chaffMove: 'zombie-double' as const, aiPhase: 'z-bite2' as const };
  it('chaffMoveを消し、技後CD(recoverMs=2500・★2026-09-17「できるだけシビアに」で4000→2500・±12%)を書く', () => {
    const patch = endChaffMove(e, 10000);
    expect(patch.chaffMove).toBeUndefined();
    expect(patch.chaffMoveCdUntil).toBeGreaterThanOrEqual(10000 + 2500 * 0.88);
    expect(patch.chaffMoveCdUntil).toBeLessThanOrEqual(10000 + 2500 * 1.12);
  });
  it('同じidは常に同じCD(決定的)', () => {
    const p1 = endChaffMove(e, 10000);
    const p2 = endChaffMove(e, 10000);
    expect(p1.chaffMoveCdUntil).toBe(p2.chaffMoveCdUntil);
  });
});

describe('zombieLungeRampMul(§16-3z監査#8「踏み込みの解放を鋭く」・180〜220ms・出足側の曲線)', () => {
  it('入り口(0ms)は0(満速で始まらない)', () => {
    expect(zombieLungeRampMul(1000, 1000)).toBe(0);
  });
  it('★出足側の曲線(鋭い立ち上がり): 半分の経過で半分より先(0.5)を超えている', () => {
    const half = zombieLungeRampMul(1000, 1000 + ZOMBIE_LUNGE_RAMP_MS / 2);
    expect(half).toBeGreaterThan(0.5);
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

describe('chaffMoveBlinkStrength(赤は状態ではなく合図の句読点・社長指示2026-09-17「雑魚の攻撃はすべてゾンビと同じ文脈=スーパーアーマーに入るタイミングで2回点滅」)', () => {
  const base = { chaffMove: 'zombie-double' as const, chaffMoveAt: 1000 };
  const CYCLE_MS = CHAFF_BLINK_ON_MS + CHAFF_BLINK_OFF_MS;
  const TOTAL_MS = CYCLE_MS * CHAFF_BLINK_COUNT;

  it('技を持たない個体(chaffMove未定義)は常に0(§12の噛みつきは紫の点滅が別に出る)', () => {
    expect(chaffMoveBlinkStrength({ ...base, chaffMove: undefined }, 1000)).toBe(0);
  });
  it('★3体とも同じ文脈(型で分岐しない)', () => {
    for (const chaffMove of ['zombie-double', 'bat-grab', 'skel-bite'] as const) {
      expect(chaffMoveBlinkStrength({ chaffMove, chaffMoveAt: 1000 }, 1000)).toBe(1);
      expect(chaffMoveBlinkStrength({ chaffMove, chaffMoveAt: 1000 }, 1000 + TOTAL_MS)).toBe(0);
    }
  });
  it('chaffMoveAt未設定なら0(安全側デフォルト)', () => {
    expect(chaffMoveBlinkStrength({ ...base, chaffMoveAt: undefined }, 1000)).toBe(0);
  });
  it('技が立つ前(gameTime<chaffMoveAt)は0', () => {
    expect(chaffMoveBlinkStrength(base, 999)).toBe(0);
  });
  it(`★点灯${CHAFF_BLINK_ON_MS}ms→消灯${CHAFF_BLINK_OFF_MS}ms→点灯→消灯の2回点滅ちょうど`, () => {
    expect(chaffMoveBlinkStrength(base, 1000)).toBe(1);
    expect(chaffMoveBlinkStrength(base, 1000 + CHAFF_BLINK_ON_MS - 1)).toBe(1);
    expect(chaffMoveBlinkStrength(base, 1000 + CHAFF_BLINK_ON_MS)).toBe(0);
    expect(chaffMoveBlinkStrength(base, 1000 + CYCLE_MS - 1)).toBe(0);
    expect(chaffMoveBlinkStrength(base, 1000 + CYCLE_MS)).toBe(1);
    expect(chaffMoveBlinkStrength(base, 1000 + CYCLE_MS + CHAFF_BLINK_ON_MS - 1)).toBe(1);
    expect(chaffMoveBlinkStrength(base, 1000 + CYCLE_MS + CHAFF_BLINK_ON_MS)).toBe(0);
    expect(chaffMoveBlinkStrength(base, 1000 + TOTAL_MS - 1)).toBe(0);
  });
  it('★点滅の回数はちょうど2回(0→1の立ち上がりエッジを数える)', () => {
    let prev = 0, risingEdges = 0;
    for (let t = 0; t <= TOTAL_MS + 50; t++) {
      const v = chaffMoveBlinkStrength(base, 1000 + t);
      if (v > 0 && prev === 0) risingEdges++;
      prev = v;
    }
    expect(risingEdges).toBe(CHAFF_BLINK_COUNT);
  });
  it('★★点滅が終わった後はずっと0(「赤くなりながら突っ込んでくる」を作らない)', () => {
    expect(chaffMoveBlinkStrength(base, 1000 + TOTAL_MS)).toBe(0);
    for (const t of [TOTAL_MS + 1, 500, 1200, 3000, 10000]) {
      expect(chaffMoveBlinkStrength(base, 1000 + t)).toBe(0);
    }
  });
});

describe('zombieRecoverWalkRampMul(§16-3zクリエイティブ監査#3「硬直→歩きの出足の1フレーム段差を消す」)', () => {
  it('rampAt未定義なら1(呼び手を壊さない安全側デフォルト)', () => {
    expect(zombieRecoverWalkRampMul(undefined, 1000)).toBe(1);
  });
  it('入り口(0ms)は0(満速で始まらない)', () => {
    expect(zombieRecoverWalkRampMul(1000, 1000)).toBe(0);
  });
  it(`${ZOMBIE_RECOVER_WALK_RAMP_MS}ms経過で満速(1)`, () => {
    expect(zombieRecoverWalkRampMul(1000, 1000 + ZOMBIE_RECOVER_WALK_RAMP_MS)).toBeCloseTo(1, 5);
  });
  it('それ以降は1のまま(1を超えない)', () => {
    expect(zombieRecoverWalkRampMul(1000, 1000 + ZOMBIE_RECOVER_WALK_RAMP_MS + 5000)).toBe(1);
  });
  it('★単調増加(段差なし=慣性MUSTの検知器)', () => {
    let prev = -1;
    for (let t = 0; t <= ZOMBIE_RECOVER_WALK_RAMP_MS; t += 10) {
      const v = zombieRecoverWalkRampMul(1000, 1000 + t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('★社長裁定2026-09-16「停止の長さ±30%」+「個体差の種にspawnedAtを混ぜる」(§16-3z追補)', () => {
  describe('zombieRedPauseMs(停止の全長・基準値はZOMBIE_RED_PAUSE_MSのまま残す)', () => {
    it(`基準値 × (1±${ZOMBIE_RED_PAUSE_JITTER}) の範囲に収まる`, () => {
      for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
        for (const spawnedAt of [undefined, 0, 1000, 999999]) {
          const v = zombieRedPauseMs(id, spawnedAt);
          expect(v).toBeGreaterThanOrEqual(ZOMBIE_RED_PAUSE_MS * (1 - ZOMBIE_RED_PAUSE_JITTER));
          expect(v).toBeLessThanOrEqual(ZOMBIE_RED_PAUSE_MS * (1 + ZOMBIE_RED_PAUSE_JITTER));
        }
      }
    });
    it('同じid+spawnedAtは常に同じ値(決定的)', () => {
      expect(zombieRedPauseMs('z1', 12345)).toBe(zombieRedPauseMs('z1', 12345));
    });
    it('★②spawnedAtが未設定でも落ちない(既存個体のフォールバック=idだけで決定的)', () => {
      expect(() => zombieRedPauseMs('z1')).not.toThrow();
      expect(zombieRedPauseMs('z1')).toBe(zombieRedPauseMs('z1', undefined));
    });
    it('★②同じidでもspawnedAtが違えば(高確率で)値が変わる=出直せば別の癖になる', () => {
      const vals = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(s => zombieRedPauseMs('same-id', s * 10007)));
      expect(vals.size).toBeGreaterThan(1);
    });
  });

  describe('★①3段の比は全長によらず一定(社長裁定「一部だけ固定にすると形が変わる」)', () => {
    it('比率定数の合計は1(段が全長を過不足なく分割する)', () => {
      expect(ZOMBIE_RP_STUMBLE_FRAC + ZOMBIE_RP_RISE_FRAC + ZOMBIE_RP_TREMBLE_FRAC).toBeCloseTo(1, 10);
    });
    it('比率は元の500:900:600と一致する(基準2000msでの内訳。★2026-09-17でZOMBIE_RED_PAUSE_MS自体は' +
      '1200msへ詰まったが、比は元の基準2000msから固定値として持つ=変わらない)', () => {
      const ORIGINAL_BASE_MS = 2000;
      expect(ZOMBIE_RP_STUMBLE_FRAC).toBeCloseTo(500 / ORIGINAL_BASE_MS, 10);
      expect(ZOMBIE_RP_RISE_FRAC).toBeCloseTo(900 / ORIGINAL_BASE_MS, 10);
      expect(ZOMBIE_RP_TREMBLE_FRAC).toBeCloseTo(600 / ORIGINAL_BASE_MS, 10);
    });
    it('★全長が違う2個体でも、各段msを全長で割った比は同じ(pixiScene側の計算を模擬)', () => {
      const totalShort = zombieRedPauseMs('short-id', 1); // 個体Aの全長(短め寄り/長め寄りは問わない)
      const totalLong = zombieRedPauseMs('long-id', 2);    // 個体Bの全長(Aとは別の値になりうる)
      for (const total of [totalShort, totalLong, ZOMBIE_RED_PAUSE_MS * 0.7, ZOMBIE_RED_PAUSE_MS * 1.3]) {
        const stumbleMs = total * ZOMBIE_RP_STUMBLE_FRAC;
        const riseMs = total * ZOMBIE_RP_RISE_FRAC;
        const trembleMs = total * ZOMBIE_RP_TREMBLE_FRAC;
        expect(stumbleMs + riseMs + trembleMs).toBeCloseTo(total, 6);
        expect(stumbleMs / total).toBeCloseTo(ZOMBIE_RP_STUMBLE_FRAC, 10);
        expect(riseMs / total).toBeCloseTo(ZOMBIE_RP_RISE_FRAC, 10);
        expect(trembleMs / total).toBeCloseTo(ZOMBIE_RP_TREMBLE_FRAC, 10);
      }
    });
  });

  describe('zombieRedWaitMs / endChaffMoveも spawnedAt を種に混ぜる(対象は台帳どおり4値)', () => {
    it('zombieRedWaitMs: spawnedAt未設定でも落ちない・id単独と一致(フォールバック)', () => {
      expect(() => zombieRedWaitMs('id1')).not.toThrow();
      expect(zombieRedWaitMs('id1')).toBe(zombieRedWaitMs('id1', undefined));
    });
    it('zombieRedWaitMs: 同idでもspawnedAtが違えば(高確率で)値が変わる', () => {
      const vals = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(s => zombieRedWaitMs('same-id', s * 7919)));
      expect(vals.size).toBeGreaterThan(1);
    });

    const e = { id: 'z1', type: 'zombie' as EnemyType, chaffMove: 'zombie-double' as const, aiPhase: 'z-bite2' as const };
    it('endChaffMove: spawnedAt未設定でも落ちない・従来どおりidだけで決定的(フォールバック)', () => {
      expect(() => endChaffMove(e, 10000)).not.toThrow();
      expect(endChaffMove(e, 10000).chaffMoveCdUntil).toBe(endChaffMove({ ...e, spawnedAt: undefined }, 10000).chaffMoveCdUntil);
    });
    it('endChaffMove: 同idでもspawnedAtが違えば(高確率で)技後CDが変わる', () => {
      const vals = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(s => endChaffMove({ ...e, spawnedAt: s * 3571 }, 10000).chaffMoveCdUntil));
      expect(vals.size).toBeGreaterThan(1);
    });
  });

  describe('zombieBite2AngleRad(2発目の角度・向きはchaffTraitsのflankSignのまま、大きさにspawnedAtを混ぜる)', () => {
    it(`大きさは基準値 × (1±${ZOMBIE_BITE2_ANGLE_JITTER}) の範囲に収まる(符号はspinのまま)`, () => {
      for (const spin of [1, -1] as const) {
        for (const id of ['a', 'b', 'c']) {
          for (const spawnedAt of [undefined, 0, 5000]) {
            const v = zombieBite2AngleRad(id, spawnedAt, spin);
            const mag = Math.abs(v);
            expect(mag).toBeGreaterThanOrEqual(ZOMBIE_BITE2_ANGLE_OFFSET_RAD * (1 - ZOMBIE_BITE2_ANGLE_JITTER));
            expect(mag).toBeLessThanOrEqual(ZOMBIE_BITE2_ANGLE_OFFSET_RAD * (1 + ZOMBIE_BITE2_ANGLE_JITTER));
            expect(Math.sign(v)).toBe(spin); // 向きはspinのまま(chaffTraits.flankSign由来)
          }
        }
      }
    });
    it('★②spawnedAtが未設定でも落ちない(フォールバック=idだけで決定的)', () => {
      expect(() => zombieBite2AngleRad('id1', undefined, 1)).not.toThrow();
      expect(zombieBite2AngleRad('id1', undefined, 1)).toBe(zombieBite2AngleRad('id1', undefined, 1));
    });
    it('★②同じidでもspawnedAtが違えば(高確率で)角度の大きさが変わる', () => {
      const vals = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(s => zombieBite2AngleRad('same-id', s * 2003, 1)));
      expect(vals.size).toBeGreaterThan(1);
    });
  });
});

// ===================================================================================================
// §16-1 bat(社長指示2026-09-17「できるだけシビアに」で 円1500〜3000ms→900〜1800ms を反映)
// ===================================================================================================
describe('bat: 円を回る尺・刻む横歩き・回転方向(id由来の決定的な値)', () => {
  it('batOrbitDurationMsは900〜1800msに収まる(シビア反映)', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      const ms = batOrbitDurationMs(id, undefined);
      expect(ms).toBeGreaterThanOrEqual(BAT_ORBIT_MIN_MS);
      expect(ms).toBeLessThanOrEqual(BAT_ORBIT_MAX_MS);
    }
    expect(BAT_ORBIT_MIN_MS).toBe(900);
    expect(BAT_ORBIT_MAX_MS).toBe(1800);
  });
  it('同じid+spawnedAtは常に同じ値(決定的)', () => {
    expect(batOrbitDurationMs('b1', 500)).toBe(batOrbitDurationMs('b1', 500));
  });
  it('batStrafeMs/batHoldMsは指定範囲内(0.4〜0.7秒/0.2〜0.3秒)', () => {
    for (const id of ['a', 'b', 'c']) {
      const s = batStrafeMs(id, undefined), h = batHoldMs(id, undefined);
      expect(s).toBeGreaterThanOrEqual(BAT_STRAFE_MIN_MS);
      expect(s).toBeLessThanOrEqual(BAT_STRAFE_MAX_MS);
      expect(h).toBeGreaterThanOrEqual(BAT_HOLD_MIN_MS);
      expect(h).toBeLessThanOrEqual(BAT_HOLD_MAX_MS);
    }
  });
  it('batOrbitSpinは+1か-1のどちらか(spriteVariantIndex由来・添字0=右回り)', () => {
    for (const id of ['bat-1', 'bat-2', 'bat-3', 'bat-4']) {
      expect([1, -1]).toContain(batOrbitSpin(id));
    }
  });
});

describe('batStrafeAngularMul(刻む横歩きの角速度包絡線・慣性MUSTの検知器)', () => {
  const strafeMs = 500, holdMs = 250;
  it('止まり区間(strafeMs以降)は常に0', () => {
    expect(batStrafeAngularMul(strafeMs, strafeMs, holdMs)).toBe(0);
    expect(batStrafeAngularMul(strafeMs + holdMs - 1, strafeMs, holdMs)).toBeCloseTo(0, 5);
  });
  it('動く区間の始まり(0ms)と終わり(strafeMs直前)は0に近い(0→山→0=段差なし)', () => {
    expect(batStrafeAngularMul(0, strafeMs, holdMs)).toBeCloseTo(0, 5);
    expect(batStrafeAngularMul(strafeMs - 1, strafeMs, holdMs)).toBeLessThan(0.05);
  });
  it('動く区間の中央付近が最大(山なり)', () => {
    const mid = batStrafeAngularMul(strafeMs / 2, strafeMs, holdMs);
    expect(mid).toBeCloseTo(1, 2);
  });
  it('周期(strafeMs+holdMs)でモジュロして繰り返す', () => {
    const cycle = strafeMs + holdMs;
    expect(batStrafeAngularMul(strafeMs / 2, strafeMs, holdMs))
      .toBeCloseTo(batStrafeAngularMul(strafeMs / 2 + cycle * 3, strafeMs, holdMs), 5);
  });
  it('常に0以上(負の速度にならない=向きはspinが別で決める)', () => {
    for (let t = 0; t <= strafeMs + holdMs; t += 25) {
      expect(batStrafeAngularMul(t, strafeMs, holdMs)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('batWantsChaffSlot(枠の申告・bat版)', () => {
  const base = { id: 'bw1', type: 'bat' as EnemyType, aiPhase: undefined, chaffMoveCdUntil: undefined, x: 0, y: 0, width: 26, height: 26 };
  it('aiPhase未設定(=b-approach)かつ円の半径(100px)以内なら申告する', () => {
    expect(batWantsChaffSlot(base, 1000, 13, 13)).toBe(true); // 中心(13,13)と同座標=距離0
    expect(batWantsChaffSlot(base, 1000, 13 + 100, 13)).toBe(true); // ちょうど100px
  });
  it('円の半径より外なら申告しない', () => {
    expect(batWantsChaffSlot(base, 1000, 13 + 101, 13)).toBe(false);
  });
  it('bat以外の型は申告しない', () => {
    expect(batWantsChaffSlot({ ...base, type: 'skeleton' as EnemyType }, 1000, 13, 13)).toBe(false);
  });
  it('aiPhaseが設定済み(orbit中など)は申告しない(取るのはb-approachの間だけ)', () => {
    expect(batWantsChaffSlot({ ...base, aiPhase: 'b-orbit' as const }, 1000, 13, 13)).toBe(false);
  });
  it('技後CD中は申告しない', () => {
    expect(batWantsChaffSlot({ ...base, chaffMoveCdUntil: 2000 }, 1000, 13, 13)).toBe(false);
  });
  it('技後CDが明けていれば申告できる', () => {
    expect(batWantsChaffSlot({ ...base, chaffMoveCdUntil: 500 }, 1000, 13, 13)).toBe(true);
  });
});

// ===================================================================================================
// §16-2 skeleton(社長指示2026-09-17「できるだけシビアに」で しゃがみ2000→900ms・弧900→700ms 等)
// ===================================================================================================
describe('skeleton: 定数のシビア反映確認(変えた値/変えない値)', () => {
  it('しゃがみは900ms(元は社長指定の2000msを今回の指示で詰めた・予告の下限800msは守る)', () => {
    expect(SKELETON_CROUCH_MS).toBe(900);
    expect(SKELETON_CROUCH_MS).toBeGreaterThanOrEqual(800);
  });
  it('弧の尺は700ms', () => {
    expect(SKELETON_ARC_MS).toBe(700);
  });
  it('★噛み後の硬直(500ms)は変えない(社長裁定の値・プレイヤーの取り分)', () => {
    expect(SKELETON_RECOVER_MS).toBe(500);
  });
  it('★発火距離(100px)・後退速度(1.5倍)は変えない', () => {
    expect(SKELETON_TRIGGER_PX).toBe(100);
    expect(SKELETON_RETREAT_SPEED_MULT).toBe(1.5);
  });
});

describe('skeletonWantsChaffSlot(枠の申告・skeleton版)', () => {
  const base = { id: 'sw1', type: 'skeleton' as EnemyType, aiPhase: undefined, chaffMoveCdUntil: undefined, x: 0, y: 0, width: 31, height: 31 };
  it('aiPhase未設定かつ発火距離(100px)以内なら申告する', () => {
    expect(skeletonWantsChaffSlot(base, 1000, 15.5, 15.5)).toBe(true);
  });
  it('発火距離より外なら申告しない', () => {
    expect(skeletonWantsChaffSlot(base, 1000, 15.5 + 101, 15.5)).toBe(false);
  });
  it('skeleton以外の型は申告しない', () => {
    expect(skeletonWantsChaffSlot({ ...base, type: 'bat' as EnemyType }, 1000, 15.5, 15.5)).toBe(false);
  });
  it('aiPhaseが設定済みは申告しない', () => {
    expect(skeletonWantsChaffSlot({ ...base, aiPhase: 's-crouch' as const }, 1000, 15.5, 15.5)).toBe(false);
  });
  it('技後CD中は申告しない', () => {
    expect(skeletonWantsChaffSlot({ ...base, chaffMoveCdUntil: 2000 }, 1000, 15.5, 15.5)).toBe(false);
  });
});

describe('skeletonArcPoint(弧の軌道・直線にしない=§16-2)', () => {
  it('u=0で開始点、u=1で終点(プレイヤー中心からSKELETON_TRIGGER_PXの横)', () => {
    const start = skeletonArcPoint(200, 0, 0, 0, true, 0);
    expect(start.x).toBeCloseTo(200, 5);
    expect(start.y).toBeCloseTo(0, 5);
    const end = skeletonArcPoint(200, 0, 0, 0, true, 1);
    expect(Math.hypot(end.x, end.y)).toBeCloseTo(SKELETON_TRIGGER_PX, 3);
  });
  it('★直線にしない: 中間点(u=0.5)が開始点・終点を結ぶ直線から外側へずれている', () => {
    const start = skeletonArcPoint(200, 0, 0, 0, true, 0);
    const end = skeletonArcPoint(200, 0, 0, 0, true, 1);
    const mid = skeletonArcPoint(200, 0, 0, 0, true, 0.5);
    const straightMidX = (start.x + end.x) / 2, straightMidY = (start.y + end.y) / 2;
    const dev = Math.hypot(mid.x - straightMidX, mid.y - straightMidY);
    expect(dev).toBeGreaterThan(SKELETON_TRIGGER_PX * SKELETON_ARC_DEPTH * 0.3); // 明確に膨らんでいる
  });
  it('side(true/false)で終点が反対側になる', () => {
    const endA = skeletonArcPoint(200, 0, 0, 0, true, 1);
    const endB = skeletonArcPoint(200, 0, 0, 0, false, 1);
    expect(endA.x).toBeCloseTo(-endB.x, 5);
    expect(endA.y).toBeCloseTo(-endB.y, 5);
  });
});

// ===================================================================================================
// プレイヤーの拘束(bat の掴み)
// ===================================================================================================
describe('isPlayerGrabbed(§16-1・isPvpIncapacitatedと同じ形)', () => {
  it('grabbedUntil未設定なら常にfalse', () => {
    expect(isPlayerGrabbed({ grabbedUntil: undefined }, 1000)).toBe(false);
  });
  it('gameTime < grabbedUntil の間はtrue', () => {
    expect(isPlayerGrabbed({ grabbedUntil: 2000 }, 1999)).toBe(true);
  });
  it('gameTime >= grabbedUntil ならfalse(時間切れで自動失効)', () => {
    expect(isPlayerGrabbed({ grabbedUntil: 2000 }, 2000)).toBe(false);
  });
  it('拘束の尺は500ms(台帳・変えない)', () => {
    expect(BAT_GRAB_HOLD_MS).toBe(500);
  });
});
