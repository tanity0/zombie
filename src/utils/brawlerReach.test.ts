// ★基本技の前進とつながる距離(research/BRAWLER.md §31・社長裁定2026-11-12・★§40-4 ⑤=決まった距離で作り直し 2026-11-27)。道の表の全部のつなぎを回して「雑魚に届く(余裕8px以上)」を固める。
// 道の表に続きを足したら、ここで届くかが試される(押しの表に無い技を道の from に足すと落ちる)。実際に回すのは store/brawlerReach.store.test.ts。
import { describe, it, expect } from 'vitest';
import { brawlerRouteAllows, BRAWLER_LUNGE_PX, BRAWLER_STAGES_BASE, BRAWLER_STANDOFF_PX, BRAWLER_PLAYER_KICK_LUNGE_PX, type BrawlerRouteNode } from './brawler';
import { brawlerChainReaches, brawlerReachOf, BRAWLER_PUSH_ZOMBIE_PX, BRAWLER_CHAIN_MARGIN_PX } from './brawlerReach';

const MELEE_RADIUS = 74; // store/gameStore の MELEE_RADIUS(store を読まない純関数のテストなので値で持つ・下で一致を見ない=store のテストが同じ値で回す)
const NODES: readonly BrawlerRouteNode[] = ['s1', 's2', 's3', 's4', 's5', 'kick1', 'kick2', 'kick3', 'heel', 'stomp', 'kiko', 'guard'];
/** 道の表の続き(待機からの出だしと構えは除く=構えは当てる技ではない)。 */
const LINKS = NODES.flatMap(a => NODES.filter(b => b !== 'guard' && brawlerRouteAllows(a, b)).map(b => [a, b] as const));
/**
 * ★届かないと分かっているつなぎ(社長へ戻した物)。大踏み潰し→飛び蹴り1発目を、止めが明けた瞬間に出すと、蹴りの行き先は押しが始まる前に決まり、
 * 大踏み潰しの吹き飛ばし(雑魚 約63px)で蹴りの届く範囲の外へ出る(§31 の前から同じ=飛び蹴りの飛び方は今のまま)。
 * 押しを縮めると大踏み潰しが変わる(今回は変えない決まり)ので、ここに名前を残して落とさない。直したら消す(下のテストが「まだ届かない」を確かめる)。
 */
const KNOWN_SHORT = new Set(['stomp→kick1']);

describe('§31-2 道の表の全部のつなぎ A→B は、雑魚に届く(余裕8px以上)', () => {
  it('道の表の続きは、押しの表に載っている技からだけ出る', () => {
    for (const [a] of LINKS) expect(BRAWLER_PUSH_ZOMBIE_PX[a], `${a} の押し`).toBeTypeOf('number');
  });
  for (const [a, b] of LINKS) {
    const key = `${a}→${b}`;
    it(`${key}`, () => {
      const r = brawlerChainReaches(a, b, { meleeRadius: MELEE_RADIUS });
      if (KNOWN_SHORT.has(key)) expect(r.ok, `${key} は届かないと分かっている(直ったら KNOWN_SHORT から消す)`).toBe(false);
      else expect(r.marginPx, `${key} の余裕`).toBeGreaterThanOrEqual(BRAWLER_CHAIN_MARGIN_PX);
    });
  }
  it('つなぎの数(道の表を変えたら、ここも見直す)', () => {
    expect(LINKS.length).toBe(26);
  });
});

describe('§31-2 踏み込みは上限以下・前の技の押しを詰め切る値以上(押しの距離は今のまま)', () => {
  // つながりだけなら段の踏み込みは0でも届く(段の狙いは届く範囲の内の相手だけ)。下限=前の技の押しを詰め切る値(A が相手の手前で当たる前提を、続けて出しても崩さない)。
  const need = (b: BrawlerRouteNode): number =>
    Math.ceil(Math.max(...NODES.filter(a => brawlerRouteAllows(a, b)).map(a => BRAWLER_PUSH_ZOMBIE_PX[a] ?? 0)));
  // 押しの表は実機の順で測った値(2026-11-14・utils/brawlerReach の BRAWLER_PUSH_ZOMBIE_PX)。
  it('2〜4段目の踏み込みは前の段の押しを詰め切る値以上(弱≥4・強≥4・4段目≥41)', () => {
    expect([need('s2'), need('s3'), need('s4')]).toEqual([4, 4, 41]);
    for (const b of ['s2', 's3', 's4'] as const) expect(BRAWLER_LUNGE_PX[b], b).toBeGreaterThanOrEqual(need(b));
  });
  it('1段目は2段目と同じ(弱は1つの値)', () => {
    expect(BRAWLER_LUNGE_PX.s1).toBe(BRAWLER_LUNGE_PX.s2);
  });
  it('上限の目安の内(弱45・強60・4段目70)で、今(弱・強60)より短い', () => {
    expect(BRAWLER_LUNGE_PX.s1).toBeLessThanOrEqual(45);
    expect(BRAWLER_LUNGE_PX.s2).toBeLessThanOrEqual(45);
    expect(BRAWLER_LUNGE_PX.s3).toBeLessThan(60);
    expect(BRAWLER_LUNGE_PX.s4).toBeLessThanOrEqual(70);
  });
  it('段の表の踏み込みは BRAWLER_LUNGE_PX を読む(5段目の突き抜けは対象外=0)', () => {
    expect(BRAWLER_STAGES_BASE.map(s => s.lungePx)).toEqual([BRAWLER_LUNGE_PX.s1, BRAWLER_LUNGE_PX.s2, BRAWLER_LUNGE_PX.s3, BRAWLER_LUNGE_PX.s4, 0]);
  });
  it('敵側(拳鬼)の詰め dashPx は今のまま(60/60/60/50/0)', () => {
    expect(BRAWLER_STAGES_BASE.map(s => s.dashPx)).toEqual([60, 60, 60, 50, 0]);
  });
});

