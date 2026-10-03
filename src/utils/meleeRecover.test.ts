import { describe, it, expect } from 'vitest';
import { meleeRecoverSpeedMult, MELEE_RECOVER_MS, MELEE_RECOVER_SPEED_MULT } from './meleeRecover';
import { COUNTER_WINDOW, MELEE_LUNGE_MS } from '../store/gameStore';

const CYCLE = COUNTER_WINDOW;
const at = (since: number) => meleeRecoverSpeedMult(1000, 1000 + since, CYCLE);

describe('meleeRecoverSpeedMult — 硬直は「振り終わってから」', () => {
  it('★踏み込み(回避)の区間は素の足のまま', () => {
    // 社長の前提「踏み込み斬りは回避としての使い方ができる」。ここを遅くしたら意味が無い。
    expect(at(0)).toBe(1);
    expect(at(MELEE_LUNGE_MS)).toBe(1);
  });

  it('振り1サイクル(前隙+刃)の間も素の足', () => {
    expect(at(CYCLE - 1)).toBe(1);
  });

  it('サイクルが終わった瞬間から硬直が開く', () => {
    expect(at(CYCLE)).toBe(MELEE_RECOVER_SPEED_MULT);
    expect(at(CYCLE + MELEE_RECOVER_MS - 1)).toBe(MELEE_RECOVER_SPEED_MULT);
  });

  it('硬直が明けたら戻る', () => {
    expect(at(CYCLE + MELEE_RECOVER_MS)).toBe(1);
  });

  it('★次に振れるようになる前に硬直は明けている(振れるのに動けない、を作らない)', () => {
    expect(CYCLE + MELEE_RECOVER_MS).toBeLessThan(CYCLE + 420); // COUNTER_COOLDOWN=420
  });

  it('まだ一度も振っていない/壊れた値でも1', () => {
    expect(meleeRecoverSpeedMult(0, 5000, CYCLE)).toBe(1);
    expect(meleeRecoverSpeedMult(undefined, 5000, CYCLE)).toBe(1);
  });
});
