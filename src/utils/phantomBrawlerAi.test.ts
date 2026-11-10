// research/BRAWLER_PHANTOM.md §4-2: 格闘の幻影(拳鬼)の頭脳(純関数)。
import { describe, expect, it } from 'vitest';
import {
  createPhantomBrawlerMind, decidePhantomBrawler, notePlayerStrike, predictNextStrikeAt, secretTotalCost,
  PB_GUARD_COOLDOWN_MS, type PhantomBrawlerInput,
  PB_KICK_JUMP_MIN_PX, PB_KICK_JUMP_MAX_PX, PB_RECENT_MULT, PB_RECENT_MAX_MS, PB_APPROACH_BEAT_MIN_MS, PB_APPROACH_BEAT_MAX_MS,
  PB_HOLD_MIN_MS, PB_HOLD_MAX_MS, pbKickChance, pbKikoChance, pbRecentMult, pbRollJumpAt, phantomBrawlerHolding,
} from './phantomBrawlerAi';
import { initialBrawlerState, BRAWLER_KICK_RANGE, BRAWLER_KIKO_RANGE } from './brawler';
import { brawlerTimeKeeperDiscount } from './brawlerSkills';
import type { BrawlerState } from './brawlerTypes';

const T = 1_000_000;
const base = (o: Partial<PhantomBrawlerInput> = {}, s: Partial<BrawlerState> = {}): PhantomBrawlerInput => ({
  s: { ...initialBrawlerState(), ...s }, t: T, edgeDist: 40, reach: 74, reachReady: true, playerReach: 74, kikoClear: true,
  discount: k => brawlerTimeKeeperDiscount(k, 3), counterChance: 0, meleeBias: 0.95, bullet: null, rand: () => 0.999, ...o,
});

describe('当たりのリズムの予測', () => {
  it('2回未満は null・間隔の中央値を足す', () => {
    expect(predictNextStrikeAt([])).toBeNull();
    expect(predictNextStrikeAt([100])).toBeNull();
    expect(predictNextStrikeAt([0, 500, 1000, 1700])).toBe(1700 + 500);
  });
  it('覚えるのは6回まで', () => {
    const m = createPhantomBrawlerMind();
    for (let i = 0; i < 10; i++) notePlayerStrike(m, i * 100);
    expect(m.strikeTimes).toEqual([400, 500, 600, 700, 800, 900]);
  });
});

describe('攻め', () => {
  it('届く距離の内で反応の下限が経っていれば通常の段を押す', () => {
    expect(decidePhantomBrawler(base(), createPhantomBrawlerMind())).toEqual({ kind: 'attack' });
  });
  it('間合いに入った直後(反応の下限前)は押さない', () => {
    expect(decidePhantomBrawler(base({ reachReady: false }), createPhantomBrawlerMind())).toBeNull();
  });
  it('息継ぎの間は押さない', () => {
    const m = createPhantomBrawlerMind(); m.nextStringAt = T + 100;
    expect(decidePhantomBrawler(base(), m)).toBeNull();
  });
  it('届く距離の外: 払えなければ歩く・気功の届く距離の外は歩く', () => {
    const m = createPhantomBrawlerMind();
    expect(decidePhantomBrawler(base({ edgeDist: BRAWLER_KICK_RANGE, rand: () => 0 }, { points: 0 }), m)).toBeNull();
    expect(decidePhantomBrawler(base({ edgeDist: BRAWLER_KIKO_RANGE + 1, rand: () => 0 }, { points: 9 }), createPhantomBrawlerMind())).toBeNull();
  });
});

