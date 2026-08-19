// SKILL_BUILD_REDESIGN.md §28-3受け入れ条件1: 新スキル9種の効果ユニットテスト
// (判定値・確率はrng注入で決定的に)。
import { describe, it, expect } from 'vitest';
import {
  bigBulletSizeMult, BIG_BULLET_SIZE_MULT_BY_LEVEL,
  iceShotSlowParams, ICE_SHOT_SHARD_COUNT, ICE_SHOT_SHARD_DMG_MULT,
  rollVampireHeal, VAMPIRE_PROC_CHANCE, VAMPIRE_HEAL_BY_LEVEL,
  incendiaryBurnParams, INCENDIARY_FLOOR_SMALL_RADIUS, INCENDIARY_FLOOR_LARGE_RADIUS,
  executionShockParams,
  rollGravityShotWell, GRAVITY_SHOT_PULL_SPEED, GRAVITY_SHOT_PULL_MS,
  rollEchoShot,
  barrageKingMult, BARRAGE_KING_PIERCE,
  bloodTreadsParams, BLOOD_TREADS_WIDTH_PX, BLOOD_TREADS_TICK_MS,
  BOMB_COUNTER_SELF_BLAST_RADIUS_MULT,
} from './skillEffectsB7';

// 決定的な擬似rng: 常に同じ値を返す/一度だけ違う値を返す等、テストごとに用意する。
const constRng = (v: number) => () => v;

describe('big-bullet: 弾サイズ×1.3/1.5/1.7', () => {
  it('未所持(Lv0)は等倍', () => expect(bigBulletSizeMult(0)).toBe(1));
  it('Lv1/2/3', () => {
    expect(bigBulletSizeMult(1)).toBeCloseTo(1.3);
    expect(bigBulletSizeMult(2)).toBeCloseTo(1.5);
    expect(bigBulletSizeMult(3)).toBeCloseTo(1.7);
  });
  it('テーブル長は4(index0=未所持含む)', () => expect(BIG_BULLET_SIZE_MULT_BY_LEVEL.length).toBe(4));
});

describe('ice-shot: 鈍足20%/30%/40%・1s/1s/1.5s', () => {
  // 社長裁定v0.25.3280: 40%/50%/60%・2s/2.5s/3s(ボスは強度のみ半分=ICE_SHOT_BOSS_EFFECT_MULT)。
  it('Lv1', () => expect(iceShotSlowParams(1)).toEqual({ pct: 0.4, ms: 2000 }));
  it('Lv2', () => expect(iceShotSlowParams(2)).toEqual({ pct: 0.5, ms: 2500 }));
  it('Lv3', () => expect(iceShotSlowParams(3)).toEqual({ pct: 0.6, ms: 3000 }));
  it('氷片は全Lv共通3個・0.3倍', () => {
    expect(ICE_SHOT_SHARD_COUNT).toBe(3);
    expect(ICE_SHOT_SHARD_DMG_MULT).toBeCloseTo(0.3);
  });
});

// ★社長裁定v0.25.3603「吸血はキルで確定発動にする 100%」。旧仕様(キルの20%・率固定)は
// 事実として記録: v0.25.3602まで VAMPIRE_PROC_CHANCE=0.2 だった。
describe('vampire: キルで確定発動 HP+2/+4/+6(v0.25.3603裁定)', () => {
  it('キルで必ずLv別の回復量(rngの値によらない=100%)', () => {
    expect(rollVampireHeal(1, constRng(0))).toBe(2);
    expect(rollVampireHeal(2, constRng(0.5))).toBe(4);
    expect(rollVampireHeal(3, constRng(0.99))).toBe(6);
  });
  it('未所持は常に0', () => expect(rollVampireHeal(0, constRng(0))).toBe(0));
  it('確率は1.0(確定)・レベル表は[0,2,4,6]', () => {
    expect(VAMPIRE_PROC_CHANCE).toBe(1.0);
    expect(VAMPIRE_HEAL_BY_LEVEL).toEqual([0, 2, 4, 6]);
  });
});

