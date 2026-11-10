// research/BRAWLER_PHANTOM.md §16-10: 拳鬼の「後ろへ下がる歩き」(レバーガード)の判断。下がる場面/下がらない場面/亀にならない(間隔)。
import { describe, it, expect } from 'vitest';
import {
  KENKI_RETREAT_MIN_MS, KENKI_RETREAT_MAX_MS, KENKI_RETREAT_GAP_MS, KENKI_RETREAT_MELEE_P_MIN, KENKI_RETREAT_MELEE_P_MAX,
  KENKI_RETREAT_BULLET_P, KENKI_RETREAT_BULLET_LEAD_MS,
  createKenkiRetreatMind, kenkiRetreating, kenkiRetreatReady, kenkiRetreatMs, kenkiRetreatMsFor, kenkiRetreatMeleeChance, kenkiRetreatMeleeWindow,
  kenkiRetreatMeleeDecision, kenkiBulletRetreatRoll, kenkiBulletRetreatDue, kenkiRetreatStart, kenkiRetreatStop, kenkiRetreatDirNow, kenkiLeverOf,
} from './kenkiRetreat';
import {
  createPhantomBrawlerMind, decidePhantomBrawler, notePlayerStrike, type PhantomBrawlerInput,
} from './phantomBrawlerAi';
import { initialBrawlerState, brawlerStartAttack } from './brawler';
import { brawlerTimeKeeperDiscount } from './brawlerSkills';
import { HUMAN_REACTION_MS } from './bossSkeleton';
import type { BrawlerState } from './brawlerTypes';

const T = 1_000_000;
const seq = (...v: number[]) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };

describe('定数(設計書 §16-10 の叩き台)', () => {
  it('1回の下がりは300〜500ms・間隔は1.5秒以上', () => {
    expect(KENKI_RETREAT_MIN_MS).toBeGreaterThanOrEqual(300);
    expect(KENKI_RETREAT_MAX_MS).toBeLessThanOrEqual(500);
    expect(KENKI_RETREAT_GAP_MS).toBeGreaterThanOrEqual(1500);
    expect(kenkiRetreatMs(0)).toBe(KENKI_RETREAT_MIN_MS);
    expect(kenkiRetreatMs(1)).toBe(KENKI_RETREAT_MAX_MS);
  });
  it('常には使わない(確率は1未満)・人格で変わる', () => {
    expect(kenkiRetreatMeleeChance(0)).toBe(KENKI_RETREAT_MELEE_P_MIN);
    expect(kenkiRetreatMeleeChance(1)).toBe(KENKI_RETREAT_MELEE_P_MAX);
    expect(KENKI_RETREAT_MELEE_P_MAX).toBeLessThan(1);
    expect(KENKI_RETREAT_BULLET_P).toBeLessThan(1);
    expect(kenkiBulletRetreatRoll(KENKI_RETREAT_BULLET_P - 0.01)).toBe(true);
    expect(kenkiBulletRetreatRoll(KENKI_RETREAT_BULLET_P)).toBe(false);
  });
});