// 社長指示2026-11-10「一定の射程に入ったら飛び蹴りでも詰めてくる(常には使わないこと 人間味を入れること)」
describe('届く距離の外の詰め方(人間味)', () => {
  const seq = (...v: number[]) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
  const lcg = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const rate = (o: Partial<PhantomBrawlerInput>, prep: (m: ReturnType<typeof createPhantomBrawlerMind>) => void, tech: 'kick' | 'kiko', n = 2000, seed = 3) => {
    const rand = lcg(seed);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const m = createPhantomBrawlerMind(); prep(m);
      const a = decidePhantomBrawler(base({ ...o, rand }, { points: tech === 'kick' ? 1 : 2 }), m);
      if (a?.kind === 'tech' && a.tech === tech) k++;
    }
    return k / n;
  };
  it('毎回は跳ばない(拍ごとの抽選=人格の確率前後)', () => {
    const r = rate({ edgeDist: PB_KICK_JUMP_MIN_PX }, () => {}, 'kick');
    expect(r).toBeGreaterThan(0.35);
    expect(r).toBeLessThan(0.7);
    expect(pbKickChance(0.95, Infinity)).toBeCloseTo(0.35 + 0.2 * 0.95, 5);
    // 乱数が高ければ跳ばない(=必ず出すわけではない)
    expect(decidePhantomBrawler(base({ edgeDist: PB_KICK_JUMP_MIN_PX, rand: () => 0.999 }, { points: 1 }), createPhantomBrawlerMind())).toBeNull();
  });
  it('直前に出したばかり(2〜4秒以内)は跳びにくい・明ければ戻る', () => {
    const fresh = rate({ edgeDist: PB_KICK_JUMP_MIN_PX }, () => {}, 'kick');
    const recent = rate({ edgeDist: PB_KICK_JUMP_MIN_PX }, m => { m.lastKickAt = T - 500; }, 'kick');
    expect(recent).toBeLessThan(fresh * 0.4);
    expect(pbRecentMult(1000)).toBe(PB_RECENT_MULT);
    expect(pbRecentMult(3000)).toBeGreaterThan(PB_RECENT_MULT);
    expect(pbRecentMult(3000)).toBeLessThan(1);
    expect(pbRecentMult(PB_RECENT_MAX_MS)).toBe(1);
  });
  it('跳ぶ距離は試みごとにゆらぐ(140〜220px)', () => {
    // 拍の乱数 → 跳ぶ距離 → 跳ぶ抽選、の順。縁から200px: 跳ぶ距離が150なら跳ばず、210なら跳ぶ。
    expect(decidePhantomBrawler(base({ edgeDist: 200, kikoClear: false, rand: seq(0, 0.125, 0, 0.999) }, { points: 1 }), createPhantomBrawlerMind())).toBeNull();
    expect(decidePhantomBrawler(base({ edgeDist: 200, rand: seq(0, 0.875, 0) }, { points: 1 }), createPhantomBrawlerMind())).toEqual({ kind: 'tech', tech: 'kick' });
    const rand = lcg(11);
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const v = pbRollJumpAt(rand);
      expect(v).toBeGreaterThanOrEqual(PB_KICK_JUMP_MIN_PX);
      expect(v).toBeLessThanOrEqual(PB_KICK_JUMP_MAX_PX);
      seen.add(Math.round(v));
    }
    expect(seen.size).toBeGreaterThan(10);
    // 跳んだら次の試みで引き直す
    const m = createPhantomBrawlerMind();
    decidePhantomBrawler(base({ edgeDist: 100, rand: seq(0, 0.5, 0) }, { points: 1 }), m);
    expect(m.jumpAtPx).toBeNull();
  });
  it('考える拍は350〜750msおき(拍の間は何も出さず歩く)', () => {
    const m = createPhantomBrawlerMind();
    decidePhantomBrawler(base({ edgeDist: 300, rand: seq(0.5, 0.999) }, { points: 0 }), m);
    expect(m.approachBeatAt).toBe(T + (PB_APPROACH_BEAT_MIN_MS + PB_APPROACH_BEAT_MAX_MS) / 2);
    expect(decidePhantomBrawler(base({ t: T + 100, edgeDist: PB_KICK_JUMP_MIN_PX, rand: () => 0 }, { points: 1 }), m)).toBeNull();
  });
  it('間合いの端で一瞬止まって様子を見る(0.2〜0.5秒・1回の試みに1回)', () => {
    const m = createPhantomBrawlerMind();
    // 拍=0 → 跳ぶ距離220 → 縁230(跳ぶ距離の外・端の帯の内)・気功は見通しなし → 様子見の抽選0 → 尺0.5
    expect(decidePhantomBrawler(base({ edgeDist: 230, kikoClear: false, rand: seq(0, 0.999, 0, 0.5) }, { points: 1 }), m)).toBeNull();
    expect(phantomBrawlerHolding(m, T + 100)).toBe(true);
    expect(m.holdUntil).toBe(T + (PB_HOLD_MIN_MS + PB_HOLD_MAX_MS) / 2);
    expect(phantomBrawlerHolding(m, m.holdUntil)).toBe(false);
    m.approachBeatAt = 0; m.holdUntil = 0;
    decidePhantomBrawler(base({ edgeDist: 230, kikoClear: false, rand: seq(0, 0, 0, 0.5) }, { points: 1 }), m);
    expect(m.holdUntil).toBe(0); // 同じ試みでは2回止まらない
  });
  it('気功も毎回は撃たない(近接寄りの人格ほど撃たない・直後は撃ちにくい)', () => {
    const r = rate({ edgeDist: 400 }, () => {}, 'kiko');
    expect(r).toBeGreaterThan(0.1);
    expect(r).toBeLessThan(0.4);
    const recent = rate({ edgeDist: 400 }, m => { m.lastKikoAt = T - 500; }, 'kiko');
    expect(recent).toBeLessThan(r * 0.4);
    expect(pbKikoChance(0, Infinity)).toBeGreaterThan(pbKikoChance(1, Infinity));
  });
});

