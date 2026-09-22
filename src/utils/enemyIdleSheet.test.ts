// ★待機中(呼吸)の絵の拍。社長支給2026-09-21「プラントの待機中(呼吸)」。
import { describe, it, expect } from 'vitest';
import { enemyIdleFrame, IDLE_PAUSE_FRAC } from './enemyIdleSheet';
import {
  ENEMY_IDLE_SHEETS, ENEMY_IDLE_PERIOD_MS, ENEMY_IDLE_PLAYBACK,
  idleSheetFrames, idleSheetName, idleSheetPlayback,
} from './enemySheets';
import { ENEMY_VARIANT_SETS } from './enemyVariant';

const FR = ENEMY_IDLE_SHEETS['plant-common'];
const P = ENEMY_IDLE_PERIOD_MS['plant-common'];
const LAST = FR - 1;

describe('★表', () => {
  it('シート名は<立ち絵名>-idle', () => expect(idleSheetName('plant-common')).toBe('plant-common-idle'));

  // ★**この検査は `enemySheetFiles.test.ts`(PNGが実在するか)へ移した**(v0.25.4563)。
  // 変種の表(`ENEMY_VARIANT_SETS`)は**男女2種などを持つ敵だけ**の表で、ハンターのように
  // 変種を持たない敵は載っていない=**正しい名前でも落ちる**。しかも**シート側のファイル名を
  // 1バイトも見ていなかった**ので、「名前を間違えると一生出ない」を捕まえられていなかった。


  it('★周期を登録し忘れた絵が無い(既定へ黙って落ちない)', () => {
    for (const n of Object.keys(ENEMY_IDLE_SHEETS)) {
      expect(ENEMY_IDLE_PERIOD_MS[n], n).toBeGreaterThan(0);
    }
  });

  // ★送り方は絵の意味で決まる(往復/流れ続ける)ので、**書き忘れを既定で吸わせない**。
  it('★★送り方を登録し忘れた絵が無い', () => {
    for (const n of Object.keys(ENEMY_IDLE_SHEETS)) {
      expect(ENEMY_IDLE_PLAYBACK[n], n).toBeDefined();
      expect(idleSheetPlayback(n), n).toBe(ENEMY_IDLE_PLAYBACK[n]);
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

// ★★卵体(ghost)= 髪と裾が一方向になびく絵。往復させると流れが逆走するので前方ループ。
describe('★★前方ループの待機(卵体)', () => {
  const GF = ENEMY_IDLE_SHEETS['ghost-common'];
  const GP = ENEMY_IDLE_PERIOD_MS['ghost-common'];

  it('送り方はループで登録されている', () => expect(idleSheetPlayback('ghost-common')).toBe('loop'));

  it('★1周期でコマが0から末尾まで一方向に進む(戻らない)', () => {
    let prev = -1, wraps = 0;
    for (let t = 0; t < GP; t += 5) {
      const i = enemyIdleFrame(GF, t, 0, GP, 'loop')!;
      if (i < prev) wraps++;                  // 1周期の中では戻らない
      prev = i;
    }
    expect(wraps).toBe(0);
    expect(enemyIdleFrame(GF, 0, 0, GP, 'loop')).toBe(0);
    expect(enemyIdleFrame(GF, GP - 1, 0, GP, 'loop')).toBe(GF - 1);
  });

  it('★全コマが1度は出る / 1コマずつしか進まない(飛ばさない)', () => {
    const seen = new Set<number>();
    let prev = enemyIdleFrame(GF, 0, 0, GP, 'loop')!;
    for (let t = 0; t < GP * 2; t++) {
      const cur = enemyIdleFrame(GF, t, 0, GP, 'loop')!;
      seen.add(cur);
      const step = cur - prev;
      expect(step === 0 || step === 1 || step === -(GF - 1), `t=${t} ${prev}->${cur}`).toBe(true);
      prev = cur;
    }
    expect(seen.size).toBe(GF);
  });

  it('個体ごとに位相がずれる / コマ番号は範囲内', () => {
    expect(enemyIdleFrame(GF, 1000, 0, GP, 'loop')).not.toBe(enemyIdleFrame(GF, 1000, Math.PI, GP, 'loop'));
    for (let t = 0; t < GP * 2; t += 7) {
      const i = enemyIdleFrame(GF, t, 2.2, GP, 'loop')!;
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(GF);
    }
  });

  it('★往復の絵(花)はこの変更で1ビットも変わっていない', () => {
    const PF = ENEMY_IDLE_SHEETS['plant-common'];
    const PP = ENEMY_IDLE_PERIOD_MS['plant-common'];
    for (let t = 0; t < PP; t += 13) {
      expect(enemyIdleFrame(PF, t, 0.7, PP), `t=${t}`).toBe(enemyIdleFrame(PF, t, 0.7, PP, 'pingpong'));
    }
  });
});
