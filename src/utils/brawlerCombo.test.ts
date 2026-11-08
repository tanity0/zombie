// ★格闘の敵側の流れ(research/BRAWLER.md §11): 食らいの固まり・減衰・同じ技の罰・反撃の数と発動・赤い予告の時刻。
import { describe, it, expect } from 'vitest';
import {
  brawlerComboOnHit, brawlerHoldDecay, brawlerComboClock, brawlerRevengeHitsFor, brawlerRevengeShouldStart,
  brawlerRevengeStartPatch, brawlerRevengeDue, brawlerRevengeEndPatch, brawlerRevengeTelegraph, brawlerRevengeDamage,
  brawlerStageMoveKey, brawlerKickMoveKey,
  BRAWLER_HOLD_BASE_MS, BRAWLER_COMBO_GAP_MS, BRAWLER_SAME_MOVE_PENALTY_MS, BRAWLER_COMBO_FLOOR,
  BRAWLER_REVENGE_WINDUP_MS, BRAWLER_REVENGE_HITS_MOB, BRAWLER_REVENGE_HITS_STRONG, BRAWLER_REVENGE_NO_HOLD_MS,
  type BrawlerComboFields, type BrawlerMoveKey,
} from './brawlerCombo';
import { meteorPhase } from './telegraphStyle';

/** 当たりを順に入れて、各当たりの固まりの長さを返す。 */
const run = (type: BrawlerComboFields['type'], hits: { move: BrawlerMoveKey; at: number }[], countRevenge = true) => {
  let e: BrawlerComboFields = { type };
  const holds: number[] = [];
  for (const h of hits) {
    const r = brawlerComboOnHit(e, h.move, h.at, countRevenge);
    e = { ...e, ...r.patch };
    holds.push(r.holdMs);
  }
  return { e, holds };
};

