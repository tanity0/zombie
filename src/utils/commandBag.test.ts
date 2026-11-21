// BOT_AND_GHOST.md §2.18-7(GHOST-CMD-1): 境界ガード付き袋式サイコロの検証。
// 枚数導出(決定的)・引き切りで割合=記録どおり・毎引きガード(混合袋は非tank残がある限り3連被弾しない)・
// tank専用袋はガード不発(仕様=苦手は食らい続ける)・n=1確定行動・詰め直し・ラン境界リセット。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  deriveBagCounts, drawFromCommandBag, resetGhostCommandBags,
  GHOST_BAG_MAX_HIT_STREAK, type CommandBagCard,
} from './commandBag';
import type { MoveReactionStat } from './moveReaction';

beforeEach(() => resetGhostCommandBags());

// 決定的な乱数列(cyclic)。テストの引きを固定する。
const seqRand = (values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('deriveBagCounts: 枚数導出(counter→tank→dodgeの順で決定的・§2.18発注仕様の丸め規則)', () => {
  it('counter=round(n×counterRate) / tank=min(round(n×hitRate), n−counter) / dodge=残り', () => {
    // n=5, 0.3/0.4: counter=round(1.5)=2, tank=min(round(2.0)=2, 3)=2, dodge=1
    expect(deriveBagCounts({ n: 5, counterRate: 0.3, hitRate: 0.4 })).toEqual({ counter: 2, tank: 2, dodge: 1 });
    // n=4, 0.5/0.5: counter=2, tank=min(2,2)=2, dodge=0
    expect(deriveBagCounts({ n: 4, counterRate: 0.5, hitRate: 0.5 })).toEqual({ counter: 2, tank: 2, dodge: 0 });
  });

  it('rateの合計が1を超える記録はtank側がclampされる(counterが先に確定=この順が仕様)', () => {
    // n=3, 0.5/1.0: counter=round(1.5)=2, tank=min(3, 3−2)=1, dodge=0(clamp≥0)
    expect(deriveBagCounts({ n: 3, counterRate: 0.5, hitRate: 1 })).toEqual({ counter: 2, tank: 1, dodge: 0 });
  });

  it('合計は常にn(袋の中身=記録の暴露回数ぶん)', () => {
    for (const stat of [
      { n: 1, counterRate: 0, hitRate: 0 },
      { n: 7, counterRate: 0.42, hitRate: 0.13 },
      { n: 9, counterRate: 1, hitRate: 1 },
    ] satisfies MoveReactionStat[]) {
      const c = deriveBagCounts(stat);
      expect(c.counter + c.dodge + c.tank).toBe(stat.n);
      expect(c.counter).toBeGreaterThanOrEqual(0);
      expect(c.dodge).toBeGreaterThanOrEqual(0);
      expect(c.tank).toBeGreaterThanOrEqual(0);
    }
  });

  it('異常値はclamp(負のrate→0・rate>1→1・非有限→0)', () => {
    expect(deriveBagCounts({ n: 4, counterRate: -0.5, hitRate: 2 })).toEqual({ counter: 0, tank: 4, dodge: 0 });
    expect(deriveBagCounts({ n: 4, counterRate: Number.NaN, hitRate: Number.NaN })).toEqual({ counter: 0, tank: 0, dodge: 4 });
    expect(deriveBagCounts({ n: Number.NaN, counterRate: 1, hitRate: 0 })).toEqual({ counter: 0, tank: 0, dodge: 0 });
  });
});

const STAT_MIXED: MoveReactionStat = { n: 5, counterRate: 0.3, hitRate: 0.4 }; // 袋=[counter2, dodge1, tank2]

const tallyDraws = (moveKey: string, stat: MoveReactionStat, rand: () => number, count: number): Record<CommandBagCard, number> => {
  const tally: Record<CommandBagCard, number> = { counter: 0, dodge: 0, tank: 0 };
  for (let i = 0; i < count; i++) tally[drawFromCommandBag(moveKey, stat, rand)] += 1;
  return tally;
};

describe('drawFromCommandBag: 引き切りで割合=記録どおり(袋の中身は不変=並べ替えのみ)', () => {
  it('n回引き切ると枚数どおりの内訳になる(乱数によらない)', () => {
    const rand = seqRand([0.99, 0.01, 0.62, 0.34, 0.77]);
    expect(tallyDraws('thor-issen', STAT_MIXED, rand, 5)).toEqual({ counter: 2, dodge: 1, tank: 2 });
  });

  it('ガードが発動しても中身は不変=引き切れば割合は記録どおり', () => {
    // 常に最大値側を引く=ガード無しならtankへ寄る乱数でも、引き切りの内訳は同じ。
    expect(tallyDraws('thor-issen', STAT_MIXED, () => 0.999, 5)).toEqual({ counter: 2, dodge: 1, tank: 2 });
  });

  it('詰め直し(空→再充填)しても割合は保たれる(2周=枚数2倍)', () => {
    const rand = seqRand([0.999, 0.5, 0.001, 0.7, 0.25, 0.9, 0.1]);
    expect(tallyDraws('thor-issen', STAT_MIXED, rand, 10)).toEqual({ counter: 4, dodge: 2, tank: 4 });
  });

  it('乱数は毎引きちょうど1回消費する(ガード発動時も1回=乱数列を汚さない)', () => {
    let calls = 0;
    const rand = () => { calls += 1; return 0.999; };
    for (let i = 0; i < 7; i++) drawFromCommandBag('thor-issen', STAT_MIXED, rand);
    expect(calls).toBe(7);
  });
});

describe('毎引きガード(§2.18-7): 連続tankがGHOST_BAG_MAX_HIT_STREAKで止まる', () => {
  it('GHOST_BAG_MAX_HIT_STREAK=2(export定数)', () => {
    expect(GHOST_BAG_MAX_HIT_STREAK).toBe(2);
  });

  it('混合袋: 非tank札が残っている限り3連被弾しない(詰め直しを跨いでも)', () => {
    // tank多数の偏袋(n=6: counter1, tank4, dodge1)+常にtank側へ寄る乱数=ガード無しなら3連確実。
    const stat: MoveReactionStat = { n: 6, counterRate: 1 / 6, hitRate: 0.7 };
    expect(deriveBagCounts(stat)).toEqual({ counter: 1, tank: 4, dodge: 1 });
    const cards: CommandBagCard[] = [];
    for (let i = 0; i < 60; i++) cards.push(drawFromCommandBag('g-stomp', stat, () => 0.999));
    let streak = 0;
    for (const c of cards) {
      streak = c === 'tank' ? streak + 1 : 0;
      expect(streak).toBeLessThanOrEqual(GHOST_BAG_MAX_HIT_STREAK);
    }
    // 引き切りの割合そのものは記録どおり(60引き=10周)。
    expect(cards.filter(c => c === 'tank').length).toBe(40);
  });

  it('袋内で非tank札が尽きた後はガード不発=tankが続く(中身を増やして守りはしない)', () => {
    // [食食食避]型の偏袋(n=4: tank3, dodge1)。t,t→ガードでd→残りはtankのみ=3連目以降のtankは出る。
    const stat: MoveReactionStat = { n: 4, counterRate: 0, hitRate: 0.75 };
    expect(deriveBagCounts(stat)).toEqual({ counter: 0, tank: 3, dodge: 1 });
    const cards: CommandBagCard[] = [];
    for (let i = 0; i < 4; i++) cards.push(drawFromCommandBag('g-sweep', stat, () => 0.999));
    expect(cards).toEqual(['tank', 'tank', 'dodge', 'tank']);
  });

  it('tank専用袋(全部「食」)はガード不発=3連以上も出る(仕様=苦手技は食らい続ける)', () => {
    const stat: MoveReactionStat = { n: 5, counterRate: 0, hitRate: 1 };
    const cards: CommandBagCard[] = [];
    for (let i = 0; i < 12; i++) cards.push(drawFromCommandBag('thor-tsuki', stat, () => 0.5));
    expect(cards.every(c => c === 'tank')).toBe(true); // 詰め直しを跨いで12連=ガードは一度も介入しない
  });

  it('ガードの引きは非tank札から一様(counter札が残っていればcounterも出る)', () => {
    // n=6: counter1, tank4, dodge1。t,t→ガード引きでr=0(非tank2枚の先頭=counter)。
    const stat: MoveReactionStat = { n: 6, counterRate: 1 / 6, hitRate: 0.7 };
    const rand = seqRand([0.999, 0.999, 0]);
    const cards = [0, 1, 2].map(() => drawFromCommandBag('g-jump', stat, rand));
    expect(cards).toEqual(['tank', 'tank', 'counter']);
  });

  it('連続tank回数はmoveKeyごと(別の技の袋を汚さない)', () => {
    const tankStat: MoveReactionStat = { n: 5, counterRate: 0, hitRate: 1 };
    drawFromCommandBag('thor-tsuki', tankStat, () => 0.5); // tank
    drawFromCommandBag('thor-tsuki', tankStat, () => 0.5); // tank(streak=2)
    // 別キーの混合袋は初引き=ガード無し。0.999なら普通にtankが引ける。
    expect(drawFromCommandBag('thor-issen', STAT_MIXED, () => 0.999)).toBe('tank');
  });
});

describe('n=1は確定行動(§2.18裁定「仕様として許容」)', () => {
  it('1枚袋は乱数によらず常に同じ決定(詰め直しでも同じ)', () => {
    const stat: MoveReactionStat = { n: 1, counterRate: 1, hitRate: 0 };
    for (const r of [0, 0.33, 0.66, 0.999]) {
      expect(drawFromCommandBag('g-dash', stat, () => r)).toBe('counter');
    }
    const tankStat: MoveReactionStat = { n: 1, counterRate: 0, hitRate: 1 };
    for (const r of [0, 0.5, 0.999]) {
      expect(drawFromCommandBag('g-bolt', tankStat, () => r)).toBe('tank');
    }
  });
});

describe('resetGhostCommandBags: ラン境界リセット(袋の残枚数+連続tank回数を持ち越さない)', () => {
  it('リセット後は新品の袋から引き直す(引きかけの残枚数を捨てる)', () => {
    // dodge2枚の袋からr=0で1枚引く→残1枚。リセットせず続けると2枚目もdodge…では区別できないので
    // counter1+dodge1の袋で確認: r=0で先頭(counter)を引くと残りはdodgeのみ。リセットすれば再びcounter。
    const stat: MoveReactionStat = { n: 2, counterRate: 0.5, hitRate: 0 };
    expect(drawFromCommandBag('g-slam', stat, () => 0)).toBe('counter');
    expect(drawFromCommandBag('g-slam', stat, () => 0)).toBe('dodge'); // counterは引き切った
    resetGhostCommandBags();
    expect(drawFromCommandBag('g-slam', stat, () => 0)).toBe('counter'); // 新品の袋
  });

  it('リセット後は連続tank回数も0(ガードが誤発動しない)', () => {
    const stat: MoveReactionStat = { n: 6, counterRate: 1 / 6, hitRate: 0.7 }; // counter1, tank4, dodge1
    expect(drawFromCommandBag('g-bite', stat, () => 0.999)).toBe('tank');
    expect(drawFromCommandBag('g-bite', stat, () => 0.999)).toBe('tank'); // streak=2
    resetGhostCommandBags();
    // リセット無しならガードで非tankへ迂回するはずの引きが、リセット後は普通にtankを引ける。
    expect(drawFromCommandBag('g-bite', stat, () => 0.999)).toBe('tank');
  });
});
