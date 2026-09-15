import { describe, it, expect, afterEach } from 'vitest';
import {
  handcannonDamageMultOnHit, resetHandcannonDecay, pruneHandcannonDecay, peekHandcannonHits,
  HANDCANNON_DECAY_STEP, HANDCANNON_DECAY_FLOOR_MULT, HANDCANNON_DECAY_INTERPRETATION,
} from './handcannonDecay';

afterEach(() => {
  resetHandcannonDecay();
});

describe('現在の既定はHANDCANNON_DECAY_INTERPRETATION="a"', () => {
  it('社長裁定#U12が出るまでの既定は(a)', () => {
    expect(HANDCANNON_DECAY_INTERPRETATION).toBe('a');
  });
});

describe('handcannonDamageMultOnHit(既定=解釈a: リロードまでの累計)', () => {
  it('1発目はフル(1.0)', () => {
    expect(handcannonDamageMultOnHit('e1')).toBeCloseTo(1.0);
  });

  it('連続命中ごとに-20%・下限40%(1/0.8/0.6/0.4/0.4/0.4)', () => {
    const mults = [1, 2, 3, 4, 5, 6].map(() => handcannonDamageMultOnHit('e1'));
    expect(mults.map(m => Number(m.toFixed(2)))).toEqual([1.00, 0.80, 0.60, 0.40, 0.40, 0.40]);
  });

  it('敵ごとに独立: 別の敵を挟んでも元の敵のカウンタは維持される(§13-1「雑魚を次々狙うほど強く」)', () => {
    handcannonDamageMultOnHit('e1'); // e1: hits=1
    handcannonDamageMultOnHit('e1'); // e1: hits=2
    const e2First = handcannonDamageMultOnHit('e2'); // e2は初手なのでフル
    expect(e2First).toBeCloseTo(1.0);
    const e1Third = handcannonDamageMultOnHit('e1'); // e1の3発目(e2を挟んでもリセットされない)
    expect(e1Third).toBeCloseTo(1 - HANDCANNON_DECAY_STEP * 2);
  });

  it('resetHandcannonDecay()で全消去(リロード完了/新ラン相当)', () => {
    handcannonDamageMultOnHit('e1');
    handcannonDamageMultOnHit('e1');
    expect(peekHandcannonHits('e1')).toBe(2);
    resetHandcannonDecay();
    expect(peekHandcannonHits('e1')).toBe(0);
    expect(handcannonDamageMultOnHit('e1')).toBeCloseTo(1.0);
  });

  it('pruneHandcannonDecayは生きている敵のIDに無いものだけを捨てる', () => {
    handcannonDamageMultOnHit('dead-1');
    handcannonDamageMultOnHit('alive-1');
    pruneHandcannonDecay(new Set(['alive-1']));
    expect(peekHandcannonHits('dead-1')).toBe(0);
    expect(peekHandcannonHits('alive-1')).toBe(1);
  });

  it('下限は40%のまま張り付く(それ以上は下がらない)', () => {
    for (let i = 0; i < 10; i++) handcannonDamageMultOnHit('boss');
    expect(handcannonDamageMultOnHit('boss')).toBeCloseTo(HANDCANNON_DECAY_FLOOR_MULT);
  });
});

describe('★未決 #U12「"連続"の解釈」— interpretation引数で(b)も明示的にテストできる', () => {
  it('解釈b: 直前の命中対象が同じ時だけ積む(別の敵に当てた時点でリセット)', () => {
    handcannonDamageMultOnHit('e1', 'b'); // e1: streak=1
    const e1Second = handcannonDamageMultOnHit('e1', 'b'); // e1: streak=2への遷移前の値
    expect(e1Second).toBeCloseTo(1 - HANDCANNON_DECAY_STEP);
    handcannonDamageMultOnHit('e2', 'b'); // 別の敵に当てた瞬間、e1のストリークは切れる
    const e1Again = handcannonDamageMultOnHit('e1', 'b'); // e1へ戻るが直前はe2だったのでフルに戻る
    expect(e1Again).toBeCloseTo(1.0);
  });
});