describe('食らいの固まりの長さ(§11-1)', () => {
  it('基本の長さ: 1・2段目300 / 3段目450 / 4段目450 / 飛び蹴り1・2発目350 / 気功300 / 9連撃300。吹き飛ばす技は0', () => {
    expect(BRAWLER_HOLD_BASE_MS).toMatchObject({ s1: 300, s2: 300, s3: 450, s4: 450, kick1: 350, kick2: 350, kiko: 300, secret: 300 });
    for (const k of ['s5', 'kick3', 'stomp', 'secret-land'] as const) expect(BRAWLER_HOLD_BASE_MS[k]).toBe(0);
    expect(brawlerComboOnHit({ type: 'zombie' }, 's1', 1000).holdMs).toBe(300);
    expect(brawlerComboOnHit({ type: 'zombie' }, 's3', 1000).holdMs).toBe(450);
    expect(brawlerComboOnHit({ type: 'zombie' }, 'kick1', 1000).holdMs).toBe(350);
    expect(brawlerComboOnHit({ type: 'zombie' }, 's5', 1000).holdMs).toBe(0);
  });
  it('名札: 段 1..5 → s1..s5、飛び蹴り 1..3 → kick1..kick3', () => {
    expect([1, 2, 3, 4, 5].map(brawlerStageMoveKey)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect([1, 2, 3].map(brawlerKickMoveKey)).toEqual(['kick1', 'kick2', 'kick3']);
  });
  it('ボス級は固めない・数えない(区分どおり)', () => {
    const r = brawlerComboOnHit({ type: 'thor' }, 's1', 1000);
    expect(r.holdMs).toBe(0);
    expect(r.patch).toEqual({});
  });
});

describe('減衰(§11-2)', () => {
  it('固まり = 基本 × max(0.4, 1 − 時計/3000)', () => {
    expect(brawlerHoldDecay(0)).toBe(1);
    expect(brawlerHoldDecay(1500)).toBeCloseTo(0.5);
    expect(brawlerHoldDecay(1800)).toBeCloseTo(0.4);
    expect(brawlerHoldDecay(5000)).toBe(BRAWLER_COMBO_FLOOR);
  });
  it('当たり続けると短くなり、600ms 当たらなければ時計は0へ戻る', () => {
    const { e, holds } = run('zombie', [
      { move: 's1', at: 0 }, { move: 's2', at: 250 }, { move: 's3', at: 550 }, { move: 's4', at: 1100 },
    ]);
    expect(holds[0]).toBe(300);
    expect(holds[1]).toBe(Math.round(300 * (1 - 250 / 3000)));
    expect(holds[2]).toBe(Math.round(450 * (1 - 550 / 3000)));
    expect(holds[3]).toBe(Math.round(450 * (1 - 1100 / 3000)));
    expect(brawlerComboClock(e, 1100)).toBe(1100);
    // 途切れた(600ms 超)=始め直し
    const after = brawlerComboOnHit(e, 's1', 1100 + BRAWLER_COMBO_GAP_MS + 1);
    expect(after.holdMs).toBe(300);
    expect(after.patch.brComboHits).toBe(1);
  });
  it('5段を出し切る頃には固まりが4割近くまで落ちる(=次の流れは止め切れない)', () => {
    const { holds } = run('zombie', [
      { move: 's1', at: 0 }, { move: 's2', at: 245 }, { move: 's3', at: 550 }, { move: 's4', at: 1110 }, { move: 's5', at: 1630 },
      { move: 'kick1', at: 1900 }, { move: 'kick2', at: 2250 },
    ]);
    expect(holds[4]).toBe(0); // 5段目は吹き飛ばす
    expect(holds[5]).toBeLessThanOrEqual(Math.round(350 * 0.4) + 1);
    expect(holds[6]).toBe(Math.round(350 * BRAWLER_COMBO_FLOOR));
  });
});

describe('同じ技の罰(§11-2)', () => {
  it('同じ流れで同じ段・同じ技を当て直すと時計に +400ms(5段の順は罰を受けない)', () => {
    const order = run('zombie', [{ move: 's1', at: 0 }, { move: 's2', at: 300 }]);
    const same = run('zombie', [{ move: 's1', at: 0 }, { move: 's1', at: 300 }]);
    expect(order.e.brComboPenalty).toBe(0);
    expect(same.e.brComboPenalty).toBe(BRAWLER_SAME_MOVE_PENALTY_MS);
    expect(order.holds[1]).toBe(Math.round(300 * (1 - 300 / 3000)));
    expect(same.holds[1]).toBe(Math.round(300 * (1 - 700 / 3000)));
    expect(same.holds[1]).toBeLessThan(order.holds[1]);
  });
  it('1段目の連打は5段の順より早く抜けられる(4発目の固まりで比べる)', () => {
    const spam = run('zombie', [0, 300, 600, 900].map(at => ({ move: 's1' as const, at })));
    const flow = run('zombie', (['s1', 's2', 's1', 's2'] as const).map((move, i) => ({ move, at: i * 300 })));
    const chain = run('zombie', (['s1', 's2', 's3', 's4'] as const).map((move, i) => ({ move, at: i * 300 })));
    expect(spam.e.brComboPenalty).toBe(3 * BRAWLER_SAME_MOVE_PENALTY_MS);
    expect(spam.holds[3] / 300).toBeLessThan(flow.holds[3] / 300);
    expect(chain.e.brComboPenalty).toBe(0);
    expect(spam.holds[3] / 300).toBeLessThan(chain.holds[3] / 450);
  });
  it('飛び蹴りの3連は1発ごとに名札が違う=罰を受けない', () => {
    const k = run('zombie', [{ move: 'kick1', at: 0 }, { move: 'kick2', at: 300 }, { move: 'kick3', at: 600 }]);
    expect(k.e.brComboPenalty).toBe(0);
  });
});

describe('反撃(§11-3)', () => {
  it('反撃の数: 雑魚7・強個体5・ボス級は無し', () => {
    expect(brawlerRevengeHitsFor('zombie')).toBe(BRAWLER_REVENGE_HITS_MOB);
    expect(BRAWLER_REVENGE_HITS_MOB).toBe(7);
    expect(brawlerRevengeHitsFor('pumpkin')).toBe(BRAWLER_REVENGE_HITS_STRONG);
    expect(BRAWLER_REVENGE_HITS_STRONG).toBe(5);
    expect(brawlerRevengeHitsFor('thor')).toBe(Infinity);
  });
  it('雑魚は7発目で予約・6発では予約しない。強個体は5発目', () => {
    const six = run('zombie', Array.from({ length: 6 }, (_, i) => ({ move: brawlerStageMoveKey((i % 4) + 1), at: i * 200 })));
    expect(six.e.brRevengePending).toBe(false);
    const seven = run('zombie', Array.from({ length: 7 }, (_, i) => ({ move: brawlerStageMoveKey((i % 4) + 1), at: i * 200 })));
    expect(seven.e.brRevengePending).toBe(true);
    const strong = run('pumpkin', Array.from({ length: 5 }, (_, i) => ({ move: brawlerStageMoveKey((i % 4) + 1), at: i * 200 })));
    expect(strong.e.brRevengePending).toBe(true);
  });
  it('数えない当たり(秘奥義)は反撃の数に足さない', () => {
    const r = run('zombie', Array.from({ length: 9 }, (_, i) => ({ move: 'secret' as const, at: i * 170 })), false);
    expect(r.e.brComboHits).toBe(0);
    expect(r.e.brRevengePending).toBe(false);
  });
  it('流れが途切れたら反撃の数も0から', () => {
    const a = run('zombie', Array.from({ length: 6 }, (_, i) => ({ move: brawlerStageMoveKey((i % 4) + 1), at: i * 200 })));
    const b = brawlerComboOnHit(a.e, 's1', 1000 + BRAWLER_COMBO_GAP_MS + 200);
    expect(b.patch.brComboHits).toBe(1);
    expect(b.patch.brRevengePending).toBe(false);
  });
  it('発動: 予約済み・技を出していない時だけ。溜め350ms → 当たる。当たった後1.2秒は固まらない', () => {
    expect(brawlerRevengeShouldStart({ type: 'zombie', brRevengePending: true }, false)).toBe(true);
    expect(brawlerRevengeShouldStart({ type: 'zombie', brRevengePending: true }, true)).toBe(false);
    expect(brawlerRevengeShouldStart({ type: 'zombie', brRevengePending: false }, false)).toBe(false);
    expect(brawlerRevengeShouldStart({ type: 'thor', brRevengePending: true }, false)).toBe(false);
    const st = brawlerRevengeStartPatch(5000);
    expect(st).toMatchObject({ aiPhase: 'br-revenge', aiStartedAt: 5000, aiPhaseUntil: 5000 + BRAWLER_REVENGE_WINDUP_MS, brRevengePending: false });
    expect(brawlerRevengeDue(st, 5349)).toBe(false);
    expect(brawlerRevengeDue(st, 5350)).toBe(true);
    const end = brawlerRevengeEndPatch(9000);
    expect(end.brNoHoldUntil).toBe(9000 + BRAWLER_REVENGE_NO_HOLD_MS);
    expect(end.brComboHits).toBe(0);
    expect(end.aiPhase).toBeUndefined();
    // 振り払いの後は固まらない(数と時計は始め直し)
    const after = brawlerComboOnHit({ type: 'zombie', ...end }, 's1', 9500);
    expect(after.holdMs).toBe(0);
    expect(brawlerComboOnHit({ type: 'zombie', ...end }, 's1', 9000 + BRAWLER_REVENGE_NO_HOLD_MS + 1).holdMs).toBe(300);
  });
  it('威力は接触/噛みつきの ×1.5', () => {
    expect(brawlerRevengeDamage(10)).toBe(15);
  });
});

describe('★★赤い予告の4つの掟(振り払い)', () => {
  const start = 10_000, hit = start + BRAWLER_REVENGE_WINDUP_MS;
  it('②出る時刻 = 溜めの開始(その瞬間から出ていて、1ms前は出ていない)', () => {
    expect(brawlerRevengeTelegraph(start, hit, start).visible).toBe(true);
    expect(brawlerRevengeTelegraph(start, hit, start - 1).visible).toBe(false);
    expect(brawlerRevengeTelegraph(start, hit, start).prog).toBe(0);
  });
  it('③消え切る時刻 = 当たる時刻(er が1になるのは当たる瞬間ちょうど・1ms前はまだ残っている)', () => {
    const atHit = brawlerRevengeTelegraph(start, hit, hit);
    expect(atHit.er).toBe(1);
    expect(atHit.visible).toBe(false);
    const before = brawlerRevengeTelegraph(start, hit, hit - 1);
    expect(before.visible).toBe(true);
    expect(before.er).toBeLessThan(1);
    // 当たる時刻 = 状態機械が判定を積む時刻(aiPhaseUntil)
    const st = brawlerRevengeStartPatch(start);
    expect(st.aiPhaseUntil).toBe(hit);
    expect(brawlerRevengeDue(st, hit)).toBe(true);
    expect(brawlerRevengeDue(st, hit - 1)).toBe(false);
  });
  it('①流星: 位相は meteorPhase(描いてから外→内へ流れて消える)', () => {
    for (const t of [0, 0.2, 0.45, 0.6, 0.9, 1]) {
      const g = brawlerRevengeTelegraph(start, hit, start + t * BRAWLER_REVENGE_WINDUP_MS);
      const m = meteorPhase(t, 0.45);
      expect(g.p).toBeCloseTo(m.p);
      expect(g.er).toBeCloseTo(m.er);
    }
  });
});