describe('incendiary-round: Lv1燃焼のみ/Lv2+炎床小/Lv3燃焼強化+炎床大', () => {
  it('Lv1: 秒2×3秒・炎床なし', () => expect(incendiaryBurnParams(1)).toEqual({ dps: 2, durationMs: 3000, floorRadius: null }));
  it('Lv2: 秒2×3秒・炎床小(モロトフ半径そのまま)', () => {
    const p = incendiaryBurnParams(2);
    expect(p.dps).toBe(2);
    expect(p.durationMs).toBe(3000);
    expect(p.floorRadius).toBe(INCENDIARY_FLOOR_SMALL_RADIUS);
  });
  it('Lv3: 秒4×4秒・炎床大(小より大きい)', () => {
    const p = incendiaryBurnParams(3);
    expect(p.dps).toBe(4);
    expect(p.durationMs).toBe(4000);
    expect(p.floorRadius).toBe(INCENDIARY_FLOOR_LARGE_RADIUS);
    expect(INCENDIARY_FLOOR_LARGE_RADIUS).toBeGreaterThan(INCENDIARY_FLOOR_SMALL_RADIUS);
  });
  it('未所持は無効', () => expect(incendiaryBurnParams(0)).toEqual({ dps: 0, durationMs: 0, floorRadius: null }));
});

describe('execution-shock: 半径80/100/120・近接表示ダメの30/40/50%', () => {
  it('Lv1/2/3', () => {
    expect(executionShockParams(1)).toEqual({ radius: 80, pct: 0.3 });
    expect(executionShockParams(2)).toEqual({ radius: 100, pct: 0.4 });
    expect(executionShockParams(3)).toEqual({ radius: 120, pct: 0.5 });
  });
});

describe('gravity-shot: キルの20/30/40%で爆縮(半径100/120/140・引き寄せ120px/s×0.4s)', () => {
  it('発動(rng<chance)ならLv別半径を返す', () => {
    expect(rollGravityShotWell(1, constRng(0))).toEqual({ radius: 100 });
    expect(rollGravityShotWell(2, constRng(0.29))).toEqual({ radius: 120 });
    expect(rollGravityShotWell(3, constRng(0.39))).toEqual({ radius: 140 });
  });
  it('非発動ならnull', () => {
    expect(rollGravityShotWell(1, constRng(0.2))).toBeNull();
    expect(rollGravityShotWell(3, constRng(0.4))).toBeNull();
  });
  it('未所持は常にnull', () => expect(rollGravityShotWell(0, constRng(0))).toBeNull());
  it('引き寄せ速度・持続は全Lv共通(120px/s・0.4s)', () => {
    expect(GRAVITY_SHOT_PULL_SPEED).toBe(120);
    expect(GRAVITY_SHOT_PULL_MS).toBe(400);
  });
});

describe('echo-shot: クリ時50/75/100%で複製弾', () => {
  it('発動判定(rng<chance)', () => {
    expect(rollEchoShot(1, constRng(0.49))).toBe(true);
    expect(rollEchoShot(1, constRng(0.5))).toBe(false);
    expect(rollEchoShot(2, constRng(0.74))).toBe(true);
    expect(rollEchoShot(3, constRng(0.999))).toBe(true); // Lv3=100%
  });
  it('未所持は常にfalse', () => expect(rollEchoShot(0, constRng(0))).toBe(false));
});

describe('barrage-king: 反射弾×1.5/1.75/2.0+貫通1(全Lv)', () => {
  it('未所持は等倍', () => expect(barrageKingMult(0)).toBe(1));
  it('Lv1/2/3', () => {
    expect(barrageKingMult(1)).toBeCloseTo(1.5);
    expect(barrageKingMult(2)).toBeCloseTo(1.75);
    expect(barrageKingMult(3)).toBeCloseTo(2.0);
  });
  it('貫通は全Lv共通1', () => expect(BARRAGE_KING_PIERCE).toBe(1));
});

describe('blood-treads: 棘2秒・秒2/3秒・秒3/4秒・秒4(幅24px・tick250ms)', () => {
  it('Lv1/2/3', () => {
    expect(bloodTreadsParams(1)).toEqual({ durationMs: 2000, dps: 2 });
    expect(bloodTreadsParams(2)).toEqual({ durationMs: 3000, dps: 3 });
    expect(bloodTreadsParams(3)).toEqual({ durationMs: 4000, dps: 4 });
  });
  it('幅・tickは§16-5の判定叩き台どおり', () => {
    expect(BLOOD_TREADS_WIDTH_PX).toBe(24);
    expect(BLOOD_TREADS_TICK_MS).toBe(250);
  });
});

describe('bomb-counter追加(§28-1): 自分中心爆発を大爆発に(半径×1.8)', () => {
  it('叩き台の倍率', () => expect(BOMB_COUNTER_SELF_BLAST_RADIUS_MULT).toBeCloseTo(1.8));
});
