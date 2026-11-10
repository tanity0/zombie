// research/BRAWLER_PHANTOM.md §4-2: 格闘の幻影(拳鬼)の頭脳(純関数)。
import { describe, expect, it } from 'vitest';
import {
  createPhantomBrawlerMind, decidePhantomBrawler, notePlayerStrike, predictNextStrikeAt, secretTotalCost,
  PB_GUARD_COOLDOWN_MS, type PhantomBrawlerInput,
} from './phantomBrawlerAi';
import { initialBrawlerState, BRAWLER_KICK_RANGE, BRAWLER_KIKO_RANGE, brawlerStartTech } from './brawler';
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
  it('届く距離の外: 220px 以内は飛び蹴り・420px 以内は気功・払えなければ歩く', () => {
    const m = createPhantomBrawlerMind();
    expect(decidePhantomBrawler(base({ edgeDist: BRAWLER_KICK_RANGE }, { points: 1 }), m)).toEqual({ kind: 'tech', tech: 'kick' });
    expect(decidePhantomBrawler(base({ edgeDist: BRAWLER_KIKO_RANGE }, { points: 2 }), m)).toEqual({ kind: 'tech', tech: 'kiko' });
    expect(decidePhantomBrawler(base({ edgeDist: BRAWLER_KICK_RANGE }, { points: 0 }), m)).toBeNull();
    expect(decidePhantomBrawler(base({ edgeDist: BRAWLER_KIKO_RANGE + 1 }, { points: 9 }), m)).toBeNull();
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
    expect(decidePhantomBrawler(base({ counterChance: 1 }, { points: 3 }), m2)).toEqual({ kind: 'attack' }); // 同じ予測では振らない
  });
  it('構えた後は3秒構えない', () => {
    const m = createPhantomBrawlerMind(); m.guardReadyAt = T + 1;
    expect(PB_GUARD_COOLDOWN_MS).toBe(3000);
    expect(decidePhantomBrawler(base({ bullet: { kind: 'counter' }, edgeDist: 300 }, { points: 9 }), m)).not.toEqual({ kind: 'tech', tech: 'guard' });
  });
});

describe('秘奥義', () => {
  it('合計(タイムキーパーLv3で8)以上あり、蹴りの届く距離なら →蹴り から順に出す', () => {
    const disc = base().discount;
    expect(secretTotalCost(disc)).toBe(8);
    const m = createPhantomBrawlerMind();
    expect(decidePhantomBrawler(base({ edgeDist: 100 }, { points: 8 }), m)).toEqual({ kind: 'tech', tech: 'kick' });
    expect(m.secretPlan).toBe(true);
    // 蹴りが当たって(進み1)、技の後隙から取り消せる時は ↓大踏み潰し
    const s1: BrawlerState = { ...brawlerStartTech({ ...initialBrawlerState(), points: 7 }, 'kick', T - 200, 1), resolved: true, connected: true, secretProgress: 1 };
    expect(decidePhantomBrawler(base({ edgeDist: 100 }, s1), m)).toEqual({ kind: 'tech', tech: 'stomp' });
  });
  it('秘奥義の最中・構えの最中は何もしない', () => {
    const m = createPhantomBrawlerMind();
    expect(decidePhantomBrawler(base({}, { secret: { phase: 'ignite', phaseAt: T, hits: 0, nextAt: T + 1, igniteAt: 0 } }), m)).toBeNull();
    expect(decidePhantomBrawler(base({}, { guardUntil: T + 500 }), m)).toBeNull();
  });
});
