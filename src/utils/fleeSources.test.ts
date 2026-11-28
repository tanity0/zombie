import { describe, expect, it } from 'vitest';
import { createFleeSources, fleeSourcesActive, fleeSourcesExceptKenki, isKenkiFleeSource, kenkiFleeActive } from './fleeSources';

const kenki = (over: Record<string, unknown> = {}) => ({
  type: 'guardian-phantom' as const, phantomUnique: 'brawler' as const, health: 500, corpseUntil: undefined as number | undefined,
  phantomUnmet: undefined as boolean | undefined, ...over,
});

describe('fleeSources: 「他の敵が逃げる」旗の合成', () => {
  it('どれか1つでも立っていれば逃げる(OR)・全部下りたら下りる', () => {
    expect(fleeSourcesActive(createFleeSources())).toBe(false);
    expect(fleeSourcesActive({ hiddenBoss: true, idol: false, kenki: false })).toBe(true);
    expect(fleeSourcesActive({ hiddenBoss: false, idol: true, kenki: false })).toBe(true);
    expect(fleeSourcesActive({ hiddenBoss: false, idol: false, kenki: true })).toBe(true);
    expect(fleeSourcesActive({ hiddenBoss: true, idol: false, kenki: true })).toBe(true);
  });

  it('裏ボスが追跡をやめても(false を書いても)孫悟空の分は消えない=上書き合戦をしない', () => {
    const s = createFleeSources();
    s.kenki = true;
    s.hiddenBoss = true;
    s.hiddenBoss = false; // 裏ボスのコントローラが毎フレーム自分の分だけ書く
    expect(fleeSourcesActive(s)).toBe(true);
    s.kenki = false;
    expect(fleeSourcesActive(s)).toBe(false);
  });

  it('孫悟空の退散判定には孫悟空自身の分を含めない(自分の旗で自分が退散しない)', () => {
    expect(fleeSourcesExceptKenki({ hiddenBoss: false, idol: false, kenki: true })).toBe(false);
    expect(fleeSourcesExceptKenki({ hiddenBoss: true, idol: false, kenki: true })).toBe(true);
    expect(fleeSourcesExceptKenki({ hiddenBoss: false, idol: true, kenki: false })).toBe(true);
  });
});

describe('isKenkiFleeSource: 孫悟空が「居る」か', () => {
  it('出会っている生きた孫悟空は立てる(強制出現=phantomUnmet なしも同じ)', () => {
    expect(isKenkiFleeSource(kenki())).toBe(true);
    expect(isKenkiFleeSource(kenki({ phantomUnmet: false }))).toBe(true);
  });
  it('まだ会っていない(遠くを歩いている)間は立てない', () => {
    expect(isKenkiFleeSource(kenki({ phantomUnmet: true }))).toBe(false);
  });
  it('倒したら(HP0・死体)下りる', () => {
    expect(isKenkiFleeSource(kenki({ health: 0 }))).toBe(false);
    expect(isKenkiFleeSource(kenki({ corpseUntil: 12345 }))).toBe(false);
    expect(kenkiFleeActive([kenki({ health: 0, corpseUntil: 1 })])).toBe(false);
    expect(kenkiFleeActive([])).toBe(false);
  });
  it('孫悟空以外の幻影・他の敵では立たない', () => {
    expect(isKenkiFleeSource(kenki({ phantomUnique: undefined }))).toBe(false);
    expect(isKenkiFleeSource(kenki({ type: 'zombie' }))).toBe(false);
    expect(kenkiFleeActive([kenki({ type: 'zombie' }), kenki()])).toBe(true);
  });
});
