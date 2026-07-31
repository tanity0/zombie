import { describe, it, expect } from 'vitest';
import { bossBehindFadeApplies, BOSS_BEHIND_MIN_SPRITE_W_MULT } from './renderSpec';
import { ENEMY_STATS } from '../utils/enemyUtils';
import { PLAYER_HITBOX } from '../store/gameStore';

// ==== v0.25.2615: 「裏回り透け」の適用範囲(社長報告「どこにいても影しかない…当たり判定だけ
// あって透明だから何もできずにやられる」の再発防止) ====
//
// pixiScene.BOSS_SPRITE_FIT の w(絵の幅に対する当たり判定幅の比)の**複製**。
// pixiScene.ts は PixiJS を import するのでテストから読めない=ここへ写して持つ
// (bossTelegraph.AOE_TELEGRAPH_AUDIT と同じ確立済みの作法)。
// **掟: pixiScene の BOSS_SPRITE_FIT を動かしたらここも直す。** 当たり判定の幅そのものは
// ENEMY_STATS から実物を読むので、そちら側のズレは自動で検知できる。
const FIT_W: Record<string, number> = {
  mimir: 0.55, jormungand: 0.91, skadi: 0.92, thor: 0.50,
  miguel: 0.50, jibril: 0.50, rafi: 0.50, uri: 0.50, suriel: 0.50, acrasiel: 0.55,
  idol: 0.42,
};
const spriteW = (type: string): number => ENEMY_STATS[type as keyof typeof ENEMY_STATS].width / FIT_W[type];

// 透けを掛ける側=自機を隠しうる巨体 / 掛けない側=人型サイズ。
const APPLIES = ['mimir', 'jormungand', 'skadi', 'thor'];
const EXCLUDED = ['idol', 'acrasiel', 'miguel', 'jibril', 'rafi', 'uri', 'suriel'];

describe('bossBehindFadeApplies — 自機を隠せない絵には透けを掛けない', () => {
  it('巨体4体には掛かる(従来どおり=救済の意図を保存)', () => {
    for (const t of APPLIES) {
      expect(bossBehindFadeApplies(spriteW(t), PLAYER_HITBOX), `${t}(${Math.round(spriteW(t))}px)`).toBe(true);
    }
  });

  it('【本件の再発防止】人型サイズ7体には掛からない(idolを含む)', () => {
    for (const t of EXCLUDED) {
      expect(bossBehindFadeApplies(spriteW(t), PLAYER_HITBOX), `${t}(${Math.round(spriteW(t))}px)`).toBe(false);
    }
  });

  it('閾値は「谷」の中にある(4.29倍と10.0倍の間)=どちらの側にも余裕がある', () => {
    const excludedMax = Math.max(...EXCLUDED.map(t => spriteW(t) / PLAYER_HITBOX));
    const appliesMin = Math.min(...APPLIES.map(t => spriteW(t) / PLAYER_HITBOX));
    expect(excludedMax).toBeLessThan(BOSS_BEHIND_MIN_SPRITE_W_MULT);
    expect(appliesMin).toBeGreaterThan(BOSS_BEHIND_MIN_SPRITE_W_MULT);
    // 谷が十分広い(閾値が片側に寄っていない)ことも固定する。
    expect(appliesMin / excludedMax).toBeGreaterThan(2);
  });

  it('閾値は自機の大きさ基準(絶対値のベタ書きではない)', () => {
    // 自機が2倍の大きさになれば、境界も2倍になる。
    const w = spriteW('thor');
    expect(bossBehindFadeApplies(w, PLAYER_HITBOX)).toBe(true);
    expect(bossBehindFadeApplies(w, PLAYER_HITBOX * 2)).toBe(false);
  });

  it('境界値(ちょうど7倍)は適用側', () => {
    expect(bossBehindFadeApplies(PLAYER_HITBOX * BOSS_BEHIND_MIN_SPRITE_W_MULT, PLAYER_HITBOX)).toBe(true);
    expect(bossBehindFadeApplies(PLAYER_HITBOX * BOSS_BEHIND_MIN_SPRITE_W_MULT - 0.01, PLAYER_HITBOX)).toBe(false);
  });
});
