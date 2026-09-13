import { describe, it, expect } from 'vitest';
import {
  isTrapDebuffed, trapGatedOverclockChance, trapGatedCooldownMult,
  TRAP_PVP_DEBUFF_MS, TRAP_PVP_RELOAD_MULT, TRAP_ROOT_CRIT_BONUS,
} from './trapDebuff';

// ★対人トラップの効果(社長裁定2026-08-25・SAME_ARENA §3-g)。
// 「対人のみ」が**フィールドの有無だけ**で成立していることを固定する(=幻影/守護霊の疑似Playerには
// trapDebuffUntil が無いので、同じ関数を通しても素通しになる)。
describe('対人トラップ: 効果中かの判定', () => {
  it('期限より前は効果中・期限ちょうど/後は切れている(境界を固定)', () => {
    expect(isTrapDebuffed({ trapDebuffUntil: 1000 }, 999)).toBe(true);
    expect(isTrapDebuffed({ trapDebuffUntil: 1000 }, 1000)).toBe(false);
    expect(isTrapDebuffed({ trapDebuffUntil: 1000 }, 1001)).toBe(false);
  });

  it('★対人のみ: trapDebuffUntil を持たない主語(幻影・守護霊の疑似Player)は常に効果なし', () => {
    expect(isTrapDebuffed({}, 0)).toBe(false);
    expect(isTrapDebuffed(undefined, 0)).toBe(false);
    expect(isTrapDebuffed({ trapDebuffUntil: 0 }, 0)).toBe(false);
  });
});

describe('対人トラップ: ④CD短縮系の無効化', () => {
  it('効果中はオーバークロックの確率が0・タイムキーパーの倍率が1になる', () => {
    const trapped = { trapDebuffUntil: 1000 };
    expect(trapGatedOverclockChance(trapped, 0.35, 500)).toBe(0);
    expect(trapGatedCooldownMult(trapped, 0.6, 500)).toBe(1);
  });

  it('効果が切れていれば素通し(短縮はそのまま効く)', () => {
    const free = { trapDebuffUntil: 1000 };
    expect(trapGatedOverclockChance(free, 0.35, 1500)).toBe(0.35);
    expect(trapGatedCooldownMult(free, 0.6, 1500)).toBe(0.6);
  });

  it('幻影/守護霊の主語では短縮が生きたまま(対人のみ=CD帳簿を取り合わない)', () => {
    expect(trapGatedOverclockChance({}, 0.35, 500)).toBe(0.35);
    expect(trapGatedCooldownMult({}, 0.6, 500)).toBe(0.6);
  });
});

describe('対人トラップ: 値の台帳', () => {
  it('効果時間は敵側の拘束(MARKSMAN_TRAP_STUN_MS=3000)と同じ長さ', () => {
    // useGameLoop の定数は非exportなので、ここでは「3秒である」ことを直接固定する
    // (両方を動かす時に必ず片方が落ちる=数字が2組に割れるのを防ぐ)。
    expect(TRAP_PVP_DEBUFF_MS).toBe(3000);
  });

  it('リロードは1.5倍・クリ率アップは対敵と同じ+10%', () => {
    expect(TRAP_PVP_RELOAD_MULT).toBe(1.5);
    expect(TRAP_ROOT_CRIT_BONUS).toBe(0.10);
  });
});
