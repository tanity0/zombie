import { describe, it, expect } from 'vitest';
import {
  hitReactionStrength, enemyHitReaction,
  FLINCH_MIN_STRENGTH, FLINCH_FULL_DAMAGE_FRAC, FLINCH_FULL_DAMAGE_FRAC_BOSS, FLINCH_FULL_DAMAGE_ABS,
  flinchMul, hopMul, flashMul, knockbackSpeedMul, knockbackDurationMul, hitStopMul,
} from './hitFlinch';

// 実測の基準(2026-09-17): ゾンビの実効HPは ENEMY_STATS.health(40) × ENEMY_HP_MULT(5) ≈ 200。
const ZOMBIE_HP = 200;
const HANDGUN = 9;   // handgun-t1
const BURN_TICK = 5; // MOLOTOV_DOT_DAMAGE

describe('hitReactionStrength — 1つの数が全部の被弾リアクションを決める', () => {
  it('★満額には2つの軸を両方満たす必要がある(割合6% かつ 絶対量14)', () => {
    expect(FLINCH_FULL_DAMAGE_FRAC).toBe(0.06);
    expect(FLINCH_FULL_DAMAGE_ABS).toBe(14);
    // 割合は満たすが絶対量が足りない(ゾンビの6%=12ダメージ)→ 満額にならない
    expect(hitReactionStrength(ZOMBIE_HP * 0.06, ZOMBIE_HP)).toBeLessThan(1);
    // 両方満たせば満額
    expect(hitReactionStrength(FLINCH_FULL_DAMAGE_ABS, ZOMBIE_HP)).toBe(1);
    expect(hitReactionStrength(ZOMBIE_HP * 0.5, ZOMBIE_HP)).toBe(1);
  });

  it('★★普通の一発(ハンドガン)は下限に張り付かない — これが旧実装の本当の壊れ方', () => {
    const v = hitReactionStrength(HANDGUN, ZOMBIE_HP);
    expect(v).toBeGreaterThan(0.6);     // 旧式(閾値15%)ではここが下限0.15だった
    expect(v).toBeLessThan(1);          // ただし満額でもない(上に伸びしろがある)
  });

  it('★★小さい敵でも軽い一撃は軽い(絶対量の軸)— コウモリは実効HP40なので割合だけだと全部満額になる', () => {
    const BAT_HP = 40;
    expect(hitReactionStrength(BURN_TICK, BAT_HP)).toBeLessThan(0.45);
    expect(hitReactionStrength(HANDGUN, BAT_HP)).toBeLessThan(0.8);
    expect(hitReactionStrength(14, BAT_HP)).toBe(1);        // ハチェット1振りは満額
  });

  it('★巨体は同じ一撃でも動じない(割合の軸)', () => {
    expect(hitReactionStrength(14, 40)).toBe(1);
    expect(hitReactionStrength(14, 2500, FLINCH_FULL_DAMAGE_FRAC_BOSS)).toBeLessThan(0.4);
  });

  it('★延焼の1tickは普通の一発よりはっきり弱い', () => {
    const burn = hitReactionStrength(BURN_TICK, ZOMBIE_HP);
    const shot = hitReactionStrength(HANDGUN, ZOMBIE_HP);
    expect(burn).toBeLessThan(shot);
    expect(shot / burn).toBeGreaterThan(1.5);
  });

  it('★下限は「体感あるくらい」(社長指示2026-09-17)=しなり角にして約10度', () => {
    expect(FLINCH_MIN_STRENGTH).toBe(0.30);
    const SKEW_FULL_RAD = 0.58;                       // pixiScene の ENEMY_HIT_FLINCH_SKEW
    const deg = SKEW_FULL_RAD * FLINCH_MIN_STRENGTH * 180 / Math.PI;
    expect(deg).toBeGreaterThan(8);                   // 旧下限0.15は約5度=見えなかった
    expect(deg).toBeLessThan(14);                     // 下限は"最小で認識できる"であって"快適"ではない
  });

  it('下限を下回らない / 1を超えない / 0除算しない', () => {
    expect(hitReactionStrength(0, ZOMBIE_HP)).toBe(FLINCH_MIN_STRENGTH);
    expect(hitReactionStrength(-5, ZOMBIE_HP)).toBe(FLINCH_MIN_STRENGTH);
    expect(hitReactionStrength(9999, ZOMBIE_HP)).toBe(1);
    expect(Number.isFinite(hitReactionStrength(5, 0))).toBe(true);
  });

  it('記録が無い被弾は満額(情報が無い時に弱める賭けをしない)', () => {
    expect(hitReactionStrength(undefined, ZOMBIE_HP)).toBe(1);
  });
});