describe('近接の読みで下がる(純関数)', () => {
  const inp = (o: Partial<Parameters<typeof kenkiRetreatMeleeDecision>[1]> = {}) => ({
    t: T, idle: true, inRange: true, predictedAt: T + 300, counterChance: 0.5, rand: () => 0, ...o,
  });
  it('下がる場面: 待機・間合いの内・予測の当たりが反応の下限の後〜下がりの内 → 下がる(長さは当たりの後まで届く)', () => {
    const m = createKenkiRetreatMind();
    const ms = kenkiRetreatMeleeDecision(m, inp({ predictedAt: T + 420 }));
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThanOrEqual(420); // 当たりの時刻まで下がり続ける
    expect(ms!).toBeLessThanOrEqual(KENKI_RETREAT_MAX_MS);
  });
  it('人の反応の下限を通す: 当たりまで反応の下限より短い時は下がらない', () => {
    const m = createKenkiRetreatMind();
    expect(kenkiRetreatMeleeDecision(m, inp({ predictedAt: T + HUMAN_REACTION_MS - 1 }))).toBeNull();
    expect(kenkiRetreatMeleeWindow(HUMAN_REACTION_MS - 1)).toBe(false);
    expect(kenkiRetreatMeleeWindow(HUMAN_REACTION_MS)).toBe(true);
  });
  it('下がらない場面: 動作の最中・間合いの外・予測なし・当たりが遠い(下がりの尺より先)・確率を外した', () => {
    expect(kenkiRetreatMeleeDecision(createKenkiRetreatMind(), inp({ idle: false }))).toBeNull();
    expect(kenkiRetreatMeleeDecision(createKenkiRetreatMind(), inp({ inRange: false }))).toBeNull();
    expect(kenkiRetreatMeleeDecision(createKenkiRetreatMind(), inp({ predictedAt: null }))).toBeNull();
    expect(kenkiRetreatMeleeDecision(createKenkiRetreatMind(), inp({ predictedAt: T + KENKI_RETREAT_MAX_MS + 1 }))).toBeNull();
    expect(kenkiRetreatMeleeDecision(createKenkiRetreatMind(), inp({ rand: () => 0.999 }))).toBeNull();
  });
  it('同じ予測では2回振らない(外したら、その当たりにはもう下がらない)', () => {
    const m = createKenkiRetreatMind();
    expect(kenkiRetreatMeleeDecision(m, inp({ rand: () => 0.999 }))).toBeNull();
    expect(kenkiRetreatMeleeDecision(m, inp({ t: T + 16, rand: () => 0 }))).toBeNull();
    expect(kenkiRetreatMeleeDecision(m, inp({ t: T + 16, predictedAt: T + 400, rand: () => 0 }))).not.toBeNull(); // 次の予測は振る
  });
  it('亀にならない: 下がっている間・下がり終わってから間隔が明けるまでは下がらない', () => {
    const m = createKenkiRetreatMind();
    kenkiRetreatStart(m, T, 400, null);
    expect(kenkiRetreating(m, T + 399)).toBe(true);
    expect(kenkiRetreating(m, T + 400)).toBe(false);
    expect(kenkiRetreatReady(m, T + 200)).toBe(false);                             // 下がっている最中
    expect(kenkiRetreatReady(m, T + 400 + KENKI_RETREAT_GAP_MS - 1)).toBe(false);  // 間隔の中
    expect(kenkiRetreatReady(m, T + 400 + KENKI_RETREAT_GAP_MS)).toBe(true);
    expect(kenkiRetreatMeleeDecision(m, inp({ t: T + 900, predictedAt: T + 1200 }))).toBeNull();
    expect(kenkiRetreatMeleeDecision(m, inp({ t: T + 400 + KENKI_RETREAT_GAP_MS, predictedAt: T + 400 + KENKI_RETREAT_GAP_MS + 300 }))).not.toBeNull();
  });
  it('下がっている時間の割合は、ずっと殴られ続けても 500/(500+1500)=25% 以下', () => {
    const m = createKenkiRetreatMind();
    let retreatMs = 0;
    const total = 60_000;
    for (let t = T; t < T + total; t += 16) {
      // 毎 tick「300ms 後に当たる」と読めて、確率も必ず通る最悪の場合
      const ms = kenkiRetreatMeleeDecision(m, { t, idle: true, inRange: true, predictedAt: t + 300, counterChance: 1, rand: () => 0 });
      if (ms !== null) kenkiRetreatStart(m, t, ms, null);
      if (kenkiRetreating(m, t)) retreatMs += 16;
    }
    expect(retreatMs / total).toBeLessThanOrEqual(KENKI_RETREAT_MAX_MS / (KENKI_RETREAT_MAX_MS + KENKI_RETREAT_GAP_MS) + 0.01);
    expect(retreatMs).toBeGreaterThan(0);
  });
  it('長さ: 当たりに届かなければ当たりの少し後まで延ばす(上限は最大の尺)', () => {
    expect(kenkiRetreatMsFor(250, 0)).toBe(350);
    expect(kenkiRetreatMsFor(480, 0)).toBe(KENKI_RETREAT_MAX_MS);
    expect(kenkiRetreatMsFor(250, 1)).toBe(KENKI_RETREAT_MAX_MS);
  });
  it('打ち切り(殴られて押された・固まった): 下がりは止まるが、次に下がってよい時刻は残る', () => {
    const m = createKenkiRetreatMind();
    kenkiRetreatStart(m, T, 400, { x: 0, y: 2 });
    expect(m.retreatDir).toEqual({ x: 0, y: 1 });
    kenkiRetreatStop(m);
    expect(kenkiRetreating(m, T + 10)).toBe(false);
    expect(kenkiRetreatReady(m, T + 10)).toBe(false);
  });
});