describe('守り', () => {
  it('弾を返す=構え(ポイント3以上・タイムキーパーLv3で2)・避ける=ステップ', () => {
    const m = createPhantomBrawlerMind();
    expect(decidePhantomBrawler(base({ bullet: { kind: 'counter' }, edgeDist: 300 }, { points: 2 }), m)).toEqual({ kind: 'tech', tech: 'guard' });
    expect(decidePhantomBrawler(base({ bullet: { kind: 'dodge', dirX: 0, dirY: 1 }, edgeDist: 300 }), m)).toEqual({ kind: 'step', dirX: 0, dirY: 1 });
  });
  it('読み: 予測した当たりが反応の下限の後〜構えの尺の内なら、人格の確率で構える(同じ予測で2回振らない)', () => {
    const m = createPhantomBrawlerMind();
    m.strikeTimes = [T - 1000, T - 500, T - 100]; // 次の予測=T+400(反応の下限250より後)
    const i = base({ counterChance: 1 }, { points: 3 });
    expect(decidePhantomBrawler(i, m)).toEqual({ kind: 'tech', tech: 'guard' });
    const m2 = createPhantomBrawlerMind();
    m2.strikeTimes = [T - 1000, T - 500, T - 100];
    expect(decidePhantomBrawler(base({ counterChance: 0 }, { points: 3 }), m2)).toEqual({ kind: 'attack' }); // 外れたら攻める
    // 同じ予測では振らない。§16 で頭脳が台本(連続の続き)を覚えるようになったので、2回目は台本を外した心で確かめる
    // (旧: 同じ心で2回目も 'attack' を期待していた=台本の無い頃の「毎回1段目から押す」前提)。
    m2.script = null;
    expect(decidePhantomBrawler(base({ counterChance: 1 }, { points: 3 }), m2)).toEqual({ kind: 'attack' });
  });
  it('構えた後は3秒構えない', () => {
    const m = createPhantomBrawlerMind(); m.guardReadyAt = T + 1;
    expect(PB_GUARD_COOLDOWN_MS).toBe(3000);
    expect(decidePhantomBrawler(base({ bullet: { kind: 'counter' }, edgeDist: 300 }, { points: 9 }), m)).not.toEqual({ kind: 'tech', tech: 'guard' });
  });
});

describe('秘奥義', () => {
  // §16-3(社長「HP半分以下から、技ポイントが最大まで貯まると、ジャンプ→秘技を狙ってくる」): 旧の「合計のポイントがあり蹴りの届く距離なら狙う」は撤去。
  // 旧のテスト(ポイント8・距離100で →蹴り から出す)は古い仕様を守っていたので、新しい狙い方(台本6)のテストへ置き換えた。
  it('旧の狙い方(ポイントが合計に足りていて蹴りの届く距離)では秘奥義を狙わない', () => {
    const m = createPhantomBrawlerMind();
    decidePhantomBrawler(base({ edgeDist: 100, hpFrac: 1, pointCap: 20 }, { points: 20 }), m);
    expect(m.secretPlan).toBe(false);
    expect(m.leapForSecret).toBe(false);
  });
  it('秘奥義の最中・構えの最中は何もしない', () => {
    const m = createPhantomBrawlerMind();
    expect(decidePhantomBrawler(base({}, { secret: { phase: 'ignite', phaseAt: T, hits: 0, nextAt: T + 1, igniteAt: 0 } }), m)).toBeNull();
    expect(decidePhantomBrawler(base({}, { guardUntil: T + 500 }), m)).toBeNull();
  });
  it('合計(タイムキーパーLv3で8)', () => {
    expect(secretTotalCost(base().discount)).toBe(8);
  });
});