describe('§31-1 届かない相手には空振りする(外れやすさはそのまま)', () => {
  it('下がり切った所が、踏み込み+届く範囲より遠ければ届かない', () => {
    // 3段目の押しが大きかったら(仮に 120px 下がる相手)、4段目は届かない。
    const far = brawlerChainReaches('s3', 's4', { meleeRadius: MELEE_RADIUS, fromPx: BRAWLER_STANDOFF_PX + 120 - (BRAWLER_PUSH_ZOMBIE_PX.s3 ?? 0) });
    expect(far.ok).toBe(false);
    // 狙える範囲(踏み込みの上限+届く範囲=§40-4 ⑤)の外から始めた1段目→2段目も届かない。
    expect(brawlerChainReaches('s1', 's2', { meleeRadius: MELEE_RADIUS, fromPx: BRAWLER_LUNGE_PX.s2 + MELEE_RADIUS + 10 }).ok).toBe(false);
    // 狙える範囲の内なら、踏み込みの上限だけ詰めて当たる(旧: 届く範囲の外=74 の外は進まずに空振りしていた)。
    expect(brawlerChainReaches('s1', 's2', { meleeRadius: MELEE_RADIUS, fromPx: MELEE_RADIUS + 10 }).ok).toBe(true);
  });
});

describe('§40-4 ⑤ 決まった距離: 動く距離は技ごとの上限・狙える範囲=上限+届く範囲(社長「移動距離は射程範囲を守る」)', () => {
  it('飛び蹴りの動く距離の上限: 1発目120・2発目90・3発目60・踵落とし/蹴り上げ30(§40-2・つながる値で 0→30)', () => {
    expect(BRAWLER_PLAYER_KICK_LUNGE_PX).toEqual({ kick1: 120, kick2: 90, kick3: 60, kickup: 30, heel: 30 });
  });
  it('狙える範囲=上限+届く範囲(1〜3段: 22/22/32+74・飛び蹴り1発目 120+74=194=旧の 220 から縮む)', () => {
    expect(['s1', 's2', 's3'].map(n => brawlerReachOf(n as BrawlerRouteNode, MELEE_RADIUS).targetPx)).toEqual([96, 96, 106]);
    expect(['kick1', 'kick2', 'kick3', 'heel', 'kickup'].map(n => brawlerReachOf(n as BrawlerRouteNode, MELEE_RADIUS).targetPx)).toEqual([194, 164, 134, 104, 104]);
    for (const n of ['kick1', 'kick2', 'kick3', 'heel', 'kickup'] as const) {
      const r = brawlerReachOf(n, MELEE_RADIUS);
      expect(r.lungePx, n).toBe(BRAWLER_PLAYER_KICK_LUNGE_PX[n]);
      expect(r.hitPx, n).toBe(MELEE_RADIUS);
    }
  });
  it('遠い相手へも上限より先へは進まない(手前で止まる): 狙える範囲の端から出した蹴りは、上限だけ進んで届く範囲の縁で当たる', () => {
    for (const n of ['kick1', 'kick2', 'kick3'] as const) {
      const r = brawlerReachOf(n, MELEE_RADIUS);
      // 縁までの距離 d の相手(押し0の続き)に対して、当たる時の距離=d−上限
      const edge = r.targetPx;
      const fromPx = edge - (BRAWLER_PUSH_ZOMBIE_PX.s1 ?? 0);
      const reach = brawlerChainReaches('s1', n === 'kick1' ? 'kick1' : n, { meleeRadius: MELEE_RADIUS, fromPx });
      expect(reach.hitAtPx, n).toBeCloseTo(edge - r.lungePx, 6);
    }
  });
});