describe('弾: 下がってガード(3つ目の手)', () => {
  it('着弾が近づいたら下がり始める・遠い弾/当たらない弾では下がらない', () => {
    expect(kenkiBulletRetreatDue(KENKI_RETREAT_BULLET_LEAD_MS)).toBe(true);
    expect(kenkiBulletRetreatDue(KENKI_RETREAT_BULLET_LEAD_MS + 1)).toBe(false);
    expect(kenkiBulletRetreatDue(null)).toBe(false);
  });
});

describe('下がる向きと拳鬼のレバー', () => {
  it('向きが決まっていなければプレイヤーから離れる向き・弾の時は弾の飛んできた向き・重なっていれば右', () => {
    const m = createKenkiRetreatMind();
    expect(kenkiRetreatDirNow(m, 100, 100, 200, 100)).toEqual({ x: -1, y: 0 });
    expect(kenkiRetreatDirNow(m, 100, 100, 100, 100)).toEqual({ x: 1, y: 0 });
    kenkiRetreatStart(m, T, 300, { x: 0, y: -3 });
    expect(kenkiRetreatDirNow(m, 100, 100, 200, 100)).toEqual({ x: 0, y: -1 });
  });
  it('レバー=歩こうとしている向き(長さ1)。動作の最中・歩いていない時は無い', () => {
    expect(kenkiLeverOf(-2, 0, false)).toEqual({ x: -1, y: 0 });
    expect(kenkiLeverOf(-1, 0, true)).toBeNull();
    expect(kenkiLeverOf(0, 0, false)).toBeNull();
    expect(kenkiLeverOf(0.05, 0.05, false)).toBeNull();
  });
});

