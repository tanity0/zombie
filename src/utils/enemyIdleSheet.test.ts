// ★待機中(呼吸)の絵の拍。社長支給2026-09-21「プラントの待機中(呼吸)」。
import { describe, it, expect } from 'vitest';
import { enemyIdleFrame, IDLE_PAUSE_FRAC } from './enemyIdleSheet';
import { ENEMY_IDLE_SHEETS, ENEMY_IDLE_PERIOD_MS, idleSheetFrames, idleSheetName } from './enemySheets';
import { ENEMY_VARIANT_SETS } from './enemyVariant';

const FR = ENEMY_IDLE_SHEETS['plant-common'];
const P = ENEMY_IDLE_PERIOD_MS['plant-common'];
const LAST = FR - 1;

describe('★表', () => {
  it('シート名は<立ち絵名>-idle', () => expect(idleSheetName('plant-common')).toBe('plant-common-idle'));

  it('表に載る立ち絵は実在する変種の絵であること(名前を間違えると一生出ない)', () => {
    const all = new Set(Object.values(ENEMY_VARIANT_SETS).flat());
    for (const n of Object.keys(ENEMY_IDLE_SHEETS)) expect(all.has(n), n).toBe(true);
  });

  it('★周期を登録し忘れた絵が無い(既定へ黙って落ちない)', () => {
    for (const n of Object.keys(ENEMY_IDLE_SHEETS)) {
      expect(ENEMY_IDLE_PERIOD_MS[n], n).toBeGreaterThan(0);
    }
  });

  it('表に無い絵は0コマ(表から導出する)', () => {
    const rest = Object.values(ENEMY_VARIANT_SETS).flat().filter(n => !(n in ENEMY_IDLE_SHEETS));
    expect(rest.length).toBeGreaterThan(0);
    for (const n of rest) expect(idleSheetFrames(n), n).toBe(0);
  });
});

describe('★★呼吸は往復する(前方ループで跳ねない)', () => {
  it('1周期に、先頭コマも末コマも必ず出る', () => {
    const seen = new Set<number>();
    for (let t = 0; t < P; t += 5) seen.add(enemyIdleFrame(FR, t, 0, P)!);
    expect(seen.size).toBe(FR);        // 全コマ出る(飛ばさない)
    expect(seen.has(0)).toBe(true);
    expect(seen.has(LAST)).toBe(true);
  });

  it('★末コマから先頭コマへ1コマで飛ばない(=跳ねない)', () => {
    let prev = enemyIdleFrame(FR, 0, 0, P)!;
    for (let t = 1; t < P * 3; t += 1) {
      const cur = enemyIdleFrame(FR, t, 0, P)!;
      expect(Math.abs(cur - prev), `t=${t}`).toBeLessThanOrEqual(1);
      prev = cur;
    }
  });

  it('★吐き切った所(先頭コマ)で一拍止まる(折り返しの瞬間反転を作らない)', () => {
    let zeroMs = 0;
    for (let t = 0; t < P; t++) if (enemyIdleFrame(FR, t, 0, P) === 0) zeroMs++;
    // 止まる割合のぶんは最低でも先頭コマのまま(往復の行き帰りぶんが更に乗る)。
    expect(zeroMs).toBeGreaterThanOrEqual(P * IDLE_PAUSE_FRAC);
    expect(zeroMs).toBeLessThan(P * 0.6);   // 止まってばかり=呼吸して見えない、にはしない
  });

  it('個体ごとに位相がずれる(群れが同時に呼吸しない)', () => {
    const a = enemyIdleFrame(FR, 1234, 0, P);
    const b = enemyIdleFrame(FR, 1234, Math.PI, P);
    expect(a).not.toBe(b);
  });

  it('コマ番号は必ず範囲内 / 1コマや周期0では動かさない', () => {
    for (let t = 0; t < P * 2; t += 7) {
      const i = enemyIdleFrame(FR, t, 1.1, P)!;
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(FR);
    }
    expect(enemyIdleFrame(1, 0, 0, P)).toBeNull();
    expect(enemyIdleFrame(FR, 0, 0, 0)).toBeNull();
  });
});