describe('enemyHitReaction — 強個体・ボスは「除外」ではなく閾値を下げる', () => {
  it('★強個体も式を通る(旧は常に満額で、延焼の1tickでも満額でのけぞっていた)', () => {
    const burn = enemyHitReaction({ type: 'pumpkin', lastHitDmg: BURN_TICK, maxHealth: 750 });
    expect(burn).toBeLessThan(0.4);                      // 下限(0.30)のすぐ上まで落ちる
    expect(burn).toBeLessThan(enemyHitReaction({ type: 'pumpkin', lastHitDmg: 31, maxHealth: 750 }));
  });

  it('★それでも重い一発はちゃんと満額(閾値が2%なので)', () => {
    expect(FLINCH_FULL_DAMAGE_FRAC_BOSS).toBe(0.02);
    expect(enemyHitReaction({ type: 'pumpkin', lastHitDmg: 31, maxHealth: 750 })).toBe(1);
  });

  it('★強個体は雑魚より反応が鈍い(大きく重い体なので正しい)', () => {
    const elite = enemyHitReaction({ type: 'pumpkin', lastHitDmg: HANDGUN, maxHealth: 750 });
    const mob = enemyHitReaction({ type: 'zombie', lastHitDmg: HANDGUN, maxHealth: ZOMBIE_HP });
    expect(elite).toBeLessThan(mob);
    expect(elite).toBeGreaterThan(FLINCH_MIN_STRENGTH);   // ただし無反応ではない
  });

  it('城ボスにハンドガンは下限(拳銃で巨体はよろけない)', () => {
    expect(enemyHitReaction({ type: 'giantbat', lastHitDmg: HANDGUN, maxHealth: 2500 })).toBe(FLINCH_MIN_STRENGTH);
  });

  it('城ボスの延焼1tickは下限へ落ちる', () => {
    expect(enemyHitReaction({ type: 'giantbat', lastHitDmg: BURN_TICK, maxHealth: 2500 })).toBe(FLINCH_MIN_STRENGTH);
  });

  it('雑魚も量で変わる', () => {
    expect(enemyHitReaction({ type: 'zombie', lastHitDmg: BURN_TICK, maxHealth: ZOMBIE_HP }))
      .toBeLessThan(enemyHitReaction({ type: 'zombie', lastHitDmg: HANDGUN, maxHealth: ZOMBIE_HP }));
  });
});

describe('反応ごとの倍率 — 「今の普通の一発」が今と同じ手応えになるよう基準化してある', () => {
  const REF = hitReactionStrength(HANDGUN, ZOMBIE_HP);   // ハンドガン1発 ≒ 0.64

  it('★ハンドガン1発で、跳ね・フラッシュ・ノックバックが今と同じ(≒1.0倍)', () => {
    for (const f of [hopMul, flashMul, knockbackSpeedMul, knockbackDurationMul]) {
      expect(f(REF)).toBeGreaterThan(0.95);
      expect(f(REF)).toBeLessThan(1.06);
    }
  });

  it('★停止時間だけは、普通の一発でも今より長い(社長指示「停止時間もそれによって長く」)', () => {
    expect(hitStopMul(REF)).toBeGreaterThan(1.1);
    expect(hitStopMul(1)).toBeCloseTo(1.55, 5);
  });

  it('★どの倍率も、強さについて単調増加(重い一発ほど必ず強く出る)', () => {
    for (const f of [flinchMul, hopMul, flashMul, knockbackSpeedMul, knockbackDurationMul, hitStopMul]) {
      let prev = -1;
      for (let r = FLINCH_MIN_STRENGTH; r <= 1.0001; r += 0.05) {
        const v = f(r);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });

  it('★下限でも0にはならない(「効いていない」に見せない)', () => {
    for (const f of [flinchMul, hopMul, flashMul, knockbackSpeedMul, knockbackDurationMul, hitStopMul]) {
      expect(f(FLINCH_MIN_STRENGTH)).toBeGreaterThan(0.25);
    }
  });
});