describe('頭脳(decidePhantomBrawler)に入った下がり', () => {
  const base = (o: Partial<PhantomBrawlerInput> = {}, s: Partial<BrawlerState> = {}): PhantomBrawlerInput => ({
    s: { ...initialBrawlerState(), ...s }, t: T, edgeDist: 40, reach: 74, reachReady: true, playerReach: 74, kikoClear: true,
    discount: k => brawlerTimeKeeperDiscount(k, 3), counterChance: 0.5, meleeBias: 0.95, bullet: null, rand: () => 0.999, ...o,
  });
  /** 当たりのリズム(500ms 間隔)を覚えさせる。次の当たりは last+500。 */
  const rhythm = (m: ReturnType<typeof createPhantomBrawlerMind>, last: number) => { for (const t of [last - 1000, last - 500, last]) notePlayerStrike(m, t); };

  it('①近接の読み: 構えを出せない(ポイント不足)時に、当たりが近づくと人格の確率で下がる → 下がっている間は攻めない', () => {
    const m = createPhantomBrawlerMind();
    rhythm(m, T - 150); // 次の当たりは T+350
    const a = decidePhantomBrawler(base({ rand: seq(0, 0.5) }, { points: 0 }), m);
    expect(a).toEqual({ kind: 'retreat' });
    expect(m.retreatDir).toBeNull(); // プレイヤーから離れる向き(制御が毎 tick 引く)
    expect(kenkiRetreating(m, T + 100)).toBe(true);
    // 下がっている間は、届く距離の内でも段を押さない
    expect(decidePhantomBrawler(base({ t: T + 100, rand: () => 0 }, { points: 0 }), m)).toBeNull();
    // 下がり終わったら攻めに戻る(間隔の間はもう下がらない)
    const after = m.retreatUntil + 1;
    m.nextStringAt = 0;
    expect(decidePhantomBrawler(base({ t: after, rand: () => 0 }, { points: 0 }), m)).toEqual({ kind: 'attack' });
  });
  it('①構えを出した時は下がらない(構えが先)・構えの確率を外した時だけ下がりを引く', () => {
    const m = createPhantomBrawlerMind();
    rhythm(m, T - 150);
    // 構えを払える・確率を通す → 構え
    expect(decidePhantomBrawler(base({ counterChance: 1, rand: () => 0 }, { points: 9 }), m)).toEqual({ kind: 'tech', tech: 'guard' });
    expect(kenkiRetreating(m, T + 1)).toBe(false);
    // 構えの確率を外す(1つ目の乱数)→ 下がりの確率を通す(2つ目)
    const m2 = createPhantomBrawlerMind();
    rhythm(m2, T - 150);
    expect(decidePhantomBrawler(base({ counterChance: 0.5, rand: seq(0.9, 0, 0.5) }, { points: 9 }), m2)).toEqual({ kind: 'retreat' });
  });
  it('下がらない場面: 動作の最中・当たりの予測が無い・当たりが反応の下限より近い・確率を外した', () => {
    const busy = brawlerStartAttack(initialBrawlerState(), 1, T, false);
    const m1 = createPhantomBrawlerMind(); rhythm(m1, T - 150);
    expect(decidePhantomBrawler(base({ rand: () => 0 }, { ...busy, points: 0 }), m1)?.kind).not.toBe('retreat');
    const m2 = createPhantomBrawlerMind();
    expect(decidePhantomBrawler(base({ rand: () => 0 }, { points: 0 }), m2)?.kind).not.toBe('retreat');
    const m3 = createPhantomBrawlerMind(); rhythm(m3, T - 500 + HUMAN_REACTION_MS - 10); // 次の当たりは反応の下限より近い
    expect(decidePhantomBrawler(base({ rand: () => 0 }, { points: 0 }), m3)?.kind).not.toBe('retreat');
    const m4 = createPhantomBrawlerMind(); rhythm(m4, T - 150);
    expect(decidePhantomBrawler(base({ rand: () => 0.999, reachReady: false }, { points: 0 }), m4)).toBeNull();
  });
  it('亀にならない: 1回下がったら、間隔(1.5秒)が明けるまで次の当たりを読めても下がらない', () => {
    const m = createPhantomBrawlerMind();
    rhythm(m, T - 150);
    expect(decidePhantomBrawler(base({ rand: seq(0, 0.5) }, { points: 0 }), m)).toEqual({ kind: 'retreat' });
    const end = m.retreatUntil;
    let again = 0;
    for (let t = end; t < end + KENKI_RETREAT_GAP_MS; t += 16) {
      notePlayerStrike(m, t - 200); // 殴られ続けて、いつも「もうすぐ当たる」と読める
      if (decidePhantomBrawler(base({ t, rand: () => 0, reachReady: false }, { points: 0 }), m)?.kind === 'retreat') again++;
    }
    expect(again).toBe(0);
  });
  it('②弾: 下がってガードの手が来たら、弾の飛んできた向きへ下がる(待機・間隔が明けている時だけ)', () => {
    const m = createPhantomBrawlerMind();
    expect(decidePhantomBrawler(base({ edgeDist: 300, bullet: { kind: 'retreat', dirX: 0, dirY: 1 }, rand: () => 0.5 }), m)).toEqual({ kind: 'retreat' });
    expect(m.retreatDir).toEqual({ x: 0, y: 1 });
    expect(m.retreatUntil - T).toBeGreaterThanOrEqual(KENKI_RETREAT_MIN_MS);
    expect(m.retreatUntil - T).toBeLessThanOrEqual(KENKI_RETREAT_MAX_MS);
    // 間隔の中の次の弾では下がらない
    const t2 = m.retreatUntil + 100;
    expect(decidePhantomBrawler(base({ t: t2, edgeDist: 300, bullet: { kind: 'retreat', dirX: 0, dirY: 1 }, rand: () => 0.999 }), m)?.kind).not.toBe('retreat');
    // 動作の最中は下がらない
    const busy = brawlerStartAttack(initialBrawlerState(), 1, T, false);
    expect(decidePhantomBrawler(base({ bullet: { kind: 'retreat', dirX: 0, dirY: 1 } }, busy), createPhantomBrawlerMind())?.kind).not.toBe('retreat');
  });
  it('下がりは台本を打ち切る(構え・ステップと同じ扱い)', () => {
    const m = createPhantomBrawlerMind();
    m.script = { id: 1, idx: 1 };
    decidePhantomBrawler(base({ edgeDist: 300, bullet: { kind: 'retreat', dirX: 1, dirY: 0 } }), m);
    expect(m.script).toBeNull();
  });
});
